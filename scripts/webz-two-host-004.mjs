/** TWO-HOST-WEBZ-004: brokered, machine-separated first-party material crossing.
 * 
 * Sender job A signs source crossing and exports literal bytes, never signing keys.
 * Receiver job B opens GitHub-delivered carriers, independently chooses Orchard's
 * policy and signs RECEIVE + disposition + exact-byte custody using a NEW key.
 * Verifier job C independently verifies both signature families and byte digests.
 *
 * Transport is GitHub Actions artifacts, NOT a direct authenticated peer channel.
 * The host fingerprint is a diagnostic, not a platform hardware attestation.
 */
import { readFile, writeFile, mkdir, lstat, readdir, access } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { hostname } from 'node:os';
import { createHash } from 'node:crypto';
import {
  generateP256KeyPair, sealCrossingEnvelope, verifyCrossingEnvelope,
  verifyReceipt, sha256Hex, LocalReceiver, receiveMaterialDelivery,
} from '../src/index.ts';

const SRC = 'webz:the-static-collective/sanctuary';
const DST = 'webz:the-static-collective/orchard-022100';
const RECEIVER = 'particular:webz:orchard-local-inbox';
const CONTRACT = 'contract:webz:orchard-fixture-inbox/v0';
const KINDS = Object.freeze({
  fruit: { artifact_kind: 'fictional-reality-fruit', disposition: 'HOLD' },
  spore: { artifact_kind: 'fictional-uninvited-spore', disposition: 'REFUSE' },
});
const FIXTURE_KEYS = ['schema','artifact_kind','world_id','title','description','fictional','publication_scope','seed'];
const MAX = 110000;
const validate = (condition, code) => {if (!condition) throw new Error(code);};
const isRecord = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const exact = (value, fields) => isRecord(value) && Object.keys(value).length === fields.length &&
  fields.every(field => Object.hasOwn(value,field));
const normalize = (a) => resolve(a);
const forbid = (v, code='PRIVATE_MATERIAL_IN_PUBLIC_ARTIFACT') => {
  if (!v || typeof v !== 'object') return;
  for (const [key, value] of Object.entries(v)) {
    // No private signing key or raw credential data may travel in receipts.
    validate(!['d','p','q','dp','dq','qi','private_key','privateKey','receiver-key.json','token','password'].includes(key),code);
    forbid(value,code);
  }
};
async function readBounded(path,max=MAX) {
  const info = await lstat(path);
  validate(info.isFile() && !info.isSymbolicLink() && info.size>0 && info.size<=max,'UNSAFE_OR_OVERSIZED_ARTIFACT');
  const bytes=await readFile(path);
  validate(bytes.length<=max,'OVERSIZED_ARTIFACT');
  return bytes;
}
async function parse(path,max=MAX) {
  const raw=await readBounded(path,max);
  let obj;
  try {obj=JSON.parse(raw.toString('utf8'));}
  catch (_) {throw new Error('MALFORMED_ARTIFACT_JSON');}
  validate(isRecord(obj),'ARTIFACT_OBJECT_REQUIRED');
  return obj;
}
async function outJson(dir,filename,value) {
  await mkdir(dir,{recursive:true});
  forbid(value);
  await writeFile(join(dir,filename),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
}
async function fingerprint() {
  let boot='no-boot-id';
  try {boot=(await readFile('/proc/sys/kernel/random/boot_id','utf8')).trim();}
  catch (_) {/* portably fall back to hostname (weaker diagnostic) */}
  return sha256Hex(Buffer.from(hostname()+'|'+boot));
}
export async function jobWitness(role,runId=process.env.GITHUB_RUN_ID||'local') {
  return {role,run_id:String(runId),machine_fingerprint:await fingerprint()};
}
function assertFixture(data,kind) {
  validate(Object.hasOwn(KINDS,kind),'UNKNOWN_FIXTURE_KIND');
  validate(exact(data,FIXTURE_KEYS),'UNRECOGNIZED_FIXTURE_FIELDS');
  validate(data.schema==='webz.artifact/v0' &&
    data.artifact_kind===KINDS[kind].artifact_kind &&
    data.world_id===SRC && data.publication_scope==='public-first-party-test-fixture' &&
    data.fictional===true && data.seed==='022100','UNAUTHORIZED_FIXTURE');
  validate(typeof data.title==='string' && data.title.length>0 && data.title.length<=120 &&
    typeof data.description==='string' && data.description.length>0 && data.description.length<=500,
    'INVALID_FIXTURE_COPY');
}
function validateCarrier(value,kind) {
  validate(exact(value,['schema','crossing','payload_base64']),'INVALID_CARRIER_SHAPE');
  validate(value.schema==='webz.material-carrier/v0','INVALID_CARRIER_SCHEMA');
  validate(typeof value.payload_base64==='string' &&
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.payload_base64),
    'INVALID_BASE64');
  const bytes=Buffer.from(value.payload_base64,'base64');
  validate(bytes.length>0 && bytes.length<=4096 && bytes.toString('base64')===value.payload_base64,
    'INVALID_CARRIER_BYTES');
  let fixture;
  try {fixture=JSON.parse(bytes.toString('utf8'));}
  catch (_) {throw new Error('MALFORMED_FIXTURE_BYTES');}
  assertFixture(fixture,kind);
  const c=value.crossing;
  validate(isRecord(c),'INVALID_SIGNED_CROSSING');
  const digest=sha256Hex(bytes);
  validate(c.schema==='relatte.crossing-envelope/v0' &&
    c.source_world===SRC &&
    c.source_particular==='particular:webz:fixture:'+kind+':sha256:'+digest &&
    c.declared_kind==='OPAQUE_ORGAN_ARTIFACT' &&
    c.return_address==='webz::static/sanctuary' &&
    c.requested_effect?.kind==='candidate-world-parcel-ingress' &&
    c.requested_effect?.authority==='orchard-receiver-local' &&
    Array.isArray(c.payload_refs) && c.payload_refs.length===1 &&
    c.payload_refs[0].address==='sha256:'+digest &&
    c.payload_refs[0].role==='fictional-first-party-artifact' &&
    c.payload_refs[0].media_type==='application/json' &&
    c.extensions?.webz_004?.kind===kind,'CARRIER_NOT_BOUND_TO_DECLARED_SOURCE');
  return {bytes,fixture,crossing:c,digest};
}
function instant(add=0) {return new Date(Date.now()+add*1000).toISOString();}
function receiptKey(receipt) {const key=receipt?.signing?.public_key;validate(isRecord(key),'MISSING_RECEIVER_SIGNER');return JSON.stringify(key);}
function safeJobMeta(x,role) {
  validate(exact(x,['role','run_id','machine_fingerprint']) &&
    x.role===role && typeof x.run_id==='string' &&
    /^([0-9]{1,20}|local)$/.test(x.run_id) &&
    /^[a-f0-9]{64}$/.test(x.machine_fingerprint),'INVALID_RUNNER_WITNESS');
}
function assertSeparate(source,receiver) {
  safeJobMeta(source,'sender'); safeJobMeta(receiver,'receiver');
  validate(source.run_id===receiver.run_id,'RUN_IDS_DO_NOT_MATCH');
  validate(source.machine_fingerprint!==receiver.machine_fingerprint,'NO_INDEPENDENT_RUNNER_EVIDENCE');
}

export async function prepareSender(fixtureRoot,outputDir,source=null) {
  source ??= await jobWitness('sender');
  safeJobMeta(source,'sender');
  await mkdir(outputDir,{recursive:true});
  const stamps={};
  for (const kind of Object.keys(KINDS)) {
    const raw=await readBounded(join(fixtureRoot,'webz-'+kind+'.json'),4096);
    let object;
    try {object=JSON.parse(raw.toString('utf8'));}catch (_) {throw new Error('BAD_FIRST_PARTY_FIXTURE');}
    assertFixture(object,kind);
    const digest=sha256Hex(raw);
    const crossing=await sealCrossingEnvelope({
      schema:'relatte.crossing-envelope/v0',
      protocol_version:'0',
      source_particular:'particular:webz:fixture:'+kind+':sha256:'+digest,
      source_world:SRC,
      source_history_head:null,parents:[],
      declared_kind:'OPAQUE_ORGAN_ARTIFACT',
      payload_refs:[{address:'sha256:'+digest,role:'fictional-first-party-artifact',media_type:'application/json'}],
      requested_effect:{kind:'candidate-world-parcel-ingress',authority:'orchard-receiver-local'},
      capability_ref:null,privacy_policy:null,audience_policy:null,
      return_address:'webz::static/sanctuary',created_at:instant(),
      extensions:{webz_004:{kind,law:'CROSSING != ADMISSION'}},
    },await generateP256KeyPair());
    validate(await verifyCrossingEnvelope(crossing),'SENDER_SIGNATURE_FAILED');
    const carrier={schema:'webz.material-carrier/v0',crossing,payload_base64:raw.toString('base64')};
    await outJson(outputDir,'carrier-'+kind+'.json',carrier);
    const written=await readBounded(join(outputDir,'carrier-'+kind+'.json'));
    stamps[kind]={sha256:sha256Hex(written),crossing_id:crossing.crossing_id,payload_sha256:digest};
  }
  const manifest={schema:'webz.two-host-source/v0',source,carriers:stamps};
  await outJson(outputDir,'source-manifest.json',manifest);
  return manifest;
}

async function validateSender(inputDir) {
  const manifest=await parse(join(inputDir,'source-manifest.json'),8192);
  validate(exact(manifest,['schema','source','carriers']) &&
    manifest.schema==='webz.two-host-source/v0' &&
    exact(manifest.carriers,Object.keys(KINDS)),'INVALID_SOURCE_MANIFEST');
  safeJobMeta(manifest.source,'sender');
  const packets={};
  for (const kind of Object.keys(KINDS)) {
    const carrierPath=join(inputDir,'carrier-'+kind+'.json');
    const carrier=await parse(carrierPath);
    const decoded=validateCarrier(carrier,kind);
    validate(await verifyCrossingEnvelope(decoded.crossing),'INVALID_SIGNED_SOURCE_ENVELOPE');
    const meta=manifest.carriers[kind];
    validate(exact(meta,['sha256','crossing_id','payload_sha256']) &&
      meta.sha256===sha256Hex(await readBounded(carrierPath)) &&
      meta.crossing_id===decoded.crossing.crossing_id &&
      meta.payload_sha256===decoded.digest,'INCONSISTENT_ARTIFACT_HANDOFF');
    packets[kind]={...decoded,carrierPath};
  }
  const files=(await readdir(inputDir)).sort();
  validate(JSON.stringify(files)===JSON.stringify(['carrier-fruit.json','carrier-spore.json','source-manifest.json']),
    'UNEXPECTED_SOURCE_ARTIFACT_CONTENTS');
  return {manifest,packets};
}

export async function processReceiver(inputDir,publicOutputDir,privateRoot,remote=null) {
  remote ??= await jobWitness('receiver');
  safeJobMeta(remote,'receiver');
  const {manifest,packets}=await validateSender(inputDir);
  assertSeparate(manifest.source,remote);
  // The receiver root never lives beneath a directory uploaded to the artifact broker.
  const rel=relative(normalize(publicOutputDir),normalize(privateRoot));
  validate(rel==='..' || rel.startsWith('..'+String.fromCharCode(47)) ||
    isAbsolute(rel),'PRIVATE_RECEIVER_ROOT_INSIDE_PUBLIC_ARTIFACT');
  const receiver=await LocalReceiver.create(privateRoot,{
    world_id:DST,receiver_particular:RECEIVER,contract_ref:CONTRACT,
  });
  const result={};
  for (const [index,kind] of Object.keys(KINDS).entries()) {
    const crossing=packets[kind].crossing;
    const existing=await receiver.receive(crossing,instant(index*4));
    validate(await verifyReceipt(existing),'RECEIVER_RECEIVE_SIGNATURE_FAILED');
    await receiver.dispose(crossing.crossing_id,KINDS[kind].disposition,instant(index*4+1));
    // This existing reLATTE primitive reads the *actual* carrier bytes here,
    // validates sha256, signs custody with B-local key, then cold replays it.
    const material=await receiveMaterialDelivery({
      schema:'relatte.material-delivery/v0',
      carrier_path:normalize(packets[kind].carrierPath),
      receiver_root:normalize(privateRoot),
      expected_crossing_id:crossing.crossing_id,
      created_at:instant(index*4+2),
    });
    validate(material.receiver_world_id===DST &&
      material.receiver_disposition==='R3_'+KINDS[kind].disposition &&
      material.receiver_snapshot?.admitted?.length===0,'RECEIVER_POLICY_NOT_PRESERVED');
    result[kind]=material;
  }
  const publicWitness={
    schema:'webz.two-host-receiver/v0',
    source:manifest.source,
    receiver:remote,
    source_manifest_sha256:sha256Hex(await readBounded(join(inputDir,'source-manifest.json'))),
    results:result,
    scope:'brokered-transport;separate-ci-runners;recipient-signed-bytes;no-admission',
  };
  await outJson(publicOutputDir,'orchard-public-receipts.json',publicWitness);
  const actual=(await readdir(publicOutputDir)).sort();
  validate(JSON.stringify(actual)===JSON.stringify(['orchard-public-receipts.json']),
    'UNEXPECTED_RECEIVER_PUBLIC_CONTENTS');
  return publicWitness;
}

export async function verifyTransfer(inputDir,publicReceiverDir) {
  const {manifest,packets}=await validateSender(inputDir);
  const proof=await parse(join(publicReceiverDir,'orchard-public-receipts.json'),220000);
  validate(exact(proof,['schema','source','receiver','source_manifest_sha256','results','scope']) &&
    proof.schema==='webz.two-host-receiver/v0' &&
    proof.scope==='brokered-transport;separate-ci-runners;recipient-signed-bytes;no-admission' &&
    JSON.stringify(proof.source)===JSON.stringify(manifest.source) &&
    proof.source_manifest_sha256===sha256Hex(await readBounded(join(inputDir,'source-manifest.json'))) &&
    exact(proof.results,Object.keys(KINDS)),'UNVERIFIED_PUBLIC_WITNESS');
  assertSeparate(proof.source,proof.receiver);
  const publicFiles=(await readdir(publicReceiverDir)).sort();
  validate(JSON.stringify(publicFiles)===JSON.stringify(['orchard-public-receipts.json']),
    'UNEXPECTED_RECIPIENT_PUBLIC_ARTIFACT');
  forbid(proof);
  const identities={};
  let receiverKey=null;
  for (const kind of Object.keys(KINDS)) {
    const material=proof.results[kind];
    const crossing=packets[kind].crossing;
    validate(isRecord(material),'INVALID_DESTINATION_WITNESS');
    const receive=material.receive_receipt;
    const disposition=material.disposition_receipt;
    const custody=material.custody_receipt;
    validate(material.schema==='relatte.material-delivery-result/v0' &&
      material.crossing_id===crossing.crossing_id &&
      material.receiver_world_id===DST &&
      material.payload_sha256===packets[kind].digest &&
      material.received_byte_length===packets[kind].bytes.length &&
      material.receiver_disposition==='R3_'+KINDS[kind].disposition &&
      material.retained===(KINDS[kind].disposition==='HOLD') &&
      material.receiver_snapshot?.admitted?.length===0 &&
      material.receiver_snapshot?.world_id===DST &&
      material.receiver_snapshot?.[KINDS[kind].disposition==='HOLD'?'held':'refused']?.includes(crossing.crossing_id),
      'DESTINATION_RECEIVER_CONTRADICTS_BYTES_OR_POLICY');
    for (const [receipt,type] of [[receive,'RECEIVED'],[disposition,'R3_'+KINDS[kind].disposition],[custody,'PAYLOAD_BYTES_VERIFIED']]) {
      validate(isRecord(receipt) && receipt.schema==='relatte.receipt/v0' &&
        receipt.kind===type && receipt.crossing_id===crossing.crossing_id &&
        receipt.world_id===DST && receipt.receiver_particular===RECEIVER &&
        receipt.semantic_effect==='none' && await verifyReceipt(receipt),
        'INVALID_DESTINATION_SIGNED_RECEIPT');
    }
    const key=receiptKey(receive);
    validate(receiptKey(disposition)===key && receiptKey(custody)===key &&
      key!==JSON.stringify(crossing.signing.public_key),'MIXED_OR_SELF_SIGNED_RECIPIENT_KEY');
    if (receiverKey!==null) validate(receiverKey===key,'RECEIVER_KEY_ROTATED_BETWEEN_PARCELS');
    receiverKey=key;
    const custodyInfo=custody.extensions?.local_receiver?.payload_custody;
    validate(isRecord(custodyInfo) && custodyInfo.sha256===packets[kind].digest &&
      custodyInfo.byte_length===packets[kind].bytes.length &&
      custodyInfo.disposition===KINDS[kind].disposition &&
      custodyInfo.retained===(KINDS[kind].disposition==='HOLD') &&
      custodyInfo.receive_receipt_id===receive.receipt_id &&
      custodyInfo.disposition_receipt_id===disposition.receipt_id &&
      material.retained===custodyInfo.retained,'CUSTODY_NOT_BOUND_TO_PREEXISTING_RECEIPTS');
    identities[kind]={
      crossing_id:crossing.crossing_id,
      receipt_id:custody.receipt_id,
      disposition:KINDS[kind].disposition,
      payload_sha256:packets[kind].digest,
    };
  }
  return {
    schema:'webz.two-host-verification/v0',
    verified:true,
    run_id:proof.source.run_id,
    sender_machine_fingerprint:proof.source.machine_fingerprint,
    receiver_machine_fingerprint:proof.receiver.machine_fingerprint,
    artifacts:identities,
    scope:'GitHub-artifact-relayed distinct jobs;not-authenticated-direct-network-peer',
  };
}

async function main() {
  const [command,...args]=process.argv.slice(2);
  if(command==='sender' && args.length===2) {
    const r=await prepareSender(args[0],args[1]);
    process.stdout.write(JSON.stringify({status:'SOURCE_SIGNED',id:r.source})+'\n');return;
  }
  if(command==='receiver' && args.length===3) {
    const r=await processReceiver(args[0],args[1],args[2]);
    process.stdout.write(JSON.stringify({status:'ORCHARD_CUSTODY_SIGNED',id:r.receiver})+'\n');return;
  }
  if(command==='verify' && args.length===2) {
    const r=await verifyTransfer(args[0],args[1]);
    process.stdout.write(JSON.stringify(r,null,2)+'\n');return;
  }
  throw new Error('USAGE: sender <fixture-root> <out> | receiver <carrier-dir> <public-out> <private-root> | verify <carrier-dir> <public-receipts-dir>');
}
if (process.argv[1] && resolve(process.argv[1])===new URL(import.meta.url).pathname) {
  main().catch(e=>{process.stderr.write(String(e?.message??'WEBZ004_FAILED')+'\n');process.exitCode=1;});
}
