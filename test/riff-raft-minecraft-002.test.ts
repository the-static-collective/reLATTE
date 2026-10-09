import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import test from 'node:test';
import {generateP256KeyPair,verifyCrossingEnvelope,verifyReceipt} from '../src/protocol.ts';
import {
  makeCompositionInstanceSpec,openCompositionInstance,
  finalizeCompositionInstance,
} from '../experiments/composition-instance-001/contract.ts';
import {
  buildRiffRaftMinecraftPlan,
} from '../experiments/riff-raft-minecraft-001/terraform-grammar.mjs';
import {
  REDSTONE_CIRCUIT,buildRiffRaftRedstonePlan,
} from '../experiments/riff-raft-minecraft-002/redstone-grammar.mjs';
import {
  operationToCommand,validateWorldPlan,WORLD_BOUNDS,
} from '../experiments/vanilla-worldbuilder-006/world-grammar.mjs';
const provenance=()=>JSON.parse(readFileSync('fixtures/riff-raft-minecraft-001/donor-manifest.json','utf8'));
const args=()=>({goal:'MAKE GROUND IN A REHEARSAL WORLD',serverSeed:'381654729',provenance:provenance()});
const plan=()=>buildRiffRaftRedstonePlan(args());
const sha=(x:Buffer|string)=>createHash('sha256').update(x).digest('hex');

test('normative core frozen; changes isolated to experiments',()=>{
  assert.equal(execFileSync('git',['rev-parse','HEAD:src'],{encoding:'utf8'}).trim(),
    'c0e4d2c59481e0fb2a4bf4bb294f373907fd2b76');
});
test('redstone apparatus has nine verified symbol identities and a single explicit input',()=>{
  const p=plan();
  assert.equal(p.riff_raft_redstone.schema,'relatte.riff-raft-redstone-002/v0');
  assert.equal(p.riff_raft_redstone.stages.length,9);
  assert.deepEqual(p.riff_raft_redstone.stages.map(s=>s.sequence),[1,2,3,4,5,6,7,8,9]);
  assert.deepEqual(p.riff_raft_redstone.stages.map(s=>s.cue),p.riff_raft.stage_order);
  assert.equal(p.riff_raft_redstone.trigger.x,-43);
  assert.equal(p.riff_raft_redstone.trigger.z,46);
  assert.equal(p.riff_raft_redstone.status,'plan-only');
  assert.equal(p.riff_raft_redstone.auto_authorization,false);
  assert.equal(p.riff_raft_redstone.physical_field_evidence,false);
});
test('old nine-symbol station world and four generated districts stay identical',()=>{
  const before=buildRiffRaftMinecraftPlan(args());
  const after=plan();
  assert.deepEqual(after.operations.slice(0,before.operations.length),before.operations);
  assert.deepEqual(after.anchors,before.anchors);
  assert.deepEqual(after.districts,before.districts);
  assert.equal(after.riff_raft_redstone.parent_plan_sha256,before.plan_sha256);
});
test('vanilla redstone wire and repeaters have independent support and bounded command surface',()=>{
  const p=plan();
  const extras=p.operations.slice(buildRiffRaftMinecraftPlan(args()).operations.length);
  assert.equal(extras.length,21);
  assert.equal(extras[0].kind,'fill');
  assert.equal(extras[0].kind==='fill'?extras[0].block:null,'minecraft:stone_bricks');
  assert.equal(extras.filter(o=>o.kind==='setblock'&&o.block==='minecraft:redstone_lamp').length,9);
  assert.equal(extras.filter(o=>o.kind==='setblock'&&o.block==='minecraft:repeater[facing=east,delay=4]').length,5);
  assert.equal(extras.filter(o=>o.kind==='fill'&&o.block==='minecraft:redstone_wire').length,6);
  assert.equal(extras.some(o=>o.kind!=='summon'&&o.block==='minecraft:redstone_block'),false);
  for(const op of extras){
    assert.match(operationToCommand(op),/^\/(?:fill|setblock) /);
    const pts=op.kind==='fill'?[op.from,op.to]:[op.at];
    for(const pt of pts){
      assert.ok(pt.x>=WORLD_BOUNDS.minX&&pt.x<=WORLD_BOUNDS.maxX);
      assert.ok(pt.y>=WORLD_BOUNDS.minY&&pt.y<=WORLD_BOUNDS.maxY);
      assert.ok(pt.z>=WORLD_BOUNDS.minZ&&pt.z<=WORLD_BOUNDS.maxZ);
    }
  }
});
test('repeaters renew signal before 15-block propagation limit; break divides 3 and 6 lamps',()=>{
  const p=plan(),xs=p.riff_raft_redstone.repeaters;
  assert.deepEqual(xs,[-28,-13,2,17,32]);
  assert.equal(p.riff_raft_redstone.break_repeater.x,-13);
  assert.equal(p.riff_raft_redstone.stages.filter(s=>s.at.x< -13).length,3);
  assert.equal(p.riff_raft_redstone.stages.filter(s=>s.at.x> -13).length,6);
  assert.ok(xs.every((x,i)=>i===0?(x+43)<=15:x-xs[i-1]<=15));
});
test('seeds and goals replay deterministically but alter plan identity',()=>{
  assert.deepEqual(plan(),plan());
  assert.equal(validateWorldPlan(plan()),true);
  const changed=buildRiffRaftRedstonePlan({...args(),serverSeed:'21993'});
  assert.notEqual(changed.plan_sha256,plan().plan_sha256);
});
test('mutated redstone command cannot pass canonical plan integrity',()=>{
  const p=plan(),op=p.operations.at(-1);
  assert.ok(op&&op.kind==='setblock');
  if(op?.kind==='setblock')op.block='minecraft:command_block';
  assert.throws(()=>validateWorldPlan(p),/WORLDBUILDER_PLAN_HASH/);
});
test('donor cannot add a fake real-world or in-game permission',()=>{
  const a=args();
  a.provenance.claims.actual_minecraft_actions_executed=true;
  assert.throws(()=>buildRiffRaftRedstonePlan(a),/RIFF_RAFT_DONOR_CLAIM_PROMOTED/);
});
test('instance can authorize a world rehearsal without authorizing result or external world',async()=>{
  const p=plan();
  const spec=makeCompositionInstanceSpec({
    runtime_id:'minecraft-vanilla-worldbuilder-006',
    base_snapshot_ref:'minecraft-vanilla:26.1.1:simulated-test-snapshot',
    goal:p.goal,
    capabilities:['minecraft.operator','minecraft.creative',
      'minecraft.command.fill','minecraft.command.setblock',
      'minecraft.riff-raft.terraformer','minecraft.riff-raft.redstone-causality'],
    limits:{command_surface:['fill','setblock'],
      trigger:'/setblock -43 66 46 minecraft:redstone_block',
      external_actuation:false,forced_disposition:'R3_HOLD'},
    observer_mode:'fresh-non-op-protocol-client',
    requested_output_class:'minecraft-authored-world-state',
    normative_src_tree:'c0e4d2c59481e0fb2a4bf4bb294f373907fd2b76',
  });
  const opened=await openCompositionInstance({spec,
    signer:await generateP256KeyPair(),receiver:await generateP256KeyPair(),
    hop_index:40});
  assert.equal(opened.launch.receipt.kind,'R3_ADMIT');
  assert.equal(await verifyCrossingEnvelope(opened.launch.crossing),true);
  const virtualBits=[false,false,false,false,false,false,false,false,false];
  const observed=sha(Buffer.from(JSON.stringify({
    vanilla_field_sha:'a'.repeat(64),lamps:virtualBits})));
  const candidate=await finalizeCompositionInstance({
    opened,spec,
    runtime_evidence:{
      runtime_id:spec.runtime_id,
      author_session_id:'minecraft-operator-a',
      observer_session_id:'minecraft-fresh-nonop-b',
      observed_state_ref:'sha256:'+observed,
      observed_state_sha256:observed,
      action_trace_ref:'sha256:'+'b'.repeat(64),
      claims:{unit_test_only:true,verified_minecraft_execution:false,
        verified_physical_ecology:false},
    },
    candidate_bytes:Buffer.from('held synthetic plan; not an actual vanilla world'),
    signer:await generateP256KeyPair(),receiver:await generateP256KeyPair(),
    hop_index:41,
  });
  assert.equal(candidate.candidate.receipt.kind,'R3_HOLD');
  assert.deepEqual(candidate.candidate.crossing.parents,[opened.launch.crossing.crossing_id]);
  assert.equal(await verifyReceipt(candidate.candidate.receipt),true);
});
test('source fixture remains exactly the pinned GHoT experiment',()=>{
  assert.equal(provenance().source_commit,'a63624f1be6a533f5ab927b1e4e8b1a629f1ba53');
  assert.equal(REDSTONE_CIRCUIT.physical_field_evidence,false);
});
