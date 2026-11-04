import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parsePresidentialHistory, loadPresidentialHistory, comparePresidentialMargin } from './presidential-history.js';
const raw = async (year) => JSON.parse(await readFile(new URL(`./data/presidential-history-${year}.json`, import.meta.url), 'utf8'));
const sum = (rows, key) => [...rows].reduce((total, row) => total + row[key], 0);
const current = (extra = {}) => ({ state: 'NC', office: 'senate', reported_total: 100, unattributed_source_votes: 0, candidates: [{ party: 'DEM', votes: 45 }, { party: 'REP', votes: 42 }, { party: 'IND', votes: 13 }], ...extra });
const baseline = (extra = {}) => ({ year: 2024, state: 'NC', unit_kind: 'state', dem_votes: 50, rep_votes: 40, other_votes: 10, reported_total: 100, source_name: 'Source', ...extra });

test('archived datasets preserve source accounting, exact IDs and independently timed rollups', async () => {
  const expected = { 2024: [3112, 75017613, 77302580, 155228947, 154213773], 2020: [3111, 81284666, 74224319, 158425893, 157697855] };
  for (const year of [2024, 2020]) {
    const data = parsePresidentialHistory(await raw(year));
    const [counties, dem, rep, total, countyTotal] = expected[year];
    assert.equal(data.states.size, 51);assert.equal(data.counties.size, counties);
    assert.equal(sum(data.states.values(), 'dem_votes'), dem);assert.equal(sum(data.states.values(), 'rep_votes'), rep);assert.equal(sum(data.states.values(), 'reported_total'), total);assert.equal(sum(data.counties.values(), 'reported_total'), countyTotal);
    assert.equal(data.counties.get('01001').county_fips, '01001');
    assert.ok([...data.counties.values()].every((row) => /^\d{5}$/.test(row.county_fips) && row.county_fips.startsWith(row.state_fips) && row.dem_votes + row.rep_votes + row.other_votes === row.reported_total && row.valid_votes === null && row.all_valid_coverage_verified === false && row.candidate_roster_complete === false));
    for (const state of data.states.values()) {
      if (['AK', 'DC'].includes(state.state)) continue;
      const rows = [...data.counties.values()].filter((r) => r.state === state.state);
      const diagnostic = data.coverage.county_state_reconciliation.find((r) => r.state === state.state);
      for (const [key, difference] of [['dem_votes', 'county_source_dem_minus_state'], ['rep_votes', 'county_source_rep_minus_state'], ['reported_total', 'county_source_total_minus_state']]) assert.equal(sum(rows, key) - state[key], diagnostic[difference]);
    }
    assert.notEqual(sum(data.counties.values(), 'reported_total'), sum(data.states.values(), 'reported_total'));
  }
});

test('public artifact hashes and source-license provenance reconcile', async () => {
  const manifest = JSON.parse(await readFile(new URL('./data/presidential-history.manifest.json', import.meta.url)));
  for (const record of manifest.datasets) {
    const bytes = await readFile(new URL(`./data/${record.filename}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), record.sha256);assert.equal(bytes.length, record.bytes);
  }
  assert.equal(manifest.sources.filter((s) => s.archive_filename.startsWith('county-')).length, 2);
  assert.equal(manifest.sources.find((s) => s.license === 'MIT').copyright, 'Copyright (c) 2025 Tony McGovern');
  assert.match(await readFile(new URL('./data/presidential-history-tonmcg-LICENSE', import.meta.url), 'utf8'), /MIT License/);
});

test('Alaska and DC noncounty units stay excluded and Connecticut vintages are not crosswalked', async () => {
  const a = parsePresidentialHistory(await raw(2024)), b = parsePresidentialHistory(await raw(2020));
  for (const data of [a, b]) {
    assert.ok(data.states.has('AK') && data.states.has('DC'));
    assert.ok(![...data.counties.values()].some((r) => ['AK', 'DC'].includes(r.state)));
  }
  assert.ok(a.counties.has('09110'));assert.equal(a.counties.get('09110').unit_kind, 'county_equivalent');assert.equal(a.counties.has('09001'), false);
  assert.ok(b.counties.has('09001'));assert.equal(b.counties.has('09110'), false);
});

test('comparison is descriptive all-reported margin and never two-party normalized', () => {
  const result = comparePresidentialMargin(current(), baseline());
  assert.equal(result.status, 'available');assert.equal(result.current_margin_pp, 3);assert.equal(result.historical_margin_pp, 10);assert.equal(result.shift_pp, -7);
  assert.equal(result.comparison_basis, 'current_partial_reported_vs_historical_reported');assert.equal(result.all_valid_coverage_verified, false);assert.match(result.label, /Reported margin vs 2024 president/);assert.match(result.note, /not a forecast/);
});

test('missing candidate counts, attribution and absent major nominees never become zero', () => {
  for (const row of [current({ reported_total: null }), current({ unattributed_source_votes: null }), current({ unattributed_source_votes: 1 }), current({ vote_counts_complete: false }), current({ accounting_status: 'partial_candidate_counts' }), current({ candidates: [{ party: 'DEM', votes: null }, { party: 'REP', votes: 100 }] }), current({ candidates: [{ party: 'DEM', votes: 100 }] }), current({ candidates: [{ party: 'DEM', votes: 45 }, { party: 'REP', votes: 42 }] })]) assert.equal(comparePresidentialMargin(row, baseline()).status, 'unavailable');
  assert.equal(comparePresidentialMargin(current(), null).shift_pp, null);
  assert.equal(comparePresidentialMargin(current(), baseline({ reported_total: null })).status, 'unavailable');
});

test('only exact comparable county identifiers qualify; synthetic towns and district portions do not', () => {
  const county = baseline({ county_fips: '37001', unit_kind: 'county' });
  assert.equal(comparePresidentialMargin(current({ county_fips: '37001' }), county, { geography: 'county' }).status, 'available');
  for (const row of [current({ county_fips: '37003' }), current({ county_fips: null, reporting_unit_id: 'MI-Wayne-town-1' }), current({ county_fips: '37001', reporting_unit_id: 'NC-town-1' }), current({ county_fips: '37001', reporting_unit_kind: 'municipality' }), current({ state: 'AK', county_fips: '02001' })]) assert.equal(comparePresidentialMargin(row, county, { geography: 'county' }).status, 'unavailable');
  assert.equal(comparePresidentialMargin(current({ state: 'CA' }), baseline()).status, 'unavailable');
  assert.equal(comparePresidentialMargin(current({ county_fips: '37001' }), baseline()).status, 'unavailable');
});

test('House never receives an allocated county or statewide presidential margin', () => {
  for (const geography of ['state', 'county']) {
    assert.equal(comparePresidentialMargin(current({ office: 'house', district: '1', county_fips: geography === 'county' ? '37001' : null }), baseline({ county_fips: '37001' }), { office: 'house', geography }).status, 'unavailable');
  }
  assert.equal(comparePresidentialMargin(current({ race_id: '2026-HG-NC-1' }), baseline()).status, 'unavailable');
});

test('parser rejects duplicated IDs, negative/missing counts and false coverage claims', async () => {
  for (const mutate of [d => d.counties.push(d.counties[0]), d => d.counties[0].dem_votes = null, d => d.counties[0].other_votes = -1, d => d.counties[0].county_fips = '1001', d => d.all_valid_coverage_verified = true, d => d.states[0].reported_total += 1]) {
    const data = await raw(2024);mutate(data);assert.throws(() => parsePresidentialHistory(data));
  }
});

test('loader is lazy, project-relative, bounded and caches only successful parsed years', async () => {
  let calls = 0, failure = true;
  const fetcher = async (url, options) => {
    calls++;assert.ok(url instanceof URL);assert.ok(url.pathname.endsWith('/site/data/presidential-history-2024.json'));assert.equal(options.credentials, 'same-origin');assert.equal(options.cache, 'no-cache');
    if (failure) return new Response('unavailable', { status: 503 });
    return new Response(JSON.stringify(await raw(2024)));
  };
  assert.equal(calls, 0);await assert.rejects(loadPresidentialHistory(2024, { fetcher }), /503/);failure = false;
  const [a,b] = await Promise.all([loadPresidentialHistory(2024, { fetcher }), loadPresidentialHistory(2024, { fetcher })]);assert.equal(a,b);assert.equal(calls,2);
  await assert.rejects(loadPresidentialHistory(2026, { fetcher }), /2024 and 2020/);assert.equal(calls,2);
  await assert.rejects(loadPresidentialHistory(2024, { fetcher: async () => new Response('{}', { headers: { 'content-length': String(3*1024*1024) } }) }), /size limit/);
  await assert.rejects(loadPresidentialHistory(2024, { fetcher: async () => new Response(JSON.stringify(await raw(2020))) }), /year disagrees/);
});


test('release version propagates from the module URL to lazy JSON requests', async () => {
  const versioned = await import('./presidential-history.js?v=release-fixture-42');
  let requested;
  await versioned.loadPresidentialHistory(2024, { fetcher: async (url, options) => { requested = url;assert.equal(options.cache, 'force-cache');return new Response(JSON.stringify(await raw(2024))); } });
  assert.equal(requested.searchParams.get('v'), 'release-fixture-42');
});
