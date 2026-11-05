import test from 'node:test';import assert from 'node:assert/strict';
import {checkHostileTrace} from '../experiments/motif-instrument-011/trace-verifier.mjs';
const positions=Array.from({length:9},(_,i)=>({x:-40+10*i,y:65,z:46}));
const cues=['READ_FIELD','LAY_BONES','CATCH_WATER','MAKE_SHADE','MAKE_GROUND','SEED_NUCLEUS','FEED_FIELD','WITNESS_DELTA','ONE_METER_OUTWARD'];
const prior=()=>({schema:'relatte.minecraft-010-minimal-sensor-proposal/v0',
 world:'A',world_seed:'381654729',fault_x:-28,threshold:3,stage_indexes:[2,3],
 complete_9_stage_census_mandatory:true,game_only:true,receiver_disposition:'R3_HOLD'});
const side=()=>({schema:'relatte.minecraft011.hostile-method-proposal/v0',
 world:'A',seed:'381654729',fault_x:-28,disposition:'R3_HOLD',physical_effect:false,
 side_power_position:{x:20,y:65,z:47,block:'minecraft:redstone_block'}});
const rows=bits=>bits.map((lit,i)=>({cue:cues[i],at:positions[i],lit}));
const client=(bits,user)=>({operator:false,independent_new_connection:true,username:user,
 rows:rows(bits).map(x=>({...x,name:'redstone_lamp'}))});
const data=(index=6)=>{
 const off=Array(9).fill(false),on=Array(9).fill(true);
 const fault=Array.from({length:9},(_,i)=>i<2||i===index);
 return {schema:'relatte.minecraft-010-game-trace/v0',world:'A',seed:'381654729',server_seed_observed:'381654729',
 fault_x:-28,instrument_proposal_crossing:'base',experiment_signed_instrument:'base',
 hostile_proposal_crossing:'relatte-crossing-v0:test',
 hostile_source:{x:20,y:65,z:47,block:'minecraft:redstone_block'},
 hostile_source_block_verified:true,injected_after_fault_before_micro:true,
 intervention_removed_before_restore:true,intervention_absent_after_restore:true,
 proposed_threshold:3,stations:cues.map((cue,i)=>({cue,at:positions[i]})),
 states:{initial:{server:rows(off)},fault:{server:rows(fault),fresh_nonop:client(fault,'fault011')},
 reset:{server:rows(off)},restored:{server:rows(on),fresh_nonop:client(on,'restore011')}},
 micro_readout:{sampled_before_full_census:true,stages:[2,3].map(i=>({
 index:i,position:positions[i],lit:fault[i]}))},
 micro_prediction_gte3:false,observed_fault_count:fault.filter(Boolean).length,
 observed_fault_class_gte3:fault.filter(Boolean).length>=3,
 author_disconnect_before_fresh_witness:true,nonoperator_chunk_keeper_is_distinct:true,
 actual_game_execution:true,real_physical_environment_effect:false,
 source_owner_admission:false,receiver_disposition:'R3_HOLD'};
};
const version={id:'26.1.1',server_sha1:'a'.repeat(40)};
test('controlled side power breaks assumed prefix while original two-lamp micro misses it',()=>{
 const r=checkHostileTrace(prior(),side(),data(),version);
 assert.equal(r.faultCount,3);assert.equal(r.inferredCount,2);
 assert.equal(r.original_micro_method_unsafe_if_nonprefix,true);
 assert.equal(r.source_conclusion,'HOLD_ORIGINAL_MEASUREMENT_METHOD_REFUTED_IN_THIS_GAME');
});
test('no fabricated counterexample if side source failed to produce out of prefix',()=>{
 const t=data(-1);const r=checkHostileTrace(prior(),side(),t,version);
 assert.equal(r.source_conclusion,'HOLD_FALSIFIER_DID_NOT_BREAK_PREFIX');
});
test('different side island is preserved rather than forced into expected outcome',()=>{
 const r=checkHostileTrace(prior(),side(),data(7),version);
 assert.equal(r.faultCount,3);assert.equal(r.original_micro_method_unsafe_if_nonprefix,true);
});
test('side redstone not present or not removed rejects game',()=>{
 for(const key of ['hostile_source_block_verified','intervention_removed_before_restore','intervention_absent_after_restore']){
 const t=data();t[key]=false;assert.throws(()=>checkHostileTrace(prior(),side(),t,version),/INTERVENTION_NOT_OBSERVED/);
 }
});
test('fresh independent game client disagreement rejects observation',()=>{
 const t=data();t.states.fault.fresh_nonop.rows[6].lit=false;
 assert.throws(()=>checkHostileTrace(prior(),side(),t,version),/FRESH_NONOP_DISAGREES_fault/);
});
test('do not sign repaired world if its circuit fails full reset',()=>{
 const t=data();t.states.restored.server[0].lit=false;
 assert.throws(()=>checkHostileTrace(prior(),side(),t,version),/NINE_LAMP_RESTORATION_NOT_VERIFIED/);
});
test('different side source or owner admission cannot be accepted as this game',()=>{
 const t=data();t.source_owner_admission=true;
 assert.throws(()=>checkHostileTrace(prior(),side(),t,version),/GAME_AUTHORITY_OR_EXECUTION_CLAIM/);
 const s=side();s.side_power_position.x=100;
 assert.throws(()=>checkHostileTrace(prior(),s,data(),version),/UNREVIEWED_INTERVENTION/);
});
