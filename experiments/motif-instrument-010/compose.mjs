/* reLATTE Minecraft-010: MOTIF decides whether a cheaper, falsifiable
 * two-lamp witness can resolve a remaining uncertain game hypothesis.
 *
 * Source 009 verified *again* from its signed raw game packet; the new
 * signed output authorizes no game mutation until a separate localhost
 * research runner explicitly selects this particular instrument.
 */
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

import {verifyObservedGameBundle} from '../motif-instrument-009/verify.mjs';
import {buildMinecraftDatapack} from '../motif-instrument-008/compose.mjs';
import {buildRiffRaftRedstonePlan} from '../riff-raft-minecraft-002/redstone-grammar.mjs';
import {validateWorldPlan} from '../vanilla-worldbuilder-006/world-grammar.mjs';
import {makeObservation,makePolyglotHop,verifyHopBinding}
  from '../polyglot-crossing-001/common.ts';
import {generateP256KeyPair,verifyCrossingEnvelope,verifyReceipt}
  from '../../src/protocol.ts';

const insist=(c,why)=>{if(!c)throw Error('MINECRAFT_010_'+why)};
const sha=b=>createHash('sha256').update(b).digest('hex');
const sourceArchive='fixtures/riff-raft-minecraft-006/signed-005-return.bundle.json';
const source009=process.env.MOTIF_009_GAME_SOURCE??
  'work/seed009/signed-game-result.json';
export const SPEC_SCHEMA='relatte.minecraft-010-minimal-sensor-proposal/v0';
const disposition='R3_HOLD';
const PROVENANCE=Object.freeze({
  source_repo:'the-static-collective/GHoT',
  source_commit:'a63624f1be6a533f5ab927b1e4e8b1a629f1ba53',
  source_document:'https://github.com/the-static-collective/GHoT/pull/113',
  witness_class:'ghot-simulation-manifest-only',
  stages:['READ_FIELD','LAY_BONES','CATCH_WATER','MAKE_SHADE','MAKE_GROUND',
    'SEED_NUCLEUS','FEED_FIELD','WITNESS_DELTA','ONE_METER_OUTWARD'],
  claims:{
    actual_minecraft_actions_executed:false,
    physical_field_improvement_verified:false,
    real_world_actuation:false,
    signed_ghot_receipts_ingested:false,
  },
});

function rekeyPack(pack) {
  const files={};
  for(const [path,data] of Object.entries(pack.files)) {
    const name=path.replace('data/motif020/function/','data/motif022/function/');
    files[name]=data.replaceAll('motif020:','motif022:');
  }
  return files;
}

export async function composeNewMicroInstrument({game009Bytes,originalArchiveBytes,motifRoot}){
  insist(Buffer.isBuffer(game009Bytes)&&Buffer.isBuffer(originalArchiveBytes),
    'REAL_SIGNED_GAME_BYTES_REQUIRED');
  insist(typeof motifRoot==='string'&&motifRoot.length>0,
    'PINNED_MOTIF_CHECKOUT_REQUIRED');
  const verified009=await verifyObservedGameBundle(game009Bytes,originalArchiveBytes);
  const signed009=JSON.parse(game009Bytes.toString('utf8'));
  const sourceTrace=JSON.parse(signed009.packet_json).trace;
  const motif=resolve(motifRoot);
  const algorithm=await import(pathToFileURL(join(motif,
    'experiments/022/minimal_witness.mjs')).href);
  const seed=JSON.parse(await readFile(join(motif,
    'experiments/020/seeded_minecraft.json'),'utf8'));
  const invented=algorithm.forgeMinimalWitness(seed,verified009,sourceTrace);
  insist(invented.status==='PROPOSE_MINIMAL_CAUSAL_WITNESS' &&
    invented.actions===0 &&
    invented.selected.world==='A' &&
    invented.selected.world_seed==='381654729' &&
    invented.selected.fault_x===-28 &&
    invented.selected.discriminator===-20 &&
    invented.selected.sentinel_position.x===-10 &&
    invented.selected.minimal_witness_stage_indexes.join(',')==='2,3',
    'MOTIF_DID_NOT_SELECT_EXPECTED_MICRO_INSTRUMENT');

  const plan=buildRiffRaftRedstonePlan({
    goal:'MAKE GROUND IN A REHEARSAL WORLD',
    serverSeed:invented.selected.world_seed,
    provenance:PROVENANCE,
  });
  validateWorldPlan(plan);
  insist(plan.riff_raft_redstone.repeaters.includes(invented.selected.fault_x),
    'GAME_TARGET_NOT_CONSTRUCTIBLE');
  const draft={
    schema:'relatte.motif-minecraft-instrument-008/v0',
    target_world:'A',target_world_seed:invented.selected.world_seed,
    new_fault_repeater:{x:-28,y:66,z:46},
  };
  const generated=buildMinecraftDatapack(plan,draft);
  const files=rekeyPack(generated);
  const stages=plan.riff_raft_redstone.stages;
  const [discriminator,sentinel]=invented.selected.minimal_witness_stage_indexes.map(
    i=>stages[i]);
  const microCommands=[
    'scoreboard objectives add motif_micro dummy',
    'scoreboard players set #discriminator motif_micro 0',
    'scoreboard players set #sentinel motif_micro 0',
    'execute if block '+discriminator.at.x+' '+discriminator.at.y+' '+
      discriminator.at.z+' minecraft:redstone_lamp[lit=true] run scoreboard players set #discriminator motif_micro 1',
    'execute if block '+sentinel.at.x+' '+sentinel.at.y+' '+
      sentinel.at.z+' minecraft:redstone_lamp[lit=true] run scoreboard players set #sentinel motif_micro 1',
    'scoreboard players get #discriminator motif_micro',
    'scoreboard players get #sentinel motif_micro',
  ];
  files['data/motif022/function/read_micro.mcfunction']=microCommands.join('\n')+'\n';
  const proposal={
    schema:SPEC_SCHEMA,
    source_game_crossing:verified009.new_game_crossing,
    source_game_receipt:verified009.new_game_receipt,
    source_parent_005:verified009.source_original_005_crossing,
    source_009_verified_in_process:true,
    original_archive_sha256:sha(originalArchiveBytes),
    previously_observed_fault_lamps:verified009.observed_fault_lit_count,
    world:'A',world_seed:invented.selected.world_seed,
    fault_x:-28,threshold:3,
    stage_indexes:invented.selected.minimal_witness_stage_indexes,
    micro_stage_cues:[discriminator.cue,sentinel.cue],
    discriminator:discriminator.at,sentinel:sentinel.at,
    rival_predictions:invented.selected.predictions,
    predicted_info_bits:invented.selected.expected_information_bits,
    estimated_legacy_cost_units:invented.selected.legacy_full_instrument_cost_units,
    estimated_compressed_cost_units:invented.selected.estimated_cost_units,
    cost_units_not_measured_wallclock:true,
    source_009_prefix_observed_not_proven_universal:true,
    complete_9_stage_census_mandatory:true,
    independent_nonoperator_game_observer_mandatory:true,
    full_census_can_refute_compressed_sensor:true,
    game_server_not_yet_run:true,
    game_only:true,
    automatic_game_actuation:false,
    physical_ecological_claim:false,
    world_plan_sha256:plan.plan_sha256,
    receiver_disposition:disposition,
  };
  const bytes=Buffer.from(JSON.stringify(proposal),'utf8');
  const observation=makeObservation('composition-instance',
    'motif-minecraft-micro-instrument:'+sha(bytes),bytes,
    'application/vnd.relatte.minecraft010-micro-instrument+json',{
      original_game009_source_reverified:true,
      new_game_not_yet_run:true,
      measurement_only_game_only:true,
    });
  const hop=await makePolyglotHop({
    observation,signer:await generateP256KeyPair(),
    receiver:await generateP256KeyPair(),
    parent_crossing_id:verified009.new_game_crossing,
    disposition,hop_index:61,
  });
  verifyHopBinding(hop,bytes);
  insist(await verifyCrossingEnvelope(hop.crossing)&&
    await verifyReceipt(hop.receipt)&&
    hop.receipt.kind===disposition&&
    hop.crossing.parents?.[0]===verified009.new_game_crossing,
    'NEW_MICRO_INSTRUMENT_SIGNATURE_INVALID');
  return {
    schema:'relatte.minecraft010-prepared-experiment/v0',
    proposal,decision:invented,files,plan,
    signed:{
      schema:'relatte.minecraft010-signed-proposal/v0',
      proposal_json:bytes.toString('utf8'),
      crossing:hop.crossing,receipt:hop.receipt,
      game_execution_claimed:false,
      receiver_disposition:disposition,
    },
  };
}

export async function produceGamePack({
  motifRoot=process.env.MOTIF_ROOT,
  priorGamePath=source009,
  out='work/motif-minecraft-010',
}={}){
  const [game009Bytes,originalArchiveBytes]=await Promise.all([
    readFile(priorGamePath),readFile(sourceArchive),
  ]);
  const x=await composeNewMicroInstrument({
    game009Bytes,originalArchiveBytes,motifRoot,
  });
  await mkdir(out,{recursive:true});
  for(const [path,body] of Object.entries(x.files)){
    const full=join(out,'datapack',path);
    await mkdir(dirname(full),{recursive:true});
    await writeFile(full,body);
  }
  for(const [name,body] of [
    ['proposal.json',x.proposal],
    ['decision.json',x.decision],
    ['signed-proposal.json',x.signed],
  ])await writeFile(join(out,name),JSON.stringify(body,null,2)+'\n');
  return {
    schema:x.schema,original_game_verified:x.proposal.source_009_verified_in_process,
    new_fault:{world:x.proposal.world,x:x.proposal.fault_x},
    reads:x.proposal.stage_indexes.length,
    full_audit_lamps:9,
    expected_cost_units:x.proposal.estimated_compressed_cost_units,
    new_instrument_crossing:x.signed.crossing.crossing_id,
    receipt:x.signed.receipt.receipt_id,
    game_not_executed_yet:x.proposal.game_server_not_yet_run,
  };
}

if(process.argv[1]?.endsWith('/compose.mjs')){
  produceGamePack().then(x=>console.log(JSON.stringify(x,null,2)))
    .catch(e=>{console.error(e.stack||String(e));process.exitCode=1;});
}
