import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {
  validateCounterfactualQuest,counterfactualScenario,
  GHOT_005_COMMIT,SOURCE_CROSSING,SOURCE_RECEIPT,SOURCE_PACKET,
  type CounterfactualQuest,
} from '../experiments/riff-raft-minecraft-005/counterfactual-grammar.mjs';
import {assemblePair,emitSignedReturn,SCHEMA} from
  '../experiments/riff-raft-minecraft-005/counterfactual-replay.mjs';
const stages=['READ_FIELD','LAY_BONES','CATCH_WATER','MAKE_SHADE',
  'MAKE_GROUND','SEED_NUCLEUS','FEED_FIELD','WITNESS_DELTA','ONE_METER_OUTWARD'];
const lamps=[-40,-30,-20,-10,0,10,20,30,40];
const canon=(x:unknown):string=>JSON.stringify(sort(x));
function sort(x:unknown):unknown{
  if(Array.isArray(x))return x.map(sort);
  if(x!==null&&typeof x==='object')return Object.fromEntries(
    Object.entries(x as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b))
      .map(([k,v])=>[k,sort(v)]));
  return x;
}
const digest=(x:unknown)=>createHash('sha256').update(canon(x)).digest('hex');
function quest(id:'A'|'B'):CounterfactualQuest{
  const p=counterfactualScenario(id);
  assert.ok(p);
  const body={
    schema:'ghot.riff-raft-counterfactual-quest/v0' as const,
    source_project:'the-static-collective/GHoT',
    source_donor_commit:'a63624f1be6a533f5ab927b1e4e8b1a629f1ba53',
    mode:'observed-source-counterfactual-proposal-only',
    world_id:id,world_seed:p.seed,policy:p.policy,
    previous_fault_x:p.old,previous_fault_lit:p.oldLit,
    source_004_crossing_id:SOURCE_CROSSING,
    source_004_receipt_id:SOURCE_RECEIPT,
    source_004_packet_sha256:SOURCE_PACKET,
    source_004_instance_id:'composition-instance-v0:'+'a'.repeat(64),
    source_004_candidate_crossing_id:'relatte-crossing-v0:'+'b'.repeat(64),
    source_004_observed_state_sha256:'c'.repeat(64),
    source_004_quest_sha256:'d'.repeat(64),
    reason:'bounded-counterfactual-relative-to-observed-lamp-count',
    fault_repeater_position:{x:p.next,y:66,z:46},
    expected_lit_during_fault:lamps.map(x=>x<p.next),
    expected_lit_initial:stages.map(()=>false),
    expected_lit_reset:stages.map(()=>false),
    expected_lit_repaired:stages.map(()=>true),
    station_labels:stages,
    permitted_operation:'remove-one-redstone-repeater-then-restore',
    sandbox:'official-vanilla-minecraft-localhost',
    operator_must_select:true as const,source_verified_as_game_evidence:true as const,
    future_game_execution_observed:false as const,
    real_soil_improvement_verified:false as const,ghot_resource_moved:false as const,
    owner_admission:false as const,auto_dispatch:false as const,
    authority_effect:'none' as const,
  };
  return {...body,quest_sha256:digest(body)};
}
test('005: actual 004 source anchors are named, not generic pattern matches',()=>{
  assert.equal(GHOT_005_COMMIT,'bec31b30ef7f7b6d07314da1ce96793fb8c45a4a');
  assert.equal(SOURCE_PACKET,'9956d0887a5f65495cb777a5ba06aa03451946c46285930d8d96eeaa2a7d0a17');
  assert.equal(SOURCE_CROSSING.length,'relatte-crossing-v0:'.length+64);
  assert.equal(SOURCE_RECEIPT.length,'relatte-receipt-v0:'.length+64);
});
test('005: 004 observed 3 and 6 implies bounded 5 and 2 future-game candidate faults',()=>{
  const a=quest('A'),b=quest('B');
  assert.equal(validateCounterfactualQuest(a,'A',a.world_seed),a);
  assert.equal(validateCounterfactualQuest(b,'B',b.world_seed),b);
  assert.deepEqual([a.previous_fault_lit,b.previous_fault_lit],[3,6]);
  assert.deepEqual([a.fault_repeater_position.x,b.fault_repeater_position.x],[2,-28]);
  assert.deepEqual([a.expected_lit_during_fault.filter(Boolean).length,
    b.expected_lit_during_fault.filter(Boolean).length],[5,2]);
  assert.notEqual(a.quest_sha256,b.quest_sha256);
});
test('005: source content, consent or target tampering refuses',()=>{
  const a=quest('A');a.previous_fault_lit=6;
  assert.throws(()=>validateCounterfactualQuest(a,'A',a.world_seed),/POLICY_OR_FAULT_POSITION_CHANGED/);
  const b=quest('B');b.fault_repeater_position.x=32;
  assert.throws(()=>validateCounterfactualQuest(b,'B',b.world_seed),/POLICY_OR_FAULT_POSITION_CHANGED/);
  const c=quest('A');c.source_004_packet_sha256='f'.repeat(64);
  assert.throws(()=>validateCounterfactualQuest(c,'A',c.world_seed),/VERIFIED_PRIOR_RUN_NOT_BOUND/);
});
test('005: unsigned authority fields and claim promotions fail',()=>{
  const q=quest('A') as CounterfactualQuest&{execute_now?:boolean};
  q.execute_now=true;
  assert.throws(()=>validateCounterfactualQuest(q,'A',q.world_seed),/EXTRA_OR_MISSING_FIELDS/);
  const b=quest('B');
  (b as unknown as {owner_admission:boolean}).owner_admission=true;
  assert.throws(()=>validateCounterfactualQuest(b,'B',b.world_seed),/AUTHORITY_CLAIM_CHANGED/);
});
test('005: no empty or forged two-world result can be compared',async()=>{
  await assert.rejects(()=>assemblePair([]),/EXPECTED_TWO_WORLDS/);
  await assert.rejects(()=>assemblePair([
    {world_id:'A',composition_bytes:Buffer.from('{}'),runtime_bytes:Buffer.from('{}')},
    {world_id:'B',composition_bytes:Buffer.from('{}'),runtime_bytes:Buffer.from('{}')},
  ]),/BAD_INSTANCE_EVIDENCE/);
});
test('005: unverified ancestor cannot be wrapped in legitimate-looking reLATTE HOLD',async()=>{
  const fake={schema:SCHEMA,worlds:[{instance_id:'mock-A'},{instance_id:'mock-B'}]};
  await assert.rejects(()=>emitSignedReturn(fake,{},{}),/VERIFIED_SOURCE_004_BUNDLE_REQUIRED/);
});

test('005: CI regression — original signed ancestor is downloaded and checked BEFORE return signing',()=>{
  const flow=readFileSync('.github/workflows/riff-raft-minecraft-005.yml','utf8');
  const start=flow.indexOf('  compare-return:');
  assert.ok(start>0,'missing receiver comparison job');
  const compare=flow.slice(start);
  const steps=[
    'name: Collect both isolated vanilla evidence artifacts',
    'name: Retrieve pinned signed source for independent GHoT review',
    'name: Assert previous source remains available',
    'name: Compare native worlds; sign held reLATTE return',
    'name: Assert new signed return bundle actually exists',
    'name: GHoT independently verifies source P256 signatures; HOLDS',
  ];
  const check=(snippet:string)=>{
    let last=-1;
    for(const step of steps){
      const at=snippet.indexOf(step);
      assert.ok(at>last, 'missing or misordered provenance-bound CI step: '+step);
      last=at;
    }
  };
  check(compare);
  assert.match(compare,/name: riff-raft-005-counterfactual-offers/);
  assert.match(compare,/run: test -s work\/source-005\/source-004-bundle\.json/);
  assert.match(compare,/counterfactual-replay\.mjs[\s\S]*work\/source-005\/source-004-bundle\.json/);
  assert.match(compare,/name: riff-raft-minecraft-005-return-to-ghot/);
  assert.throws(()=>check(compare.replace(
    'name: Retrieve pinned signed source for independent GHoT review',
    'name: missing source retrieval')), /misordered provenance-bound CI step/);
  assert.throws(()=>check(compare.replace(
    'name: Assert previous source remains available',
    'name: missing parent check')), /misordered provenance-bound CI step/);
  assert.throws(()=>check(compare.replace(
    'name: Compare native worlds; sign held reLATTE return',
    'name: silently skipped signing')), /misordered provenance-bound CI step/);
});
