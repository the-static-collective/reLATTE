#!/usr/bin/env node
// RELAY-001 — local GHoT evidence -> native reLATTE opaque roundtrip -> HOLD.
// The donor artifact is NOT signed. Only reLATTE crossings/local receiver
// receipts are signed. No private key or song bytes are transported.
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { runOpaqueOrganRoundTrip, verifyOpaqueOrganCrossing, verifyReceipt,
  verifyAndExtractTransportFrame } from '../src/index.ts';

const files = ['ghot-receipt.json','ghot-task.json','loadout-binding.json','loadout-parameters.json','relay-crossing.json'];
const hex = x => createHash('sha256').update(x).digest('hex');
const must = (ok, code) => { if (!ok) throw Error(code); };
function canonical(v, ascii=false) {
  if (Array.isArray(v)) return '['+v.map(x=>canonical(x,ascii)).join(',')+']';
  if (v && typeof v==='object') return '{'+Object.keys(v).sort().map(
    k=>canonical(k,ascii)+':'+canonical(v[k],ascii)).join(',')+'}';
  if (typeof v==='string') {
    const s=JSON.stringify(v);
    return ascii ? s.replace(/[\u007f-\uffff]/g,
      c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0')) : s;
  }
  return JSON.stringify(v);
}
const hashJSON=(v,ascii=false)=>'sha256:'+hex(Buffer.from(canonical(v,ascii)));
const readJSON=async p=>JSON.parse(await readFile(p,'utf8'));
export async function validateDonor(folder, mediaFile=null) {
  const raw={}, j={};
  for(const name of files) {raw[name]=await readFile(join(folder,name));j[name]=JSON.parse(raw[name].toString('utf8'));}
  const x=j['relay-crossing.json'],t=j['ghot-task.json'],g=j['ghot-receipt.json'],
        b=j['loadout-binding.json'],p=j['loadout-parameters.json'];
  must(x.schema==='static-relay/loadout-ghot-media-probe/v0' &&
    x.status==='PROBED_NATIVE_GHOT' && x.source_unchanged===true &&
    x.ghot_output_sha256_valid===true && x.signed===false &&
    x.published===false && x.canon_admitted===false,'DONOR_STATUS_INVALID');
  must(/^[0-9a-f]{64}$/.test(x.source_sha256) &&
    x.source_sha256===x.source_sha256_after,'SOURCE_HASH_INVALID');
  must(t.kind==='ghot.task' && t.version==='0' && t.capability==='media.probe' &&
    g.kind==='ghot.receipt' && g.version==='0' && g.capability==='media.probe' &&
    g.status==='ok' && g.error===null && g.output?.probe?.format &&
    g.task_id===t.task_id && g.task_id===x.ghot_task_id &&
    g.receipt_id===x.ghot_receipt_id,'TASK_RECEIPT_DRIFT');
  must(b.disposition==='BIND' && b.capability==='media.probe' &&
    b.authority_delta==='none' && b.probe_receipt_required===true &&
    Array.isArray(b.unfenced_effects) && b.unfenced_effects.length===0,
    'LOADOUT_NOT_BOUND');
  must(p.capability==='media.probe' && p.source_sha256===x.source_sha256 &&
    t.input===p.path && g.output.path===p.path &&
    t.constraints?.source_sha256===x.source_sha256 &&
    t.constraints?.loadout_parameter_digest===b.parameter_digest &&
    x.loadout_parameter_digest===b.parameter_digest &&
    hashJSON(p)===b.parameter_digest &&
    hashJSON(b)===x.loadout_binding_digest,'PARAMETER_OR_EFFECT_DRIFT');
  must(hex(Buffer.from(canonical(g.output,true)))===g.output_sha256 &&
    hashJSON(g)===x.ghot_receipt_digest,'GHOT_RECEIPT_HASH_DRIFT');
  if(mediaFile) must(hex(await readFile(mediaFile))===x.source_sha256,
    'MEDIA_BYTES_DIFFER_FROM_DONOR');
  return {schema:'static-relay/ghot-donor-manifest/v0',
    source_sha256:x.source_sha256,ghot_receipt_id:g.receipt_id,
    ghot_task_id:t.task_id,loadout_binding_digest:x.loadout_binding_digest,
    artifacts:files.map(name=>({name,address:'sha256:'+hex(raw[name])})),
    donor_signed:false};
}
export async function verifyHeld(result,donor) {
  must(await verifyOpaqueOrganCrossing(result.crossing),'CROSSING_SIGNATURE_INVALID');
  must(await verifyReceipt(result.receive_receipt),'RECEIVE_SIGNATURE_INVALID');
  must(await verifyReceipt(result.disposition_receipt),'HOLD_SIGNATURE_INVALID');
  const carried=await verifyAndExtractTransportFrame(result.transport_frame);
  must(carried.crossing_id===result.crossing.crossing_id &&
    result.receive_receipt.crossing_id===result.crossing.crossing_id &&
    result.disposition_receipt.crossing_id===result.crossing.crossing_id,
    'CROSSING_ID_DRIFT');
  must(result.receive_receipt.kind==='RECEIVED' &&
    result.receive_receipt.semantic_effect==='none' &&
    result.disposition_receipt.kind==='R3_HOLD' &&
    result.disposition_receipt.semantic_effect==='none' &&
    result.receiver_snapshot.admitted.length===0 &&
    result.receiver_snapshot.held.includes(result.crossing.crossing_id),
    'RECEIVER_WAS_NOT_HELD');
  const refs=new Set(result.crossing.payload_refs.map(x=>x.address));
  for(const a of donor.artifacts) must(refs.has(a.address),'DONOR_ARTIFACT_HASH_MISSING');
  must(result.crossing.source_history_head==='sha256:'+donor.source_sha256 &&
    result.crossing.extensions.organ_adapter.donor_claims.ghot_receipt_id===donor.ghot_receipt_id,
    'SOURCE_LINEAGE_DRIFT');
  return {schema:'static-relay/relatte-hold-verification/v0',
    crossing_id:result.crossing.crossing_id,
    signed_crossing_valid:true,signed_receive_valid:true,signed_hold_valid:true,
    source_sha256:donor.source_sha256,disposition:'HOLD',
    semantic_effect:'none',published:false,canon_admitted:false};
}
export async function runRelay(evidenceFolder,outFolder,mediaFile=null) {
  const donor=await validateDonor(resolve(evidenceFolder),mediaFile);
  const out=resolve(outFolder),ts=Date.now(),when=n=>new Date(ts+1000*n).toISOString();
  const request={
    schema:'relatte.opaque-roundtrip-request/v0',
    spec:{
      schema:'relatte.opaque-organ-spec/v0',family_ref:'organ:ghot/media-probe',
      donor_contract_ref:'ghot.receipt/0 + loadout.bind',
      artifact_kind:'local-media-probe-evidence',
      source_world:'world:relay001-ghot',
      source_particular:'particular:ghot:'+donor.ghot_receipt_id,
      source_history_head:'sha256:'+donor.source_sha256,
      payload_refs:donor.artifacts.map(a=>({
        address:a.address,role:'local-evidence:'+a.name,media_type:'application/json'})),
      donor_claims:{
        ghot_receipt_id:donor.ghot_receipt_id,ghot_task_id:donor.ghot_task_id,
        source_media_sha256:donor.source_sha256,
        loadout_binding_digest:donor.loadout_binding_digest,
        ghot_cryptographically_signed:false,authority_transferred:false
      },
      requested_effect:{kind:'inspect-held-evidence',authority:'receiver-local',
        song_bytes_transferred:false,execute:false,publish:false},
      return_address:'return:relay001-private',created_at:when(0)
    },
    receiver_root:join(out,'private-receiver'),
    receiver:{world_id:'world:relay001-review',
      receiver_particular:'particular:relay001-local-reviewer',
      contract_ref:'contract:relay001-hold-only/v0'},
    bundle_path:join(out,'public','transport-bundle.json'),
    result_path:join(out,'public','roundtrip-result.json'),
    disposition:'HOLD',transport_created_at:when(1),
    received_at:when(2),disposed_at:when(3),
    route_note:'verified GHoT donor evidence; no audio transferred'
  };
  const result=await runOpaqueOrganRoundTrip(request);
  const verification=await verifyHeld(result,donor);
  await mkdir(join(out,'public'),{recursive:true});
  await writeFile(join(out,'public','donor-manifest.json'),JSON.stringify(donor,null,2)+'\n');
  await writeFile(join(out,'public','verification.json'),JSON.stringify(verification,null,2)+'\n');
  const replay=await runOpaqueOrganRoundTrip(request);
  must(replay.crossing.crossing_id===result.crossing.crossing_id &&
    replay.disposition_receipt.receipt_id===result.disposition_receipt.receipt_id,
    'REPLAY_NOT_IDEMPOTENT');
  return verification;
}
async function main() {
  const args=process.argv.slice(2);
  if(args[0]==='verify') {
    must(args.length===3,'Usage: verify DONOR_FOLDER PUBLIC_FOLDER');
    const donor=await validateDonor(resolve(args[1]));
    console.log(JSON.stringify(await verifyHeld(
      await readJSON(join(resolve(args[2]),'roundtrip-result.json')),donor),null,2));
  } else {
    must(args.length===2 || args.length===3,
      'Usage: DONOR_FOLDER OUT_FOLDER [SOURCE_AUDIO]');
    console.log(JSON.stringify(await runRelay(args[0],args[1],args[2]??null),null,2));
  }
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
