// Synthetic hostile tests for signer recognition policy and native signature
// syntax. Actual PR101 raw evidence verification happens in official CI jobs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
 PINNED_PR101_COMMIT,PINNED_CORE_TREE,PINNED_SERVER_SHA1,
 sourceKeyFingerprint,validatePolicy,issueTestPolicy,chooseLocalDisposition,
 verifyNativeReturn
} from '../src/native-source.mjs';
import {generateP256KeyPair,sealCrossingEnvelope,sealReceipt} from '../../../src/protocol.ts';
const sha=s=>createHash('sha256').update(s).digest('hex');
const fp='a'.repeat(64),other='b'.repeat(64);
const makePolicy=()=>issueTestPolicy('RECOGNIZE_PINNED_CI_PROVENANCE',fp);
test('pin source commit and normative core tree as hardcoded fixture',()=>{
 assert.match(PINNED_PR101_COMMIT,/^[a-f0-9]{40}$/);
 assert.match(PINNED_CORE_TREE,/^[a-f0-9]{40}$/);
 assert.match(PINNED_SERVER_SHA1,/^[a-f0-9]{40}$/);
});
test('source fingerprint strict canonical JWK public coordinates',()=>{
 const key={signing:{public_key:{kty:'EC',crv:'P-256',x:'x',y:'y'}}};
 assert.match(sourceKeyFingerprint(key),/^[a-f0-9]{64}$/);
 assert.throws(()=>sourceKeyFingerprint({signing:{public_key:{kty:'EC',crv:'P-256',x:'x',y:'y',d:'secret'}}}));
});
test('recognize pinned ephemeral CI self-key only for review as HOLD',()=>{
 const policy=makePolicy();assert.equal(validatePolicy(policy),true);
 assert.equal(chooseLocalDisposition(policy,fp),'HOLD');
 assert.equal(chooseLocalDisposition(policy,other),'REFUSE');
 assert.equal(policy.authorizes_execution,false);
 assert.equal(policy.authorizes_admission,false);
});
test('require prior enrolled external identity rejects ephemeral signer',()=>{
 const p=issueTestPolicy('REQUIRE_PRE_ENROLLED_SIGNER',fp);
 assert.equal(p.enrolled_signer_fingerprint,null);
 assert.equal(chooseLocalDisposition(p,fp),'REFUSE');
});
test('no AUTO_ADMIT source-policy option',()=>assert.throws(()=>issueTestPolicy('AUTO_ADMIT',fp)));
test('signed source cannot upgrade to execute authority',()=>{
 const p=makePolicy();p.authorizes_execution=true;assert.throws(()=>validatePolicy(p));
});
test('signed source cannot upgrade to admit',()=>{
 const p=makePolicy();p.authorizes_admission=true;assert.throws(()=>validatePolicy(p));
});
test('source commit cannot move with same key',()=>{
 const p=makePolicy();p.source_commit='f'.repeat(40);assert.throws(()=>validatePolicy(p));
});
test('server jar digest must stay pinned',()=>{
 const p=makePolicy();p.minecraft_server_sha1='f'.repeat(40);assert.throws(()=>validatePolicy(p));
});
test('source normative tree must stay pinned',()=>{
 const p=makePolicy();p.normative_core_tree='f'.repeat(40);assert.throws(()=>validatePolicy(p));
});
test('unknown fields disallowed',()=>{
 const p=makePolicy();p.remote_execution=true;assert.throws(()=>validatePolicy(p));
});
test('strict signer-preenrollment cannot smuggle runtime key',()=>{
 const p=issueTestPolicy('REQUIRE_PRE_ENROLLED_SIGNER',fp);p.enrolled_signer_fingerprint=fp;assert.throws(()=>validatePolicy(p));
});
test('uncertified identity basis not allowed',()=>{
 const p=makePolicy();p.recognition_basis='THIS_IS_A_REAL_PERSON';assert.throws(()=>validatePolicy(p));
});
test('invalid fingerprint cannot be accepted',()=>{
 assert.throws(()=>chooseLocalDisposition(makePolicy(),'fake'));
});
async function syntheticBundle(){
 const packet={
   schema:'ghot.riff-raft-minecraft-return/v0',
   source_project:'the-static-collective/reLATTE',
   receiving_project:'the-static-collective/GHoT',
   recommended_gHot_disposition:'HOLD',
   signed_sender_identity_is_not_trusted_org_authority:true,
   owner_admission:false,
   no_direct_game_or_physical_actuation:true,
   selected_game_runtime:'official-vanilla-26.1.1',
   worlds:[{world_id:'A'},{world_id:'B'}]
 };
 const packet_json=JSON.stringify(packet);
 const keys=await generateP256KeyPair();
 const crossing=await sealCrossingEnvelope({
    schema:'relatte.crossing-envelope/v0',protocol_version:'0',
    source_particular:'synthetic-fixture',source_world:'synthetic-world',
    source_history_head:null,parents:[],
    declared_kind:'SYNTHETIC_ONLY',
    payload_refs:[{address:'sha256:'+sha(Buffer.from(packet_json)),role:'raw',media_type:'application/json'}],
    requested_effect:null,capability_ref:null,privacy_policy:null,audience_policy:null,
    return_address:null,created_at:'2026-11-03T21:00:00.000Z',extensions:{}
 },keys);
 const receipt=await sealReceipt({
   schema:'relatte.receipt/v0',crossing_id:crossing.crossing_id,
   world_id:'synthetic-world',receiver_particular:'test-local',
   kind:'R3_HOLD',semantic_effect:'none',contract_ref:'test',
   pre_state_ref:null,post_state_ref:null,descendant_refs:[],residual_refs:[],
   note:'synthetic receipt not original Minecraft',
   created_at:'2026-11-03T21:00:01.000Z',extensions:{}
 },await generateP256KeyPair());
 return {schema:'ghot.riff-raft-minecraft-return-bundle/v0',packet_json,crossing,receipt,
   world_evidence:{A:{composition_json:'{}',runtime_json:'{}'},B:{composition_json:'{}',runtime_json:'{}'}}};
}
test('synthetic native P256 return envelope verifies without making human-identity claim',async()=>{
 const b=await syntheticBundle();const parsed=await verifyNativeReturn(b);
 assert.ok(parsed.sourceFingerprint);
 assert.equal(parsed.packet.signed_sender_identity_is_not_trusted_org_authority,true);
});
test('signed packet rejects modified payload',async()=>{
 const b=await syntheticBundle();
 b.packet_json=b.packet_json.replace('official-vanilla-26.1.1','official-vanilla-26.1.2');
 await assert.rejects(verifyNativeReturn(b));
});
test('packet drops owner HOLD and claims admission => reject',async()=>{
 const b=await syntheticBundle();
 b.packet_json=b.packet_json.replace('"owner_admission":false','"owner_admission":true');
 await assert.rejects(verifyNativeReturn(b));
});
test('fake receipt signature rejected',async()=>{
 const b=await syntheticBundle();b.receipt.signing.signature='abc';
 await assert.rejects(verifyNativeReturn(b));
});
test('unknown native wrapper fields fail closed',async()=>{
 const b=await syntheticBundle();b.bad_field='GODMODE';
 await assert.rejects(verifyNativeReturn(b));
});
test('source native public key with extra private d rejects',async()=>{
 const b=await syntheticBundle();
 b.crossing.signing.public_key.d='private';
 await assert.rejects(verifyNativeReturn(b));
});
