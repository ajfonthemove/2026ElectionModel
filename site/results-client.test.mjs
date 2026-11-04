import test from 'node:test';
import assert from 'node:assert/strict';
import { browserSnapshotCache, browserSourceFetcher, createResultsClient } from './results-client.js';

function race(code = 'SG', values = {}) {
  return { ecKey: `2026-${code}-NC${code === 'HG' ? '-1' : ''}`, contestType: code, stateAbbreviation: 'NC', stateFipsCode: '37', electionType: 'G', raceType: code[0], raceTypeCode: code[0], jurisdictionCode: code === 'HG' ? 1 : 0, resourceType: 'race', raceEmbargo: { assignedPollsClose: Date.parse('2026-11-04T00:30:00Z'), pollsClosed: true, votesReleased: true, callsReleased: false }, candidates: [{ candidateId: 1, fullName: 'Candidate D', majorParty: 'DEM', voteNum: 60 }, { candidateId: 2, fullName: 'Candidate R', majorParty: 'REP', voteNum: 35 }], totalVote: 100, voteTimestamp: '2026-11-04T01:30:00Z', ...values };
}
function storage() {
  const values = new Map();
  return { values, open: async () => ({ async match(r) { return values.get(r.url)?.clone(); }, async put(r, response) { values.set(r.url, response.clone()); }, async delete(r) { return values.delete(r.url); }, async keys() { return [...values.keys()].map((url) => new Request(url)); } }) };
}
function fixture({ fail = () => false, persistent = undefined } = {}) {
  let clock = Date.parse('2026-11-04T02:00:00Z');const requests = [];
  const fetcher = async (url, init) => {
    requests.push({ url, init });if (fail()) throw new Error('Offline');
    const code = /2026-(SG|GG|HG)/.exec(url)[1];
    const row = url.includes('/county-races/') ? race('SG', { resourceType: 'county-races', countyFipsCode: '37001', countyLongName: 'Alamance County' }) : race(code);
    return new Response(JSON.stringify([row]), { headers: { 'Content-Type': 'application/json' } });
  };
  const options = { fetcher, cacheStorage: persistent, now: () => clock, origin: 'https://owner.github.io' };
  return { client: createResultsClient(options), options, requests, advance: (ms) => { clock += ms; } };
}

test('browser source fetch preserves Accept and genuine browser-controlled headers', async () => {
  let call;
  const source = browserSourceFetcher(async (...args) => { call = args;return new Response('[]'); });
  await source('https://politics.api.cnn.io/results/national-races/2026-SG.json', { headers: { Accept: 'application/json', 'User-Agent': 'server label', Origin: 'https://wrong.example', Referer: 'https://wrong.example' }, redirect: 'error' });
  assert.equal(call[1].headers.get('Accept'), 'application/json');
  for (const name of ['User-Agent', 'Origin', 'Referer']) assert.equal(call[1].headers.has(name), false);
  assert.equal(call[1].mode, 'cors');assert.equal(call[1].credentials, 'omit');assert.equal(call[1].redirect, 'error');
  assert.throws(() => source('https://example.com/results/national-races/2026-SG.json'));
});

test('results execute in-browser and never request a project API server', async () => {
  const app = fixture();const response = await app.client('/api/results-map');const data = await response.json();
  assert.equal(response.status, 200);assert.equal(data.coverage.loaded_contests, 3);assert.equal(app.requests.length, 3);
  assert.ok(app.requests.every((r) => r.url.startsWith('https://politics.api.cnn.io/')));
  assert.ok(app.requests.every((r) => !r.init.headers.has('User-Agent')));
  assert.equal(data.states.find((s) => s.state === 'NC').races[0].unattributed_source_votes, 5);
});

test('in-browser refresh remains throttled and county counts are independent', async () => {
  const app = fixture();await app.client('/api/results-map');
  await app.client('/api/results-map/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(app.requests.length, 3);
  const county = await (await app.client('/api/results-map?race_id=2026-SG-NC&detail=county')).json();
  assert.equal(county.counties.length, 1);assert.equal(county.counties[0].unattributed_source_votes, 5);assert.equal(app.requests.length, 4);
  assert.equal(county.states.find((s) => s.state === 'NC').races.find((r) => r.office === 'senate').reported_total, 100);
});

test('bounded persistent cache retains last verified source after page reload and failure', async () => {
  const persistent = storage();let offline = false;const app = fixture({ persistent, fail: () => offline });
  const first = await (await app.client('/api/results-map')).json();app.advance(31_000);offline = true;
  const reloaded = createResultsClient(app.options);const stale = await (await reloaded('/api/results-map')).json();
  assert.equal(stale.coverage.loaded_contests, 3);assert.equal(stale.source.checked_at, first.source.checked_at);assert.equal(stale.source.stale, true);
});

test('browser snapshot storage enforces expiry and a maximum of65 records', async () => {
  let clock = Date.parse('2026-11-04T02:00:00Z');const persistent = storage();const cache = browserSnapshotCache(persistent, () => clock);
  for (let i = 0; i < 66; i++) await cache.put(new Request(`https://cache.invalid/${i}`), new Response('{}'));
  assert.equal(persistent.values.size, 65);assert.equal(await cache.match(new Request('https://cache.invalid/0')), undefined);
  clock += 8 * 24 * 60 * 60 * 1000;assert.equal(await cache.match(new Request('https://cache.invalid/1')), undefined);
});

test('unsupported or cross-origin virtual routes cannot fetch data', async () => {
  const app = fixture();for (const path of ['/api/forecast', '/api/state-work', '/api/polls', 'https://other.example/api/results-map']) assert.equal((await app.client(path)).status, 404);
  assert.equal(app.requests.length, 0);
});
