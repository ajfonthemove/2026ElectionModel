/** Official Massachusetts Governor town references; observed-count comparisons only. */
export const MASSACHUSETTS_GOVERNOR_YEARS = Object.freeze([2022, 2018]);
const MAX_BYTES = 1024 * 1024;
const loads = new WeakMap(), crosswalkLoads = new WeakMap();
const integer = value => Number.isSafeInteger(value) && value >= 0;
const text = value => typeof value === 'string' && value.trim().length > 0 && value.length < 300;
const party = value => ({ D: 'DEM', DEM: 'DEM', DEMOCRAT: 'DEM', DEMOCRATIC: 'DEM', R: 'REP', REP: 'REP', GOP: 'REP', REPUBLICAN: 'REP' })[String(value || '').toUpperCase()] || String(value || '').toUpperCase();
const freeze = Object.freeze;
const META = freeze({
  2022: freeze({ id: 154338, date: '2022-11-08', dem: 'Maura Healey', demLabel: 'Healey', rep: 'Geoff Diehl', repLabel: 'Diehl', hash: '85547c8ea5bd6f88a21d27d5b2adc646a4730fc042765d12cd9b83b5188b2b0c', choices: 4 }),
  2018: freeze({ id: 131501, date: '2018-11-06', dem: 'Gonzalez and Palfrey', demLabel: 'Gonzalez', rep: 'Baker and Polito', repLabel: 'Baker', hash: '07dc4ee3d9103036dfffb32052dd63cad04dabd81381e1390a33bbbe7880a637', choices: 3 }),
});
const CHOICE_LABELS = freeze({
  2022: freeze(['Maura Healey', 'Geoff Diehl', 'Kevin Reed', 'All Others']),
  2018: freeze(['Gonzalez and Palfrey', 'Baker and Polito', 'All Others']),
});

function crosswalkIndex(raw) {
  if (raw?.schema_version !== 'ma_town_county_crosswalk_v1' || raw.state !== 'MA' || !Array.isArray(raw.towns) || raw.towns.length !== 351) throw new Error('A complete Massachusetts town crosswalk is required.');
  const towns = new Map(), counties = new Map(), names = new Set();
  for (const row of raw.towns) {
    const id = row?.massgis_town_id;
    if (!integer(id) || id < 1 || id > 351 || towns.has(String(id)) || !text(row.name) || names.has(row.name) || !/^25\d{3}$/.test(row.county_fips || '') || !text(row.county_name)) throw new Error('Invalid Massachusetts municipality identity.');
    if (counties.has(row.county_fips) && counties.get(row.county_fips) !== row.county_name) throw new Error('County names disagree.');
    towns.set(String(id), row); counties.set(row.county_fips, row.county_name); names.add(row.name);
  }
  if (counties.size !== 14) throw new Error('All Massachusetts counties are required.');
  return { towns, counties };
}

/** Validate all 351 identities, every candidate column, blanks and official statewide reconciliation. */
export function parseMassachusettsGovernorHistory(raw, { crosswalk } = {}) {
  const meta = META[raw?.year], index = crosswalkIndex(crosswalk);
  if (!meta || raw.schema_version !== 'ma_governor_history_v1' || raw.state !== 'MA' || raw.office !== 'governor' || raw.stage !== 'general' || !Array.isArray(raw.choices) || raw.choices.length !== meta.choices || !Array.isArray(raw.towns) || raw.towns.length !== 351) throw new Error('Invalid Massachusetts Governor reference.');
  if (raw.source?.office !== 'governor' || raw.source?.election_id !== meta.id || raw.source.election_date !== meta.date || raw.source.sha256 !== meta.hash || raw.source.url !== `https://electionstats.state.ma.us/elections/view/${meta.id}/` || raw.source.download_url !== `https://electionstats.state.ma.us/elections/download/${meta.id}/precincts_include:0/` || raw.source.all_valid_coverage_verified !== true || raw.source.all_others_preserved_as_source_group !== true || !text(raw.source.name) || !Number.isFinite(Date.parse(raw.source.retrieved_at))) throw new Error('The official source identity or historical vintage disagrees.');
  if (raw.nominees?.dem?.name !== meta.dem || raw.nominees?.rep?.name !== meta.rep || raw.nominees.dem.label !== meta.demLabel || raw.nominees.rep.label !== meta.repLabel || raw.nominees.dem.party !== 'DEM' || raw.nominees.rep.party !== 'REP') throw new Error('Governor nominee identities disagree.');
  const choices = raw.choices.map(row => freeze({ ...row })), ids = choices.map(row => row.id);
  if (new Set(ids).size !== ids.length || ids[0] !== 'dem' || ids[1] !== 'rep' || ids.at(-1) !== 'all_others' || choices[0].party !== 'DEM' || choices[1].party !== 'REP' || choices.some((row, index) => !text(row.id) || row.label !== CHOICE_LABELS[raw.year][index])) throw new Error('Governor candidate columns disagree.');
  const source = freeze({ ...raw.source }), nominees = freeze({ dem: freeze({ ...raw.nominees.dem }), rep: freeze({ ...raw.nominees.rep }) });
  function unit(row, level, id, name, county_fips = null) {
    const counts = Object.fromEntries(ids.map(key => [key, row.counts?.[key]])), total = Object.values(counts).reduce((sum, value) => sum + (integer(value) ? value : 0), 0);
    if (Object.keys(row.counts || {}).length !== ids.length || Object.values(counts).some(value => !integer(value)) || !integer(row.valid_votes) || !integer(row.blank_votes) || !integer(row.total_votes_cast) || total !== row.valid_votes || total + row.blank_votes !== row.total_votes_cast) throw new Error('Historical candidate votes and blanks do not reconcile.');
    return freeze({ id, level, geography_key: level + ':' + id, state: 'MA', year: raw.year, name, county_fips,
      counts: freeze(counts), dem_votes: counts.dem, rep_votes: counts.rep, other_votes: total - counts.dem - counts.rep,
      reported_total: total, valid_votes: total, blank_votes: row.blank_votes, total_votes_cast: row.total_votes_cast,
      all_valid_coverage_verified: true, candidate_roster_complete: false, source, nominees,
      join_verified: true, reference_kind: 'official_ma_governor_town_partition' });
  }
  const towns = new Map();
  for (const row of raw.towns) {
    const place = index.towns.get(row?.id);
    if (!place || towns.has(row.id) || row.state !== 'MA' || row.level !== 'town' || row.geography_key !== 'town:' + row.id || row.canonical_name !== place.name || row.county_fips !== place.county_fips || row.county_name !== place.county_name || !text(row.name)) throw new Error('Historical municipality identity or county assignment disagrees.');
    const result = unit(row, 'town', row.id, row.name, row.county_fips);
    if (row.dem_votes !== result.dem_votes || row.rep_votes !== result.rep_votes || row.other_votes !== result.other_votes || row.reported_total !== result.reported_total) throw new Error('Historical derived candidate counts disagree.');
    towns.set(row.id, result);
  }
  function aggregate(members, level, id, name, county_fips = null) {
    return unit({ counts: Object.fromEntries(ids.map(key => [key, members.reduce((sum, row) => sum + row.counts[key], 0)])),
      valid_votes: members.reduce((sum, row) => sum + row.valid_votes, 0),
      blank_votes: members.reduce((sum, row) => sum + row.blank_votes, 0),
      total_votes_cast: members.reduce((sum, row) => sum + row.total_votes_cast, 0) }, level, id, name, county_fips);
  }
  const state = aggregate([...towns.values()], 'state', 'MA', 'Massachusetts');
  const official = unit(raw.official_state || {}, 'state', 'MA', 'Massachusetts');
  if (ids.some(id => state.counts[id] !== official.counts[id]) || state.valid_votes !== official.valid_votes || state.blank_votes !== official.blank_votes || state.total_votes_cast !== official.total_votes_cast) throw new Error('Town sums do not match the official statewide results.');
  const counties = new Map([...index.counties].map(([id, name]) => [id, aggregate([...towns.values()].filter(row => row.county_fips === id), 'county', id, name, id)]));
  if (raw.coverage?.towns !== 351 || raw.coverage.counties !== 14 || raw.coverage.all_valid_coverage_verified !== true || raw.coverage.blank_votes_excluded_from_vote_share_denominator !== true) throw new Error('Historical coverage metadata disagrees.');
  return freeze({ year: raw.year, state, towns, counties, nominees, choices: freeze(choices), source,
    coverage: freeze({ towns: 351, counties: 14, all_valid_coverage_verified: true, state_basis: 'sum_verified_351_towns_reconciled_to_official_state', blank_votes_excluded: true }) });
}

function assetURL(path) {
  const url = new URL(path, import.meta.url), version = new URL(import.meta.url).searchParams.get('v');
  if (version) url.searchParams.set('v', version);
  return url;
}

async function boundedJSON(response) {
  if (!response.ok || response.redirected || Number(response.headers.get('content-length')) > MAX_BYTES || !response.body) throw new Error('Historical reference request failed or exceeds its limit.');
  const reader = response.body.getReader(), chunks = []; let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > MAX_BYTES) { await reader.cancel(); throw new Error('Historical reference exceeds its size limit.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
}

/** Versioned, bounded, lazy same-origin loads; failed attempts remain retryable. */
export function loadMassachusettsGovernorHistory(year, { fetcher = globalThis.fetch } = {}) {
  if (!MASSACHUSETTS_GOVERNOR_YEARS.includes(year) || typeof fetcher !== 'function') return Promise.reject(new Error('A verified Massachusetts Governor year is required.'));
  const fetchJSON = path => fetcher(assetURL(path), { credentials: 'same-origin', redirect: 'error', cache: new URL(import.meta.url).searchParams.has('v') ? 'force-cache' : 'no-cache', headers: { Accept: 'application/json' } }).then(boundedJSON);
  let cache = loads.get(fetcher); if (!cache) { cache = new Map(); loads.set(fetcher, cache); }
  if (!crosswalkLoads.has(fetcher)) {
    const request = fetchJSON('./data/ma-town-county-crosswalk.json'); crosswalkLoads.set(fetcher, request);
    request.catch(() => { if (crosswalkLoads.get(fetcher) === request) crosswalkLoads.delete(fetcher); });
  }
  if (!cache.has(year)) {
    const request = Promise.all([fetchJSON(`./data/ma-governor-history-${year}.json`), crosswalkLoads.get(fetcher)]).then(([raw, crosswalk]) => {
      if (raw.year !== year) throw new Error('Historical reference year disagrees.');
      return parseMassachusettsGovernorHistory(raw, { crosswalk });
    });
    cache.set(year, request); request.catch(() => { if (cache.get(year) === request) cache.delete(year); });
  }
  return cache.get(year);
}

function matches(current, baseline) {
  if (current?.contest !== 'governor' || current.state !== 'MA' || baseline?.state !== 'MA' || !META[baseline.year] || baseline.reference_kind !== 'official_ma_governor_town_partition' || baseline.join_verified !== true || baseline.all_valid_coverage_verified !== true || !['town', 'county', 'state'].includes(current.level) || current.level !== baseline.level || current.id !== baseline.id || current.geography_key !== current.level + ':' + current.id || current.geography_key !== baseline.geography_key) return false;
  if (baseline.nominees?.dem?.name !== META[baseline.year].dem || baseline.nominees?.rep?.name !== META[baseline.year].rep || baseline.source?.office !== 'governor' || baseline.source?.election_id !== META[baseline.year].id || baseline.source?.sha256 !== META[baseline.year].hash || baseline.valid_votes !== baseline.reported_total || !integer(baseline.blank_votes) || !integer(baseline.total_votes_cast) || baseline.reported_total + baseline.blank_votes !== baseline.total_votes_cast) return false;
  if (current.level === 'state') return current.id === 'MA' && current.county_fips == null && baseline.county_fips == null;
  if (current.level === 'county') return /^25\d{3}$/.test(current.id) && current.county_fips === current.id && baseline.county_fips === current.id;
  return /^[1-9]\d{0,2}$/.test(current.id) && Number(current.id) <= 351 && /^25\d{3}$/.test(current.county_fips || '') && current.county_fips === baseline.county_fips;
}

/** Same-party observed Governor votes / historical Governor votes, on exactly matching geography. */
export function compareMassachusettsGovernorVotes(current, baseline, { candidates = [] } = {}) {
  const emptyRatio = () => ({ status: 'unavailable', current_count: null, historical_count: null, historical_name: null, percent: null, ratio: null, vote_difference: null, share_gap_pp: null, current_share_percent: null, historical_share_percent: null });
  const output = { status: 'unavailable', ratios: { dem: emptyRatio(), rep: emptyRatio() }, current: null, historical: null,
    shift_pp: null, current_margin_pp: null, historical_margin_pp: null, current_source: current?.source || null, historical_source: baseline?.source || null };
  if (!matches(current, baseline) || !Array.isArray(candidates) || !candidates.length || candidates.length > 100 || !current.counts || !integer(baseline.reported_total) || !integer(baseline.dem_votes) || !integer(baseline.rep_votes) || baseline.dem_votes + baseline.rep_votes > baseline.reported_total) return output;
  const ids = candidates.map(row => row?.id);
  if (ids.some(id => !text(id)) || new Set(ids).size !== ids.length || Object.keys(current.counts).some(id => !ids.includes(id)) || Object.values(current.counts).some(value => value !== null && !integer(value))) return output;
  const knownSum = candidates.reduce((sum, row) => sum + (integer(current.counts[row.id]) ? current.counts[row.id] : 0), 0);
  if (integer(current.reported_total) && knownSum > current.reported_total) return output;
  const currentCount = code => {
    const rows = candidates.filter(row => party(row.party) === code);
    if (!rows.length || rows.some(row => !integer(current.counts[row.id]))) return null;
    const sum = rows.reduce((total, row) => total + current.counts[row.id], 0); return integer(sum) ? sum : null;
  };
  const dem = currentCount('DEM'), rep = currentCount('REP'), complete = current.accounting_complete === true && current.reported_total > 0 && integer(current.reported_total) && candidates.every(row => integer(current.counts[row.id])) && knownSum === current.reported_total && current.unattributed_source_votes === 0;
  const historicalShares = baseline.reported_total > 0;
  output.current = { dem_votes: dem, rep_votes: rep, reported_total: integer(current.reported_total) ? current.reported_total : null,
    dem_share: complete && dem !== null ? dem / current.reported_total : null, rep_share: complete && rep !== null ? rep / current.reported_total : null };
  output.historical = { year: baseline.year, dem_name: baseline.nominees?.dem?.name, rep_name: baseline.nominees?.rep?.name,
    dem_votes: baseline.dem_votes, rep_votes: baseline.rep_votes, reported_total: baseline.reported_total,
    dem_share: historicalShares ? baseline.dem_votes / baseline.reported_total : null, rep_share: historicalShares ? baseline.rep_votes / baseline.reported_total : null,
    blank_votes: baseline.blank_votes, total_votes_cast: baseline.total_votes_cast, all_valid_coverage_verified: true };
  for (const [key, observed, historical] of [['dem', dem, baseline.dem_votes], ['rep', rep, baseline.rep_votes]]) {
    const available = observed !== null && historical > 0, currentShare = complete && observed !== null ? 100 * observed / current.reported_total : null,
      historicalShare = historicalShares ? 100 * historical / baseline.reported_total : null;
    output.ratios[key] = { status: available ? 'available' : 'unavailable', current_count: observed, historical_count: historical,
      historical_name: baseline.nominees?.[key]?.name || null, ratio: available ? observed / historical : null,
      percent: available ? 100 * observed / historical : null, vote_difference: observed === null ? null : observed - historical,
      share_gap_pp: currentShare === null || historicalShare === null ? null : currentShare - historicalShare,
      current_share_percent: currentShare, historical_share_percent: historicalShare };
  }
  if (complete && dem !== null && rep !== null && historicalShares) {
    output.current_margin_pp = 100 * (dem - rep) / current.reported_total;
    output.historical_margin_pp = 100 * (baseline.dem_votes - baseline.rep_votes) / baseline.reported_total;
    output.shift_pp = output.current_margin_pp - output.historical_margin_pp;
  }
  output.status = Object.values(output.ratios).some(row => row.status === 'available') ? 'available' : 'unavailable';
  return output;
}
