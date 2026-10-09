#!/usr/bin/env node
/**
 * RELATTE-VM-004 offline two-computer demonstration.
 * The file transporter is deliberately untrusted; fingerprints must be checked
 * out of band. This is not a network service or a hardened host sandbox.
 */
import { randomUUID, webcrypto } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import {
  LocalReceiver, RelatteVm, canonicalize, sha256Hex,
  createVmManifest, createWasmVmPackage, generateP256KeyPair,
  proposeWasmVm, verifyWasmVmCandidate, createVm004Offer,
  createVm004Ack, createVm004Grant, runVm004Lease,
  verifyVm004Offer, verifyVm004Ack, verifyVm004Grant,
  verifyVm004Usage, verifyWasmExecutionWitness,
} from '../src/index.ts';

const WASM = Buffer.from('AGFzbQEAAAABBwFgAn9/AX8DAgEABwgBBHN0ZXAAAAoJAQcAIAAgAWoL','base64');
const now = () => new Date().toISOString();
const later = ms => new Date(Date.now() + ms).toISOString();
const file = async p => JSON.parse(await readFile(p, 'utf8'));
const saved = async (p, content, secret=false) => {
  await mkdir(dirname(p),{recursive:true,mode:0o700});
  await writeFile(p, JSON.stringify(content,null,2)+'\n',{flag:'wx',mode:secret?0o600:0o644});
};
function fingerprint(publicKey) {
  return 'sha256:'+sha256Hex(Buffer.from(canonicalize(publicKey),'utf8'));
}
function hydrate(carrier) {
  const {wasm_base64,...rest}=carrier;
  if (typeof wasm_base64!=='string') throw Error('MISSING_BINARY_CARRIER');
  return {...rest,wasm_bytes:Buffer.from(wasm_base64,'base64')};
}
async function savePrivateKey(dir,name,keys) {
  const privateJwk=await webcrypto.subtle.exportKey('jwk',keys.privateKey);
  await saved(join(dir,name),privateJwk,true);
}
async function loadPrivateKey(dir,name) {
  const privateJwk=await file(join(dir,name));
  if (privateJwk.kty!=='EC'||privateJwk.crv!=='P-256') throw Error('INVALID_SAVED_PRIVATE_KEY');
  const privateKey=await webcrypto.subtle.importKey('jwk',privateJwk,
    {name:'ECDSA',namedCurve:'P-256'},false,['sign']);
  const publicKeyJwk={kty:'EC',crv:'P-256',x:privateJwk.x,y:privateJwk.y};
  const publicKey=await webcrypto.subtle.importKey('jwk',publicKeyJwk,
    {name:'ECDSA',namedCurve:'P-256'},false,['verify']);
  return {privateKey,publicKey,publicKeyJwk};
}
async function prepare(out) {
  const manifest=createVmManifest(8,1);
  const parent=new RelatteVm(manifest,{
    world_id:'world:vm004-source',particular:'particular:vm004-source',
    runtime_id:'runtime:vm004-source-'+randomUUID(),
  });
  const guest=parent.spawnGuest({
    world_id:'world:vm004-guest',particular:'particular:vm004-guest',
    runtime_id:'runtime:vm004-guest-'+randomUUID(),
  });
  guest.increment();
  const sourceKeys=await generateP256KeyPair();
  const parent_crossing=await guest.proposeSelf(sourceKeys,now());
  const pkg=createWasmVmPackage(manifest,WASM,1500);
  const wasm_crossing=await proposeWasmVm({
    manifest,parent_crossing,wasm_bytes:WASM,package:pkg,
    signing_keys:sourceKeys,created_at:now(),
  });
  await saved(out,{manifest,parent_crossing,wasm_crossing,
    package:pkg,wasm_base64:WASM.toString('base64')});
  console.log(JSON.stringify({stage:'prepare',candidate_id:wasm_crossing.crossing_id,
    only_public_carrier:true}));
}
async function enroll(root,publicCard) {
  const id=randomUUID();
  const receiver=await LocalReceiver.create(join(root,'local-receiver'),{
    world_id:'world:vm004-recipient-'+id,
    receiver_particular:'particular:vm004-recipient-'+id,
    contract_ref:'contract:vm004-execution/v0',
  });
  const peerKeys=await generateP256KeyPair();
  await savePrivateKey(root,'peer-private.jwk',peerKeys);
  const card={
    world_id:receiver.config.world_id,
    receiver_particular:receiver.config.receiver_particular,
    receiver_public_key:peerKeys.publicKeyJwk,
  };
  await saved(join(root,'recipient-public.json'),card);
  await saved(publicCard,card);
  console.log(JSON.stringify({stage:'enroll',recipient_public_fingerprint:fingerprint(card.receiver_public_key),
    private_root:resolve(root),public_card:resolve(publicCard)}));
}
async function offer(candidateFile,recipientCardFile,senderRoot,offerDir) {
  const candidate=hydrate(await file(candidateFile));
  if (!(await verifyWasmVmCandidate(candidate))) throw Error('INVALID_CANDIDATE');
  const card=await file(recipientCardFile);
  const senderKeys=await generateP256KeyPair();
  await savePrivateKey(senderRoot,'sender-private.jwk',senderKeys);
  const id=randomUUID();
  const senderCard={
    world_id:'world:vm004-sender-'+id,
    sender_particular:'particular:vm004-sender-'+id,
    sender_public_key:senderKeys.publicKeyJwk,
  };
  const pins={
    sender_public_key:senderCard.sender_public_key,
    receiver_public_key:card.receiver_public_key,
    receiver_world_id:card.world_id,
    receiver_particular:card.receiver_particular,
  };
  const signed=await createVm004Offer({
    candidate,sender_keys:senderKeys,pins,
    sender_world_id:senderCard.world_id,sender_particular:senderCard.sender_particular,
    left:19,right:23,created_at:now(),expires_at:later(20*60*1000),
  });
  await saved(join(offerDir,'sender-card.json'),senderCard);
  await saved(join(offerDir,'offer.json'),signed);
  console.log(JSON.stringify({stage:'offer',
    sender_public_fingerprint:fingerprint(senderKeys.publicKeyJwk),
    intended_recipient_fingerprint:fingerprint(card.receiver_public_key),
    offer_id:signed.crossing_id,
    expiry:signed.extensions.vm004.expires_at,
    sender_private_root:resolve(senderRoot)}));
}
async function receive(candidateFile,offerFile,senderCardFile,receiverRoot,expectedSenderFingerprint,outDir) {
  const candidate=hydrate(await file(candidateFile));
  const signed=await file(offerFile);
  const senderCard=await file(senderCardFile);
  const card=await file(join(receiverRoot,'recipient-public.json'));
  const receiverKeys=await loadPrivateKey(receiverRoot,'peer-private.jwk');
  if(fingerprint(senderCard.sender_public_key)!==expectedSenderFingerprint)
    throw Error('SENDER_FINGERPRINT_NOT_PINNED');
  if(fingerprint(receiverKeys.publicKeyJwk)!==fingerprint(card.receiver_public_key))
    throw Error('RECIPIENT_PRIVATE_KEY_MISMATCH');
  const pins={
    sender_public_key:senderCard.sender_public_key,
    receiver_public_key:card.receiver_public_key,
    receiver_world_id:card.world_id,receiver_particular:card.receiver_particular,
  };
  if (!(await verifyVm004Offer(candidate,signed,pins)) ||
      signed.source_world!==senderCard.world_id ||
      signed.source_particular!==senderCard.sender_particular) {
    throw Error('AUTHENTICATED_OFFER_REQUIRED');
  }
  const ack=await createVm004Ack({
    candidate,offer:signed,pins,receiver_keys:receiverKeys,created_at:now(),
  });
  const receiver=await LocalReceiver.open(join(receiverRoot,'local-receiver'));
  const receive_receipt=await receiver.receive(candidate.wasm_crossing,now());
  const admit_receipt=await receiver.dispose(candidate.wasm_crossing.crossing_id,
    'ADMIT',now(),{admit_effect:'relatte-wasm-vm-launch'});
  const evidence={
    receive_receipt,admit_receipt,
    owner:{
      world_id:receiver.config.world_id,
      receiver_particular:receiver.config.receiver_particular,
      contract_ref:receiver.config.contract_ref,
      public_key:structuredClone(receive_receipt.signing.public_key),
    },
  };
  const handshake={candidate,offer:signed,ack,pins};
  const expiry=Math.min(Date.now()+120*1000,Date.parse(signed.extensions.vm004.expires_at)-1000);
  if (expiry<=Date.now()) throw Error('VM004_OFFER_TOO_CLOSE_TO_EXPIRY');
  const grant=await createVm004Grant({
    handshake,evidence,receiver_keys:receiverKeys,
    created_at:now(),expires_at:new Date(expiry).toISOString(),
  });
  const witnessKeys=await generateP256KeyPair();
  const lease={...handshake,evidence,grant};
  const observed=await runVm004Lease({
    lease,host_root:receiver.root,receiver_keys:receiverKeys,
    witness_keys:witnessKeys,pinned_witness_key:witnessKeys.publicKeyJwk,
    successor:{
      world_id:'world:vm004-successor-'+randomUUID(),
      particular:'particular:vm004-successor-'+randomUUID(),
      runtime_id:'runtime:vm004-successor-'+randomUUID(),
    },
    runner_label:'host-recipient',observed_at:now(),
  });
  const bundle={
    ack,evidence,grant,
    witness_receipt:observed.observed.receipt,
    pinned_witness_key:witnessKeys.publicKeyJwk,
    usage_receipt:observed.usage_receipt,
  };
  if (!(await verifyVm004Usage({
    lease,receipt:bundle.usage_receipt,
    witness_receipt:bundle.witness_receipt,
    pinned_witness_key:bundle.pinned_witness_key,
  }))) throw Error('VM004_USAGE_INVALID');
  await saved(join(outDir,'public-run.json'),bundle);
  console.log(JSON.stringify({stage:'receive-run',result:observed.observed.run.result,
    use_count:1,usage_receipt_id:observed.usage_receipt.receipt_id,
    recipient_public_fingerprint:fingerprint(pins.receiver_public_key),
    witness_public_fingerprint:fingerprint(witnessKeys.publicKeyJwk),
    no_private_keys_transferred:true}));
}
async function verify(candidateFile,offerFile,senderCardFile,receiverCardFile,
  bundleFile,senderPin,receiverPin) {
  const candidate=hydrate(await file(candidateFile));
  const signed=await file(offerFile);
  const senderCard=await file(senderCardFile);
  const recipientCard=await file(receiverCardFile);
  const bundle=await file(bundleFile);
  if (fingerprint(senderCard.sender_public_key)!==senderPin ||
      fingerprint(recipientCard.receiver_public_key)!==receiverPin) {
    throw Error('PUBLIC_KEY_FINGERPRINT_NOT_PINNED');
  }
  const pins={
    sender_public_key:senderCard.sender_public_key,
    receiver_public_key:recipientCard.receiver_public_key,
    receiver_world_id:recipientCard.world_id,
    receiver_particular:recipientCard.receiver_particular,
  };
  const lease={candidate,offer:signed,ack:bundle.ack,pins,
    evidence:bundle.evidence,grant:bundle.grant};
  if (!(await verifyVm004Ack(candidate,signed,bundle.ack,pins)) ||
      !(await verifyVm004Grant(lease)) ||
      !(await verifyWasmExecutionWitness({
        candidate,evidence:bundle.evidence,receipt:bundle.witness_receipt,
        pinned_witness_key:bundle.pinned_witness_key,
      })) ||
      !(await verifyVm004Usage({
        lease,receipt:bundle.usage_receipt,
        witness_receipt:bundle.witness_receipt,
        pinned_witness_key:bundle.pinned_witness_key,
      }))) throw Error('VM004_PUBLIC_EVIDENCE_INVALID');
  console.log(JSON.stringify({
    stage:'verify',verified:true,
    offer_id:signed.crossing_id,grant_receipt_id:bundle.grant.receipt_id,
    witness_receipt_id:bundle.witness_receipt.receipt_id,
    usage_receipt_id:bundle.usage_receipt.receipt_id,
    reported_output:bundle.witness_receipt.extensions.vm003.observed_result,
    external_key_pins_checked:true,
    caveat:'cryptographic attribution, not a hardware execution attestation',
  }));
}
const [op,...args]=process.argv.slice(2);
if (op==='prepare'&&args.length===1) await prepare(...args);
else if(op==='enroll'&&args.length===2) await enroll(...args);
else if(op==='offer'&&args.length===4) await offer(...args);
else if(op==='receive'&&args.length===6) await receive(...args);
else if(op==='verify'&&args.length===7) await verify(...args);
else throw Error('USAGE: prepare candidate.json | enroll receiver-private-root public-card.json | offer candidate.json recipient-card.json sender-private-root offer-dir | receive candidate.json offer.json sender-card.json recipient-private-root sender-key-fingerprint out-dir | verify candidate.json offer.json sender-card.json recipient-card.json public-run.json sender-fingerprint recipient-fingerprint');
