import test from 'node:test';
import assert from 'node:assert/strict';
import {FORMAT,HASH,validateEvidence,compareEvidence} from '../src/verify.mjs';
const make=(engine,instance)=>{
  const minecraft=engine==='minecraft-java-26.1.1';
  const base=instance==='alpha'?'minecraft:moss_block':'minecraft:cut_copper';
  return {format:FORMAT,source_sha256:HASH,engine,instance,
    seed:instance==='alpha'?'381654729':'918273645',
    engine_version:minecraft?'26.1.1':'4.4.1',
    observer:minecraft?'WFWatch'+instance:'GodotSnapshotReader',
    observer_class:minecraft?'NON_OP_SEPARATE_PROCESS_PROTOCOL_CLIENT':'FRESH_PROCESS_SERIALIZED_SCENE_READ',
    observer_unprivileged:true,
    observations:[{stage:'build',block:base},{stage:'impact',block:'minecraft:polished_blackstone'},{stage:'repair',block:base}],
    actions:['BUILD','IMPACT','REPAIR'],artifact_digests:['a'.repeat(64),'b'.repeat(64),'c'.repeat(64)],
    receiver:'HOLD',signature:null};
};
const all=()=>['minecraft-java-26.1.1','godot-4.4.1'].flatMap(engine=>['alpha','beta'].map(w=>make(engine,w)));
test('valid bounded comparison remains HOLD',()=>{const r=compareEvidence(all());assert.equal(r.bounded_three_stage_visual_state_parity,true);assert.equal(r.receiver,'HOLD');assert.equal(r.portable_skill_reproduction_verified,false)});
test('reject forged witness class',()=>{const e=make('minecraft-java-26.1.1','alpha');e.observer_class='AUTHOR_OPERATOR_RCON_CI';assert.throws(()=>validateEvidence(e))});
test('reject final-only success',()=>{const e=make('godot-4.4.1','beta');e.observations.splice(1,1);assert.throws(()=>validateEvidence(e))});
test('reject false impact',()=>{const e=make('minecraft-java-26.1.1','alpha');e.observations[1].block=e.observations[0].block;assert.throws(()=>validateEvidence(e))});
test('reject forged admission',()=>{const e=make('godot-4.4.1','beta');e.receiver='ADMIT';assert.throws(()=>validateEvidence(e))});
test('reject purported signature',()=>{const e=make('godot-4.4.1','beta');e.signature='signed';assert.throws(()=>validateEvidence(e))});
test('reject unknown field',()=>{const e=make('minecraft-java-26.1.1','alpha');e.claims_human_truth=true;assert.throws(()=>validateEvidence(e))});
test('reject wrong source hash',()=>{const e=make('minecraft-java-26.1.1','alpha');e.source_sha256='f'.repeat(64);assert.throws(()=>validateEvidence(e))});
test('reject wrong seed',()=>{const e=make('minecraft-java-26.1.1','alpha');e.seed='918273645';assert.throws(()=>validateEvidence(e))});
test('reject duplicate worlds as independent',()=>{const x=all();x[3]=x[2];assert.throws(()=>compareEvidence(x))});
test('reject missing world',()=>{const x=all().slice(0,3);assert.throws(()=>compareEvidence(x))});
test('reject privileged observer',()=>{const e=make('minecraft-java-26.1.1','alpha');e.observer_unprivileged=false;assert.throws(()=>validateEvidence(e))});
test('reject malformed raw digests',()=>{const e=make('godot-4.4.1','alpha');e.artifact_digests[1]='aaa';assert.throws(()=>validateEvidence(e))});
test('reject skipped repair',()=>{const e=make('godot-4.4.1','alpha');e.actions=['BUILD','IMPACT'];assert.throws(()=>validateEvidence(e))});
