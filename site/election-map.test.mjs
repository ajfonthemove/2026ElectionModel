import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createCountyGeographyLoader, validateCountyGeography, countyMapLayout} from './election-map.js';

const data = async (name) => JSON.parse(await readFile(new URL('./data/' + name, import.meta.url), 'utf8'));
const row = (id, stateFips, offset = 0) => ({id, state_fips: stateFips, name:'Test County',
  path:`M${offset},${offset}L${offset+10},${offset}L${offset+8},${offset+12}Z`,
  centroid:[offset+5,offset+5],bounds:[[offset,offset],[offset+10,offset+12]]});
const fixture = (counties, extra = {}) => ({viewBox:'0 0 600 400',counties,...extra});
const reply = (value, status = 200) => new Response(JSON.stringify(value), {status,headers:{'Content-Type':'application/json'}});

test('all three real preset assets expose county paths and usable state viewports', async()=>{
  for(const [state,prefix,total] of [['KY','21',120],['NC','37',100],['CA','06',58]]){
    const raw=await data(`ap-county-paths-2026-${state}.json`);
    const geography=validateCountyGeography(raw,state);
    const values=new Map(geography.counties.map(county=>[county.id,{party:'dem'}]));
    const layout=countyMapLayout(geography,prefix,values);
    assert.equal(layout.ready,true);assert.equal(layout.polygons,total);assert.equal(layout.matched,total);
    const [x,y,width,height]=layout.viewBox.split(' ').map(Number);
    assert.ok(width>0 && height>0);
    assert.ok(geography.counties.every(county=>county.path.startsWith('M') && county.bounds[0][0]>=x && county.bounds[1][0]<=x+width && county.bounds[0][1]>=y && county.bounds[1][1]<=y+height));
  }
});

test('real Census outlines select Michigan, New York and Texas without other states', async()=>{
  const geography=validateCountyGeography(await data('us-counties-albers.v3.0.1.paths.json'));
  for(const [stateFips,total] of [['26',83],['36',62],['48',254]]){
    const rows=geography.counties.filter(county=>county.state_fips===stateFips);
    const layout=countyMapLayout(geography,Number(stateFips),new Map(rows.map(county=>[county.id,{}])));
    assert.equal(layout.ready,true);assert.equal(layout.polygons,total);assert.equal(layout.matched,total);
    assert.ok(layout.features.every(county=>county.id.startsWith(stateFips)));
  }
});

test('county viewport derives from county path bounds rather than unrelated state coordinates',()=>{
  const geography=fixture([row('26001','26',1000),row('26003','26',1020)]);
  const layout=countyMapLayout(geography,'26',new Map([['26001',{}],['26003',{}]]));
  const [x,y,width,height]=layout.viewBox.split(' ').map(Number);
  assert.ok(x<1000 && y<1000 && x+width>1030 && y+height>1032);
  assert.ok(x>900 && y>900);assert.equal(layout.ready,true);
});

test('numeric FIPS formatting normalizes, synthetic locality IDs and duplicate boundaries reject',()=>{
  assert.equal(validateCountyGeography(fixture([row(6001,6)])).counties[0].id,'06001');
  for(const counties of [[row('92623098','26')],[row('26001','26'),row('26001','26')],[row('26001','27')]]){
    assert.throws(()=>validateCountyGeography(fixture(counties)));
  }
  assert.throws(()=>validateCountyGeography(fixture([row('26001','26')],{state:'MI'}),'KY'));
});

test('preset failure uses legitimate Census outlines and preserves their source metadata',async()=>{
  const urls=[],national=fixture([row('21001','21')],{source:'Census reference',geometry_vintage:'2017'});
  const loader=createCountyGeographyLoader({fetcher:async url=>{urls.push(url.href);return urls.length===1?reply({},503):reply(national);}});
  const result=await loader('KY');
  assert.equal(result.source,'Census reference');assert.equal(result.geometry_vintage,'2017');
  assert.equal(result.state,undefined);assert.equal(result.counties[0].id,'21001');
  assert.ok(urls[0].includes('ap-county-paths-2026-KY.json'));assert.ok(urls[1].includes('us-counties-albers'));
});

test('a failed preset and failed fallback can recover on the next county request',async()=>{
  const urls=[];let failed=true;
  const loader=createCountyGeographyLoader({fetcher:async url=>{urls.push(url.href);return failed?reply({},503):reply(fixture([row('21001','21')],{state:'KY'}));}});
  await assert.rejects(loader('KY'));assert.equal(urls.length,2);
  failed=false;const result=await loader('KY');
  assert.equal(result.state,'KY');assert.equal(urls.length,3);assert.ok(urls[2].includes('ap-county-paths-2026-KY.json'));
});

test('invalid preset geometry falls back, rather than caching a blank or wrong-state object',async()=>{
  let calls=0;
  const loader=createCountyGeographyLoader({fetcher:async()=>++calls===1?reply(fixture([],{state:'KY'})):reply(fixture([row('21001','21')]))});
  const result=await loader('KY');assert.equal(calls,2);assert.equal(result.counties.length,1);
});

test('town and election-district identifiers cannot report county-map readiness',()=>{
  for(const [state,sourceId] of [['44','94440001'],['02','9902001']]){
    const layout=countyMapLayout(fixture([row(state+'001',state)]),state,new Map([[sourceId,{}]]));
    assert.equal(layout.ready,false);assert.equal(layout.matched,0);assert.deepEqual(layout.unmatchedSourceFips,[sourceId]);
  }
});

test('concurrent requests share one validated national boundary download',async()=>{
  let calls=0,release;
  const wait=new Promise(resolve=>{release=resolve;});
  const loader=createCountyGeographyLoader({fetcher:async()=>{calls++;await wait;return reply(fixture([row('26001','26'),row('36001','36')]));}});
  const mi=loader('MI'),ny=loader('NY');assert.equal(mi,ny);release();
  await Promise.all([mi,ny]);assert.equal(calls,1);
});

test('boundary URLs retain the browser release version under project subpaths',async()=>{
  const versioned=await import('./election-map.js?v=county-geometry-test');let requested;
  const loader=versioned.createCountyGeographyLoader({fetcher:async url=>{requested=url;return reply(fixture([row('26001','26')]));}});
  await loader('MI');assert.equal(requested.searchParams.get('v'),'county-geometry-test');
  assert.ok(requested.pathname.endsWith('/site/data/us-counties-albers.v3.0.1.paths.json'));
});
