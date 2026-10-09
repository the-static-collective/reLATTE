import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  LocalReceiver, RelatteVm, createVmManifest, createWasmVmPackage,
  generateP256KeyPair, proposeWasmVm, sealReceipt, sealCrossingEnvelope,
  createVm004Offer, verifyVm004Offer, createVm004Ack, verifyVm004Ack,
  createVm004Grant, verifyVm004Grant, runVm004Lease, verifyVm004Usage,
} from '../src/index.ts';

const wasm = Buffer.from('AGFzbQEAAAABBwFgAn9/AX8DAgEABwgBBHN0ZXAAAAoJAQcAIAAgAWoL','base64');
const iso=(n:number)=>new Date(Date.now()+n).toISOString();
const identity=(x:string)=>({
  world_id:'world:004-'+x,particular:'particular:004-'+x,runtime_id:'runtime:004-'+x,
});
async function fixture(base:string, nowOffset=0) {
  const manifest=createVmManifest(8,1);
  const parent=new RelatteVm(manifest,identity('outer'));
  const guest=parent.spawnGuest(identity('guest'));
  guest.increment();
  const sourceKeys=await generateP256KeyPair();
  const parent_crossing=await guest.proposeSelf(sourceKeys,iso(-5000));
  const pkg=createWasmVmPackage(manifest,wasm,1500);
  const wasm_crossing=await proposeWasmVm({
    manifest,parent_crossing,wasm_bytes:wasm,package:pkg,
    signing_keys:sourceKeys,created_at:iso(-4000),
  });
  const candidate={manifest,parent_crossing,wasm_crossing,package:pkg,wasm_bytes:wasm};
  const senderKeys=await generateP256KeyPair();
  const receiverKeys=await generateP256KeyPair();
  const witnessKeys=await generateP256KeyPair();
  const receiver=await LocalReceiver.create(join(base,'host'),{
    world_id:'world:004-owner',
    receiver_particular:'particular:004-owner',
    contract_ref:'contract:vm004-owner/v0',
  });
  const receive_receipt=await receiver.receive(wasm_crossing,iso(-3500));
  const admit_receipt=await receiver.dispose(wasm_crossing.crossing_id,'ADMIT',iso(-3000),
    {admit_effect:'relatte-wasm-vm-launch'});
  const evidence={receive_receipt,admit_receipt,owner:{
    world_id:receiver.config.world_id,
    receiver_particular:receiver.config.receiver_particular,
    contract_ref:receiver.config.contract_ref,
    public_key:structuredClone(receive_receipt.signing.public_key),
  }};
  const pins={
    sender_public_key:senderKeys.publicKeyJwk,
    receiver_public_key:receiverKeys.publicKeyJwk,
    receiver_world_id:receiver.config.world_id,
    receiver_particular:receiver.config.receiver_particular,
  };
  const offer=await createVm004Offer({
    candidate,sender_keys:senderKeys,
    sender_world_id:'world:004-sender',sender_particular:'particular:004-sender',
    pins,left:19,right:23,
    created_at:iso(-2000+nowOffset),
    expires_at:iso(150000+nowOffset),
  });
  const ack=await createVm004Ack({candidate,offer,pins,receiver_keys:receiverKeys,
    created_at:iso(-1500+nowOffset)});
  const handshake={candidate,offer,ack,pins};
  const grant=await createVm004Grant({
    handshake,evidence,receiver_keys:receiverKeys,
    created_at:iso(-1000+nowOffset),expires_at:iso(90000+nowOffset),
  });
  return {
    receiver,receiverKeys,witnessKeys,senderKeys,pins,handshake,
    lease:{...handshake,evidence,grant},
  };
}

test('VM004 signed offer and acknowledgment remain separate from R3 admission',async()=>{
  const base=await mkdtemp(join(tmpdir(),'vm004-auth-'));
  try {
    const f=await fixture(base);
    const {candidate,offer,ack,pins}=f.handshake;
    assert.equal(await verifyVm004Offer(candidate,offer,pins),true);
    assert.equal(await verifyVm004Ack(candidate,offer,ack,pins),true);
    assert.equal(await verifyVm004Grant(f.lease),true);
    assert.equal(ack.semantic_effect,'none');
    assert.equal(f.lease.grant.semantic_effect,'none');
    assert.equal(f.lease.grant.extensions.vm004.max_uses,1);
    assert.equal(f.lease.grant.extensions.vm004.input_digest,offer.extensions.vm004.input_digest);
    assert.notDeepEqual(offer.signing.public_key,ack.signing.public_key);
    assert.notDeepEqual(f.lease.evidence.admit_receipt.signing.public_key,ack.signing.public_key);
  } finally {await rm(base,{recursive:true,force:true});}
});

test('VM004 one expiring local grant enables one witnessed execution, not two, with cold-verifiable usage',async()=>{
  const base=await mkdtemp(join(tmpdir(),'vm004-once-'));
  try {
    const f=await fixture(base);
    const args={
      lease:f.lease,host_root:f.receiver.root,successor:identity('run-once'),
      receiver_keys:f.receiverKeys,witness_keys:f.witnessKeys,
      pinned_witness_key:f.witnessKeys.publicKeyJwk,
      runner_label:'test-host-b',observed_at:iso(0),
    };
    const run=await runVm004Lease(args);
    assert.equal(run.observed.run.result,42);
    assert.equal(run.usage_receipt.semantic_effect,'none');
    assert.equal(run.usage_receipt.extensions.vm004.observed_wall_ms,
      run.observed.receipt.extensions.vm003.resource.observed_wall_ms);
    assert.equal(await verifyVm004Usage({
      lease:f.lease,receipt:run.usage_receipt,
      witness_receipt:run.observed.receipt,pinned_witness_key:f.witnessKeys.publicKeyJwk,
    }),true);
    await assert.rejects(runVm004Lease({...args,successor:identity('try-again')}),/VM004_LEASE_ALREADY_SPENT/);
    const altered=structuredClone(run.usage_receipt);
    altered.extensions.vm004.observed_wall_ms+=1;
    assert.equal(await verifyVm004Usage({
      lease:f.lease,receipt:altered,
      witness_receipt:run.observed.receipt,pinned_witness_key:f.witnessKeys.publicKeyJwk,
    }),false);
    await rm(f.receiver.root,{recursive:true,force:true});
    assert.equal(await verifyVm004Usage({
      lease:f.lease,receipt:run.usage_receipt,
      witness_receipt:run.observed.receipt,pinned_witness_key:f.witnessKeys.publicKeyJwk,
    }),true);
    await assert.rejects(runVm004Lease({...args,successor:identity('host-died')}),/VM004_HOST_NOT_LIVE/);
  } finally {await rm(base,{recursive:true,force:true});}
});

test('VM004 replay denial is atomic across concurrent attempts, and a valid signature does not authorize swapped claims',async()=>{
  const base=await mkdtemp(join(tmpdir(),'vm004-concurrent-'));
  try {
    const f=await fixture(base);
    const args={
      lease:f.lease,host_root:f.receiver.root,
      successor:identity('concurrent'),receiver_keys:f.receiverKeys,
      witness_keys:f.witnessKeys,pinned_witness_key:f.witnessKeys.publicKeyJwk,
      runner_label:'concurrent',observed_at:iso(0),
    };
    const results=await Promise.allSettled([runVm004Lease(args),runVm004Lease(args)]);
    assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
    assert.equal(results.filter(x=>x.status==='rejected' &&
      String(x.reason).includes('VM004_LEASE_ALREADY_SPENT')).length,1);

    const old=f.lease.grant;
    const wrong=await sealReceipt({
      ...old,extensions:{vm004:{...old.extensions.vm004,max_uses:999}},
    },f.receiverKeys);
    assert.equal(await verifyVm004Grant({...f.lease,grant:wrong}),false);
    const badGrant=await sealReceipt({
      ...old,extensions:{vm004:{...old.extensions.vm004,inherited_grants:['operator']}},
    },f.receiverKeys);
    assert.equal(await verifyVm004Grant({...f.lease,grant:badGrant}),false);
    const attacker=await generateP256KeyPair();
    assert.equal(await verifyVm004Grant({
      ...f.lease,grant:await sealReceipt(old,attacker),
    }),false);
    const badOffer=await sealCrossingEnvelope({
      ...f.handshake.offer,
      extensions:{vm004:{...f.handshake.offer.extensions.vm004,input:{left:99,right:23}}},
    },f.senderKeys);
    assert.equal(await verifyVm004Offer(f.handshake.candidate,badOffer,f.pins),false);
    assert.equal(await verifyVm004Ack(
      f.handshake.candidate,badOffer,f.handshake.ack,f.pins),false);
  } finally {await rm(base,{recursive:true,force:true});}
});

test('VM004 short-lived grant expires and not-yet-active grant cannot execute even with valid signatures',async()=>{
  const base=await mkdtemp(join(tmpdir(),'vm004-time-'));
  try {
    const expired=await fixture(join(base,'expired'),-180000);
    assert.equal(await verifyVm004Grant(expired.lease),true);
    await assert.rejects(runVm004Lease({
      lease:expired.lease,host_root:expired.receiver.root,
      successor:identity('expired'),witness_keys:expired.witnessKeys,
      receiver_keys:expired.receiverKeys,
      pinned_witness_key:expired.witnessKeys.publicKeyJwk,
      runner_label:'past',observed_at:iso(0),
    }),/VM004_LEASE_EXPIRED_OR_EARLY/);
    const early=await fixture(join(base,'future'),60000);
    assert.equal(await verifyVm004Grant(early.lease),true);
    await assert.rejects(runVm004Lease({
      lease:early.lease,host_root:early.receiver.root,
      successor:identity('future'),witness_keys:early.witnessKeys,
      receiver_keys:early.receiverKeys,
      pinned_witness_key:early.witnessKeys.publicKeyJwk,
      runner_label:'future',observed_at:iso(0),
    }),/VM004_LEASE_EXPIRED_OR_EARLY/);
  } finally {await rm(base,{recursive:true,force:true});}
});
