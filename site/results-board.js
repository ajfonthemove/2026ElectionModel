import { resultsFetch } from './results-client.js';
import { createElectionMap, loadCountyGeography, drawCountyMap, loadHouseGeography, drawHouseMap } from './election-map.js';

const $ = (id) => document.getElementById(id);
const OFFICE = { senate: 'U.S. Senate', house: 'U.S. House', governor: 'Governor' };
const state = { office: 'senate', selected: '', raceId: '', data: null, map: null, houseGeometry: null, pendingHouseKey: '', initialized: false, pending: false, countyRace: '', countyData: null, countyView: false, countyLayer: 'tiles', selectedCounty: '', focused: false };
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
function leader(race) { const rows = candidates(race); return hasVotes(race) && rows[0] && rows[0].votes > 0 && rows[0].votes - (rows[1]?.votes || 0) > residual(race) ? rows[0] : null; }
function calledName(race) { const call = race.source_called_winner; if (!call) return null; if (typeof call === 'string') return candidates(race).find((item) => item.candidate_id === call || item.name === call)?.name || call; return call.name || call.candidate_name || candidates(race).find((item) => item.candidate_id === call.candidate_id)?.name || null; }
function currentRace() { const races = allRaces().filter((race) => race.state === state.selected && race.office === state.office); return races.find((race) => race.race_id === state.raceId) || races[0] || null; }
function sourceLink(url, text) { const link = el('a', text); if (url && /^https?:\/\//.test(url)) { link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; } return link; }

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
  state.selected = code; state.raceId = raceId; state.pendingHouseKey = ''; state.countyRace = ''; state.countyData = null; state.countyView = false; state.selectedCounty = '';
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
  const selectedCounty = state.countyView ? state.countyData?.rows.find((item) => (item.county_fips || item.name) === state.selectedCounty) : null;
  const race = sourceRace && selectedCounty ? { ...sourceRace, ...selectedCounty, label: selectedCounty.name, source_called_winner: null } : sourceRace;
  const preservedCounties = state.countyRace === race?.race_id ? $('county-results') : null;
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
    else if (hasVotes(race) && residual(race) > 0) target.append(el('p', 'Vote attribution is incomplete. No reported leader is shown because unassigned votes could change the lead.', 'inspector-lead'));
    renderCandidates(race, target);
    const total = el('div', null, 'inspector-total'); total.append(el('span', 'Total reported votes'), el('strong', count(race.reported_total))); target.append(total);
    const source = el('div', null, 'inspector-source'); source.append(sourceLink(race.source_url, race.source_name || state.data?.source?.name || 'Public results source'));
    const timestamp = eastern(race.source_updated_at); source.append(el('span', timestamp ? 'Source updated ' + timestamp : 'Source update time unavailable'));
    if (timestamp) source.append(el('span', age(race.source_updated_at), 'source-age'));
    if (state.data?.source?.stale && race.source_name === 'CNN') source.append(el('span', 'Saved verified snapshot; the source refresh is delayed.', 'inspector-saved-note'));
    target.append(source);
    const county = el('button', 'County breakdown', 'county-toggle'); county.type = 'button'; county.addEventListener('click', () => loadCounties(sourceRace)); target.append(county);
    const countyContent = preservedCounties || el('div', null, 'county-results'); countyContent.id = 'county-results'; target.append(countyContent);
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

async function loadCounties(race) {
  const target = $('county-results'); if (!target) return;
  state.countyRace = race.race_id;
  target.querySelector('.county-checking')?.remove();
  const checking = el('p', 'Checking county results…', 'inspector-empty county-checking'); target.prepend(checking);
  try {
    const refreshOkay = await requestRefresh({ county_race_id: race.race_id });
    const response = await resultsFetch('/api/results-map?race_id=' + encodeURIComponent(race.race_id) + '&detail=county', { cache: 'no-store' });
    if (!response.ok) throw new Error();
    const data = await response.json(); if (state.countyRace !== race.race_id || !$('county-results')) return;
    const rows = data.counties || [];
    const coverage = data.county_coverage || {};
    target.replaceChildren();
    if (coverage.stale || coverage.error || !refreshOkay) target.append(el('p', 'County refresh delayed; saved county results are retained. ' + (coverage.error || ''), 'county-data-warning'));
    if (coverage.matches_national_snapshot === false) target.append(el('p', 'County and state feeds are different snapshots. County totals are not added to the state result.', 'county-data-warning'));
    const countyChecked = eastern(coverage.checked_at);
    if (countyChecked) target.append(el('p', 'County source checked ' + countyChecked, 'county-checked'));
    const range = coverage.source_update_range;
    if (range?.newest) target.append(el('p', 'County source updates through ' + eastern(range.newest), 'county-checked'));
    if (!rows.length) { target.append(el('p', 'A county breakdown is not available from the connected source for this race.', 'inspector-empty')); return; }
    target.append(el('h4', 'County results'));
    rows.slice().sort((a, b) => (b.reported_total || 0) - (a.reported_total || 0)).forEach((county) => {
      const details = el('details', null, 'county-row'); const summary = el('summary');
      summary.append(el('span', county.name || county.county_fips), el('strong', count(county.reported_total))); details.append(summary);
      const countyTime = eastern(county.source_updated_at);
      details.append(el('p', countyTime ? 'Source updated ' + countyTime : 'Source update time unavailable', 'county-checked'));
      if (county.source_stale) details.append(el('p', 'Saved county snapshot; refresh delayed.', 'county-data-warning'));
      renderCandidates(county, details); target.append(details);
    });
    const sameRace = state.countyData?.race.race_id === race.race_id;
    const countyData = { rows, coverage, race };
    state.countyData = countyData; state.countyView = true; if (!sameRace) state.countyLayer = 'tiles'; render();
    loadCountyGeography(state.selected).then((geography) => {
      if (state.countyData !== countyData) return;
      countyData.geometry = geography;
      const ids = new Set(geography.counties.map((county) => county.id));
      countyData.matchedGeometry = rows.filter((row) => /^\d{5}$/.test(String(row.county_fips || '')) && ids.has(row.county_fips)).length;
      if (!sameRace && countyData.matchedGeometry === rows.length) state.countyLayer = 'geographic';
      render();
    }).catch(() => { if (state.countyData === countyData) { countyData.geometryError = true; render(); } });
  } catch { if (state.countyRace === race.race_id) { checking.remove(); target.prepend(el('p', 'County results could not refresh. Any saved county rows remain visible.', 'county-data-warning')); } }
}

function render() {
  if (!state.map) return;
  const races = allRaces(); const officeRaces = races.filter((race) => race.office === state.office);
  $('national-map-title').textContent = state.countyView ? (state.map.states.find((item) => item.state === state.selected)?.name || state.selected) + ' counties' : OFFICE[state.office];
  document.querySelectorAll('[data-results-office]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.resultsOffice === state.office)));
  const values = new Map(); let dem = 0, rep = 0;
  officeRaces.forEach((race) => {
    const lead = leader(race); if (lead && party(lead.party) === 'dem') dem++; if (lead && party(lead.party) === 'rep') rep++;
    if (state.office === 'house') return;
    if (lead) values.set(race.state, { party: party(lead.party), called: Boolean(calledName(race)), description: lead.name + ' leads · ' + count(race.reported_total) + ' reported votes' });
    else if (!values.has(race.state)) values.set(race.state, { description: hasVotes(race) ? residual(race) > 0 ? 'Vote attribution incomplete; no reported leader shown' : 'Reported vote is tied' : 'Awaiting reported votes' });
  });
  state.map.setStates(values); state.map.setSelected(state.selected);
  if (state.countyView) { dem = 0; rep = 0; (state.countyData?.rows || []).forEach((county) => { const lead = leader(county); if (lead && party(lead.party) === 'dem') dem++; if (lead && party(lead.party) === 'rep') rep++; }); }
  $('map-dem-leads').textContent = state.data ? String(dem) : '—'; $('map-rep-leads').textContent = state.data ? String(rep) : '—';
  const returns = officeRaces.filter(hasVotes).length;
  $('map-summary-context').textContent = state.countyView ? (state.countyData?.rows.length || 0) + ' county units · reported leads' : returns ? returns + ' races with reported votes' : 'Awaiting reported votes';
  $('map-view-label').textContent = state.focused ? state.map.states.find((item) => item.state === state.selected)?.name || 'Selected state' : 'National overview · select a state';
  $('map-geography-note').textContent = state.office === 'house' ? 'House view: select a state for its district race list. Verified 2026 district boundaries are not connected; state shapes do not show a statewide House margin.' : 'Colors show a current reported leader, not a race call. Select a state for candidates and source details.';
  document.querySelector('.map-legend').classList.toggle('house-state-mode', state.office === 'house');
  renderInspector(); renderAvailableRaces(); renderCountyTiles();
}

function renderCountyTiles() {
  const enabled = Boolean(state.countyView && state.countyData);
  const geographic = enabled && state.countyLayer === 'geographic' && Boolean(state.countyData?.geometry);
  $('results-map').hidden = enabled; $('house-results-map').hidden = true; $('county-tile-view').hidden = !enabled || geographic; $('county-geographic-view').hidden = !geographic; $('map-geometry-credit').hidden = enabled;
  $('county-layer-controls').hidden = !state.countyData;
  $('map-show-states').setAttribute('aria-pressed', String(!enabled)); $('map-show-counties').setAttribute('aria-pressed', String(enabled && !geographic));
  $('map-show-county-geo').setAttribute('aria-pressed', String(geographic)); $('map-show-county-geo').disabled = !state.countyData?.geometry;
  if (!enabled) {
    const source = state.data?.source;
    if (source) { const checked = eastern(source.checked_at); $('map-data-status').textContent = (source.providers?.join(' · ') || 'Available public feeds') + (checked ? ' · Source checked ' + checked : ' · Source check time unavailable'); }
    const credit = $('map-geometry-credit');
    if (state.office === 'house' && state.houseGeometry) {
      $('results-map').hidden = true; $('house-results-map').hidden = false;
      const races = allRaces().filter((race) => race.office === 'house');
      const byKey = new Map(races.map((race) => [race.state + '-' + Number(race.district), race]));
      const values = new Map();
      byKey.forEach((race, key) => { const lead = leader(race); values.set(key, { party: lead ? party(lead.party) : null, description: race.state + ' ' + raceLabel(race) + ' · ' + count(race.reported_total) + ' reported votes · ' + (lead ? lead.name + ' leads' : residual(race) > 0 ? 'Attribution incomplete' : 'No reported leader') }); });
      const selected = currentRace();
      const coverage = drawHouseMap($('house-results-map'), { geography: state.houseGeometry, values, selectedKey: selected ? selected.state + '-' + Number(selected.district) : '', focusState: state.focused ? state.selected : null, onSelect: (key, district) => { const race = byKey.get(key); if (race) selectRace(race); else { selectState(district.state); state.pendingHouseKey = key; } } });
      $('map-geography-note').textContent = '435 congressional districts · Select a district for reported votes, or choose a state and use Focus state. Colors show current leaders, not race calls.' + (coverage.matched < coverage.polygons ? ' Some district results are unavailable and stay gray.' : '');
      document.querySelector('.map-legend').classList.remove('house-state-mode');
      credit.replaceChildren('House outlines: ', sourceLink(state.houseGeometry.source, 'AP 2026'));
    } else credit.replaceChildren('Geography: ', sourceLink('https://github.com/topojson/us-atlas', 'U.S. Census / US Atlas'), ' · AK/HI shown as insets');
    return;
  }
  $('map-focus-state').hidden = true; $('map-reset').hidden = false;
  $('map-view-label').textContent = (state.map.states.find((item) => item.state === state.selected)?.name || state.selected) + ' · ' + raceLabel(state.countyData.race);
  $('map-geography-note').textContent = 'Equal-size tiles are alphabetical, not geographic shapes or positions. County and state feeds are independently timed; county totals are never added to the state total.' + (state.office === 'house' ? ' County figures cover votes in this House district, not every voter in the county.' : '');
  document.querySelector('.map-legend').classList.remove('house-state-mode');
  const data = state.countyData;
  const checked = eastern(data.coverage.checked_at);
  const warning = data.coverage.stale || data.coverage.error;
  $('county-tile-description').textContent = data.rows.length + ' counties · Scroll to explore · Select a tile for candidate details' + (warning ? ' · Saved county snapshot; refresh delayed' : '') + (checked ? ' · Source checked ' + checked : '');
  $('map-data-status').textContent = (data.race.source_name || 'Public source') + ' · County snapshot' + (checked ? ' checked ' + checked : ' · Check time unavailable') + (data.coverage.matches_national_snapshot === false ? ' · Different snapshot from state feed' : '');
  if (geographic) {
    const area = state.map.states.find((item) => item.state === state.selected);
    const values = new Map();
    data.rows.forEach((county) => {
      if (!/^\d{5}$/.test(String(county.county_fips || ''))) return;
      const lead = leader(county);
      values.set(county.county_fips, { name: county.name, party: lead ? party(lead.party) : null, description: county.name + ' · ' + count(county.reported_total) + ' reported votes · ' + (lead ? lead.name + ' leads' : 'No reported leader') });
    });
    const coverage = drawCountyMap($('county-geographic-map'), { geography: data.geometry, stateFips: area.id, stateBounds: area.bounds, values, selected: state.selectedCounty, onSelect: (id) => { state.selectedCounty = id; renderInspector(); renderCountyTiles(); if (innerWidth <= 800) document.querySelector('.race-inspector').scrollIntoView({ block: 'start', behavior: 'smooth' }); } });
    $('county-geometry-description').textContent = 'County outlines: ' + (data.geometry.state ? 'AP 2026' : 'Census 2017') + ' · ' + coverage.polygons + ' counties' + (coverage.matched < data.rows.length ? ' · Some county outlines are unavailable; Tiles includes all reported counties.' : '');
    if (typeof data.geometry.source === 'string') $('county-geometry-description').append(' · ', sourceLink(data.geometry.source, 'Map source'));
    $('map-geography-note').textContent = 'Select a county for reported votes. Gray means no reported votes or no matching feed. County and state snapshots may update at different times.' + (state.office === 'house' ? ' County figures cover votes in this House district, not every voter in the county.' : '');
    return;
  }
  const mapNote = data.geometry ? data.matchedGeometry === data.rows.length ? 'County outlines are also available.' : 'Some county outlines are unavailable; Tiles includes all reported counties.' : data.geometryError ? 'Preset county outlines could not load; tiles remain available.' : 'Loading preset county outlines…';
  $('county-tile-description').textContent += ' · ' + mapNote;
  const grid = $('county-tile-grid'); grid.replaceChildren();
  data.rows.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')).forEach((county) => {
    const lead = leader(county); const key = county.county_fips || county.name;
    const button = el('button', null, 'county-tile ' + (lead ? party(lead.party) : 'no-returns') + (state.selectedCounty === key ? ' selected' : ''));
    button.type = 'button'; button.dataset.countyFips = county.county_fips || '';
    const fullName = county.name || county.county_fips;
    const status = lead ? (lead.party || 'Other') + ' leads' : hasVotes(county) && residual(county) > 0 ? 'Attribution incomplete' : 'Awaiting votes';
    button.setAttribute('aria-label', fullName + ', ' + count(county.reported_total) + ' reported votes, ' + status);
    button.setAttribute('aria-pressed', String(state.selectedCounty === key)); button.title = fullName + ' · ' + status + ' · ' + count(county.reported_total) + ' votes';
    button.append(el('strong', fullName.replace(/ County$/, '')), el('span', status), el('small', count(county.reported_total) + ' votes'));
    button.addEventListener('click', () => { state.selectedCounty = key; renderInspector(); renderCountyTiles(); if (innerWidth <= 800) document.querySelector('.race-inspector').scrollIntoView({ block: 'start', behavior: 'smooth' }); });
    grid.append(button);
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
    if (state.countyView) renderCountyTiles();
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
  document.querySelectorAll('[data-results-office]').forEach((button) => button.addEventListener('click', () => { state.office = button.dataset.resultsOffice; state.raceId = ''; state.countyRace = ''; state.countyData = null; state.countyView = false; state.selectedCounty = ''; render(); }));
  $('results-state').addEventListener('change', (event) => selectState(event.target.value));
  $('results-refresh').addEventListener('click', () => fetchResults(true));
  $('results-search').addEventListener('input', (event) => search(event.target.value));
  $('results-search').addEventListener('keydown', (event) => { if (event.key === 'Escape') $('results-search-matches').hidden = true; if (event.key === 'Enter') { event.preventDefault(); $('results-search-matches').querySelector('button')?.click(); } });
  document.addEventListener('click', (event) => { if (!event.target.closest('.results-search-wrap')) $('results-search-matches').hidden = true; });
  $('map-focus-state').addEventListener('click', () => { state.focused = true; state.map?.focusState(state.selected); render(); });
  $('map-reset').addEventListener('click', () => { state.focused = false; state.countyView = false; state.selectedCounty = ''; state.map?.reset(); render(); });
  $('map-show-states').addEventListener('click', () => { state.countyView = false; state.selectedCounty = ''; render(); });
  $('map-show-counties').addEventListener('click', () => { if (state.countyData) { state.countyView = true; state.countyLayer = 'tiles'; render(); } });
  $('map-show-county-geo').addEventListener('click', () => { if (state.countyData?.geometry) { state.countyView = true; state.countyLayer = 'geographic'; render(); } });
  const fullscreen = $('results-fullscreen'); if (!document.fullscreenEnabled) fullscreen.hidden = true;
  fullscreen.addEventListener('click', async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await $('national-map-panel').requestFullscreen(); } catch { $('map-data-status').textContent = 'Fullscreen is unavailable in this browser.'; } });
  document.addEventListener('fullscreenchange', () => { fullscreen.querySelector('span').textContent = document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen'; });
  createElectionMap($('results-map'), selectState).then((map) => { state.map = map; map.states.slice().sort((a, b) => a.name.localeCompare(b.name)).forEach((item) => { const option = el('option', item.name); option.value = item.state; $('results-state').append(option); }); render(); }).catch(() => { $('results-map').replaceChildren(el('p', 'The geographic map could not load. Use the state selector and connected race list.', 'map-loading')); });
  loadHouseGeography().then((geography) => { state.houseGeometry = geography; render(); }).catch(() => {});
  fetchResults(); setInterval(() => { if (document.body.classList.contains('results-mode')) fetchResults(); }, 60000);
  window.addEventListener('online', () => fetchResults()); document.addEventListener('visibilitychange', () => { if (!document.hidden && document.body.classList.contains('results-mode')) fetchResults(); });
}
