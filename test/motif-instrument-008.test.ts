import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifyCrossingEnvelope,verifyReceipt} from '../src/protocol.ts';
import {
  extractAuthenticatedPrior,composeNativeMinecraftExperiment,
  buildMinecraftDatapack,sealSyntheticQuest,SCHEMA,
} from '../experiments/motif-instrument-008/compose.mjs';
import {SOURCE_SHA256,verifyExistingCustodyBytes}
  from '../experiments/riff-raft-minecraft-007/custody-audit.mjs';

const sourcePath='fixtures/riff-raft-minecraft-006/signed-005-return.bundle.json';
const root=process.env.MOTIF_ROOT;
const source=()=>readFileSync(sourcePath);
const liveTestOptions={
  skip:!root&&'MOTIF_ROOT not supplied: use checkout of pinned public MOTIF-020',
};

test('008: previously witnessed Mojang results are re-authenticated before new sensor',async()=>{
  const audit=await verifyExistingCustodyBytes(source());
  assert.equal(audit.source_sha256,SOURCE_SHA256);
  assert.equal(audit.disposition,'HOLD');
  assert.deepEqual(extractAuthenticatedPrior(audit),[
    {world:'A',fault_x:-13,lit_count:3},
    {world:'A',fault_x:2,lit_count:5},
    {world:'B',fault_x:17,lit_count:6},
    {world:'B',fault_x:-28,lit_count:2},
  ]);
});

test('008: MOTIF actually selects new bounded fault measurement from signed game ancestry',
  liveTestOptions,async()=>{
  const out=await composeNativeMinecraftExperiment({motifRoot:root,sourceBytes:source()});
  assert.equal(out.state.schema,SCHEMA);
  assert.equal(out.state.parent_source_sha256,SOURCE_SHA256);
  assert.equal(out.decision.status,'PROPOSE_NEW_INSTRUMENT');
  assert.deepEqual(out.decision.selected.target,{
    world:'B',fault_x:-13,threshold:4,
    observation:'count-powered-redstone-lamps-of-nine',
  });
  assert.ok(out.decision.selected.expected_information_bits>0.7);
  assert.equal(out.state.automated_game_execution_occurred,false);
  assert.equal(out.state.pending_disposition,'R3_HOLD');
  assert.equal(out.state.physical_world_effect,false);
  assert.equal(out.state.new_world_admission,false);
  assert.equal(out.pack.files['pack.mcmeta'].includes('26.1.1'),false);
  assert.equal(out.pack.build_plan_sha256,out.state.world_plan_sha256);
});

test('008: MOTIF instrument compiles native redstone world + bounded observer commands',
  liveTestOptions,async()=>{
  const out=await composeNativeMinecraftExperiment({motifRoot:root,sourceBytes:source()});
  const f=out.pack.files;
  assert.equal(Object.keys(f).length,8);
  assert.match(f['data/motif020/function/setup.mcfunction'],
    /minecraft:repeater\[facing=west,delay=4\]/);
  assert.equal(f['data/motif020/function/fault.mcfunction'],
    'setblock -13 66 46 minecraft:air\n');
  assert.match(f['data/motif020/function/read_lamps.mcfunction'],
    /minecraft:redstone_lamp\[lit=true\]/);
  assert.equal(f['data/motif020/function/read_lamps.mcfunction']
    .split('minecraft:redstone_lamp[lit=true]').length-1,9);
  assert.match(f['data/motif020/function/repair.mcfunction'],/repeater/);
  assert.equal(out.pack.readback.actual_server_test_executed,false);
  assert.equal(out.pack.readback.prior_game_source_reused_as_new_observation,false);
});

test('008: generate distinct ephemeral reLATTE signed crossing + receiver-local HOLD',
  liveTestOptions,async()=>{
  const out=await composeNativeMinecraftExperiment({motifRoot:root,sourceBytes:source()});
  const signed=await sealSyntheticQuest(out.state);
  assert.equal(signed.schema,'relatte.motif-minecraft-instrument-signed-hold/v0');
  assert.equal(signed.receipt.kind,'R3_HOLD');
  assert.equal(signed.receipt.crossing_id,signed.crossing.crossing_id);
  assert.ok(signed.crossing.parents.includes(out.state.original_005_crossing));
  assert.ok(await verifyCrossingEnvelope(signed.crossing));
  assert.ok(await verifyReceipt(signed.receipt));
  assert.equal(signed.game_execution_verified,false);
  assert.equal(signed.admission,false);
});

test('008: a single altered byte in archived game history fails source verification',
  liveTestOptions,async()=>{
  const b=source();
  b[b.length-1]^=1;
  await assert.rejects(()=>composeNativeMinecraftExperiment({
    motifRoot:root,sourceBytes:b,
  }),/PINNED_SOURCE_BYTE_HASH_CHANGED/);
});

test('008: forged source status and unauthorized automatic actuation are refused',async()=>{
  assert.throws(()=>extractAuthenticatedPrior({
    schema:'relatte.riff-raft-007-local-custody-verification/v0',
    all_original_signatures_and_source_bytes_verified:true,
    source_sha256:SOURCE_SHA256,
    disposition:'ADMIT',admission:true,physical_actuation:false,
    observed_prior_and_next:{A:[3,5],B:[6,2]},
  }),/SOURCE_AUTHORITY/);
  await assert.rejects(()=>sealSyntheticQuest({
    schema:SCHEMA,automated_game_execution_occurred:true,
    remote_execution:false,pending_disposition:'R3_HOLD',
  }),/UNAPPROVED_AUTHORITY/);
});

test('008: Minecraft generator cannot build outside allowed repeater slots',async()=>{
  assert.throws(()=>buildMinecraftDatapack({},{
    schema:SCHEMA,target_world:'B',new_fault_repeater:{x:200},
  }),/UNSUPPORTED_GAME_TARGET/);
});
