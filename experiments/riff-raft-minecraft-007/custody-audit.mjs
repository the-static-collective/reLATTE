import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {verifyCrossingEnvelope,verifyReceipt} from '../../src/protocol.ts';
import {assemblePair as replay005} from '../riff-raft-minecraft-005/counterfactual-replay.mjs';
import {assemblePair as replay004} from '../riff-raft-minecraft-004/dynamic-replay.mjs';

export const SOURCE_SHA256='da6c556051f197e1d07578b5e435ae3b7132538c7c098a4add9e4acfd4572d42';
export const RETURN_CROSSING='relatte-crossing-v0:bceaf6c25b074b0e1eed56c157368dae7aa97c99d33c382d5d00c96ddb91dda1';
export const RETURN_RECEIPT='relatte-receipt-v0:c4c8dd65fb645fded4ef8175d734d94fb1145be1cbf9b2f4fab7acf89cd856c3';
export const PARENT_CROSSING='relatte-crossing-v0:0b61b9476c0ab3e2b57a5090781d2591e8c1145ac84c2eea2f67efb301d54fa3';
export const PACKET_SHA256='1d9deb55ccda77a98d2c4c8c062fa965830077c26798b74a9344534d8657936e';
export const PARENT_PACKET_SHA256='9956d0887a5f65495cb777a5ba06aa03451946c46285930d8d96eeaa2a7d0a17';

const sha=x=>createHash('sha256').update(x).digest('hex');
const requireTrue=(value,reason)=>{
  if(!value)throw Error('RIFF_RAFT_007_HOLD:'+reason);
};
const nativeInputs=source=>{
  requireTrue(source&&typeof source==='object'&&
    source.world_evidence&&Object.keys(source.world_evidence).sort().join(',')==='A,B',
    'UNVERIFIED_WORLD_SET');
  return ['A','B'].map(world_id=>{
    const w=source.world_evidence[world_id];
    requireTrue(typeof w?.composition_json==='string'&&
      typeof w?.runtime_json==='string','MISSING_RAW_SIGNED_WORLD_BYTES');
    return {world_id,
      composition_bytes:Buffer.from(w.composition_json,'utf8'),
      runtime_bytes:Buffer.from(w.runtime_json,'utf8')};
  });
};
async function checkedSource(source,crossing,receipt,packetDigest){
  requireTrue(source?.crossing?.crossing_id===crossing&&
    source?.receipt?.receipt_id===receipt&&
    source?.receipt?.kind==='R3_HOLD','SIGNED_HOLD_IDENTITY_CHANGED');
  requireTrue(sha(Buffer.from(source.packet_json,'utf8'))===packetDigest,
    'SIGNED_PACKET_BYTES_CHANGED');
  requireTrue(await verifyCrossingEnvelope(source.crossing)&&
    await verifyReceipt(source.receipt),'INVALID_P256_SIGNED_RETURN');
  requireTrue(source.receipt.crossing_id===crossing,
    'SIGNATURE_NOT_BOUND_TO_CROSSING');
  requireTrue(source.crossing.payload_refs?.some(p=>
    p.address==='sha256:'+packetDigest),'RETURN_PAYLOAD_REFERENCE_CHANGED');
  return JSON.parse(source.packet_json);
}
export async function verifyExistingCustodyBytes(raw){
  requireTrue(Buffer.isBuffer(raw)&&raw.length>1&&raw.length<4*1024*1024,
    'SOURCE_BYTES_MISSING_OR_OVERSIZE');
  requireTrue(sha(raw)===SOURCE_SHA256,'PINNED_SOURCE_BYTE_HASH_CHANGED');
  const bundle=JSON.parse(raw.toString('utf8'));
  const parent=bundle?.ancestral_source_004;
  const packet5=await checkedSource(bundle,RETURN_CROSSING,RETURN_RECEIPT,
    PACKET_SHA256);
  const packet4=await checkedSource(parent,PARENT_CROSSING,
    'relatte-receipt-v0:5ad43d10051e60ce2f5d52fca00808027785b55bc31c70ff75a88f2496a06d11',
    PARENT_PACKET_SHA256);
  requireTrue(packet5?.observed_parent_crossing_id===PARENT_CROSSING&&
    packet5?.observed_parent_packet_sha256===PARENT_PACKET_SHA256 &&
    packet5?.owner_admission===false&&
    packet5?.biological_restoration_verified===false&&
    packet5?.no_direct_game_or_physical_actuation===true&&
    packet5?.recommended_gHot_disposition==='HOLD',
    'SOURCE_PARENT_OR_AUTHORITY_ESCALATION');
  requireTrue(packet4?.owner_admission===false&&
    packet4?.recommended_gHot_disposition==='HOLD',
    'PARENT_AUTHORITY_ESCALATED');
  // Native reLATTE independently re-verifies every source instance,
  // game state, P-256 crossing, receipt and proposed-vs-observed causality.
  const [current,earlier]=await Promise.all([
    replay005(nativeInputs(bundle)),
    replay004(nativeInputs(parent)),
  ]);
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  requireTrue(same(current.worlds,packet5.worlds)&&
    same(earlier.worlds,packet4.worlds),
    'SIGNED_GAME_WORLD_SOURCES_DO_NOT_REPLAY');
  requireTrue(current.worlds[0].causal_signature.broken.filter(Boolean).length===5&&
    current.worlds[1].causal_signature.broken.filter(Boolean).length===2 &&
    earlier.worlds[0].causal_signature.broken.filter(Boolean).length===3 &&
    earlier.worlds[1].causal_signature.broken.filter(Boolean).length===6,
    'SOURCE_CAUSAL_SEQUENCE_REPLACED');
  return {
    schema:'relatte.riff-raft-007-local-custody-verification/v0',
    source_sha256:SOURCE_SHA256,
    original_signed_004_crossing:PARENT_CROSSING,
    original_signed_005_crossing:RETURN_CROSSING,
    observed_prior_and_next:{A:[3,5],B:[6,2]},
    all_original_signatures_and_source_bytes_verified:true,
    admission:false,physical_actuation:false,
    administrative_independence_verified:false,
    disposition:'HOLD',
  };
}
export async function compareRepositoryCopies(primaryBytes,peerBytes){
  requireTrue(Buffer.isBuffer(primaryBytes)&&Buffer.isBuffer(peerBytes)&&
    primaryBytes.equals(peerBytes),'TWO_STORES_DIFFER_OR_MISSING');
  return verifyExistingCustodyBytes(primaryBytes);
}
export async function verifyPath(path){
  return verifyExistingCustodyBytes(await readFile(path));
}

if(process.argv[1]?.endsWith('custody-audit.mjs')){
  const mode=process.argv[2],primary=process.argv[3],peer=process.argv[4];
  (async()=>{
    let result;
    if(mode==='pair'){
      requireTrue(!!primary&&!!peer,'BOTH_STORE_PATHS_REQUIRED');
      result=await compareRepositoryCopies(await readFile(primary),await readFile(peer));
    }else if(mode==='primary-alone'||mode==='peer-alone'){
      requireTrue(!!primary&&!peer,'SURVIVOR_PATH_ONLY');
      result=await verifyPath(primary);
    }else throw Error('Usage: custody-audit.mjs pair <reLATTE> <GHoT> | primary-alone <file> | peer-alone <file>');
    console.log(JSON.stringify({...result,mode},null,2));
  })().catch(e=>{console.error(String(e.stack||e));process.exitCode=1;});
}
