import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,existsSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  signBody,createGrantBody,createRevocationBody,randomNonce,normalizePublicKey,
  publicFingerprint,grantDigest
} from '../../world-forge-008/src/delegation-core.mjs';
import {
  enrollmentPreview,enrollLocalSigner,importSignedRevocation,
  evaluateLocalPolicy,reviewProposalInNativeReceiver,validateTrust
} from '../src/local-bridge.mjs';
import {verifyReceipt} from '../../../src/protocol.ts';
import {LocalReceiver} from '../../../src/receiver.ts';

const ISSUED='2026-11-03T21:00:00.000Z', NOW='2026-11-04T12:00:00.000Z';
const EXPIRY='2026-11-25T21:00:00.000Z';
const REV='2026-11-04T11:00:00.000Z';
async function fixture(){
 const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']);
 const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);
 const publicKey=normalizePublicKey({kty:jwk.kty,crv:jwk.crv,x:jwk.x,y:jwk.y});
 const body=createGrantBody({ownerPublicKey:publicKey,issuedAt:ISSUED,expiresAt:EXPIRY,
   nonce:randomNonce(),scopes:['DRAFT_EXPERIMENT','PROPOSE_PULL_REQUEST','SUMMARIZE_VERIFIED_RESULTS','CHECK_MATH','COMMUNICATE_PROJECT']});
 return {pair,publicKey,grant:await signBody(body,pair.privateKey),
   fingerprint:await publicFingerprint(publicKey)};
}
const root=()=>{const base=mkdtempSync(join(tmpdir(),'wf009-'));return {base,dir:join(base,'trust'),
  done:()=>rmSync(base,{recursive:true,force:true})}};
async function enrolled(){
 const f=await fixture(),d=root();
 await enrollLocalSigner({grant:f.grant,root:d.dir,confirmedFingerprint:f.fingerprint,at:NOW});
 return {...f,...d};
}
async function revocation(f){
 const body=createRevocationBody({ownerPublicKey:f.publicKey,grantHash:await grantDigest(f.grant),
   revokedAt:REV,nonce:randomNonce()});
 return signBody(body,f.pair.privateKey);
}

test('signed key preview is NOT an enrollment',async()=>{
 const f=await fixture();
 const p=await enrollmentPreview(f.grant);
 assert.equal(p.grant_signature_valid,true);
 assert.equal(p.owner_fingerprint,f.fingerprint);
 assert.equal(p.requires_separate_local_fingerprint_confirmation,true);
 assert.equal(p.already_enrolled,false);
 assert.equal(p.personal_identity_verified,false);
});
test('valid signature without explicit local fingerprint confirmation makes no trust root',async()=>{
 const f=await fixture(),d=root();
 try{
  await assert.rejects(enrollLocalSigner({grant:f.grant,root:d.dir,confirmedFingerprint:'f'.repeat(64),at:NOW}));
  assert.equal(existsSync(d.dir),false);
 }finally{d.done()}
});
test('explicit enrollment stores only public pin and grant hash, no user grant or owner signing key',async()=>{
 const f=await enrolled();
 try{
  const p=join(f.dir,'trust.json'),raw=readFileSync(p,'utf8'),trust=JSON.parse(raw);
  assert.equal(validateTrust(trust),true);
  assert.equal(trust.recognized_fingerprint,f.fingerprint);
  assert.equal(trust.owner_private_key_custodied,false);
  assert.equal(trust.external_identity_verified,false);
  assert.equal(existsSync(join(f.dir,'private-jwk.json')),false);
  assert.equal(existsSync(join(f.dir,'grant.json')),false);
  assert.equal(existsSync(join(f.dir,'revocations.json')),true);
  assert.equal(raw.includes(f.grant.signature),false);
 }finally{f.done()}
});
test('can never silently reenroll to replace pinned owner identity',async()=>{
 const f=await enrolled();
 try{await assert.rejects(enrollLocalSigner({
   grant:f.grant,root:f.dir,confirmedFingerprint:f.fingerprint,at:NOW
 }),/TRUST_ROOT_ALREADY_EXISTS/)}finally{f.done()}
});
test('correct currently signed grant evaluates only one allowed action as local HOLD',async()=>{
 const f=await enrolled();
 try{
  const x=await evaluateLocalPolicy({root:f.dir,grant:f.grant,action:'PROPOSE_PULL_REQUEST',at:NOW});
  assert.equal(x.local_disposition,'HOLD');
  assert.equal(x.scoped_action_allowed,true);
  assert.equal(x.actual_human_identity_verified,false);
  assert.equal(x.automatic_merge,false);
 }finally{f.done()}
});
test('native reLATTE receipts for local allowed proposal sign RECEIVE, R3_HOLD and custody',async()=>{
 const f=await enrolled();
 try{
  const report=await reviewProposalInNativeReceiver({
    root:f.dir,grant:f.grant,action:'PROPOSE_PULL_REQUEST',at:NOW,requestId:'native-hold-001'
  });
  assert.equal(report.decision,'HOLD');
  assert.equal(report.native_receiver_receipts_verified,true);
  assert.equal(report.owner_private_key_transferred,false);
  assert.equal(report.native_receiver_admitted,0);
  assert.equal(report.native_source_signer,'EPHEMERAL_BRIDGE_NOT_OWNER');
  assert.equal(report.native_receipts.disposition.kind,'R3_HOLD');
  assert.equal(report.native_receipts.custody.kind,'PAYLOAD_BYTES_VERIFIED');
  assert.equal(report.native_receipts.custody.extensions.local_receiver.payload_custody.retained,true);
  for(const r of Object.values(report.native_receipts))assert.equal(await verifyReceipt(r),true);
  const loaded=await LocalReceiver.open(join(f.dir,'native-receiver'));
  assert.equal(loaded.snapshot().held.length,1);
  assert.equal(loaded.snapshot().admitted.length,0);
  const payload=readFileSync(join(f.dir,'native-receiver','payloads',report.native_crossing_id+'.bin'),'utf8');
  assert.equal(payload.includes(f.grant.signature),false);
  assert.equal(payload.includes(f.publicKey.x),false);
 }finally{f.done()}
});
test('unapproved merge action goes into signed R3_REFUSE without retained payload',async()=>{
 const f=await enrolled();
 try{
  const v=await reviewProposalInNativeReceiver({
    root:f.dir,grant:f.grant,action:'MERGE_CODE',at:NOW,requestId:'no-merge'
  });
  assert.equal(v.decision,'REFUSE');assert.equal(v.scope_allowlisted,false);
  assert.equal(v.native_receipts.disposition.kind,'R3_REFUSE');
  assert.equal(v.native_receipts.custody.extensions.local_receiver.payload_custody.retained,false);
  assert.equal(existsSync(join(f.dir,'native-receiver','payloads',v.native_crossing_id+'.bin')),false);
  assert.equal(v.native_receiver_admitted,0);
 }finally{f.done()}
});
test('unapproved expenditure is REFUSE; never implies a transaction',async()=>{
 const f=await enrolled();
 try{
  const p=await evaluateLocalPolicy({root:f.dir,grant:f.grant,action:'SPEND_FUNDS',at:NOW});
  assert.equal(p.local_disposition,'REFUSE');assert.equal(p.scoped_action_allowed,false);
 }finally{f.done()}
});
test('unknown grant signer cannot substitute a locally trusted owner key',async()=>{
 const f=await enrolled(),other=await fixture();
 try{
  await assert.rejects(evaluateLocalPolicy({root:f.dir,grant:other.grant,action:'DRAFT_EXPERIMENT',at:NOW}),
    /GRANT_DOES_NOT_MATCH/);
 }finally{f.done()}
});
test('same signer but a different signed grant does not bypass pinned grant digest',async()=>{
 const f=await enrolled();
 try{
  const second=await signBody(createGrantBody({ownerPublicKey:f.publicKey,issuedAt:ISSUED,
    expiresAt:EXPIRY,nonce:randomNonce(),scopes:['DRAFT_EXPERIMENT']}),f.pair.privateKey);
  await assert.rejects(evaluateLocalPolicy({root:f.dir,grant:second,action:'DRAFT_EXPERIMENT',at:NOW}),
    /GRANT_DOES_NOT_MATCH/);
 }finally{f.done()}
});
test('mutated original grant signature fails before receiver side effects',async()=>{
 const f=await enrolled();
 try{
  f.grant.body.scopes=['DRAFT_EXPERIMENT'];
  await assert.rejects(reviewProposalInNativeReceiver({
    root:f.dir,grant:f.grant,action:'DRAFT_EXPERIMENT',at:NOW,requestId:'tampered'
  }),/OWNER_GRANT_SIGNATURE_INVALID/);
  assert.equal(existsSync(join(f.dir,'native-receiver')),false);
 }finally{f.done()}
});
test('expired grant returns REFUSE even though signer remains locally pinned',async()=>{
 const f=await enrolled();
 try{
  const r=await evaluateLocalPolicy({root:f.dir,grant:f.grant,action:'CHECK_MATH',at:'2026-11-26T12:00:00.000Z'});
  assert.equal(r.local_disposition,'REFUSE');
  assert.equal(r.reason,'NOT_IN_GRANT_WINDOW');
 }finally{f.done()}
});
test('owner-signed local revocation changes later proposed action to native REFUSE',async()=>{
 const f=await enrolled();
 try{
  const rv=await revocation(f);
  const imported=await importSignedRevocation({root:f.dir,grant:f.grant,revocation:rv});
  assert.equal(imported.signature_valid,true);
  const r=await reviewProposalInNativeReceiver({
    root:f.dir,grant:f.grant,action:'CHECK_MATH',at:NOW,requestId:'revoked-math'
  });
  assert.equal(r.decision,'REFUSE');assert.equal(r.reason,'REVOKED_BY_OWNER');
  assert.equal(r.payload_retained_for_review,false);assert.equal(r.native_receiver_admitted,0);
 }finally{f.done()}
});
test('a foreign key cannot revoke pinned signer',async()=>{
 const f=await enrolled(),other=await fixture();
 try{
  const bad=await revocation(other);
  await assert.rejects(importSignedRevocation({root:f.dir,grant:f.grant,revocation:bad}),
    /REVOCATION_NOT_SIGNED_BY_PINNED/);
  assert.equal(JSON.parse(readFileSync(join(f.dir,'revocations.json'),'utf8')).length,0);
 }finally{f.done()}
});
test('duplicate valid signed revocation is rejected',async()=>{
 const f=await enrolled();
 try{
  const rv=await revocation(f);
  await importSignedRevocation({root:f.dir,grant:f.grant,revocation:rv});
  await assert.rejects(importSignedRevocation({root:f.dir,grant:f.grant,revocation:rv}),
    /DUPLICATE_REVOCATION/);
 }finally{f.done()}
});
test('missing local revocation ledger refuses review rather than pretending no revocations',async()=>{
 const f=await enrolled();
 try{
  rmSync(join(f.dir,'revocations.json'));
  await assert.rejects(evaluateLocalPolicy({root:f.dir,grant:f.grant,action:'DRAFT_EXPERIMENT',at:NOW}));
 }finally{f.done()}
});
test('broken local trust policy is a hard refusal, not a silent fresh enrollment',async()=>{
 const f=await enrolled();
 try{
  const file=join(f.dir,'trust.json'),trust=JSON.parse(readFileSync(file,'utf8'));
  trust.automatic_merge=true;writeFileSync(file,JSON.stringify(trust));
  await assert.rejects(evaluateLocalPolicy({root:f.dir,grant:f.grant,action:'CHECK_MATH',at:NOW}),
    /UNSAFE_LOCAL_TRUST/);
 }finally{f.done()}
});
test('corrupt receipt journal on disk is rejected on restart',async()=>{
 const f=await enrolled();
 try{
  await reviewProposalInNativeReceiver({root:f.dir,grant:f.grant,action:'CHECK_MATH',at:NOW,
    requestId:'tampered-journal'});
  const j=join(f.dir,'native-receiver','journal.jsonl');
  const lines=readFileSync(j,'utf8').split('\n');
  const first=JSON.parse(lines[0]);first.event_hash='relatte-local-event-v0:'+'0'.repeat(64);
  lines[0]=JSON.stringify(first);writeFileSync(j,lines.join('\n'));
  await assert.rejects(LocalReceiver.open(join(f.dir,'native-receiver')));
 }finally{f.done()}
});
test('invalid time or proposal ID fails before native receipt creation',async()=>{
 const f=await enrolled();
 try{
  await assert.rejects(reviewProposalInNativeReceiver({root:f.dir,grant:f.grant,
    action:'DRAFT_EXPERIMENT',at:'yesterday',requestId:'bad-time'}));
  await assert.rejects(reviewProposalInNativeReceiver({root:f.dir,grant:f.grant,
    action:'DRAFT_EXPERIMENT',at:NOW,requestId:'../escape'}));
  assert.equal(existsSync(join(f.dir,'native-receiver')),false);
 }finally{f.done()}
});
