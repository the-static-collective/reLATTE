import assert from 'node:assert/strict';
import test from 'node:test';
import {verifyCrossingEnvelope,verifyReceipt} from '../src/protocol.ts';
import {questDigest,validateQuest,questScenario,GHOT_004_COMMIT,
  type TerraformQuest} from '../experiments/riff-raft-minecraft-004/quest-grammar.mjs';
import {assemblePair,emitSignedReturn,SCHEMA,BUNDLE_SCHEMA} from
  '../experiments/riff-raft-minecraft-004/dynamic-replay.mjs';

const STAGES=['READ_FIELD','LAY_BONES','CATCH_WATER','MAKE_SHADE','MAKE_GROUND',
  'SEED_NUCLEUS','FEED_FIELD','WITNESS_DELTA','ONE_METER_OUTWARD'];
function quest(id:'A'|'B'):TerraformQuest{
  const s=questScenario(id);
  assert.ok(s);
  const b={
    schema:'ghot.riff-raft-terraform-quest/v0' as const,
    source_project:'the-static-collective/GHoT',
    source_donor_commit:'a63624f1be6a533f5ab927b1e4e8b1a629f1ba53',
    mode:'synthetic-game-proposal-only',world_id:id,world_seed:s.seed,
    selection:'explicit-scenario-proposal',priority:s.priority,question:s.question,
    intervention:'remove-one-redstone-repeater-then-restore',
    fault_repeater_position:{x:s.fault,y:66,z:46},
    expected_lit_during_fault:STAGES.map((_,i)=>i<s.count),
    expected_lit_initial:STAGES.map(()=>false),
    expected_lit_reset:STAGES.map(()=>false),
    expected_lit_repaired:STAGES.map(()=>true),
    station_labels:STAGES,sandbox:'official-vanilla-minecraft-localhost',
    operator_must_select:true as const,simulator_can_trigger:false as const,
    game_execution_observed:false as const,
    actual_soil_change_verified:false as const,
    ghot_resource_transfer:false as const,owner_admission:false as const,
    authority_effect:'none' as const,
  };
  return {...b,quest_sha256:questDigest(b as TerraformQuest)};
}
test('RIFF-RAFT-004: two distinct source-licensed quests and causal expectations',()=>{
  const a=quest('A'),b=quest('B');
  assert.equal(validateQuest(a,'A','381654729'),a);
  assert.equal(validateQuest(b,'B','918273645'),b);
  assert.equal(a.expected_lit_during_fault.filter(Boolean).length,3);
  assert.equal(b.expected_lit_during_fault.filter(Boolean).length,6);
  assert.equal(a.fault_repeater_position.x,-13);
  assert.equal(b.fault_repeater_position.x,17);
  assert.notEqual(a.quest_sha256,b.quest_sha256);
  assert.equal(GHOT_004_COMMIT,'9aee07370ffb4ace0fcfaffb840359dc8797c0f0');
});
test('RIFF-RAFT-004: GHoT source proposal cannot change world or scenario',()=>{
  assert.throws(()=>validateQuest(quest('A'),'B','918273645'),/WORLD_OR_PRIORITY_CHANGED/);
  assert.throws(()=>validateQuest(quest('B'),'A','381654729'),/WORLD_OR_PRIORITY_CHANGED/);
});
test('RIFF-RAFT-004: tampering manifest hash refuses',()=>{
  const a=quest('A');
  a.quest_sha256='f'.repeat(64);
  assert.throws(()=>validateQuest(a,'A','381654729'),/HASH_CHANGED/);
});
test('RIFF-RAFT-004: extra executable commands refuse',()=>{
  const a=quest('A') as TerraformQuest & {command?:string};
  a.command='/give @p command_block';
  assert.throws(()=>validateQuest(a,'A','381654729'),/FIELDS_CHANGED/);
});
test('RIFF-RAFT-004: changing physical-world claim or fault location refuses',()=>{
  const a=quest('A');
  (a as unknown as {actual_soil_change_verified:boolean}).actual_soil_change_verified=true;
  assert.throws(()=>validateQuest(a,'A','381654729'),/AUTHORITY_SMUGGLED/);
  const b=quest('B');
  b.fault_repeater_position.x=-13;
  assert.throws(()=>validateQuest(b,'B','918273645'),/INTERVENTION_CHANGED/);
});
test('RIFF-RAFT-004: forged shorthand cannot stand in for two full signed worlds',async()=>{
  await assert.rejects(()=>assemblePair([]),/EXPECTED_TWO_WORLDS/);
  await assert.rejects(()=>assemblePair([
    {world_id:'A',composition_bytes:Buffer.from('{}'),runtime_bytes:Buffer.from('{}')},
    {world_id:'B',composition_bytes:Buffer.from('{}'),runtime_bytes:Buffer.from('{}')},
  ]),/BAD_INSTANCE_EVIDENCE/);
});
test('RIFF-RAFT-004: recipient-local signed HOLD never admits any GHoT organ',async()=>{
  const fake={schema:SCHEMA,worlds:[{instance_id:'fixture:A'},{instance_id:'fixture:B'}],
    owner_admission:false,biological_restoration_verified:false};
  const result=await emitSignedReturn(fake,{});
  assert.equal(result.schema,BUNDLE_SCHEMA);
  assert.equal(result.receipt.kind,'R3_HOLD');
  assert.equal(await verifyCrossingEnvelope(result.crossing),true);
  assert.equal(await verifyReceipt(result.receipt),true);
  assert.equal(result.crossing.requested_effect.authority,'receiver-local');
});
