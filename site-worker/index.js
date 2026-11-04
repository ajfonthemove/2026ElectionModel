/** Public observed-results API. No model, polling or research services are exposed. */
const STATE_ROWS = `AL|01|Alabama
AK|02|Alaska
AZ|04|Arizona
AR|05|Arkansas
CA|06|California
CO|08|Colorado
CT|09|Connecticut
DE|10|Delaware
FL|12|Florida
GA|13|Georgia
HI|15|Hawaii
ID|16|Idaho
IL|17|Illinois
IN|18|Indiana
IA|19|Iowa
KS|20|Kansas
KY|21|Kentucky
LA|22|Louisiana
ME|23|Maine
MD|24|Maryland
MA|25|Massachusetts
MI|26|Michigan
MN|27|Minnesota
MS|28|Mississippi
MO|29|Missouri
MT|30|Montana
NE|31|Nebraska
NV|32|Nevada
NH|33|New Hampshire
NJ|34|New Jersey
NM|35|New Mexico
NY|36|New York
NC|37|North Carolina
ND|38|North Dakota
OH|39|Ohio
OK|40|Oklahoma
OR|41|Oregon
PA|42|Pennsylvania
RI|44|Rhode Island
SC|45|South Carolina
SD|46|South Dakota
TN|47|Tennessee
TX|48|Texas
UT|49|Utah
VT|50|Vermont
VA|51|Virginia
WA|53|Washington
WV|54|West Virginia
WI|55|Wisconsin
WY|56|Wyoming`;
export const STATES = Object.fromEntries(STATE_ROWS.split('\n').map((line) => {
  const [state, fips, name] = line.split('|'); return [state, { state, fips, name }];
}));
export const NATIONAL_URLS = Object.freeze(Object.fromEntries(['SG', 'GG', 'HG'].map((code) => [code, `https://politics.api.cnn.io/results/national-races/2026-${code}.json`])));
const OFFICE = { SG: 'senate', SP: 'senate', GG: 'governor', HG: 'house' };
const OFFICES = ['senate', 'house', 'governor'];
const MAX_BYTES = 8 * 1024 * 1024;
const MIN_REFRESH_MS = 30_000;
const CACHE_SECONDS = 7 * 24 * 60 * 60;
const MAX_MEMORY_ITEMS = 65;
const POLL_CLOSE_MIN = Date.parse('2026-11-03T12:00:00Z');
const POLL_CLOSE_MAX = Date.parse('2026-11-04T12:00:00Z');
const clone = (value) => JSON.parse(JSON.stringify(value));
const count = (value) => Number.isSafeInteger(value) && value >= 0;
const party = (value) => ({ D: 'DEM', DEM: 'DEM', DEMOCRAT: 'DEM', DEMOCRATIC: 'DEM', R: 'REP', REP: 'REP', GOP: 'REP', REPUBLICAN: 'REP' })[String(value || '').toUpperCase()] || String(value || 'UNKNOWN').toUpperCase();
const awareTime = (value) => typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)) ? value : null;
const errorText = (error) => String(error?.message || error || 'Source unavailable').slice(0, 400);
class InputError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }

export function raceParts(raceId) {
  const match = typeof raceId === 'string' && /^2026-(SG|SP|GG|HG)-([A-Z]{2})(?:-([1-9][0-9]?))?$/.exec(raceId);
  if (!match || !STATES[match[2]] || (match[1] === 'HG') !== Boolean(match[3]) || Number(match[3] || 0) > 53 || (match[1] === 'SP' && !['FL', 'OH'].includes(match[2]))) throw new InputError('Unsupported current-election race ID.');
  return { code: match[1], state: match[2], district: match[3] ? String(Number(match[3])) : null };
}

export function validateRows(rows, office, countyRaceId = null) {
  if (!NATIONAL_URLS[office] || !Array.isArray(rows) || !rows.length || rows.length > 2000) throw new Error('Invalid bounded results inventory.');
  if (countyRaceId) raceParts(countyRaceId);
  const output = [], seen = new Set();
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Invalid result row.');
    if (!countyRaceId && office === 'HG' && row.ecKey === '2026-HQ-TX-18') continue;
    const parts = raceParts(row.ecKey);
    if (!(office === 'SG' ? ['SG', 'SP'] : [office]).includes(parts.code) || row.stateAbbreviation !== parts.state || row.contestType !== parts.code || row.electionType !== (parts.code === 'SP' ? 'P' : 'G') || row.raceType !== parts.code[0] || row.raceTypeCode !== parts.code[0] || row.stateFipsCode !== STATES[parts.state].fips || row.resourceType !== (countyRaceId ? 'county-races' : 'race')) throw new Error('Source race identity or office metadata disagrees.');
    if (parts.code === 'HG' && row.jurisdictionCode !== Number(parts.district)) throw new Error('Source House district identity disagrees.');
    if (!countyRaceId && parts.code !== 'HG' && row.jurisdictionCode !== 0) throw new Error('Source statewide jurisdiction disagrees.');
    if (!countyRaceId && !(Number.isFinite(row.raceEmbargo?.assignedPollsClose) && row.raceEmbargo.assignedPollsClose >= POLL_CLOSE_MIN && row.raceEmbargo.assignedPollsClose < POLL_CLOSE_MAX)) throw new Error('Source is outside the November election window.');
    if (countyRaceId && (row.ecKey !== countyRaceId || typeof row.countyFipsCode !== 'string' || !/^\d{5}$/.test(row.countyFipsCode) || !row.countyFipsCode.startsWith(STATES[parts.state].fips))) throw new Error('County geography does not match the selected race.');
    const identity = countyRaceId ? row.countyFipsCode : row.ecKey;
    if (seen.has(identity)) throw new Error('Duplicate race/geography in cumulative source.');
    seen.add(identity);
    if (!count(row.totalVote) || !Array.isArray(row.candidates) || !row.candidates.length || row.candidates.length > 100 || row.candidates.some((c) => !c || !count(c.voteNum))) throw new Error('Invalid all-candidate vote counts.');
    const ids = row.candidates.map((c, index) => String(c.candidateId ?? index));
    if (new Set(ids).size !== ids.length) throw new Error('Duplicate candidate identity.');
    const sum = row.candidates.reduce((total, c) => total + c.voteNum, 0);
    if (!count(sum) || sum > row.totalVote) throw new Error('Candidate counts exceed the published source total.');
    output.push(row);
  }
  if (!output.length) throw new Error('No verified current election rows.');
  return output;
}

function candidates(raw, total, released) {
  const rows = raw.map((c, index) => ({ candidate_id: String(c.candidateId ?? index), name: c.fullName || c.candidate || 'Unnamed candidate', party: party(c.majorParty), party_label: c.partyName || c.party || null, votes: released ? c.voteNum : null, vote_share: released && total > 0 ? c.voteNum / total : null }));
  return { candidates: rows, reported_total: released ? total : null, status: !released ? 'votes_not_released' : total > 0 ? 'reporting' : 'awaiting_returns', candidate_attributed_total: released ? rows.reduce((sum, c) => sum + c.votes, 0) : null, unattributed_source_votes: released ? total - rows.reduce((sum, c) => sum + c.votes, 0) : null, accounting_status: !released ? 'counts_unavailable' : total > rows.reduce((sum, c) => sum + c.votes, 0) ? 'unattributed_source_votes' : 'exact' };
}

function normalizedRace(row, source) {
  const parts = raceParts(row.ecKey), embargo = row.raceEmbargo || {}, released = embargo.votesReleased === true;
  const winners = row.candidates.filter((c) => c.winner === true);
  const called = row.editorialStatus === 'called' && embargo.callsReleased === true && winners.length === 1 ? { candidate_id: String(winners[0].candidateId), name: winners[0].fullName, party: party(winners[0].majorParty), source: 'CNN', source_url: source.source_url } : null;
  return { race_id: row.ecKey, state: parts.state, office: OFFICE[parts.code], district: parts.district, seat: null, stage: 'general', special: parts.code === 'SP', cycle: 2026, label: `${parts.state} ${OFFICE[parts.code][0].toUpperCase()}${OFFICE[parts.code].slice(1)}${parts.district ? ' ' + parts.district : ''}${parts.code === 'SP' ? ' Special' : ''}`, ...candidates(row.candidates, row.totalVote, released), source_name: 'CNN', source_url: source.source_url, checked_at: source.retrieved_at, source_updated_at: awareTime(row.voteTimestamp), source_extracted_at_raw: row.extractedAt ?? null, poll_close_at: new Date(embargo.assignedPollsClose).toISOString(), poll_status: embargo.pollsClosed === true ? 'closed' : embargo.pollsClosed === false ? 'open' : 'unknown', polls_closed: typeof embargo.pollsClosed === 'boolean' ? embargo.pollsClosed : null, votes_released: released, source_percent_reporting: Number.isFinite(row.percentReporting) && row.percentReporting >= 0 && row.percentReporting <= 100 ? row.percentReporting : null, percent_reporting_definition: 'Source reporting-unit percentage; not the percentage of votes counted.', source_called_winner: called, historical_comparison: null, preforecast_comparison: null, our_model_race_call: null, win_probability: null };
}

function countyView(snapshot, parent) {
  const source = snapshot?.source, stale = Boolean(snapshot?.error || snapshot?.stale);
  const rows = (snapshot?.rows || []).map((row) => ({ county_fips: row.countyFipsCode, name: row.countyLongName || row.countyName || row.countyFipsCode, race_id: parent.race_id, state: parent.state, district: parent.district, ...candidates(row.candidates, row.totalVote, parent.votes_released === true), source_updated_at: awareTime(row.voteTimestamp), source_url: source.source_url, checked_at: source.retrieved_at, source_name: 'CNN', source_status: stale ? 'stale' : 'cached', source_stale: stale, historical_comparison: null, our_model_race_call: null, win_probability: null })).sort((a, b) => a.county_fips.localeCompare(b.county_fips));
  const total = rows.length && rows.every((r) => r.reported_total !== null) ? rows.reduce((sum, r) => sum + r.reported_total, 0) : null;
  const times = rows.map((r) => r.source_updated_at).filter(Boolean).sort((a, b) => Date.parse(a) - Date.parse(b));
  return { rows, coverage: { status: rows.length ? stale ? 'stale' : 'available' : 'unavailable', source_status: rows.length ? stale ? 'stale' : 'cached' : 'unavailable', error: snapshot?.error || null, stale, checked_at: source?.retrieved_at || null, snapshot_id: source?.sha256 || null, refresh_checked_at: snapshot?.last_attempt_at || null, last_refresh_attempt_at: snapshot?.last_attempt_at || null, source_url: source?.source_url || null, reported_total: total, matches_national_snapshot: total !== null && parent.reported_total !== null ? total === parent.reported_total : null, source_update_range: { oldest: times[0] || null, newest: times.at(-1) || null, unknown_count: rows.filter((r) => !r.source_updated_at).length }, note: 'County and national feeds are independently timed snapshots; county totals are never added to the national total.' } };
}

export function buildView(snapshot, query = {}, county = null, now = Date.now()) {
  const all = Object.values(snapshot.offices || {}).flatMap((source) => source.rows.map((row) => normalizedRace(row, source)));
  const selected = all.filter((r) => ['office', 'state', 'race_id'].every((key) => !query[key] || r[key] === query[key]));
  const parent = query.race_id ? all.find((r) => r.race_id === query.race_id) : null;
  const counties = query.detail === 'county' && parent ? countyView(county, parent) : { rows: [], coverage: { status: 'not_requested' } };
  const sources = Object.values(snapshot.offices || {}).map(({ rows, ...metadata }) => metadata);
  const error = snapshot.error || null;
  return { schema_version: 'results_map_v1', as_of: new Date(now).toISOString(), source: { status: snapshot.verified ? error ? 'stale' : 'cached' : 'unavailable', checked_at: snapshot.checked_at || null, last_successful_check_at: snapshot.checked_at || null, snapshot_id: sources.map((s) => s.sha256).join('-') || null, refresh_checked_at: snapshot.last_attempt_at || null, last_refresh_attempt_at: snapshot.last_attempt_at || null, providers: [...new Set(selected.map((r) => r.source_name))], snapshots: sources, error, stale: Boolean(error || snapshot.stale) }, offices: OFFICES, states: Object.values(STATES).map((state) => { const races = selected.filter((r) => r.state === state.state).sort((a, b) => a.office.localeCompare(b.office) || Number(a.district || 0) - Number(b.district || 0) || a.race_id.localeCompare(b.race_id)); return { ...state, status: races.some((r) => (r.reported_total || 0) > 0) ? 'reporting' : races.length ? 'awaiting_returns' : 'no_data', races }; }), counties: counties.rows, county_coverage: counties.coverage, coverage: { states_with_races: [...new Set(selected.map((r) => r.state))].sort(), loaded_contests: selected.length, reporting_contests: selected.filter((r) => (r.reported_total || 0) > 0).length, source_contests_before_filter: all.length, suppressed_overlapping_state_contests: [], source_offices: Object.fromEntries(OFFICES.map((office) => [office, all.filter((r) => r.office === office).length])) }, warnings: [error ? 'Public source refresh delayed; the last verified results are retained.' : null, county?.error ? 'County refresh delayed; any saved county snapshot is retained.' : null].filter(Boolean), our_model_race_call: null, win_probability: null, note: 'Reported source counts and source-attributed calls only. Missing data is not zero; reporting percentages are not votes counted.' };
}

export function parseQuery(url) {
  const query = Object.create(null);
  for (const [key, value] of url.searchParams) {
    if (!['office', 'state', 'race_id', 'detail'].includes(key) || key in query || !value) throw new InputError('Unknown, empty or repeated results query.');
    query[key] = value;
  }
  if (query.office && !OFFICES.includes(query.office)) throw new InputError('Unknown office.');
  if (query.state && !STATES[query.state]) throw new InputError('Unknown state.');
  if (query.detail && (query.detail !== 'county' || !query.race_id)) throw new InputError('County detail requires a race ID.');
  if (query.race_id) { const parts = raceParts(query.race_id); if (query.state && query.state !== parts.state || query.office && query.office !== OFFICE[parts.code]) throw new InputError('Race and selected office/state disagree.'); }
  return query;
}

async function boundedText(response, maxBytes) {
  if (Number(response.headers.get('content-length') || 0) > maxBytes) throw new Error('Response exceeds its byte bound.');
  if (!response.body) throw new Error('Empty response.');
  const reader = response.body.getReader();let size = 0;const chunks = [];
  try { for (;;) { const { value, done } = await reader.read();if (done) break;size += value.byteLength;if (size > maxBytes) throw new Error('Response exceeds its byte bound.');chunks.push(value); } }
  finally { reader.releaseLock(); }
  const body = new Uint8Array(size);let offset = 0;for (const chunk of chunks) { body.set(chunk, offset);offset += chunk.byteLength; }
  return new TextDecoder('utf-8', { fatal: true }).decode(body);
}

const jsonResponse = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' } });

export function createResultsWorker({ fetcher = globalThis.fetch, cache = globalThis.caches?.default, now = () => Date.now() } = {}) {
  const memory = new Map(), running = new Map();
  const storageKey = (key) => new Request(`https://election-results-cache.invalid/v1/${encodeURIComponent(key)}`);
  async function read(key) {
    if (memory.has(key)) { const value = memory.get(key);memory.delete(key);memory.set(key, value);return clone(value); }
    if (cache) try { const response = await cache.match(storageKey(key));if (response) { const value = JSON.parse(await boundedText(response, 32 * 1024 * 1024));if (value.version === 1 && value.key === key) return value; } } catch {}
    return null;
  }
  async function save(key, value) {
    const data = { ...value, version: 1, key };memory.delete(key);memory.set(key, clone(data));
    while (memory.size > MAX_MEMORY_ITEMS) memory.delete(memory.keys().next().value);
    if (cache) try { await cache.put(storageKey(key), new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${CACHE_SECONDS}` } })); } catch {}
    return data;
  }
  async function source(url, office, countyRaceId = null) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetcher(url, { redirect: 'error', signal: controller.signal, headers: { Accept: 'application/json', 'User-Agent': 'ElectionResultsDashboard/1.0 (public aggregate results)' } });
      if (!response.ok || response.redirected) throw new Error(`Public results source returned HTTP ${response.status}.`);
      const text = await boundedText(response, MAX_BYTES), rows = validateRows(JSON.parse(text), office, countyRaceId);
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return { source_url: url, office, county_race_id: countyRaceId, retrieved_at: new Date(now()).toISOString(), sha256: [...new Uint8Array(digest)].map((n) => n.toString(16).padStart(2, '0')).join(''), row_count: rows.length, rows, etag: response.headers.get('etag'), source_last_modified: response.headers.get('last-modified') };
    } finally { clearTimeout(timer); }
  }
  async function national() {
    const key = 'national', old = await read(key);
    if (old && now() - Date.parse(old.last_attempt_at) >= 0 && now() - Date.parse(old.last_attempt_at) < MIN_REFRESH_MS) return old;
    if (running.has(key)) return running.get(key);
    const operation = (async () => {
      const attempted = new Date(now()).toISOString(), offices = { ...(old?.offices || {}) }, errors = [];
      await Promise.all(Object.entries(NATIONAL_URLS).map(async ([office, url]) => {
        try { offices[office] = await source(url, office); }
        catch (error) { errors.push(`${office}: ${errorText(error)}`);if (offices[office]) offices[office] = { ...offices[office], stale: true, refresh_error: errorText(error), refresh_checked_at: attempted }; }
      }));
      const available = Object.values(offices);
      return save(key, { offices, verified: available.length > 0, checked_at: errors.length ? old?.checked_at || available.map((s) => s.retrieved_at).sort()[0] || null : attempted, last_attempt_at: attempted, error: errors.join('; ') || null, stale: errors.length > 0 });
    })();running.set(key, operation);
    try { return await operation; } finally { running.delete(key); }
  }
  async function counties(raceId, parentSnapshot) {
    const parts = raceParts(raceId), parent = Object.values(parentSnapshot.offices || {}).flatMap((s) => s.rows).find((r) => r.ecKey === raceId);
    if (!parent) throw new InputError('The selected race is absent from the verified source inventory.', 404);
    const key = `county-${raceId}`, old = await read(key);
    if (old && now() - Date.parse(old.last_attempt_at) >= 0 && now() - Date.parse(old.last_attempt_at) < MIN_REFRESH_MS) return old;
    if (running.has(key)) return running.get(key);
    const operation = (async () => {
      const attempted = new Date(now()).toISOString();
      try { const captured = await source(`https://politics.api.cnn.io/results/county-races/${raceId}.json`, parts.code === 'SP' ? 'SG' : parts.code, raceId);return save(key, { source: captured, rows: captured.rows, last_attempt_at: attempted, error: null, stale: false }); }
      catch (error) { return save(key, { ...(old || { rows: [], source: null }), last_attempt_at: attempted, error: errorText(error), stale: Boolean(old?.rows?.length) }); }
    })();running.set(key, operation);
    try { return await operation; } finally { running.delete(key); }
  }
  return { async fetch(request, env = {}, context = {}) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/api/results-map') {
        if (request.method !== 'GET') return jsonResponse({ error: 'Method not allowed.' }, 405);
        const query = parseQuery(url), snapshot = await national();let county = null;
        if (query.race_id && !Object.values(snapshot.offices || {}).some((s) => s.rows.some((r) => r.ecKey === query.race_id))) throw new InputError('Race not found in the verified source inventory.', 404);
        if (query.detail === 'county') county = await counties(query.race_id, snapshot);
        return jsonResponse(buildView(snapshot, query, county, now()));
      }
      if (url.pathname === '/api/results-map/refresh') {
        if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);
        if (url.search || !/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || '')) throw new InputError('Refresh requires a JSON body without query parameters.');
        let body;try { body = JSON.parse(await boundedText(request, 1024)); } catch { throw new InputError('Invalid or oversized refresh JSON.'); }
        if (!body || Array.isArray(body) || typeof body !== 'object' || Object.keys(body).some((k) => k !== 'county_race_id')) throw new InputError('Unknown refresh field.');
        if ('county_race_id' in body) raceParts(body.county_race_id);
        const snapshot = await national();const county = body.county_race_id ? await counties(body.county_race_id, snapshot) : null;
        return jsonResponse(buildView(snapshot, body.county_race_id ? { race_id: body.county_race_id, detail: 'county' } : {}, county, now()));
      }
      if (url.pathname.startsWith('/api/')) return jsonResponse({ error: 'Not found.' }, 404);
      if (!['GET', 'HEAD'].includes(request.method)) return jsonResponse({ error: 'Method not allowed.' }, 405);
      return env.ASSETS?.fetch ? env.ASSETS.fetch(request) : new Response('Static assets are not configured.', { status: 404 });
    } catch (error) { return jsonResponse({ error: error instanceof InputError ? error.message : 'Results are temporarily unavailable.' }, error instanceof InputError ? error.status : 503); }
  } };
}

const worker = createResultsWorker();
export default { fetch: (request, env, context) => worker.fetch(request, env, context) };
