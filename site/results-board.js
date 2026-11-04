import { resultsFetch } from './results-client.js';
import { createElectionMap, loadCountyGeography, drawCountyMap, loadHouseGeography, drawHouseMap } from './election-map.js';

const $ = (id) => document.getElementById(id);
const OFFICE = { senate: 'U.S. Senate', house: 'U.S. House', governor: 'Governor' };
const state = { office: 'senate', selected: '', raceId: '', data: null, map: null, houseGeometry: null, pendingHouseKey: '', initialized: false, pending: false, countyRace: '', countyData: null, countyView: false, countyLayer: 'tiles', selectedCounty: '', focused: false, countyPending: false, countyMessage: '', countyRequest: 0, displayMode: 'results', baselineYear: 2024, baseline: null, baselinePending: false, baselineError: '', historyModule: null, historyRequest: 0 };
const count = (value) => Number.isFinite(value) ? value.toLocaleString('en-US') : '—';
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
function clearCounty() { state.countyRequest++; state.countyPending = false; state.countyMessage = ''; state.countyRace = ''; state.countyData = null; state.countyView = false; state.selectedCounty = ''; }
function withCountyContext(row, race) { return { ...row, state: race.state, office: race.office, district: race.district, race_id: race.race_id, label: row.name, source_name: row.source_name || race.source_name, source_url: row.source_url || race.source_url, source_called_winner: null }; }
function shiftLabel(value) { return Math.abs(value) < 0.05 ? 'No margin shift' : (value > 0 ? 'D +' : 'R +') + Math.abs(value).toFixed(1) + ' pp'; }
function marginLabel(value) { return Math.abs(value) < 0.05 ? 'Even' : (value > 0 ? 'D +' : 'R +') + Math.abs(value).toFixed(1) + ' pp'; }
function shiftFill(value) { const amount = Math.min(1, Math.abs(value) / 15); const end = value >= 0 ? [45, 105, 179] : [191, 66, 86]; return 'rgb(' + end.map((v, i) => Math.round([242, 243, 246][i] + (v - [242, 243, 246][i]) * amount)).join(',') + ')'; }
function comparison(race, geography = 'state') {
  if (state.office === 'house' || race?.office === 'house') return { status: 'unavailable', reason: 'Presidential comparison unavailable for House district boundaries.' };
  if (state.baselinePending) return { status: 'unavailable', reason: 'Loading presidential results…' };
  if (!state.baseline || !state.historyModule) return { status: 'unavailable', reason: state.baselineError || 'Presidential results are not connected.' };
  const baseline = geography === 'county' ? state.baseline.counties.get(String(race?.county_fips || '')) : state.baseline.states.get(race?.state);
  if (!baseline) return { status: 'unavailable', reason: geography === 'county' ? 'No exact county presidential match for this reporting unit.' : 'Historical presidential results unavailable for this state.' };
  const result = state.historyModule.comparePresidentialMargin(race, baseline, { office: race.office, geography });
  return { ...result, baseline };
}
function mapValue(race, geography = 'state') {
  const lead = leader(race);
  if (state.displayMode === 'president') { const change = comparison(race, geography); return change.status === 'available' && Number.isFinite(change.shift_pp) ? { fill: shiftFill(change.shift_pp), shift: change.shift_pp, description: shiftLabel(change.shift_pp) + ' vs ' + state.baselineYear + ' President · current counted margin ' + marginLabel(change.current_margin_pp) } : { description: change.reason || 'Presidential comparison unavailable' }; }
  return { party: lead ? party(lead.party) : null, called: Boolean(calledName(race)), description: lead ? lead.name + ' leads · ' + count(race.reported_total) + ' reported votes' : hasVotes(race) ? residual(race) > 0 ? 'Vote attribution incomplete; no reported leader shown' : 'No reported leader' : 'Awaiting reported votes' };
}
async function loadBaseline() {
  const request = ++state.historyRequest, year = state.baselineYear;
  state.baseline = null; state.baselinePending = true; state.baselineError = ''; render();
  try { const module = await import('./presidential-history.js'); const data = await module.loadPresidentialHistory(year); if (request !== state.historyRequest) return; state.historyModule = module; state.baseline = data; }
  catch { if (request === state.historyRequest) state.baselineError = 'Presidential results could not load. Select the year again to retry.'; }
  finally { if (request === state.historyRequest) { state.baselinePending = false; render(); } }
}
function renderProgress(race, target) {
  const progress = race.source_vote_progress;
  const box = el('div', null, 'source-vote-progress');
  const percent = progress?.percent_votes_counted;
  if (Number.isFinite(percent) && hasVotes(race)) {
    const heading = el('div'); heading.append(el('span', 'CNN est. votes in'), el('strong', percent.toLocaleString('en-US', { maximumFractionDigits: 1 }) + '%')); box.append(heading);
    if (Number.isFinite(progress.percent_votes_remaining)) { const remaining = el('div'); remaining.append(el('span', 'Est. share remaining'), el('strong', progress.percent_votes_remaining.toLocaleString('en-US', { maximumFractionDigits: 1 }) + '%')); box.append(remaining); }
    if (Number.isFinite(progress.estimated_votes_remaining)) box.append(el('p', count(progress.estimated_votes_remaining) + ' source-estimated votes remaining'));
    else box.append(el('small', 'CNN supplies an estimated percentage; a remaining-vote count is unavailable.'));
  } else box.append(el('small', 'CNN estimated votes in / remaining unavailable.'));
  const units = race.reporting_units;
  if (units && Number.isFinite(units.reporting) && Number.isFinite(units.total)) box.append(el('small', count(units.reporting) + ' / ' + count(units.total) + ' reporting units · separate from estimated votes in'));
  target.append(box);
}
function renderComparison(race, target, geography = 'state') {
  if (state.displayMode !== 'president') return;
  const result = comparison(race, geography), box = el('div', null, 'presidential-comparison');
  box.append(el('h4', 'vs ' + state.baselineYear + ' President'));
  if (result.status !== 'available' || !Number.isFinite(result.shift_pp)) box.append(el('p', result.reason || 'Comparison unavailable for these reported votes.'));
  else {
    box.append(el('strong', shiftLabel(result.shift_pp), result.shift_pp >= 0 ? 'shift-dem' : 'shift-rep'));
    box.append(el('p', 'Current counted margin ' + marginLabel(result.current_margin_pp) + ' · ' + state.baselineYear + ' margin ' + marginLabel(result.historical_margin_pp)));
    box.append(el('p', count(race.reported_total) + ' current reported votes · ' + count(result.baseline.reported_total ?? result.baseline.valid_votes) + ' historical reported votes'));
    box.append(el('small', 'Partial 2026 reported vote vs historical reported presidential vote. Margins use each source’s reported total.'));
    box.append(sourceLink(result.baseline.source_url, 'Historical source: ' + result.baseline.source_name));
  }
  target.append(box);
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
  state.selected = code; state.raceId = raceId; state.pendingHouseKey = ''; clearCounty();
  if (state.focused) state.map?.focusState(code);
  render();
}
function selectRace(race) { state.office = race.office; selectState(race.state, race.race_id); }

function renderCandidates(race, target) {
  const total = race.reported_total;
  const rows = candidates(race);
  if (!hasVotes(race)) rows.sort((a, b) => Number(party(b.party) !== 'other') - Number(party(a.party) !== 'other'));
  for (const candidate of rows) {
    const row = el('div', null, 'inspector-candidate ' + party(candidate.party));
    const heading = el('div', null, 'inspector-candidate-heading');
    const name = el('span', candidate.name || 'Name not reported'); name.append(el('small', candidate.party || 'Party not reported'));
    const numbers = el('span', null, 'inspector-candidate-numbers');
    numbers.append(el('strong', hasVotes(race) && Number.isFinite(candidate.votes) ? (candidate.votes / total * 100).toFixed(1) + '%' : '—'));
    numbers.append(el('small', hasVotes(race) ? count(candidate.votes) + ' votes' : 'Awaiting votes'));
    heading.append(name, numbers); row.append(heading);
    const track = el('div', null, 'inspector-vote-track');
    if (hasVotes(race) && Number.isFinite(candidate.votes)) { const bar = el('span', null, party(candidate.party)); bar.style.width = Math.min(100, candidate.votes / total * 100) + '%'; track.append(bar); }
    row.append(track); target.append(row);
  }
  if (hasVotes(race) && residual(race) > 0) {
    const row = el('div', null, 'inspector-unattributed');
    const heading = el('div', null, 'inspector-candidate-heading');
    heading.append(el('span', 'Unattributed source votes'), el('strong', count(residual(race)) + ' · ' + (residual(race) / total * 100).toFixed(1) + '%'));
    row.append(heading, el('p', 'The source total includes votes not yet assigned to listed candidates.', 'unattributed-note')); target.append(row);
  }
  if (!rows.length) target.append(el('p', 'Candidate data has not been supplied for this race.', 'inspector-empty'));
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
    target.append(el('p', state.selected ? 'No connected ' + OFFICE[state.office].toLowerCase() + ' results for this state yet.' : 'Select a state on the map to explore its races.', 'inspector-empty'));
    target.append(el('p', 'Gray means no reported votes or no connected source. It does not mean the race is tied.', 'inspector-disclaimer'));
  } else {
    state.raceId = race.race_id;
    const header = el('div', null, 'inspector-race-heading'); header.append(el('h3', raceLabel(race)));
    const lead = leader(race), call = calledName(race);
    header.append(el('span', call ? 'Source call' : hasVotes(race) ? 'Reported results' : 'Awaiting returns', call ? 'race-status source-call' : 'race-status'));
    target.append(header);
    if (selectedCounty) { const back = el('button', 'Back to state totals', 'county-toggle'); back.type = 'button'; back.addEventListener('click', () => { state.selectedCounty = ''; render(); }); target.append(back); }
    if (call) target.append(el('p', (race.source_name || 'Source') + ' calls this race for ' + call + '.', 'source-call-note'));
    else if (lead) target.append(el('p', lead.name + ' leads the reported vote. No race call shown.', 'inspector-lead'));
    else if (hasVotes(race) && (residual(race) > 0 || race.vote_counts_complete === false)) target.append(el('p', 'Candidate vote attribution is incomplete. No reported leader is shown.', 'inspector-lead'));
    renderCandidates(race, target);
    const total = el('div', null, 'inspector-total'); total.append(el('span', 'Total reported votes'), el('strong', count(race.reported_total))); target.append(total);
    renderProgress(race, target);
    renderComparison(race, target, selectedCounty ? 'county' : 'state');
    const source = el('div', null, 'inspector-source'); source.append(sourceLink(race.source_url, race.source_name || state.data?.source?.name || 'Public results source'));
    const timestamp = eastern(race.source_updated_at); source.append(el('span', timestamp ? 'Source updated ' + timestamp : 'Source update time unavailable'));
    if (timestamp) source.append(el('span', age(race.source_updated_at), 'source-age'));
    if ((selectedCounty ? selectedCounty.source_stale || state.countyData?.coverage.stale : state.data?.source?.stale) && race.source_name === 'CNN') source.append(el('span', 'Saved verified snapshot; the source refresh is delayed.', 'inspector-saved-note'));
    target.append(source);
    const county = el('button', state.countyPending ? 'Loading local results…' : state.countyData ? 'Refresh county / local results' : 'County / local breakdown', 'county-toggle'); county.type = 'button'; county.disabled = state.countyPending; county.addEventListener('click', () => loadCounties(sourceRace, { layer: state.countyLayer, refresh: Boolean(state.countyData) })); target.append(county);
    const countyContent = el('div', null, 'county-results'); countyContent.id = 'county-results'; renderCountyList(countyContent); target.append(countyContent);
  }
  const stateRaces = allRaces().filter((item) => item.state === state.selected).sort((a, b) => a.office.localeCompare(b.office) || String(a.district || '').localeCompare(String(b.district || ''), undefined, { numeric: true }));
  if (stateRaces.length) {
    const section = el('div', null, 'inspector-state-races'); section.append(el('h3', 'Races in ' + (area?.name || state.selected)));
    stateRaces.forEach((item) => {
      const button = el('button', null, 'state-race-link' + (item.race_id === state.raceId ? ' active' : '')); button.type = 'button';
      button.append(el('span', raceLabel(item)), el('strong', hasVotes(item) ? count(item.reported_total) : 'Awaiting votes'));
      button.addEventListener('click', () => selectRace(item)); section.append(button);
    }); target.append(section);
  }
  $('results-state').value = state.selected;
  $('map-focus-state').hidden = !state.selected || state.focused;
  $('map-reset').hidden = !state.focused;
}

function renderCountyList(target) {
  if (state.countyPending) target.append(el('p', 'Checking county / local results…', 'county-checked'));
  if (state.countyMessage) target.append(el('p', state.countyMessage, 'county-data-warning'));
  const data = state.countyData;
  if (!data) return;
  const coverage = data.coverage;
  if (coverage.stale || coverage.error) target.append(el('p', 'Refresh delayed; saved local results remain visible.', 'county-data-warning'));
  if (coverage.matches_national_snapshot === false) target.append(el('p', 'Local and state feeds are different snapshots; they are not added together.', 'county-data-warning'));
  if (coverage.checked_at) target.append(el('p', 'Local source checked ' + eastern(coverage.checked_at), 'county-checked'));
  if (!data.rows.length) return;
  target.append(el('h4', data.rows.some((row) => !row.county_fips) ? 'County / local results' : 'County results'));
  data.rows.slice().sort((a, b) => (b.reported_total || 0) - (a.reported_total || 0)).forEach((row) => {
    const county = withCountyContext(row, data.race), details = el('details', null, 'county-row'), summary = el('summary');
    summary.append(el('span', county.name || county.reporting_unit_id || county.county_fips), el('strong', count(county.reported_total))); details.append(summary);
    details.append(el('p', county.source_updated_at ? 'Source updated ' + eastern(county.source_updated_at) : 'Source update time unavailable', 'county-checked'));
    if (!county.county_fips) details.append(el('p', (county.geography_type === 'source_election_district' ? 'Source election district' : county.geography_type === 'source_reporting_category' ? 'Source reporting category' : 'Source locality') + ' · no county boundary or presidential match.', 'county-checked'));
    if (county.source_stale) details.append(el('p', 'Saved local snapshot; refresh delayed.', 'county-data-warning'));
    renderCandidates(county, details); renderProgress(county, details); renderComparison(county, details, 'county'); target.append(details);
  });
}

async function attachCountyGeometry(data, selected) {
  if (data.geometry) { const ids = new Set(data.geometry.counties.map((county) => county.id)); data.matchedGeometry = data.rows.filter((row) => /^\d{5}$/.test(String(row.county_fips || '')) && ids.has(row.county_fips)).length; return; }
  try {
    const geography = await loadCountyGeography(selected);
    if (state.countyData !== data || state.selected !== selected) return;
    data.geometry = geography;
    const ids = new Set(geography.counties.map((county) => county.id));
    data.matchedGeometry = data.rows.filter((row) => /^\d{5}$/.test(String(row.county_fips || '')) && ids.has(row.county_fips)).length;
    if (!data.matchedGeometry && state.countyLayer === 'geographic') { state.countyLayer = 'tiles'; state.countyMessage = 'This feed uses local reporting units without matching county outlines. Showing tiles.'; }
    render();
  } catch {
    if (state.countyData === data) { data.geometryError = true; state.countyLayer = 'tiles'; state.countyMessage = 'County outlines could not load. Local results remain available as tiles.'; render(); }
  }
}

async function loadCounties(race, { layer = 'tiles', refresh = false, silent = false } = {}) {
  if (!race || state.countyPending) return;
  const selected = state.selected, request = ++state.countyRequest;
  const isCurrent = () => request === state.countyRequest && state.selected === selected && currentRace()?.race_id === race.race_id;
  state.countyRace = race.race_id; state.countyPending = true; state.countyMessage = ''; state.countyView = true; state.countyLayer = layer;
  if (!silent) render(); else renderCountyTiles();
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
      old.coverage = { ...old.coverage, ...coverage }; state.countyMessage = 'Local refresh delayed; saved rows remain visible.';
    } else {
      const data = { rows, coverage, race, geometry: old?.geometry, matchedGeometry: old?.matchedGeometry };
      state.countyData = data;
      if (!rows.some((row) => countyKey(row) === state.selectedCounty)) state.selectedCounty = '';
      if (!rows.length) state.countyMessage = coverage.error ? 'Local results could not load. Use Refresh to retry.' : 'A local breakdown is not available from CNN for this race.';
      if (rows.length) attachCountyGeometry(data, selected);
    }
    if (!refreshOkay) state.countyMessage = 'The refresh was delayed; the latest available local snapshot is shown.';
  } catch {
    if (isCurrent()) state.countyMessage = state.countyData ? 'Local results could not refresh; saved rows remain visible. Use Refresh to retry.' : 'Local results could not load. Use Counties or Tiles to retry.';
  } finally {
    if (isCurrent()) { state.countyPending = false; render(); }
  }
}

function render() {
  if (!state.map) return;
  const races = allRaces(), officeRaces = races.filter((race) => race.office === state.office), compare = state.displayMode === 'president';
  const area = state.map.states.find((item) => item.state === state.selected);
  document.body.classList.toggle('president-mode', compare);
  $('national-map-title').textContent = state.countyView && state.countyData ? (area?.name || state.selected) + ' local results' : OFFICE[state.office];
  document.querySelectorAll('[data-results-office]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.resultsOffice === state.office)));
  document.querySelectorAll('[data-results-display]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.resultsDisplay === state.displayMode)));
  $('results-baseline-year').disabled = !compare;
  $('results-comparison-status').textContent = !compare ? '' : state.office === 'house' ? 'District comparison unavailable' : state.baselinePending ? 'Loading presidential results…' : state.baselineError || 'Partial counted vote vs historical reported vote';
  $('results-lead-legend').hidden = compare; $('results-shift-legend').hidden = !compare;
  const values = new Map();
  // The main race supplies the statewide map when a state also has a special election.
  officeRaces.slice().sort((a, b) => Number(Boolean(a.special)) - Number(Boolean(b.special))).forEach((race) => { if (state.office !== 'house' && !values.has(race.state)) values.set(race.state, mapValue(race)); });
  state.map.setStates(values); state.map.setSelected(state.selected);
  const units = state.countyView && state.countyData ? state.countyData.rows.map((row) => withCountyContext(row, state.countyData.race)) : officeRaces;
  let dem = 0, rep = 0, comparable = 0;
  units.forEach((race) => {
    if (compare) { const change = comparison(race, state.countyView ? 'county' : 'state'); if (change.status === 'available' && Number.isFinite(change.shift_pp)) { comparable++; if (change.shift_pp > 0.05) dem++; else if (change.shift_pp < -0.05) rep++; } }
    else { const lead = leader(race); if (lead && party(lead.party) === 'dem') dem++; if (lead && party(lead.party) === 'rep') rep++; }
  });
  $('map-dem-leads').textContent = state.data ? String(dem) : '—'; $('map-rep-leads').textContent = state.data ? String(rep) : '—';
  $('map-dem-label').textContent = compare ? 'Shift toward D' : 'Democratic leads'; $('map-rep-label').textContent = compare ? 'Shift toward R' : 'Republican leads';
  $('map-summary-context').textContent = compare ? comparable + ' matched comparisons · ' + state.baselineYear : state.countyView && state.countyData ? state.countyData.rows.length + ' local units · reported leads' : officeRaces.filter(hasVotes).length + ' races with reported votes';
  $('map-view-label').textContent = state.focused ? area?.name || 'Selected state' : 'National overview · select a state';
  $('map-geography-note').textContent = compare ? state.office === 'house' ? 'Presidential comparison unavailable for House district boundaries.' : 'Color shows the change in D−R margin, in percentage points. Current counted votes are partial; the comparison is not a forecast.' : 'Colors show a current reported leader, not a race call. Select a state for candidates and source details.';
  $('results-lead-legend').classList.toggle('house-state-mode', state.office === 'house');
  renderInspector(); renderAvailableRaces(); renderCountyTiles();
}

function chooseCounty(key) { state.selectedCounty = key; renderInspector(); renderCountyTiles(); if (innerWidth <= 800) document.querySelector('.race-inspector').scrollIntoView({ block: 'start', behavior: 'smooth' }); }

function renderCountyTiles() {
  const data = state.countyData, enabled = Boolean(state.countyView && data?.rows.length), geographic = enabled && state.countyLayer === 'geographic' && Boolean(data.geometry) && data.matchedGeometry > 0;
  const compare = state.displayMode === 'president', race = currentRace();
  $('results-map').hidden = enabled; $('house-results-map').hidden = true; $('county-tile-view').hidden = !enabled || geographic; $('county-geographic-view').hidden = !geographic; $('map-geometry-credit').hidden = enabled;
  $('county-layer-controls').hidden = !race;
  $('map-show-states').setAttribute('aria-pressed', String(!state.countyView)); $('map-show-counties').setAttribute('aria-pressed', String(enabled && !geographic)); $('map-show-county-geo').setAttribute('aria-pressed', String(geographic));
  $('map-show-counties').disabled = !race || state.countyPending; $('map-show-county-geo').disabled = !race || state.countyPending || Boolean(data?.geometry && !data.matchedGeometry);
  $('county-load-status').hidden = !(state.countyPending || state.countyMessage);
  $('county-load-status').textContent = state.countyPending ? 'Loading county / local results…' : state.countyMessage;
  $('national-map-panel').setAttribute('aria-busy', String(state.countyPending));
  if (!enabled) {
    const source = state.data?.source;
    if (source) { const checked = eastern(source.checked_at); $('map-data-status').textContent = (source.providers?.join(' · ') || 'Available public feeds') + (checked ? ' · Source checked ' + checked : ' · Source check time unavailable'); }
    const credit = $('map-geometry-credit');
    if (state.office === 'house' && state.houseGeometry) {
      $('results-map').hidden = true; $('house-results-map').hidden = false;
      const races = allRaces().filter((item) => item.office === 'house'), byKey = new Map(races.map((item) => [item.state + '-' + Number(item.district), item])), values = new Map();
      byKey.forEach((item, key) => { const value = mapValue(item); values.set(key, { ...value, description: item.state + ' ' + raceLabel(item) + ' · ' + value.description }); });
      const selected = currentRace();
      const coverage = drawHouseMap($('house-results-map'), { geography: state.houseGeometry, values, selectedKey: selected ? selected.state + '-' + Number(selected.district) : '', focusState: state.focused ? state.selected : null, onSelect: (key, district) => { const item = byKey.get(key); if (item) selectRace(item); else { selectState(district.state); state.pendingHouseKey = key; } } });
      $('map-geography-note').textContent = compare ? 'Presidential comparison unavailable for House district boundaries. Select Results to see reported leaders.' : '435 congressional districts · Select a district for votes. County figures cover only that district’s reported vote.' + (coverage.matched < coverage.polygons ? ' Unavailable results stay gray.' : '');
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
  $('map-data-status').textContent = (data.race.source_name || 'Public source') + ' · Local snapshot' + (checked ? ' checked ' + checked : ' · Check time unavailable') + (data.coverage.stale || data.coverage.error ? ' · Refresh delayed' : '') + (data.coverage.matches_national_snapshot === false ? ' · Different snapshot from state feed' : '');
  const commonNote = compare ? 'Color shows the change in D−R reported margin vs ' + state.baselineYear + ' President. Current vote is partial; gray means no comparable history.' : 'Colors show reported leaders. Local and state snapshots may update at different times.';
  $('map-geography-note').textContent = commonNote + (state.office === 'house' ? ' Local figures cover this House district only.' : '');
  if (geographic) {
    const area = state.map.states.find((item) => item.state === state.selected), values = new Map();
    data.rows.forEach((row) => { if (/^\d{5}$/.test(String(row.county_fips || ''))) values.set(row.county_fips, { name: row.name, ...mapValue(withCountyContext(row, data.race), 'county') }); });
    const coverage = drawCountyMap($('county-geographic-map'), { geography: data.geometry, stateFips: area.id, stateBounds: area.bounds, values, selected: state.selectedCounty, onSelect: chooseCounty });
    $('county-geometry-description').textContent = 'County outlines: ' + (data.geometry.state ? 'AP 2026' : 'Census 2017') + ' · ' + coverage.matched + ' matched units' + (coverage.matched < data.rows.length ? ' · Tiles includes all source units.' : '');
    if (typeof data.geometry.source === 'string') $('county-geometry-description').append(' · ', sourceLink(data.geometry.source, 'Map source'));
    return;
  }
  const mapNote = data.geometry ? data.matchedGeometry ? 'County outlines are available for exact matches.' : 'Source reporting units have no matching county outlines.' : data.geometryError ? 'County outlines unavailable; tiles remain available.' : 'Loading county outlines…';
  $('county-tile-description').textContent += ' ' + mapNote;
  const grid = $('county-tile-grid'); grid.replaceChildren();
  data.rows.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')).forEach((row) => {
    const county = withCountyContext(row, data.race), value = mapValue(county, 'county'), key = countyKey(county), fullName = county.name || county.reporting_unit_id || county.county_fips;
    const button = el('button', null, 'county-tile ' + (value.party || 'no-returns') + (state.selectedCounty === key ? ' selected' : ''));
    if (value.fill) { button.style.background = value.fill; button.style.color = Math.abs(value.shift) > 8 ? '#fff' : '#243e5c'; }
    button.type = 'button'; button.dataset.countyFips = county.county_fips || ''; button.dataset.reportingUnitId = county.reporting_unit_id || '';
    const status = compare ? Number.isFinite(value.shift) ? shiftLabel(value.shift) : 'No comparison' : leader(county) ? (leader(county).party || 'Other') + ' leads' : hasVotes(county) && residual(county) > 0 ? 'Attribution incomplete' : hasVotes(county) ? 'No reported leader' : 'Awaiting votes';
    button.setAttribute('aria-label', fullName + ', ' + count(county.reported_total) + ' reported votes, ' + value.description); button.setAttribute('aria-pressed', String(state.selectedCounty === key)); button.title = fullName + ' · ' + value.description;
    button.append(el('strong', fullName.replace(/ County$/, '')), el('span', status), el('small', count(county.reported_total) + ' votes'));
    button.addEventListener('click', () => chooseCounty(key)); grid.append(button);
  });
}

function renderAvailableRaces() {
  const races = allRaces().filter((race) => race.office === state.office);
  const states = new Set(races.map((race) => race.state));
  $('results-coverage-note').textContent = races.length + ' connected ' + state.office + ' races across ' + states.size + ' states. Missing source coverage stays gray.';
  const target = $('results-available-races'); target.replaceChildren();
  races.forEach((race) => {
    const button = el('button', null, 'available-race' + (race.race_id === state.raceId ? ' active' : '')); button.type = 'button';
    const leading = leader(race), call = calledName(race);
    button.append(el('strong', race.state + ' · ' + raceLabel(race)), el('span', call ? call + ' · Source call' : leading ? leading.name + ' leads' : hasVotes(race) ? residual(race) > 0 ? 'Attribution incomplete' : 'Reported vote tied' : 'Awaiting returns'), el('small', hasVotes(race) ? count(race.reported_total) + ' votes' : 'No reported votes'));
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
    const provider = source.providers?.length ? source.providers.join(' · ') : 'Available public feeds';
    $('map-data-status').textContent = provider + (checked ? ' · Source checked ' + checked : ' · Source check time unavailable');
    const notice = $('results-source-notice');
    notice.hidden = !(source.stale || source.error || !refreshOkay || ['unavailable', 'not_configured'].includes(source.status));
    if (!notice.hidden) notice.textContent = !refreshOkay && !source.stale && !source.error ? 'A refresh could not be requested. Showing the latest available source snapshot.' : 'National source refresh is delayed or unavailable. Available saved results remain visible.' + (checked ? ' Last successful check: ' + checked + '.' : '');
    if (state.countyView) { const race = currentRace(); if (race && !state.countyPending) loadCounties(race, { layer: state.countyLayer, refresh, silent: true }); }
  } catch { $('map-data-status').textContent = state.data ? 'Results connection interrupted. Last saved snapshot remains visible.' : 'Results source unavailable. The map remains selectable; retry Refresh.'; }
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
  document.querySelectorAll('[data-results-office]').forEach((button) => button.addEventListener('click', () => { state.office = button.dataset.resultsOffice; state.raceId = ''; clearCounty(); render(); }));
  document.querySelectorAll('[data-results-display]').forEach((button) => button.addEventListener('click', () => { state.displayMode = button.dataset.resultsDisplay; if (state.displayMode === 'president' && !state.baseline && !state.baselinePending) loadBaseline(); else render(); }));
  $('results-baseline-year').addEventListener('change', (event) => { state.baselineYear = Number(event.target.value); loadBaseline(); });
  $('results-state').addEventListener('change', (event) => selectState(event.target.value));
  $('results-refresh').addEventListener('click', () => fetchResults(true));
  $('results-search').addEventListener('input', (event) => search(event.target.value));
  $('results-search').addEventListener('keydown', (event) => { if (event.key === 'Escape') $('results-search-matches').hidden = true; if (event.key === 'Enter') { event.preventDefault(); $('results-search-matches').querySelector('button')?.click(); } });
  document.addEventListener('click', (event) => { if (!event.target.closest('.results-search-wrap')) $('results-search-matches').hidden = true; });
  $('map-focus-state').addEventListener('click', () => { state.focused = true; state.map?.focusState(state.selected); render(); });
  const showStates = () => { state.countyRequest++; state.countyPending = false; state.countyMessage = ''; state.countyView = false; state.selectedCounty = ''; render(); };
  $('map-reset').addEventListener('click', () => { state.focused = false; state.map?.reset(); showStates(); });
  $('map-show-states').addEventListener('click', showStates);
  const showCounties = (layer) => { const race = currentRace(); if (!race) return; if (state.countyData?.race.race_id === race.race_id && state.countyData.rows.length) { state.countyView = true; state.countyLayer = layer; render(); if (!state.countyData.geometry && (layer === 'geographic' || !state.countyData.geometryError)) attachCountyGeometry(state.countyData, state.selected); } else loadCounties(race, { layer }); };
  $('map-show-counties').addEventListener('click', () => showCounties('tiles'));
  $('map-show-county-geo').addEventListener('click', () => showCounties('geographic'));
  const fullscreen = $('results-fullscreen'); if (!document.fullscreenEnabled) fullscreen.hidden = true;
  fullscreen.addEventListener('click', async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await $('national-map-panel').requestFullscreen(); } catch { $('map-data-status').textContent = 'Fullscreen is unavailable in this browser.'; } });
  document.addEventListener('fullscreenchange', () => { fullscreen.querySelector('span').textContent = document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen'; });
  createElectionMap($('results-map'), selectState).then((map) => { state.map = map; map.states.slice().sort((a, b) => a.name.localeCompare(b.name)).forEach((item) => { const option = el('option', item.name); option.value = item.state; $('results-state').append(option); }); render(); }).catch(() => { $('results-map').replaceChildren(el('p', 'The geographic map could not load. Use the state selector and connected race list.', 'map-loading')); });
  loadHouseGeography().then((geography) => { state.houseGeometry = geography; render(); }).catch(() => {});
  fetchResults(); setInterval(() => { if (document.body.classList.contains('results-mode')) fetchResults(); }, 60000);
  window.addEventListener('online', () => fetchResults()); document.addEventListener('visibilitychange', () => { if (!document.hidden && document.body.classList.contains('results-mode')) fetchResults(); });
}
