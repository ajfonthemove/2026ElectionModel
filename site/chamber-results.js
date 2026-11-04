/** Complete office totals: seats not up for election plus explicit public CNN calls. */
const STATE_CODES = new Set('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' '));
const CONFIG = Object.freeze({ senate: { total: 100, held: 65, up: 35, code: 'SG' }, house: { total: 435, held: 0, up: 435, code: 'HG' }, governor: { total: 50, held: 14, up: 36, code: 'GG' } });
const MAX_BYTES = 512 * 1024;
const loads = new WeakMap(), parsed = new WeakSet();
const nonempty = value => typeof value === 'string' && value.trim().length > 0 && value.length < 2000;
const sourceURL = value => typeof value === 'string' && /^https?:\/\//.test(value) && (() => { try { return Boolean(new URL(value).hostname); } catch { return false; } })();
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function partyCode(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9 ._-]{0,50}$/.test(text) || ['UNKNOWN', 'UNSPECIFIED', 'NULL', 'NONE'].includes(text)) return null;
  return ({ D: 'DEM', DEM: 'DEM', DEMOCRAT: 'DEM', DEMOCRATIC: 'DEM', R: 'REP', REP: 'REP', GOP: 'REP', REPUBLICAN: 'REP', I: 'IND', IND: 'IND', INDEPENDENT: 'IND' })[text] || text;
}
const partyGroup = code => ['DEM', 'REP', 'IND'].includes(code) ? code : 'OTHER';
const displayName = value => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.*(?:Z|[+-]\d{2}:\d{2}))?$/.test(value) || !Number.isFinite(Date.parse(value))) return false;
  const [year, month, day] = value.slice(0, 10).split('-').map(Number), date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function normalizeSources(raw) {
  const values = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? Object.entries(raw).map(([id, source]) => ({ id, ...source })) : [];
  if (!values.length || values.length > 30) throw new Error('Chamber reference source evidence is missing.');
  const sources = new Map();
  for (const row of values) {
    const id = row?.id || row?.source_id, url = row?.source_url || row?.url, sha256 = row?.source_sha256 || row?.sha256;
    if (!nonempty(id) || sources.has(id) || !sourceURL(url) || !hash(sha256)) throw new Error('Invalid chamber reference source evidence.');
    sources.set(id, Object.freeze({ ...row, id, source_url: url, source_sha256: sha256 }));
  }
  return sources;
}

/** Every seat has an explicit identity and election status; missing feeds never create holdovers. */
export function parseChamberReference(raw) {
  if (raw?.schema_version !== 'chamber_reference_2026_v1' || raw.cycle !== 2026 || !validDate(raw.as_of) || !raw.offices) throw new Error('Invalid 2026 chamber reference.');
  const sources = normalizeSources(raw.sources), offices = {};
  for (const [office, config] of Object.entries(CONFIG)) {
    const input = raw.offices[office];
    if (!input || input.total !== config.total || !Array.isArray(input.seats) || input.seats.length !== config.total) throw new Error('Chamber reference seat inventory is incomplete.');
    const ids = new Set(), raceIds = new Set(), stateSeats = new Map(), classes = { 1: 0, 2: 0, 3: 0 };
    const seats = input.seats.map(row => {
      if (!row || !STATE_CODES.has(row.state) || typeof row.up_for_election !== 'boolean') throw new Error('Invalid chamber seat geography or election status.');
      let seatId, raceId = null, special = false;
      if (office === 'senate') {
        if (![1, 2, 3].includes(row.class)) throw new Error('A Senate class is required for each seat.');
        seatId = `${row.state}-${row.class}`; classes[row.class]++;
        const up = row.class === 2 || row.class === 3 && ['FL', 'OH'].includes(row.state);
        if (row.up_for_election !== up) throw new Error('Senate election status disagrees with its 2026 seat class.');
        special = up && row.class === 3;
        if (up) raceId = `2026-${special ? 'SP' : 'SG'}-${row.state}`;
      } else if (office === 'house') {
        if (!Number.isSafeInteger(row.district) || row.district < 1 || row.district > 53 || !row.up_for_election) throw new Error('Every voting House district must be up in 2026.');
        seatId = `${row.state}-${row.district}`; raceId = `2026-HG-${seatId}`;
      } else {
        seatId = row.state;
        if (row.up_for_election) raceId = `2026-GG-${row.state}`;
      }
      if (row.seat_id !== seatId || ids.has(seatId) || row.race_id != null && row.race_id !== raceId || row.up_for_election && row.race_id !== raceId || row.special != null && row.special !== special) throw new Error('Duplicate or mismatched chamber seat identity.');
      ids.add(seatId);
      if (raceId) { if (raceIds.has(raceId)) throw new Error('Duplicate contested chamber race.'); raceIds.add(raceId); }
      const list = stateSeats.get(row.state) || []; list.push(row); stateSeats.set(row.state, list);
      const code = row.party == null ? null : partyCode(row.party), source = sources.get(row.source_id);
      if (!row.up_for_election && (!code || !nonempty(row.name) || !sourceURL(row.source_url || source?.source_url) || !hash(row.source_sha256 || source?.source_sha256))) throw new Error('A held seat requires its verified incumbent party and source.');
      if (row.caucus != null && (!['DEM', 'REP', 'IND', 'OTHER'].includes(partyCode(row.caucus)) || !sources.has(row.caucus_source_id))) throw new Error('Invalid verified caucus metadata.');
      return Object.freeze({ ...row, seat_id: seatId, race_id: raceId, special, party: code, caucus: row.caucus == null ? null : partyCode(row.caucus), source_url: row.source_url || source?.source_url || null, source_sha256: row.source_sha256 || source?.source_sha256 || null });
    });
    if (seats.filter(seat => !seat.up_for_election).length !== config.held || raceIds.size !== config.up || stateSeats.size !== 50) throw new Error('Chamber held/contested counts do not reconcile.');
    if (office === 'senate' && (classes[1] !== 33 || classes[2] !== 33 || classes[3] !== 34 || [...stateSeats.values()].some(list => list.length !== 2 || list[0].class === list[1].class))) throw new Error('The Senate must contain all 100 distinct state/class seats.');
    if (office === 'governor' && [...stateSeats.values()].some(list => list.length !== 1)) throw new Error('Only the 50 state governorships are included.');
    if (office === 'house' && [...stateSeats.values()].some(list => list.map(row => row.district).sort((a, b) => a - b).some((district, index) => district !== index + 1))) throw new Error('House district inventories must be contiguous within each state.');
    offices[office] = Object.freeze({ ...input, office, total: config.total, holdover_count: config.held, contested: config.up, seats: Object.freeze(seats) });
  }
  const result = Object.freeze({ ...raw, offices: Object.freeze(offices), sources: Object.freeze([...sources.values()]) });
  parsed.add(result); return result;
}

export function loadChamberReference({ fetcher = globalThis.fetch } = {}) {
  if (typeof fetcher !== 'function') return Promise.reject(new Error('Chamber reference loading is unavailable.'));
  if (!loads.has(fetcher)) {
    const request = (async () => {
      const url = new URL('./data/chamber-reference-2026.json', import.meta.url), version = new URL(import.meta.url).searchParams.get('v');
      if (version) url.searchParams.set('v', version);
      const response = await fetcher(url, { credentials: 'same-origin', cache: version ? 'force-cache' : 'no-cache', redirect: 'error', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`Chamber reference returned HTTP ${response.status}.`);
      if (Number(response.headers.get('content-length')) > MAX_BYTES) throw new Error('Chamber reference exceeds its size limit.');
      const body = await response.text();
      if (new TextEncoder().encode(body).byteLength > MAX_BYTES) throw new Error('Chamber reference exceeds its size limit.');
      return parseChamberReference(JSON.parse(body));
    })();
    loads.set(fetcher, request); request.catch(() => { if (loads.get(fetcher) === request) loads.delete(fetcher); });
  }
  return loads.get(fetcher);
}

function isNationalRace(row, seat, office) {
  if (!row || row.race_id !== seat.race_id || row.office !== office || row.state !== seat.state || row.cycle != null && row.cycle !== 2026 || row.stage != null && row.stage !== 'general') return false;
  if (row.county_fips != null || row.reporting_unit_id != null || row.unit_kind != null && row.unit_kind !== 'state' || row.geography_type != null && row.geography_type !== 'state') return false;
  if (row.special != null && row.special !== seat.special) return false;
  return office === 'house' ? Number(row.district) === seat.district : row.district == null;
}
function publicCall(row, office) {
  const call = row.source_called_winner;
  if (!call) return { key: null, winner: null, reason: null };
  const url = `https://politics.api.cnn.io/results/national-races/2026-${CONFIG[office].code}.json`;
  if (row.source_name !== 'CNN' || call.source !== 'CNN' || row.source_url !== url || call.source_url !== url || !nonempty(call.candidate_id) || !nonempty(call.name) || !partyCode(call.party) || !Array.isArray(row.candidates)) return { key: null, winner: null, reason: 'invalid_source_call' };
  const ids = row.candidates.map(candidate => String(candidate?.candidate_id));
  if (new Set(ids).size !== ids.length) return { key: null, winner: null, reason: 'duplicate_candidate_identity' };
  const candidates = row.candidates.filter(candidate => candidate?.candidate_id === call.candidate_id);
  if (candidates.length !== 1 || displayName(candidates[0].name) !== displayName(call.name) || partyCode(candidates[0].party) !== partyCode(call.party)) return { key: null, winner: null, reason: 'source_call_candidate_mismatch' };
  const party = partyCode(call.party), winner = { candidate_id: call.candidate_id, name: call.name, party, source: 'CNN', source_url: url };
  return { key: `${winner.candidate_id}\0${winner.name}\0${party}`, winner, reason: null };
}

/** National totals remain identical when a map is focused on a state or county. */
export function summarizeChamberResults(races, reference, { office = 'senate' } = {}) {
  if (!CONFIG[office] || !Array.isArray(races) || races.length > 2000) throw new Error('A bounded national race inventory and supported office are required.');
  const ref = parsed.has(reference) ? reference : parseChamberReference(reference), inventory = ref.offices[office];
  const parties = Object.fromEntries(['DEM', 'REP', 'IND', 'OTHER'].map(code => [code, { total: 0, held: 0, won: 0 }]));
  const byRace = new Map(inventory.seats.filter(seat => seat.up_for_election).map(seat => [seat.race_id, { seat, rows: [] }]));
  let ignored = 0;
  for (const row of races) {
    const item = byRace.get(row?.race_id);
    if (item && isNationalRace(row, item.seat, office)) item.rows.push(row);
    else if (row?.office === office) ignored++;
  }
  let called = 0, undecided = 0, missing = 0;
  const issues = [], seats = [];
  for (const seat of inventory.seats) {
    if (!seat.up_for_election) {
      const group = partyGroup(seat.party); parties[group].held++; parties[group].total++;
      seats.push({ seat_id: seat.seat_id, state: seat.state, status: 'held', party: seat.party, name: seat.name, caucus: seat.caucus, caucus_source_id: seat.caucus_source_id || null, source_url: seat.source_url, source_sha256: seat.source_sha256, up_for_election: false }); continue;
    }
    const rows = byRace.get(seat.race_id).rows, calls = rows.map(row => publicCall(row, office));
    const invalid = calls.find(call => call.reason), keys = new Set(calls.map(call => call.key));
    let winner = null;
    if (!rows.length) missing++;
    else if (invalid) issues.push({ seat_id: seat.seat_id, race_id: seat.race_id, reason: invalid.reason });
    else if (keys.size > 1) issues.push({ seat_id: seat.seat_id, race_id: seat.race_id, reason: 'conflicting_duplicate_calls' });
    else if (calls[0].winner) winner = calls[0].winner;
    if (winner) { const group = partyGroup(winner.party); parties[group].won++; parties[group].total++; called++; }
    else undecided++;
    seats.push({ seat_id: seat.seat_id, state: seat.state, race_id: seat.race_id, status: winner ? 'won' : 'undecided', party: winner?.party || null, name: winner?.name || null, source_called_winner: winner, up_for_election: true });
  }
  if (Object.values(parties).reduce((sum, party) => sum + party.total, 0) + undecided !== inventory.total) throw new Error('Seat totals failed to reconcile.');
  return { office, total: inventory.total, contested: inventory.contested, holdover_count: inventory.holdover_count, called_count: called, undecided, parties, seats, source_name: 'CNN', as_of: ref.as_of, majority_threshold: office === 'governor' ? null : Math.floor(inventory.total / 2) + 1, missing_races: missing, ignored_races: ignored, issues, own_race_calls: false };
}
