/** Public aggregate Massachusetts returns; comparisons are descriptive vote counts. */
import { resultsFetch, browserSnapshotCache } from './results-client.js';

const QUESTION_SOURCE = 'https://www.sec.state.ma.us/divisions/elections/research-and-statistics/2026-ballot-questions.htm';
export const MASSACHUSETTS_CONTESTS = Object.freeze([
  { id: 'governor', title: 'Governor', summary: 'Massachusetts Governor', kind: 'governor' },
  { id: 'question-1', title: 'Question 1 · Public records', summary: 'Expand the public records law to the Legislature and Governor.', kind: 'question' },
  { id: 'question-2', title: 'Question 2 · Public defender bargaining', summary: 'Allow CPCS employees to bargain collectively.', kind: 'question' },
  { id: 'question-3', title: 'Question 3 · State primaries', summary: 'Replace party primaries with an all-party, top-two primary.', kind: 'question' },
  { id: 'question-4', title: 'Question 4 · Election Day registration', summary: 'Allow voter registration on Election Day.', kind: 'question' },
  { id: 'question-5', title: 'Question 5 · Revenue limit and rebate', summary: 'Change the state revenue limit and rebate formula.', kind: 'question' },
  { id: 'question-6', title: 'Question 6 · Conservation fund', summary: 'Create a natural resource conservation fund.', kind: 'question' },
  { id: 'question-7', title: 'Question 7 · Single-family homes', summary: 'Allow single-family homes on smaller lots.', kind: 'question' },
  { id: 'question-8', title: 'Question 8 · Prohibit recreational marijuana sales', summary: 'Yes prohibits retail recreational marijuana sales; No keeps them legal.', kind: 'question' },
  { id: 'question-9', title: 'Question 9 · Keep the 2024 firearms law', summary: 'Yes keeps the 2024 firearms law; No repeals it.', kind: 'question' },
].map(row => Object.freeze({ ...row, source_url: row.kind === 'question' ? QUESTION_SOURCE : null })));

const CONTESTS = new Map(MASSACHUSETTS_CONTESTS.map(row => [row.id, row]));
const QUESTION_BASE = 'https://static.wbur.org/json/elections/2026/2026-11-03-map-questions-';
const GOV_RACE = '2026-GG-MA';
const GOV_URL = 'https://politics.api.cnn.io/results/county-races/' + GOV_RACE + '.json';
const NATIONAL_GOV_URL = 'https://politics.api.cnn.io/results/national-races/2026-GG.json';
const MAX_BYTES = 2 * 1024 * 1024;
const MIN_REFRESH_MS = 30_000;
const crosswalks = new WeakMap();
const count = value => Number.isSafeInteger(value) && value >= 0;
const observedCount = value => value == null ? null : count(value) ? value : (() => { throw new Error('Invalid Massachusetts vote count.'); })();
const name = value => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').toUpperCase() : '';
const party = value => ({ D: 'DEM', DEM: 'DEM', DEMOCRATIC: 'DEM', R: 'REP', REP: 'REP', GOP: 'REP', REPUBLICAN: 'REP' })[String(value || '').toUpperCase()] || String(value || 'UNKNOWN').toUpperCase();
const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const sumKnown = values => values.length && values.every(count) ? values.reduce((sum, value) => sum + value, 0) : null;
const text = value => typeof value === 'string' && value.trim().length > 0 && value.length < 1000;
const frozen = value => Object.freeze(value);

function assetURL(path) {
  const url = new URL(path, import.meta.url), version = new URL(import.meta.url).searchParams.get('v');
  if (version) url.searchParams.set('v', version);
  return url;
}

function geography(raw) {
  if (raw && crosswalks.has(raw)) return crosswalks.get(raw);
  if (raw?.schema_version !== 'ma_town_county_crosswalk_v1' || raw.state !== 'MA' || !Array.isArray(raw.towns) || raw.towns.length !== 351) throw new Error('A verified Massachusetts municipality partition is required.');
  const names = new Map(), ids = new Map(), counties = new Map();
  for (const item of raw.towns) {
    const key = String(item?.massgis_town_id), label = name(item?.name);
    if (!Number.isSafeInteger(item?.massgis_town_id) || item.massgis_town_id < 1 || item.massgis_town_id > 351 || !label || names.has(label) || ids.has(key) || !/^25\d{3}$/.test(item.county_fips || '') || !text(item.county_name)) throw new Error('Invalid unique Massachusetts municipality identity.');
    const row = frozen({ ...item, id: key }); names.set(label, row); ids.set(key, row);
    if (counties.has(row.county_fips) && counties.get(row.county_fips) !== row.county_name) throw new Error('Massachusetts county identities disagree.');
    counties.set(row.county_fips, row.county_name);
  }
  if (counties.size !== 14) throw new Error('All fourteen Massachusetts counties are required.');
  const result = { names, ids, counties }; crosswalks.set(raw, result); return result;
}

function reporting(rows) {
  const read = key => {
    const values = rows.map(row => row[key] == null ? null : row[key]);
    if (values.some(value => value !== null && !count(value))) throw new Error('Invalid precinct reporting count.');
    return values.length && values.every(value => value !== null && value === values[0]) ? values[0] : null;
  };
  const reported = read('precinctsreporting'), total = read('precinctstotal');
  if (reported !== null && total !== null && reported > total) throw new Error('Reported precincts exceed the source total.');
  return { precincts_reporting: reported, precincts_total: total,
    precincts_reporting_percent: reported !== null && total > 0 ? 100 * reported / total : null };
}

function unit({ id, level, name: label, contest, choices, counts, reported_total, source, county_fips = null, reporting_unit_ids = [], ...extra }) {
  const values = Object.fromEntries(choices.map(choice => [choice.id, observedCount(counts[choice.id])]));
  const known = sumKnown(Object.values(values));
  if (count(reported_total) && Object.values(values).reduce((sum, value) => sum + (value ?? 0), 0) > reported_total) throw new Error('Known choices exceed a reported total.');
  return frozen({ id: String(id), level, geography_key: level + ':' + id, state: 'MA', name: label, contest,
    counts: frozen(values), reported_total: observedCount(reported_total), county_fips,
    reporting_unit_ids: frozen([...reporting_unit_ids]), source, candidate_attributed_total: known,
    main_candidate_ids: frozen(choices.filter(choice => choice.main).map(choice => choice.id)),
    accounting_complete: known !== null && count(reported_total) && known === reported_total,
    all_valid_coverage_verified: false, ballots_cast: null, blank_votes: null,
    precincts_reporting: null, precincts_total: null, precincts_reporting_percent: null, ...extra });
}

function aggregate(members, { id, level, label, contest, choices, source, county_fips = null }) {
  const counts = Object.fromEntries(choices.map(choice => [choice.id, sumKnown(members.map(row => row.counts[choice.id]))]));
  const precincts_reporting = sumKnown(members.map(row => row.precincts_reporting));
  const precincts_total = sumKnown(members.map(row => row.precincts_total));
  const result = unit({ id, level, name: label, contest, choices, counts, source, county_fips,
    reported_total: sumKnown(members.map(row => row.reported_total)),
    reporting_unit_ids: members.flatMap(row => row.reporting_unit_ids),
    precincts_reporting, precincts_total,
    precincts_reporting_percent: precincts_reporting !== null && precincts_total > 0 ? 100 * precincts_reporting / precincts_total : null,
    aggregation_basis: 'sum_verified_municipal_partition', municipality_count: members.length,
    vote_progress: null });
  return frozen({ ...result, accounting_complete: result.accounting_complete && members.every(row => row.accounting_complete),
    unattributed_source_votes: contest === 'governor' ? sumKnown(members.map(row => row.unattributed_source_votes)) : null });
}

function assemble({ contest, choices, towns, published_state, source, index }) {
  if (towns.size !== 351 || [...index.ids.keys()].some(id => !towns.has(id))) throw new Error('The source must contain all 351 unique Massachusetts municipalities.');
  const counties = new Map();
  for (const [id, label] of index.counties) {
    const members = [...towns.values()].filter(row => row.county_fips === id);
    counties.set(id, aggregate(members, { id, level: 'county', label, contest, choices, source, county_fips: id }));
  }
  const state = aggregate([...towns.values()], { id: 'MA', level: 'state', label: 'Massachusetts', contest, choices, source });
  const matches = Object.fromEntries(choices.map(choice => [choice.id, count(state.counts[choice.id]) && count(published_state?.counts[choice.id]) ? state.counts[choice.id] === published_state.counts[choice.id] : null]));
  return frozen({ contest, ...CONTESTS.get(contest), choices: frozen(choices.map(frozen)), source, state, towns, counties,
    published_state, national_state: contest === 'governor' ? published_state : null,
    coverage: frozen({ towns: 351, counties: 14, state_basis: 'sum_verified_351_towns', published_state_matches_towns: frozen(matches),
      published_state_total_matches_towns: count(state.reported_total) && count(published_state?.reported_total) ? state.reported_total === published_state.reported_total : null }),
    our_model_race_call: null, win_probability: null });
}

export function parseMassachusettsBallotResults(rows, { contest, crosswalk, source }) {
  if (!/^question-[1-9]$/.test(contest || '') || !Array.isArray(rows) || !rows.length || rows.length > 1000) throw new Error('Invalid bounded Massachusetts ballot question source.');
  const index = geography(crosswalk), choices = [{ id: 'yes', label: 'Yes', party: null, main: false }, { id: 'no', label: 'No', party: null, main: false }];
  const groups = new Map(), stateRows = [], sourceIds = new Map();
  for (const row of rows) {
    if (!row || !['state', 'township'].includes(row.level) || !text(row.reportingunitid)) throw new Error('Invalid Massachusetts source geography.');
    const id = String(row.last || '').toLowerCase();
    if (!['yes', 'no'].includes(id) || String(row.party || '').toLowerCase() !== id) throw new Error('A question response is not Yes or No.');
    observedCount(row.votecount);
    if (row.level === 'state') { if (!/^state-MA-\d+$/.test(row.reportingunitid)) throw new Error('Question state identity disagrees.'); stateRows.push(row); continue; }
    const place = index.names.get(name(row.reportingunitname));
    if (!place || row.fipscode !== place.county_fips) throw new Error('A source municipality has no exact verified county match.');
    if (sourceIds.has(row.reportingunitid) && sourceIds.get(row.reportingunitid) !== place.id) throw new Error('A source identifier refers to more than one municipality.');
    sourceIds.set(row.reportingunitid, place.id);
    if (!groups.has(place.id)) groups.set(place.id, { place, rows: [] });
    groups.get(place.id).rows.push(row);
  }
  const build = (records, id, level, label, county_fips = null) => {
    const counts = {}, ids = new Set(records.map(row => row.reportingunitid));
    if (ids.size !== 1) throw new Error('One municipality has conflicting source identifiers.');
    for (const row of records) { const key = row.last.toLowerCase(); if (key in counts) throw new Error('Duplicate cumulative question response.'); counts[key] = observedCount(row.votecount); }
    return unit({ id, level, name: label, contest, choices, counts, county_fips, source,
      reported_total: sumKnown(choices.map(choice => counts[choice.id] ?? null)), reporting_unit_ids: [...ids],
      ...reporting(records), vote_progress: null });
  };
  if (!stateRows.length) throw new Error('The question statewide source rows are missing.');
  const published_state = build(stateRows, 'MA', 'state', 'Massachusetts');
  const towns = new Map([...groups.values()].map(({ place, rows: records }) => [place.id, build(records, place.id, 'town', records[0].reportingunitname, place.county_fips)]));
  return assemble({ contest, choices, towns, published_state, source, index });
}

export function parseMassachusettsGovernorResults(payload, { crosswalk, source: suppliedSource } = {}) {
  const index = geography(crosswalk), parent = (payload?.states || []).flatMap(row => row.races || []).find(row => row.race_id === GOV_RACE);
  if (!parent || parent.office !== 'governor' || parent.state !== 'MA' || parent.cycle !== 2026 || parent.stage !== 'general' || parent.district != null || parent.source_name !== 'CNN' || parent.source_url !== NATIONAL_GOV_URL || !Array.isArray(payload.supplemental_localities) || payload.supplemental_localities.length !== 351) throw new Error('A complete verified CNN Massachusetts Governor municipality source is required.');
  const records = payload.supplemental_localities, roster = new Map();
  for (const row of [parent, ...records]) {
    if (row.race_id !== GOV_RACE || row.state !== 'MA' || row.district != null || row.office != null && row.office !== 'governor' || !Array.isArray(row.candidates) || !row.candidates.length) throw new Error('Governor result identity disagrees.');
    const seen = new Set();
    for (const candidate of row.candidates) {
      const id = String(candidate.candidate_id ?? ''), label = candidate.name, code = party(candidate.party);
      if (!text(id) || !text(label) || seen.has(id)) throw new Error('Invalid unique Governor candidate identity.');
      seen.add(id); observedCount(candidate.votes);
      if (roster.has(id) && (roster.get(id).label !== label || roster.get(id).party !== code)) throw new Error('Governor candidate identities differ between municipalities.');
      roster.set(id, { id, label, party: code, main: ['DEM', 'REP'].includes(code) });
    }
  }
  const choices = [...roster.values()].sort((a, b) => (a.party === 'DEM' ? 0 : a.party === 'REP' ? 1 : 2) - (b.party === 'DEM' ? 0 : b.party === 'REP' ? 1 : 2) || a.label.localeCompare(b.label));
  if (choices.filter(choice => choice.party === 'DEM').length !== 1 || choices.filter(choice => choice.party === 'REP').length !== 1) throw new Error('The two main Governor candidates are ambiguous.');
  const coverage = payload.county_coverage || {}, range = coverage.source_update_range;
  const source = frozen({ name: 'CNN', url: GOV_URL, checked_at: coverage.checked_at || null,
    updated_at: range?.unknown_count ? null : range?.oldest || null, latest_updated_at: range?.newest || null,
    last_modified: null, sha256: coverage.snapshot_id || null,
    status: coverage.stale || coverage.error ? 'stale' : 'available', error: coverage.error || null,
    ...suppliedSource });
  const build = (row, id, level, label, county_fips = null, rowSource = source) => {
    const counts = Object.fromEntries(row.candidates.map(candidate => [String(candidate.candidate_id), observedCount(candidate.votes)]));
    const result = unit({ id, level, name: label, contest: 'governor', choices, counts, source: rowSource, county_fips,
      reported_total: observedCount(row.reported_total), reporting_unit_ids: row.reporting_unit_id ? [row.reporting_unit_id] : [],
      unattributed_source_votes: row.unattributed_source_votes ?? null,
      vote_progress: row.source_vote_progress || null, source_updated_at: row.source_updated_at || null });
    return row.vote_counts_complete === false || row.unattributed_source_votes !== 0 ? frozen({ ...result, accounting_complete: false }) : result;
  };
  const towns = new Map(), sourceIds = new Set();
  for (const row of records) {
    const place = index.names.get(name(row.name));
    if (!place || towns.has(place.id) || sourceIds.has(row.reporting_unit_id) || row.unit_kind !== 'source_locality' || !text(row.reporting_unit_id) || row.county_fips != null || row.source_name !== 'CNN' || row.source_url !== GOV_URL) throw new Error('Invalid unique complete Governor municipality partition.');
    sourceIds.add(row.reporting_unit_id);
    towns.set(place.id, build(row, place.id, 'town', row.name, place.county_fips));
  }
  const nationalSource = frozen({ name: 'CNN', url: NATIONAL_GOV_URL, checked_at: parent.checked_at || payload.source?.checked_at || null,
    updated_at: parent.source_updated_at || null, status: parent.source_stale ? 'stale' : 'available' });
  return assemble({ contest: 'governor', choices, towns, source, index,
    published_state: build(parent, 'MA', 'state', 'Massachusetts', null, nationalSource) });
}

function sameBallotGovernorGeography(question, governor) {
  if (!/^question-[1-9]$/.test(question?.contest || '') || governor?.contest !== 'governor' || !['state', 'county', 'town'].includes(question?.level) || question.state !== 'MA' || governor.state !== 'MA' || question.level !== governor.level || question.id !== governor.id || question.geography_key !== question.level + ':' + question.id || question.geography_key !== governor.geography_key) return false;
  if (question.level === 'state') return question.id === 'MA';
  if (question.level === 'county') return /^25\d{3}$/.test(question.id) && question.county_fips === question.id && governor.county_fips === question.id;
  return /^[1-9]\d{0,2}$/.test(question.id) && Number(question.id) <= 351 && /^25\d{3}$/.test(question.county_fips || '') && question.county_fips === governor.county_fips;
}

/** Same geography: Governor/response ratio; response minus Governor vote and share gaps. */
export function compareBallotToGovernor(question, governor, { response = 'yes', candidate } = {}) {
  const output = { question_votes: null, governor_votes: null, vote_difference: null, count_ratio_percent: null,
    question_share_percent: null, governor_share_percent: null, share_gap_pp: null,
    question_source: question?.source || null, governor_source: governor?.source || null };
  if (!sameBallotGovernorGeography(question, governor) || !['yes', 'no'].includes(response) || !governor.main_candidate_ids?.includes(candidate)) return frozen(output);
  const q = question.counts?.[response], g = governor.counts?.[candidate];
  output.question_votes = count(q) ? q : null; output.governor_votes = count(g) ? g : null;
  if (output.question_votes !== null && output.governor_votes !== null) output.vote_difference = q - g;
  if (output.question_votes > 0 && output.governor_votes !== null) output.count_ratio_percent = 100 * g / q;
  if (count(q) && count(question.counts?.yes) && count(question.counts?.no) && question.reported_total > 0 && question.counts.yes + question.counts.no === question.reported_total) output.question_share_percent = 100 * q / question.reported_total;
  if (count(g) && governor.accounting_complete === true && governor.reported_total > 0) output.governor_share_percent = 100 * g / governor.reported_total;
  if (output.question_share_percent !== null && output.governor_share_percent !== null) output.share_gap_pp = output.question_share_percent - output.governor_share_percent;
  return frozen(output);
}

/** Rank four observed counts; ties stay explicit and incomplete counts never name a leader. */
export function rankBallotGovernorVotes(question, governor, { candidates = [] } = {}) {
  const unavailable = () => frozen({ status: 'unavailable', entries: frozen([]), leader_ids: frozen([]), tied: false,
    max_votes: null, geography_key: null });
  if (!sameBallotGovernorGeography(question, governor) || !Array.isArray(candidates) || candidates.length > 100 || !Array.isArray(governor.main_candidate_ids) || governor.main_candidate_ids.length !== 2 || new Set(governor.main_candidate_ids).size !== 2) return unavailable();
  const main = candidates.filter(candidate => candidate?.main === true);
  if (main.length !== 2 || main.some(candidate => !text(candidate.id) || !text(candidate.label) || !governor.main_candidate_ids.includes(candidate.id)) || new Set(main.map(candidate => candidate.id)).size !== 2 || new Set(main.map(candidate => party(candidate.party))).size !== 2 || !main.some(candidate => party(candidate.party) === 'DEM') || !main.some(candidate => party(candidate.party) === 'REP')) return unavailable();
  main.sort((a, b) => (party(a.party) === 'DEM' ? 0 : 1) - (party(b.party) === 'DEM' ? 0 : 1));
  const value = raw => count(raw) ? raw : null;
  const records = [
    { id: 'question:yes', kind: 'question', response: 'yes', label: 'Yes', party: null, votes: value(question.counts?.yes), source: question.source || null },
    { id: 'question:no', kind: 'question', response: 'no', label: 'No', party: null, votes: value(question.counts?.no), source: question.source || null },
    ...main.map(candidate => ({ id: 'governor:' + candidate.id, kind: 'governor', candidate_id: candidate.id,
      label: candidate.label, party: party(candidate.party), votes: value(governor.counts?.[candidate.id]), source: governor.source || null })),
  ];
  const order = new Map(records.map((entry, index) => [entry.id, index]));
  records.sort((a, b) => a.votes === null ? b.votes === null ? order.get(a.id) - order.get(b.id) : 1 :
    b.votes === null ? -1 : b.votes - a.votes || order.get(a.id) - order.get(b.id));
  const complete = records.every(entry => entry.votes !== null), maximum = complete ? records[0].votes : null;
  const leader_ids = complete && maximum > 0 ? records.filter(entry => entry.votes === maximum).map(entry => entry.id) : [];
  return frozen({ status: !complete ? 'incomplete' : maximum === 0 ? 'no_votes' : 'available',
    entries: frozen(records.map(frozen)), leader_ids: frozen(leader_ids), tied: leader_ids.length > 1,
    max_votes: maximum, geography_key: question.geography_key });
}

async function boundedJSON(response, maxBytes = MAX_BYTES) {
  if (!response.ok || response.redirected) throw new Error('Public results source returned HTTP ' + response.status + '.');
  if (Number(response.headers.get('content-length')) > maxBytes || !response.body) throw new Error('Public results source exceeds its byte limit.');
  const reader = response.body.getReader(), chunks = []; let length = 0;
  try {
    for (;;) { const { value, done } = await reader.read(); if (done) break; length += value.byteLength; if (length > maxBytes) { await reader.cancel(); throw new Error('Public results source exceeds its byte limit.'); } chunks.push(value); }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
}

function replaceSource(data, source) {
  const replace = value => value ? frozen({ ...value, source }) : value;
  return frozen({ ...data, source, state: replace(data.state),
    towns: new Map([...data.towns].map(([key, row]) => [key, replace(row)])),
    counties: new Map([...data.counties].map(([key, row]) => [key, replace(row)])) });
}

/** Requests coalesce; failed refreshes retain last-good counts, including browser snapshots. */
export function createMassachusettsResultsLoader({ fetcher = globalThis.fetch.bind(globalThis), governorFetcher = resultsFetch,
  cacheStorage = globalThis.caches, now = () => Date.now(), crosswalk } = {}) {
  const saved = new Map(), running = new Map(), storage = browserSnapshotCache(cacheStorage, now);
  let crosswalkPromise;
  const getCrosswalk = () => crosswalk ? Promise.resolve(crosswalk) : (crosswalkPromise ||= (async () => {
    const data = await boundedJSON(await fetcher(assetURL('./data/ma-town-county-crosswalk.json'), { credentials: 'same-origin' }), 256 * 1024); geography(data); return data;
  })().catch(error => { crosswalkPromise = null; throw error; }));
  const cacheKey = contest => new Request('https://election-results-cache.invalid/v1/ma-wbur-' + contest);
  return async ({ contest = 'governor', refresh = false } = {}) => {
    if (!CONTESTS.has(contest) || typeof refresh !== 'boolean') throw new TypeError('Unsupported Massachusetts contest.');
    const old = saved.get(contest);
    if (!refresh && old && now() - old.at >= 0 && now() - old.at < MIN_REFRESH_MS) return old.data;
    if (running.has(contest)) return running.get(contest);
    const operation = (async () => {
      const attempted = new Date(now()).toISOString(); let previous = old?.data;
      try {
        const reference = await getCrosswalk();
        if (contest !== 'governor' && !previous && storage) {
          try {
            const response = await storage.match(cacheKey(contest));
            if (response) { const item = await boundedJSON(response); if (item.version === 1 && item.contest === contest) previous = parseMassachusettsBallotResults(item.rows, { contest, crosswalk: reference, source: item.source }); }
          } catch {}
        }
        let data;
        if (contest === 'governor') {
          let failedRefresh = false;
          if (refresh) { const response = await governorFetcher('/api/results-map/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ county_race_id: GOV_RACE }) }); failedRefresh = !response.ok; }
          const payload = await boundedJSON(await governorFetcher('/api/results-map?race_id=' + GOV_RACE + '&detail=county', { cache: 'no-store' }));
          data = parseMassachusettsGovernorResults(payload, { crosswalk: reference });
          if (failedRefresh) data = replaceSource(data, frozen({ ...data.source, status: 'stale', error: 'Refresh failed.', refresh_checked_at: attempted }));
        } else {
          const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10_000);
          try {
            const url = QUESTION_BASE + contest.slice(-1) + '.json';
            const response = await fetcher(url, { mode: 'cors', credentials: 'omit', cache: refresh ? 'no-store' : 'no-cache', redirect: 'error', headers: { Accept: 'application/json' }, signal: controller.signal });
            const rows = await boundedJSON(response);
            const source = frozen({ name: 'AP via WBUR', url, checked_at: attempted,
              updated_at: date(response.headers.get('last-modified')), last_modified: response.headers.get('last-modified'),
              updated_at_definition: 'HTTP Last-Modified of the source snapshot', status: 'available', error: null,
              attribution_url: 'https://www.wbur.org/news/2026/11/03/massachusetts-map-your-city-town-vote-governor-senate-ballot-questions' });
            data = parseMassachusettsBallotResults(rows, { contest, crosswalk: reference, source });
            if (storage) try { await storage.put(cacheKey(contest), new Response(JSON.stringify({ version: 1, contest, rows, source }), { headers: { 'Content-Type': 'application/json' } })); } catch {}
          } finally { clearTimeout(timer); }
        }
        saved.set(contest, { at: now(), data }); return data;
      } catch (error) {
        if (!previous) throw error;
        const data = replaceSource(previous, frozen({ ...previous.source, status: 'stale', error: String(error.message || error).slice(0, 300), refresh_checked_at: attempted }));
        saved.set(contest, { at: now(), data }); return data;
      }
    })();
    running.set(contest, operation);
    try { return await operation; } finally { running.delete(contest); }
  };
}

export const loadMassachusettsResults = createMassachusettsResultsLoader();
