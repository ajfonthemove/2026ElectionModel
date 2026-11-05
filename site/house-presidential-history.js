/** Publisher-reconstructed presidential counts on declared 2026 House lines. */
import { PRESIDENTIAL_NOMINEES } from './presidential-history.js';

const YEARS = new Set([2020, 2024]);
const MAX_BYTES = 512 * 1024;
const COMPARISON_BASIS = 'current_partial_reported_house_vs_historical_presidential_on_publisher_2026_lines';
const loads = new WeakMap();
// The 2022 apportionment remains the 435-seat inventory for the 2026 House.
const STATES = new Map('AL:01:7 AK:02:1 AZ:04:9 AR:05:4 CA:06:52 CO:08:8 CT:09:5 DE:10:1 FL:12:28 GA:13:14 HI:15:2 ID:16:2 IL:17:17 IN:18:9 IA:19:4 KS:20:4 KY:21:6 LA:22:6 ME:23:2 MD:24:8 MA:25:9 MI:26:13 MN:27:8 MS:28:4 MO:29:8 MT:30:2 NE:31:3 NV:32:4 NH:33:2 NJ:34:12 NM:35:3 NY:36:26 NC:37:14 ND:38:1 OH:39:15 OK:40:5 OR:41:6 PA:42:17 RI:44:2 SC:45:7 SD:46:1 TN:47:9 TX:48:38 UT:49:4 VT:50:1 VA:51:11 WA:53:10 WV:54:2 WI:55:8 WY:56:1'.split(' ').map(value => { const [state, fips, seats] = value.split(':'); return [state, { fips, seats: Number(seats) }]; }));
const EXPECTED_KEYS = new Set([...STATES].flatMap(([state, { seats }]) => Array.from({ length: seats }, (_, index) => state + '-' + (index + 1))));
const count = value => Number.isSafeInteger(value) && value >= 0;
const text = value => typeof value === 'string' && value.trim().length > 0 && value.length < 6000;
const httpURL = value => text(value) && /^https?:\/\//.test(value) && (() => { try { return Boolean(new URL(value).hostname); } catch { return false; } })();

export function parseHousePresidentialHistory(raw) {
  if (raw?.schema_version !== 'house_presidential_history_v1' || !YEARS.has(raw.year) || raw.boundary_cycle !== 2026 || raw.valid_votes !== null || raw.all_valid_coverage_verified !== false || raw.candidate_roster_complete !== false || raw.comparison_basis !== COMPARISON_BASIS || !text(raw.denominator) || !Array.isArray(raw.districts) || raw.districts.length > 435) throw new Error('Invalid bounded 2026-line House presidential reference.');
  const source = raw.provenance;
  if (!source || !text(source.name) || !httpURL(source.url) || !httpURL(source.data_url) || !/^[a-f0-9]{64}$/.test(source.sha256 || '') || !Number.isFinite(Date.parse(source.retrieved_at)) || source.source_declared_boundary_cycle !== 2026 || !text(source.source_total_definition) || !Array.isArray(source.limitations) || !source.limitations.length || source.limitations.some(value => !text(value))) throw new Error('House presidential source provenance is incomplete.');
  const coverage = raw.coverage;
  if (coverage?.expected_districts !== 435 || coverage.districts !== raw.districts.length || !Array.isArray(coverage.missing_district_keys) || coverage.missing_district_keys.length > 435 || !text(coverage.district_boundary_comparability) || coverage.geometry_vintage_independently_verified !== false) throw new Error('House presidential coverage metadata is invalid.');
  const missing = new Set();
  for (const key of coverage.missing_district_keys) {
    if (!EXPECTED_KEYS.has(key) || missing.has(key)) throw new Error('Invalid or duplicate missing House district.');
    missing.add(key);
  }
  const districts = new Map(), observedStates = new Set();
  for (const row of raw.districts) {
    const state = STATES.get(row?.state), key = row?.state + '-' + row?.district;
    if (!state || row.state_fips !== state.fips || !Number.isSafeInteger(row.district) || row.district < 1 || row.district > state.seats || row.district_key !== key || !EXPECTED_KEYS.has(key) || districts.has(key) || missing.has(key) || row.unit_kind !== 'congressional_district' || row.boundary_cycle !== 2026 || row.at_large !== (state.seats === 1) || row.source_district_id !== row.state + '-' + (row.at_large ? 'AL' : String(row.district).padStart(2, '0'))) throw new Error('House presidential district identity or boundary cycle is invalid.');
    if (!['dem_votes', 'rep_votes', 'other_votes', 'reported_total'].every(field => count(row[field])) || row.dem_votes + row.rep_votes + row.other_votes !== row.reported_total || row.valid_votes !== null || row.all_valid_coverage_verified !== false || row.candidate_roster_complete !== false) throw new Error('House presidential source counts do not reconcile.');
    observedStates.add(row.state);
    districts.set(key, Object.freeze({ ...row, year: raw.year, source_name: source.name, source_url: source.url,
      source_data_url: source.data_url, source_sha256: source.sha256, source_retrieved_at: source.retrieved_at,
      source_declared_boundary_cycle: source.source_declared_boundary_cycle,
      source_total_definition: source.source_total_definition, source_limitations: Object.freeze([...source.limitations]),
      denominator: raw.denominator, comparison_basis: raw.comparison_basis,
      boundary_comparability: coverage.district_boundary_comparability,
      geometry_vintage_independently_verified: false,
      dem_name: PRESIDENTIAL_NOMINEES[raw.year].dem.name, rep_name: PRESIDENTIAL_NOMINEES[raw.year].rep.name,
      presidential_nominees: PRESIDENTIAL_NOMINEES[raw.year],
      margin_pp: row.reported_total > 0 ? 100 * (row.dem_votes - row.rep_votes) / row.reported_total : null }));
  }
  if (districts.size + missing.size !== 435 || coverage.states !== observedStates.size || [...EXPECTED_KEYS].some(key => !districts.has(key) && !missing.has(key)) || raw.year === 2024 && (districts.size !== 435 || missing.size)) throw new Error('House presidential district partition is incomplete.');
  return Object.freeze({ year: raw.year, boundary_cycle: 2026, districts,
    coverage: Object.freeze({ ...coverage, missing_district_keys: Object.freeze([...missing]) }),
    provenance: Object.freeze({ ...source, limitations: Object.freeze([...source.limitations]) }),
    denominator: raw.denominator, comparison_basis: raw.comparison_basis,
    valid_votes: null, all_valid_coverage_verified: false, candidate_roster_complete: false });
}

/** Year-specific, bounded same-origin downloads; failures stay retryable. */
export function loadHousePresidentialHistory(year, { fetcher = globalThis.fetch } = {}) {
  if (!YEARS.has(year)) return Promise.reject(new Error('House presidential history is available for 2024 and 2020.'));
  if (typeof fetcher !== 'function') return Promise.reject(new Error('House presidential history loading is unavailable.'));
  let cache = loads.get(fetcher);
  if (!cache) { cache = new Map(); loads.set(fetcher, cache); }
  if (!cache.has(year)) {
    const request = (async () => {
      const url = new URL(`./data/house-presidential-history-${year}.json`, import.meta.url);
      const version = new URL(import.meta.url).searchParams.get('v');
      if (version) url.searchParams.set('v', version);
      const response = await fetcher(url, { credentials: 'same-origin', cache: version ? 'force-cache' : 'no-cache', redirect: 'error', headers: { Accept: 'application/json' } });
      if (!response.ok || response.redirected) throw new Error(`House presidential history returned HTTP ${response.status}.`);
      if (Number(response.headers.get('content-length')) > MAX_BYTES) throw new Error('House presidential history exceeds its size limit.');
      const body = await response.text();
      if (new TextEncoder().encode(body).byteLength > MAX_BYTES) throw new Error('House presidential history exceeds its size limit.');
      const result = parseHousePresidentialHistory(JSON.parse(body));
      if (result.year !== year) throw new Error('House presidential history year disagrees.');
      return result;
    })();
    cache.set(year, request);
    request.catch(() => { if (cache.get(year) === request) cache.delete(year); });
  }
  return cache.get(year);
}
