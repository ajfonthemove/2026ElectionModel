import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseHousePresidentialHistory, loadHousePresidentialHistory } from './house-presidential-history.js';
import { comparePresidentialVotes } from './presidential-history.js';

const raw = async year => JSON.parse(await readFile(new URL(`./data/house-presidential-history-${year}.json`, import.meta.url), 'utf8'));
const reply = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', ...headers } });

test('actual publisher datasets cover all 435 current district identities and preserve the 173 missing 2020 rows', async () => {
  const geometry = JSON.parse(await readFile(new URL('./data/ap-house-paths-2026.json', import.meta.url), 'utf8'));
  const keys = geometry.districts.map(row => row.key).sort();
  const source = await readFile(new URL('./data/house-presidential-history-downballot.csv', import.meta.url));
  for (const year of [2024, 2020]) {
    const history = parseHousePresidentialHistory(await raw(year));
    assert.equal(history.districts.size, year === 2024 ? 435 : 262);
    assert.equal(history.coverage.missing_district_keys.length, year === 2024 ? 0 : 173);
    assert.deepEqual([...history.districts.keys(), ...history.coverage.missing_district_keys].sort(), keys);
    assert.equal(history.provenance.sha256, createHash('sha256').update(source).digest('hex'));
    assert.equal(history.boundary_cycle, 2026); assert.equal(history.valid_votes, null);
    assert.equal(history.all_valid_coverage_verified, false); assert.equal(history.candidate_roster_complete, false);
    assert.match(history.provenance.source_total_definition, /write-ins/);
    assert(history.provenance.limitations.some(text => /split-precinct estimates/.test(text)));
    for (const row of history.districts.values()) {
      assert.equal(row.dem_votes + row.rep_votes + row.other_votes, row.reported_total);
      assert.equal(row.year, year); assert.equal(row.source_name, 'The Downballot');
      assert.equal(row.source_declared_boundary_cycle, 2026); assert.equal(row.geometry_vintage_independently_verified, false);
      assert.equal(row.candidate_roster_complete, false); assert(Object.isFrozen(row));
    }
  }
  const h2024 = parseHousePresidentialHistory(await raw(2024)), h2020 = parseHousePresidentialHistory(await raw(2020));
  const alaska = h2024.districts.get('AK-1');
  assert.equal(alaska.source_district_id, 'AK-AL'); assert.equal(alaska.at_large, true);
  assert.equal(alaska.dem_votes, 140026); assert.equal(alaska.rep_votes, 184458);
  assert.equal(alaska.other_votes, 13693); assert.equal(alaska.reported_total, 338177);
  assert.equal(h2020.districts.has('CA-1'), false); assert(h2020.coverage.missing_district_keys.includes('CA-1'));
  assert.equal(h2020.districts.get('AK-1').dem_votes, 153778);
});

test('wrong district vintages, fabricated complete coverage, inconsistent counts and missing identities reject', async () => {
  const seed = await raw(2024);
  const mutations = [
    data => { data.provenance.source_declared_boundary_cycle = 2024; },
    data => { data.boundary_cycle = 2024; },
    data => { data.districts[0].boundary_cycle = 2024; },
    data => { data.districts[0].district_key = 'AK-2'; },
    data => { data.districts[0].state_fips = '01'; },
    data => { data.districts[0].at_large = false; },
    data => { data.districts[0].source_district_id = 'AK-01'; },
    data => { data.districts[0].dem_votes = null; },
    data => { data.districts[0].reported_total++; },
    data => { data.districts[0].valid_votes = data.districts[0].reported_total; },
    data => { data.districts[0].all_valid_coverage_verified = true; },
    data => { data.coverage.geometry_vintage_independently_verified = true; },
    data => { data.districts[data.districts.length - 1] = data.districts[0]; },
    data => { data.districts.pop(); data.coverage.districts--; },
  ];
  for (const mutate of mutations) { const input = structuredClone(seed); mutate(input); assert.throws(() => parseHousePresidentialHistory(input)); }
  for (const missing of ['AK-1', 'CA-53']) {
    const input = await raw(2020); input.coverage.missing_district_keys[0] = missing;
    assert.throws(() => parseHousePresidentialHistory(input));
  }
  const gap = await raw(2020); gap.coverage.missing_district_keys.pop();
  assert.throws(() => parseHousePresidentialHistory(gap));
});

test('a missing 2020 district has no historical denominator, while the known 2024 district works', async () => {
  const current = { state: 'CA', office: 'house', district: '1', race_id: '2026-HG-CA-1', cycle: 2026, stage: 'general', special: false,
    reported_total: 200, unattributed_source_votes: 0, candidates: [{ party: 'DEM', votes: 80 }, { party: 'REP', votes: 120 }] };
  const h2024 = parseHousePresidentialHistory(await raw(2024)), h2020 = parseHousePresidentialHistory(await raw(2020));
  const available = comparePresidentialVotes(current, h2024.districts.get('CA-1'), { geography: 'district' });
  assert.equal(available.status, 'available'); assert(available.ratios.dem.percent > 0);
  const missing = comparePresidentialVotes(current, h2020.districts.get('CA-1'), { geography: 'district' });
  assert.equal(missing.status, 'unavailable'); assert.equal(missing.ratios.dem.percent, null); assert.equal(missing.historical.dem_votes, null);
});

test('year-specific House downloads share a pending request and retry after source or year errors', async () => {
  const data2024 = await raw(2024), data2020 = await raw(2020); let calls = 0, fail = true;
  const fetcher = async url => { calls++; return fail ? reply({}, 503) : reply(url.pathname.includes('2024') ? data2024 : data2020); };
  const first = loadHousePresidentialHistory(2024, { fetcher }), second = loadHousePresidentialHistory(2024, { fetcher });
  assert.equal(first, second); await assert.rejects(first, /HTTP 503/); assert.equal(calls, 1);
  fail = false; assert.equal((await loadHousePresidentialHistory(2024, { fetcher })).districts.size, 435);
  assert.equal(await loadHousePresidentialHistory(2024, { fetcher }), await loadHousePresidentialHistory(2024, { fetcher }));
  assert.equal(calls, 2); assert.equal((await loadHousePresidentialHistory(2020, { fetcher })).districts.size, 262); assert.equal(calls, 3);
  await assert.rejects(loadHousePresidentialHistory(2026, { fetcher }), /2024 and 2020/); assert.equal(calls, 3);
  let wrong = true;
  const wrongYearFetcher = async () => reply(wrong ? data2020 : data2024);
  await assert.rejects(loadHousePresidentialHistory(2024, { fetcher: wrongYearFetcher }), /year disagrees/);
  wrong = false; assert.equal((await loadHousePresidentialHistory(2024, { fetcher: wrongYearFetcher })).year, 2024);
});

test('House history requests enforce declared and actual UTF-8 byte bounds', async () => {
  await assert.rejects(loadHousePresidentialHistory(2024, { fetcher: async () => reply({}, 200, { 'content-length': String(512 * 1024 + 1) }) }), /size limit/);
  await assert.rejects(loadHousePresidentialHistory(2024, { fetcher: async () => new Response('é'.repeat(300000)) }), /size limit/);
});

test('House history inherits immutable module versions and stays within the project subpath', async () => {
  const versioned = await import('./house-presidential-history.js?v=house-history-test'); let requested, options;
  const input = await raw(2024);
  await versioned.loadHousePresidentialHistory(2024, { fetcher: async (url, init) => { requested = url; options = init; return reply(input); } });
  assert.equal(requested.searchParams.get('v'), 'house-history-test');
  assert(requested.pathname.endsWith('/site/data/house-presidential-history-2024.json'));
  assert.equal(options.credentials, 'same-origin'); assert.equal(options.redirect, 'error'); assert.equal(options.cache, 'force-cache');
});
