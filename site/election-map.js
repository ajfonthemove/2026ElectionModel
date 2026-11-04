const SVG_NS = 'http://www.w3.org/2000/svg';
let countyGeographyPromise;
const stateCountyGeography = new Map();
let houseGeographyPromise;

function svg(tag, attributes = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
  return node;
}

export function loadCountyGeography(stateCode) {
  if (['KY', 'CA', 'NC'].includes(stateCode)) {
    if (!stateCountyGeography.has(stateCode)) stateCountyGeography.set(stateCode, fetch(new URL('./data/ap-county-paths-2026-' + stateCode + '.json', import.meta.url)).then((response) => { if (!response.ok) throw new Error(); return response.json(); }).catch(() => loadCountyGeography()));
    return stateCountyGeography.get(stateCode);
  }
  if (!countyGeographyPromise) countyGeographyPromise = fetch(new URL('./data/us-counties-albers.v3.0.1.paths.json', import.meta.url)).then((response) => {
    if (!response.ok) throw new Error('County geometry is unavailable.');
    return response.json();
  }).catch((error) => { countyGeographyPromise = null; throw error; });
  return countyGeographyPromise;
}

export function loadHouseGeography() {
  if (!houseGeographyPromise) houseGeographyPromise = fetch(new URL('./data/ap-house-paths-2026.json', import.meta.url)).then((response) => {
    if (!response.ok) throw new Error('House geometry is unavailable.');
    return response.json();
  }).catch((error) => { houseGeographyPromise = null; throw error; });
  return houseGeographyPromise;
}

export function drawHouseMap(container, { geography, values, selectedKey, focusState, onSelect }) {
  let viewBox = geography.viewBox;
  if (focusState) {
    const areas = geography.districts.filter((item) => item.state === focusState);
    if (areas.length) {
      const x0 = Math.min(...areas.map((item) => item.bounds[0][0])), y0 = Math.min(...areas.map((item) => item.bounds[0][1]));
      const x1 = Math.max(...areas.map((item) => item.bounds[1][0])), y1 = Math.max(...areas.map((item) => item.bounds[1][1]));
      const padding = Math.max(x1 - x0, y1 - y0) * 0.08;
      viewBox = `${x0 - padding} ${y0 - padding} ${x1 - x0 + padding * 2} ${y1 - y0 + padding * 2}`;
    }
  }
  const root = svg('svg', { viewBox, class: 'house-map-svg', role: 'group', 'aria-label': '435 U.S. House district outlines from the AP published 2026 map. Select a district for reported results.' });
  const paths = [];
  for (const district of geography.districts) {
    const value = values.get(district.key);
    const path = svg('path', { d: district.path, 'fill-rule': 'evenodd', 'data-district-key': district.key, class: 'map-district ' + (value?.party || 'no-returns') + (selectedKey === district.key ? ' selected' : ''), role: 'button', tabindex: '0', 'aria-label': value?.description || district.name + ': no connected results', 'aria-pressed': String(selectedKey === district.key) });
    if (value?.fill) path.style.fill = value.fill;
    const hint = svg('title'); hint.textContent = value?.description || district.name + '\nNo connected results'; path.append(hint);
    path.addEventListener('click', () => onSelect(district.key, district));
    path.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(district.key, district); }
      if (['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); const next = paths.indexOf(path) + (event.key === 'ArrowRight' ? 1 : -1); paths[(next + paths.length) % paths.length].focus(); }
    });
    paths.push(path); root.append(path);
  }
  const selected = paths.find((item) => item.dataset.districtKey === selectedKey); if (selected) root.append(selected);
  container.replaceChildren(root);
  return { polygons: geography.districts.length, matched: geography.districts.filter((item) => values.has(item.key)).length };
}

export function drawCountyMap(container, { geography, stateFips, stateBounds, values, selected, onSelect }) {
  const features = geography.counties.filter((county) => county.state_fips === stateFips || county.id.slice(0, 2) === stateFips);
  const shapeIds = new Set(features.map((county) => county.id));
  const matched = [...values.keys()].filter((id) => shapeIds.has(id));
  const [[x0, y0], [x1, y1]] = stateBounds;
  const padding = Math.max(x1 - x0, y1 - y0) * 0.07;
  const viewBox = geography.state ? geography.viewBox : `${x0 - padding} ${y0 - padding} ${x1 - x0 + 2 * padding} ${y1 - y0 + 2 * padding}`;
  const root = svg('svg', { viewBox, class: 'county-map-svg', role: 'group', 'aria-label': 'County election results on published reference boundaries. Select a county for details.' });
  const title = svg('title'); title.textContent = 'County reference geography, joined to current results by exact FIPS'; root.append(title);
  const paths = [];
  for (const county of features) {
    const value = values.get(county.id);
    const path = svg('path', { d: county.path, 'fill-rule': 'evenodd', 'data-county-fips': county.id, class: 'map-county ' + (value?.party || 'no-returns') + (selected === county.id ? ' selected' : ''), role: 'button', tabindex: '0', 'aria-pressed': String(selected === county.id), 'aria-label': value?.description || county.name + ': no exact FIPS result available' });
    if (value?.fill) path.style.fill = value.fill;
    const hint = svg('title'); hint.textContent = value?.description || county.name + '\nNo exact FIPS result available'; path.append(hint);
    path.addEventListener('click', () => { if (value) onSelect(county.id); });
    path.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (value) onSelect(county.id); }
      if (['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); const next = paths.indexOf(path) + (event.key === 'ArrowRight' ? 1 : -1); paths[(next + paths.length) % paths.length].focus(); }
    });
    paths.push(path); root.append(path);
  }
  const selection = features.find((county) => county.id === selected);
  if (selection) {
    const path = paths.find((item) => item.dataset.countyFips === selected); if (path) root.append(path);
    const text = svg('text', { x: selection.centroid[0], y: selection.centroid[1], 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'county-selected-label', 'font-size': geography.state ? 9 : Math.max(1.2, (x1 - x0) / 70) });
    text.textContent = values.get(selected)?.name?.replace(/ County$/, '') || selection.name; root.append(text);
  }
  container.replaceChildren(root);
  return { matched: matched.length, sourceUnits: values.size, polygons: features.length, unmatchedSourceFips: [...values.keys()].filter((id) => !shapeIds.has(id)), unmatchedGeometry: features.length - matched.length };
}

export async function createElectionMap(container, onSelect) {
  const response = await fetch(new URL('./data/us-states-albers.v3.0.1.paths.json', import.meta.url));
  if (!response.ok) throw new Error('The geographic map could not load.');
  const geography = await response.json();
  const root = svg('svg', { viewBox: geography.viewBox, role: 'group', 'aria-label': 'United States election results. Select a state for race details.', class: 'election-map-svg' });
  const title = svg('title'); title.textContent = 'United States, with Alaska and Hawaii insets'; root.append(title);
  const paths = new Map();
  const labels = svg('g', { class: 'map-state-labels', 'aria-hidden': 'true' });
  const smallStates = new Set(['DE', 'RI', 'DC', 'CT', 'MA', 'NJ', 'MD']);
  for (const state of geography.states) {
    const path = svg('path', { d: state.path, 'data-state': state.state, 'fill-rule': 'evenodd', class: 'map-state no-returns', role: 'button', tabindex: '0', 'aria-label': state.name + ': no reported votes', 'aria-pressed': 'false' });
    const hint = svg('title'); hint.textContent = state.name; path.append(hint);
    path.addEventListener('click', () => onSelect(state.state));
    path.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(state.state); }
      if (['ArrowLeft', 'ArrowRight'].includes(event.key)) {
        event.preventDefault();
        const ordered = [...paths.values()]; const next = ordered.indexOf(path) + (event.key === 'ArrowRight' ? 1 : -1);
        ordered[(next + ordered.length) % ordered.length].focus();
      }
    });
    paths.set(state.state, path); root.append(path);
    if (!smallStates.has(state.state)) {
      const label = svg('text', { x: state.centroid[0], y: state.centroid[1], 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'map-state-label', 'data-label-state': state.state });
      label.textContent = state.state; labels.append(label);
    }
  }
  // Tiny northeastern states remain actual geographic paths; labels use callouts.
  const callouts = ['MA', 'RI', 'CT', 'NJ', 'DE', 'MD', 'DC'];
  callouts.forEach((code, index) => {
    const state = geography.states.find((item) => item.state === code);
    if (!state) return;
    const x = 942, y = 160 + index * 24;
    labels.append(svg('path', { d: `M${state.centroid[0]},${state.centroid[1]}L${x - 15},${y}`, class: 'map-callout-line' }));
    const label = svg('text', { x, y, 'dominant-baseline': 'central', class: 'map-callout-label' }); label.textContent = code;
    label.addEventListener('click', () => onSelect(code)); labels.append(label);
  });
  root.append(labels); container.replaceChildren(root);
  return {
    states: geography.states,
    setStates(values) {
      for (const state of geography.states) {
        const value = values.get(state.state) || {};
        const path = paths.get(state.state);
        path.classList.remove('dem', 'rep', 'other', 'no-returns', 'source-called');
        path.classList.add(value.party || 'no-returns');
        path.style.fill = value.fill || '';
        if (value.called) path.classList.add('source-called');
        path.setAttribute('aria-label', state.name + ': ' + (value.description || 'no reported votes / no connected feed'));
        path.querySelector('title').textContent = state.name + '\n' + (value.description || 'No reported votes / no connected feed');
      }
    },
    setSelected(code) {
      for (const [state, path] of paths) {
        path.classList.toggle('selected', state === code); path.setAttribute('aria-pressed', String(state === code));
      }
      const selected = paths.get(code);
      if (selected) root.insertBefore(selected, labels);
    },
    focusState(code) {
      const state = geography.states.find((item) => item.state === code);
      if (!state) return;
      const [[x0, y0], [x1, y1]] = state.bounds;
      const width = x1 - x0, height = y1 - y0, pad = Math.max(width, height) * 0.2;
      root.setAttribute('viewBox', `${x0 - pad} ${y0 - pad} ${width + 2 * pad} ${height + 2 * pad}`);
      root.classList.add('state-focused');
    },
    reset() { root.setAttribute('viewBox', geography.viewBox); root.classList.remove('state-focused'); },
  };
}
