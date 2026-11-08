import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createMassachusettsGeographyLoader, validateMassachusettsGeography } from './massachusetts-map.js';

const bytes = name => readFile(new URL('./data/' + name, import.meta.url));
const data = async name => JSON.parse(await bytes(name));
const reply = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', ...headers } });

test('all 351 real town paths join the official MassGIS inventory exactly once, including the historical Manchester alias', async () => {
  const geography = validateMassachusettsGeography(await data('ma-town-paths.json'));
  const crosswalk = await data('ma-town-county-crosswalk.json'), expected = new Map(crosswalk.towns.map(town => [String(town.massgis_town_id), town]));
  assert.equal(geography.features.length, 351); assert.equal(new Set(geography.features.map(town => town.id)).size, 351);
  for (const town of geography.features) {
    assert.equal(town.canonical_name, expected.get(town.id).name); assert.equal(town.county_fips, expected.get(town.id).county_fips);
    assert.equal(town.town_key, town.id); assert.equal(town.geography_key, 'town:' + town.id);
  }
  assert.equal(geography.features.find(town => town.id === '35').canonical_name, 'BOSTON');
  assert.equal(geography.features.find(town => town.id === '166').source_town_name, 'MANCHESTER');
  assert.equal(geography.features.find(town => town.id === '166').canonical_name, 'MANCHESTER-BY-THE-SEA');
  assert.equal(geography.source.published_reference_year, 2024); assert.equal(geography.source.geometry_vintage, null);
  const manifest = await data('ma-town-paths.manifest.json');
  assert.equal(manifest.output.sha256, createHash('sha256').update(await bytes('ma-town-paths.json')).digest('hex'));
  assert.equal(manifest.source.crosswalk_sha256, createHash('sha256').update(await bytes('ma-town-county-crosswalk.json')).digest('hex'));
});

test('real municipality shapes retain every island polygon and ring inside the supplied planar viewport', async () => {
  const geography = validateMassachusettsGeography(await data('ma-town-paths.json'));
  assert.equal(geography.features.reduce((sum, town) => sum + town.polygon_count, 0), 384);
  assert.equal(geography.features.reduce((sum, town) => sum + town.ring_count, 0), 385);
  assert(geography.features.some(town => town.polygon_count > 1));
  for (const town of geography.features) {
    assert.equal((town.path.match(/M/g) || []).length, town.ring_count);
    assert.equal((town.path.match(/Z/g) || []).length, town.ring_count);
    assert(town.bounds[1][0] > town.bounds[0][0] && town.bounds[1][1] > town.bounds[0][1]);
  }
});

test('town geography rejects missing municipalities, duplicate IDs, county IDs used as town IDs and clipped viewports', async () => {
  const original = await data('ma-town-paths.json');
  for (const mutate of [raw => raw.features.pop(), raw => raw.features[0].id = raw.features[1].id,
    raw => raw.features[0].id = '25025', raw => raw.features[0].county_fips = '26001',
    raw => raw.viewBox = '0 0 10 10', raw => raw.features[0].bounds[1][0] = Infinity]) {
    const raw = structuredClone(original); mutate(raw); assert.throws(() => validateMassachusettsGeography(raw));
  }
});

test('county requests use 14 exact Massachusetts FIPS and their own viewport rather than town projection coordinates', async () => {
  const national = await data('us-counties-albers.v3.0.1.paths.json');
  let calls = 0;
  const loader = createMassachusettsGeographyLoader({ fetcher: async url => { calls++; assert.match(url.pathname, /us-counties-albers/); return reply(national); } });
  const geometry = await loader('county');
  assert.equal(calls, 1); assert.equal(geometry.features.length, 14); assert.equal(geometry.level, 'county');
  assert(geometry.features.every(county => /^25\d{3}$/.test(county.id) && county.id === county.county_fips));
  assert.equal(geometry.source.geometry_vintage, '2017');
  const [x, y, width, height] = geometry.viewBox.split(' ').map(Number);
  assert(x > 800 && width < 100 && height < 100);
  assert(geometry.features.every(county => county.bounds[0][0] >= x && county.bounds[1][0] <= x + width && county.bounds[0][1] >= y && county.bounds[1][1] <= y + height));
});

test('layer requests are shared, but a failed or malformed town response remains retryable without poisoning county data', async () => {
  const towns = await data('ma-town-paths.json'), counties = await data('us-counties-albers.v3.0.1.paths.json');
  let townCalls = 0, countyCalls = 0;
  const loader = createMassachusettsGeographyLoader({ fetcher: async url => {
    if (url.pathname.includes('ma-town-paths')) { townCalls++; return townCalls === 1 ? reply({}, 503) : townCalls === 2 ? reply({ ...towns, features: [] }) : reply(towns); }
    countyCalls++; return reply(counties);
  } });
  const first = loader('town'); assert.equal(first, loader('town')); await assert.rejects(first);
  await loader('county'); await assert.rejects(loader('town')); await loader('town'); await loader('county');
  assert.equal(townCalls, 3); assert.equal(countyCalls, 1);
  await assert.rejects(loader('precinct'));
});

test('boundary downloads keep the browser release version and reject oversized responses before parsing', async () => {
  const module = await import('./massachusetts-map.js?v=ma-geography-test'), towns = await data('ma-town-paths.json');
  let captured;
  const loader = module.createMassachusettsGeographyLoader({ fetcher: async url => { captured = url; return reply(towns); } });
  await loader('town'); assert.equal(captured.searchParams.get('v'), 'ma-geography-test'); assert.match(captured.pathname, /\/site\/data\/ma-town-paths\.json$/);
  const oversized = createMassachusettsGeographyLoader({ fetcher: async () => reply({}, 200, { 'Content-Length': String(4 * 1024 * 1024 + 1) }) });
  await assert.rejects(oversized('town'), /size limit/);
});
