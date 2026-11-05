import assert from 'node:assert/strict';
import test from 'node:test';
import {checkGameTrace} from '../experiments/motif-instrument-009/trace-verifier.mjs';
import {verifyObservedGameBundle} from '../experiments/motif-instrument-009/verify.mjs';

const cues=['READ_FIELD','LAY_BONES','CATCH_WATER','MAKE_SHADE',
  'MAKE_GROUND','SEED_NUCLEUS','FEED_FIELD','WITNESS_DELTA','ONE_METER_OUTWARD'];
const stations=cues.map((cue,i)=>({cue,at:{x:-40+i*10,y:65,z:46}}));
const rows=(lit)=>stations.map((s,i)=>({
  cue:s.cue,at:s.at,lit:i<lit,
  server_predicate:'minecraft:redstone_lamp[lit=true]',
  server_response:'synthetic '+(i<lit?1:0),
}));
const observe=(lit,name)=>({
  username:name,operator:false,
  independent_new_connection:true,
  rows:stations.map((s,i)=>({
    cue:s.cue,at:s.at,name:'redstone_lamp',lit:i<lit,
  })),
});
const proposal=()=>({
  schema:'relatte.motif-minecraft-instrument-008/v0',
  target_world:'B',
  target_world_seed:'918273645',
  new_fault_repeater:{x:-13,y:66,z:46},
});
const trace=(lit=3)=>({
  schema:'relatte.minecraft-009-game-trace/v0',
  world:'B',seed:'918273645',
  server_seed_observed:'918273645',
  fault_x:-13,
  proposed_threshold:4,
  stations,
  states:{
    initial:{server:rows(0)},
    fault:{server:rows(lit),fresh_nonop:observe(lit,'MotifWitness009')},
    reset:{server:rows(0)},
    restored:{server:rows(9),fresh_nonop:observe(9,'MotifRestore009')},
  },
  observed_fault_count:lit,
  observed_fault_class_gte4:lit>=4,
  author_disconnect_before_fresh_witness:true,
  actual_game_execution:true,
  real_physical_environment_effect:false,
});
const version={id:'26.1.1',server_sha1:'a'.repeat(40)};

test('009: raw world B game states are reconciled with fresh non-OP observer',()=>{
  const outcome=checkGameTrace(proposal(),trace(3),version);
  assert.deepEqual(outcome,{faultCount:3,classification:'LT_4'});
});

test('009: alternative four-lamp observation remains permitted, not hard-coded',()=>{
  assert.deepEqual(checkGameTrace(proposal(),trace(4),version),{
    faultCount:4,classification:'GE_4',
  });
});

test('009: no assumption of a particular hypothesis outcome is baked into verifier',()=>{
  assert.deepEqual(checkGameTrace(proposal(),trace(6),version),{
    faultCount:6,classification:'GE_4',
  });
});

test('009: false independent protocol observer fails',()=>{
  const t=trace();t.states.fault.fresh_nonop.rows[2].lit=false;
  assert.throws(()=>checkGameTrace(proposal(),t,version),
    /INDEPENDENT_FAULT_OBSERVER_DISAGREES/);
});

test('009: missing complete repair cannot count as game success',()=>{
  const t=trace();t.states.restored.server[3].lit=false;
  assert.throws(()=>checkGameTrace(proposal(),t,version),
    /CIRCUIT_NOT_RESTORED/);
});

test('009: claims of real environment effect or forged class are refused',()=>{
  let t=trace();t.real_physical_environment_effect=true;
  assert.throws(()=>checkGameTrace(proposal(),t,version),
    /AUTHORITY_OR_ACTION_CLAIM/);
  t=trace();t.observed_fault_class_gte4=true;
  assert.throws(()=>checkGameTrace(proposal(),t,version),
    /FALSIFIED_FAULT_COUNT_OR_CLASS/);
});

test('009: server seed mismatch, changed repeater, missing fresh observer HOLD',()=>{
  let t=trace();t.server_seed_observed='381654729';
  assert.throws(()=>checkGameTrace(proposal(),t,version),
    /GAME_VERSION_OR_SEED_NOT_VERIFIED/);
  t=trace();t.states.fault.fresh_nonop.operator=true;
  assert.throws(()=>checkGameTrace(proposal(),t,version),
    /INDEPENDENT_FAULT_OBSERVER_DISAGREES/);
  const p=proposal();p.new_fault_repeater.x=17;
  assert.throws(()=>checkGameTrace(p,trace(),version),/UNKNOWN_INSTRUMENT/);
});

test('009: independent return refuses unverified/incomplete signed game bundle',async()=>{
  await assert.rejects(()=>verifyObservedGameBundle(Buffer.from('{}'),Buffer.from('{}')),
    /PINNED_SOURCE_BYTE_HASH_CHANGED|SOURCE_BYTES_MISSING_OR_OVERSIZE/);
});
