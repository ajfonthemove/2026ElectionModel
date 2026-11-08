import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MASSACHUSETTS_CONTESTS, parseMassachusettsBallotResults, parseMassachusettsGovernorResults,
  compareBallotToGovernor, rankBallotGovernorVotes, createMassachusettsResultsLoader } from './massachusetts-results.js';

const crosswalk = JSON.parse(await readFile(new URL('./data/ma-town-county-crosswalk.json', import.meta.url), 'utf8'));
const source = { name: 'AP via WBUR', url: 'https://static.wbur.org/json/elections/2026/2026-11-03-map-questions-1.json', checked_at: '2026-11-07T18:00:00Z', status: 'available' };
const clone = value => JSON.parse(JSON.stringify(value));
const reply = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', ...headers } });
function ballotRows(yes = 55, no = 45) {
  const rows = crosswalk.towns.flatMap(town => ['Yes', 'No'].map(last => ({ level: 'township', reportingunitid: 'source-town-' + town.massgis_town_id,
    reportingunitname: town.name, fipscode: town.county_fips, first: null, last, party: last,
    votecount: last === 'Yes' ? yes : no, precinctsreporting: 1, precinctstotal: 2 })));
  return [...['Yes', 'No'].map(last => ({ level: 'state', reportingunitid: 'state-MA-1', last, party: last,
    votecount: 351 * (last === 'Yes' ? yes : no), precinctsreporting: 351, precinctstotal: 702 })), ...rows];
}
const parseQ = rows => parseMassachusettsBallotResults(rows, { contest: 'question-1', crosswalk, source });
const choices = (d = 60, r = 30, i = 10) => [{ candidate_id: 'd', name: 'Governor D', party: 'DEM', votes: d },
  { candidate_id: 'r', name: 'Governor R', party: 'REP', votes: r }, { candidate_id: 'i', name: 'Governor I', party: 'IND', votes: i }];
function governorPayload() {
  const base = { race_id: '2026-GG-MA', office: 'governor', state: 'MA', cycle: 2026, stage: 'general', district: null, source_name: 'CNN', vote_counts_complete: true, unattributed_source_votes: 0 };
  return { source: { checked_at: '2026-11-07T18:00:00Z' }, states: [{ state: 'MA', races: [{ ...base,
    source_url: 'https://politics.api.cnn.io/results/national-races/2026-GG.json', reported_total: 35100, candidates: choices(351 * 60, 351 * 30, 351 * 10) }] }],
    county_coverage: { checked_at: '2026-11-07T18:00:01Z', source_update_range: { oldest: '2026-11-07T17:00:00Z', newest: '2026-11-07T17:59:00Z', unknown_count: 0 }, stale: false },
    supplemental_localities: crosswalk.towns.map(town => ({ ...base, name: town.name, unit_kind: 'source_locality',
      reporting_unit_id: 'source-cnn-town-' + town.massgis_town_id, county_fips: null,
      source_url: 'https://politics.api.cnn.io/results/county-races/2026-GG-MA.json', reported_total: 100,
      candidates: choices(), source_vote_progress: { percent_votes_counted: 90, percent_votes_remaining: 10 } })) };
}
const parseG = data => parseMassachusettsGovernorResults(data, { crosswalk });

test('all 351 municipalities and 14 counties conserve Yes/No counts without using county FIPS as town identity', () => {
  const data = parseQ(ballotRows());
  assert.equal(data.towns.size, 351); assert.equal(data.counties.size, 14);
  assert.equal(data.towns.get('35').name, 'BOSTON'); assert.equal(data.towns.get('35').geography_key, 'town:35');
  assert.equal(data.state.counts.yes, 351 * 55); assert.equal(data.state.reported_total, 35100);
  assert.equal([...data.counties.values()].reduce((sum, row) => sum + row.counts.no, 0), data.state.counts.no);
  assert.equal(data.state.precincts_reporting, 351); assert.equal(data.state.precincts_reporting_percent, 50);
  assert.equal(data.state.blank_votes, null); assert.equal(data.win_probability, null);
  assert.equal(data.choices[0].party, null); assert.equal(MASSACHUSETTS_CONTESTS.length, 10);
  assert.match(MASSACHUSETTS_CONTESTS.find(row => row.id === 'question-9').summary, /Yes keeps.*No repeals/);
});

test('unknown counts remain null independently and malformed cumulative geography cannot be silently summed', () => {
  const missing = ballotRows(); missing.splice(2, 1); const data = parseQ(missing);
  assert.equal(data.towns.get('1').counts.yes, null); assert.equal(data.towns.get('1').counts.no, 45);
  assert.equal(data.state.counts.yes, null); assert.equal(data.state.counts.no, 351 * 45);
  for (const mutate of [rows => rows.push(clone(rows[2])), rows => rows[2].fipscode = '25001',
    rows => rows[2].reportingunitid = rows[4].reportingunitid,
    rows => rows[2].reportingunitname = 'Unknown municipality', rows => rows.splice(2, 2),
    rows => rows[2].votecount = -1, rows => rows[2].last = 'Undecided']) {
    const rows = ballotRows(); mutate(rows); assert.throws(() => parseQ(rows));
  }
});

test('Governor town/county/state counts preserve minor candidates and keep independently timed national values separate', () => {
  const raw = governorPayload(); raw.states[0].races[0].candidates[0].votes += 7; raw.states[0].races[0].reported_total += 7;
  const data = parseG(raw);
  assert.equal(data.choices.length, 3); assert.deepEqual(data.choices.filter(choice => choice.main).map(choice => choice.id), ['d', 'r']);
  assert.equal(data.towns.get('35').counts.i, 10); assert.equal(data.state.counts.i, 3510);
  assert.equal(data.state.reported_total, 35100); assert.equal(data.national_state.reported_total, 35107);
  assert.equal(data.coverage.published_state_total_matches_towns, false);
  assert.equal(data.towns.get('35').vote_progress.percent_votes_counted, 90);
  assert.equal(data.state.precincts_reporting_percent, null); assert.equal(data.state.vote_progress, null);
  assert.equal(data.state.accounting_complete, true);
});

test('Governor-over-response ratios and response-minus-Governor share gaps retain their distinct directions', () => {
  const q = parseQ(ballotRows()).towns.get('35'), g = parseG(governorPayload()).towns.get('35');
  const d = compareBallotToGovernor(q, g, { response: 'yes', candidate: 'd' });
  assert.equal(d.question_votes, 55); assert.equal(d.governor_votes, 60);
  assert.equal(d.vote_difference, -5);
  assert.equal(d.count_ratio_percent, 100 * 60 / 55); assert.equal(d.question_share_percent, 55);
  assert.equal(d.governor_share_percent, 60); assert.equal(d.share_gap_pp, -5);
  const r = compareBallotToGovernor(q, g, { response: 'no', candidate: 'r' });
  assert.equal(r.vote_difference, 15); assert.equal(r.count_ratio_percent, 100 * 30 / 45); assert.equal(r.share_gap_pp, 15);
  const differentDenominators = compareBallotToGovernor(parseQ(ballotRows(80, 120)).towns.get('35'), g, { candidate: 'd' });
  assert.equal(differentDenominators.vote_difference, 20); assert.equal(differentDenominators.count_ratio_percent, 75);
  assert.equal(differentDenominators.share_gap_pp, -20);
  for (const mismatch of [{ ...g, id: '36' }, { ...g, level: 'county' }, { ...g, county_fips: '25001' }, { ...g, state: 'NC' }]) {
    assert.equal(compareBallotToGovernor(q, mismatch, { candidate: 'd' }).count_ratio_percent, null);
    assert.equal(compareBallotToGovernor(q, mismatch, { candidate: 'd' }).vote_difference, null);
  }
  assert.equal(compareBallotToGovernor(q, g, { candidate: 'i' }).count_ratio_percent, null);
  assert.equal(compareBallotToGovernor(q, g, { candidate: 'i' }).vote_difference, null);
});

test('real zeros remain zero while zero denominators and missing candidate counts do not become computed values', () => {
  const question = parseQ(ballotRows(0, 0)).towns.get('35'), governor = parseG(governorPayload()).towns.get('35');
  const emptyQuestion = compareBallotToGovernor(question, governor, { candidate: 'd' });
  assert.equal(emptyQuestion.question_votes, 0); assert.equal(emptyQuestion.count_ratio_percent, null); assert.equal(emptyQuestion.question_share_percent, null); assert.equal(emptyQuestion.share_gap_pp, null);
  assert.equal(emptyQuestion.vote_difference, -60);
  const raw = governorPayload(); raw.supplemental_localities[34].candidates = choices(0, 0, 0); raw.supplemental_localities[34].reported_total = 0;
  const emptyGovernor = compareBallotToGovernor(parseQ(ballotRows()).towns.get('35'), parseG(raw).towns.get('35'), { candidate: 'd' });
  assert.equal(emptyGovernor.governor_votes, 0); assert.equal(emptyGovernor.count_ratio_percent, 0);
  assert.equal(emptyGovernor.vote_difference, 55);
  const bothZero = compareBallotToGovernor(question, parseG(raw).towns.get('35'), { candidate: 'd' });
  assert.equal(bothZero.vote_difference, 0); assert.equal(bothZero.count_ratio_percent, null); assert.equal(bothZero.share_gap_pp, null);
  const unknown = governorPayload(); unknown.supplemental_localities[34].candidates[2].votes = null;
  unknown.supplemental_localities[34].unattributed_source_votes = null; unknown.supplemental_localities[34].vote_counts_complete = false;
  const partial = parseG(unknown), result = compareBallotToGovernor(parseQ(ballotRows()).towns.get('35'), partial.towns.get('35'), { candidate: 'd' });
  assert.equal(partial.state.counts.i, null); assert.equal(partial.state.counts.r, 351 * 30);
  assert.equal(result.count_ratio_percent, 100 * 60 / 55); assert.equal(result.governor_share_percent, null); assert.equal(result.share_gap_pp, null);
  assert.equal(result.vote_difference, -5);
  const missingGovernor = governorPayload(); missingGovernor.supplemental_localities[34].candidates[0].votes = null;
  const missingNumerator = compareBallotToGovernor(parseQ(ballotRows()).towns.get('35'), parseG(missingGovernor).towns.get('35'), { candidate: 'd' });
  assert.equal(missingNumerator.governor_votes, null); assert.equal(missingNumerator.count_ratio_percent, null);
  assert.equal(missingNumerator.vote_difference, null);
  const missingQuestion = ballotRows(); missingQuestion.find(row => row.level === 'township' && row.reportingunitname === 'BOSTON' && row.last === 'Yes').votecount = null;
  const missingDenominator = compareBallotToGovernor(parseQ(missingQuestion).towns.get('35'), governor, { candidate: 'd' });
  assert.equal(missingDenominator.question_votes, null); assert.equal(missingDenominator.count_ratio_percent, null);
  assert.equal(missingDenominator.vote_difference, null);
});

test('Governor overlapping/wrong-office/mismatched-roster sources cannot create a duplicate town partition', () => {
  for (const mutate of [raw => raw.supplemental_localities.push(clone(raw.supplemental_localities[0])),
    raw => raw.supplemental_localities[0].reporting_unit_id = raw.supplemental_localities[1].reporting_unit_id,
    raw => raw.supplemental_localities[0].county_fips = '25023', raw => raw.supplemental_localities[0].unit_kind = 'county',
    raw => raw.supplemental_localities[0].candidates[0].name = 'Other candidate',
    raw => raw.states[0].races[0].office = 'senate', raw => raw.supplemental_localities[0].reported_total = 1]) {
    const raw = governorPayload(); mutate(raw); assert.throws(() => parseG(raw));
  }
});

test('top vote ranking sorts the four selected raw counts and retains independent source clocks', () => {
  const question = parseQ(ballotRows()), governor = parseG(governorPayload());
  const result = rankBallotGovernorVotes(question.towns.get('35'), governor.towns.get('35'), { candidates: governor.choices });
  assert.equal(result.status, 'available'); assert.equal(result.geography_key, 'town:35'); assert.equal(result.max_votes, 60);
  assert.deepEqual(result.entries.map(entry => [entry.id, entry.votes]), [['governor:d', 60], ['question:yes', 55], ['question:no', 45], ['governor:r', 30]]);
  assert.deepEqual(result.leader_ids, ['governor:d']); assert.equal(result.tied, false);
  assert.equal(result.entries[0].source.checked_at, '2026-11-07T18:00:01Z');
  assert.equal(result.entries[1].source.checked_at, '2026-11-07T18:00:00Z');
  assert.equal(governor.choices.length, 3); assert.equal(governor.towns.get('35').counts.i, 10);
});

test('positive two-way and four-way ties return every tied ID rather than an arbitrary leader', () => {
  const governor = parseG(governorPayload()), question = parseQ(ballotRows(60, 40));
  const result = rankBallotGovernorVotes(question.towns.get('35'), governor.towns.get('35'), { candidates: governor.choices });
  assert.equal(result.tied, true); assert.deepEqual(result.leader_ids, ['question:yes', 'governor:d']);
  const raw = governorPayload(); raw.supplemental_localities[34].candidates = choices(50, 50, 10); raw.supplemental_localities[34].reported_total = 110;
  const tiedGovernor = parseG(raw), all = rankBallotGovernorVotes(parseQ(ballotRows(50, 50)).towns.get('35'), tiedGovernor.towns.get('35'), { candidates: tiedGovernor.choices });
  assert.equal(all.tied, true); assert.equal(all.max_votes, 50);
  assert.deepEqual(all.leader_ids, ['question:yes', 'question:no', 'governor:d', 'governor:r']);
});

test('all known zero counts have no leader, while any unknown selected count prevents a premature leader', () => {
  const raw = governorPayload(); raw.supplemental_localities[34].candidates = choices(0, 0, 0); raw.supplemental_localities[34].reported_total = 0;
  const emptyGovernor = parseG(raw), empty = rankBallotGovernorVotes(parseQ(ballotRows(0, 0)).towns.get('35'), emptyGovernor.towns.get('35'), { candidates: emptyGovernor.choices });
  assert.equal(empty.status, 'no_votes'); assert.equal(empty.max_votes, 0); assert.equal(empty.tied, false);
  assert.deepEqual(empty.leader_ids, []); assert(empty.entries.every(entry => entry.votes === 0));
  const missing = ballotRows(); missing.find(row => row.level === 'township' && row.reportingunitname === 'BOSTON' && row.last === 'Yes').votecount = null;
  const governor = parseG(governorPayload()), partial = rankBallotGovernorVotes(parseQ(missing).towns.get('35'), governor.towns.get('35'), { candidates: governor.choices });
  assert.equal(partial.status, 'incomplete'); assert.equal(partial.max_votes, null); assert.deepEqual(partial.leader_ids, []);
  assert.equal(partial.entries.at(-1).id, 'question:yes'); assert.equal(partial.entries.at(-1).votes, null);
  const missingGovernor = governorPayload(); missingGovernor.supplemental_localities[34].candidates[0].votes = null;
  const incompleteGovernor = parseG(missingGovernor), unknown = rankBallotGovernorVotes(parseQ(ballotRows()).towns.get('35'), incompleteGovernor.towns.get('35'), { candidates: incompleteGovernor.choices });
  assert.equal(unknown.status, 'incomplete'); assert.deepEqual(unknown.leader_ids, []);
});

test('rankings reuse matching state and county geography but reject cross-geography units and ambiguous main rosters', () => {
  const q = parseQ(ballotRows()), g = parseG(governorPayload());
  assert.equal(rankBallotGovernorVotes(q.state, g.state, { candidates: g.choices }).geography_key, 'state:MA');
  assert.equal(rankBallotGovernorVotes(q.counties.get('25025'), g.counties.get('25025'), { candidates: g.choices }).geography_key, 'county:25025');
  for (const other of [g.towns.get('1'), g.state, { ...g.towns.get('35'), county_fips: '25001' }]) {
    const result = rankBallotGovernorVotes(q.towns.get('35'), other, { candidates: g.choices });
    assert.equal(result.status, 'unavailable'); assert.deepEqual(result.entries, []); assert.deepEqual(result.leader_ids, []);
  }
  for (const roster of [[], [g.choices[0], g.choices[0]], g.choices.map(choice => ({ ...choice, main: true })), g.choices.map(choice => ({ ...choice, id: choice.id + '-wrong' }))]) {
    assert.equal(rankBallotGovernorVotes(q.towns.get('35'), g.towns.get('35'), { candidates: roster }).status, 'unavailable');
  }
});

test('the ranking scope is Yes/No and the two main Governor candidates; other Governor votes remain intact', () => {
  const raw = governorPayload(); raw.supplemental_localities[34].candidates = choices(60, 30, 300); raw.supplemental_localities[34].reported_total = 390;
  const g = parseG(raw), q = parseQ(ballotRows()), result = rankBallotGovernorVotes(q.towns.get('35'), g.towns.get('35'), { candidates: g.choices });
  assert.equal(g.towns.get('35').counts.i, 300); assert.equal(g.towns.get('35').reported_total, 390);
  assert.equal(result.entries.length, 4); assert(!result.entries.some(entry => entry.candidate_id === 'i'));
  assert.deepEqual(result.leader_ids, ['governor:d']);
});

test('question requests coalesce and failed refreshes preserve last-good counts with their original source clock', async () => {
  let requests = 0, failing = false, clock = Date.parse('2026-11-07T18:00:00Z');
  const loader = createMassachusettsResultsLoader({ crosswalk, cacheStorage: undefined, now: () => clock,
    fetcher: async (_url, options) => { requests++; assert.equal(options.credentials, 'omit'); assert.equal(options.mode, 'cors');
      return failing ? reply({}, 503) : reply(ballotRows(), 200, { 'Last-Modified': 'Fri, 06 Nov 2026 23:52:19 GMT' }); } });
  const [a, b] = await Promise.all([loader({ contest: 'question-1' }), loader({ contest: 'question-1' })]);
  assert.equal(a, b); assert.equal(requests, 1); await loader({ contest: 'question-1' }); assert.equal(requests, 1);
  const checked = a.source.checked_at; clock += 31_000; failing = true;
  const old = await loader({ contest: 'question-1', refresh: true });
  assert.equal(old.source.status, 'stale'); assert.equal(old.state.counts.yes, 351 * 55); assert.equal(old.source.checked_at, checked);
  assert.equal(old.source.updated_at, '2026-11-06T23:52:19.000Z'); assert.equal(old.towns.get('35').source.status, 'stale');
  clock += 31_000; failing = false; const next = await loader({ contest: 'question-1', refresh: true });
  assert.equal(next.source.status, 'available'); assert.equal(requests, 3);
});

test('saved raw question snapshots are revalidated across loader instances and remain available after a cold failure', async () => {
  const records = new Map(), store = { match: async request => records.get(request.url)?.clone(), put: async (request, response) => records.set(request.url, response.clone()),
    keys: async () => [...records.keys()].map(url => new Request(url)), delete: async request => records.delete(request.url) };
  const cacheStorage = { open: async () => store }, now = () => Date.parse('2026-11-07T18:00:00Z');
  const first = createMassachusettsResultsLoader({ crosswalk, cacheStorage, now, fetcher: async () => reply(ballotRows()) });
  await first({ contest: 'question-1' });
  const reloaded = createMassachusettsResultsLoader({ crosswalk, cacheStorage, now, fetcher: async () => reply({}, 503) });
  const old = await reloaded({ contest: 'question-1' }); assert.equal(old.source.status, 'stale'); assert.equal(old.state.reported_total, 35100);
});

test('crosswalk and source downloads are bounded, versioned, lazy and retryable', async () => {
  const versioned = await import('./massachusetts-results.js?v=ma-source-test'); const urls = []; let broken = true;
  const loader = versioned.createMassachusettsResultsLoader({ cacheStorage: undefined, fetcher: async url => {
    urls.push(String(url)); if (String(url).includes('ma-town-county')) return reply(crosswalk);
    return broken ? reply([], 200, { 'Content-Length': 3 * 1024 * 1024 }) : reply(ballotRows());
  } });
  assert.equal(urls.length, 0); await assert.rejects(loader({ contest: 'question-1' })); assert(urls[0].includes('?v=ma-source-test'));
  broken = false; const data = await loader({ contest: 'question-1' }); assert.equal(data.towns.size, 351); assert.equal(urls.length, 3);
  await assert.rejects(loader({ contest: 'question-10' }));
});

test('Governor refresh reuses the existing complete CNN adapter and retains cached counts on a malformed refresh', async () => {
  const calls = []; let broken = false, clock = Date.parse('2026-11-07T18:00:00Z');
  const loader = createMassachusettsResultsLoader({ crosswalk, cacheStorage: undefined, now: () => clock, governorFetcher: async (url, init = {}) => {
    calls.push([url, init.method]); if (url.endsWith('/refresh')) return reply({}, broken ? 503 : 200);
    return reply(broken ? {} : governorPayload());
  } });
  const first = await loader({ contest: 'governor' }); assert.equal(first.choices.length, 3);
  clock += 31_000; broken = true; const next = await loader({ contest: 'governor', refresh: true });
  assert.equal(next.source.status, 'stale'); assert.equal(next.towns.get('35').counts.i, 10);
  assert.deepEqual(calls.map(call => call[1]), [undefined, 'POST', undefined]);
});
