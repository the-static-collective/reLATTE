import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { execFileSync } from 'node:child_process';

import { generateP256KeyPair, verifyCrossingEnvelope, verifyReceipt } from '../src/protocol.ts';
import {
  makeObservation, makePolyglotHop, verifyHopBinding,
} from '../experiments/polyglot-crossing-001/common.ts';
import {
  makeCompositionInstanceSpec, openCompositionInstance,
} from '../experiments/composition-instance-001/contract.ts';
import {
  buildWorldPlan, operationToCommand, validateWorldPlan, WORLD_BOUNDS,
} from '../experiments/vanilla-worldbuilder-006/world-grammar.mjs';
import {
  RIFF_RAFT_GHOT_COMMIT, RIFF_RAFT_STAGES,
  validateGhotProvenance, buildRiffRaftMinecraftPlan,
  type GhotRiffRaftProvenance,
} from '../experiments/riff-raft-minecraft-001/terraform-grammar.mjs';

const manifestPath = 'fixtures/riff-raft-minecraft-001/donor-manifest.json';
const manifest = (): GhotRiffRaftProvenance =>
  JSON.parse(readFileSync(manifestPath, 'utf8')) as GhotRiffRaftProvenance;
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const fixture = (seed='381654729') =>
  buildRiffRaftMinecraftPlan({goal:'MAKE GROUND IN A REHEARSAL WORLD',serverSeed:seed,provenance:manifest()});
const FROZEN_SRC_TREE = 'c0e4d2c59481e0fb2a4bf4bb294f373907fd2b76';

test('RIFF-RAFT-MINECRAFT-001: normative reLATTE source tree unchanged', () => {
  assert.equal(execFileSync('git', ['rev-parse','HEAD:src'], {encoding:'utf8'}).trim(), FROZEN_SRC_TREE);
});

test('GHoT donor pins exact referenced Riff-Raft-002 branch head, not false signed receipts', () => {
  const m = manifest();
  assert.equal(validateGhotProvenance(m), true);
  assert.equal(m.source_commit, RIFF_RAFT_GHOT_COMMIT);
  assert.equal(m.witness_class, 'ghot-simulation-manifest-only');
  assert.ok(Object.values(m.claims).every(x => x === false));
  assert.deepEqual(m.stages, [...RIFF_RAFT_STAGES]);
});

test('pin drift and altered stage order must refuse', () => {
  const m = manifest();
  m.source_commit = '0'.repeat(40);
  assert.throws(() => validateGhotProvenance(m), /DONOR_PIN_INVALID/);
  const n = manifest();
  n.stages = [...n.stages].reverse();
  assert.throws(() => validateGhotProvenance(n), /DONOR_STAGES_CHANGED/);
});

test('fictitious independent physical witness and GHoT signatures cannot enter donor', () => {
  for (const field of Object.keys(manifest().claims) as (keyof GhotRiffRaftProvenance['claims'])[]) {
    const m = manifest();
    (m.claims as Record<string,unknown>)[field] = true;
    assert.throws(() => validateGhotProvenance(m), /DONOR_CLAIM_PROMOTED/);
  }
});

test('unexpected operation templates in donor cannot gain command authority', () => {
  const m = manifest() as unknown as Record<string,unknown>;
  m.commands = ['/op malicious'];
  assert.throws(
    () => buildRiffRaftMinecraftPlan({
      goal:'MAKE GROUND',serverSeed:'1',
      provenance: m as unknown as GhotRiffRaftProvenance,
    }),
    /DONOR_FIELDS_CHANGED/,
  );
});

test('same donor and seed yields exactly same nine-station plan', () => {
  const a=fixture(), b=fixture();
  assert.deepEqual(a,b);
  assert.equal(validateWorldPlan(a),true);
  assert.equal(a.riff_raft.stations.length,9);
  assert.deepEqual(a.riff_raft.stage_order,[...RIFF_RAFT_STAGES]);
  assert.equal(a.riff_raft.default_candidate_disposition,'R3_HOLD');
  assert.equal(a.riff_raft.actual_minecraft_execution_observed,false);
  assert.equal(a.riff_raft.actual_ghot_execution_observed,false);
});

test('new donor seed changes authored world but not canonical stage order', () => {
  const a=fixture('17'),b=fixture('19');
  assert.notEqual(a.plan_sha256,b.plan_sha256);
  assert.deepEqual(a.riff_raft.stations,b.riff_raft.stations);
});

test('adding nine stations does not corrupt the existing worldbuilder districts', () => {
  const original=buildWorldPlan({goal:'MAKE GROUND IN A REHEARSAL WORLD',serverSeed:'381654729'});
  const modified=fixture();
  assert.deepEqual(modified.districts,original.districts);
  assert.deepEqual(modified.palette,original.palette);
  assert.deepEqual(modified.operations.slice(0,original.operations.length),original.operations);
  assert.deepEqual(modified.anchors.slice(0,original.anchors.length),original.anchors);
  assert.ok(modified.operations.length > original.operations.length);
});

test('vanilla command surface bounded, nine stations inside world coordinates', () => {
  const p=fixture();
  for(const op of p.operations){
    const command=operationToCommand(op);
    assert.match(command,/^\/(?:fill|setblock|summon) /);
  }
  for(const station of p.riff_raft.stations){
    assert.ok(station.at.x>=WORLD_BOUNDS.minX&&station.at.x<=WORLD_BOUNDS.maxX);
    assert.ok(station.at.y>=WORLD_BOUNDS.minY&&station.at.y<=WORLD_BOUNDS.maxY);
    assert.ok(station.at.z>=WORLD_BOUNDS.minZ&&station.at.z<=WORLD_BOUNDS.maxZ);
    assert.ok(p.anchors.some(a=>a.block===station.expected_block&&
      a.at.x===station.at.x&&a.at.y===station.at.y&&a.at.z===station.at.z));
    assert.equal(station.ghot_receipt_attached,false);
    assert.equal(station.physical_causality_claimed,false);
  }
});

test('station order and morphology show a symbolic chain, never claim redstone automation',()=>{
  const p=fixture();
  assert.deepEqual(p.riff_raft.stations.map(s=>s.sequence),[1,2,3,4,5,6,7,8,9]);
  assert.equal(p.riff_raft.stations[0].expected_block,'minecraft:note_block');
  assert.equal(p.riff_raft.stations[2].expected_block,'minecraft:blue_stained_glass');
  assert.equal(p.riff_raft.stations[5].expected_block,'minecraft:oak_sapling');
  assert.equal(p.riff_raft.stations[8].expected_block,'minecraft:amethyst_block');
  assert.equal(p.riff_raft.created_as,'world-authoring-intent-not-execution');
});

test('schema digest catches arbitrary block replacement in plan',()=>{
  const p=fixture();
  p.operations[p.operations.length-1]!.block='minecraft:command_block';
  assert.throws(()=>validateWorldPlan(p),/WORLDBUILDER_PLAN_HASH/);
});

test('signed reLATTE donor INTENT arrives on HOLD, not as Minecraft observation',async()=>{
  const bytes=Buffer.from(readFileSync(manifestPath));
  const observation=makeObservation(
    'composition-instance',
    'ghot-riff-raft:terraformer-simulation-manifest:'+sha(bytes),
    bytes,
    'application/vnd.ghot.riff-raft-manifest+json',
    {
      witness_class:'source-document-and-stages-only',
      minecraft_runtime_executed:false,
      donor_commit:RIFF_RAFT_GHOT_COMMIT,
      authority:'no-execution-authorized',
    },
  );
  const hop=await makePolyglotHop({
    observation,
    signer:await generateP256KeyPair(),
    receiver:await generateP256KeyPair(),
    parent_crossing_id:null,
    disposition:'R3_HOLD',
    hop_index:42,
  });
  verifyHopBinding(hop,bytes);
  assert.equal(await verifyCrossingEnvelope(hop.crossing),true);
  assert.equal(await verifyReceipt(hop.receipt),true);
  assert.equal(hop.receipt.kind,'R3_HOLD');
  assert.equal(hop.crossing.payload_refs[0].address,'sha256:'+sha(bytes));
});

test('Minecraft composition INSTANCE admission does not admit the authored result',async()=>{
  const p=fixture();
  const spec=makeCompositionInstanceSpec({
    runtime_id:'minecraft-vanilla-worldbuilder-006',
    base_snapshot_ref:'minecraft-vanilla:26.1.1:jar-sha1:server-pending:seed:381654729',
    goal:p.goal,
    inputs:[{
      particular_ref:'ghot:riff-raft-002:simulation',
      content_ref:'sha256:'+p.riff_raft.source_manifest_sha256,
      role:'operator-selected-terraformer-rehearsal',
    }],
    capabilities:[
      'minecraft.riff-raft.terraformer',
      'minecraft.operator','minecraft.creative',
      'minecraft.command.fill','minecraft.command.setblock',
    ],
    limits:{
      command_surface:['fill','setblock'],
      output_disposition:'R3_HOLD',
      physical_effects:false,
      world_bounds:WORLD_BOUNDS,
    },
    observer_mode:'fresh-non-op-protocol-client',
    requested_output_class:'minecraft-authored-world-state',
    normative_src_tree:FROZEN_SRC_TREE,
    extensions:{ghot_donor_commit:RIFF_RAFT_GHOT_COMMIT},
  });
  const opened=await openCompositionInstance({
    spec,signer:await generateP256KeyPair(),
    receiver:await generateP256KeyPair(),hop_index:43,
  });
  assert.equal(opened.launch.receipt.kind,'R3_ADMIT');
  assert.equal(await verifyCrossingEnvelope(opened.launch.crossing),true);
  assert.equal(await verifyReceipt(opened.launch.receipt),true);
  assert.equal(spec.observer_policy.require_distinct_session,true);
  assert.equal(spec.requested_output_class,'minecraft-authored-world-state');
  assert.ok(opened.instance_id.startsWith('composition-instance-v0:'));
});

test('multiple synthetically distinct donor contents preserve differing identities',()=>{
  const a=fixture();
  const m=manifest();
  // Even if only re-ordering JSON (without changing meaning), the donor byte
  // digest is byte-precise; do not silently substitute raw donor bytes.
  const first=Buffer.from(JSON.stringify(m));
  const second=Buffer.from(JSON.stringify(m,null,2));
  assert.notEqual(sha(first),sha(second));
  assert.equal(a.riff_raft.source_commit,RIFF_RAFT_GHOT_COMMIT);
});
