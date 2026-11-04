const SVG_NS = 'http://www.w3.org/2000/svg';
let houseGeographyPromise;
const COUNTY_PRESETS = new Set(['KY', 'CA', 'NC']);
const MAX_GEOMETRY_CHARS = 4 * 1024 * 1024;

function assetURL(path) {
  const url = new URL(path, import.meta.url);
  const version = new URL(import.meta.url).searchParams.get('v');
  if (version) url.searchParams.set('v', version);
  return url;
}

function fips(value, digits) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) value = String(value).padStart(digits, '0');
  return typeof value === 'string' && new RegExp('^\\d{' + digits + '}$').test(value) ? value : null;
}
function boundsValid(bounds) {
  return Array.isArray(bounds) && bounds.length === 2 && bounds.every((point) => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite)) && bounds[1][0] >= bounds[0][0] && bounds[1][1] >= bounds[0][1];
}
function viewBoxValid(value) {
  if (typeof value !== 'string') return false;
  const values = value.trim().split(/[\s,]+/).map(Number);
  return values.length === 4 && values.every(Number.isFinite) && values[2] > 0 && values[3] > 0;
}

/** Boundary data may normalize numeric FIPS formatting, never locality IDs. */
export function validateCountyGeography(geography, expectedState = null) {
  if (!geography || !viewBoxValid(geography.viewBox) || !Array.isArray(geography.counties) || !geography.counties.length || geography.counties.length > 4000 || (expectedState && geography.state !== expectedState)) throw new Error('County boundary metadata is invalid.');
  const ids = new Set();
  const counties = geography.counties.map((county) => {
    const id = fips(county.id ?? county.fips, 5), stateFips = fips(county.state_fips ?? id?.slice(0, 2), 2);
    if (!id || !stateFips || !id.startsWith(stateFips) || ids.has(id) || (expectedState && county.state && county.state !== expectedState) || typeof county.name !== 'string' || !county.name.trim() || typeof county.path !== 'string' || !/^[Mm]/.test(county.path) || /NaN|Infinity/.test(county.path) || !boundsValid(county.bounds) || !Array.isArray(county.centroid) || county.centroid.length !== 2 || !county.centroid.every(Number.isFinite)) throw new Error('County boundary paths or exact FIPS identifiers are invalid.');
    ids.add(id);
    return { ...county, id, fips: id, state_fips: stateFips };
  });
  return { ...geography, counties };
}

/** Isolated caches make transient preset/fallback errors retryable. */
export function createCountyGeographyLoader({ fetcher = (...args) => fetch(...args) } = {}) {
  let national;
  const presets = new Map();
  async function read(path, expectedState) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetcher(assetURL(path), { signal: controller.signal, credentials: 'same-origin' });
      if (!response.ok) throw new Error('County boundaries returned HTTP ' + response.status + '.');
      if (Number(response.headers.get('content-length')) > MAX_GEOMETRY_CHARS) throw new Error('County boundaries exceed the supported size.');
      const text = await response.text();
      if (text.length > MAX_GEOMETRY_CHARS) throw new Error('County boundaries exceed the supported size.');
      return validateCountyGeography(JSON.parse(text), expectedState);
    } finally { clearTimeout(timer); }
  }
  function nationwide() {
    if (!national) national = read('./data/us-counties-albers.v3.0.1.paths.json').catch((error) => { national = null; throw error; });
    return national;
  }
  return function load(stateCode) {
    if (!COUNTY_PRESETS.has(stateCode)) return nationwide();
    if (!presets.has(stateCode)) {
      const request = read('./data/ap-county-paths-2026-' + stateCode + '.json', stateCode)
        .catch(() => nationwide())
        .catch((error) => { presets.delete(stateCode); throw error; });
      presets.set(stateCode, request);
    }
    return presets.get(stateCode);
  };
}
const countyLoader = createCountyGeographyLoader();

function svg(tag, attributes = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
  return node;
}

export function loadCountyGeography(stateCode) {
  return countyLoader(stateCode);
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

/** Fit the actual county paths, not a separate state's possibly different projection. */
export function countyMapLayout(geography, stateFips, values = new Map()) {
  const state = fips(stateFips, 2);
  const features = (geography?.counties || []).filter((county) => {
    const id = fips(county.id ?? county.fips, 5);
    return id && state && fips(county.state_fips ?? id.slice(0, 2), 2) === state;
  }).map((county) => ({ ...county, id: fips(county.id ?? county.fips, 5) }));
  const shapeIds = new Set(features.map((county) => county.id));
  const matched = [...values.keys()].filter((id) => shapeIds.has(id));
  const coverage = { ready: false, matched: matched.length, sourceUnits: values.size, polygons: features.length,
    unmatchedSourceFips: [...values.keys()].filter((id) => !shapeIds.has(id)), unmatchedGeometry: features.length - matched.length };
  if (!features.length) return { ...coverage, features, bounds: null, viewBox: null };
  if (features.some((county) => !boundsValid(county.bounds))) throw new Error('County boundary bounds are unavailable.');
  const x0 = Math.min(...features.map((county) => county.bounds[0][0])), y0 = Math.min(...features.map((county) => county.bounds[0][1]));
  const x1 = Math.max(...features.map((county) => county.bounds[1][0])), y1 = Math.max(...features.map((county) => county.bounds[1][1]));
  const padding = Math.max(x1 - x0, y1 - y0) * 0.07 || 1;
  return { ...coverage, ready: matched.length > 0 && (x1 > x0 || y1 > y0), features,
    bounds: [[x0, y0], [x1, y1]], viewBox: `${x0 - padding} ${y0 - padding} ${x1 - x0 + 2 * padding} ${y1 - y0 + 2 * padding}` };
}

export function drawCountyMap(container, { geography, stateFips, values, selected, onSelect }) {
  const layout = countyMapLayout(geography, stateFips, values);
  const { features, viewBox } = layout;
  if (!features.length) {
    const message = document.createElement('p'); message.textContent = 'County outlines are unavailable for this geography. Use local result tiles.';
    container.replaceChildren(message); return layout;
  }
  const [[x0], [x1]] = layout.bounds;
  const root = svg('svg', { viewBox, class: 'county-map-svg', role: 'group', 'aria-label': 'County election results on published reference boundaries. Select a county for details.' });
  const title = svg('title'); title.textContent = 'County reference geography, joined to current results by exact FIPS'; root.append(title);
  const paths = [];
  for (const county of features) {
    const value = values.get(county.id);
    const name = value?.name || county.name || county.id;
    const description = value?.description || 'No exact FIPS result available';
    const path = svg('path', { d: county.path, 'fill-rule': 'evenodd', 'data-county-fips': county.id, class: 'map-county ' + (value?.party || 'no-returns') + (selected === county.id ? ' selected' : ''), role: 'button', tabindex: '0', 'aria-pressed': String(selected === county.id), 'aria-label': name + ': ' + description });
    if (value?.fill) path.style.fill = value.fill;
    const hint = svg('title'); hint.textContent = name + '\n' + description; path.append(hint);
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
  return { ready: layout.ready, matched: layout.matched, sourceUnits: layout.sourceUnits,
    polygons: layout.polygons, unmatchedSourceFips: layout.unmatchedSourceFips, unmatchedGeometry: layout.unmatchedGeometry,
    viewBox: layout.viewBox, bounds: layout.bounds };
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
