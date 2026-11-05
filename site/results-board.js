import { resultsFetch } from './results-client.js';
import { createElectionMap, loadCountyGeography, drawCountyMap, loadHouseGeography, drawHouseMap } from './election-map.js';

const $ = (id) => document.getElementById(id);
const OFFICE = { senate: 'U.S. Senate', house: 'U.S. House', governor: 'Governor' };
const state = { office: 'senate', selected: '', raceId: '', data: null, map: null, houseGeometry: null, pendingHouseKey: '', initialized: false, pending: false, countyRace: '', countyData: null, countyView: false, countyLayer: 'geographic', countyPreferredLayer: 'geographic', selectedCounty: '', focused: false, countyPending: false, countyMessage: '', countyRequest: 0, countyCache: new Map(), countySelections: new Map(), countyFilter: '', countySort: 'votes_desc', displayMode: 'results', baselineYear: 2024, baseline: null, baselinePending: false, baselineError: '', historyModule: null, historyRequest: 0 };
state.mapMetric = 'dem_ratio';
Object.assign(state, { chamberReference: null, chamberModule: null, chamberPending: false, chamberError: '', registration: null, registrationModule: null, registrationPending: false, registrationError: '', registrationFilter: '', registrationSort: 'name' });
const count = (value) => Number.isFinite(value) ? value.toLocaleString('en-US') : '';
function el(tag, text, className) { const node = document.createElement(tag); if (text !== undefined && text !== null) node.textContent = String(text); if (className) node.className = className; return node; }
function party(value) { const code = String(value || '').toUpperCase(); return ['DEM', 'DEMOCRATIC', 'D'].includes(code) ? 'dem' : ['REP', 'REPUBLICAN', 'R'].includes(code) ? 'rep' : 'other'; }
function eastern(value) { if (!value) return null; const date = new Date(value); if (!Number.isFinite(date.getTime())) return null; return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date) + ' ET'; }
function age(value) { const time = value && new Date(value).getTime(); if (!Number.isFinite(time)) return ''; const minutes = Math.max(0, Math.floor((Date.now() - time) / 60000)); if (minutes < 1) return 'less than a minute ago'; if (minutes < 60) return minutes + ' min ago'; const hours = Math.floor(minutes / 60); return hours < 48 ? hours + ' hr ago' : Math.floor(hours / 24) + ' days ago'; }
function allRaces() { return (state.data?.states || []).flatMap((item) => (item.races || []).map((race) => ({ ...race, state: race.state || item.state, state_name: item.name }))); }
function raceLabel(race) { return race.label || (race.office === 'house' ? 'House ' + (race.district || 'At-large') : race.office === 'senate' ? 'Senate' + (race.special ? ' · Special' : '') : 'Governor'); }
function candidates(race) { return (race?.candidates || []).slice().sort((a, b) => (b.votes || 0) - (a.votes || 0)); }
function hasVotes(race) { return Number.isFinite(race?.reported_total) && race.reported_total > 0; }
function residual(race) { return Number.isFinite(race?.unattributed_source_votes) ? Math.max(0, race.unattributed_source_votes) : 0; }
function leader(race) { const rows = candidates(race); return race?.vote_counts_complete !== false && rows.every((row) => Number.isFinite(row.votes)) && hasVotes(race) && rows[0] && rows[0].votes > 0 && rows[0].votes - (rows[1]?.votes || 0) > residual(race) ? rows[0] : null; }
function calledName(race) { const call = race.source_called_winner; if (!call) return null; if (typeof call === 'string') return candidates(race).find((item) => item.candidate_id === call || item.name === call)?.name || call; return call.name || call.candidate_name || candidates(race).find((item) => item.candidate_id === call.candidate_id)?.name || null; }
function currentRace() { const races = allRaces().filter((race) => race.state === state.selected && race.office === state.office); return races.find((race) => race.race_id === state.raceId) || races[0] || null; }
function sourceLink(url, text) { const link = el('a', text); if (url && /^https?:\/\//.test(url)) { link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; } return link; }
function countyKey(row) { return String(row.county_fips || row.reporting_unit_id || row.name); }
function invalidateCountyRequest() { state.countyRequest++; state.countyPending = false; state.countyMessage = ''; }
function rememberCounty() { if (state.selected && state.selectedCounty) state.countySelections.set(state.selected, state.selectedCounty); }
function cacheCounty(data) { state.countyCache.delete(data.race.race_id); state.countyCache.set(data.race.race_id, data); while (state.countyCache.size > 20) state.countyCache.delete(state.countyCache.keys().next().value); }
function withCountyContext(row, race) { return { ...row, state: race.state, office: race.office, district: race.district, race_id: race.race_id, label: race.office === 'house' && race.district ? row.name + ' · House ' + race.district : row.name, source_name: row.source_name || race.source_name, source_url: row.source_url || race.source_url, source_called_winner: null }; }
function shiftLabel(value) { return Math.abs(value) < 0.05 ? 'No margin shift' : (value > 0 ? 'D +' : 'R +') + Math.abs(value).toFixed(1) + ' pp'; }
function marginLabel(value) { return Math.abs(value) < 0.05 ? 'Even' : (value > 0 ? 'D +' : 'R +') + Math.abs(value).toFixed(1) + ' pp'; }
function shiftFill(value) { const amount = Math.min(1, Math.abs(value) / 15); const end = value >= 0 ? [45, 105, 179] : [191, 66, 86]; return 'rgb(' + end.map((v, i) => Math.round([242, 243, 246][i] + (v - [242, 243, 246][i]) * amount)).join(',') + ')'; }
function ratioFill(value, code) { const amount = Math.max(0, Math.min(1, value / 150)), start = code === 'dem' ? [239, 245, 252] : [253, 241, 242], end = code === 'dem' ? [36, 91, 158] : [179, 46, 67]; return 'rgb(' + end.map((channel, index) => Math.round(start[index] + (channel - start[index]) * amount)).join(',') + ')'; }
function ratioMapLabel() { return state.mapMetric === 'dem_ratio' ? 'Democratic votes / ' + (state.baselineYear === 2024 ? 'Harris' : 'Biden') : 'Republican votes / Trump'; }
function comparison(race, geography = 'state') {
  if (state.office === 'house' || race?.office === 'house') return { status: 'unavailable', reason: 'Presidential comparison unavailable for House district boundaries.' };
  if (state.baselinePending) return { status: 'unavailable', reason: 'Loading presidential results…' };
  if (!state.baseline || !state.historyModule) return { status: 'unavailable', reason: state.baselineError || 'Presidential results are not connected.' };
  const baseline = geography === 'county' ? state.baseline.counties.get(String(race?.county_fips || '')) : state.baseline.states.get(race?.state);
  if (!baseline) return { status: 'unavailable', reason: geography === 'county' ? 'No exact county presidential match for this reporting unit.' : 'Historical presidential results unavailable for this state.' };
  const result = state.historyModule.comparePresidentialMargin(race, baseline, { office: race.office, geography });
  return { ...result, baseline };
}
function comparisonDisplay(race, geography = 'state') {
  const result = comparison(race, geography);
  if (!result.baseline || !state.historyModule?.presidentialComparisonDisplay) return result;
  return { ...state.historyModule.presidentialComparisonDisplay(race, result.baseline, { office: race.office, geography }), baseline: result.baseline };
}
function currentMargin(race) {
  if (!hasVotes(race) || race.vote_counts_complete === false || residual(race) > 0 || !Array.isArray(race.candidates) || race.candidates.some((row) => !Number.isFinite(row.votes))) return null;
  const dem = race.candidates.filter((row) => party(row.party) === 'dem'), rep = race.candidates.filter((row) => party(row.party) === 'rep');
  if (!dem.length || !rep.length || race.candidates.reduce((sum, row) => sum + row.votes, 0) !== race.reported_total) return null;
  return 100 * (dem.reduce((sum, row) => sum + row.votes, 0) - rep.reduce((sum, row) => sum + row.votes, 0)) / race.reported_total;
}
function percent(value) { return Number.isFinite(value) ? value.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%' : ''; }
function mapValue(race, geography = 'state') {
  const lead = leader(race), name = race?.name || race?.label || race?.state || '';
  if (state.displayMode === 'president') {
    if (state.mapMetric === 'margin_shift') { const change = comparison(race, geography); return change.status === 'available' && Number.isFinite(change.shift_pp) ? { fill: shiftFill(change.shift_pp), shift: change.shift_pp, description: shiftLabel(change.shift_pp) + ' vs ' + state.baselineYear + ' President · ' + marginLabel(change.current_margin_pp) } : { description: name }; }
    const display = comparisonDisplay(race, geography), code = state.mapMetric === 'rep_ratio' ? 'rep' : 'dem', ratio = display.ratios?.[code];
    return Number.isFinite(ratio?.percent) ? { fill: ratioFill(ratio.percent, code), ratio: ratio.percent, metricParty: code, description: ratioMapLabel() + ' ' + state.baselineYear + ': ' + count(ratio.current_count) + ' / ' + count(ratio.historical_count) + ' = ' + percent(ratio.percent) } : { description: name };
  }
  return { party: lead ? party(lead.party) : null, called: Boolean(calledName(race)), description: lead ? lead.name + ' leads · ' + count(race.reported_total) + ' votes' : Number.isFinite(race?.reported_total) ? count(race.reported_total) + ' votes' : name };
}
async function loadBaseline() {
  const request = ++state.historyRequest, year = state.baselineYear;
  state.baseline = null; state.baselinePending = true; state.baselineError = ''; render();
  try { const module = await import('./presidential-history.js'); const data = await module.loadPresidentialHistory(year); if (request !== state.historyRequest) return; state.historyModule = module; state.baseline = data; }
  catch { if (request === state.historyRequest) state.baselineError = 'Refresh failed.'; }
  finally { if (request === state.historyRequest) { state.baselinePending = false; render(); } }
}
async function loadRegistration() {
  if (state.registrationPending) return;
  state.registrationPending = true; state.registrationError = ''; render();
  try { const module = await import('./voter-registration.js'); const data = await module.loadVoterRegistration(); state.registrationModule = module; state.registration = data; }
  catch { state.registrationError = 'Refresh failed.'; }
  finally { state.registrationPending = false; render(); }
}
function registrationRow(code = state.selected) { return state.registration?.states.get(code) || null; }
function registrationDisplay(race, geography = 'state') {
  const row = registrationRow(race?.state);
  return row && state.registrationModule ? state.registrationModule.compareRegistrationVotes(race, row, { office: race?.office, geography }) : null;
}
function registrationCount(row, key) { return Number.isFinite(row?.[key]) ? count(row[key]) : ''; }
function signedCount(value) { return Number.isFinite(value) ? (value > 0 ? '+' : value < 0 ? '−' : '') + count(Math.abs(value)) : ''; }
function snapshotDate(value) {
  if (!value) return '';
  if (/^\d{4}$/.test(value)) return value;
  if (/^\d{4}-\d{2}$/.test(value)) { const month = new Date(value + '-01T12:00:00Z'); return Number.isFinite(month.getTime()) ? new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', year: 'numeric', month: 'short' }).format(month) : String(value); }
  const date = new Date(value + (String(value).length === 10 ? 'T12:00:00Z' : ''));
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' }).format(date) : String(value);
}
function registrationObservation(row) { return row?.observation_period && !/compil(?:ation|ed)/i.test(row.observation_period) ? row.observation_period : null; }
function registrationSnapshot(row) { const period = row?.observation_period || ''; return row?.as_of ? snapshotDate(row.as_of) : /^(?:January|February|March|April|May|June|July|August|September|October|November|December)\s*\d{4}$|^General Election \d{4}$/.test(period) ? period : ''; }
function registrationCompilation(row) {
  const period = row?.source_compilation_period || row?.source_compilation_date || row?.compilation_period || row?.compilation_date;
  return period ? 'Compilation: ' + snapshotDate(period) : /compil(?:ation|ed)/i.test(row?.observation_period || '') ? row.observation_period : null;
}
function renderRegistration(race, target, geography = 'state') {
  if (state.displayMode !== 'president' || !state.selected) return;
  const row = registrationRow();
  if (!row || !['dem', 'rep', 'unaffiliated', 'other', 'total'].some((key) => Number.isFinite(row[key]))) {
    if (state.registrationError) { const retry = el('button', 'Retry registrations', 'comparison-retry'); retry.type = 'button'; retry.addEventListener('click', loadRegistration); target.append(retry); }
    return;
  }
  const box = el('section', null, 'registration-reference'); box.id = 'state-registration-reference';
  const stateName = state.map?.states.find((area) => area.state === state.selected)?.name || state.selected;
  box.setAttribute('aria-label', stateName + ' statewide registrations');
  const header = el('div', null, 'registration-reference-heading'); header.append(el('h4', stateName + ' registration'), el('span', 'Statewide', 'registration-scope')); box.append(header);
  const display = race ? registrationDisplay(race, geography) : null, metrics = el('dl', null, 'registration-count-grid');
  for (const [key, label] of [['dem', 'Democratic'], ['rep', 'Republican'], ['unaffiliated', 'Unaffiliated'], ['other', 'Other registrations'], ['total', 'Total registered']]) {
    if (!Number.isFinite(row[key])) continue;
    const item = el('div', null, key); item.append(el('dt', label), el('dd', registrationCount(row, key))); metrics.append(item);
  }
  box.append(metrics);
  if (display && !display.state_reference_only && !comparisonDisplay(race).current) renderRegistrationPerformance(display, box);
  const meta = el('div', null, 'registration-reference-meta'), date = registrationSnapshot(row);
  if (date) meta.append(el('strong', date));
  if (row.source_url) meta.append(sourceLink(row.source_url, row.source_name || 'Source'));
  if (meta.childNodes.length) box.append(meta);
  appendRegistrationDetails(box, row);
  target.append(box);
}

function renderRegistrationPerformance(display, target) {
  const grid = el('div', null, 'registration-performance-grid');
  for (const code of ['dem', 'rep']) {
    const result = display.ratios?.[code], difference = result?.difference_votes ?? result?.difference;
    if (!Number.isFinite(difference) && !Number.isFinite(result?.percent)) continue;
    const item = el('div', null, code);
    if (Number.isFinite(difference)) item.append(el('span', (code === 'dem' ? 'D' : 'R') + ' counted − registered'), el('strong', signedCount(difference)));
    if (Number.isFinite(result?.percent)) item.append(el('small', percent(result.percent) + ' counted / registered'));
    grid.append(item);
  }
  if (grid.childNodes.length) target.append(grid);
}

function renderProgress(race, target) {
  const progress = race.source_vote_progress, box = el('div', null, 'source-vote-progress');
  if (Number.isFinite(progress?.percent_votes_counted)) {
    const heading = el('div'); heading.append(el('span', 'CNN est. votes in'), el('strong', percent(progress.percent_votes_counted))); box.append(heading);
  }
  if (Number.isFinite(progress?.percent_votes_remaining)) { const remaining = el('div'); remaining.append(el('span', 'Est. share remaining'), el('strong', percent(progress.percent_votes_remaining))); box.append(remaining); }
  if (Number.isFinite(progress?.estimated_votes_remaining)) box.append(el('p', count(progress.estimated_votes_remaining) + ' votes remaining'));
  const units = race.reporting_units;
  if (units && Number.isFinite(units.reporting) && Number.isFinite(units.total)) box.append(el('small', count(units.reporting) + ' / ' + count(units.total) + ' reporting units'));
  if (box.childNodes.length) target.append(box);
}

function renderComparison(race, target, geography = 'state') {
  if (state.displayMode !== 'president') return;
  const result = comparisonDisplay(race, geography);
  if (!result.current || !result.historical) {
    if (state.baselineError) { const retry = el('button', 'Retry presidential results', 'comparison-retry'); retry.type = 'button'; retry.addEventListener('click', loadBaseline); target.append(retry); }
    return;
  }
  const box = el('section', null, 'presidential-comparison comparison-panel'), columns = el('div', null, 'comparison-columns');
  box.setAttribute('aria-label', 'Votes compared with the ' + state.baselineYear + ' presidential vote');
  box.append(el('h4', 'Counted votes vs ' + state.baselineYear + ' President'));
  const reg = registrationRow(race.state), regDate = reg && registrationSnapshot(reg);
  if (geography === 'state' && regDate && ['dem', 'rep'].some((code) => Number.isFinite(reg[code]))) box.append(el('p', 'Registrations: ' + regDate, 'comparison-registration-caption'));
  for (const code of ['dem', 'rep']) {
    const ratio = result.ratios?.[code], current = result.current[code + '_votes'], historical = result.historical[code + '_votes'];
    if (![current, historical, ratio?.percent].some(Number.isFinite)) continue;
    const historicalName = result.historical[code + '_label'] || (code === 'dem' ? state.baselineYear === 2024 ? 'Harris' : 'Biden' : 'Trump');
    const card = el('article', null, 'comparison-party-card ' + code); card.setAttribute('aria-label', (code === 'dem' ? 'Democratic' : 'Republican') + ' votes');
    card.append(el('h5', (code === 'dem' ? 'Democratic' : 'Republican') + ' votes'));
    if (Number.isFinite(ratio?.percent)) {
      const metric = el('strong', percent(ratio.percent), 'comparison-ratio'); metric.dataset.party = code; metric.dataset.ratioPercent = String(ratio.percent);
      card.append(metric, el('small', 'of ' + historicalName + '’s ' + state.baselineYear + ' count', 'comparison-ratio-label'));
    }
    const pair = el('div', null, 'comparison-count-pair');
    for (const [label, votes] of [['2026 counted', current], [historicalName + ' ' + state.baselineYear, historical]]) {
      if (!Number.isFinite(votes)) continue;
      const item = el('div'); item.append(el('span', label), el('strong', count(votes))); pair.append(item);
    }
    if (pair.childNodes.length) card.append(pair);
    if (Number.isFinite(current) && Number.isFinite(historical) && Math.max(current, historical) > 0) {
      const tracks = el('div', null, 'comparison-count-bars'); tracks.setAttribute('aria-hidden', 'true');
      for (const [kind, votes] of [['current', current], ['historical', historical]]) { const track = el('div', null, 'comparison-bar'), bar = el('span', null, code + ' ' + kind); bar.style.width = votes / Math.max(current, historical) * 100 + '%'; track.append(bar); tracks.append(track); }
      card.append(tracks);
    }
    if (geography === 'state' && race.office !== 'house' && Number.isFinite(reg?.[code])) {
      const registration = registrationDisplay(race, geography), result = registration?.ratios?.[code], benchmark = el('div', null, 'registration-party-benchmark'); benchmark.dataset.party = code;
      const registeredCount = el('div'); registeredCount.append(el('span', (code === 'dem' ? 'D' : 'R') + ' registered'), el('strong', registrationCount(reg, code))); benchmark.append(registeredCount);
      const difference = result?.difference_votes ?? result?.difference;
      if (!registration?.state_reference_only && Number.isFinite(difference)) { const gap = el('div', null, 'registration-vote-difference'); gap.append(el('span', 'Counted − registered'), el('strong', signedCount(difference))); benchmark.append(gap); }
      if (!registration?.state_reference_only && Number.isFinite(result?.percent)) benchmark.append(el('small', percent(result.percent) + ' counted / registered'));
      card.append(benchmark);
    }
    columns.append(card);
  }
  if (!columns.childNodes.length) return;
  box.append(columns);
  if (Number.isFinite(result.shift_pp)) {
    const secondary = el('div', null, 'comparison-margin'); secondary.append(el('span', 'D−R margin: ' + marginLabel(result.current_margin_pp) + ' now · ' + marginLabel(result.historical_margin_pp) + ' in ' + state.baselineYear), el('strong', shiftLabel(result.shift_pp), 'comparison-shift ' + (result.shift_pp >= 0 ? 'shift-dem' : 'shift-rep'))); box.append(secondary);
  }
  if (result.historical.source_url) box.append(sourceLink(result.historical.source_url, result.historical.source_name || 'Historical results'));
  target.append(box);
}

async function loadChamberSummary() {
  if (state.chamberPending) return;
  state.chamberPending = true; state.chamberError = '';
  try { const module = await import('./chamber-results.js'); state.chamberReference = await module.loadChamberReference(); state.chamberModule = module; }
  catch { state.chamberError = 'Refresh failed.'; }
  finally { state.chamberPending = false; render(); }
}
function renderChamberSummary() {
  const panel = $('chamber-summary'), target = $('chamber-summary-content'); if (!panel || !target) return;
  panel.hidden = !state.data || !state.chamberReference || !state.chamberModule;
  if (panel.hidden) return;
  let result;
  try { result = state.chamberModule.summarizeChamberResults(allRaces(), state.chamberReference, { office: state.office }); }
  catch { panel.hidden = true; return; }
  $('chamber-summary-title').textContent = OFFICE[state.office] + ' · ' + result.total + (state.office === 'governor' ? ' governorships' : ' seats');
  const entries = [['DEM', 'Democratic', 'dem'], ['REP', 'Republican', 'rep'], ['IND', 'Independent', 'ind'], ['OTHER', 'Other', 'other']].filter(([key]) => key === 'DEM' || key === 'REP' || result.parties[key]?.total > 0);
  const parties = el('div', null, 'chamber-parties');
  for (const [key, label, style] of entries) {
    const value = result.parties[key], card = el('div', null, 'chamber-party ' + style); card.dataset.party = key; card.dataset.total = String(value.total);
    card.append(el('span', label), el('strong', count(value.total)));
    const parts = []; if (value.held > 0) parts.push(count(value.held) + ' not up'); if (result.called_count > 0 || !result.holdover_count) parts.push(count(value.won) + ' won');
    if (parts.length) card.append(el('small', parts.join(' + '))); parties.append(card);
  }
  if (result.undecided > 0) { const pending = el('div', null, 'chamber-party undecided'); pending.dataset.party = 'UNDECIDED'; pending.dataset.total = String(result.undecided); pending.append(el('span', 'Undecided'), el('strong', count(result.undecided))); parties.append(pending); }
  const bar = el('div', null, 'chamber-seat-bar'); bar.setAttribute('role', 'img'); bar.setAttribute('aria-label', entries.map(([key, label]) => label + ' ' + result.parties[key].total).concat(result.undecided ? ['Undecided ' + result.undecided] : []).join(', '));
  for (const [key, label, style] of entries) if (result.parties[key].total > 0) { const segment = el('span', null, style); segment.style.flex = String(result.parties[key].total); segment.title = label + ': ' + result.parties[key].total; bar.append(segment); }
  if (result.undecided > 0) { const segment = el('span', null, 'undecided'); segment.style.flex = String(result.undecided); segment.title = 'Undecided: ' + result.undecided; bar.append(segment); }
  const meta = el('div', null, 'chamber-summary-meta');
  meta.append(el('span', result.holdover_count ? count(result.holdover_count) + ' not up for election · ' + count(result.contested) + ' on ballot' : count(result.contested) + ' on ballot'));
  if (state.office === 'senate' || state.office === 'house') meta.append(el('span', (state.office === 'senate' ? '51' : '218') + ' for majority'));
  meta.append(sourceLink('https://www.cnn.com/election/2026', 'CNN calls'), sourceLink(new URL('./data/chamber-reference-sources.html', import.meta.url).href, 'Seat roster'));
  target.replaceChildren(parties, bar, meta);
}

function updateClock() { const clock = $('results-clock'); if (clock) clock.textContent = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(new Date()) + ' ET'; }
function syncPage() { document.body.classList.add('results-mode'); }

// Refresh requests are best-effort; a retained source snapshot still renders.
async function requestRefresh(payload = {}) {
  try {
    const response = await resultsFetch('/api/results-map/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(25000) : undefined });
    return response.ok;
  } catch { return false; }
}

function selectState(code, raceId = '') {
  rememberCounty(); invalidateCountyRequest();
  state.selected = code; state.raceId = raceId; state.pendingHouseKey = ''; state.countyData = null; state.countyRace = ''; state.countyLayer = state.countyPreferredLayer;
  state.selectedCounty = state.countySelections.get(code) || '';
  const race = currentRace();
  if (race) { state.raceId = race.race_id; state.countyRace = race.race_id; state.countyData = state.countyCache.get(race.race_id) || null; }
  if (state.focused) state.map?.focusState(code);
  render();
  if (state.countyView && race) loadCounties(race, { layer: state.countyPreferredLayer, silent: Boolean(state.countyData) });
}
function selectRace(race) { state.office = race.office; selectState(race.state, race.race_id); }

function renderCandidates(race, target) {
  const total = race.reported_total, rows = candidates(race);
  for (const candidate of rows) {
    if (!candidate.name && !Number.isFinite(candidate.votes)) continue;
    const row = el('div', null, 'inspector-candidate ' + party(candidate.party)), heading = el('div', null, 'inspector-candidate-heading');
    const name = el('span', candidate.name || candidate.party || ''); if (candidate.party) name.append(el('small', candidate.party)); heading.append(name);
    if (Number.isFinite(candidate.votes)) {
      const numbers = el('span', null, 'inspector-candidate-numbers');
      if (Number.isFinite(total) && total > 0) numbers.append(el('strong', (candidate.votes / total * 100).toFixed(1) + '%'));
      numbers.append(el('small', count(candidate.votes) + ' votes')); heading.append(numbers);
    }
    row.append(heading);
    if (Number.isFinite(candidate.votes) && Number.isFinite(total) && total > 0) { const track = el('div', null, 'inspector-vote-track'), bar = el('span', null, party(candidate.party)); bar.style.width = Math.min(100, candidate.votes / total * 100) + '%'; track.append(bar); row.append(track); }
    target.append(row);
  }
  if (hasVotes(race) && residual(race) > 0) {
    const row = el('div', null, 'inspector-unattributed'), heading = el('div', null, 'inspector-candidate-heading');
    heading.append(el('span', 'Unassigned votes'), el('strong', count(residual(race)) + ' · ' + (residual(race) / total * 100).toFixed(1) + '%')); row.append(heading); target.append(row);
  }
}

function renderInspector() {
  const target = $('race-inspector-content');
  const sourceRace = currentRace();
  const selectedCounty = state.countyView ? state.countyData?.rows.find((item) => countyKey(item) === state.selectedCounty) : null;
  const race = sourceRace && selectedCounty ? withCountyContext(selectedCounty, sourceRace) : sourceRace;
  target.replaceChildren();
  const area = state.map?.states.find((item) => item.state === state.selected);
  const stateHeading = el('h2', area?.name || 'Explore a race'); stateHeading.id = 'race-inspector-title'; target.append(stateHeading);
  if (!race) {
    renderRegistration(null, target);
    if (!state.selected) target.append(el('p', 'Select a state.', 'inspector-empty'));
  } else {
    state.raceId = race.race_id;
    const header = el('div', null, 'inspector-race-heading'); header.append(el('h3', raceLabel(race)));
    const lead = leader(race), call = calledName(race);
    if (call || hasVotes(race)) header.append(el('span', call ? 'CNN called' : 'Results', call ? 'race-status source-call' : 'race-status'));
    target.append(header);
    renderComparison(race, target, selectedCounty ? 'county' : 'state');
    renderRegistration(race, target, selectedCounty ? 'county' : 'state');
    if (selectedCounty) { const back = el('button', 'Back to state totals', 'county-toggle'); back.type = 'button'; back.addEventListener('click', () => { state.selectedCounty = ''; render(); }); target.append(back); }
    if (call) target.append(el('p', (race.source_name || 'Source') + ' calls this race for ' + call + '.', 'source-call-note'));
    else if (lead) target.append(el('p', lead.name + ' leads.', 'inspector-lead'));
    const comparisonAvailable = state.displayMode === 'president' && comparisonDisplay(race, selectedCounty ? 'county' : 'state').current;
    if (comparisonAvailable) { const details = el('details', null, 'comparison-result-details'); details.append(el('summary', 'All candidate results')); renderCandidates(race, details); target.append(details); }
    else renderCandidates(race, target);
    if (Number.isFinite(race.reported_total)) { const total = el('div', null, 'inspector-total'); total.append(el('span', 'Total votes'), el('strong', count(race.reported_total))); target.append(total); }
    renderProgress(race, target);
    const source = el('div', null, 'inspector-source'); source.append(sourceLink(race.source_url, race.source_name || state.data?.source?.name || 'Public results source'));
    const timestamp = eastern(race.source_updated_at); if (timestamp) source.append(el('span', 'Updated ' + timestamp));
    if (timestamp) source.append(el('span', age(race.source_updated_at), 'source-age'));
    target.append(source);
    const county = el('button', state.countyPending ? 'Loading local results…' : state.countyView && state.countyData ? 'Refresh local results' : 'Explore counties', 'county-toggle'); county.type = 'button'; county.disabled = state.countyPending; county.addEventListener('click', () => loadCounties(sourceRace, { layer: state.countyPreferredLayer, refresh: Boolean(state.countyData) })); target.append(county);
  }
  const stateRaces = allRaces().filter((item) => item.state === state.selected).sort((a, b) => a.office.localeCompare(b.office) || String(a.district || '').localeCompare(String(b.district || ''), undefined, { numeric: true }));
  if (stateRaces.length) {
    const section = el('div', null, 'inspector-state-races'); section.append(el('h3', 'Races in ' + (area?.name || state.selected)));
    stateRaces.forEach((item) => {
      const button = el('button', null, 'state-race-link' + (item.race_id === state.raceId ? ' active' : '')); button.type = 'button';
      button.append(el('span', raceLabel(item))); if (Number.isFinite(item.reported_total)) button.append(el('strong', count(item.reported_total)));
      button.addEventListener('click', () => selectRace(item)); section.append(button);
    }); target.append(section);
  }
  $('results-state').value = state.selected;
  $('map-focus-state').hidden = !state.selected || state.focused;
  $('map-reset').hidden = !state.focused;
}

function countyTableRecords() {
  const data = state.countyData;
  if (!data) return [];
  const query = state.countyFilter.trim().toLocaleLowerCase();
  const records = data.rows.filter((row) => !query || (row.name || '').toLocaleLowerCase().includes(query)).map((row) => {
    const current = withCountyContext(row, data.race), display = comparisonDisplay(current, 'county');
    return { row, current, display, currentMargin: currentMargin(current), key: countyKey(row) };
  });
  const numeric = (a, b, getter) => { const av = getter(a), bv = getter(b); return Number.isFinite(av) ? Number.isFinite(bv) ? bv - av : -1 : Number.isFinite(bv) ? 1 : 0; };
  return records.sort((a, b) => {
    const by = state.countySort;
    const difference = by === 'votes_desc' ? numeric(a, b, (x) => x.row.reported_total) : by === 'dem_ratio_desc' ? numeric(a, b, (x) => x.display.ratios?.dem?.percent) : by === 'rep_ratio_desc' ? numeric(a, b, (x) => x.display.ratios?.rep?.percent) : by === 'shift_desc' ? numeric(a, b, (x) => x.display.shift_pp) : by === 'in_desc' ? numeric(a, b, (x) => x.row.source_vote_progress?.percent_votes_counted) : 0;
    return difference || (a.row.name || '').localeCompare(b.row.name || '');
  });
}

function renderCountyTable() {
  const panel = $('county-table-panel'), target = $('county-table-content');
  if (!panel || !target) return;
  panel.hidden = !state.countyView;
  if (panel.hidden) return;
  const data = state.countyData, race = currentRace();
  $('county-table-title').textContent = data?.rows.some((row) => !row.county_fips) ? 'Local reporting units' : 'County comparison';
  $('county-table-context').textContent = (state.map?.states.find((area) => area.state === state.selected)?.name || state.selected) + (race ? ' · ' + raceLabel(race) : '') + ' · Counted votes / ' + state.baselineYear + ' presidential votes';
  if (!$('county-filter')) {
    const controls = el('div', null, 'county-table-controls');
    const label = el('label', 'Find a county or unit'); const input = el('input'); input.type = 'search'; input.id = 'county-filter'; input.placeholder = 'Search counties'; input.autocomplete = 'off'; input.value = state.countyFilter; label.append(input);
    input.addEventListener('input', () => { state.countyFilter = input.value; renderCountyTable(); });
    const sortLabel = el('label', 'Sort'); const sort = el('select'); sort.id = 'county-sort';
    for (const [value, name] of [['votes_desc', 'Most counted votes'], ['name', 'Name A–Z'], ['dem_ratio_desc', 'Highest D count ratio'], ['rep_ratio_desc', 'Highest R count ratio'], ['shift_desc', 'Largest shift toward D'], ['in_desc', 'Highest CNN est. in']]) { const option = el('option', name); option.value = value; sort.append(option); }
    sort.value = state.countySort; sort.addEventListener('change', () => { state.countySort = sort.value; renderCountyTable(); }); sortLabel.append(sort);
    const clear = el('button', 'Clear search', 'county-filter-clear'); clear.type = 'button'; clear.addEventListener('click', () => { state.countyFilter = ''; input.value = ''; renderCountyTable(); input.focus({ preventScroll: true }); });
    controls.append(label, sortLabel, clear);
    const status = el('p', null, 'county-table-status'); status.id = 'county-table-status'; status.setAttribute('role', 'status');
    const wrap = el('div', null, 'county-table-wrap'); wrap.tabIndex = 0; wrap.setAttribute('role', 'region'); wrap.setAttribute('aria-label', 'Scrollable county vote comparison table');
    const table = el('table', null, 'county-table'); table.id = 'county-comparison-table';
    const caption = el('caption', 'County votes and presidential comparisons.'); caption.className = 'visually-hidden';
    const head = el('thead'), tr = el('tr');
    for (const [id, title] of [['unit', 'County / unit'], ['dem', 'D / prior D'], ['rep', 'R / Trump'], ['current', 'Current margin'], ['prior', 'Pres. margin'], ['shift', 'Shift'], ['votes', 'Counted votes'], ['in', 'CNN est. in']]) { const th = el('th', title); th.scope = 'col'; th.dataset.column = id; tr.append(th); }
    head.append(tr); const body = el('tbody'); body.id = 'county-table-rows'; table.append(caption, head, body); wrap.append(table);
    target.append(controls, status, wrap);
  }
  const records = countyTableRecords(), total = data?.rows.length || 0, status = $('county-table-status');
  const notes = [];
  if (state.countyPending) notes.push('Loading…');
  if (state.countyMessage && /refresh|retry|load/i.test(state.countyMessage)) notes.push(state.countyMessage);
  if (total && !records.length) notes.push('No search matches.');
  if (total) notes.push(records.length + ' of ' + total + ' units');
  status.textContent = notes.join(' · '); status.hidden = !notes.length;
  panel.setAttribute('aria-busy', String(state.countyPending));
  $('county-comparison-table').querySelector('[data-column="dem"]').textContent = 'D / ' + (state.baselineYear === 2024 ? 'Harris' : 'Biden') + ' ' + state.baselineYear;
  $('county-comparison-table').querySelector('[data-column="rep"]').textContent = 'R / Trump ' + state.baselineYear;
  const body = $('county-table-rows'), existing = new Map([...body.children].map((row) => [row.dataset.unitKey, row]));
  const focusedKey = document.activeElement?.closest('#county-table-rows tr')?.dataset.unitKey;
  for (const [position, record] of records.entries()) {
    const { row, display, key } = record;
    let tr = existing.get(key); existing.delete(key);
    if (!tr) {
      tr = el('tr'); tr.dataset.unitKey = key;
      const name = el('th'); name.scope = 'row'; const button = el('button', null, 'county-row-select'); button.type = 'button'; button.addEventListener('click', () => chooseCounty(key)); name.append(button); tr.append(name);
      for (let index = 0; index < 7; index++) tr.append(el('td'));
    }
    tr.classList.toggle('selected', key === state.selectedCounty);
    const button = tr.querySelector('button'); button.textContent = row.name || key; button.setAttribute('aria-pressed', String(key === state.selectedCounty)); button.dataset.countyFips = row.county_fips || ''; button.dataset.reportingUnitId = row.reporting_unit_id || '';
    const cells = [...tr.querySelectorAll('td')];
    ['dem', 'rep'].forEach((code, index) => {
      const ratio = display.ratios?.[code], cell = cells[index]; cell.className = 'county-count-comparison ' + code;
      cell.replaceChildren(); if (Number.isFinite(ratio?.percent)) cell.append(el('strong', percent(ratio.percent)));
      if (Number.isFinite(display.current?.[code + '_votes']) && Number.isFinite(display.historical?.[code + '_votes'])) cell.append(el('small', count(display.current[code + '_votes']) + ' / ' + count(display.historical[code + '_votes'])));
      cell.title = Number.isFinite(ratio?.percent) ? 'Current votes / presidential votes' : '';
    });
    for (const [index, value, label] of [[2, record.currentMargin, marginLabel], [3, display.historical_margin_pp ?? display.historical?.margin_pp, marginLabel], [4, display.shift_pp, shiftLabel]]) { cells[index].textContent = Number.isFinite(value) ? label(value) : ''; cells[index].className = Number.isFinite(value) ? value >= 0 ? 'shift-dem' : 'shift-rep' : ''; }
    cells[5].textContent = count(row.reported_total); cells[6].replaceChildren();
    if (Number.isFinite(row.source_vote_progress?.percent_votes_counted)) cells[6].append(el('strong', percent(row.source_vote_progress.percent_votes_counted)));
    if (Number.isFinite(row.source_vote_progress?.percent_votes_remaining)) cells[6].append(el('small', percent(row.source_vote_progress.percent_votes_remaining) + ' left'));
    if (body.children[position] !== tr) body.insertBefore(tr, body.children[position] || null);
  }
  existing.forEach((row) => row.remove());
  if (focusedKey && document.activeElement === document.body) [...body.children].find((row) => row.dataset.unitKey === focusedKey)?.querySelector('button')?.focus({ preventScroll: true });
}

function stateOfficeRace(code) {
  if (state.office === 'house') return null;
  if (code === state.selected && currentRace()) return currentRace();
  return allRaces().filter((race) => race.state === code && race.office === state.office).sort((a, b) => Number(Boolean(a.special)) - Number(Boolean(b.special)))[0] || null;
}
function registrationOverviewRecords() {
  const query = state.registrationFilter.trim().toLocaleLowerCase();
  const records = [...(state.registration?.states.values() || [])].map((row) => {
    const name = state.map?.states.find((area) => area.state === row.state)?.name || row.state, race = stateOfficeRace(row.state);
    return { row, name, race, presidential: race ? comparisonDisplay(race) : null, registration: race ? registrationDisplay(race) : null };
  }).filter((record) => !query || (record.name + ' ' + record.row.state).toLocaleLowerCase().includes(query));
  const byNumber = (a, b, get) => { const av = get(a), bv = get(b); return Number.isFinite(av) ? Number.isFinite(bv) ? bv - av : -1 : Number.isFinite(bv) ? 1 : 0; };
  return records.sort((a, b) => {
    const difference = state.registrationSort === 'total' ? byNumber(a, b, (item) => item.row.total) : state.registrationSort === 'dem' ? byNumber(a, b, (item) => item.row.dem) : state.registrationSort === 'rep' ? byNumber(a, b, (item) => item.row.rep) : state.registrationSort === 'shift' ? byNumber(a, b, (item) => item.presidential?.shift_pp) : 0;
    return difference || a.name.localeCompare(b.name);
  });
}
function appendRegistrationDetails(target, row, previousOpen = false) {
  const details = el('details', null, 'registration-source-details'); details.open = previousOpen; details.append(el('summary', 'Source details'));
  const full = el('div', null, 'registration-source-details-content');
  if (row.definition) full.append(el('p', row.definition));
  if (row.source_url) full.append(sourceLink(row.source_url, row.source_name || 'Source'));
  const compilation = registrationCompilation(row); if (compilation) full.append(el('p', compilation));
  if (row.report_generated_at) full.append(el('p', 'Report generated ' + snapshotDate(String(row.report_generated_at).slice(0, 10))));
  if (row.checked_at) full.append(el('p', 'Checked ' + snapshotDate(String(row.checked_at).slice(0, 10))));
  for (const value of Array.isArray(row.notes) ? row.notes : row.notes ? [row.notes] : []) if (typeof value === 'string' && value) full.append(el('p', value));
  details.append(full); target.append(details); return details;
}
function renderRegistrationSnapshotCell(cell, row) {
  const previousOpen = cell.querySelector('details')?.open || false, summaryFocused = document.activeElement === cell.querySelector('summary');
  cell.replaceChildren(); const date = registrationSnapshot(row); if (date) cell.append(el('strong', date));
  if (row.source_url || row.definition) { const details = appendRegistrationDetails(cell, row, previousOpen); if (summaryFocused) details.querySelector('summary').focus({ preventScroll: true }); }
}

function renderRegistrationOverview() {
  const panel = $('registration-overview-panel'), target = $('registration-overview-content');
  if (!panel || !target) return;
  panel.hidden = state.displayMode !== 'president'; if (panel.hidden) return;
  $('registration-overview-context').textContent = OFFICE[state.office] + ' · ' + state.baselineYear + ' presidential comparison · state registration snapshots';
  panel.setAttribute('aria-busy', String(state.registrationPending));
  if (!$('registration-state-filter')) {
    const controls = el('div', null, 'county-table-controls registration-overview-controls');
    const label = el('label', 'Find a state'), filter = el('input'); filter.type = 'search'; filter.id = 'registration-state-filter'; filter.placeholder = 'State name or abbreviation'; filter.autocomplete = 'off'; filter.value = state.registrationFilter;
    filter.addEventListener('input', () => { state.registrationFilter = filter.value; renderRegistrationOverview(); }); label.append(filter);
    const sorting = el('label', 'Sort'), sort = el('select'); sort.id = 'registration-state-sort';
    for (const [value, text] of [['name', 'State A–Z'], ['total', 'Most registered'], ['dem', 'Most D registered'], ['rep', 'Most R registered'], ['shift', 'Largest shift toward D']]) { const option = el('option', text); option.value = value; sort.append(option); }
    sort.value = state.registrationSort; sort.addEventListener('change', () => { state.registrationSort = sort.value; renderRegistrationOverview(); }); sorting.append(sort);
    const reset = el('button', 'Clear search', 'county-filter-clear'); reset.type = 'button'; reset.addEventListener('click', () => { state.registrationFilter = ''; filter.value = ''; renderRegistrationOverview(); filter.focus({ preventScroll: true }); });
    controls.append(label, sorting, reset);
    const status = el('p', null, 'county-table-status'); status.id = 'registration-overview-status'; status.setAttribute('role', 'status');
    const wrap = el('div', null, 'county-table-wrap registration-overview-wrap'); wrap.tabIndex = 0; wrap.setAttribute('role', 'region'); wrap.setAttribute('aria-label', 'Scrollable statewide registration and presidential comparison');
    const table = el('table', null, 'county-table registration-overview-table'); table.id = 'registration-overview-table';
    const caption = el('caption', 'State registrations and presidential comparisons.'); caption.className = 'visually-hidden';
    const head = el('thead'), tr = el('tr');
    for (const [key, text] of [['state', 'State'], ['dem', 'D registered'], ['rep', 'R registered'], ['unaffiliated', 'Unaffiliated'], ['total', 'Total registered'], ['dem_pres', 'D / Harris'], ['rep_pres', 'R / Trump'], ['shift', 'Presidential margin shift'], ['snapshot', 'Snapshot / source']]) { const th = el('th', text); th.scope = 'col'; th.dataset.column = key; tr.append(th); }
    const body = el('tbody'); body.id = 'registration-state-rows'; head.append(tr); table.append(caption, head, body); wrap.append(table);
    target.append(controls, status, wrap);
  }
  const records = registrationOverviewRecords(), status = $('registration-overview-status');
  const note = state.registrationPending ? 'Loading…' : state.registrationError ? 'Refresh failed.' : state.registration ? records.length + ' states / DC' : '';
  status.replaceChildren(el('span', note)); status.hidden = !note;
  if (state.registrationError) { const retry = el('button', 'Retry', 'comparison-retry'); retry.type = 'button'; retry.addEventListener('click', loadRegistration); status.append(retry); }
  $('registration-overview-table').querySelector('[data-column="dem_pres"]').textContent = 'D / ' + (state.baselineYear === 2024 ? 'Harris' : 'Biden') + ' ' + state.baselineYear;
  $('registration-overview-table').querySelector('[data-column="rep_pres"]').textContent = 'R / Trump ' + state.baselineYear;
  const body = $('registration-state-rows'), existing = new Map([...body.children].map((row) => [row.dataset.state, row]));
  const focused = document.activeElement?.closest('#registration-state-rows tr')?.dataset.state;
  for (const [position, record] of records.entries()) {
    const { row, name, race, presidential, registration } = record;
    let tr = existing.get(row.state); existing.delete(row.state);
    if (!tr) {
      tr = el('tr'); tr.dataset.state = row.state; const heading = el('th'); heading.scope = 'row';
      const button = el('button'); button.type = 'button'; button.addEventListener('click', () => { showStateView(false); selectState(row.state); }); heading.append(button); tr.append(heading);
      for (let index = 0; index < 8; index++) tr.append(el('td'));
    }
    tr.classList.toggle('selected', row.state === state.selected);
    const button = tr.querySelector('button'); button.textContent = name; button.setAttribute('aria-pressed', String(row.state === state.selected));
    const cells = [...tr.querySelectorAll('td')];
    for (const [index, key] of ['dem', 'rep', 'unaffiliated', 'total'].entries()) {
      const cell = cells[index]; cell.className = 'registration-overview-count ' + key; cell.replaceChildren(el('strong', registrationCount(row, key)));
      if (key === 'dem' || key === 'rep') {
        const difference = registration?.ratios?.[key]?.difference_votes ?? registration?.ratios?.[key]?.difference;
        if (Number.isFinite(difference)) cell.append(el('small', 'Counted − reg: ' + signedCount(difference)));
      }
    }
    for (const [index, code] of ['dem', 'rep'].entries()) {
      const value = presidential?.ratios?.[code]?.percent; cells[index + 4].className = 'county-count-comparison ' + code; cells[index + 4].replaceChildren(); if (Number.isFinite(value)) { cells[index + 4].append(el('strong', percent(value))); if (race) cells[index + 4].append(el('small', raceLabel(race))); }
      cells[index + 4].title = Number.isFinite(value) ? 'Current votes / presidential votes' : '';
    }
    cells[6].textContent = Number.isFinite(presidential?.shift_pp) ? shiftLabel(presidential.shift_pp) : ''; cells[6].className = Number.isFinite(presidential?.shift_pp) ? presidential.shift_pp >= 0 ? 'shift-dem' : 'shift-rep' : '';
    cells[7].className = 'registration-snapshot-cell'; renderRegistrationSnapshotCell(cells[7], row);
    if (body.children[position] !== tr) body.insertBefore(tr, body.children[position] || null);
  }
  existing.forEach((row) => row.remove());
  if (focused && document.activeElement === document.body) [...body.children].find((row) => row.dataset.state === focused)?.querySelector('button')?.focus({ preventScroll: true });
}

function renderBreadcrumbs() {
  const target = $('results-breadcrumbs'); if (!target) return;
  const us = el('button', 'U.S.'); us.type = 'button'; us.addEventListener('click', () => showStateView(true));
  target.replaceChildren(us);
  if (!state.selected) return;
  const area = state.map?.states.find((item) => item.state === state.selected);
  const stateButton = el('button', area?.name || state.selected); stateButton.type = 'button'; stateButton.addEventListener('click', () => { state.focused = true; state.map?.focusState(state.selected); showStateView(false); });
  target.append(el('span', '›'), stateButton);
  if (state.countyView) { const counties = el(state.selectedCounty ? 'button' : 'span', 'Counties / local units'); if (state.selectedCounty) { counties.type = 'button'; counties.addEventListener('click', () => { state.selectedCounty = ''; render(); }); } else counties.setAttribute('aria-current', 'page'); target.append(el('span', '›'), counties); }
  const selected = state.countyData?.rows.find((row) => countyKey(row) === state.selectedCounty);
  if (state.countyView && selected) { const unit = el('span', selected.name); unit.setAttribute('aria-current', 'page'); target.append(el('span', '›'), unit); }
}

function showStateView(national = false) {
  rememberCounty(); invalidateCountyRequest(); state.countyView = false; state.selectedCounty = '';
  if (national) { state.focused = false; state.map?.reset(); }
  else if (state.selected) { state.focused = true; state.map?.focusState(state.selected); }
  render();
}

async function attachCountyGeometry(data, selected) {
  if (data.geometry) { const ids = new Set(data.geometry.counties.map((county) => county.id)); data.matchedGeometry = data.rows.filter((row) => /^\d{5}$/.test(String(row.county_fips || '')) && ids.has(row.county_fips)).length; return; }
  try {
    const geography = await loadCountyGeography(selected);
    if (state.countyData !== data || state.selected !== selected) return;
    data.geometry = geography;
    const ids = new Set(geography.counties.map((county) => county.id));
    data.matchedGeometry = data.rows.filter((row) => /^\d{5}$/.test(String(row.county_fips || '')) && ids.has(row.county_fips)).length;
    if (!data.matchedGeometry && state.countyLayer === 'geographic') { state.countyLayer = 'tiles'; state.countyMessage = 'Tiles'; }
    render();
  } catch {
    if (state.countyData === data) { data.geometryError = true; state.countyLayer = 'tiles'; state.countyMessage = 'Tiles'; render(); }
  }
}

async function loadCounties(race, { layer = state.countyPreferredLayer, refresh = false, silent = false } = {}) {
  if (!race || state.countyPending) return;
  const selected = state.selected, request = ++state.countyRequest;
  const isCurrent = () => request === state.countyRequest && state.selected === selected && currentRace()?.race_id === race.race_id;
  state.countyRace = race.race_id; state.countyPending = true; state.countyMessage = ''; state.countyView = true; state.countyLayer = layer;
  if (!state.baseline && !state.baselinePending && !state.baselineError && state.office !== 'house') loadBaseline();
  if (!silent) render(); else { renderCountyTiles(); renderCountyTable(); }
  try {
    // The lazy read fetches a cold feed directly. Only explicit refresh invalidates its cache.
    const refreshOkay = refresh ? await requestRefresh({ county_race_id: race.race_id }) : true;
    const response = await resultsFetch('/api/results-map?race_id=' + encodeURIComponent(race.race_id) + '&detail=county', { cache: 'no-store' });
    if (!response.ok) throw new Error();
    const payload = await response.json();
    if (!isCurrent()) return;
    const rows = Array.isArray(payload.counties) ? payload.counties : [];
    const old = state.countyData?.race.race_id === race.race_id ? state.countyData : null;
    const coverage = payload.county_coverage || {};
    if (!rows.length && (coverage.error || coverage.stale) && old?.rows.length) {
      old.coverage = { ...old.coverage, ...coverage }; state.countyMessage = 'Refresh failed. Retry.';
    } else {
      const data = { rows, coverage, race, geometry: old?.geometry, matchedGeometry: old?.matchedGeometry };
      state.countyData = data; cacheCounty(data);
      if (!rows.some((row) => countyKey(row) === state.selectedCounty)) state.selectedCounty = '';
      if (!rows.length) state.countyMessage = coverage.error ? 'Refresh failed. Retry.' : '';
      if (rows.length && rows.some((row) => /^\d{5}$/.test(String(row.county_fips || '')))) attachCountyGeometry(data, selected);
      else if (rows.length) { data.matchedGeometry = 0; data.geometryUnavailable = true; state.countyLayer = 'tiles'; state.countyMessage = 'Tiles'; }
    }
    if (!refreshOkay) state.countyMessage = 'Refresh failed. Retry.';
  } catch {
    if (isCurrent()) state.countyMessage = state.countyData ? 'Refresh failed. Retry.' : 'Refresh failed. Retry.';
  } finally {
    if (isCurrent()) { state.countyPending = false; render(); }
  }
}

function render() {
  if (!state.map) return;
  // House has no verified district presidential baseline. Every entry path
  // (office tabs, search and race links) must retain its reported-result colors.
  if (state.office === 'house') state.displayMode = 'results';
  const races = allRaces(), officeRaces = races.filter((race) => race.office === state.office), compare = state.displayMode === 'president';
  const area = state.map.states.find((item) => item.state === state.selected);
  document.body.classList.toggle('president-mode', compare);
  document.querySelector('.results-display-controls').hidden = state.office === 'house';
  $('national-map-title').textContent = state.countyView && state.countyData ? (area?.name || state.selected) + ' local results' : OFFICE[state.office];
  document.querySelectorAll('[data-results-office]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.resultsOffice === state.office)));
  document.querySelectorAll('[data-results-display]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.resultsDisplay === state.displayMode)));
  $('results-baseline-year').disabled = !compare && !state.countyView;
  $('results-comparison-status').textContent = compare ? state.baselineError || '' : '';
  const ratioMode = compare && state.mapMetric !== 'margin_shift';
  $('results-lead-legend').hidden = compare; $('results-shift-legend').hidden = !compare || ratioMode;
  if ($('results-ratio-legend')) { $('results-ratio-legend').hidden = !ratioMode; $('results-ratio-legend').classList.toggle('rep', state.mapMetric === 'rep_ratio'); $('results-ratio-legend').classList.toggle('dem', state.mapMetric !== 'rep_ratio'); $('ratio-legend-label').textContent = ratioMapLabel() + ' ' + state.baselineYear; }
  if ($('results-map-metric-control')) $('results-map-metric-control').hidden = !compare;
  if ($('results-map-metric')) { $('results-map-metric').value = state.mapMetric; $('results-map-metric').querySelector('[value="dem_ratio"]').textContent = 'D votes / ' + (state.baselineYear === 2024 ? 'Harris' : 'Biden'); }
  const values = new Map();
  // The main race supplies the statewide map when a state also has a special election.
  officeRaces.slice().sort((a, b) => Number(Boolean(a.special)) - Number(Boolean(b.special))).forEach((race) => { if (state.office !== 'house' && !values.has(race.state)) values.set(race.state, mapValue(race)); });
  state.map.setStates(values); state.map.setSelected(state.selected);
  const units = state.countyView && state.countyData ? state.countyData.rows.map((row) => withCountyContext(row, state.countyData.race)) : officeRaces;
  let dem = 0, rep = 0, comparable = 0;
  units.forEach((race) => {
    if (ratioMode) { const value = mapValue(race, state.countyView ? 'county' : 'state'); if (Number.isFinite(value.ratio)) comparable++; }
    else if (compare) { const change = comparison(race, state.countyView ? 'county' : 'state'); if (change.status === 'available' && Number.isFinite(change.shift_pp)) { comparable++; if (change.shift_pp > 0.05) dem++; else if (change.shift_pp < -0.05) rep++; } }
    else { const lead = leader(race); if (lead && party(lead.party) === 'dem') dem++; if (lead && party(lead.party) === 'rep') rep++; }
  });
  const selectedUnit = state.countyView && state.countyData?.rows.find((row) => countyKey(row) === state.selectedCounty);
  const selectedDisplay = ratioMode && currentRace() ? comparisonDisplay(selectedUnit ? withCountyContext(selectedUnit, currentRace()) : currentRace(), selectedUnit ? 'county' : 'state') : null;
  $('map-dem-leads').textContent = ratioMode ? percent(selectedDisplay?.ratios?.dem?.percent) : state.data ? String(dem) : ''; $('map-rep-leads').textContent = ratioMode ? percent(selectedDisplay?.ratios?.rep?.percent) : state.data ? String(rep) : '';
  $('map-dem-leads').closest('.summary-party').hidden = ratioMode && !Number.isFinite(selectedDisplay?.ratios?.dem?.percent); $('map-rep-leads').closest('.summary-party').hidden = ratioMode && !Number.isFinite(selectedDisplay?.ratios?.rep?.percent);
  $('map-national-summary').hidden = !compare && !state.countyView || state.countyView && !state.countyData?.rows.length || compare && (!comparable || ratioMode && !Number.isFinite(selectedDisplay?.ratios?.dem?.percent) && !Number.isFinite(selectedDisplay?.ratios?.rep?.percent)) || !compare && state.countyView && !units.some((race) => Number.isFinite(race.reported_total));
  $('map-dem-label').textContent = ratioMode ? 'D / ' + (state.baselineYear === 2024 ? 'Harris' : 'Biden') : compare ? 'Shift toward D' : 'Democratic leads'; $('map-rep-label').textContent = ratioMode ? 'R / Trump' : compare ? 'Shift toward R' : 'Republican leads';
  $('map-summary-context').textContent = ratioMode ? comparable + ' mapped count ratios · ' + (selectedUnit?.name || area?.name || 'Selected race') : compare ? comparable + ' margin shifts · ' + state.baselineYear : state.countyView && state.countyData ? state.countyData.rows.length + ' local units · reported leads' : officeRaces.filter(hasVotes).length + ' races with reported votes';
  $('map-view-label').textContent = state.focused ? area?.name || 'Selected state' : 'National overview · select a state';
  $('map-geography-note').textContent = '';
  $('results-lead-legend').classList.toggle('house-state-mode', state.office === 'house');
  renderChamberSummary(); renderInspector(); renderAvailableRaces(); renderCountyTiles(); renderCountyTable(); renderRegistrationOverview(); renderBreadcrumbs();
}

function chooseCounty(key) { state.selectedCounty = key; rememberCounty(); render(); if (innerWidth <= 800) document.querySelector('.race-inspector').scrollIntoView({ block: 'start', behavior: 'smooth' }); }

function renderCountyTiles() {
  const data = state.countyData, enabled = Boolean(state.countyView && data?.rows.length), geographic = enabled && state.countyLayer === 'geographic' && Boolean(data.geometry) && data.matchedGeometry > 0;
  const geometryPending = enabled && state.countyLayer === 'geographic' && !data.geometry && !data.geometryError && !data.geometryUnavailable;
  const compare = state.displayMode === 'president', race = currentRace();
  $('results-map').hidden = enabled; $('house-results-map').hidden = true; $('county-tile-view').hidden = !enabled || geographic || geometryPending; $('county-geographic-view').hidden = !geographic && !geometryPending; $('map-geometry-credit').hidden = enabled;
  $('county-layer-controls').hidden = !race;
  $('map-show-states').setAttribute('aria-pressed', String(!state.countyView)); $('map-show-counties').setAttribute('aria-pressed', String(enabled && !geographic)); $('map-show-county-geo').setAttribute('aria-pressed', String(geographic));
  $('map-show-counties').disabled = !race || state.countyPending; $('map-show-county-geo').disabled = !race || state.countyPending || Boolean(data?.geometryUnavailable || data?.geometry && !data.matchedGeometry);
  $('map-show-county-geo').title = data?.geometryUnavailable || data?.geometry && !data.matchedGeometry ? 'No exact county boundaries for these source units; use Tiles.' : 'Show actual county outlines';
  $('county-load-status').hidden = !(state.countyPending || state.countyMessage);
  $('county-load-status').textContent = state.countyPending ? 'Loading county / local results…' : state.countyMessage;
  $('national-map-panel').setAttribute('aria-busy', String(state.countyPending));
  if (!enabled) {
    if (state.countyView) {
      $('results-map').hidden = true; $('house-results-map').hidden = true; $('county-geographic-view').hidden = false;
      $('county-geometry-description').textContent = state.countyPending ? 'Loading…' : state.countyMessage || '';
      $('county-geographic-map').replaceChildren();
      $('map-view-label').textContent = (state.map?.states.find((item) => item.state === state.selected)?.name || state.selected) + ' · Counties';
      $('map-reset').hidden = false; $('map-focus-state').hidden = true;
      return;
    }
    const source = state.data?.source;
    if (source) { const checked = eastern(source.checked_at); $('map-data-status').textContent = (source.providers?.join(' · ') || 'CNN') + (checked ? ' · Source checked ' + checked : ''); }
    const credit = $('map-geometry-credit');
    if (state.office === 'house' && state.houseGeometry) {
      $('results-map').hidden = true; $('house-results-map').hidden = false;
      const races = allRaces().filter((item) => item.office === 'house'), byKey = new Map(races.map((item) => [item.state + '-' + Number(item.district), item])), values = new Map();
      byKey.forEach((item, key) => { const value = mapValue(item); values.set(key, { ...value, description: item.state + ' ' + raceLabel(item) + ' · ' + value.description }); });
      const selected = currentRace();
      const coverage = drawHouseMap($('house-results-map'), { geography: state.houseGeometry, values, selectedKey: selected ? selected.state + '-' + Number(selected.district) : '', focusState: state.focused ? state.selected : null, onSelect: (key, district) => { const item = byKey.get(key); if (item) selectRace(item); else { selectState(district.state); state.pendingHouseKey = key; } } });
      $('map-geography-note').textContent = '';
      $('results-lead-legend').classList.remove('house-state-mode');
      credit.replaceChildren('House outlines: ', sourceLink(state.houseGeometry.source, 'AP 2026'));
    } else credit.replaceChildren('Geography: ', sourceLink('https://github.com/topojson/us-atlas', 'U.S. Census / US Atlas'), ' · AK/HI shown as insets');
    return;
  }
  $('map-focus-state').hidden = true; $('map-reset').hidden = false;
  $('map-view-label').textContent = (state.map.states.find((item) => item.state === state.selected)?.name || state.selected) + ' · ' + raceLabel(data.race);
  const locality = data.rows.some((row) => !row.county_fips);
  $('county-tile-description').textContent = 'Equal-size ' + (locality ? 'local reporting unit' : 'county') + ' tiles · ' + data.rows.length + ' units · Select a tile for votes.';
  const checked = eastern(data.coverage.checked_at);
  $('map-data-status').textContent = (data.race.source_name || 'Public source') + ' · Local snapshot' + (checked ? ' checked ' + checked : '') + (data.coverage.stale || data.coverage.error ? ' · Refresh delayed' : '') + (data.coverage.matches_national_snapshot === false ? ' · Different snapshot from state feed' : '');
  $('map-geography-note').textContent = '';
  if (geometryPending) { $('county-geometry-description').textContent = 'Loading actual county outlines…'; $('county-geographic-map').replaceChildren(); return; }
  if (geographic) {
    const area = state.map.states.find((item) => item.state === state.selected), values = new Map();
    data.rows.forEach((row) => { if (/^\d{5}$/.test(String(row.county_fips || ''))) values.set(row.county_fips, { name: row.name, ...mapValue(withCountyContext(row, data.race), 'county') }); });
    const focusedFips = document.activeElement?.closest('.map-county')?.dataset.countyFips;
    const coverage = drawCountyMap($('county-geographic-map'), { geography: data.geometry, stateFips: area.id, stateBounds: area.bounds, values, selected: state.selectedCounty, onSelect: chooseCounty });
    if (focusedFips) $('county-geographic-map').querySelector('[data-county-fips="' + focusedFips + '"]')?.focus({ preventScroll: true });
    $('county-geometry-description').textContent = 'County outlines: ' + (data.geometry.state ? 'AP 2026' : 'Census 2017') + ' · ' + coverage.matched + ' matched units' + (data.coverage.aggregation_basis === 'verified_ma_town_to_county_rollup' ? ' · Town totals grouped by county' : '') + (coverage.matched < data.rows.length ? ' · Tiles includes all source units.' : '');
    if (typeof data.geometry.source === 'string') $('county-geometry-description').append(' · ', sourceLink(data.geometry.source, 'Map source'));
    return;
  }
  const grid = $('county-tile-grid'); grid.replaceChildren();
  data.rows.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')).forEach((row) => {
    const county = withCountyContext(row, data.race), value = mapValue(county, 'county'), key = countyKey(county), fullName = county.name || county.reporting_unit_id || county.county_fips;
    const button = el('button', null, 'county-tile ' + (value.party || 'no-returns') + (state.selectedCounty === key ? ' selected' : ''));
    if (value.fill) { button.style.background = value.fill; button.style.color = Number.isFinite(value.ratio) ? value.ratio > 90 ? '#fff' : '#243e5c' : Math.abs(value.shift) > 8 ? '#fff' : '#243e5c'; }
    button.type = 'button'; button.dataset.countyFips = county.county_fips || ''; button.dataset.reportingUnitId = county.reporting_unit_id || '';
    const status = compare ? Number.isFinite(value.ratio) ? percent(value.ratio) + ' of prior' : Number.isFinite(value.shift) ? shiftLabel(value.shift) : '' : leader(county) ? (leader(county).party || 'Other') + ' leads' : '';
    button.setAttribute('aria-label', [fullName, Number.isFinite(county.reported_total) ? count(county.reported_total) + ' votes' : '', value.description].filter(Boolean).join(' · ')); button.setAttribute('aria-pressed', String(state.selectedCounty === key)); button.title = fullName + ' · ' + value.description;
    button.append(el('strong', fullName.replace(/ County$/, ''))); if (status) button.append(el('span', status)); if (Number.isFinite(county.reported_total)) button.append(el('small', count(county.reported_total) + ' votes'));
    button.addEventListener('click', () => chooseCounty(key)); grid.append(button);
  });
}

function renderAvailableRaces() {
  const races = allRaces().filter((race) => race.office === state.office);
  const states = new Set(races.map((race) => race.state));
  $('results-coverage-note').textContent = races.length + ' races · ' + states.size + ' states';
  const target = $('results-available-races'); target.replaceChildren();
  races.forEach((race) => {
    const button = el('button', null, 'available-race' + (race.race_id === state.raceId ? ' active' : '')); button.type = 'button';
    const leading = leader(race), call = calledName(race);
    button.append(el('strong', race.state + ' · ' + raceLabel(race))); if (call || leading) button.append(el('span', call ? call + ' · CNN called' : leading.name + ' leads')); if (Number.isFinite(race.reported_total)) button.append(el('small', count(race.reported_total) + ' votes'));
    button.addEventListener('click', () => selectRace(race)); target.append(button);
  });
}

async function fetchResults(refresh = false) {
  if (state.pending || document.hidden) return; state.pending = true; $('results-refresh').disabled = true;
  $('map-data-status').textContent = refresh ? 'Checking public sources…' : 'Loading source snapshots…';
  try {
    const refreshOkay = refresh ? await requestRefresh() : true;
    const response = await resultsFetch('/api/results-map', { cache: 'no-store' }); if (!response.ok) throw new Error();
    const data = await response.json(); if (!Array.isArray(data.states)) throw new Error(); state.data = data;
    if (!state.selected) {
      const races = allRaces(); const preferred = races.find((race) => race.state === 'KY' && race.office === state.office && hasVotes(race)) || races.find((race) => race.office === state.office && hasVotes(race)) || races.find((race) => race.state === 'NC' && race.office === state.office) || races[0];
      if (preferred) { state.selected = preferred.state; state.raceId = preferred.race_id; }
    }
    if (state.pendingHouseKey) { const selected = allRaces().find((race) => race.office === 'house' && race.state + '-' + Number(race.district) === state.pendingHouseKey); if (selected) { state.selected = selected.state; state.raceId = selected.race_id; state.pendingHouseKey = ''; } }
    render();
    const source = data.source || {};
    const checked = eastern(source.checked_at);
    const provider = source.providers?.length ? source.providers.join(' · ') : 'CNN';
    $('map-data-status').textContent = provider + (checked ? ' · Source checked ' + checked : '');
    const notice = $('results-source-notice');
    notice.hidden = !(source.stale || source.error || !refreshOkay || ['unavailable', 'not_configured'].includes(source.status));
    if (!notice.hidden) notice.textContent = 'Refresh failed. Retry Refresh.';
    if (state.countyView) { const race = currentRace(); if (race && !state.countyPending) loadCounties(race, { layer: state.countyLayer, refresh, silent: true }); }
  } catch { $('map-data-status').textContent = 'Refresh failed. Retry Refresh.'; }
  finally { state.pending = false; $('results-refresh').disabled = false; }
}

function search(value) {
  const target = $('results-search-matches'); target.replaceChildren(); const query = value.trim().toLowerCase();
  if (!query) { target.hidden = true; return; }
  const states = (state.map?.states || []).filter((item) => item.name.toLowerCase().includes(query) || item.state.toLowerCase() === query);
  const races = allRaces().filter((race) => (race.state + ' ' + raceLabel(race) + ' ' + (race.candidates || []).map((item) => item.name).join(' ')).toLowerCase().includes(query));
  for (const item of states.slice(0, 4)) { const button = el('button', item.name + ' · ' + item.state); button.type = 'button'; button.addEventListener('click', () => { selectState(item.state); target.hidden = true; $('results-search').value = ''; }); target.append(button); }
  for (const race of races.slice(0, 6)) { const button = el('button', race.state + ' · ' + raceLabel(race)); button.type = 'button'; button.addEventListener('click', () => { selectRace(race); target.hidden = true; $('results-search').value = ''; }); target.append(button); }
  if (!target.children.length) target.append(el('p', 'No matching connected race or state.')); target.hidden = false;
}

export function ensureResultsBoard() {
  syncPage(); if (state.initialized) { fetchResults(); return; } state.initialized = true;
  updateClock(); setInterval(updateClock, 1000); window.addEventListener('hashchange', syncPage);
  document.querySelectorAll('[data-results-office]').forEach((button) => button.addEventListener('click', () => { state.office = button.dataset.resultsOffice; selectState(state.selected); }));
  document.querySelectorAll('[data-results-display]').forEach((button) => button.addEventListener('click', () => { state.displayMode = button.dataset.resultsDisplay; if (state.displayMode === 'president' && !state.registration && !state.registrationPending) loadRegistration(); if (state.displayMode === 'president' && !state.baseline && !state.baselinePending) loadBaseline(); else render(); }));
  $('results-baseline-year').addEventListener('change', (event) => { state.baselineYear = Number(event.target.value); loadBaseline(); });
  $('results-map-metric')?.addEventListener('change', (event) => { state.mapMetric = event.target.value; render(); });
  $('results-state').addEventListener('change', (event) => selectState(event.target.value));
  $('results-refresh').addEventListener('click', () => { if (!state.chamberReference && !state.chamberPending) loadChamberSummary(); fetchResults(true); });
  $('results-search').addEventListener('input', (event) => search(event.target.value));
  $('results-search').addEventListener('keydown', (event) => { if (event.key === 'Escape') $('results-search-matches').hidden = true; if (event.key === 'Enter') { event.preventDefault(); $('results-search-matches').querySelector('button')?.click(); } });
  document.addEventListener('click', (event) => { if (!event.target.closest('.results-search-wrap')) $('results-search-matches').hidden = true; });
  $('map-focus-state').addEventListener('click', () => { state.focused = true; state.map?.focusState(state.selected); render(); });
  $('map-reset').addEventListener('click', () => showStateView(true));
  $('map-show-states').addEventListener('click', () => showStateView(false));
  const showCounties = (layer) => { const race = currentRace(); if (!race) return; state.countyPreferredLayer = layer; state.selectedCounty = state.selectedCounty || state.countySelections.get(state.selected) || ''; if (state.countyData?.race.race_id === race.race_id && state.countyData.rows.length) { state.countyView = true; state.countyLayer = state.countyData.geometryUnavailable ? 'tiles' : layer; if (!state.baseline && !state.baselinePending && state.office !== 'house') loadBaseline(); render(); if (!state.countyData.geometry && !state.countyData.geometryUnavailable && (layer === 'geographic' || !state.countyData.geometryError)) attachCountyGeometry(state.countyData, state.selected); } else loadCounties(race, { layer }); };
  $('map-show-counties').addEventListener('click', () => showCounties('tiles'));
  $('map-show-county-geo').addEventListener('click', () => showCounties('geographic'));
  const fullscreen = $('results-fullscreen'); if (!document.fullscreenEnabled) fullscreen.hidden = true;
  fullscreen.addEventListener('click', async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await $('national-map-panel').requestFullscreen(); } catch { $('map-data-status').textContent = 'Fullscreen failed.'; } });
  document.addEventListener('fullscreenchange', () => { fullscreen.querySelector('span').textContent = document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen'; });
  createElectionMap($('results-map'), selectState).then((map) => { state.map = map; map.states.slice().sort((a, b) => a.name.localeCompare(b.name)).forEach((item) => { const option = el('option', item.name); option.value = item.state; $('results-state').append(option); }); render(); }).catch(() => { $('results-map').replaceChildren(el('p', 'Refresh map', 'map-loading')); });
  loadHouseGeography().then((geography) => { state.houseGeometry = geography; render(); }).catch(() => {});
  loadChamberSummary(); fetchResults(); setInterval(() => { if (document.body.classList.contains('results-mode')) fetchResults(); }, 60000);
  window.addEventListener('online', () => fetchResults()); document.addEventListener('visibilitychange', () => { if (!document.hidden && document.body.classList.contains('results-mode')) fetchResults(); });
}
