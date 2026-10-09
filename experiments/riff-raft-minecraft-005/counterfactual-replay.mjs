import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {generateP256KeyPair,verifyCrossingEnvelope,verifyReceipt} from '../../src/protocol.ts';
import {compositionInstanceId} from '../composition-instance-001/contract.ts';
import {makeObservation,makePolyglotHop,verifyHopBinding} from '../polyglot-crossing-001/common.ts';
import {RIFF_RAFT_STAGES,RIFF_RAFT_GHOT_COMMIT} from '../riff-raft-minecraft-001/terraform-grammar.mjs';
import {validateCounterfactualQuest,GHOT_005_COMMIT,RETURN_SCHEMA,
  BUNDLE_SCHEMA as QUEST_BUNDLE_SCHEMA,SOURCE_CROSSING,SOURCE_RECEIPT,SOURCE_PACKET}
  from '../riff-raft-minecraft-005/counterfactual-grammar.mjs';

const sha=(v)=>createHash('sha256').update(v).digest('hex');
const demand=(condition,message)=>{if(!condition)throw Error('TWO_WORLD_'+message);};
const isHash=(x)=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const states=(x)=>Array.isArray(x)&&x.length===9&&x.every(y=>typeof y?.lit==='boolean'&&typeof y?.cue==='string')?x.map(y=>y.lit):null;
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const OFF=Array(9).fill(false),ON=Array(9).fill(true),BROKEN=[...Array(3).fill(true),...Array(6).fill(false)];
export const SCHEMA=RETURN_SCHEMA;
export const BUNDLE_SCHEMA=QUEST_BUNDLE_SCHEMA;
export const REQUIRED_GOAL='MAKE GROUND IN A REHEARSAL WORLD';

async function validSigned(crossing,receipt,payload){
  demand(!!crossing&&!!receipt,'MISSING_RELATTE_SIGNATURE');
  demand(await verifyCrossingEnvelope(crossing),'INVALID_CROSSING');
  demand(await verifyReceipt(receipt),'INVALID_RECEIPT');
  demand(receipt.crossing_id===crossing.crossing_id,'WRONG_RECEIPT_PARENT');
  demand(crossing.payload_refs?.length===1 &&
    crossing.payload_refs[0].address==='sha256:'+sha(payload),
    'CROSSING_PAYLOAD_NOT_BOUND');
}
async function parseOne(worldId,compBytes,runtimeBytes){
  demand(worldId==='A'||worldId==='B','BAD_WORLD_ID');
  const e=JSON.parse(compBytes.toString('utf8')),r=JSON.parse(runtimeBytes.toString('utf8'));
  demand(e.schema==='relatte.composition-instance-001-evidence/v0','BAD_INSTANCE_EVIDENCE');
  demand(r.schema==='relatte.vanilla-worldbuilder-006-evidence/v0','BAD_MINECRAFT_EVIDENCE');
  demand(e.spec?.goal===REQUIRED_GOAL&&r.goal===REQUIRED_GOAL,'WRONG_GOAL');
  demand(e.spec?.runtime_id==='minecraft-vanilla-worldbuilder-006','WRONG_RUNTIME');
  demand(e.spec?.extensions?.riff_raft_redstone_mode==='operator-triggered-game-only','NOT_REDSTONE_RUNTIME');
  demand(e.spec?.extensions?.fault_control===true,'FAULT_CONTROL_NOT_REQUESTED');
  demand(e.spec?.extensions?.riff_raft_two_world_label===worldId &&
    e.spec?.extensions?.riff_raft_two_world_replay===true,'WORLD_ID_NOT_IN_INSTANCE');
  demand(e.spec?.governing_snapshot?.normative_src_tree===
    'c0e4d2c59481e0fb2a4bf4bb294f373907fd2b76','FROZEN_CORE_MISMATCH');
  demand(e.spec?.base_snapshot_ref?.includes('seed:'+String(r.server_seed)),'SEED_SNAPSHOT_MISMATCH');
  demand(e.instance_id===compositionInstanceId(e.spec),'INSTANCE_ID_MISMATCH');
  demand(e.launch?.receipt?.kind==='R3_ADMIT' &&
    e.candidate?.receipt?.kind==='R3_HOLD' &&
    e.result?.result_disposition==='R3_HOLD','UNLAWFUL_DISPOSITION');
  await validSigned(e.launch.crossing,e.launch.receipt,
    Buffer.from(JSON.stringify(e.spec),'utf8'));
  await validSigned(e.candidate.crossing,e.candidate.receipt,
    Buffer.from(JSON.stringify(e.result),'utf8'));
  demand(e.candidate.crossing.parents?.length===1 &&
    e.candidate.crossing.parents[0]===e.launch.crossing.crossing_id &&
    e.result.launch_crossing_id===e.launch.crossing.crossing_id,
    'CANDIDATE_NOT_CHILD_OF_INSTANCE');
  demand(e.result.instance_id===e.instance_id &&
    e.result.runtime_id===e.spec.runtime_id,'RUNTIME_IDENTITY_CHANGED');
  demand(e.result.author_session_id!==e.result.observer_session_id &&
    e.result.author_session_id===e.runtime.author_session_id &&
    e.result.observer_session_id===e.runtime.observer_session_id,
    'MISSING_FRESH_OBSERVER');
  demand(e.result.runtime_claims?.riff_raft_game_and_field_conflation===false &&
    e.result.runtime_claims?.real_soil_fertility_verified===false &&
    e.result.runtime_claims?.living_ecosystem_terraforming_verified===false &&
    e.result.runtime_claims?.ghot_python_simulation_executed_here===false,
    'PHYSICAL_OR_GHOT_CONFLATION');
  demand(r.version?.server_sha1===e.spec.extensions.server_jar_sha1 &&
    r.version?.id==='26.1.1' &&
    r.version?.server_sha1?.length===40,'VERSION_NOT_PINNED');
  demand(r.plan?.riff_raft?.source_commit===RIFF_RAFT_GHOT_COMMIT &&
    r.plan?.riff_raft_redstone?.schema==='relatte.riff-raft-redstone-002/v0' &&
    r.plan?.riff_raft_redstone?.stages?.length===9,'DONOR_OR_CHAIN_MISMATCH');
  demand(equal(r.plan.riff_raft_redstone.stages.map(s=>s.cue),RIFF_RAFT_STAGES),
    'STAGE_ORDER_DRIFT');
  const p=r.redstone;
  demand(p?.schema==='relatte.riff-raft-redstone-execution/v0' &&
    p.stage_count===9 && p.redstone_circuit_actuated_in_game===true &&
    p.physical_field_improvement_verified===false &&
    p.ghot_resource_moved===false,'REDSTONE_CLAIMS_INVALID');
  const a=states(p.original_unpowered_states),b=states(p.broken_link_trial),
        reset=states(p.reset_states),final=states(p.powered_states);
  const actualQuest=p?.dynamic_quest;
  const quest=validateCounterfactualQuest(actualQuest?.proposal,worldId,r.server_seed);
  demand(actualQuest.source_ghot_proposer_commit===GHOT_005_COMMIT &&
    actualQuest.actual_game_fault_observed===true &&
    actualQuest.physical_ecological_effect===false &&
    actualQuest.automatic_authority===false &&
    equal(actualQuest.selected_fault_position,quest.fault_repeater_position),
    'DYNAMIC_QUEST_NOT_IN_EXECUTION');
  demand(e.spec.extensions.riff_raft_dynamic_quest===
      'observed-counterfactual-game-only' &&
    e.spec.extensions.riff_raft_quest_sha256===quest.quest_sha256 &&
    e.spec.extensions.riff_raft_quest_priority===quest.policy &&
    e.spec.extensions.riff_raft_ghot_proposer_commit===GHOT_005_COMMIT &&
    e.result.runtime_claims.riff_raft_dynamic_quest_sha256===quest.quest_sha256 &&
    e.result.runtime_claims.riff_raft_dynamic_quest_priority===quest.policy &&
    e.result.runtime_claims.riff_raft_dynamic_source_ghot_commit===GHOT_005_COMMIT &&
    e.result.runtime_claims.riff_raft_dynamic_broken_lamps===
      quest.expected_lit_during_fault.filter(Boolean).length,
    'QUEST_NOT_BOUND_TO_ADMITTED_INSTANCE_AND_RESULT');
  demand(equal(a,OFF)&&equal(b,quest.expected_lit_during_fault)&&
    equal(reset,OFF)&&equal(final,ON),'QUEST_CAUSAL_TRACE_MISMATCH');
  for(const state of [p.original_unpowered_states,p.broken_link_trial,
                      p.reset_states,p.powered_states]){
    demand(equal(state.map(x=>x.cue),RIFF_RAFT_STAGES),'CAUSAL_STAGE_ORDER');
  }
  demand(p.final_observer?.independent_fresh_client===true &&
    p.final_observer?.physical_field_evidence===false &&
    p.final_observer?.observer===r.bot?.fresh_observer_username &&
    p.final_observer?.observer!==r.bot?.username &&
    p.final_observer.stages?.length===9 &&
    p.final_observer.stages.every(x=>x.observer_name==='redstone_lamp'&&
      x.observer_properties?.lit===true&&x.server_lit===true),
      'FINAL_FRESH_OBSERVER_MISMATCH');
  demand(p.final_observer.observed_state_sha256===
    sha(Buffer.from(JSON.stringify(p.final_observer.stages),'utf8')),
    'OBSERVER_DIGEST_MISMATCH');
  const composite=sha(Buffer.from(JSON.stringify({
    vanilla_block_field_sha256:r.scan?.field_sha256,
    independently_observed_redstone_state_sha256:
      p.final_observer.observed_state_sha256,
  }),'utf8'));
  demand(isHash(r.scan?.field_sha256) &&
    composite===e.result.observed_state_sha256 &&
    composite===e.runtime.observed_state_sha256 &&
    e.result.observed_state_ref==='sha256:'+composite,
    'BLOCK_STATE_COMPOSITE_MISMATCH');
  demand(p.circuit_plan_sha256===r.plan.plan_sha256 &&
    p.source_ghot_commit===RIFF_RAFT_GHOT_COMMIT &&
    r.bot?.fresh_observer_operator===false &&
    r.bot?.username!==r.bot?.fresh_observer_username,
    'WITNESS_ROLE_OR_PLAN_MISMATCH');
  return {
    world_id:worldId,
    server_seed:String(r.server_seed),
    server_jar_sha1:r.version.server_sha1,
    minecraft_version:r.version.id,
    instance_id:e.instance_id,
    launch_crossing_id:e.launch.crossing.crossing_id,
    candidate_crossing_id:e.candidate.crossing.crossing_id,
    author_session_id:e.result.author_session_id,
    observer_session_id:e.result.observer_session_id,
    donor_ghot_commit:RIFF_RAFT_GHOT_COMMIT,
    vanilla_field_sha256:r.scan.field_sha256,
    observed_state_sha256:composite,
    redstone_observed_sha256:p.final_observer.observed_state_sha256,
    source_composition_bytes_sha256:sha(compBytes),
    source_runtime_bytes_sha256:sha(runtimeBytes),
    causal_signature:{before:a,broken:b,reset,final},
    quest_priority:quest.policy,
    quest_sha256:quest.quest_sha256,
    quest_proposer_commit:GHOT_005_COMMIT,
    quest_fault_x:quest.fault_repeater_position.x,
    quest_manifest:quest,
    previous_result:{
      crossing_id:quest.source_004_crossing_id,
      receipt_id:quest.source_004_receipt_id,
      payload_sha256:quest.source_004_packet_sha256,
      instance_id:quest.source_004_instance_id,
      candidate_crossing_id:quest.source_004_candidate_crossing_id,
      observed_state_sha256:quest.source_004_observed_state_sha256,
      quest_sha256:quest.source_004_quest_sha256,
      observed_lit_during_fault:quest.previous_fault_lit,
    },
    candidate_disposition:'R3_HOLD',
    real_world_effect:false,
  };
}
export async function assemblePair(inputs){
  demand(inputs&&Array.isArray(inputs)&&inputs.length===2,'EXPECTED_TWO_WORLDS');
  const worlds=[];
  for(const x of inputs){
    demand(['A','B'].includes(x.world_id) &&
      Buffer.isBuffer(x.composition_bytes) &&
      Buffer.isBuffer(x.runtime_bytes),'MISSING_WORLD_BYTES');
    worlds.push(await parseOne(x.world_id,x.composition_bytes,x.runtime_bytes));
  }
  worlds.sort((a,b)=>a.world_id.localeCompare(b.world_id));
  const [a,b]=worlds;
  demand(a.world_id==='A'&&b.world_id==='B','DUPLICATE_WORLD');
  demand(a.server_seed!==b.server_seed,'NOT_INDEPENDENT_SEEDS');
  demand(a.instance_id!==b.instance_id &&
    a.launch_crossing_id!==b.launch_crossing_id &&
    a.candidate_crossing_id!==b.candidate_crossing_id,
    'NOT_SEPARATE_RUNTIME_IDENTITIES');
  demand(a.vanilla_field_sha256!==b.vanilla_field_sha256 &&
    a.observed_state_sha256!==b.observed_state_sha256,
    'GAME_WORLD_EVIDENCE_NOT_DISTINCT');
  demand(a.server_jar_sha1===b.server_jar_sha1,'UNCONTROLLED_SERVER_VERSION');
  demand(a.quest_proposer_commit===GHOT_005_COMMIT &&
    b.quest_proposer_commit===GHOT_005_COMMIT &&
    a.quest_sha256!==b.quest_sha256 &&
    a.quest_fault_x!==b.quest_fault_x &&
    a.quest_priority!==b.quest_priority &&
    !equal(a.causal_signature.broken,b.causal_signature.broken),
    'DIFFERENT_GHOT_QUESTS_NOT_PRESERVED');
  const packet={
    schema:SCHEMA,
    source_project:'the-static-collective/reLATTE',
    receiving_project:'the-static-collective/GHoT',
    ghot_donor_commit:RIFF_RAFT_GHOT_COMMIT,
    ghot_quest_proposer_commit:GHOT_005_COMMIT,
    observed_parent_crossing_id:SOURCE_CROSSING,
    observed_parent_receipt_id:SOURCE_RECEIPT,
    observed_parent_packet_sha256:SOURCE_PACKET,
    evidence_class:'two-evidence-derived-counterfactual-minecraft-quest-results',
    selected_game_runtime:'official-vanilla-26.1.1',
    worlds,
    comparison:{
      independent_provisioning:'two-matrix-runners-and-distinct-world-seeds',
      distinct_instances:true,
      bounded_counterfactual_outcomes_verified:true,
      raw_world_states_intentionally_distinct:true,
    },
    recommended_gHot_disposition:'HOLD',
    no_direct_game_or_physical_actuation:true,
    biological_restoration_verified:false,
    ghot_energy_or_water_received:false,
    owner_admission:false,
    signed_sender_identity_is_not_trusted_org_authority:true,
  };
  return packet;
}
export async function emitSignedReturn(packet,worldEvidence){
  const packetJson=JSON.stringify(packet);
  const packetBytes=Buffer.from(packetJson,'utf8');
  const observation=makeObservation(
    'composition-instance',
    'riff-raft-minecraft-counterfactual-replay:'+sha(packetBytes),
    packetBytes,
    'application/vnd.ghot.riff-raft-counterfactual-return+json',
    {
      claim_scope:'two-verified-source-dependent-counterfactual-quests-observed-in-vanilla-only',
      ghot_receiver_disposition:'HOLD',
      signatures_do_not_prove_real_world_effect:true,
      source_donor_commit:RIFF_RAFT_GHOT_COMMIT,
      separate_runtime_instance_ids:packet.worlds.map(w=>w.instance_id),
      ghot_quest_proposer_commit:GHOT_005_COMMIT,
    observed_parent_crossing_id:SOURCE_CROSSING,
    observed_parent_receipt_id:SOURCE_RECEIPT,
    observed_parent_packet_sha256:SOURCE_PACKET,
    },
  );
  const hop=await makePolyglotHop({
    observation,
    signer:await generateP256KeyPair(),
    receiver:await generateP256KeyPair(),
    parent_crossing_id:null,
    disposition:'R3_HOLD',
    hop_index:48,
  });
  verifyHopBinding(hop,packetBytes);
  await validSigned(hop.crossing,hop.receipt,packetBytes);
  return {
    schema:BUNDLE_SCHEMA,
    packet_json:packetJson,
    crossing:hop.crossing,
    receipt:hop.receipt,
    world_evidence:worldEvidence,
  };
}
export async function buildBundleFromFiles(root,outPath){
  const inputs=[], evidence={};
  for(const world_id of ['A','B']){
    const folder=root+'/riff-raft-minecraft-005-'+world_id;
    const composition=await readFile(folder+'/composition-evidence.json');
    const runtime=await readFile(folder+'/runtime-evidence.json');
    inputs.push({world_id,composition_bytes:composition,runtime_bytes:runtime});
    evidence[world_id]={
      composition_json:composition.toString('utf8'),
      runtime_json:runtime.toString('utf8'),
    };
  }
  const packet=await assemblePair(inputs);
  const result=await emitSignedReturn(packet,evidence);
  await mkdir(dirname(outPath),{recursive:true});
  await writeFile(outPath,JSON.stringify(result,null,2)+'\n');
  return {worlds:packet.worlds.map(x=>({id:x.world_id,instance:x.instance_id})),
    comparison:packet.comparison,receipt_kind:result.receipt.kind,
    crossing_id:result.crossing.crossing_id,
    packet_sha256:sha(Buffer.from(result.packet_json,'utf8')),
    output_path:outPath};
}
if(process.argv[1]?.endsWith('counterfactual-replay.mjs')){
  const root=process.argv[2],out=process.argv[3];
  if(!root||!out)throw Error('Usage: two-world-replay.mjs <artifact-root> <output-json>');
  buildBundleFromFiles(root,out).then(x=>console.log(JSON.stringify(x,null,2)))
    .catch(e=>{console.error(e.stack||String(e));process.exitCode=1;});
}
