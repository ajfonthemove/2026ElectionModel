import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildView, createResultsWorker, MA_TOWN_COUNTY_CROSSWALK, MA_TOWN_CROSSWALK_SOURCE, NATIONAL_URLS, STATES, parseQuery, raceParts, validateRows } from '../index.js';

function race(code = 'SG', state = 'NC', values = {}) {
  const fips = STATES[state].fips;
  const district = code === 'HG' ? 1 : null;
  return { ecKey: `2026-${code}-${state}${district ? '-' + district : ''}`, contestType: code, stateAbbreviation: state, stateFipsCode: fips, electionType: code === 'SP' ? 'P' : 'G', raceType: code[0], raceTypeCode: code[0], jurisdictionCode: district || 0, resourceType: 'race', raceEmbargo: { assignedPollsClose: Date.parse('2026-11-04T00:30:00Z'), pollsClosed: true, votesReleased: true, callsReleased: true }, candidates: [{ candidateId: 1, fullName: 'Candidate D', majorParty: 'DEM', voteNum: 60, winner: false }, { candidateId: 2, fullName: 'Candidate R', majorParty: 'REP', voteNum: 35, winner: false }], totalVote: 100, voteTimestamp: '2026-11-04T01:30:00Z', extractedAt: '2026-11-04T01:30:01', percentReporting: 45, ...values };
}
function feedFixture() { return { SG: [race()], GG: [race('GG')], HG: [race('HG')] }; }
function cacheFixture() {
  const store = new Map();
  return { store, async match(key) { return store.has(key.url) ? store.get(key.url).clone() : undefined; }, async put(key, response) { store.set(key.url, response.clone()); } };
}
function fixtureApp({ fail = () => false, county = null, initialClock = Date.parse('2026-11-04T01:40:00Z'), cache = null } = {}) {
  let time = initialClock;const calls = [];const feeds = feedFixture();
  const app = createResultsWorker({ cache, now: () => time, fetcher: async (url) => {
    calls.push(url);if (fail(url)) throw new Error('Upstream delayed');
    const code = Object.entries(NATIONAL_URLS).find(([, value]) => value === url)?.[0];
    const data = code ? feeds[code] : county || [{ ...race(), resourceType: 'county-races', countyFipsCode: '37001', countyLongName: 'Alamance County', totalVote: 99 }];
    return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', ETag: 'fixture' } });
  } });
  const request = (path = '/api/results-map', init) => app.fetch(new Request('https://results.example' + path, init));
  return { app, calls, feeds, request, advance: (ms) => { time += ms; } };
}

 test('normalization retains unknown source votes and never creates own calls or odds', async () => {
  const fixture = fixtureApp();const response = await fixture.request();assert.equal(response.status, 200);
  const data = await response.json();assert.equal(data.schema_version, 'results_map_v1');assert.equal(data.states.length, 50);
  assert.equal(data.coverage.loaded_contests, 3);assert.equal(data.our_model_race_call, null);assert.equal(data.win_probability, null);
  const value = data.states.find((s) => s.state === 'NC').races.find((r) => r.office === 'senate');
  assert.equal(value.reported_total, 100);assert.equal(value.candidate_attributed_total, 95);assert.equal(value.unattributed_source_votes, 5);
  assert.equal(value.candidates[0].vote_share, .6);assert.equal(value.source_extracted_at_raw, '2026-11-04T01:30:01');
  assert.equal(value.source_updated_at, '2026-11-04T01:30:00Z');assert.match(value.percent_reporting_definition, /CNN estimated percentage of votes in/);
});

test('source calls require a single explicit winner and a released CNN call', async () => {
  const fixture = fixtureApp();fixture.feeds.SG[0].editorialStatus = 'called';fixture.feeds.SG[0].candidates[0].winner = true;
  const data = await (await fixture.request()).json();const value = data.states.find((s) => s.state === 'NC').races.find((r) => r.office === 'senate');
  assert.equal(value.source_called_winner.source, 'CNN');assert.equal(value.our_model_race_call, null);
  fixture.advance(31_000);fixture.feeds.SG[0].raceEmbargo.callsReleased = false;
  const changed = await (await fixture.request()).json();assert.equal(changed.states.find((s) => s.state === 'NC').races.find((r) => r.office === 'senate').source_called_winner, null);
});

test('embargoed votes remain null rather than initialization zeroes', async () => {
  const fixture = fixtureApp();fixture.feeds.SG[0].raceEmbargo.votesReleased = false;fixture.feeds.SG[0].voteTimestamp = '2026-11-04T01:30:00';
  const data = await (await fixture.request()).json();const value = data.states.find((s) => s.state === 'NC').races.find((r) => r.office === 'senate');
  assert.equal(value.reported_total, null);assert.equal(value.candidates[0].votes, null);assert.equal(value.status, 'votes_not_released');assert.equal(value.source_updated_at, null);
});

test('negative/fractional/overattributed/duplicate source counts reject the entire office source', () => {
  for (const change of [(r) => { r.candidates[0].voteNum = -1; }, (r) => { r.totalVote = 1.5; }, (r) => { r.candidates[0].voteNum = 80; }, (r) => { r.candidates[1].candidateId = 1; }]) {
    const value = race();change(value);assert.throws(() => validateRows([value], 'SG'));
  }
  assert.throws(() => validateRows([race(), race()], 'SG'));
});

test('cache throttles refreshes and retains counts and successful timestamps on failure', async () => {
  let fail = false;const fixture = fixtureApp({ fail: () => fail, cache: cacheFixture() });
  const first = await (await fixture.request()).json();assert.equal(fixture.calls.length, 3);
  await fixture.request('/api/results-map/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });assert.equal(fixture.calls.length, 3);
  fixture.advance(31_000);fail = true;
  const stale = await (await fixture.request()).json();assert.equal(stale.source.stale, true);assert.equal(stale.coverage.loaded_contests, 3);
  assert.equal(stale.source.checked_at, first.source.checked_at);assert.notEqual(stale.source.refresh_checked_at, first.source.refresh_checked_at);
  await fixture.request();assert.equal(fixture.calls.length, 6);
});

test('a failed office does not freeze healthy office refreshes', async () => {
  let fail = false;const fixture = fixtureApp({ fail: (url) => fail && url === NATIONAL_URLS.SG });
  await fixture.request();fixture.advance(31_000);fail = true;fixture.feeds.GG[0].totalVote = 105;
  const data = await (await fixture.request()).json();const races = data.states.find((s) => s.state === 'NC').races;
  assert.equal(data.source.stale, true);assert.equal(races.find((r) => r.office === 'senate').reported_total, 100);assert.equal(races.find((r) => r.office === 'governor').reported_total, 105);
});

test('persistent Cache API survives a fresh worker instance when upstream is unavailable', async () => {
  const cache = cacheFixture(), first = fixtureApp({ cache });const before = await (await first.request()).json();
  const second = fixtureApp({ cache, fail: () => true, initialClock: Date.parse('2026-11-04T02:00:00Z') });
  const stale = await (await second.request()).json();assert.equal(stale.coverage.loaded_contests, 3);assert.equal(stale.source.checked_at, before.source.checked_at);assert.equal(stale.source.stale, true);
});

test('county results require a verified parent and remain a separately timed snapshot', async () => {
  const fixture = fixtureApp();const data = await (await fixture.request('/api/results-map?race_id=2026-SG-NC&detail=county')).json();
  assert.equal(data.counties.length, 1);assert.equal(data.counties[0].county_fips, '37001');assert.equal(data.counties[0].unattributed_source_votes, 4);
  assert.equal(data.county_coverage.matches_national_snapshot, false);assert.equal(data.county_coverage.reported_total, 99);
  assert.equal(data.states.find((s) => s.state === 'NC').races[0].reported_total, 100);
  const response = await fixture.request('/api/results-map?race_id=2026-SG-CA&detail=county');assert.equal(response.status, 404);
  assert.equal(fixture.calls.filter((url) => url.includes('county-races')).length, 1);
});

test('county errors retain last verified county counts and original check time', async () => {
  let fail = false;const fixture = fixtureApp({ fail: (url) => fail && url.includes('county-races') });
  const path = '/api/results-map?race_id=2026-SG-NC&detail=county';const initial = await (await fixture.request(path)).json();
  fixture.advance(31_000);fail = true;const stale = await (await fixture.request(path)).json();
  assert.equal(stale.counties.length, 1);assert.equal(stale.county_coverage.stale, true);assert.equal(stale.county_coverage.checked_at, initial.county_coverage.checked_at);
});

test('invalid queries are rejected before any upstream fetch', async () => {
  const fixture = fixtureApp();
  for (const query of ['?office=president', '?office=senate&office=house', '?state=XX', '?detail=county', '?race_id=https://example.com', '?office=house&race_id=2026-SG-NC', '?race_id=2026-SP-CA', '?unknown=x']) {
    assert.equal((await fixture.request('/api/results-map' + query)).status, 400, query);
  }
  assert.equal(fixture.calls.length, 0);
  assert.throws(() => raceParts('2026-HG-CA-54'));assert.throws(() => parseQuery(new URL('https://x/?office=')));
});

test('model/research APIs are absent and static assets use the configured binding', async () => {
  const fixture = fixtureApp();for (const path of ['/api/forecast', '/api/geographic-model', '/api/polls', '/api/state-work']) assert.equal((await fixture.request(path)).status, 404);
  const result = await fixture.app.fetch(new Request('https://results.example/'), { ASSETS: { fetch: () => new Response('Results-only app') } });
  assert.equal(await result.text(), 'Results-only app');assert.equal(fixture.calls.length, 0);
});

test('refresh JSON bounds and method handling prevent arbitrary upstream requests', async () => {
  const fixture = fixtureApp();
  for (const [body, type] of [['{"url":"https://example.com"}', 'application/json'], ['x'.repeat(1100), 'application/json'], ['{}', 'text/plain'], ['null', 'application/json']]) {
    assert.equal((await fixture.request('/api/results-map/refresh', { method: 'POST', headers: { 'Content-Type': type }, body })).status, 400);
  }
  assert.equal((await fixture.request('/api/results-map/refresh')).status, 405);assert.equal(fixture.calls.length, 0);
});

test('cold upstream failure returns an explicit empty unavailable view without zero votes', async () => {
  const fixture = fixtureApp({ fail: () => true });const data = await (await fixture.request()).json();
  assert.equal(data.source.status, 'unavailable');assert.equal(data.source.checked_at, null);assert.equal(data.coverage.loaded_contests, 0);assert.equal(data.states.length, 50);assert.ok(data.source.error);
});

test('source identity, old House runoff and county FIPS are bounded', () => {
  assert.equal(validateRows([race('HG'), { ecKey: '2026-HQ-TX-18' }], 'HG').length, 1);
  assert.throws(() => validateRows([{ ...race(), stateFipsCode: '06' }], 'SG'));
  assert.throws(() => validateRows([{ ...race(), raceEmbargo: { assignedPollsClose: Date.parse('2025-11-04T01:00:00Z') } }], 'SG'));
  assert.throws(() => validateRows([{ ...race(), resourceType: 'county-races', countyFipsCode: '06001' }], 'SG', '2026-SG-NC'));
});

// Source-shaped municipal IDs reproduced from archived public CNN feeds:
// county-races/2026-SG-MI.json (126 rows) and 2026-HG-RI-1.json (20 rows).
function normalizedCountyFixture(code, state, rows, parentValues = {}) {
  const parent = race(code, state, parentValues), office = code === 'SP' ? 'SG' : code;
  const source = { source_url: `https://politics.api.cnn.io/results/county-races/${parent.ecKey}.json`, retrieved_at: '2026-11-04T03:55:00Z', sha256: 'fixture' };
  validateRows(rows, office, parent.ecKey);
  return buildView({ verified: true, offices: { [office]: { ...source, rows: [parent] } } }, { race_id: parent.ecKey, detail: 'county' }, { source, rows });
}
function countyRow(code, state, id, name, values = {}) {
  return { ...race(code, state), resourceType: 'county-races', countyFipsCode: id, countyLongName: name, ...values };
}

test('CNN estimated vote percentage is carried directly and remaining is only a labeled complement', async () => {
  const fixture = fixtureApp();
  for (const percent of [0, 45, 99, 100, null, -1, 101]) {
    fixture.feeds.SG[0].percentReporting = percent;fixture.advance(31_000);
    const data = await (await fixture.request()).json(), value = data.states.find((s) => s.state === 'NC').races.find((r) => r.office === 'senate');
    const progress = value.source_vote_progress, valid = percent !== null && percent >= 0 && percent <= 100;
    assert.equal(progress.percent_votes_counted, valid ? percent : null);assert.equal(progress.percent_votes_remaining, valid ? 100 - percent : null);
    assert.equal(progress.expected_votes, null);assert.equal(progress.estimated_votes_remaining, null);
    assert.equal(progress.source_field, 'percentReporting');assert.equal(progress.remaining_percentage_derived, true);
    assert.match(progress.semantics_source_url, /^https:\/\/www.cnn.com\/election\//);
    assert.equal(value.source_percent_reporting, progress.percent_votes_counted);
  }
  fixture.feeds.SG[0].raceEmbargo.votesReleased = false;fixture.advance(31_000);
  const embargoed = await (await fixture.request()).json();
  assert.equal(embargoed.states.find((s) => s.state === 'NC').races.find((r) => r.office === 'senate').source_vote_progress.percent_votes_remaining, null);
});

test('county progress is its own source estimate and never inherited from statewide progress', () => {
  const data = normalizedCountyFixture('SG', 'NC', [countyRow('SG', 'NC', '37001', 'Alamance', { percentReporting: 90 })], { percentReporting: 45 });
  assert.equal(data.counties[0].source_vote_progress.percent_votes_counted, 90);assert.equal(data.counties[0].source_vote_progress.percent_votes_remaining, 10);
  assert.equal(data.states.find((s) => s.state === 'NC').races[0].source_vote_progress.percent_votes_counted, 45);
  assert.equal(data.counties[0].source_vote_progress.estimated_votes_remaining, null);
});

test('Michigan municipal detail is preserved separately and cannot duplicate Wayne coverage totals', () => {
  const rows = [countyRow('SG', 'MI', '26163', 'Wayne', { totalVote: 100 }), countyRow('SG', 'MI', '92623098', 'Wayne County - Detroit', { totalVote: 100 })];
  const data = normalizedCountyFixture('SG', 'MI', rows);
  assert.equal(data.counties.length, 1);assert.equal(data.supplemental_localities.length, 1);
  assert.equal(data.county_coverage.reported_total, 100);assert.equal(data.county_coverage.source_unit_count, 2);
  assert.equal(data.county_coverage.canonical_county_count, 1);assert.equal(data.county_coverage.source_locality_count, 1);
  const city = data.supplemental_localities[0];assert.equal(city.reporting_unit_id, '92623098');assert.equal(city.county_fips, null);
  assert.equal(city.geography_type, 'source_locality');assert.equal(city.geographic_join_supported, false);assert.equal(city.included_in_coverage_total, false);
  assert.deepEqual(city.candidates.map((c) => c.votes), [60, 35]);
});

test('Rhode Island House towns remain usable tiles without invented county geography or partition totals', () => {
  const data = normalizedCountyFixture('HG', 'RI', [countyRow('HG', 'RI', '94440001', 'Barrington'), countyRow('HG', 'RI', '94440002', 'Bristol')]);
  assert.equal(data.counties.length, 2);assert.equal(data.supplemental_localities.length, 0);
  assert.equal(data.county_coverage.reported_total, null);assert.equal(data.county_coverage.matches_national_snapshot, null);
  assert.equal(data.county_coverage.aggregation_basis, 'unverified_source_locality_partition');
  for (const town of data.counties) { assert.equal(town.county_fips, null);assert.equal(town.geographic_join_supported, false);assert.equal(town.historical_comparison, null);assert.equal(town.district, '1'); }
});

test('Alaska source election districts and overseas category never become borough FIPS', () => {
  for (const code of ['SG', 'HG']) {
    const rows = Array.from({ length: 40 }, (_, i) => countyRow(code, 'AK', `9902${String(i + 1).padStart(3, '0')}`, `State House District ${i + 1}`));
    rows.push(countyRow(code, 'AK', '9902099', 'Overseas Absentee'));
    const data = normalizedCountyFixture(code, 'AK', rows);
    assert.equal(data.counties.length, 41);assert.equal(data.county_coverage.canonical_county_count, 0);assert.equal(data.county_coverage.reported_total, null);
    assert.equal(data.counties[0].geography_type, 'source_election_district');assert.equal(data.counties.at(-1).geography_type, 'source_reporting_category');
    assert.ok(data.counties.every((r) => r.county_fips === null && !r.geographic_join_supported));
    assert.throws(() => normalizedCountyFixture(code, 'AK', [countyRow(code, 'AK', '02001', 'Pseudo county')]));
  }
});

test('ordinary House fragments and both Senate specials retain office and source unit identity', () => {
  const house = normalizedCountyFixture('HG', 'NY', [countyRow('HG', 'NY', '36103', 'Suffolk')]);
  assert.equal(house.counties[0].county_fips, '36103');assert.equal(house.counties[0].district, '1');
  assert.throws(() => normalizedCountyFixture('HG', 'NY', [countyRow('HG', 'NY', '36103', 'Suffolk', { jurisdictionCode: 2 })]));
  for (const [state, fips] of [['FL', '12001'], ['OH', '39001']]) {
    const data = normalizedCountyFixture('SP', state, [countyRow('SP', state, fips, 'County')]);
    assert.equal(data.states.find((s) => s.state === state).races[0].special, true);assert.equal(data.counties[0].race_id, `2026-SP-${state}`);
  }
  assert.throws(() => normalizedCountyFixture('SG', 'MI', [countyRow('SG', 'MI', '94440001', 'Wrong state')]));
  assert.throws(() => normalizedCountyFixture('SG', 'MI', [countyRow('SG', 'MI', '92623098', 'Detroit'), countyRow('SG', 'MI', '92623098', 'Detroit duplicate')]));
});

test('unknown candidate counts and totals remain null without zero-filling or attributed residuals', async () => {
  const fixture = fixtureApp();fixture.feeds.SG[0].candidates[1].voteNum = null;
  const first = await (await fixture.request()).json(), value = first.states.find((s) => s.state === 'NC').races.find((r) => r.office === 'senate');
  assert.equal(value.candidates[1].votes, null);assert.equal(value.candidates[1].vote_share, null);assert.equal(value.reported_total, 100);
  assert.equal(value.vote_counts_complete, false);assert.equal(value.known_candidate_vote_total, 60);assert.equal(value.candidate_attributed_total, null);assert.equal(value.unattributed_source_votes, null);
  assert.equal(value.accounting_status, 'partial_candidate_counts');
  fixture.feeds.SG[0].totalVote = null;fixture.advance(31_000);
  const second = await (await fixture.request()).json(), missingTotal = second.states.find((s) => s.state === 'NC').races.find((r) => r.office === 'senate');
  assert.equal(missingTotal.reported_total, null);assert.equal(missingTotal.candidates[0].votes, 60);assert.equal(missingTotal.candidates[0].vote_share, null);
});

test('a malformed county refresh retains last good source unit counts and progress', async () => {
  const rows = [countyRow('SG', 'NC', '37001', 'Alamance', { percentReporting: 90 })], fixture = fixtureApp({ county: rows });
  const path = '/api/results-map?race_id=2026-SG-NC&detail=county';const before = await (await fixture.request(path)).json();
  rows[0].countyFipsCode = '94440001';fixture.advance(31_000);
  const stale = await (await fixture.request(path)).json();assert.equal(stale.county_coverage.stale, true);assert.equal(stale.county_coverage.checked_at, before.county_coverage.checked_at);
  assert.equal(stale.counties[0].county_fips, '37001');assert.equal(stale.counties[0].source_vote_progress.percent_votes_remaining, 10);
  assert.equal(stale.counties[0].reported_total, 100);assert.match(stale.county_coverage.error, /geography/);
});

function massachusettsTowns(code = 'GG') {
  return Object.values(MA_TOWN_COUNTY_CROSSWALK).map((town, index) => countyRow(code, 'MA', '92522' + String(index + 1).padStart(3, '0'), town.name, {
    totalVote: 20 + index,
    candidates: [{ candidateId: 1, fullName: 'Candidate D', majorParty: 'DEM', voteNum: 10 + index },
      { candidateId: 2, fullName: 'Candidate R', majorParty: 'REP', voteNum: 5 },
      { candidateId: 3, fullName: 'Candidate I', majorParty: 'IND', voteNum: 2 }],
    percentReporting: index % 2 ? 95 : 0,
  }));
}

test('Massachusetts inline crosswalk exactly matches its 351-town authoritative public artifact', async () => {
  const artifact = JSON.parse(await readFile(new URL('../../site/data/ma-town-county-crosswalk.json', import.meta.url), 'utf8'));
  assert.equal(artifact.schema_version, 'ma_town_county_crosswalk_v1');assert.equal(artifact.towns.length, 351);
  assert.deepEqual(artifact.source, MA_TOWN_CROSSWALK_SOURCE);
  assert.deepEqual(Object.values(MA_TOWN_COUNTY_CROSSWALK), artifact.towns);
  assert.equal(new Set(artifact.towns.map((town) => town.county_fips)).size, 14);
  assert.equal(new Set(artifact.towns.map((town) => town.massgis_town_id)).size, 351);
  // CNN's 92522087 is East Longmeadow while MassGIS town ID 85 is that town.
  assert.equal(MA_TOWN_COUNTY_CROSSWALK['EAST LONGMEADOW'].massgis_town_id, 85);
  assert.equal(MA_TOWN_COUNTY_CROSSWALK['EAST LONGMEADOW'].county_fips, '25013');
});

test('Massachusetts statewide 351 municipal rows become 14 county results without losing any candidate or unassigned votes', () => {
  const rows = massachusettsTowns(), total = rows.reduce((sum, row) => sum + row.totalVote, 0);
  const data = normalizedCountyFixture('GG', 'MA', rows, { totalVote: total });
  assert.equal(data.counties.length, 14);assert.equal(data.supplemental_localities.length, 351);
  assert.equal(data.county_coverage.aggregation_basis, 'verified_ma_town_to_county_rollup');
  assert.equal(data.county_coverage.source_unit_count, 351);assert.equal(data.county_coverage.source_locality_count, 351);
  assert.equal(data.county_coverage.source_canonical_county_count, 0);assert.equal(data.county_coverage.derived_county_count, 14);
  assert.equal(data.county_coverage.reported_total, total);assert.equal(data.county_coverage.matches_national_snapshot, true);
  assert.equal(data.counties.reduce((sum, row) => sum + row.reported_total, 0), total);
  assert.equal(data.counties.reduce((sum, row) => sum + row.unattributed_source_votes, 0), 351 * 3);
  for (const id of ['1', '2', '3']) {
    const raw = rows.reduce((sum, row) => sum + row.candidates.find((candidate) => String(candidate.candidateId) === id).voteNum, 0);
    assert.equal(data.counties.reduce((sum, row) => sum + row.candidates.find((candidate) => candidate.candidate_id === id).votes, 0), raw);
  }
  for (const county of data.counties) {
    const sourceRows = rows.filter((row) => MA_TOWN_COUNTY_CROSSWALK[row.countyLongName].county_fips === county.county_fips);
    assert.equal(county.reported_total, sourceRows.reduce((sum, row) => sum + row.totalVote, 0));
    assert.equal(county.municipality_count, sourceRows.length);assert.equal(county.whole_county_coverage_verified, true);
    assert.equal(county.unit_kind, 'county');assert.equal(county.geography_scope, 'whole_county');
    assert.equal(county.our_model_race_call, null);assert.equal(county.win_probability, null);assert.equal(county.source_called_winner, null);
  }
});

test('Massachusetts municipal progress is retained separately but never averaged into county remaining votes', () => {
  const data = normalizedCountyFixture('SG', 'MA', massachusettsTowns('SG'));
  assert(data.supplemental_localities.some((row) => row.source_vote_progress.percent_votes_counted === 0));
  assert(data.supplemental_localities.some((row) => row.source_vote_progress.percent_votes_counted === 95));
  for (const county of data.counties) {
    assert.equal(county.source_percent_reporting, null);assert.equal(county.source_vote_progress.percent_votes_counted, null);
    assert.equal(county.source_vote_progress.percent_votes_remaining, null);assert.equal(county.source_vote_progress.estimated_votes_remaining, null);
    assert.equal(county.source_vote_progress.remaining_percentage_derived, false);
  }
});

test('an unmatched, duplicated or incomplete Massachusetts town partition cannot create county totals', () => {
  for (const mutate of [rows => { rows[0].countyLongName = 'Unknown Municipality'; }, rows => { rows[0].countyLongName = rows[1].countyLongName; }, rows => { rows.pop(); }]) {
    const rows = massachusettsTowns();mutate(rows);const data = normalizedCountyFixture('GG', 'MA', rows);
    assert.equal(data.county_coverage.derived_county_count, 0);assert.equal(data.county_coverage.reported_total, null);
    assert.ok(data.county_coverage.aggregation_error);assert(data.counties.every((row) => row.county_fips === null));
    assert.equal(data.counties.length, rows.length);
  }
});

test('unknown Massachusetts municipal candidate counts remain null only in their affected county', () => {
  const rows = massachusettsTowns(), affectedFips = MA_TOWN_COUNTY_CROSSWALK[rows[0].countyLongName].county_fips;
  rows[0].candidates[0].voteNum = null;
  const data = normalizedCountyFixture('GG', 'MA', rows), county = data.counties.find((row) => row.county_fips === affectedFips);
  assert.equal(county.candidates.find((candidate) => candidate.candidate_id === '1').votes, null);
  assert.equal(county.vote_counts_complete, false);assert.equal(county.unattributed_source_votes, null);
  assert(county.candidates.find((candidate) => candidate.candidate_id === '2').votes > 0);
  assert(data.counties.filter((row) => row.county_fips !== affectedFips).every((row) => row.vote_counts_complete));
  assert.equal(data.supplemental_localities.find((row) => row.reporting_unit_id === rows[0].countyFipsCode).candidates[0].votes, null);
});

test('missing Massachusetts candidate identities are not interpreted as zero; inconsistent identities block rollup', () => {
  const rows = massachusettsTowns(), affectedFips = MA_TOWN_COUNTY_CROSSWALK[rows[0].countyLongName].county_fips;
  rows[0].candidates.shift();
  const data = normalizedCountyFixture('GG', 'MA', rows);
  assert.equal(data.counties.find((row) => row.county_fips === affectedFips).candidates.find((candidate) => candidate.candidate_id === '1').votes, null);
  const mismatch = massachusettsTowns();mismatch[0].candidates[0].majorParty = 'REP';
  const invalid = normalizedCountyFixture('GG', 'MA', mismatch);
  assert.equal(invalid.county_coverage.derived_county_count, 0);assert.match(invalid.county_coverage.aggregation_error, /identities/);
});

test('a parent candidate absent from every Massachusetts municipality remains present with unknown county counts', () => {
  const rows = massachusettsTowns();
  for (const row of rows) row.candidates.shift();
  const data = normalizedCountyFixture('GG', 'MA', rows);
  assert.equal(data.counties.length, 14);
  for (const county of data.counties) {
    assert.equal(county.candidates.find((candidate) => candidate.candidate_id === '1').votes, null);
    assert(county.candidates.find((candidate) => candidate.candidate_id === '2').votes > 0);
    assert.equal(county.unattributed_source_votes, null);
  }
});

test('unknown Massachusetts totals do not zero-fill county totals, and embargoes still withhold all votes', () => {
  const rows = massachusettsTowns(), affectedFips = MA_TOWN_COUNTY_CROSSWALK[rows[0].countyLongName].county_fips;
  rows[0].totalVote = null;
  const data = normalizedCountyFixture('GG', 'MA', rows), county = data.counties.find((row) => row.county_fips === affectedFips);
  assert.equal(county.reported_total, null);assert.equal(data.county_coverage.reported_total, null);
  assert(county.candidates.find((candidate) => candidate.candidate_id === '1').votes > 0);
  const embargoed = normalizedCountyFixture('GG', 'MA', massachusettsTowns(), { raceEmbargo: { assignedPollsClose: Date.parse('2026-11-04T00:30:00Z'), votesReleased: false } });
  assert.equal(embargoed.counties.length, 14);assert(embargoed.counties.every((row) => row.reported_total === null && row.candidates.every((candidate) => candidate.votes === null)));
});

test('Massachusetts House county rollups remain district fragments and never claim whole-county coverage', () => {
  const rows = massachusettsTowns('HG').slice(0, 83), data = normalizedCountyFixture('HG', 'MA', rows);
  assert(data.counties.length > 1 && data.counties.length < 14);assert.equal(data.supplemental_localities.length, 83);
  assert.equal(data.county_coverage.reported_total, rows.reduce((sum, row) => sum + row.totalVote, 0));
  for (const county of data.counties) {
    assert.equal(county.district, '1');assert.equal(county.race_id, '2026-HG-MA-1');assert.equal(county.geography_type, 'county_fragment');
    assert.equal(county.geography_scope, 'house_district_county_portion');assert.equal(county.whole_county_coverage_verified, false);
    assert.equal(county.geographic_join_supported, true);assert.match(county.county_fips, /^25\d{3}$/);
  }
});

test('genuine Massachusetts county rows take precedence over overlapping municipal detail', () => {
  const county = countyRow('GG', 'MA', '25025', 'Suffolk County'), town = countyRow('GG', 'MA', '92522035', 'Boston');
  const data = normalizedCountyFixture('GG', 'MA', [county, town]);
  assert.equal(data.counties.length, 1);assert.equal(data.counties[0].county_fips, '25025');
  assert.equal(data.county_coverage.reported_total, 100);assert.equal(data.county_coverage.derived_county_count, 0);
  assert.equal(data.county_coverage.aggregation_basis, 'canonical_county_rows_only');assert.equal(data.supplemental_localities.length, 1);
});
