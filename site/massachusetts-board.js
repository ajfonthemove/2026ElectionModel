import { loadMassachusettsResults, compareBallotToGovernor, rankBallotGovernorVotes, MASSACHUSETTS_CONTESTS } from './massachusetts-results.js';
import { loadMassachusettsGeography, drawMassachusettsMap } from './massachusetts-map.js';
import { loadMassachusettsPresidentialHistory, compareMassachusettsPresidentialVotes, MASSACHUSETTS_PRESIDENTIAL_YEARS } from './ma-presidential-history.js';
import { loadMassachusettsGovernorHistory, compareMassachusettsGovernorVotes, MASSACHUSETTS_GOVERNOR_YEARS } from './ma-governor-history.js';
import { presidentialVoteDeviation, formatVoteDeviation, deviationFill } from './comparison-scale.js';

let instances = 0;
const COLORS = { yes: '#2c887d', no: '#c28b56', dem: '#77a8df', rep: '#dc8792', other: '#b3a1c5', empty: '#dce3eb' };
const finite = Number.isFinite;
const count = value => finite(value) ? value.toLocaleString('en-US') : '';
const signedCount = value => finite(value) ? (value > 0 ? '+' : value < 0 ? '−' : '') + count(Math.abs(value)) : '';
const pct = value => finite(value) ? value.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%' : '';
const pp = value => finite(value) ? (value > 0 ? '+' : value < 0 ? '−' : '') + Math.abs(value).toFixed(1) + ' pp' : '';
const party = value => ({ D: 'dem', DEM: 'dem', DEMOCRATIC: 'dem', R: 'rep', REP: 'rep', REPUBLICAN: 'rep' })[String(value || '').toUpperCase()] || 'other';
const node = (tag, text, className) => { const element = document.createElement(tag); if (text != null) element.textContent = text; if (className) element.className = className; return element; };
const choicesOf = dataset => Array.isArray(dataset?.choices) ? dataset.choices : [];
const unitsOf = (dataset, level) => dataset?.[level === 'county' ? 'counties' : 'towns'] instanceof Map ? dataset[level === 'county' ? 'counties' : 'towns'] : new Map();
const unitCount = (unit, id) => finite(unit?.counts?.[id]) ? unit.counts[id] : null;
const choiceName = choice => choice?.label || choice?.name || '';
function sourceRemainder(dataset, unit) { const values = choicesOf(dataset).map(choice => unitCount(unit, choice.id)); return finite(unit?.reported_total) && values.length && values.every(finite) ? unit.reported_total - values.reduce((sum, value) => sum + value, 0) : null; }
function eastern(value) { const date = value && new Date(value); return date && finite(date.getTime()) ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date) + ' ET' : ''; }
function link(url, label) { const element = node('a', label); if (/^https?:\/\//.test(url || '')) { element.href = url; element.target = '_blank'; element.rel = 'noopener noreferrer'; } return element; }
function ratioColor(value) { const fraction = Math.max(0, Math.min(1, value / 200)); return 'rgb(' + [111, 76, 154].map((end, index) => Math.round([244, 241, 249][index] + fraction * (end - [244, 241, 249][index]))).join(',') + ')'; }
function gapColor(value, extent = 30) { const end = value >= 0 ? [111, 76, 154] : [188, 126, 65], fraction = Math.min(1, Math.abs(value) / extent); return 'rgb(' + end.map((channel, index) => Math.round([245, 243, 240][index] + fraction * (channel - [245, 243, 240][index]))).join(',') + ')'; }
function reportedLeader(dataset, unit) {
  const choices = choicesOf(dataset), values = choices.map(choice => ({ choice, votes: unitCount(unit, choice.id) }));
  if (!values.length || values.some(row => !finite(row.votes))) return null;
  const sum = values.reduce((total, row) => total + row.votes, 0);
  if (!finite(unit?.reported_total) || sum > unit.reported_total) return null;
  values.sort((a, b) => b.votes - a.votes);
  return values[0].votes > 0 && values[0].votes - (values[1]?.votes ?? 0) > unit.reported_total - sum ? values[0].choice : null;
}

/** A scoped Massachusetts panel; national office/map state remains with the caller. */
export function mountMassachusettsBoard(container, { mode = 'ballot', governorDisplay = 'results', presidentYear = 2024, presidentParty = 'dem', presidentMetric = 'ratio', onModeChange = () => {}, onExit = () => {} } = {}) {
  if (!(container instanceof Element)) throw new Error('A Massachusetts board container is required.');
  const prefix = 'ma-' + (++instances), refs = {}, datasets = new Map(), geographies = new Map(), histories = new Map(), governorHistories = new Map();
  const state = { mode: mode === 'governor' ? 'governor' : 'ballot', question: 'question-1', display: 'results', governorDisplay: governorDisplay === 'president' ? 'president' : 'results', governorHistoryYear: 2022, presidentYear: MASSACHUSETTS_PRESIDENTIAL_YEARS.includes(presidentYear) ? presidentYear : 2024, presidentParty: presidentParty === 'rep' ? 'rep' : 'dem', presidentMetric: presidentMetric === 'margin-shift' ? 'margin-shift' : 'ratio', response: 'yes', candidate: '', metric: 'ratio', level: 'town', selected: '', search: '', sort: 'votes', pending: false, error: '', revision: 0, destroyed: false };
  const root = node('section', null, 'ma-board'); root.setAttribute('aria-label', 'Massachusetts town and ballot question results');
  const mark = (element, type, name) => { element.dataset[type === 'control' ? 'maControl' : 'maRole'] = name; refs[name] = element; return element; };
  const button = (label, key, action, className = '') => { const element = mark(node('button', label, className), 'control', key); element.type = 'button'; element.addEventListener('click', action); return element; };
  const select = (label, key, options, action) => {
    const wrapper = node('label', null, 'ma-field'); const caption = node('span', label), element = mark(node('select'), 'control', key); element.id = prefix + '-' + key; wrapper.htmlFor = element.id;
    options.forEach(([value, text]) => { const option = node('option', text); option.value = value; element.append(option); }); element.addEventListener('change', event => action(event.target.value)); wrapper.append(caption, element); return wrapper;
  };
  const activeContest = () => state.mode === 'governor' ? 'governor' : state.question;
  const currentData = () => datasets.get(activeContest());
  const governorData = () => datasets.get('governor');
  const comparing = () => state.mode === 'ballot' && state.display === 'governor';
  const topVotes = () => state.mode === 'ballot' && state.display === 'top-vote';
  const needsGovernor = () => comparing() || topVotes();
  const versusPresident = () => state.mode === 'governor' && state.governorDisplay === 'president';
  const versusGovernor = () => state.mode === 'governor' && state.governorDisplay === 'history';
  const historicalComparison = () => versusPresident() || versusGovernor();
  const sortableComparison = () => needsGovernor() || historicalComparison();
  const referenceYear = () => versusGovernor() ? state.governorHistoryYear : state.presidentYear;
  const referenceOffice = () => versusGovernor() ? 'Governor' : 'President';
  const historicalData = () => versusGovernor() ? governorHistories.get(state.governorHistoryYear) : histories.get(state.presidentYear);
  const historyMetricKey = key => (versusGovernor() ? 'governor-history-' : 'president-') + key;
  const mainCandidates = () => choicesOf(governorData()).filter(choice => choice.main === true);
  const governorChoice = () => mainCandidates().find(choice => choice.id === state.candidate) || mainCandidates()[0] || null;
  const selectedUnit = dataset => state.selected ? unitsOf(dataset, state.level).get(state.selected) || null : dataset?.state || null;
  const comparisonFor = (unit, governor) => {
    if (!unit || !governor || !governorChoice()) return null;
    return compareBallotToGovernor(unit, governor, { response: state.response, candidate: governorChoice().id });
  };
  const rankingFor = unit => rankBallotGovernorVotes(unit, selectedGovernorUnit(unit), { candidates: choicesOf(governorData()) });
  const entryColor = entry => entry?.kind === 'question' ? COLORS[entry.response] : COLORS[party(entry?.party)];
  const rankingLeaders = ranking => ranking?.entries?.filter(entry => ranking.leader_ids.includes(entry.id)) || [];
  const rankingLabel = ranking => { const leaders = rankingLeaders(ranking); return leaders.length ? (ranking.tied ? 'Tie: ' : '') + leaders.map(entry => entry.label).join(' / ') : ''; };
  const historicalReference = unit => unit?.level === 'state' ? historicalData()?.state : unitsOf(historicalData(), state.level).get(unit?.id);
  const historyFor = unit => (versusGovernor() ? compareMassachusettsGovernorVotes : compareMassachusettsPresidentialVotes)(unit, historicalReference(unit), { candidates: choicesOf(governorData()) });
  const nomineeName = side => choiceName(historicalData()?.nominees?.[side]);
  const governorPartyName = side => choiceName(mainCandidates().find(choice => party(choice.party) === side)) || (side === 'dem' ? 'Democratic candidate' : 'Republican candidate');
  const historyCountValue = ratioPercent => versusPresident() ? presidentialVoteDeviation(ratioPercent) : ratioPercent;
  const historyCountLabel = ratioPercent => versusPresident() ? formatVoteDeviation(presidentialVoteDeviation(ratioPercent)) : pct(ratioPercent);
  const presidentMetricValue = result => state.presidentMetric === 'ratio' ? historyCountValue(result?.ratios?.[state.presidentParty]?.percent) : result?.shift_pp;
  const title = () => state.mode === 'governor' ? 'Massachusetts Governor' : MASSACHUSETTS_CONTESTS.find(contest => contest.id === state.question)?.title || currentData()?.title || 'Massachusetts ballot questions';

  const navigation = node('div', null, 'ma-panel-navigation');
  const modes = node('div', null, 'ma-button-group'); modes.setAttribute('role', 'group'); modes.setAttribute('aria-label', 'Massachusetts election view');
  modes.append(button('Ballot questions', 'mode-ballot', () => setMode('ballot')), button('Governor', 'mode-governor', () => setMode('governor')));
  navigation.append(modes, button('Back to U.S.', 'exit', () => onExit())); root.append(navigation);
  const controls = node('div', null, 'ma-controls');
  const questionField = select('Ballot question', 'question', MASSACHUSETTS_CONTESTS.filter(contest => contest.kind === 'question').map(contest => [contest.id, contest.title]), value => { state.question = value; load(); });
  controls.append(questionField);
  const displayControls = node('div', null, 'ma-display-controls'), displayGroup = node('div', null, 'ma-button-group'); displayGroup.setAttribute('role', 'group'); displayGroup.setAttribute('aria-label', 'Ballot question map display');
  displayGroup.append(button('Results', 'display-results', () => { state.display = 'results'; render(); }), button('Governor vs ballot question', 'display-governor', () => { state.display = 'governor'; load(); }), button('Top vote getter', 'display-top-vote', () => { state.display = 'top-vote'; load(); })); displayControls.append(displayGroup); controls.append(displayControls);
  const governorDisplayControls = node('div', null, 'ma-display-controls'), governorDisplayGroup = node('div', null, 'ma-button-group'); governorDisplayGroup.setAttribute('role', 'group'); governorDisplayGroup.setAttribute('aria-label', 'Governor map display');
  governorDisplayGroup.append(button('Results', 'display-gov-results', () => { state.governorDisplay = 'results'; render(); }), button('Votes vs President', 'display-president', () => { state.governorDisplay = 'president'; load(); }), button('Votes vs past Governor', 'display-governor-history', () => { state.governorDisplay = 'history'; load(); })); governorDisplayControls.append(governorDisplayGroup); controls.append(governorDisplayControls);
  const comparisonControls = node('div', null, 'ma-comparison-controls');
  comparisonControls.append(select('Governor candidate', 'candidate', [], value => { state.candidate = value; render(); }), select('Ballot response', 'response', [['yes', 'Yes'], ['no', 'No']], value => { state.response = value; render(); }), select('Map colors', 'metric', [['ratio', 'Candidate / ballot votes'], ['vote-difference', 'Ballot − candidate votes'], ['share-gap', 'Ballot − candidate share']], value => { state.metric = value; render(); }));
  controls.append(comparisonControls); root.append(controls);
  const presidentControls = node('div', null, 'ma-comparison-controls');
  const presidentYearField = select('Presidential year', 'president-year', MASSACHUSETTS_PRESIDENTIAL_YEARS.map(year => [String(year), String(year)]), value => { state.presidentYear = Number(value); load(); });
  const governorYearField = select('Governor year', 'governor-history-year', MASSACHUSETTS_GOVERNOR_YEARS.map(year => [String(year), String(year)]), value => { state.governorHistoryYear = Number(value); load(); });
  presidentControls.append(presidentYearField, governorYearField, select('Map party', 'president-party', [['dem', 'Democratic'], ['rep', 'Republican']], value => { state.presidentParty = value; render(); }), select('Map colors', 'president-metric', [['ratio', 'Candidate / President votes'], ['margin-shift', 'D−R margin change']], value => { state.presidentMetric = value; render(); })); controls.append(presidentControls);
  const status = mark(node('p', null, 'ma-status'), 'role', 'status'); status.setAttribute('role', 'status'); status.hidden = true; root.append(status);
  const layout = node('div', null, 'ma-layout'), mapPanel = node('section', null, 'ma-map-panel');
  const mapHeader = node('div', null, 'ma-map-heading'), heading = node('div'); heading.append(node('p', 'MASSACHUSETTS · 2026 GENERAL ELECTION', 'ma-eyebrow'));
  const mapTitle = mark(node('h2'), 'role', 'title'); mapTitle.id = prefix + '-title'; heading.append(mapTitle); mapPanel.setAttribute('aria-labelledby', mapTitle.id);
  mapHeader.append(heading, button('Refresh', 'refresh', () => load(true))); mapPanel.append(mapHeader);
  const mapNav = node('div', null, 'ma-map-navigation'), levelGroup = node('div', null, 'ma-button-group'); levelGroup.setAttribute('role', 'group'); levelGroup.setAttribute('aria-label', 'Map geography');
  levelGroup.append(button('Towns', 'level-town', () => setLevel('town')), button('Counties', 'level-county', () => setLevel('county')));
  mapNav.append(levelGroup, button('Statewide', 'statewide', () => { state.selected = ''; render(); })); mapPanel.append(mapNav);
  const map = mark(node('div', null, 'ma-map'), 'role', 'map'); mapPanel.append(map);
  const legend = mark(node('div', null, 'ma-legend'), 'role', 'legend'); mapPanel.append(legend);
  const source = mark(node('div', null, 'ma-map-source'), 'role', 'source'); mapPanel.append(source);
  const inspector = mark(node('aside', null, 'ma-inspector'), 'role', 'inspector'); inspector.setAttribute('aria-label', 'Selected Massachusetts results'); layout.append(mapPanel, inspector); root.append(layout);
  const tablePanel = node('section', null, 'ma-table-panel'), tableHeading = node('div', null, 'ma-table-heading'), tableTitle = mark(node('h2'), 'role', 'table-title'); tableTitle.id = prefix + '-table-title'; tablePanel.setAttribute('aria-labelledby', tableTitle.id); tableHeading.append(tableTitle);
  const tableControls = node('div', null, 'ma-table-controls'), searchField = node('label', null, 'ma-field'); searchField.append(node('span', 'Find a town'));
  const search = mark(node('input'), 'control', 'search'); search.type = 'search'; search.id = prefix + '-search'; search.autocomplete = 'off'; search.placeholder = 'Town name'; searchField.htmlFor = search.id; search.addEventListener('input', event => { state.search = event.target.value; renderTable(); }); searchField.append(search);
  tableControls.append(searchField, select('Sort', 'sort', [['votes', 'Most votes'], ['name', 'A–Z'], ['comparison', 'Highest comparison']], value => { state.sort = value; renderTable(); })); tableHeading.append(tableControls); tablePanel.append(tableHeading);
  const tableWrap = node('div', null, 'ma-table-wrap'); tableWrap.tabIndex = 0; tableWrap.setAttribute('role', 'region'); tableWrap.setAttribute('aria-label', 'Scrollable Massachusetts results table');
  const table = node('table', null, 'ma-table'), caption = node('caption', 'Reported results for each Massachusetts community.', 'visually-hidden'), head = mark(node('thead'), 'role', 'table-head'), body = mark(node('tbody'), 'role', 'table-body'); table.append(caption, head, body); tableWrap.append(table); tablePanel.append(tableWrap); root.append(tablePanel); container.replaceChildren(root);

  function selectedGovernorUnit(unit) { return unit?.level === 'state' ? governorData()?.state : unitsOf(governorData(), state.level).get(unit?.id); }
  function comparisonValue(result) { return state.metric === 'ratio' ? result?.count_ratio_percent : state.metric === 'vote-difference' ? result?.vote_difference : result?.share_gap_pp; }
  function voteDifferenceExtent() {
    const values = [...unitsOf(currentData(), state.level).values()].map(unit => comparisonFor(unit, selectedGovernorUnit(unit))?.vote_difference).filter(finite);
    const maximum = Math.max(1, ...values.map(Math.abs)), magnitude = 10 ** Math.floor(Math.log10(maximum));
    return Math.ceil(maximum / magnitude) * magnitude;
  }
  function mapValue(dataset, unit, rawExtent = 30) {
    if (historicalComparison()) {
      const value = presidentMetricValue(historyFor(unit));
      return finite(value) ? { name: unit.name, fill: state.presidentMetric === 'ratio' ? versusPresident() ? deviationFill(value) : ratioColor(value) : gapColor(value), description: state.presidentMetric === 'ratio' ? versusPresident() ? governorPartyName(state.presidentParty) + ' votes vs ' + nomineeName(state.presidentParty) + ' ' + referenceYear() + ': ' + formatVoteDeviation(value) : governorPartyName(state.presidentParty) + ' / ' + nomineeName(state.presidentParty) + ': ' + pct(value) : 'D−R margin change vs ' + referenceYear() + ' ' + referenceOffice() + ': ' + pp(value) } : { name: unit.name, description: '' };
    }
    if (topVotes()) {
      const ranking = rankingFor(unit), leaders = rankingLeaders(ranking);
      return { name: unit.name, fill: leaders.length ? ranking.tied ? '#817587' : entryColor(leaders[0]) : COLORS.empty,
        description: leaders.length ? 'Top vote getter: ' + rankingLabel(ranking) + ' · ' + count(ranking.max_votes) + (ranking.tied ? ' votes each' : ' votes') : '' };
    }
    if (comparing()) {
      const result = comparisonFor(unit, selectedGovernorUnit(unit)), value = comparisonValue(result);
      const candidate = choiceName(governorChoice()), response = state.response === 'yes' ? 'Yes' : 'No';
      return finite(value) ? { fill: state.metric === 'ratio' ? ratioColor(value) : gapColor(value, state.metric === 'vote-difference' ? rawExtent : 30), name: unit.name, description: state.metric === 'ratio' ? candidate + ' / ' + response + ': ' + pct(value) : state.metric === 'vote-difference' ? response + ' votes − ' + candidate + ' votes: ' + signedCount(value) : response + ' share − ' + candidate + ' share: ' + pp(value) } : { name: unit.name, description: '' };
    }
    const lead = reportedLeader(dataset, unit), color = state.mode === 'ballot' ? COLORS[lead?.id] : COLORS[party(lead?.party)];
    return { name: unit.name, fill: lead ? color : COLORS.empty, description: lead ? choiceName(lead) + ' leads · ' + count(unit.reported_total) + (state.mode === 'ballot' ? ' Yes + No votes' : ' votes') : '' };
  }
  function renderSource(target, dataset, label = '') {
    if (!dataset) return;
    const row = node('div', null, 'ma-source-row'), dataSource = dataset.source || {};
    if (label) row.append(node('strong', label + ': '));
    row.append(link(dataSource.url, dataSource.name || 'Source'));
    const updated = eastern(dataSource.updated_at || dataSource.last_modified), checked = eastern(dataSource.checked_at);
    if (updated || checked) row.append(node('span', updated ? 'Updated ' + updated : 'Checked ' + checked));
    target.append(row);
  }
  function renderChoices(target, dataset, unit) {
    for (const choice of choicesOf(dataset)) {
      const votes = unitCount(unit, choice.id); if (!finite(votes)) continue;
      const code = state.mode === 'ballot' ? choice.id : party(choice.party), row = node('div', null, 'ma-result-row ' + code), line = node('div', null, 'ma-result-line');
      row.dataset.choiceId = choice.id;
      const name = node('span', choiceName(choice)); if (state.mode === 'governor' && choice.party) name.append(node('small', choice.party));
      const numbers = node('div', null, 'ma-result-numbers');
      if (finite(unit?.reported_total) && unit.reported_total > 0) numbers.append(node('strong', pct(votes / unit.reported_total * 100)));
      numbers.append(node('span', count(votes) + ' votes')); line.append(name, numbers); row.append(line);
      if (finite(unit?.reported_total) && unit.reported_total > 0) { const track = node('div', null, 'ma-vote-track'), bar = node('span'); bar.style.width = Math.max(0, Math.min(100, votes / unit.reported_total * 100)) + '%'; track.append(bar); row.append(track); }
      target.append(row);
    }
    const remainder = sourceRemainder(dataset, unit);
    if (state.mode === 'governor' && remainder > 0) { const row = node('div', null, 'ma-result-row ma-unassigned'), line = node('div', null, 'ma-result-line'); row.dataset.choiceId = 'unattributed'; line.append(node('span', 'Other source votes'), node('strong', count(remainder))); row.append(line); target.append(row); }
  }
  function renderComparison(target, unit) {
    const governor = selectedGovernorUnit(unit), result = comparisonFor(unit, governor), candidate = governorChoice();
    if (!result || !candidate) return;
    const response = state.response === 'yes' ? 'Yes' : 'No', box = node('section', null, 'ma-comparison-card');
    box.append(node('h4', choiceName(candidate) + ' vs ' + response + ' votes'));
    if (finite(result.count_ratio_percent)) { const ratio = node('strong', pct(result.count_ratio_percent), 'ma-comparison-ratio'); ratio.dataset.ratioPercent = String(result.count_ratio_percent); ratio.dataset.maMetric = 'count-ratio'; box.append(ratio, node('p', choiceName(candidate) + ' votes / ' + response + ' votes', 'ma-comparison-caption')); }
    const pairs = node('dl', null, 'ma-comparison-counts');
    for (const [label, value, role] of [[choiceName(candidate) + ' votes', result.governor_votes, 'governor-count'], [response + ' votes', result.question_votes, 'question-count']]) if (finite(value)) { const row = node('div'), number = node('dd', count(value)); number.dataset.maMetric = role; row.append(node('dt', label), number); pairs.append(row); }
    if (pairs.childNodes.length) box.append(pairs);
    const shares = node('div', null, 'ma-comparison-shares');
    for (const [label, value] of [[response + ' share of Yes + No', result.question_share_percent], [choiceName(candidate) + ' share of Governor votes', result.governor_share_percent]]) if (finite(value)) { const row = node('div'); row.append(node('span', label), node('strong', pct(value))); shares.append(row); }
    if (finite(result.vote_difference)) { const row = node('div', null, 'ma-share-gap'), difference = node('strong', signedCount(result.vote_difference) + ' votes'); difference.dataset.maMetric = 'vote-difference'; row.append(node('span', response + ' votes − ' + choiceName(candidate) + ' votes'), difference); shares.append(row); }
    if (finite(result.share_gap_pp)) { const row = node('div', null, 'ma-share-gap'), gap = node('strong', pp(result.share_gap_pp)); gap.dataset.maMetric = 'share-gap'; row.append(node('span', response + ' share − ' + choiceName(candidate) + ' share'), gap); shares.append(row); }
    if (shares.childNodes.length) box.append(shares);
    if (box.childNodes.length > 1) target.append(box);
  }
  function renderRanking(target, unit) {
    const ranking = rankingFor(unit); if (!ranking.entries.length) return;
    const box = node('section', null, 'ma-top-vote-card'); box.dataset.maRole = 'top-vote-ranking'; box.append(node('h4', 'Top vote getter'));
    const label = rankingLabel(ranking);
    if (label) { const lead = node('p', label, 'ma-top-vote-lead'); lead.dataset.maMetric = 'top-vote'; lead.dataset.leaderIds = JSON.stringify(ranking.leader_ids); box.append(lead); }
    const list = node('ul', null, 'ma-top-vote-list');
    for (const entry of ranking.entries) {
      if (!finite(entry.votes)) continue;
      const row = node('li', null, 'ma-top-vote-row'); row.dataset.rankEntry = entry.id; row.dataset.topVoteLeader = String(ranking.leader_ids.includes(entry.id));
      const line = node('div', null, 'ma-result-line'), label = node('span', entry.label), votes = node('strong', count(entry.votes) + ' votes'); votes.dataset.rankVotes = String(entry.votes); line.append(label, votes); row.append(line);
      if (ranking.max_votes > 0) { const track = node('div', null, 'ma-vote-track'), bar = node('span'); bar.style.width = (entry.votes / ranking.max_votes * 100) + '%'; bar.style.background = entryColor(entry); track.append(bar); row.append(track); }
      list.append(row);
    }
    box.append(list); target.append(box);
  }
  function renderHistoricalComparison(target, unit) {
    const result = historyFor(unit), card = node('section', null, 'ma-comparison-card ma-president-card'); card.dataset.maRole = versusGovernor() ? 'governor-history-comparison' : 'president-comparison'; card.append(node('h4', 'Votes vs ' + referenceYear() + ' ' + referenceOffice()));
    for (const side of ['dem', 'rep']) {
      const pair = result?.ratios?.[side]; if (!pair) continue;
      const section = node('section', null, 'ma-president-pair'); section.dataset.presidentParty = side;
      section.append(node('h5', governorPartyName(side) + (versusPresident() ? ' vs ' : ' / ') + nomineeName(side)));
      if (finite(pair.percent)) { const ratio = node('strong', historyCountLabel(pair.percent), 'ma-comparison-ratio'); ratio.dataset.maMetric = historyMetricKey('ratio-' + side); ratio.dataset.ratioPercent = String(pair.percent); if (versusPresident()) { const deviation = presidentialVoteDeviation(pair.percent); ratio.dataset.deviationPercent = String(deviation); ratio.classList.add('ma-comparison-deviation', Math.abs(deviation) < 0.05 ? 'equal' : deviation < 0 ? 'below' : 'above'); } section.append(ratio); }
      const counts = node('dl', null, 'ma-comparison-counts');
      for (const [label, value, key] of [[governorPartyName(side) + ' votes', pair.current_count, 'current'], [nomineeName(side) + (versusGovernor() ? ' ' + referenceYear() : '') + ' votes', pair.historical_count, 'historical']]) if (finite(value)) { const row = node('div'), number = node('dd', count(value)); number.dataset.maMetric = historyMetricKey(side + '-' + key); row.append(node('dt', label), number); counts.append(row); }
      if (counts.childNodes.length) section.append(counts);
      const gaps = node('div', null, 'ma-comparison-shares');
      for (const [label, value, key, format] of [[versusGovernor() ? '2026 − ' + referenceYear() + ' votes' : 'Candidate − President votes', pair.vote_difference, 'vote-difference', value => signedCount(value) + ' votes'], [versusGovernor() ? '2026 − ' + referenceYear() + ' share' : 'Candidate − President share', pair.share_gap_pp, 'share-gap', pp]]) if (finite(value)) { const row = node('div', null, 'ma-share-gap'), number = node('strong', format(value)); number.dataset.maMetric = historyMetricKey(side + '-' + key); row.append(node('span', label), number); gaps.append(row); }
      if (gaps.childNodes.length) section.append(gaps);
      if (section.childNodes.length > 1) card.append(section);
    }
    if (finite(result?.shift_pp)) { const row = node('div', null, 'ma-president-shift'), number = node('strong', pp(result.shift_pp)); number.dataset.maMetric = historyMetricKey('margin-shift'); row.append(node('span', 'D−R margin change vs ' + referenceYear()), number); card.append(row); }
    if (card.childNodes.length > 1) target.append(card);
  }
  function renderInspector() {
    const dataset = currentData(), unit = selectedUnit(dataset); inspector.replaceChildren();
    inspector.append(node('p', state.selected ? state.level === 'town' ? 'CITY / TOWN RESULTS' : 'COUNTY RESULTS' : 'STATEWIDE RESULTS', 'ma-eyebrow'), node('h2', unit?.name || 'Massachusetts'));
    inspector.append(node('h3', dataset?.title || title()));
    if (!dataset || !unit) return;
    if (state.mode === 'ballot' && dataset.summary) { const summary = node('p', dataset.summary, 'ma-question-summary'); if (dataset.source_url) summary.append(document.createTextNode(' '), link(dataset.source_url, 'Question wording')); inspector.append(summary); }
    if (comparing()) renderComparison(inspector, unit);
    if (historicalComparison()) renderHistoricalComparison(inspector, unit);
    if (topVotes()) renderRanking(inspector, unit); else renderChoices(inspector, dataset, unit);
    if (!topVotes() && finite(unit.reported_total)) { const total = node('div', null, 'ma-total'); total.append(node('span', state.mode === 'ballot' ? 'Yes + No votes' : 'Total votes'), node('strong', count(unit.reported_total))); inspector.append(total); }
    const reporting = unit.precincts_reporting, total = unit.precincts_total;
    if (!topVotes() && finite(reporting) && finite(total)) { const progress = node('div', null, 'ma-precincts'); progress.append(node('span', 'Precincts reporting'), node('strong', count(reporting) + ' / ' + count(total))); inspector.append(progress); }
    const sources = node('div', null, 'ma-inspector-sources'); renderSource(sources, dataset, state.mode === 'ballot' ? 'Question' : 'Governor'); if (needsGovernor()) renderSource(sources, governorData(), 'Governor'); if (historicalComparison()) renderSource(sources, historicalData(), referenceYear() + ' ' + referenceOffice()); inspector.append(sources);
  }
  function renderLegend() {
    legend.replaceChildren();
    if (historicalComparison()) {
      const label = node('strong', state.presidentMetric === 'ratio' ? governorPartyName(state.presidentParty) + (versusPresident() ? ' vote change vs ' : ' votes / ') + nomineeName(state.presidentParty) + (versusPresident() ? '' : ' votes') + ' (' + referenceYear() + ')' : 'Governor D−R margin − ' + referenceYear() + ' ' + referenceOffice() + ' D−R margin');
      const scale = node('span', null, 'ma-scale ' + (state.presidentMetric === 'ratio' ? versusPresident() ? 'deviation' : 'ratio' : 'gap')), labels = node('span', null, 'ma-scale-labels');
      for (const value of state.presidentMetric === 'ratio' ? versusPresident() ? ['−100%', '0%', '+100%+'] : ['0%', '100%', '200%+'] : ['−30 pp', '0', '+30 pp']) labels.append(node('span', value));
      const group = node('span', null, 'ma-scale-group'); group.append(scale, labels); legend.append(label, group);
    } else if (topVotes()) {
      legend.append(node('strong', 'Highest raw vote count: Yes, No, or either Governor candidate'));
      const choices = [{ label: 'Yes', color: COLORS.yes }, { label: 'No', color: COLORS.no }, ...mainCandidates().map(choice => ({ label: choiceName(choice), color: COLORS[party(choice.party)] }))];
      if ([...unitsOf(currentData(), state.level).values()].some(unit => rankingFor(unit).tied)) choices.push({ label: 'Tie', color: '#817587' });
      for (const choice of choices) { const item = node('span', null, 'ma-legend-item'), chip = node('i'); chip.style.background = choice.color; item.append(chip, node('span', choice.label)); legend.append(item); }
    } else if (comparing()) {
      if (!governorChoice()) return;
      const response = state.response === 'yes' ? 'Yes' : 'No', candidate = choiceName(governorChoice());
      const label = node('strong', state.metric === 'ratio' ? candidate + ' votes / ' + response + ' votes' : state.metric === 'vote-difference' ? response + ' votes − ' + candidate + ' votes' : response + ' share − ' + candidate + ' share');
      const scale = node('span', null, 'ma-scale ' + (state.metric === 'ratio' ? 'ratio' : 'gap')), labels = node('span', null, 'ma-scale-labels');
      const extent = state.metric === 'vote-difference' ? voteDifferenceExtent() : 30;
      for (const text of state.metric === 'ratio' ? ['0%', '100%', '200%+'] : state.metric === 'vote-difference' ? ['−' + count(extent) + ' votes', '0', '+' + count(extent) + ' votes'] : ['−30 pp', '0', '+30 pp']) labels.append(node('span', text));
      const group = node('span', null, 'ma-scale-group'); group.append(scale, labels); legend.append(label, group);
    } else {
      const choices = state.mode === 'ballot' ? [{ label: 'Yes leads', color: COLORS.yes }, { label: 'No leads', color: COLORS.no }] : [{ label: 'Democratic lead', color: COLORS.dem }, { label: 'Republican lead', color: COLORS.rep }, { label: 'Other lead', color: COLORS.other }];
      for (const choice of choices) { const item = node('span', null, 'ma-legend-item'), chip = node('i'); chip.style.background = choice.color; item.append(chip, node('span', choice.label)); legend.append(item); }
    }
  }
  function renderMap() {
    const geography = geographies.get(state.level), dataset = currentData();
    if (!geography) { map.replaceChildren(); if (state.pending) map.append(node('p', 'Loading map…', 'ma-loading')); else map.append(button('Refresh map', 'retry-map', () => load())); return; }
    const rawExtent = comparing() && state.metric === 'vote-difference' ? voteDifferenceExtent() : 30;
    const values = new Map(); for (const [id, unit] of unitsOf(dataset, state.level)) values.set(id, mapValue(dataset, unit, rawExtent));
    const focused = document.activeElement?.closest('[data-ma-unit-id]')?.dataset.maUnitId;
    drawMassachusettsMap(map, { geography, values, selected: state.selected, onSelect: id => { state.selected = String(id); render(); } });
    if (focused) map.querySelector('[data-ma-unit-id="' + focused + '"]')?.focus({ preventScroll: true });
  }
  function renderTable() {
    const dataset = currentData(), sourceUnits = unitsOf(dataset, state.level), choices = choicesOf(dataset), query = state.search.trim().toLocaleLowerCase();
    const rows = [...sourceUnits.values()].filter(unit => !query || unit.name.toLocaleLowerCase().includes(query));
    const compareValue = unit => historicalComparison() ? presidentMetricValue(historyFor(unit)) : topVotes() ? rankingLeaders(rankingFor(unit)).length ? rankingFor(unit).max_votes : null : comparisonValue(comparisonFor(unit, selectedGovernorUnit(unit)));
    rows.sort((a, b) => { if (state.sort === 'name') return a.name.localeCompare(b.name); const av = state.sort === 'comparison' && sortableComparison() ? compareValue(a) : a.reported_total, bv = state.sort === 'comparison' && sortableComparison() ? compareValue(b) : b.reported_total; return finite(av) && finite(bv) ? bv - av || a.name.localeCompare(b.name) : finite(av) ? -1 : finite(bv) ? 1 : a.name.localeCompare(b.name); });
    tableTitle.textContent = (state.level === 'town' ? 'Town' : 'County') + (topVotes() ? ' top vote getters' : ' results');
    searchField.querySelector('span').textContent = state.level === 'town' ? 'Find a town' : 'Find a county'; search.placeholder = state.level === 'town' ? 'Town name' : 'County name';
    const comparisonSort = refs.sort.querySelector('[value="comparison"]'); comparisonSort.disabled = !sortableComparison(); comparisonSort.textContent = topVotes() ? 'Top vote count' : 'Highest comparison'; if (!sortableComparison() && state.sort === 'comparison') { state.sort = 'votes'; refs.sort.value = state.sort; }
    const showRemainder = state.mode === 'governor' && [...sourceUnits.values()].some(unit => sourceRemainder(dataset, unit) > 0);
    const tr = node('tr'); const headers = topVotes() ? [state.level === 'town' ? 'City / town' : 'County', 'Top vote getter', 'Yes', 'No', ...mainCandidates().map(choiceName)] : [state.level === 'town' ? 'City / town' : 'County', ...choices.map(choiceName), ...(showRemainder ? ['Other source votes'] : []), state.mode === 'ballot' ? 'Yes + No' : 'Total votes'];
    if (comparing()) headers.push((choiceName(governorChoice()) || 'Governor candidate') + ' / ' + (state.response === 'yes' ? 'Yes' : 'No'), 'Ballot − candidate votes', 'Ballot − candidate share');
    if (historicalComparison()) headers.push(governorPartyName('dem') + (versusPresident() ? ' vs ' : ' / ') + nomineeName('dem'), governorPartyName('rep') + (versusPresident() ? ' vs ' : ' / ') + nomineeName('rep'), 'D−R margin vs ' + referenceYear());
    const columnKeys = topVotes() ? ['unit', 'top-vote', 'question:yes', 'question:no', ...mainCandidates().map(choice => 'governor:' + choice.id)] : ['unit', ...choices.map(choice => choice.id), ...(showRemainder ? ['unattributed'] : []), 'total', ...(comparing() ? ['count-ratio', 'vote-difference', 'share-gap'] : []), ...(historicalComparison() ? [historyMetricKey('ratio-dem'), historyMetricKey('ratio-rep'), historyMetricKey('margin-shift')] : [])];
    for (const [index, label] of headers.entries()) { const th = node('th', label); th.scope = 'col'; th.dataset.column = columnKeys[index]; tr.append(th); } head.replaceChildren(tr);
    const activeId = document.activeElement?.closest('tr[data-unit-id]')?.dataset.unitId, existing = new Map([...body.children].map(row => [row.dataset.unitId, row]));
    for (const [position, unit] of rows.entries()) {
      let row = existing.get(unit.id); existing.delete(unit.id);
      if (!row) { row = node('tr'); row.dataset.unitId = unit.id; const th = node('th'); th.scope = 'row'; const selectUnit = node('button'); selectUnit.type = 'button'; selectUnit.addEventListener('click', () => { state.selected = unit.id; render(); }); th.append(selectUnit); row.append(th); }
      row.classList.toggle('selected', state.selected === unit.id); const selectUnit = row.querySelector('button'); selectUnit.textContent = unit.name; selectUnit.setAttribute('aria-pressed', String(state.selected === unit.id));
      const ranking = topVotes() ? rankingFor(unit) : null;
      const values = topVotes() ? [rankingLabel(ranking), ...columnKeys.slice(2).map(key => count(ranking.entries.find(entry => entry.id === key)?.votes))] : choices.map(choice => count(unitCount(unit, choice.id)));
      if (!topVotes()) { if (showRemainder) values.push(count(sourceRemainder(dataset, unit))); values.push(count(unit.reported_total)); }
      if (comparing()) { const result = comparisonFor(unit, selectedGovernorUnit(unit)); values.push(pct(result?.count_ratio_percent), signedCount(result?.vote_difference), pp(result?.share_gap_pp)); }
      if (historicalComparison()) { const result = historyFor(unit); values.push(historyCountLabel(result?.ratios?.dem?.percent), historyCountLabel(result?.ratios?.rep?.percent), pp(result?.shift_pp)); }
      let cells = [...row.querySelectorAll('td')]; while (cells.length > values.length) cells.pop().remove(); while (cells.length < values.length) { const cell = node('td'); row.append(cell); cells.push(cell); } values.forEach((value, index) => { cells[index].textContent = value; cells[index].className = !topVotes() && index >= choices.length + 1 ? 'ma-table-comparison' : ''; cells[index].dataset.column = columnKeys[index + 1]; cells[index].dataset.topVoteLeader = String(topVotes() && ranking.leader_ids.includes(columnKeys[index + 1])); if (topVotes() && index === 0) cells[index].dataset.leaderIds = JSON.stringify(ranking.leader_ids); else delete cells[index].dataset.leaderIds; });
      if (body.children[position] !== row) body.insertBefore(row, body.children[position] || null);
    }
    existing.forEach(row => row.remove());
    if (activeId && document.activeElement === document.body) [...body.children].find(row => row.dataset.unitId === activeId)?.querySelector('button')?.focus({ preventScroll: true });
  }
  function render() {
    if (state.destroyed) return;
    root.setAttribute('aria-busy', String(state.pending)); mapPanel.setAttribute('aria-busy', String(state.pending));
    refs['mode-ballot'].setAttribute('aria-pressed', String(state.mode === 'ballot')); refs['mode-governor'].setAttribute('aria-pressed', String(state.mode === 'governor'));
    questionField.hidden = state.mode !== 'ballot'; refs.question.value = state.question; displayControls.hidden = state.mode !== 'ballot'; comparisonControls.hidden = !comparing();
    governorDisplayControls.hidden = state.mode !== 'governor'; presidentControls.hidden = !historicalComparison(); presidentYearField.hidden = !versusPresident(); governorYearField.hidden = !versusGovernor(); refs['president-year'].value = String(state.presidentYear); refs['governor-history-year'].value = String(state.governorHistoryYear); refs['president-party'].value = state.presidentParty; refs['president-metric'].value = state.presidentMetric; refs['president-party'].disabled = state.presidentMetric !== 'ratio'; refs['president-metric'].querySelector('[value="ratio"]').textContent = versusPresident() ? 'Votes vs President (%)' : 'Candidate / Governor votes';
    refs['display-gov-results'].setAttribute('aria-pressed', String(state.governorDisplay === 'results')); refs['display-president'].setAttribute('aria-pressed', String(state.governorDisplay === 'president')); refs['display-governor-history'].setAttribute('aria-pressed', String(state.governorDisplay === 'history'));
    refs['display-results'].setAttribute('aria-pressed', String(state.display === 'results')); refs['display-governor'].setAttribute('aria-pressed', String(state.display === 'governor')); refs['display-top-vote'].setAttribute('aria-pressed', String(state.display === 'top-vote'));
    refs.response.value = state.response; refs.metric.value = state.metric;
    const candidates = mainCandidates(), candidateKey = candidates.map(choice => choice.id + ':' + choiceName(choice)).join('|');
    if (refs.candidate.dataset.choices !== candidateKey) { refs.candidate.replaceChildren(); for (const choice of candidates) { const option = node('option', choiceName(choice)); option.value = choice.id; refs.candidate.append(option); } refs.candidate.dataset.choices = candidateKey; }
    if (!candidates.some(choice => choice.id === state.candidate)) state.candidate = candidates[0]?.id || ''; refs.candidate.value = state.candidate;
    refs.candidate.disabled = !candidates.length; refs.refresh.disabled = state.pending;
    refs['level-town'].setAttribute('aria-pressed', String(state.level === 'town')); refs['level-county'].setAttribute('aria-pressed', String(state.level === 'county')); refs.statewide.setAttribute('aria-pressed', String(!state.selected));
    mapTitle.textContent = title();
    const stale = [currentData(), needsGovernor() ? governorData() : null].some(dataset => dataset?.source?.status === 'stale' || dataset?.source?.error);
    status.hidden = !state.error && !stale; status.textContent = state.error || (stale ? 'Refresh failed. Retry Refresh.' : '');
    source.replaceChildren(); renderSource(source, currentData(), state.mode === 'ballot' ? 'Question' : 'Governor'); if (needsGovernor()) renderSource(source, governorData(), 'Governor'); if (historicalComparison()) renderSource(source, historicalData(), referenceYear() + ' ' + referenceOffice()); if (geographies.get(state.level)) renderSource(source, { source: geographies.get(state.level).source }, 'Boundaries');
    renderInspector(); renderMap(); renderLegend(); renderTable();
  }
  async function load(refresh = false) {
    const revision = ++state.revision, contest = activeContest(), level = state.level, loadGovernor = needsGovernor(), loadHistory = historicalComparison(), governorHistory = versusGovernor(), historyYear = referenceYear();
    state.pending = true; state.error = ''; render();
    const requests = [loadMassachusettsResults({ contest, refresh }), loadMassachusettsGeography(level)];
    if (loadGovernor) requests.push(loadMassachusettsResults({ contest: 'governor', refresh }));
    const historyIndex = requests.length; if (loadHistory) requests.push(governorHistory ? loadMassachusettsGovernorHistory(historyYear) : loadMassachusettsPresidentialHistory(historyYear));
    const results = await Promise.allSettled(requests);
    if (state.destroyed || revision !== state.revision) return;
    if (results[0].status === 'fulfilled') datasets.set(contest, results[0].value);
    if (results[1].status === 'fulfilled') geographies.set(level, results[1].value);
    if (loadGovernor && results[2].status === 'fulfilled') datasets.set('governor', results[2].value);
    if (loadHistory && results[historyIndex].status === 'fulfilled') (governorHistory ? governorHistories : histories).set(historyYear, results[historyIndex].value);
    state.pending = false; state.error = results.some(result => result.status === 'rejected') ? 'Refresh failed. Retry Refresh.' : '';
    if (state.selected && !unitsOf(currentData(), state.level).has(state.selected)) state.selected = '';
    render();
  }
  function setLevel(level) {
    if (!['town', 'county'].includes(level) || level === state.level) return;
    const old = selectedUnit(currentData()); state.level = level; state.selected = level === 'county' ? old?.county_fips || '' : '';
    if (state.selected && !unitsOf(currentData(), level).has(state.selected)) state.selected = '';
    if (!geographies.has(level)) load(); else render();
  }
  function setMode(nextMode, options = {}) {
    const next = nextMode === 'governor' ? 'governor' : 'ballot'; const changed = state.mode !== next; state.mode = next;
    if (options.level === 'town' && state.level !== 'town') { state.level = 'town'; state.selected = ''; }
    if (options.governorDisplay === 'president') { state.governorDisplay = 'president'; if (MASSACHUSETTS_PRESIDENTIAL_YEARS.includes(options.presidentYear)) state.presidentYear = options.presidentYear; state.presidentParty = options.presidentParty === 'rep' ? 'rep' : 'dem'; state.presidentMetric = options.presidentMetric === 'margin-shift' ? 'margin-shift' : 'ratio'; }
    if (changed) onModeChange(next);
    load();
  }
  load();
  return { setMode, refresh: () => load(true), destroy() { state.destroyed = true; state.revision++; container.replaceChildren(); } };
}
