/** Massachusetts reference boundaries: real municipalities and exact county FIPS. */
import { validateCountyGeography, countyMapLayout } from './election-map.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MAX_BYTES = 4 * 1024 * 1024;
const COUNTY_IDS = new Set(Array.from({ length: 14 }, (_, index) => '25' + String(index * 2 + 1).padStart(3, '0')));
const PARTY_FILL = { dem: '#77a8df', rep: '#dc8792', other: '#b3a1c5', yes: '#6da998', no: '#d6a26e' };

function assetURL(path) {
  const url = new URL(path, import.meta.url), version = new URL(import.meta.url).searchParams.get('v');
  if (version) url.searchParams.set('v', version);
  return url;
}
const point = value => Array.isArray(value) && value.length === 2 && value.every(Number.isFinite);
function viewport(value) {
  const box = typeof value === 'string' ? value.trim().split(/[\s,]+/).map(Number) : [];
  if (box.length !== 4 || !box.every(Number.isFinite) || box[2] <= 0 || box[3] <= 0) throw new Error('Massachusetts map viewport is invalid.');
  return box;
}

/** Reject partial, duplicate or mismatched administrative boundary inventories. */
export function validateMassachusettsGeography(raw, level = raw?.level) {
  if (!['town', 'county'].includes(level) || raw?.state !== 'MA' || raw.level !== level || !Array.isArray(raw.features) || raw.features.length !== (level === 'town' ? 351 : 14) || !raw.source || typeof raw.source.name !== 'string' || !/^https?:\/\//.test(raw.source.url || '')) throw new Error('Massachusetts boundary metadata is invalid.');
  const [x, y, width, height] = viewport(raw.viewBox), ids = new Set();
  const features = raw.features.map(feature => {
    const id = feature?.id, townId = Number(id);
    const identityOkay = level === 'town' ? typeof id === 'string' && Number.isInteger(townId) && townId >= 1 && townId <= 351 && String(townId) === id && feature.massgis_town_id === townId && feature.town_key === id && COUNTY_IDS.has(feature.county_fips) : COUNTY_IDS.has(id) && feature.county_fips === id;
    const bounds = feature?.bounds;
    if (!identityOkay || ids.has(id) || feature.geography_key !== level + ':' + id || typeof feature.name !== 'string' || !feature.name.trim() || typeof feature.path !== 'string' || !/^[Mm]/.test(feature.path) || /NaN|Infinity/.test(feature.path) || !Array.isArray(bounds) || bounds.length !== 2 || !bounds.every(point) || bounds[1][0] <= bounds[0][0] || bounds[1][1] <= bounds[0][1] || bounds[0][0] < x - 0.01 || bounds[0][1] < y - 0.01 || bounds[1][0] > x + width + 0.01 || bounds[1][1] > y + height + 0.01 || !point(feature.centroid) || feature.centroid[0] < bounds[0][0] - 0.01 || feature.centroid[0] > bounds[1][0] + 0.01 || feature.centroid[1] < bounds[0][1] - 0.01 || feature.centroid[1] > bounds[1][1] + 0.01) throw new Error('Massachusetts boundary paths or exact identifiers are invalid.');
    ids.add(id);
    return Object.freeze({ ...feature });
  });
  return Object.freeze({ ...raw, level, features: Object.freeze(features), source: Object.freeze({ ...raw.source }) });
}

function massachusettsCounties(raw) {
  const national = validateCountyGeography(raw), counties = national.counties.filter(feature => feature.state_fips === '25');
  const values = new Map(counties.map(feature => [feature.id, {}]));
  const layout = countyMapLayout(national, '25', values);
  if (!layout.ready || layout.matched !== 14) throw new Error('Massachusetts county boundaries are incomplete.');
  return validateMassachusettsGeography({ schema_version: 'ma_results_geometry_v1', state: 'MA', level: 'county', viewBox: layout.viewBox,
    source: { name: 'U.S. Census / US Atlas county outlines', url: national.source,
      sha256: national.source_sha256, geometry_vintage: national.geometry_vintage,
      projection: national.projection, attribution: national.attribution },
    features: counties.map(feature => ({ ...feature, id: feature.id, county_fips: feature.id,
      geography_key: 'county:' + feature.id, name: / County$/.test(feature.name) ? feature.name : feature.name + ' County' })) }, 'county');
}

/** Same-origin, versioned static boundaries; errors evict only their own layer. */
export function createMassachusettsGeographyLoader({ fetcher = (...args) => fetch(...args) } = {}) {
  const requests = new Map();
  return function load(level = 'town') {
    if (!['town', 'county'].includes(level)) return Promise.reject(new Error('Unsupported Massachusetts boundary layer.'));
    if (!requests.has(level)) {
      const request = (async () => {
        const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10000);
        try {
          const url = assetURL(level === 'town' ? './data/ma-town-paths.json' : './data/us-counties-albers.v3.0.1.paths.json');
          const response = await fetcher(url, { signal: controller.signal, credentials: 'same-origin', redirect: 'error', cache: url.searchParams.has('v') ? 'force-cache' : 'no-cache' });
          if (!response.ok || response.redirected) throw new Error('Massachusetts boundaries returned HTTP ' + response.status + '.');
          if (Number(response.headers.get('content-length')) > MAX_BYTES) throw new Error('Massachusetts boundary data exceeds its size limit.');
          const text = await response.text();
          if (new TextEncoder().encode(text).byteLength > MAX_BYTES) throw new Error('Massachusetts boundary data exceeds its size limit.');
          const raw = JSON.parse(text);
          return level === 'town' ? validateMassachusettsGeography(raw, level) : massachusettsCounties(raw);
        } finally { clearTimeout(timer); }
      })();
      requests.set(level, request);
      request.catch(() => { if (requests.get(level) === request) requests.delete(level); });
    }
    return requests.get(level);
  };
}
const defaultLoader = createMassachusettsGeographyLoader();
export function loadMassachusettsGeography(level = 'town') { return defaultLoader(level); }

function svg(document, tag, attributes = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, String(value)));
  return node;
}

/** A single boundary layer owns its projection, viewport, exact joins and focus. */
export function drawMassachusettsMap(container, { geography, values = new Map(), selected = '', onSelect = () => {} }) {
  const document = container.ownerDocument, focusedId = document.activeElement?.closest?.('[data-ma-unit-id]')?.dataset.maUnitId;
  const [,, width] = viewport(geography.viewBox), level = geography.level;
  const root = svg(document, 'svg', { viewBox: geography.viewBox, class: 'ma-map-svg ma-' + level + '-map-svg', role: 'group',
    'aria-label': 'Massachusetts ' + (level === 'town' ? 'city and town' : 'county') + ' results. Select a region for details.' });
  const title = svg(document, 'title'); title.textContent = 'Massachusetts ' + (level === 'town' ? 'municipality' : 'county') + ' reference boundaries'; root.append(title);
  const paths = [], active = [], featureIds = new Set(geography.features.map(feature => feature.id));
  for (const feature of geography.features) {
    const value = values.get(feature.id), name = value?.name || feature.name, description = value?.description || '';
    const path = svg(document, 'path', { d: feature.path, 'fill-rule': 'evenodd',
      'data-ma-unit-id': feature.id, 'data-geography-key': level + ':' + feature.id,
      [level === 'town' ? 'data-town-key' : 'data-county-fips']: feature.id,
      class: 'ma-map-shape ma-map-' + level + (value?.party ? ' ' + value.party : ' no-returns') + (selected === feature.id ? ' selected' : ''),
      role: 'button', tabindex: '-1', 'aria-pressed': String(selected === feature.id), 'aria-label': name + (description ? ': ' + description : ''),
      fill: value?.fill || PARTY_FILL[value?.party] || '#dce2e9', stroke: selected === feature.id ? '#173e6d' : '#fff',
      'stroke-width': selected === feature.id ? 2.5 : 0.65, 'vector-effect': 'non-scaling-stroke' });
    path.style.fill = value?.fill || PARTY_FILL[value?.party] || '#dce2e9';
    const hint = svg(document, 'title'); hint.textContent = name + (description ? '\n' + description : ''); path.append(hint);
    const choose = () => { if (value) onSelect(feature.id, feature); };
    path.addEventListener('click', choose);
    path.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(); }
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const index = active.indexOf(path), offset = ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1;
        const next = event.key === 'Home' ? active[0] : event.key === 'End' ? active[active.length - 1] : active[(index + offset + active.length) % active.length];
        if (next) { active.forEach(item => item.setAttribute('tabindex', item === next ? '0' : '-1')); next.focus(); }
      }
    });
    paths.push(path); if (value) active.push(path); root.append(path);
  }
  const selectedPath = paths.find(path => path.dataset.maUnitId === selected);
  if (selectedPath) root.append(selectedPath);
  const labelFeature = geography.features.find(feature => feature.id === selected);
  if (labelFeature) {
    const label = svg(document, 'text', { x: labelFeature.centroid[0], y: labelFeature.centroid[1], class: 'ma-map-selected-label',
      'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': width / 70,
      fill: '#173e6d', stroke: '#fff', 'stroke-width': width / 900, 'paint-order': 'stroke', 'pointer-events': 'none', 'aria-hidden': 'true' });
    label.textContent = values.get(selected)?.name || labelFeature.name; root.append(label);
  }
  const focus = active.find(path => path.dataset.maUnitId === focusedId) || (selectedPath && active.includes(selectedPath) ? selectedPath : active[0]);
  if (focus) focus.setAttribute('tabindex', '0');
  container.replaceChildren(root);
  if (focusedId && focus) focus.focus({ preventScroll: true });
  const matched = [...values.keys()].filter(id => featureIds.has(id));
  return { level, polygons: geography.features.length, matched: matched.length,
    unmatchedSourceIds: [...values.keys()].filter(id => !featureIds.has(id)), viewBox: geography.viewBox };
}
