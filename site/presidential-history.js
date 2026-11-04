/** Descriptive presidential reference counts. No forecasts, district allocations or race calls. */
const YEARS = new Set([2020, 2024]);
const MAX_BYTES = 2 * 1024 * 1024;
const loads = new WeakMap();
const count = (value) => Number.isSafeInteger(value) && value >= 0;
const party = (value) => ({ D: 'DEM', DEM: 'DEM', DEMOCRAT: 'DEM', DEMOCRATIC: 'DEM', R: 'REP', REP: 'REP', GOP: 'REP', REPUBLICAN: 'REP' })[String(value || '').toUpperCase()] || String(value || '').toUpperCase();
const COUNTY_KINDS = new Set(['county', 'county_equivalent', 'independent_city', 'planning_region']);

// Exact nominee identities are present in all 51 statewide rows of each pinned
// CNN snapshot. County count sources remain separately attributed; no source
// totals or original static-data bytes are changed by these identity labels.
export const PRESIDENTIAL_NOMINEES = Object.freeze({
  2024: Object.freeze({
    dem: Object.freeze({ name: 'Kamala Harris', label: 'Harris', party: 'DEM', candidate_id: '64984' }),
    rep: Object.freeze({ name: 'Donald Trump', label: 'Trump', party: 'REP', candidate_id: '8639' }),
    source_name: 'CNN', source_url: 'https://politics.api.cnn.io/results/national-races/2024-PG.json',
    source_sha256: '9c60fa4300c06fe854389ccc872307f94f282ffd828807923f179f92e581949c',
  }),
  2020: Object.freeze({
    dem: Object.freeze({ name: 'Joe Biden', label: 'Biden', party: 'DEM', candidate_id: '1036' }),
    rep: Object.freeze({ name: 'Donald Trump', label: 'Trump', party: 'REP', candidate_id: '8639' }),
    source_name: 'CNN', source_url: 'https://politics.api.cnn.io/results/national-races/2020-PG.json',
    source_sha256: '604653a52578c4a5f85d36037cb9e32f8c2db6387f03fffe5623577e545311ef',
  }),
});

function referenceRow(row, raw, geography) {
  if (!row || !/^[A-Z]{2}$/.test(row.state) || !/^\d{2}$/.test(row.state_fips) || typeof row.name !== 'string' || !row.name || !['dem_votes', 'rep_votes', 'other_votes', 'reported_total'].every((key) => count(row[key])) || row.dem_votes + row.rep_votes + row.other_votes !== row.reported_total) throw new Error('Invalid historical vote accounting.');
  if (geography === 'state' ? row.unit_kind !== 'state' : !/^\d{5}$/.test(row.county_fips) || !row.county_fips.startsWith(row.state_fips) || !COUNTY_KINDS.has(row.unit_kind) || ['AK', 'DC'].includes(row.state)) throw new Error('Invalid historical comparison geography.');
  const source = raw.provenance[geography === 'state' ? 'states' : 'counties'];
  return Object.freeze({ ...row, year: raw.year, valid_votes: null, all_valid_coverage_verified: false, candidate_roster_complete: false, source_name: source.name, source_url: source.url, source_retrieved_at: source.retrieved_at, dem_name: PRESIDENTIAL_NOMINEES[raw.year].dem.name, rep_name: PRESIDENTIAL_NOMINEES[raw.year].rep.name, presidential_nominees: PRESIDENTIAL_NOMINEES[raw.year], denominator: raw.denominator, comparison_basis: raw.comparison_basis, boundary_comparability: geography === 'state' ? 'same statewide geography' : 'exact identifier only; no boundary crosswalk', margin_pp: row.reported_total > 0 ? 100 * (row.dem_votes - row.rep_votes) / row.reported_total : null, two_party_margin_pp: row.dem_votes + row.rep_votes > 0 ? 100 * (row.dem_votes - row.rep_votes) / (row.dem_votes + row.rep_votes) : null });
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

function comparisonGeographyReason(current, baseline, office, geography) {
  if (office === 'house' || /^2026-HG-/.test(current?.race_id || '') || current?.district != null) return 'House districts require a matching historical district boundary; county and statewide votes are not allocated.';
  if (!['governor', 'senate'].includes(office)) return 'A supported statewide office is required.';
  if (!['state', 'county'].includes(geography) || !current || !baseline || !YEARS.has(baseline.year)) return 'No matching historical geography is available.';
  if (!current.state || current.state !== baseline.state) return 'State geography does not match the historical reference.';
  const kind = current.reporting_unit_kind ?? current.geographic_unit_kind ?? current.unit_kind ?? current.geography_type;
  if (geography === 'county') {
    if (!/^\d{5}$/.test(current.county_fips || '') || current.county_fips !== baseline.county_fips || ['AK', 'DC'].includes(current.state) || !COUNTY_KINDS.has(baseline.unit_kind) || (kind != null && !COUNTY_KINDS.has(kind)) || current.geographic_join_supported === false || (current.reporting_unit_id != null && current.reporting_unit_id !== current.county_fips)) return 'A matching verified county identifier is required; election districts, district portions and municipalities are excluded.';
  } else if (baseline.unit_kind !== 'state' || current.county_fips != null || current.reporting_unit_id != null || (kind != null && kind !== 'state')) return 'A whole-state result is required for the statewide comparison.';
  return null;
}

/** Current reported-vote margin minus an archived presidential reported-vote margin. */
export function comparePresidentialMargin(current, baseline, { office = current?.office, geography = 'state' } = {}) {
  const unavailable = (reason) => ({ status: 'unavailable', reason, label: 'Presidential comparison unavailable', shift_pp: null, current_margin_pp: null, historical_margin_pp: null });
  const geographyReason = comparisonGeographyReason(current, baseline, office, geography);
  if (geographyReason) return unavailable(geographyReason);
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


function observedPartyCount(current, requestedParty) {
  if (current?.votes_released === false || !Array.isArray(current?.candidates)) return null;
  const candidates = current.candidates.filter((candidate) => party(candidate?.party) === requestedParty);
  if (!candidates.length || candidates.some((candidate) => !count(candidate.votes))) return null;
  const total = candidates.reduce((sum, candidate) => sum + candidate.votes, 0);
  return count(total) ? total : null;
}

/**
 * Observed party-count ratios, independently available for each known numerator.
 * A ratio is current counted votes / historical presidential votes of that party.
 * It may exceed 100%; no unassigned votes, remaining votes or turnout are inferred.
 * Shares and margins remain secondary and require reconciled full attribution.
 */
export function comparePresidentialVotes(current, baseline, { office = current?.office, geography = 'state' } = {}) {
  const dem = observedPartyCount(current, 'DEM'), rep = observedPartyCount(current, 'REP');
  const historicalDem = count(baseline?.dem_votes) ? baseline.dem_votes : null;
  const historicalRep = count(baseline?.rep_votes) ? baseline.rep_votes : null;
  const historicalTotal = count(baseline?.reported_total) ? baseline.reported_total : null;
  const currentTotal = count(current?.reported_total) ? current.reported_total : null;
  const nominees = PRESIDENTIAL_NOMINEES[baseline?.year] || null;
  const rows = Array.isArray(current?.candidates) ? current.candidates : [];
  const sourceCandidateCountsComplete = rows.length > 0 && rows.every((row) => count(row?.votes));
  const knownSum = rows.reduce((sum, row) => sum + (count(row?.votes) ? row.votes : 0), 0);
  const sourceResidual = count(current?.unattributed_source_votes) ? current.unattributed_source_votes : null;
  const sourceTotalsReconciled = sourceCandidateCountsComplete && currentTotal !== null && knownSum === currentTotal && sourceResidual === 0 && current?.vote_counts_complete !== false && current?.accounting_status !== 'partial_candidate_counts' && (current?.candidate_attributed_total == null || current.candidate_attributed_total === knownSum);
  const geographyReason = comparisonGeographyReason(current, baseline, office, geography);
  const sourceConflict = currentTotal !== null && knownSum > currentTotal;
  const seenIds = new Set();
  const duplicateCandidateIdentity = rows.some((row) => {
    if (row?.candidate_id == null) return false;
    if (seenIds.has(row.candidate_id)) return true;
    seenIds.add(row.candidate_id);return false;
  });
  const accountingReason = sourceConflict ? 'Known candidate counts exceed the published reported total.' : duplicateCandidateIdentity ? 'Duplicate source candidate identifiers make the observed count ambiguous.' : null;
  const unavailableReason = geographyReason || accountingReason;
  const margin = comparePresidentialMargin(current, baseline, { office, geography });
  const sharesAvailable = margin.status === 'available';
  const historicalSharesAvailable = !geographyReason && historicalTotal > 0 && historicalDem !== null && historicalRep !== null && historicalDem + historicalRep <= historicalTotal;
  const quality = {
    geography_match_supported: !geographyReason,
    current_party_counts_known: { dem: dem !== null, rep: rep !== null },
    source_candidate_counts_complete: sourceCandidateCountsComplete,
    source_totals_reconciled: sourceTotalsReconciled,
    source_attribution_incomplete: !sourceTotalsReconciled,
    unattributed_source_votes: sourceResidual,
    unassigned_votes_allocated: false,
    historical_all_valid_coverage_verified: baseline?.all_valid_coverage_verified === true,
    historical_candidate_roster_complete: baseline?.candidate_roster_complete === true,
    historical_boundary_comparability: baseline?.boundary_comparability || null,
    known_counts_exceed_source_total: sourceConflict,
    duplicate_candidate_identity: duplicateCandidateIdentity,
    numerator_is_observed_count: true,
  };
  function ratio(currentCount, historicalCount, name) {
    const reason = unavailableReason || (currentCount === null ? 'The current source does not provide every count for this party.' : historicalCount === null ? 'Historical presidential votes for this party are unavailable.' : historicalCount === 0 ? 'The historical presidential vote count is zero; division is undefined.' : null);
    const value = reason ? null : currentCount / historicalCount;
    return { status: reason ? 'unavailable' : 'available', reason, current_count: currentCount, historical_count: geographyReason ? null : historicalCount, historical_name: name, ratio: value, percent: value === null ? null : 100 * value, percentage: value === null ? null : 100 * value, attribution_status: currentCount === null ? 'unknown_party_count' : 'explicit_observed_party_counts', is_lower_bound: false, source_attribution_incomplete: !sourceTotalsReconciled, unassigned_votes_allocated: false };
  }
  const ratios = { dem: ratio(dem, historicalDem, nominees?.dem.name || null), rep: ratio(rep, historicalRep, nominees?.rep.name || null) };
  const anyAvailable = Object.values(ratios).some((row) => row.status === 'available');
  return {
    status: anyAvailable ? 'available' : 'unavailable',
    reason: anyAvailable ? null : unavailableReason || 'No party has both a known current count and a positive historical denominator.',
    partial: Object.values(ratios).some((row) => row.status !== 'available'),
    label: `Counted votes / ${baseline?.year || 'historical'} presidential votes`,
    comparison_basis: 'current_observed_party_count_divided_by_historical_presidential_party_count',
    current: { dem_votes: dem, rep_votes: rep, reported_total: currentTotal, dem_share: sharesAvailable ? dem / currentTotal : null, rep_share: sharesAvailable ? rep / currentTotal : null, margin_pp: sharesAvailable ? margin.current_margin_pp : null, source_name: current?.source_name || null, source_url: current?.source_url || null },
    historical: { year: baseline?.year ?? null, dem_name: nominees?.dem.name || null, rep_name: nominees?.rep.name || null, dem_label: nominees?.dem.label || null, rep_label: nominees?.rep.label || null, dem_votes: geographyReason ? null : historicalDem, rep_votes: geographyReason ? null : historicalRep, reported_total: geographyReason ? null : historicalTotal, dem_share: historicalSharesAvailable ? historicalDem / historicalTotal : null, rep_share: historicalSharesAvailable ? historicalRep / historicalTotal : null, margin_pp: historicalSharesAvailable ? 100 * (historicalDem - historicalRep) / historicalTotal : null, source_name: baseline?.source_name || null, source_url: baseline?.source_url || null, nominee_identity_source: nominees },
    ratios, data_quality: quality,
    shift_pp: sharesAvailable ? margin.shift_pp : null,
    current_margin_pp: sharesAvailable ? margin.current_margin_pp : null,
    historical_margin_pp: sharesAvailable ? margin.historical_margin_pp : null,
    attribution_note: sourceTotalsReconciled ? 'Explicit counted party votes; source candidate counts reconcile to the reported total.' : 'Ratios use only explicitly attributed party counts. Unassigned or missing votes are not allocated; source attribution is incomplete.',
    note: 'Current counted votes divided by archived presidential votes for the same party and geography. Different offices have different electorates. This is not a percentage of presidential voters, an estimate of completion or remaining votes, or a forecast.',
  };
}

// The UI uses this pure display projection; both names share the same contract.
export const presidentialComparisonDisplay = comparePresidentialVotes;
