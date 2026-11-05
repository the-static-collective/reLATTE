/* Independent replay on a second CI runner: verify original old reLATTE
 * P256 game evidence, new proposal signature, new result signature, and every
 * raw blockstate/observer field. This NEVER reruns Minecraft or assumes a
 * signed packet proves authority, physical ecology, or human independence.
 */
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {verifyCrossingEnvelope,verifyReceipt}
  from '../../src/protocol.ts';
import {verifyExistingCustodyBytes,SOURCE_SHA256}
  from '../riff-raft-minecraft-007/custody-audit.mjs';
import {checkGameTrace,RESULT_SCHEMA,BUNDLE_SCHEMA}
  from './trace-verifier.mjs';

const insist=(x,s)=>{if(!x)throw Error('MOTIF_MC009_REPLAY_'+s)};
const hash=x=>createHash('sha256').update(x).digest('hex');
const fix='fixtures/riff-raft-minecraft-006/signed-005-return.bundle.json';

export async function verifyObservedGameBundle(raw,source) {
  insist(Buffer.isBuffer(raw)&&raw.length>0&&raw.length<4*1024*1024,
    'INVALID_BUNDLE_BYTES');
  const archive=await verifyExistingCustodyBytes(source);
  insist(archive.source_sha256===SOURCE_SHA256 &&
    archive.disposition==='HOLD'&&!archive.admission,
    'ORIGINAL_ARCHIVE_NOT_VERIFIED');
  const b=JSON.parse(raw.toString('utf8'));
  insist(b.schema===BUNDLE_SCHEMA &&
    b.receiver_disposition==='R3_HOLD' &&
    b.physical_actuation===false,
    'GAME_RESULT_BUNDLE_INVALID');

  const sourceProposal=b.signed_instrument;
  insist(sourceProposal?.schema==='relatte.motif-minecraft-instrument-signed-hold/v0'&&
    await verifyCrossingEnvelope(sourceProposal.crossing)&&
    await verifyReceipt(sourceProposal.receipt)&&
    sourceProposal.receipt.kind==='R3_HOLD' &&
    sourceProposal.receipt.crossing_id===sourceProposal.crossing.crossing_id,
    'PARENT_PROPOSAL_SIGNATURE_INVALID');
  const original=JSON.parse(sourceProposal.proposal_json);
  insist(original.original_004_crossing===archive.original_signed_004_crossing &&
    original.original_005_crossing===archive.original_signed_005_crossing &&
    original.parent_source_sha256===archive.source_sha256 &&
    sourceProposal.crossing.parents.includes(archive.original_signed_005_crossing),
    'PROPOSAL_SOURCE_ANCESTRY_INVALID');

  insist(await verifyCrossingEnvelope(b.crossing)&&await verifyReceipt(b.receipt),
    'NEW_GAME_P256_SIGNATURE_INVALID');
  insist(b.receipt.kind==='R3_HOLD'&&
    b.receipt.crossing_id===b.crossing.crossing_id&&
    b.crossing.parents?.length===1 &&
    b.crossing.parents[0]===sourceProposal.crossing.crossing_id,
    'OBSERVATION_NOT_CHILD_OF_INSTRUMENT');
  const pktBytes=Buffer.from(b.packet_json,'utf8');
  insist(b.crossing.payload_refs?.length===1 &&
    b.crossing.payload_refs[0].address==='sha256:'+hash(pktBytes),
    'GAME_RESULT_BYTES_NOT_BOUND');
  insist(sourceProposal.crossing.payload_refs?.length===1 &&
    sourceProposal.crossing.payload_refs[0].address===
      'sha256:'+hash(Buffer.from(sourceProposal.proposal_json,'utf8')),
    'PARENT_PROPOSAL_BYTES_NOT_BOUND');

  const packet=JSON.parse(b.packet_json);
  insist(packet.schema===RESULT_SCHEMA &&
    packet.instrument_crossing===sourceProposal.crossing.crossing_id &&
    packet.origin_instrument_sha256===hash(Buffer.from(sourceProposal.proposal_json)) &&
    packet.original_source_sha256===SOURCE_SHA256 &&
    packet.original_004_crossing===archive.original_signed_004_crossing &&
    packet.original_005_crossing===archive.original_signed_005_crossing &&
    packet.game_world==='B'&&packet.game_seed==='918273645'&&
    packet.game_version==='26.1.1' &&
    packet.selected_probe?.fault_x===-13 &&
    packet.selected_probe?.threshold===4 &&
    packet.trace?.instrument_proposal_crossing===packet.instrument_crossing &&
    packet.trace?.source_005_crossing===packet.original_005_crossing &&
    packet.owner_admission===false &&
    packet.auto_next_experiment===false &&
    packet.physical_world_effect===false &&
    packet.receiver_disposition==='R3_HOLD',
    'RESULT_ANCHORS_OR_AUTHORITY_INVALID');
  const counted=checkGameTrace(original,packet.trace,{
    id:packet.game_version,
    server_sha1:packet.server_sha1,
  });
  insist(counted.faultCount===packet.actual_observed_count &&
    counted.classification===packet.observed_classification,
    'RESULT_CLASSIFICATION_NOT_FROM_RAW_GAME_BLOCKS');

  return {
    schema:'relatte.motif-minecraft-009-independent-return/v0',
    original_two_world_history_verified:true,
    real_game_server_observed_in_source_runner:true,
    new_game_result_p256_signature_verified:true,
    separate_fresh_nonop_game_witness_in_source_runner:true,
    raw_blockstates_recomputed:true,
    source_original_005_crossing:packet.original_005_crossing,
    new_instrument_crossing:packet.instrument_crossing,
    new_game_crossing:b.crossing.crossing_id,
    new_game_receipt:b.receipt.receipt_id,
    world:'B',fault_x:-13,
    observed_fault_lit_count:counted.faultCount,
    classification:counted.classification,
    rival_seed_predictions:original.rival_predicted_counts,
    official_minecraft_version:packet.game_version,
    server_sha1:packet.server_sha1,
    independent_verifier_did_not_connect_to_game:true,
    verified_cryptographic_bytes_not_world_truth:true,
    persistent_understory_written:false,
    physical_environment_effect:false,
    disposition:'HOLD',
    owner_admission:false,
  };
}

if(process.argv[1]?.endsWith('/verify.mjs')){
  const sourcePath=process.argv[2];
  const output=process.argv[3];
  if(!sourcePath||!output)throw Error('Usage: verify.mjs <signed-game-bundle.json> <output.json>');
  const [raw,source]=await Promise.all([readFile(sourcePath),readFile(fix)]);
  const receipt=await verifyObservedGameBundle(raw,source);
  await mkdir(dirname(output),{recursive:true});
  await writeFile(output,JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify({
    status:'INDEPENDENT_GAME_RETURN_REPLAYED',
    observed_lit_count:receipt.observed_fault_lit_count,
    classification:receipt.classification,
    disposition:receipt.disposition,
    source_old_and_new_signatures_checked:true,
  },null,2));
}
