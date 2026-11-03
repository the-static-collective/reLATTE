// Receiver aggregation verifies native signatures without making either local
// receiver's decision a global authority or erasing the refusal.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {verifyReceipt} from '../../../src/protocol.ts';

export async function verifyPair(hold,refuse){
  for(const [decision,proof] of [['HOLD',hold],['REFUSE',refuse]]){
    if(proof.schema!=='world-forge/native-owner-local-review-proof/v0'
      ||proof.receiver_local_choice!==decision||proof.source_native_relatte_crossing_signature_verified!==true
      ||proof.receiver_receipt_signatures_verified!==true||proof.transport_frame_verified!==true
      ||proof.actual_external_human_choice!==false||proof.owner_admitted!==false
      ||proof.automation_permitted!==false
      ||proof.original_pr101_source_signatures_verified!==false)
      throw Error('UNAPPROVED_RECEIVER_CLAIM');
    if(proof.journal_length!==3||proof.snapshot?.admitted?.length!==0
      ||proof.snapshot?.received?.length!==1
      ||proof.snapshot[decision==='HOLD'?'held':'refused']?.length!==1
      ||proof.disposition?.kind!=='R3_'+decision
      ||proof.disposition?.semantic_effect!=='none'
      ||proof.custody?.extensions?.local_receiver?.payload_custody?.retained!==(decision==='HOLD'))
      throw Error('RECEIVER_DISPOSITION_MISMATCH');
    for(const receipt of [proof.receives,proof.disposition,proof.custody]){
      if(!(await verifyReceipt(receipt)))throw Error('FORGED_RECEIVER_SIGNATURE');
      if(receipt.crossing_id!==proof.crossing_id)throw Error('RECEIPT_CROSSING_MISMATCH');
    }
    assert.equal(proof.snapshot[decision==='HOLD'?'held':'refused'][0],proof.crossing_id);
  }
  if(hold.crossing_id!==refuse.crossing_id
    ||hold.payload_byte_sha256!==refuse.payload_byte_sha256)throw Error('RECEIVERS_NOT_OFFERED_SAME_PAYLOAD');
  if(hold.snapshot.world_id===refuse.snapshot.world_id
    ||JSON.stringify(hold.disposition.signing.public_key)===JSON.stringify(refuse.disposition.signing.public_key))
    throw Error('RECEIVERS_NOT_SOVEREIGN');
  return {
    schema:'world-forge/two-independent-local-receiver-choices/v0',
    crossing_id:hold.crossing_id,payload_sha256:hold.payload_byte_sha256,
    native_p256_source_envelope_and_receiver_receipts_verified:true,
    receiver_worlds:[hold.snapshot.world_id,refuse.snapshot.world_id],
    choices:['HOLD','REFUSE'],different_local_keys:true,
    refused_bytes_retained:false,held_bytes_quarantined:true,
    recognized_external_identity:false,original_pr101_signatures_verified:false,
    automatic_execution:false,automatic_admission:false,
    global_disposition:null
  };
}
if(process.argv[1]?.endsWith('/compare-receivers.mjs')){
  const [holdPath,refusePath,out]=process.argv.slice(2);
  if(!out)throw Error('usage HOLD.json REFUSE.json OUTPUT.json');
  const v=await verifyPair(JSON.parse(readFileSync(holdPath)),JSON.parse(readFileSync(refusePath)));
  writeFileSync(out,JSON.stringify(v,null,2)+'\n');
  console.log('WORLD_FORGE_006_TWO_OWNER_LOCAL_CHOICES='+JSON.stringify(v));
}
