import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseVoterRegistration, loadVoterRegistration, compareRegistrationVotes } from './voter-registration.js';

const CODES = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');
const row = (extra = {}) => ({ state: 'NC', registration_status: 'available', as_of: '2026-10-31', checked_at: '2026-11-04T00:00:00Z', total: 1000, dem: 200, rep: 400, unaffiliated: 350, other: 50, unclassified: null, definition: 'Active registered voters by recorded party affiliation.', party_registration_supported: true, source_name: 'Test official source', source_url: 'https://elections.example/registration', source_sha256: 'a'.repeat(64), latest_checked: true, ...extra });
const dataset = () => ({ schema_version: 'voter_registration_v1', coverage: { states: 51 }, states: CODES.map((state) => row({ state })) });
const current = (extra = {}) => ({ state: 'NC', office: 'senate', reported_total: 1000, unattributed_source_votes: 0, candidates: [{ candidate_id: 'D1', party: 'DEM', votes: 160 }, { candidate_id: 'R1', party: 'REP', votes: 200 }, { candidate_id: 'I1', party: 'IND', votes: 640 }], source_updated_at: '2026-11-04T01:00:00Z', ...extra });

test('uploaded Montana county statuses conserve the explicit statewide total without inventing dates or party enrollment', async () => {
  const raw = JSON.parse(await readFile(new URL('./data/voter-registration.json', import.meta.url), 'utf8'));
  const registration = parseVoterRegistration(raw).states.get('MT');
  const countyBytes = await readFile(new URL('./data/voter-registration-mt-counties.json', import.meta.url));
  const countyData = JSON.parse(countyBytes);
  const workbook = await readFile(new URL('./data/registration-mt-county-data.xlsx', import.meta.url));
  const official = await readFile(new URL('./data/registration-mt-official-counties.csv', import.meta.url));
  assert.equal(registration.uploaded_workbook_sha256, createHash('sha256').update(workbook).digest('hex'));
  assert.equal(registration.source_sha256, createHash('sha256').update(official).digest('hex'));
  assert.equal(registration.source_url, 'https://sosmt.gov/elections/regvotercounty/');
  assert.equal(registration.county_reference_sha256, createHash('sha256').update(countyBytes).digest('hex'));
  assert.equal(countyData.counties.length, 56);
  assert.equal(new Set(countyData.counties.map((county) => county.county_fips)).size, 56);
  assert(countyData.counties.every((county) => /^30\d{3}$/.test(county.county_fips)));
  assert.deepEqual(countyData.grand_total, { active: 687663, inactive: 121026, provisional: 199, total: 808888 });
  for (const field of ['active', 'inactive', 'provisional', 'total']) {
    assert.equal(countyData.counties.reduce((sum, county) => sum + (county[field] ?? 0), 0), countyData.grand_total[field]);
  }
  assert(countyData.counties.some((county) => county.provisional_source_cell_blank && county.provisional === null));
  assert.equal(registration.total, 808888);
  assert.equal(registration.active_total + registration.inactive_total + registration.provisional_total, registration.total);
  assert.equal(registration.source_tier, 'official');
  assert.equal(registration.as_of, '2026-11-05'); assert.equal(registration.report_generated_at, null); assert.equal(registration.latest_checked, false);
  assert.equal(registration.snapshot_time_local, '05:00'); assert.equal(registration.snapshot_time_approximate, true);
  assert.equal(registration.snapshot_time_source, 'user_clarification'); assert.equal(registration.snapshot_time_zone, null);
  assert.equal(countyData.as_of, registration.as_of); assert.equal(countyData.report_generated_at, null);
  assert.equal(countyData.source.date_in_workbook, false); assert.equal(countyData.source.snapshot_time_source, 'user_clarification');
  for (const field of ['dem', 'rep', 'unaffiliated', 'other', 'unclassified']) assert.equal(registration[field], null);
  const result = compareRegistrationVotes(current({ state: 'MT' }), registration);
  assert.equal(result.registration.total, 808888);
  assert.equal(result.ratios.dem.percent, null); assert.equal(result.ratios.rep.percent, null);
});

test('state rows preserve counts, snapshot definitions, unknown categories and actual source vintages', () => {
  const raw = dataset(); raw.states.find((item) => item.state === 'NC').unclassified = null;
  const parsed = parseVoterRegistration(raw), nc = parsed.states.get('NC');
  assert.equal(parsed.states.size, 51); assert.equal(nc.dem, 200); assert.equal(nc.unclassified, null);
  assert.equal(nc.as_of, '2026-10-31'); assert.equal(nc.checked_at, '2026-11-04T00:00:00Z'); assert.equal(nc.definition, row().definition);
  assert.equal(nc.party_counts_inferred, false); assert.equal(nc.latest_checked, true); assert.ok(Object.isFrozen(nc));
});

test('no-party registration and North Dakota remain null, never zero or all-unaffiliated', () => {
  const raw = dataset();
  for (const code of ['MI', 'ND']) raw.states[raw.states.findIndex((item) => item.state === code)] = row({ state: code, party_registration_supported: false, registration_status: code === 'ND' ? 'not_required' : 'no_party_registration', total: code === 'ND' ? null : 1000, dem: null, rep: null, unaffiliated: null, other: null });
  const data = parseVoterRegistration(raw);
  assert.equal(data.states.get('ND').total, null); assert.equal(data.states.get('MI').unaffiliated, null);
  assert.equal(data.states.get('MI').total, 1000);
  const result = compareRegistrationVotes(current({ state: 'MI' }), data.states.get('MI'));
  assert.equal(result.ratios.dem.percent, null); assert.equal(result.ratios.rep.difference, null);
  assert.equal(result.registration.total, 1000);
});

test('malformed counts, missing capture evidence, duplicate states and false party coverage reject', () => {
  for (const mutate of [d => d.states[0].dem = -1, d => d.states[0].rep = 1.5, d => d.states[0].source_sha256 = null, d => d.states[0].source_url = 'javascript:alert(1)', d => d.states[0].as_of = '2026-02-30', d => d.states[0].definition = '', d => d.states[0].party_registration_supported = false, d => d.states[0].state = d.states[1].state, d => d.states.pop(), d => d.coverage.states = 50]) {
    const raw = dataset(); mutate(raw); assert.throws(() => parseVoterRegistration(raw));
  }
});

test('source-defined categories are never reconciled by inventing a residual', () => {
  const raw = dataset(); const nc = raw.states.find((item) => item.state === 'NC'); nc.unaffiliated = null; nc.other = null; delete nc.unclassified;
  const parsed = parseVoterRegistration(raw).states.get('NC');
  assert.equal(parsed.total, 1000); assert.equal(parsed.dem, 200); assert.equal(parsed.rep, 400);
  assert.equal(parsed.unaffiliated, null); assert.equal(parsed.other, null); assert.equal(parsed.unclassified, null);
});

test('independent party percentages and raw signed differences use registration counts rather than vote shares', () => {
  const result = compareRegistrationVotes(current(), row());
  assert.equal(result.status, 'available'); assert.equal(result.ratios.dem.percent, 80); assert.equal(result.ratios.rep.percent, 50);
  assert.equal(result.ratios.dem.difference, -40); assert.equal(result.ratios.rep.difference_votes, -200);
  assert.equal(result.ratios.dem.registration_count, 200); assert.equal(result.current.reported_total, 1000);
  assert.equal(result.current.source_updated_at, '2026-11-04T01:00:00Z'); assert.equal(result.registration.as_of, '2026-10-31');
  assert.match(result.note, /not a statement of how registered voters voted/);
});

test('ratios above 100 percent and positive differences remain uncapped; explicit current zero stays zero', () => {
  const result = compareRegistrationVotes(current({ candidates: [{ party: 'DEM', votes: 300 }, { party: 'REP', votes: 0 }, { party: 'IND', votes: 700 }] }), row());
  assert.equal(result.ratios.dem.percent, 150); assert.equal(result.ratios.dem.difference, 100);
  assert.equal(result.ratios.rep.percent, 0); assert.equal(result.ratios.rep.difference, -400);
});

test('missing or absent current party counts stay null independently; missing unrelated counts do not blank known numerators', () => {
  for (const candidates of [[{ party: 'DEM', votes: null }, { party: 'REP', votes: 100 }], [{ party: 'REP', votes: 100 }]]) {
    const result = compareRegistrationVotes(current({ candidates, vote_counts_complete: false, unattributed_source_votes: null }), row());
    assert.equal(result.ratios.dem.percent, null); assert.equal(result.ratios.dem.difference, null); assert.equal(result.ratios.rep.percent, 25);
  }
  const result = compareRegistrationVotes(current({ candidates: [{ party: 'DEM', votes: 160 }, { party: 'REP', votes: 200 }, { party: 'IND', votes: null }], unattributed_source_votes: null }), row());
  assert.equal(result.ratios.dem.percent, 80); assert.equal(result.ratios.rep.percent, 50);
  assert.equal(result.data_quality.source_attribution_incomplete, true); assert.equal(result.data_quality.unassigned_votes_allocated, false);
});

test('unknown and zero registration denominators are unavailable rather than invented', () => {
  for (const denominator of [null, 0]) {
    const result = compareRegistrationVotes(current(), row({ dem: denominator }));
    assert.equal(result.ratios.dem.percent, null); assert.equal(result.ratios.dem.difference, null); assert.equal(result.ratios.rep.percent, 50);
  }
  assert.equal(compareRegistrationVotes(current({ votes_released: false }), row()).ratios.dem.percent, null);
});

test('county, locality, House and mismatched-state comparisons retain reference counts without a whole-state performance denominator', () => {
  for (const [value, options] of [[current({ county_fips: '37001' }), { geography: 'county' }], [current({ reporting_unit_id: 'LOCAL-1', geography_type: 'source_locality' }), {}], [current({ office: 'house', district: '1' }), {}], [current({ race_id: '2026-HG-NC-1' }), {}], [current({ state: 'CA' }), {}]]) {
    const result = compareRegistrationVotes(value, row(), options);
    assert.equal(result.status, 'unavailable'); assert.equal(result.state_reference_only, true);
    assert.equal(result.ratios.dem.percent, null); assert.equal(result.ratios.dem.difference, null); assert.equal(result.registration.dem, 200);
  }
});

test('known invalid source counts, impossible accounting and duplicate candidates never create a performance ratio', () => {
  for (const value of [current({ reported_total: 10 }), current({ candidates: [{ candidate_id: '1', party: 'DEM', votes: 100 }, { candidate_id: '1', party: 'REP', votes: 100 }] }), current({ candidates: [{ party: 'DEM', votes: -1 }, { party: 'REP', votes: 100 }] })]) {
    const result = compareRegistrationVotes(value, row()); assert.equal(result.ratios.dem.percent, null); assert.equal(result.ratios.rep.percent, null);
  }
});

test('federal-only registration populations remain context for an excluded statewide office', () => {
  const registration = row({ state: 'AZ', excluded_offices: ['governor'], office_eligibility_note: 'Includes federal-only voters who cannot vote for governor.' });
  const governor = compareRegistrationVotes(current({ state: 'AZ', office: 'governor' }), registration);
  assert.equal(governor.state_reference_only, true); assert.equal(governor.ratios.dem.percent, null); assert.equal(governor.ratios.rep.difference, null);
  assert.equal(governor.registration.dem, 200); assert.match(governor.reason, /federal-only/); assert.equal(governor.data_quality.office_eligibility_supported, false);
  const senate = compareRegistrationVotes(current({ state: 'AZ' }), registration);
  assert.equal(senate.ratios.dem.percent, 80); assert.equal(senate.data_quality.office_eligibility_supported, true);
  const raw = dataset(); raw.states[0].excluded_offices = ['president']; assert.throws(() => parseVoterRegistration(raw), /eligibility/);
});

test('report generation dates and observation periods do not become fabricated snapshot cutoffs', () => {
  const raw = dataset(), source = raw.states.find((item) => item.state === 'OR');
  Object.assign(source, { as_of: null, observation_period: 'November 2026', report_generated_at: '2026-11-03' });
  const registration = parseVoterRegistration(raw).states.get('OR');
  assert.equal(registration.as_of, null); assert.equal(registration.observation_period, 'November 2026'); assert.equal(registration.report_generated_at, '2026-11-03');
  const result = compareRegistrationVotes(current({ state: 'OR' }), registration);
  assert.equal(result.data_quality.registration_snapshot_date_known, false); assert.equal(result.data_quality.registration_report_generated_at, '2026-11-03');
});

test('contradictory accounting and unverified populations retain raw evidence but disable derived performance', () => {
  for (const extra of [{ accounting_status: 'conflict', total: 500, notes: ['Published party subtotals exceed the stated total.'], source_tier: 'official' }, { comparison_supported: false, notes: ['Population definition is not verified.'], source_tier: 'secondary' }]) {
    const raw = dataset(); Object.assign(raw.states.find((item) => item.state === 'NC'), extra);
    const reference = parseVoterRegistration(raw).states.get('NC');
    assert.equal(reference.dem, 200); assert.equal(reference.rep, 400); assert.deepEqual(reference.notes, extra.notes); assert.equal(reference.source_tier, extra.source_tier);
    const result = compareRegistrationVotes(current(), reference);
    assert.equal(result.state_reference_only, true); assert.equal(result.ratios.dem.percent, null); assert.equal(result.ratios.rep.difference, null);
    assert.equal(result.registration, reference); assert.equal(result.data_quality.registration_comparison_supported, false); assert.match(result.reason, /conflicting accounting|has not been verified/);
  }
});

test('loader is lazy, bounded, project-relative and retries after an unavailable source', async () => {
  let calls = 0, failed = true;
  const fetcher = async (url, options) => {
    calls++; assert.ok(url.pathname.endsWith('/site/data/voter-registration.json')); assert.equal(options.credentials, 'same-origin'); assert.equal(options.cache, 'no-cache'); assert.equal(options.redirect, 'error');
    return failed ? new Response('', { status: 503 }) : new Response(JSON.stringify(dataset()));
  };
  assert.equal(calls, 0); await assert.rejects(loadVoterRegistration({ fetcher }), /503/); failed = false;
  const [a, b] = await Promise.all([loadVoterRegistration({ fetcher }), loadVoterRegistration({ fetcher })]);
  assert.equal(a, b); assert.equal(calls, 2);
  await assert.rejects(loadVoterRegistration({ fetcher: async () => new Response('{}', { headers: { 'content-length': String(1024 * 1024) } }) }), /size limit/);
  await assert.rejects(loadVoterRegistration({ fetcher: async () => new Response('x'.repeat(512 * 1024 + 1)) }), /size limit/);
});

test('registration data requests inherit the immutable browser release version', async () => {
  const versioned = await import('./voter-registration.js?v=registration-release-test'); let requested;
  await versioned.loadVoterRegistration({ fetcher: async (url, options) => { requested = url; assert.equal(options.cache, 'force-cache'); return new Response(JSON.stringify(dataset())); } });
  assert.equal(requested.searchParams.get('v'), 'registration-release-test');
});
