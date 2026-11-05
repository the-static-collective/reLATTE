import test from 'node:test';
import assert from 'node:assert/strict';
import {checkGameTrace} from '../experiments/motif-instrument-010/trace-verifier.mjs';

const cues=['READ_FIELD','LAY_BONES','CATCH_WATER','MAKE_SHADE','MAKE_GROUND',
  'SEED_NUCLEUS','FEED_FIELD','WITNESS_DELTA','ONE_METER_OUTWARD'];
const station=cues.map((cue,i)=>({cue,at:{x:-40+10*i,y:65,z:46}}));
const pred=n=>station.map((s,i)=>({cue:s.cue,at:s.at,lit:i<n}));
const client=(rows,name)=>({
  username:name,operator:false,independent_new_connection:true,
  rows:rows.map(r=>({...r,name:'redstone_lamp'})),
});
const proposal=()=>({
  schema:'relatte.minecraft-010-minimal-sensor-proposal/v0',
  world:'A',world_seed:'381654729',fault_x:-28,threshold:3,
  stage_indexes:[2,3],complete_9_stage_census_mandatory:true,
  game_only:true,receiver_disposition:'R3_HOLD',
});
const game=(count=2)=>{
  const fault=pred(count),restored=pred(9);
  return {
    schema:'relatte.minecraft-010-game-trace/v0',
    world:'A',seed:'381654729',server_seed_observed:'381654729',
    instrument_proposal_crossing:'relatte-crossing-v0:test',
    experiment_signed_instrument:'relatte-crossing-v0:test',
    fault_x:-28,
    stations:station,
    states:{
      initial:{server:pred(0)},
      fault:{server:fault,fresh_nonop:client(fault,'fresh-fault010')},
      reset:{server:pred(0)},
      restored:{server:restored,fresh_nonop:client(restored,'fresh-repair010')},
    },
    micro_readout:{
      sampled_before_full_census:true,
      stages:[2,3].map(i=>({
        index:i,position:station[i].at,lit:fault[i].lit,
      })),
    },
    observed_fault_count:count,
    observed_fault_class_gte3:count>=3,
    micro_prediction_gte3:count>=3,
    author_disconnect_before_fresh_witness:true,
    nonoperator_chunk_keeper_is_distinct:true,
    actual_game_execution:true,
    real_physical_environment_effect:false,
    receiver_disposition:'R3_HOLD',
    owner_admission:false,
  };
};
const meta={id:'26.1.1',server_sha1:'a'.repeat(40)};
const decide=t=>checkGameTrace(proposal(),t,meta);

test('world A: if real game has 2 lamps, two-lamp micro result equals full nine census',()=>{
  const r=decide(game(2));
  assert.equal(r.status,'GAME_MICRO_INSTRUMENT_CONFIRMED_BY_NINE_LAMP_AUDIT');
  assert.equal(r.faultCount,2);
  assert.equal(r.inferredCount,2);
  assert.equal(r.microCountMatchesNineLampAudit,true);
  assert.equal(r.hypothesis_selected_only_if_in_model,'position-invariant-prefix');
});

test('world A: if real game has 3 lamps, same instrument instead favors rival',()=>{
  const r=decide(game(3));
  assert.equal(r.status,'GAME_MICRO_INSTRUMENT_CONFIRMED_BY_NINE_LAMP_AUDIT');
  assert.equal(r.faultCount,3);
  assert.equal(r.inferredCount,3);
  assert.equal(r.hypothesis_selected_only_if_in_model,'world-local-hidden-relay');
});

test('world A: out-of-model observations remain witnessed and HELD',()=>{
  const r=decide(game(4));
  assert.equal(r.status,'HOLD_OUT_OF_MODEL_GAME_OBSERVATION');
  assert.equal(r.hypothesis_selected_only_if_in_model,null);
  assert.equal(r.faultCount,4);
});

test('world A: nonprefix lighting pattern disproves compression assumption rather than being forced into model',()=>{
  const t=game(2);
  t.states.fault.server[1].lit=false;
  t.states.fault.server[2].lit=true;
  t.states.fault.fresh_nonop=client(t.states.fault.server,'fresh-fault010');
  t.micro_readout.stages[0].lit=true;
  t.micro_prediction_gte3=true;
  const r=decide(t);
  assert.equal(r.status,'HOLD_PREFIX_ASSUMPTION_REFUTED');
  assert.equal(r.prefixPatternObserved,false);
});

test('world A: forged micro reading refused against full server census',()=>{
  const t=game(2);
  t.micro_readout.stages[0].lit=true;
  t.micro_prediction_gte3=true;
  assert.throws(()=>decide(t),/MICRO_SENSOR_REFUTED_BY_FULL_CENSUS/);
});

test('world A: nonop observer disagreement refused',()=>{
  const t=game(2);
  t.states.fault.fresh_nonop.rows[0].lit=false;
  assert.throws(()=>decide(t),/FRESH_NONOP_DISAGREES_fault/);
});

test('world A: incomplete circuit repair is not a successful scientific result',()=>{
  const t=game(2);
  t.states.restored.server[6].lit=false;
  assert.throws(()=>decide(t),/NINE_LAMP_RESTORATION_NOT_VERIFIED/);
});

test('world A: never promote physical-world power or a different measurement target',()=>{
  const t=game(2);t.real_physical_environment_effect=true;
  assert.throws(()=>decide(t),/GAME_AUTHORITY_OR_EXECUTION_CLAIM/);
  const p=proposal();p.fault_x=-13;
  assert.throws(()=>checkGameTrace(p,game(2),meta),/INVALID_SOURCE_INSTRUMENT/);
});
