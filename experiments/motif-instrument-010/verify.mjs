/* Minecraft-010 independent return: this is pure cryptographic and game
 * record verification. No sockets or game commands in this module.
 */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {verifyCrossingEnvelope,verifyReceipt}
  from '../../src/protocol.ts';
import {verifyObservedGameBundle as verify009}
  from '../motif-instrument-009/verify.mjs';
import {SPEC_SCHEMA} from './compose.mjs';
import {RESULT_SCHEMA,BUNDLE_SCHEMA,checkGameTrace}
  from './trace-verifier.mjs';

const insist=(yes,why)=>{if(!yes)throw Error('MINECRAFT_010_INDEPENDENT_'+why)};
const sha=x=>createHash('sha256').update(x).digest('hex');

export async function verifyNewMicroGame(game010Bytes,game009Bytes,archiveBytes){
  insist(Buffer.isBuffer(game010Bytes)&&game010Bytes.length>0&&
    game010Bytes.length<4*1024*1024,'BAD_GAME_010_BYTES');
  const prior=await verify009(game009Bytes,archiveBytes);
  const signed=JSON.parse(game010Bytes.toString('utf8'));
  insist(signed.schema===BUNDLE_SCHEMA &&
    signed.receiver_disposition==='R3_HOLD' &&
    signed.physical_actuation===false,
    'BAD_OR_ESCALATED_SIGNED_RESULT');
  const p=signed.signed_instrument;
  insist(p?.schema==='relatte.minecraft010-signed-proposal/v0'&&
    await verifyCrossingEnvelope(p.crossing)&&
    await verifyReceipt(p.receipt)&&
    p.receipt.kind==='R3_HOLD' &&
    p.receipt.crossing_id===p.crossing.crossing_id &&
    p.crossing.parents?.length===1 &&
    p.crossing.parents[0]===prior.new_game_crossing &&
    p.crossing.payload_refs?.length===1 &&
    p.crossing.payload_refs[0].address==='sha256:'+
      sha(Buffer.from(p.proposal_json,'utf8')),
    'GAME_PROPOSAL_SIGNATURE_OR_PARENT_FAILED');
  const proposal=JSON.parse(p.proposal_json);
  insist(proposal?.schema===SPEC_SCHEMA &&
    proposal.source_game_crossing===prior.new_game_crossing &&
    proposal.source_game_receipt===prior.new_game_receipt &&
    proposal.world==='A'&&proposal.world_seed==='381654729'&&
    proposal.fault_x===-28&&proposal.threshold===3 &&
    proposal.stage_indexes?.join(',')==='2,3' &&
    proposal.receiver_disposition==='R3_HOLD'&&
    proposal.game_server_not_yet_run===true &&
    proposal.game_only===true&&
    proposal.physical_ecological_claim===false,
    'GAME_PROPOSAL_OR_AUTHORITY_INVALID');
  insist(await verifyCrossingEnvelope(signed.crossing) &&
    await verifyReceipt(signed.receipt) &&
    signed.receipt.kind==='R3_HOLD' &&
    signed.receipt.crossing_id===signed.crossing.crossing_id &&
    signed.crossing.parents?.length===1 &&
    signed.crossing.parents[0]===p.crossing.crossing_id &&
    signed.crossing.payload_refs?.length===1 &&
    signed.crossing.payload_refs[0].address==='sha256:'+
      sha(Buffer.from(signed.packet_json,'utf8')),
    'NEW_GAME_BYTES_OR_SIGNATURE_INVALID');
  const packet=JSON.parse(signed.packet_json);
  insist(packet.schema===RESULT_SCHEMA &&
    packet.prior_signed_game_sha256===sha(game009Bytes) &&
    packet.original_009_crossing===prior.new_game_crossing &&
    packet.original_005_crossing===prior.source_original_005_crossing &&
    packet.instrument_crossing===p.crossing.crossing_id &&
    packet.origin_instrument_sha256===sha(Buffer.from(p.proposal_json,'utf8'))&&
    packet.game_world==='A' &&
    packet.game_seed==='381654729' &&
    packet.game_version==='26.1.1' &&
    packet.selected_probe?.fault_x===-28 &&
    packet.selected_probe?.threshold===3 &&
    packet.selected_probe?.stage_indexes?.join(',')==='2,3' &&
    packet.receiver_disposition==='R3_HOLD' &&
    packet.owner_admission===false&&
    packet.physical_world_effect===false&&
    packet.auto_next_experiment===false,
    'RETURN_ANCHOR_OR_PERMISSION_INVALID');
  const observed=checkGameTrace(proposal,packet.trace,{
    id:packet.game_version,server_sha1:packet.server_sha1,
  });
  insist(observed.faultCount===packet.actual_observed_count &&
    observed.provisionalClassification===packet.observed_classification &&
    observed.status===packet.full_census_audited_status &&
    observed.inferredCount===packet.low_cost_probe_inferred_count,
    'RETURN_CONCLUSION_NOT_DERIVED_FROM_RAW_GAME');
  return {
    schema:'relatte.minecraft-010-independent-game-return/v0',
    source_004_005_008_009_chain_verification:true,
    source_009_crossing:prior.new_game_crossing,
    signed_instrument_crossing:p.crossing.crossing_id,
    signed_game_crossing:signed.crossing.crossing_id,
    signed_game_receipt:signed.receipt.receipt_id,
    world:'A',seed:'381654729',fault_x:-28,
    probe_cues:proposal.micro_stage_cues,
    sampled_lamps:proposal.stage_indexes.length,
    full_census_lamps:9,
    actual_lamps_lit:observed.faultCount,
    micro_sensor_inferred_count:observed.inferredCount,
    result_status:observed.status,
    provisional_classification:observed.provisionalClassification,
    micro_sensor_verified_against_full_game_and_fresh_nonop:
      observed.microCountMatchesNineLampAudit,
    prefix_observed_this_world:observed.prefixPatternObserved,
    verified_official_server_in_source_runner:true,
    verifier_connected_to_game:false,
    source_signatures_verified:true,
    no_real_environment_actuation:true,
    owner_admission:false,
    next_game_automatic:false,
    disposition:'R3_HOLD',
  };
}
if(process.argv[1]?.endsWith('/verify.mjs')){
  const [newFile,priorFile,output]=process.argv.slice(2);
  if(!newFile||!priorFile||!output)
    throw Error('Usage: verify.mjs <signed-010> <signed-009> <output>');
  const [newGame,oldGame,archive]=await Promise.all([
    readFile(newFile),readFile(priorFile),
    readFile('fixtures/riff-raft-minecraft-006/signed-005-return.bundle.json'),
  ]);
  const result=await verifyNewMicroGame(newGame,oldGame,archive);
  await mkdir(dirname(output),{recursive:true});
  await writeFile(output,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({
    status:'NEW_WORLD_A_GAME_INDEPENDENTLY_REVERIFIED',
    lamps:result.actual_lamps_lit,
    sensor:result.micro_sensor_inferred_count,
    match:result.micro_sensor_verified_against_full_game_and_fresh_nonop,
    classification:result.provisional_classification,
    disposition:result.disposition,
  },null,2));
}
