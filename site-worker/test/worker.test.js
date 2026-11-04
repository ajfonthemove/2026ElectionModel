import test from 'node:test';
import assert from 'node:assert/strict';
import { buildView, createResultsWorker, NATIONAL_URLS, parseQuery, raceParts, validateRows } from '../index.js';

function race(code = 'SG', state = 'NC', values = {}) {
  const fips = { NC: '37', CA: '06', FL: '12', OH: '39' }[state];
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
  assert.equal(value.source_updated_at, '2026-11-04T01:30:00Z');assert.match(value.percent_reporting_definition, /not the percentage of votes/);
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
