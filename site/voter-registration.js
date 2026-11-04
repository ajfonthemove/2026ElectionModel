/** Public aggregate registration context; no turnout, crossover or vote-choice inference. */
const STATES = new Set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' '));
const FIELDS = ['total', 'dem', 'rep', 'unaffiliated', 'other', 'unclassified'];
const PARTY_FIELDS = FIELDS.filter((field) => field !== 'total');
const MAX_BYTES = 512 * 1024;
const loads = new WeakMap();
const count = (value) => Number.isSafeInteger(value) && value >= 0;
const party = (value) => ({ D: 'DEM', DEM: 'DEM', DEMOCRAT: 'DEM', DEMOCRATIC: 'DEM', R: 'REP', REP: 'REP', GOP: 'REP', REPUBLICAN: 'REP' })[String(value || '').toUpperCase()] || String(value || '').toUpperCase();
const httpURL = (value) => typeof value === 'string' && /^https?:\/\//.test(value) && (() => { try { return Boolean(new URL(value).hostname); } catch { return false; } })();
const text = (value) => typeof value === 'string' && value.trim().length > 0 && value.length < 6000;

function snapshotDate(value) {
  if (value === null) return true;
  if (typeof value !== 'string' || !/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(value)) return false;
  const parts = value.split('-').map(Number);
  if (parts[0] < 1900 || parts[0] > 2200 || (parts.length > 1 && (parts[1] < 1 || parts[1] > 12))) return false;
  if (parts.length < 3) return true;
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  return date.getUTCFullYear() === parts[0] && date.getUTCMonth() === parts[1] - 1 && date.getUTCDate() === parts[2];
}

function registrationRow(row) {
  if (!row || !STATES.has(row.state) || !text(row.registration_status) || !text(row.definition) || ![true, false, null].includes(row.party_registration_supported ?? null)) throw new Error('Invalid registration state or definition.');
  const values = Object.fromEntries(FIELDS.map((field) => [field, row[field] ?? null]));
  if (Object.values(values).some((value) => value !== null && !count(value))) throw new Error('Registration counts must be nonnegative integers or null.');
  const supported = row.party_registration_supported ?? null;
  if (supported !== true && PARTY_FIELDS.some((field) => values[field] !== null)) throw new Error('Party registration counts require an explicitly supported state definition.');
  const hasCounts = Object.values(values).some((value) => value !== null);
  if (!snapshotDate(row.as_of ?? null) || (row.checked_at != null && (typeof row.checked_at !== 'string' || !Number.isFinite(Date.parse(row.checked_at))))) throw new Error('Invalid registration snapshot or retrieval date.');
  if (row.observation_period != null && !text(row.observation_period)) throw new Error('Invalid registration observation period.');
  if (row.report_generated_at != null && (typeof row.report_generated_at !== 'string' || row.report_generated_at.length !== 10 || !snapshotDate(row.report_generated_at))) throw new Error('Invalid registration report generation date.');
  const excludedOffices = row.excluded_offices ?? [];
  if (!Array.isArray(excludedOffices) || excludedOffices.length > 3 || excludedOffices.some((office) => !['senate', 'governor', 'house'].includes(office)) || new Set(excludedOffices).size !== excludedOffices.length || (row.office_eligibility_note != null && !text(row.office_eligibility_note))) throw new Error('Invalid registration office eligibility definition.');
  if (hasCounts && (!text(row.source_name) || !httpURL(row.source_url) || !/^[a-f0-9]{64}$/.test(row.source_sha256 || '') || !row.checked_at)) throw new Error('Known registration counts require captured source provenance.');
  if (row.source_url != null && !httpURL(row.source_url)) throw new Error('Invalid registration source URL.');
  return Object.freeze({ ...row, ...values, party_registration_supported: supported, as_of: row.as_of ?? null, observation_period: row.observation_period ?? null, report_generated_at: row.report_generated_at ?? null, checked_at: row.checked_at ?? null, unit_kind: 'state', source_name: row.source_name ?? null, source_url: row.source_url ?? null, source_sha256: row.source_sha256 ?? null, latest_checked: row.latest_checked === true, excluded_offices: Object.freeze([...excludedOffices]), office_eligibility_note: row.office_eligibility_note ?? null, party_counts_inferred: false });
}

/** Preserve each source's population, categories and dates without filling residuals. */
export function parseVoterRegistration(raw) {
  if (raw?.schema_version !== 'voter_registration_v1' || !Array.isArray(raw.states) || raw.states.length !== STATES.size) throw new Error('Registration dataset must contain all 50 states and DC.');
  const states = new Map();
  for (const item of raw.states) {
    const row = registrationRow(item);
    if (states.has(row.state)) throw new Error('Duplicate registration state.');
    states.set(row.state, row);
  }
  if (raw.coverage?.states != null && raw.coverage.states !== states.size) throw new Error('Registration coverage metadata disagrees.');
  return Object.freeze({ ...raw, states, coverage: { ...raw.coverage, states: states.size }, party_counts_inferred: false });
}

/** One bounded same-origin artifact per release; failed loads can be retried. */
export function loadVoterRegistration({ fetcher = globalThis.fetch } = {}) {
  if (typeof fetcher !== 'function') return Promise.reject(new Error('Registration loading is unavailable.'));
  if (!loads.has(fetcher)) {
    const request = (async () => {
      const url = new URL('./data/voter-registration.json', import.meta.url);
      const version = new URL(import.meta.url).searchParams.get('v');
      if (version) url.searchParams.set('v', version);
      const response = await fetcher(url, { credentials: 'same-origin', cache: version ? 'force-cache' : 'no-cache', redirect: 'error', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`Registration reference returned HTTP ${response.status}.`);
      const length = Number(response.headers.get('content-length'));
      if (Number.isFinite(length) && length > MAX_BYTES) throw new Error('Registration reference exceeds its size limit.');
      const body = await response.text();
      if (new TextEncoder().encode(body).byteLength > MAX_BYTES) throw new Error('Registration reference exceeds its size limit.');
      return parseVoterRegistration(JSON.parse(body));
    })();
    loads.set(fetcher, request);
    request.catch(() => { if (loads.get(fetcher) === request) loads.delete(fetcher); });
  }
  return loads.get(fetcher);
}

function observedPartyCount(current, requestedParty) {
  if (current?.votes_released === false || !Array.isArray(current?.candidates)) return null;
  const candidates = current.candidates.filter((candidate) => party(candidate?.party) === requestedParty);
  if (!candidates.length || candidates.some((candidate) => !count(candidate.votes))) return null;
  const total = candidates.reduce((sum, candidate) => sum + candidate.votes, 0);
  return count(total) ? total : null;
}

function geographyReason(current, registration, office, geography) {
  if (!registration || !current || !STATES.has(current.state) || current.state !== registration.state) return 'The current race and registration reference must be from the same state.';
  if (office === 'house' || current.office === 'house' || /^2026-HG-/.test(current.race_id || '') || current.district != null) return 'State registration counts are context only for a House district; no whole-state denominator is applied.';
  const kind = current.reporting_unit_kind ?? current.geographic_unit_kind ?? current.unit_kind ?? current.geography_type;
  if (geography !== 'state' || current.county_fips != null || current.reporting_unit_id != null || (kind != null && kind !== 'state')) return 'State registration counts are context only for a county or local reporting unit.';
  if (!['senate', 'governor'].includes(office)) return 'A whole-state Senate or governor race is required for the registration count comparison.';
  return null;
}

/**
 * Separate party-count benchmarks: current counted candidate votes / registrations.
 * Signed differences are current votes minus registered voters in that party.
 * Different populations are shown descriptively, without assigning voter choices.
 */
export function compareRegistrationVotes(current, registration, { office = current?.office, geography = 'state' } = {}) {
  const dem = observedPartyCount(current, 'DEM'), rep = observedPartyCount(current, 'REP');
  const rows = Array.isArray(current?.candidates) ? current.candidates : [];
  const currentTotal = count(current?.reported_total) ? current.reported_total : null;
  const knownSum = rows.reduce((sum, row) => sum + (count(row?.votes) ? row.votes : 0), 0);
  const sourceCountsComplete = rows.length > 0 && rows.every((row) => count(row?.votes));
  const invalidSourceCount = rows.some((row) => row?.votes != null && !count(row.votes));
  const seen = new Set();
  const duplicateIdentity = rows.some((row) => { if (row?.candidate_id == null) return false; const key = String(row.candidate_id); if (seen.has(key)) return true; seen.add(key); return false; });
  const sourceConflict = currentTotal !== null && knownSum > currentTotal;
  const scopeReason = geographyReason(current, registration, office, geography);
  const eligibilityReason = registration?.excluded_offices?.includes(office) ? registration.office_eligibility_note || 'The registration reference includes voters who are not eligible for this office; counts are statewide context only.' : null;
  const referenceReason = registration?.accounting_status === 'conflict' ? 'The source registration counts have conflicting accounting; raw counts are statewide context only.' : registration?.comparison_supported === false ? 'The source registration population has not been verified for this comparison; raw counts are statewide context only.' : null;
  const accountingReason = invalidSourceCount ? 'The current source has invalid candidate counts.' : duplicateIdentity ? 'Duplicate source candidate identities make the observed count ambiguous.' : sourceConflict ? 'Known candidate counts exceed the published reported total.' : null;
  const definitionReason = registration?.party_registration_supported === true ? null : registration?.party_registration_supported === false ? 'This state does not publish party registration under this definition; party counts are unavailable.' : 'Party registration coverage has not been verified for this state.';
  const sourceAttributionIncomplete = !sourceCountsComplete || currentTotal === null || knownSum !== currentTotal || current?.unattributed_source_votes !== 0 || current?.vote_counts_complete === false || current?.accounting_status === 'partial_candidate_counts';
  function ratio(code, numerator) {
    const denominator = count(registration?.[code]) ? registration[code] : null;
    const reason = scopeReason || eligibilityReason || referenceReason || accountingReason || definitionReason || (numerator === null ? 'The source does not provide every current candidate count for this party.' : denominator === null ? 'A verified registration count for this party is unavailable.' : denominator === 0 ? 'The party registration count is zero; division is undefined.' : null);
    const difference = reason ? null : numerator - denominator, value = reason ? null : numerator / denominator;
    return { status: reason ? 'unavailable' : 'available', reason, current_count: numerator, registration_count: denominator, registered_count: denominator, ratio: value, percent: value === null ? null : 100 * value, percentage: value === null ? null : 100 * value, difference, difference_votes: difference, unassigned_votes_allocated: false };
  }
  const ratios = { dem: ratio('dem', dem), rep: ratio('rep', rep) };
  const available = Object.values(ratios).some((row) => row.status === 'available');
  return {
    status: available ? 'available' : 'unavailable',
    reason: available ? null : scopeReason || eligibilityReason || referenceReason || accountingReason || definitionReason || 'No party has a known current count and a positive registration denominator.',
    current: { dem_votes: dem, rep_votes: rep, reported_total: currentTotal, source_updated_at: current?.source_updated_at ?? null, checked_at: current?.checked_at ?? null, source_name: current?.source_name ?? null, source_url: current?.source_url ?? null },
    registration: registration || null, ratios,
    state_reference_only: Boolean(scopeReason || eligibilityReason || referenceReason),
    data_quality: { geography_match_supported: !scopeReason, office_eligibility_supported: !eligibilityReason, registration_comparison_supported: !referenceReason, registration_accounting_status: registration?.accounting_status ?? null, source_attribution_incomplete: sourceAttributionIncomplete, known_counts_exceed_source_total: sourceConflict, duplicate_candidate_identity: duplicateIdentity, invalid_source_count: invalidSourceCount, registration_snapshot_date_known: registration?.as_of != null, registration_observation_period: registration?.observation_period ?? null, registration_report_generated_at: registration?.report_generated_at ?? null, unassigned_votes_allocated: false, party_counts_inferred: false },
    comparison_basis: 'current_observed_party_votes_divided_by_state_party_registrations',
    difference_definition: 'Current counted candidate votes minus registrations in the corresponding party.',
    note: 'Party registration is a reference population, not a statement of how registered voters voted. Current results may be partial; these count ratios are not turnout, counting completion, crossover estimates or a forecast.',
  };
}
