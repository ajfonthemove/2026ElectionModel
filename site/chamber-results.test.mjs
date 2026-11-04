import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseChamberReference, loadChamberReference, summarizeChamberResults} from './chamber-results.js';

const raw = () => JSON.parse(readFileSync(new URL('./data/chamber-reference-2026.json', import.meta.url), 'utf8'));
const reference = () => parseChamberReference(raw());
const clone = value => JSON.parse(JSON.stringify(value));
const code = office => ({senate:'SG',house:'HG',governor:'GG'})[office];
function race(seat, office, winner = 'DEM', extra = {}) {
  const url = `https://politics.api.cnn.io/results/national-races/2026-${code(office)}.json`;
  const candidates = ['DEM','REP','IND'].map((party,index) => ({candidate_id:seat.race_id+'-'+party,name:party+' Candidate',party,votes:100-index*10}));
  const candidate = candidates.find(row=>row.party===winner);
  return {race_id:seat.race_id,state:seat.state,office,cycle:2026,stage:'general',district:office==='house'?String(seat.district):null,special:seat.special||false,source_name:'CNN',source_url:url,candidates,reported_total:270,
    source_called_winner:candidate?{candidate_id:candidate.candidate_id,name:candidate.name,party:candidate.party,source:'CNN',source_url:url}:null,...extra};
}
const firstUp = (ref,office='senate')=>ref.offices[office].seats.find(seat=>seat.up_for_election);
const sum = summary=>Object.values(summary.parties).reduce((total,party)=>total+party.total,0)+summary.undecided;

test('the verified inventory includes every voting seat, with explicit held and contested partitions',()=>{
  const ref=reference();
  for(const [office,total,held,up] of [['senate',100,65,35],['house',435,0,435],['governor',50,14,36]]){
    const data=ref.offices[office];assert.equal(data.seats.length,total);assert.equal(new Set(data.seats.map(seat=>seat.seat_id)).size,total);
    assert.equal(data.holdover_count,held);assert.equal(data.contested,up);assert.equal(data.seats.filter(seat=>seat.up_for_election).length,up);
    assert.ok(data.seats.every(seat=>seat.state!=='DC'));assert.ok(Object.isFrozen(data.seats));
  }
});

test('a missing election feed retains held seats and leaves every contested seat undecided',()=>{
  const ref=reference();
  const senate=summarizeChamberResults([],ref,{office:'senate'});
  assert.deepEqual(senate.parties,{DEM:{total:32,held:32,won:0},REP:{total:31,held:31,won:0},IND:{total:2,held:2,won:0},OTHER:{total:0,held:0,won:0}});
  assert.equal(senate.undecided,35);assert.equal(senate.missing_races,35);assert.equal(sum(senate),100);
  const governor=summarizeChamberResults([],ref,{office:'governor'});
  assert.equal(governor.parties.DEM.total,6);assert.equal(governor.parties.REP.total,8);assert.equal(governor.undecided,36);assert.equal(sum(governor),50);
  const house=summarizeChamberResults([],ref,{office:'house'});assert.equal(house.holdover_count,0);assert.equal(house.undecided,435);assert.equal(sum(house),435);
});

test('only source calls contribute wins; uncalled leaders do not become results',()=>{
  const ref=reference(),seat=firstUp(ref),uncalled=race(seat,'senate',null);
  uncalled.candidates[0].votes=250;uncalled.candidates[1].votes=20;
  const data=summarizeChamberResults([uncalled],ref);
  assert.equal(data.called_count,0);assert.equal(data.parties.DEM.total,32);assert.equal(data.undecided,35);
  const called=summarizeChamberResults([race(seat,'senate','REP')],ref);
  assert.equal(called.parties.REP.total,32);assert.equal(called.parties.REP.won,1);assert.equal(called.undecided,34);assert.equal(sum(called),100);
});

test('an explicit released CNN call counts even with zero or unknown candidate votes',()=>{
  const ref=reference(),seat=firstUp(ref);
  for(const votes of [0,null]){
    const row=race(seat,'senate','DEM',{reported_total:votes,votes_released:false});row.candidates.forEach(candidate=>{candidate.votes=votes;});
    const result=summarizeChamberResults([row],ref);assert.equal(result.called_count,1);assert.equal(result.parties.DEM.total,33);assert.equal(result.undecided,34);
  }
});

test('all called Senate races plus held seats reconcile to the full 100 seats',()=>{
  const ref=reference(),rows=ref.offices.senate.seats.filter(seat=>seat.up_for_election).map((seat,index)=>race(seat,'senate',index%2===0?'DEM':'REP'));
  const result=summarizeChamberResults(rows,ref);
  assert.equal(result.called_count,35);assert.equal(result.parties.DEM.total,50);assert.equal(result.parties.REP.total,48);assert.equal(result.parties.IND.total,2);assert.equal(result.undecided,0);assert.equal(sum(result),100);
});

test('Governor and House results use complete office totals without inventing House holdovers',()=>{
  const ref=reference();
  const governors=ref.offices.governor.seats.filter(seat=>seat.up_for_election).map((seat,index)=>race(seat,'governor',index<20?'DEM':'REP'));
  const governor=summarizeChamberResults(governors,ref,{office:'governor'});assert.equal(governor.parties.DEM.total,26);assert.equal(governor.parties.REP.total,24);assert.equal(governor.undecided,0);assert.equal(sum(governor),50);
  const houses=ref.offices.house.seats.map((seat,index)=>race(seat,'house',index<220?'DEM':'REP'));
  const house=summarizeChamberResults(houses,ref,{office:'house'});assert.equal(house.parties.DEM.total,220);assert.equal(house.parties.REP.total,215);assert.equal(house.parties.DEM.held,0);assert.equal(house.undecided,0);assert.equal(house.majority_threshold,218);assert.equal(sum(house),435);
});

test('Florida and Ohio specials update only their class III seats and retain their class I seats',()=>{
  const ref=reference(),seats=['FL','OH'].map(state=>ref.offices.senate.seats.find(seat=>seat.state===state&&seat.up_for_election));
  assert.deepEqual(seats.map(seat=>[seat.seat_id,seat.race_id,seat.special]),[['FL-3','2026-SP-FL',true],['OH-3','2026-SP-OH',true]]);
  const result=summarizeChamberResults(seats.map((seat,index)=>race(seat,'senate',index===0?'DEM':'REP')),ref);
  assert.equal(result.called_count,2);assert.equal(result.parties.DEM.total,33);assert.equal(result.parties.REP.total,32);
  for(const state of ['FL','OH']){assert.equal(result.seats.filter(seat=>seat.state===state).length,2);assert.equal(result.seats.find(seat=>seat.seat_id===state+'-1').status,'held');}
  assert.equal(sum(result),100);
});

test('identical cumulative duplicate calls count once; conflicting calls stay undecided',()=>{
  const ref=reference(),seat=firstUp(ref),row=race(seat,'senate','DEM');
  const identical=summarizeChamberResults([row,clone(row)],ref);assert.equal(identical.called_count,1);assert.equal(identical.parties.DEM.won,1);
  for(const other of [race(seat,'senate','REP'),race(seat,'senate',null)]){
    const result=summarizeChamberResults([row,other],ref);assert.equal(result.called_count,0);assert.equal(result.undecided,35);assert.equal(result.issues[0].reason,'conflicting_duplicate_calls');assert.equal(sum(result),100);
  }
});

test('call identity, candidate party and source metadata must all match the verified national feed',()=>{
  const ref=reference(),seat=firstUp(ref);
  for(const mutate of [r=>r.source_called_winner.candidate_id='unknown',r=>r.source_called_winner.name='Wrong name',r=>r.source_called_winner.party='REP',r=>r.source_called_winner.source='AP',r=>r.source_name='AP',r=>r.source_url='https://untrusted.example/results',r=>r.source_called_winner.source_url='https://politics.api.cnn.io/results/national-races/2026-GG.json',r=>r.candidates.push(clone(r.candidates[0])),r=>r.source_called_winner.party='UNKNOWN']){
    const row=race(seat,'senate','DEM');mutate(row);const result=summarizeChamberResults([row],ref);assert.equal(result.called_count,0);assert.equal(result.parties.DEM.total,32);assert.equal(result.undecided,35);assert.equal(result.issues.length,1);
  }
});

test('county rows, district fragments, old cycles and overlapping House specials cannot change office totals',()=>{
  const ref=reference(),seat=firstUp(ref),base=race(seat,'senate','DEM');
  for(const extra of [{county_fips:'02001'},{reporting_unit_id:'LOCAL-1'},{geography_type:'county'},{district:'1'},{cycle:2024},{state:'DC'},{stage:'runoff'}]){
    const result=summarizeChamberResults([{...base,...extra}],ref);assert.equal(result.called_count,0);assert.equal(result.undecided,35);
  }
  const h=ref.offices.house.seats.find(seat=>seat.seat_id==='TX-18'),row=race(h,'house','DEM'),special={...clone(row),race_id:'2026-HQ-TX-18',special:true};
  const result=summarizeChamberResults([row,special],ref,{office:'house'});assert.equal(result.called_count,1);assert.equal(result.parties.DEM.total,1);assert.equal(result.undecided,434);assert.equal(result.ignored_races,1);
});

test('Independent seats retain actual party even when an independently sourced caucus is Democratic',()=>{
  const ref=reference(),held=ref.offices.senate.seats.filter(seat=>!seat.up_for_election&&seat.party==='IND');
  assert.equal(held.length,2);assert.ok(held.every(seat=>seat.caucus==='DEM'&&seat.caucus_source_id));
  const result=summarizeChamberResults([race(firstUp(ref),'senate','IND')],ref);
  assert.equal(result.parties.DEM.total,32);assert.equal(result.parties.IND.total,3);assert.equal(result.parties.IND.held,2);assert.equal(result.parties.IND.won,1);assert.equal(sum(result),100);
});

test('invalid inventories, made-up holdovers, missing source evidence and unsupported caucus labels reject',()=>{
  for(const mutate of [r=>r.offices.senate.seats.pop(),r=>r.offices.house.total=436,r=>r.offices.governor.seats[0].state='DC',r=>r.offices.senate.seats.find(seat=>!seat.up_for_election).party=null,r=>r.offices.senate.seats.find(seat=>!seat.up_for_election).up_for_election=true,r=>r.sources[0].sha256='x',r=>r.offices.senate.seats.find(seat=>seat.party==='IND').caucus_source_id='unsourced',r=>r.as_of='2026-02-30']){
    const data=raw();mutate(data);assert.throws(()=>parseChamberReference(data));
  }
  const data=raw(),seat=data.offices.governor.seats.find(seat=>!seat.up_for_election);seat.up_for_election=true;seat.race_id='2026-GG-'+seat.state;assert.throws(()=>parseChamberReference(data),/held\/contested/);
});

test('reference loading is lazy, caches parsed success and retries failed sources',async()=>{
  let calls=0,fail=true;
  const fetcher=async(url,options)=>{calls++;assert.ok(url.pathname.endsWith('/site/data/chamber-reference-2026.json'));assert.equal(options.cache,'no-cache');assert.equal(options.redirect,'error');return fail?new Response('',{status:503}):new Response(JSON.stringify(raw()));};
  assert.equal(calls,0);await assert.rejects(loadChamberReference({fetcher}),/503/);fail=false;
  const [a,b]=await Promise.all([loadChamberReference({fetcher}),loadChamberReference({fetcher})]);assert.equal(a,b);assert.equal(calls,2);assert.equal(a.offices.senate.holdover_count,65);
  await assert.rejects(loadChamberReference({fetcher:async()=>new Response('{}',{headers:{'content-length':String(1024*1024)}})}),/size limit/);
  await assert.rejects(loadChamberReference({fetcher:async()=>new Response('x'.repeat(512*1024+1))}),/size limit/);
});

test('versioned reference loads retain the complete release query under GitHub project subpaths',async()=>{
  const versioned=await import('./chamber-results.js?v=chamber-test-release');let requested;
  const data=await versioned.loadChamberReference({fetcher:async(url,options)=>{requested=url;assert.equal(options.cache,'force-cache');return new Response(JSON.stringify(raw()));}});
  assert.equal(requested.searchParams.get('v'),'chamber-test-release');assert.equal(data.offices.governor.total,50);
});
