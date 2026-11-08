import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MASSACHUSETTS_GOVERNOR_YEARS, parseMassachusettsGovernorHistory, loadMassachusettsGovernorHistory, compareMassachusettsGovernorVotes } from './ma-governor-history.js';

const read = async name => JSON.parse(await readFile(new URL('./data/' + name, import.meta.url), 'utf8'));
const crosswalk = await read('ma-town-county-crosswalk.json');
const raw = { 2022: await read('ma-governor-history-2022.json'), 2018: await read('ma-governor-history-2018.json') };
const parsed = Object.fromEntries(MASSACHUSETTS_GOVERNOR_YEARS.map(year => [year, parseMassachusettsGovernorHistory(raw[year], { crosswalk })]));
const clone = value => structuredClone(value);
const candidates = [{ id: 'd', label: 'Democrat', party: 'DEM', main: true }, { id: 'r', label: 'Republican', party: 'REP', main: true }, { id: 'i', label: 'Independent', party: 'IND', main: false }];
const current = (base = parsed[2022].towns.get('35'), values = [60, 30, 10]) => ({ id: base.id, level: base.level, geography_key: base.geography_key, state: 'MA', county_fips: base.county_fips,
  contest: 'governor', counts: { d: values[0], r: values[1], i: values[2] }, reported_total: values.every(Number.isInteger) ? values.reduce((a, b) => a + b, 0) : 100,
  accounting_complete: values.every(Number.isInteger), unattributed_source_votes: values.every(Number.isInteger) ? 0 : null,
  source: { name: 'Current Governor source', updated_at: '2026-11-03T00:00:00Z' } });
const compare = (unit, baseline = parsed[2022].towns.get('35'), choices = candidates) => compareMassachusettsGovernorVotes(unit, baseline, { candidates: choices });

test('both official years preserve all 351 towns, full candidate votes, All Others and excluded blanks', () => {
  assert.deepEqual(MASSACHUSETTS_GOVERNOR_YEARS, [2022, 2018]);
  for (const [year, expected] of [[2022, [1584403, 859343, 2485796, 25665, 2511461]], [2018, [885770, 1781341, 2674615, 78050, 2752665]]]) {
    const data = parsed[year], state = data.state;
    assert.equal(data.towns.size, 351); assert.equal(data.counties.size, 14);
    assert.deepEqual([state.dem_votes, state.rep_votes, state.reported_total, state.blank_votes, state.total_votes_cast], expected);
    assert.equal(state.counts.all_others, year === 2022 ? 2806 : 7504);
    assert.equal(state.valid_votes + state.blank_votes, state.total_votes_cast);
    assert.equal([...data.counties.values()].reduce((sum, row) => sum + row.reported_total, 0), state.reported_total);
    assert.equal(data.nominees.dem.name, year === 2022 ? 'Maura Healey' : 'Gonzalez and Palfrey');
    assert.equal(data.nominees.rep.name, year === 2022 ? 'Geoff Diehl' : 'Baker and Polito');
    assert.equal(data.coverage.all_valid_coverage_verified, true);
    assert.equal(data.towns.get('35').county_fips, '25025');
    assert.equal(data.towns.get('35').geography_key, 'town:35');
  }
});

test('parser rejects a duplicate, mismatched county, unknown town and candidate/blank accounting failure', () => {
  for (const mutate of [
    value => { value.towns[1] = clone(value.towns[0]); },
    value => { value.towns[0].county_fips = '25001'; },
    value => { value.towns[0].id = '352'; },
    value => { value.towns[0].canonical_name = 'BOSTON'; },
    value => { value.towns[0].counts.all_others += 1; },
    value => { value.towns[0].blank_votes += 1; },
    value => { value.official_state.counts.dem += 1; value.official_state.valid_votes += 1; value.official_state.total_votes_cast += 1; },
    value => { value.towns[0].counts.extra = 0; },
  ]) {
    const value = clone(raw[2022]); mutate(value); assert.throws(() => parseMassachusettsGovernorHistory(value, { crosswalk }));
  }
});

test('official election vintage, source identity, nominee labels and crosswalk are required', () => {
  for (const mutate of [value => { value.year = 2026; }, value => { value.source.election_id = 131501; }, value => { value.source.election_date = '2026-11-03'; }, value => { value.source.sha256 = '0'.repeat(64); }, value => { value.nominees.dem.name = 'Joe Biden'; }, value => { value.source.all_valid_coverage_verified = false; }, value => { value.choices[1].id = 'dem'; }]) {
    const value = clone(raw[2022]); mutate(value); assert.throws(() => parseMassachusettsGovernorHistory(value, { crosswalk }));
  }
  const invalid = clone(crosswalk); invalid.towns[0].massgis_town_id = invalid.towns[1].massgis_town_id;
  assert.throws(() => parseMassachusettsGovernorHistory(raw[2022], { crosswalk: invalid }));
  assert.throws(() => parseMassachusettsGovernorHistory(raw[2022]));
});

test('same-party count ratios and signed differences use current counts over the actual Governor nominee counts', () => {
  for (const year of MASSACHUSETTS_GOVERNOR_YEARS) {
    const base = parsed[year].towns.get('35'), result = compare(current(base), base);
    assert.equal(result.ratios.dem.percent, 100 * 60 / base.dem_votes);
    assert.equal(result.ratios.rep.percent, 100 * 30 / base.rep_votes);
    assert.equal(result.ratios.dem.vote_difference, 60 - base.dem_votes);
    assert.equal(result.ratios.rep.vote_difference, 30 - base.rep_votes);
    assert.equal(result.ratios.dem.historical_name, parsed[year].nominees.dem.name);
    assert.equal(result.current_source.name, 'Current Governor source');
    assert.equal(result.historical_source.url, parsed[year].source.url);
  }
});

test('share gaps and margin shift include minor Governor candidates and all Governor valid votes, excluding blanks', () => {
  const base = parsed[2022].towns.get('35'), result = compare(current(), base);
  assert.equal(result.current.dem_share, 0.6); assert.equal(result.current.rep_share, 0.3);
  assert.equal(result.ratios.dem.share_gap_pp, 60 - 100 * base.dem_votes / base.reported_total);
  assert.equal(result.ratios.rep.share_gap_pp, 30 - 100 * base.rep_votes / base.reported_total);
  assert.equal(result.shift_pp, 30 - 100 * (base.dem_votes - base.rep_votes) / base.reported_total);
  assert.notEqual(result.historical.dem_share, base.dem_votes / base.total_votes_cast);
  assert.notEqual(result.historical.dem_share, base.dem_votes / (base.dem_votes + base.rep_votes));
});

test('state and county references use exact same-geography sums and never substitute for towns', () => {
  for (const year of MASSACHUSETTS_GOVERNOR_YEARS) for (const base of [parsed[year].state, parsed[year].counties.get('25025'), parsed[year].towns.get('35')]) {
    assert.equal(compare(current(base), base).status, 'available');
    for (const mutate of [row => { row.id = '999'; }, row => { row.state = 'NC'; }, row => { row.geography_key = 'town:999'; }, row => { row.county_fips = '25001'; }, row => { row.contest = 'question-1'; }]) {
      const value = current(base); mutate(value); assert.equal(compare(value, base).status, 'unavailable');
    }
  }
  assert.equal(compare(current(), parsed[2022].counties.get('25025')).status, 'unavailable');
  assert.equal(compare(current(), parsed[2022].towns.get('36')).status, 'unavailable');
  assert.equal(compare(current(), { ...parsed[2022].towns.get('35'), year: 2026 }).status, 'unavailable');
});

test('known zero numerators stay zero and unknown party counts do not suppress a separately known party ratio', () => {
  const zero = compare(current(undefined, [0, 20, 10]));
  assert.equal(zero.ratios.dem.percent, 0); assert.equal(zero.ratios.dem.current_share_percent, 0);
  const missing = compare(current(undefined, [null, 30, 10]));
  assert.equal(missing.ratios.dem.percent, null); assert.equal(missing.ratios.rep.percent, 100 * 30 / parsed[2022].towns.get('35').rep_votes);
  assert.equal(missing.ratios.rep.share_gap_pp, null); assert.equal(missing.shift_pp, null);
  const empty = compare(current(undefined, [0, 0, 0]));
  assert.equal(empty.ratios.dem.percent, 0); assert.equal(empty.ratios.rep.percent, 0); assert.equal(empty.shift_pp, null);
});

test('invalid selected counts, duplicate identities and conflicting reported totals return stable empty metrics', () => {
  for (const value of [{ ...current(), counts: { d: -1, r: 30, i: 10 } }, { ...current(), reported_total: 50 }, { ...current(), counts: { ...current().counts, extra: 1 } }]) assert.equal(compare(value).ratios.dem.percent, null);
  assert.equal(compare(current(), undefined, [...candidates, candidates[0]]).status, 'unavailable');
  assert.equal(compare(undefined, undefined).ratios.dem.percent, null);
  assert.equal(compare(current(), null).ratios.rep.share_gap_pp, null);
  const base = parsed[2022].towns.get('35');
  assert.equal(compare(current(), { ...base, nominees: {} }).status, 'unavailable');
  assert.equal(compare(current(), { ...base, valid_votes: base.valid_votes + 1 }).status, 'unavailable');
});

test('zero historical denominators omit ratios while preserving a defined raw vote difference', () => {
  const base = parsed[2022].towns.get('35'), empty = { ...base, dem_votes: 0, rep_votes: 0, other_votes: 0, reported_total: 0, valid_votes: 0, blank_votes: 0, total_votes_cast: 0 };
  const result = compare(current(base), empty);
  assert.equal(result.ratios.dem.percent, null); assert.equal(result.ratios.dem.vote_difference, 60);
  assert.equal(result.ratios.rep.percent, null); assert.equal(result.shift_pp, null);
});

test('lazy same-origin requests coalesce by year, reuse the crosswalk and retry failed references', async () => {
  const calls = []; let fail = true;
  const fetcher = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('crosswalk')) return Response.json(crosswalk);
    if (String(url).includes('2022') && fail) return new Response('', { status: 503 });
    return Response.json(raw[String(url).includes('2022') ? 2022 : 2018]);
  };
  const a = loadMassachusettsGovernorHistory(2022, { fetcher }), b = loadMassachusettsGovernorHistory(2022, { fetcher });
  assert.equal(a, b); await assert.rejects(a); fail = false;
  assert.equal((await loadMassachusettsGovernorHistory(2022, { fetcher })).towns.size, 351);
  await loadMassachusettsGovernorHistory(2018, { fetcher });
  assert.equal(calls.filter(row => row.url.includes('crosswalk')).length, 1);
  assert.equal(calls.length, 4); assert(calls.every(row => row.options.credentials === 'same-origin' && row.options.redirect === 'error'));
  await assert.rejects(loadMassachusettsGovernorHistory(2026, { fetcher })); assert.equal(calls.length, 4);
});

test('static loads preserve the release version and reject oversized bodies, bad years and redirects', async () => {
  const mod = await import('./ma-governor-history.js?v=town-history-test'); const calls = [];
  const fetcher = async url => { calls.push(String(url)); return Response.json(String(url).includes('crosswalk') ? crosswalk : raw[2022]); };
  await mod.loadMassachusettsGovernorHistory(2022, { fetcher }); assert(calls.every(url => new URL(url).searchParams.get('v') === 'town-history-test'));
  for (const response of [() => new Response('0', { headers: { 'content-length': 1024 * 1024 + 1 } }), () => new Response('x'.repeat(1024 * 1024 + 1)), () => Response.json(raw[2018]), () => ({ ok: true, redirected: true, headers: new Headers(), body: new Response('{}').body })]) {
    const invalid = async url => String(url).includes('crosswalk') ? Response.json(crosswalk) : response();
    await assert.rejects(loadMassachusettsGovernorHistory(2022, { fetcher: invalid }));
  }
});


test('2018 source order stays Republican-first while normalized party IDs stay exact', () => {
  assert.deepEqual(raw[2018].source_candidate_columns.map(row => [row.label, row.party, row.source_column_index]), [
    ['Baker and Polito', 'Republican', 3], ['Gonzalez and Palfrey', 'Democratic', 4], ['All Others', null, 5],
  ]);
  assert.deepEqual(raw[2018].choices.map(row => [row.id, row.source_column_index]), [['dem', 4], ['rep', 3], ['all_others', 5]]);
  assert.equal(parsed[2018].state.dem_votes, 885770); assert.equal(parsed[2018].state.rep_votes, 1781341);
  assert.equal(parsed[2018].nominees.rep.label, 'Baker'); assert.equal(parsed[2018].nominees.dem.label, 'Gonzalez');
  for (const mutate of [value => { value.office = 'president'; }, value => { value.source.office = 'president'; }, value => { value.nominees.rep.name = 'Geoff Diehl'; }]) {
    const value = clone(raw[2018]); mutate(value); assert.throws(() => parseMassachusettsGovernorHistory(value, { crosswalk }));
  }
});
