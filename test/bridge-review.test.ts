import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {LocalReceiver} from '../src/receiver.ts';
import {generateP256KeyPair,verifyReceipt} from '../src/protocol.ts';
import {deliverBridgeForReview,inspectBridgeCard} from '../src/bridge-review.ts';

function card(target:'JARVIS'|'PLANZ'='JARVIS'){
 const sourceCommit='27c280d5297e593512d85eb3c83d74904856cfdf';
 const p={schema:'abundent.bridge-work-card/v1',sourceCommit,
 sourceUrl:'https://github.com/the-static-collective/webZ/blob/'+sourceCommit+'/bridge/network/model.mjs',
 snapshot:'BRIDGE-NETWORK-003/2026-10-28',doorId:'voqal',target,
 actionCode:'VERIFY_ELIGIBILITY',classification:'PUBLIC_ONLY_HOLD_FOR_LOCAL_REVIEW',
 manualExport:true,externalContact:false,applicationSubmitted:false,receiverAdmitted:false,
 fieldVerified:false,authority:'NONE'};
 return {...p,candidateId:target==='JARVIS'?
 'bridge-work-v1:b901e29d73dec2879211254f1057df6c31cebd5dc37ee601bd6fc99d0ea24d3b':
 'bridge-work-v1:1fac08572d288addaf339a454864916f8ca57132ca9b143756ca5a675c5f7ef0'};
}
async function fixture(){
 const base=await mkdtemp(join(tmpdir(),'bridge005-relatte-'));
 const receiver=await LocalReceiver.create(join(base,'recipient'),{
  world_id:'world:synthetic-independent-reviewer',receiver_particular:'particular:fixture-reviewer',
  contract_ref:'contract:bridge-public-review-only/v1'});
 const sourceKeys=await generateP256KeyPair();
 const route={receiver,sourceKeys,sourceWorld:'world:fictional-proponent',sourceParticular:'particular:public-test',
  recordedAt:'2026-10-28T21:30:00.000Z',ownerApprovedReview:true,receiverDecision:'HOLD' as const};
 return {base,receiver,route};
}
test('source-invalid, modified or authority-claiming cards refuse before receipt',async()=>{
 const c=card();assert.equal(inspectBridgeCard(c).target,'JARVIS');
 for(const bad of [{...c,fieldVerified:true},{...c,secret:'X'},{...c,target:'DROPBOX'},
 {...c,sourceCommit:'0'.repeat(40)}]){
  assert.throws(()=>inspectBridgeCard(bad),/HOLD/);
 }
 const {base,receiver,route}=await fixture();
 try{
  await assert.rejects(()=>deliverBridgeForReview(c,{...route,ownerApprovedReview:false}),/HOLD_SOURCE_OWNER_APPROVAL/);
  assert.equal(receiver.journalLength(),0);
 }finally{await rm(base,{recursive:true,force:true})}
});
test('independent receiver signs real RECEIVE and HOLD for fictional public candidate, with zero effect',async()=>{
 const {base,receiver,route}=await fixture();
 try{
  const out=await deliverBridgeForReview(card(),route);
  assert.equal(out.disposition,'HOLD');
  assert.equal(out.executionAllowed,false);
  assert.equal(out.fieldVerified,false);
  assert.equal(out.applicationSubmitted,false);
  assert.equal(receiver.snapshot().held.length,1);
  assert.equal(receiver.snapshot().admitted.length,0);
  assert.equal(await verifyReceipt(out.receiveReceipt),true);
  assert.equal(await verifyReceipt(out.dispositionReceipt),true);
  const first=receiver.journalLength();
  const again=await deliverBridgeForReview(card(),route);
  assert.equal(again.crossingId,out.crossingId);
  assert.equal(receiver.journalLength(),first);
 }finally{await rm(base,{recursive:true,force:true})}
});
test('independent REFUSE remains separate from HOLD, never authorizes tasks',async()=>{
 const {base,receiver,route}=await fixture();
 try{
  const out=await deliverBridgeForReview(card('PLANZ'),{...route,receiverDecision:'REFUSE'});
  assert.equal(out.disposition,'REFUSE');
  assert.equal(receiver.snapshot().refused.length,1);
  assert.deepEqual(receiver.snapshot().admitted,[]);
  assert.equal(await verifyReceipt(out.dispositionReceipt),true);
 }finally{await rm(base,{recursive:true,force:true})}
});
