/** Descriptive presidential reference counts. No forecasts, district allocations or race calls. */
const YEARS = new Set([2020, 2024]);
const MAX_BYTES = 2 * 1024 * 1024;
const loads = new WeakMap();
const count = (value) => Number.isSafeInteger(value) && value >= 0;
const party = (value) => ({ D: 'DEM', DEM: 'DEM', DEMOCRAT: 'DEM', DEMOCRATIC: 'DEM', R: 'REP', REP: 'REP', GOP: 'REP', REPUBLICAN: 'REP' })[String(value || '').toUpperCase()] || String(value || '').toUpperCase();
const COUNTY_KINDS = new Set(['county', 'county_equivalent', 'independent_city', 'planning_region']);

function referenceRow(row, raw, geography) {
  if (!row || !/^[A-Z]{2}$/.test(row.state) || !/^\d{2}$/.test(row.state_fips) || typeof row.name !== 'string' || !row.name || !['dem_votes', 'rep_votes', 'other_votes', 'reported_total'].every((key) => count(row[key])) || row.dem_votes + row.rep_votes + row.other_votes !== row.reported_total) throw new Error('Invalid historical vote accounting.');
  if (geography === 'state' ? row.unit_kind !== 'state' : !/^\d{5}$/.test(row.county_fips) || !row.county_fips.startsWith(row.state_fips) || !COUNTY_KINDS.has(row.unit_kind) || ['AK', 'DC'].includes(row.state)) throw new Error('Invalid historical comparison geography.');
  const source = raw.provenance[geography === 'state' ? 'states' : 'counties'];
  return Object.freeze({ ...row, year: raw.year, valid_votes: null, all_valid_coverage_verified: false, candidate_roster_complete: false, source_name: source.name, source_url: source.url, source_retrieved_at: source.retrieved_at, denominator: raw.denominator, comparison_basis: raw.comparison_basis, boundary_comparability: geography === 'state' ? 'same statewide geography' : 'exact identifier only; no boundary crosswalk', margin_pp: row.reported_total > 0 ? 100 * (row.dem_votes - row.rep_votes) / row.reported_total : null, two_party_margin_pp: row.dem_votes + row.rep_votes > 0 ? 100 * (row.dem_votes - row.rep_votes) / (row.dem_votes + row.rep_votes) : null });
}

export function parsePresidentialHistory(raw) {
  if (raw?.schema_version !== 'presidential_history_v1' || !YEARS.has(raw.year) || raw.all_valid_coverage_verified !== false || raw.valid_votes !== null || raw.candidate_roster_complete !== false || raw.comparison_basis !== 'current_partial_reported_vs_historical_reported' || !raw.provenance?.states?.url || !raw.provenance?.counties?.url || !Array.isArray(raw.states) || raw.states.length !== 51 || !Array.isArray(raw.counties) || raw.counties.length < 1 || raw.counties.length > 3200) throw new Error('Invalid bounded presidential reference dataset.');
  const states = new Map(), counties = new Map();
  for (const item of raw.states) {
    const row = referenceRow(item, raw, 'state');
    if (states.has(row.state)) throw new Error('Duplicate historical state.');
    states.set(row.state, row);
  }
  for (const item of raw.counties) {
    const row = referenceRow(item, raw, 'county');
    if (!states.has(row.state) || states.get(row.state).state_fips !== row.state_fips || counties.has(row.county_fips)) throw new Error('Duplicate or mismatched historical county.');
    counties.set(row.county_fips, row);
  }
  if (raw.coverage?.states !== states.size || raw.coverage?.county_rows !== counties.size) throw new Error('Historical coverage metadata disagrees.');
  return Object.freeze({ year: raw.year, states, counties, provenance: raw.provenance, coverage: raw.coverage, denominator: raw.denominator, comparison_basis: raw.comparison_basis, all_valid_coverage_verified: false, valid_votes: null });
}

/** Static same-origin files are loaded only when requested; failed requests remain retryable. */
export function loadPresidentialHistory(year, { fetcher = globalThis.fetch } = {}) {
  if (!YEARS.has(year)) return Promise.reject(new Error('Presidential history is available for 2024 and 2020.'));
  if (typeof fetcher !== 'function') return Promise.reject(new Error('Historical reference loading is unavailable.'));
  let cache = loads.get(fetcher);
  if (!cache) { cache = new Map();loads.set(fetcher, cache); }
  if (!cache.has(year)) {
    const request = (async () => {
      const url = new URL(`./data/presidential-history-${year}.json`, import.meta.url);
      const version = new URL(import.meta.url).searchParams.get('v');
      if (version) url.searchParams.set('v', version);
      const response = await fetcher(url, { credentials: 'same-origin', cache: version ? 'force-cache' : 'no-cache', redirect: 'error', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`Historical reference returned HTTP ${response.status}.`);
      const length = Number(response.headers.get('content-length'));
      if (Number.isFinite(length) && length > MAX_BYTES) throw new Error('Historical reference exceeds its size limit.');
      const body = await response.text();
      if (body.length > MAX_BYTES) throw new Error('Historical reference exceeds its size limit.');
      const result = parsePresidentialHistory(JSON.parse(body));
      if (result.year !== year) throw new Error('Historical reference year disagrees.');
      return result;
    })();
    cache.set(year, request);
    request.catch(() => { if (cache.get(year) === request) cache.delete(year); });
  }
  return cache.get(year);
}

/** Current reported-vote margin minus an archived presidential reported-vote margin. */
export function comparePresidentialMargin(current, baseline, { office = current?.office, geography = 'state' } = {}) {
  const unavailable = (reason) => ({ status: 'unavailable', reason, label: 'Presidential comparison unavailable', shift_pp: null, current_margin_pp: null, historical_margin_pp: null });
  if (office === 'house' || /^2026-HG-/.test(current?.race_id || '') || current?.district != null) return unavailable('House districts require a matching historical district boundary; county and statewide votes are not allocated.');
  if (!['governor', 'senate'].includes(office)) return unavailable('A supported statewide office is required.');
  if (!['state', 'county'].includes(geography) || !current || !baseline || !YEARS.has(baseline.year)) return unavailable('No matching historical geography is available.');
  if (!current.state || current.state !== baseline.state) return unavailable('State geography does not match the historical reference.');
  if (geography === 'county') {
    const kind = current.reporting_unit_kind ?? current.geographic_unit_kind ?? current.unit_kind;
    if (!/^\d{5}$/.test(current.county_fips || '') || current.county_fips !== baseline.county_fips || ['AK', 'DC'].includes(current.state) || !COUNTY_KINDS.has(baseline.unit_kind) || (kind != null && !COUNTY_KINDS.has(kind)) || (current.reporting_unit_id != null && current.reporting_unit_id !== current.county_fips)) return unavailable('A matching verified county identifier is required; election districts and municipalities are excluded.');
  } else if (baseline.unit_kind !== 'state' || current.county_fips != null || current.reporting_unit_id != null) return unavailable('A whole-state result is required for the statewide comparison.');
  if (!count(current.reported_total) || current.reported_total === 0 || current.vote_counts_complete === false || current.accounting_status === 'partial_candidate_counts' || current.unattributed_source_votes !== 0 || !Array.isArray(current.candidates) || !current.candidates.length || current.candidates.some((c) => !count(c.votes))) return unavailable('Complete attributed reported candidate counts are required for a margin comparison.');
  let dem = 0, rep = 0, total = 0, hasDem = false, hasRep = false;
  for (const candidate of current.candidates) {
    total += candidate.votes;
    if (party(candidate.party) === 'DEM') { dem += candidate.votes;hasDem = true; }
    if (party(candidate.party) === 'REP') { rep += candidate.votes;hasRep = true; }
  }
  if (!hasDem || !hasRep) return unavailable('Both Democratic and Republican nominees are required for a D-minus-R comparison.');
  if (total !== current.reported_total || (current.candidate_attributed_total != null && current.candidate_attributed_total !== total)) return unavailable('Candidate counts do not reconcile to the published reported total.');
  if (!count(baseline.reported_total) || baseline.reported_total === 0 || !count(baseline.dem_votes) || !count(baseline.rep_votes) || baseline.dem_votes + baseline.rep_votes > baseline.reported_total) return unavailable('Historical reported counts are unavailable.');
  const currentMargin = 100 * (dem - rep) / current.reported_total;
  const historicalMargin = 100 * (baseline.dem_votes - baseline.rep_votes) / baseline.reported_total;
  return { status: 'available', reason: null, shift_pp: currentMargin - historicalMargin, current_margin_pp: currentMargin, historical_margin_pp: historicalMargin, year: baseline.year, label: `Reported margin vs ${baseline.year} president`, comparison_basis: 'current_partial_reported_vs_historical_reported', denominator: 'Published reported vote total, including nonmajor/unassigned residual; not two-party normalized.', note: 'Current partial results versus archived reported presidential results. Offices have different electorates; this is a descriptive comparison, not a forecast.', all_valid_coverage_verified: false, source_name: baseline.source_name, source_url: baseline.source_url, boundary_comparability: baseline.boundary_comparability };
}
