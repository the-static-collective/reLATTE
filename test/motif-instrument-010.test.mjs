import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {verifyCrossingEnvelope,verifyReceipt}
  from '../src/protocol.ts';
import {composeNewMicroInstrument} from '../experiments/motif-instrument-010/compose.mjs';

const archive=()=>readFileSync('fixtures/riff-raft-minecraft-006/signed-005-return.bundle.json');
const game=()=>readFileSync(process.env.MOTIF_009_GAME_SOURCE||
  'work/seed009/signed-game-result.json');
const root=process.env.MOTIF_ROOT;
const gate={skip:!root?'MOTIF_ROOT missing: use pinned MOTIF-022 source checkout':false};

test('010: source-authenticated actual game009 yields cheaper two-lamp A:-28 experiment',gate,async()=>{
  const x=await composeNewMicroInstrument({
    game009Bytes:game(),originalArchiveBytes:archive(),motifRoot:root,
  });
  assert.equal(x.decision.status,'PROPOSE_MINIMAL_CAUSAL_WITNESS');
  assert.equal(x.proposal.world,'A');
  assert.equal(x.proposal.fault_x,-28);
  assert.deepEqual(x.proposal.stage_indexes,[2,3]);
  assert.equal(x.proposal.estimated_compressed_cost_units <
    x.proposal.estimated_legacy_cost_units,true);
  assert.equal(x.proposal.estimated_compressed_cost_units<=4,true);
  assert.equal(x.proposal.complete_9_stage_census_mandatory,true);
  assert.equal(x.proposal.game_server_not_yet_run,true);
  assert.equal(x.proposal.source_009_prefix_observed_not_proven_universal,true);
  assert.equal(x.signed.receipt.kind,'R3_HOLD');
  assert.equal(await verifyCrossingEnvelope(x.signed.crossing),true);
  assert.equal(await verifyReceipt(x.signed.receipt),true);
  assert.deepEqual(x.signed.crossing.parents,[x.proposal.source_game_crossing]);
});

test('010: native redstone grammar makes actual Minecraft functions for predicted target',gate,async()=>{
  const x=await composeNewMicroInstrument({
    game009Bytes:game(),originalArchiveBytes:archive(),motifRoot:root,
  });
  assert.equal(Object.keys(x.files).length,9);
  assert.equal(x.files['data/motif022/function/fault.mcfunction'],
    'setblock -28 66 46 minecraft:air\n');
  const lines=x.files['data/motif022/function/read_micro.mcfunction'];
  assert.match(lines,/execute if block -20 65 46 minecraft:redstone_lamp\[lit=true\]/);
  assert.match(lines,/execute if block -10 65 46 minecraft:redstone_lamp\[lit=true\]/);
  assert.equal(lines.match(/minecraft:redstone_lamp\[lit=true\]/g).length,2);
  const full=x.files['data/motif022/function/read_lamps.mcfunction'];
  assert.equal(full.match(/minecraft:redstone_lamp\[lit=true\]/g).length,9);
  assert.ok(x.plan.riff_raft_redstone.repeaters.includes(-28));
});

test('010: altered P256 game source never becomes a new Minecraft proposal',gate,async()=>{
  const bad=Buffer.from(game());
  bad[bad.length-2]^=1;
  await assert.rejects(
    composeNewMicroInstrument({game009Bytes:bad,originalArchiveBytes:archive(),
      motifRoot:root}),
    /REPLAY_|JSON|SYNTAX|RESULT_|INVALID/i);
});

test('010: game-only proposal has no MEMENTO ledger, resource or owner authority',gate,async()=>{
  const x=await composeNewMicroInstrument({
    game009Bytes:game(),originalArchiveBytes:archive(),motifRoot:root,
  });
  assert.equal(x.proposal.game_only,true);
  assert.equal(x.proposal.automatic_game_actuation,false);
  assert.equal(x.proposal.physical_ecological_claim,false);
  assert.equal(x.proposal.receiver_disposition,'R3_HOLD');
  assert.equal(x.signed.game_execution_claimed,false);
});
