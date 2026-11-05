/* Seeded reLATTE Minecraft instrument experiment.
 * Genuine old game evidence is independently re-verified with native reLATTE
 * 007 code before MOTIF can propose anything. New Minecraft actions remain
 * a game-only, operator-reviewed proposal until an independent run occurs.
 */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {generateP256KeyPair,verifyCrossingEnvelope,verifyReceipt}
  from '../../src/protocol.ts';
import {makeObservation,makePolyglotHop,verifyHopBinding}
  from '../polyglot-crossing-001/common.ts';
import {verifyExistingCustodyBytes,SOURCE_SHA256}
  from '../riff-raft-minecraft-007/custody-audit.mjs';
import {REDSTONE_CIRCUIT,buildRiffRaftRedstonePlan}
  from '../riff-raft-minecraft-002/redstone-grammar.mjs';
import {validateWorldPlan,operationToCommand}
  from '../vanilla-worldbuilder-006/world-grammar.mjs';

const error=(condition,why)=>{if(!condition)throw Error('MOTIF_MC008_'+why)};
const sha=x=>createHash('sha256').update(x).digest('hex');
const SRC='fixtures/riff-raft-minecraft-006/signed-005-return.bundle.json';
const GROUND_GOAL='MAKE GROUND IN A REHEARSAL WORLD';
export const SCHEMA='relatte.motif-minecraft-instrument-008/v0';

const sourceProvenance=Object.freeze({
  source_repo:'the-static-collective/GHoT',
  source_commit:'a63624f1be6a533f5ab927b1e4e8b1a629f1ba53',
  source_document:'https://github.com/the-static-collective/GHoT/pull/113',
  witness_class:'ghot-simulation-manifest-only',
  stages:[
    'READ_FIELD','LAY_BONES','CATCH_WATER','MAKE_SHADE',
    'MAKE_GROUND','SEED_NUCLEUS','FEED_FIELD','WITNESS_DELTA','ONE_METER_OUTWARD',
  ],
  claims:{
    actual_minecraft_actions_executed:false,
    physical_field_improvement_verified:false,
    real_world_actuation:false,
    signed_ghot_receipts_ingested:false,
  },
});

export function extractAuthenticatedPrior(audit) {
  error(audit?.schema==='relatte.riff-raft-007-local-custody-verification/v0'&&
    audit.all_original_signatures_and_source_bytes_verified===true &&
    audit.source_sha256===SOURCE_SHA256,'SOURCE_NOT_NATIVE_VERIFIED');
  error(audit.disposition==='HOLD'&&audit.admission===false&&
    audit.physical_actuation===false,'SOURCE_AUTHORITY');
  const o=audit.observed_prior_and_next;
  error(JSON.stringify(o)==='{"A":[3,5],"B":[6,2]}','SOURCE_HISTORY_CHANGED');
  return [
    {world:'A',fault_x:-13,lit_count:o.A[0]},
    {world:'A',fault_x:2,lit_count:o.A[1]},
    {world:'B',fault_x:17,lit_count:o.B[0]},
    {world:'B',fault_x:-28,lit_count:o.B[1]},
  ];
}

export async function composeNativeMinecraftExperiment({
  motifRoot,
  sourceBytes,
}) {
  error(typeof motifRoot==='string'&&motifRoot.length>0,'MOTIF_SOURCE_REQUIRED');
  error(Buffer.isBuffer(sourceBytes),'RAW_SOURCE_BYTES_REQUIRED');
  // Native verification includes original 004 and 005 cryptographic replays
  // of official vanilla game observations. An asserted boolean is never enough.
  const audit=await verifyExistingCustodyBytes(sourceBytes);
  const prior=extractAuthenticatedPrior(audit);
  const root=resolve(motifRoot);
  const instrumentCode=await import(pathToFileURL(
    join(root,'experiments/020/instrument_garden.mjs')).href);
  const seed=JSON.parse(await readFile(join(root,
    'experiments/020/seeded_minecraft.json'),'utf8'));
  const requested={
    ...seed,
    observed:prior,
    source:{
      classification:'native-relatte-p256-verified-game-history',
      disposition:'HOLD',owner_admitted:false,
      source_ids:[
        audit.original_signed_004_crossing,
        audit.original_signed_005_crossing,
      ],
    },
  };
  const decision=instrumentCode.designInstrument(requested);
  error(decision.status==='PROPOSE_NEW_INSTRUMENT'&&
    decision.real_game_execution===false,'NO_VALID_INSTRUMENT');
  const {world,fault_x,threshold}=decision.selected.target;
  error(world==='B'&&fault_x===-13&&threshold===4,
    'SEED_PROPOSAL_NOT_EXPECTED_GAME_PROBE');
  error(REDSTONE_CIRCUIT.repeaters.includes(fault_x) &&
    REDSTONE_CIRCUIT.stages.length===9,'UNKNOWN_REPEATER_OR_LAMPS');
  const seedB='918273645';
  // Build the new *target* world from reLATTE's native, executable
  // Minecraft world and redstone planning implementation.
  const plan=buildRiffRaftRedstonePlan({
    goal:GROUND_GOAL,serverSeed:seedB,provenance:sourceProvenance,
  });
  validateWorldPlan(plan);
  error(plan.riff_raft_redstone.repeaters.includes(fault_x),
    'CHOSEN_FAULT_NOT_IN_BUILDABLE_WORLD');
  const state={
    schema:SCHEMA,
    proposal:'synthetic-game-only-next-minecraft-experiment',
    parent_source_sha256:audit.source_sha256,
    original_004_crossing:audit.original_signed_004_crossing,
    original_005_crossing:audit.original_signed_005_crossing,
    source_disposition:'HOLD',
    source_authenticated_as:'previous-vanilla-game-results-not-physical-world',
    prior_observations:prior,
    target_world:world,
    target_world_seed:seedB,
    new_fault_repeater:{x:fault_x,y:66,z:46},
    classify_lit_count_at_least:threshold,
    rival_predicted_counts:decision.selected.predictions,
    expected_information_bits:decision.information_gain_bits,
    cost_of_inaction:decision.cost_of_inaction,
    decision_score:decision.selected.utility_vs_zero,
    world_plan_sha256:plan.plan_sha256,
    game_version:'26.1.1',
    mcfunction_source:'native-reLATTE-riff-raft-redstone-002',
    operator_selection_required:true,
    independent_nonop_observer_required:true,
    never_treat_prior_observation_as_new_game_run:true,
    automated_game_execution_occurred:false,
    physical_world_effect:false,
    source_owner_admission:false,
    new_world_admission:false,
    pending_disposition:'R3_HOLD',
    remote_execution:false,
  };
  const pack=buildMinecraftDatapack(plan,state);
  return {state,decision,pack,audit};
}

export function buildMinecraftDatapack(plan,state) {
  error(state?.schema===SCHEMA&&state.target_world==='B'&&
    state.new_fault_repeater?.x===-13,'UNSUPPORTED_GAME_TARGET');
  error(plan?.riff_raft_redstone?.stages?.length===9,'UNTESTABLE_PLAN');
  validateWorldPlan(plan);
  const pos=state.new_fault_repeater;
  const at=pos.x+' '+pos.y+' '+pos.z;
  const command=x=>x.replace(/^\//,'');
  const built=plan.operations.map(operationToCommand).map(command);
  // The actual original redstone line is rebuilt from native reLATTE source.
  // Run commands as distinct functions to allow vanilla ticks to settle.
  const setup=[
    'scoreboard objectives add motif_count dummy',
    ...built,
    'setblock -43 66 46 minecraft:air',
  ];
  const observe=[
    'scoreboard players set #lit motif_count 0',
    ...plan.riff_raft_redstone.stages.map(s=>
      'execute if block '+s.at.x+' '+s.at.y+' '+s.at.z+
      ' minecraft:redstone_lamp[lit=true] run scoreboard players add #lit motif_count 1'
    ),
    'scoreboard players get #lit motif_count',
  ];
  const files={
    'pack.mcmeta':JSON.stringify({
      pack:{description:'MOTIF-020 reLATTE instrument: proposal only / no auto-run',
        min_format:[101,1],max_format:[101,1]},
    },null,2)+'\n',
    'data/motif020/function/setup.mcfunction':setup.join('\n')+'\n',
    'data/motif020/function/trigger.mcfunction':
      'setblock -43 66 46 minecraft:redstone_block\n',
    'data/motif020/function/fault.mcfunction':
      'setblock '+at+' minecraft:air\n',
    'data/motif020/function/reset.mcfunction':
      'setblock -43 66 46 minecraft:air\n',
    'data/motif020/function/repair.mcfunction':
      'setblock '+at+' minecraft:repeater[facing=west,delay=4]\n',
    'data/motif020/function/read_lamps.mcfunction':observe.join('\n')+'\n',
    'data/motif020/function/restored.mcfunction':
      'setblock -43 66 46 minecraft:redstone_block\n',
  };
  const readback={
    initial:'Run motif020:reset, allow vanilla ticks, then motif020:read_lamps',
    fault:'Run motif020:trigger, allow ticks, then motif020:fault, allow ticks, then motif020:read_lamps',
    repair:'Run motif020:reset, then motif020:repair, allow ticks, then motif020:restored, allow ticks, then motif020:read_lamps',
    independent_witness:'A separate non-operator Minecraft client must independently read all nine lamp blockstates after author disconnects.',
    pass_condition:'Measured fault count and independent observer count agree; outcomes may support or contradict hypotheses. No prediction is an expected truth.',
    prior_game_source_reused_as_new_observation:false,
    actual_server_test_executed:false,
  };
  return {files,readback,plan_operations:plan.operations.length,
    build_plan_sha256:plan.plan_sha256};
}

export async function sealSyntheticQuest(state){
  error(state?.schema===SCHEMA&&state.automated_game_execution_occurred===false &&
    state.remote_execution===false&&state.pending_disposition==='R3_HOLD',
    'UNAPPROVED_AUTHORITY');
  const bytes=Buffer.from(JSON.stringify(state),'utf8');
  const observation=makeObservation(
    'composition-instance','motif-minecraft-instrument:'+sha(bytes),
    bytes,'application/vnd.relatte.motif-instrument-proposal+json',{
      world_state_not_yet_observed:true,
      game_only:true,
      source_witness:'native-007-cold-replay',
      request_kind:'new-instrument-proposal',
      authority:'none',
    },
  );
  const hop=await makePolyglotHop({
    observation,signer:await generateP256KeyPair(),
    receiver:await generateP256KeyPair(),
    parent_crossing_id:state.original_005_crossing,
    disposition:'R3_HOLD',hop_index:58,
  });
  verifyHopBinding(hop,bytes);
  error(await verifyCrossingEnvelope(hop.crossing)&&
    await verifyReceipt(hop.receipt),'SIGNED_PROPOSAL_VERIFY_FAILED');
  error(hop.receipt.kind==='R3_HOLD'&&
    hop.crossing.parents.includes(state.original_005_crossing),
    'INHERITED_AUTHORITY_FORBIDDEN');
  return {
    schema:'relatte.motif-minecraft-instrument-signed-hold/v0',
    proposal_json:bytes.toString('utf8'),
    crossing:hop.crossing,
    receipt:hop.receipt,
    source_sha256:state.parent_source_sha256,
    signed_sender_is_not_owner_identity:true,
    game_execution_verified:false,
    admission:false,
  };
}

export async function runExperiment({
  motifRoot=process.env.MOTIF_ROOT,
  sourceFile=SRC,
  outDir='work/motif-minecraft-instrument-008',
}={}){
  error(!!motifRoot,'MOTIF_ROOT_NOT_SET');
  const raw=await readFile(sourceFile);
  const result=await composeNativeMinecraftExperiment({motifRoot,sourceBytes:raw});
  const signed=await sealSyntheticQuest(result.state);
  await mkdir(outDir,{recursive:true});
  await writeFile(join(outDir,'proposal.json'),JSON.stringify(result.state,null,2)+'\n');
  await writeFile(join(outDir,'signed-held-proposal.json'),JSON.stringify(signed,null,2)+'\n');
  await writeFile(join(outDir,'decision.json'),JSON.stringify(result.decision,null,2)+'\n');
  await writeFile(join(outDir,'readback.json'),JSON.stringify(result.pack.readback,null,2)+'\n');
  const path=join(outDir,'datapack');
  for(const [name,contents] of Object.entries(result.pack.files)){
    const full=join(path,name);
    await mkdir(resolve(full,'..'),{recursive:true});
    await writeFile(full,contents);
  }
  return {
    schema:SCHEMA,
    original_signatures_replayed:true,
    new_game_run:false,
    next_probe:result.decision.selected.target,
    native_plan_sha256:result.state.world_plan_sha256,
    game_functions:Object.keys(result.pack.files),
    signed_hold_crossing:signed.crossing.crossing_id,
    signed_hold_receipt:signed.receipt.receipt_id,
    output_dir:outDir,
  };
}

if(process.argv[1]?.endsWith('/compose.mjs')){
  runExperiment().then(r=>console.log(JSON.stringify(r,null,2)))
    .catch(e=>{console.error(String(e.stack||e));process.exitCode=1});
}
