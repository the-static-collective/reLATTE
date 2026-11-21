import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { LocalReceiver } from '../src/receiver.ts';
import { generateP256KeyPair, verifyCrossingEnvelope, verifyReceipt } from '../src/protocol.ts';
import { verifySovereignResponseBundle } from '../src/sovereign.ts';
import {
  inspectProgram,sealProgramProposal,verifyProgramCarrier,deliverProgramForLocalReview,
} from '../src/freeport-008.ts';
import type { ReviewRecord, SourcePin } from '../src/freeport-008.ts';

const time='2026-11-21T23:00:00.000Z';
const proposal=()=>({
  schema:'freeport.program-proposal/v1' as const,program_id:'synthetic-program-008',
  station:'HUMKIN' as const,origin:'MOTIF' as const,
  tracks:[
    {ref:'catalog:synthetic-one',transition:'fade' as const,weight:70},
    {ref:'catalog:synthetic-two',transition:'cut' as const,weight:30},
    {ref:'catalog:synthetic-three',transition:'fade' as const,weight:60},
  ],
  preview_only:true as const,schedule_effect:false as const,
});
async function setup(){
  const root=await mkdtemp(join(tmpdir(),'freeport008-'));
  const keys=await generateP256KeyPair();
  const sourcePin:SourcePin={
    world:'world:synthetic-motif',
    particular:'particular:synthetic-proposer',
    public_key:keys.publicKeyJwk as SourcePin['public_key'],
  };
  const receiver=await LocalReceiver.create(join(root,'tower'),{
    world_id:'world:humkin-tower-synthetic',
    receiver_particular:'particular:synthetic-tower',
    contract_ref:'contract:review-only-008',
  });
  const options={
    sourceKeys:keys,sourceWorld:sourcePin.world,sourceParticular:sourcePin.particular,
    towerWorld:receiver.config.world_id,createdAt:time,ownerApprovedReview:true,
  };
  return {root,keys,sourcePin,receiver,options};
}

test('source consent and exact proposal schema prevent automatic broadcast and hidden code', async()=>{
  const p=proposal();
  assert.equal(inspectProgram(p).tracks.length,3);
  for (const bad of [
    {...p,schedule_effect:true}, {...p,preview_only:false},
    {...p,tracks:[...p.tracks,p.tracks[0]]},
    {...p,callback:'process.exit()'},
    {...p,tracks:[{...p.tracks[0],weight:101}]},
    {...p,tracks:[{...p.tracks[0],ref:'file:///secrets'}]},
  ]) assert.throws(()=>inspectProgram(bad));
  const fixture=await setup();
  try{
    await assert.rejects(()=>sealProgramProposal(p,{...fixture.options,ownerApprovedReview:false}),/SOURCE_APPROVAL_REQUIRED/);
    assert.equal(fixture.receiver.journalLength(),0);
  }finally{await rm(fixture.root,{recursive:true,force:true})}
});

test('native signed crossing, independent TOWER HOLD receipt, return verification and idempotence',async()=>{
  const x=await setup();
  try{
    const carrier=await sealProgramProposal(proposal(),x.options);
    assert.equal(await verifyCrossingEnvelope(carrier.crossing),true);
    const check=await verifyProgramCarrier(carrier,x.sourcePin,x.receiver.config.world_id);
    assert.equal(check.proposal.tracks.length,3);
    const saved=new Map<string,ReviewRecord>();
    const archive={async saveReview(v:ReviewRecord){
      const prior=saved.get(v.crossing_id);
      if (prior && JSON.stringify(prior)!==JSON.stringify(v)) throw Error('DIVERGENT_REPLAY');
      saved.set(v.crossing_id,v);
    }};
    const {record}=await deliverProgramForLocalReview(carrier,{
      sourcePin:x.sourcePin,receiver:x.receiver,decision:'HOLD',reviewedAt:time,archive,
    });
    assert.equal(record.disposition,'HOLD');
    assert.equal(record.response_bundle.disposition_receipt.semantic_effect,'none');
    assert.equal(await verifyReceipt(record.response_bundle.receive_receipt),true);
    assert.equal(await verifyReceipt(record.response_bundle.disposition_receipt),true);
    assert.equal(await verifySovereignResponseBundle(record.response_bundle,record.crossing_id),true);
    assert.deepEqual(x.receiver.snapshot().admitted,[]);
    assert.equal(x.receiver.snapshot().held.length,1);
    assert.equal(saved.size,1);
    const count=x.receiver.journalLength();
    const repeat=await deliverProgramForLocalReview(carrier,{
      sourcePin:x.sourcePin,receiver:x.receiver,decision:'HOLD',reviewedAt:time,archive,
    });
    assert.equal(repeat.record.crossing_id,record.crossing_id);
    assert.equal(x.receiver.journalLength(),count);
    const reopened=await LocalReceiver.open(join(x.root,'tower'));
    assert.deepEqual(reopened.snapshot(),x.receiver.snapshot());
  }finally{await rm(x.root,{recursive:true,force:true})}
});

test('hostile payload, forged source key, wrong TOWER world and admission are refused',async()=>{
  const x=await setup();
  try{
    const carrier=await sealProgramProposal(proposal(),x.options);
    const wrongKey=await generateP256KeyPair();
    await assert.rejects(()=>verifyProgramCarrier(carrier,{
      ...x.sourcePin,public_key:wrongKey.publicKeyJwk as SourcePin['public_key'],
    },x.receiver.config.world_id),/UNTRUSTED_SOURCE_PIN/);
    await assert.rejects(()=>verifyProgramCarrier(carrier,x.sourcePin,'world:other-tower'),/UNAUTHORIZED_CROSSING_EFFECT/);
    const altered={...carrier,payload_base64:Buffer.from(JSON.stringify({...proposal(),schedule_effect:true})).toString('base64')};
    await assert.rejects(()=>verifyProgramCarrier(altered,x.sourcePin,x.receiver.config.world_id));
    const forged=structuredClone(carrier);
    forged.crossing.requested_effect={operation:'BROADCAST',automatic_schedule:true};
    assert.equal(await verifyCrossingEnvelope(forged.crossing),false);
    await assert.rejects(()=>verifyProgramCarrier(forged,x.sourcePin,x.receiver.config.world_id),/INVALID_RELATTE_SIGNATURE/);
    await assert.rejects(()=>deliverProgramForLocalReview(carrier,{
      sourcePin:x.sourcePin,receiver:x.receiver,decision:'ADMIT' as 'HOLD',reviewedAt:time,
    }),/LIVE_ADMISSION_FORBIDDEN/);
    assert.equal(x.receiver.journalLength(),0);
  }finally{await rm(x.root,{recursive:true,force:true})}
});

test('independent destination REFUSE emits signed no-effect receipt',async()=>{
  const x=await setup();
  try{
    const carrier=await sealProgramProposal(proposal(),x.options);
    const {record}=await deliverProgramForLocalReview(carrier,{
      sourcePin:x.sourcePin,receiver:x.receiver,decision:'REFUSE',reviewedAt:time,
    });
    assert.equal(record.response_bundle.disposition_receipt.kind,'R3_REFUSE');
    assert.equal(record.response_bundle.disposition_receipt.semantic_effect,'none');
    assert.deepEqual(x.receiver.snapshot().admitted,[]);
    assert.equal(x.receiver.snapshot().refused.length,1);
  }finally{await rm(x.root,{recursive:true,force:true})}
});
