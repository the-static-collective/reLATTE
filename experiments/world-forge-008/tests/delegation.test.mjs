import test from 'node:test';
import assert from 'node:assert/strict';
import {
 ALLOW,FORBID,AUDIENCE,DELEGATE,stable,normalizePublicKey,publicFingerprint,
 createGrantBody,createRevocationBody,signBody,verifySigned,
 grantDigest,evaluateGrant,randomNonce
} from '../src/delegation-core.mjs';

const ISSUED='2026-11-03T20:00:00.000Z';
const LATER='2026-11-10T20:00:00.000Z';
const EXPIRES='2026-11-20T20:00:00.000Z';
const AFTER='2026-11-20T20:00:00.000Z';
async function keys(){
 const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']);
 const publicKey=await crypto.subtle.exportKey('jwk',pair.publicKey);
 return {privateKey:pair.privateKey,publicKey:normalizePublicKey({
   kty:publicKey.kty,crv:publicKey.crv,x:publicKey.x,y:publicKey.y
 })};
}
async function grant(input={}){
 const k=await keys(),body=createGrantBody({
   ownerPublicKey:k.publicKey,issuedAt:ISSUED,expiresAt:EXPIRES,
   nonce:randomNonce(),scopes:ALLOW,...input
 });
 return {k,grant:await signBody(body,k.privateKey)};
}
async function revoked(k,g,at=LATER){
 return signBody(createRevocationBody({ownerPublicKey:k.publicKey,grantHash:await grantDigest(g),
   revokedAt:at,nonce:randomNonce()}),k.privateKey);
}
test('canonical encoding is independent of key insertion order',()=>{
 assert.equal(stable({b:[3,2],a:{x:1,y:true}}),stable({a:{y:true,x:1},b:[3,2]}));
});
test('local owner generated nonextractable P256 signing key',async()=>{
 const k=await keys();assert.equal(k.privateKey.extractable,false);assert.match(await publicFingerprint(k.publicKey),/^[a-f0-9]{64}$/);
});
test('valid owner-signed grant authorizes only proposals at a valid date',async()=>{
 const {grant:g}=await grant();assert.equal(await verifySigned(g),true);
 const v=await evaluateGrant({grant:g,at:LATER,action:'PROPOSE_PULL_REQUEST'});
 assert.equal(v.authorized,true);assert.equal(v.actual_human_identity_verified,false);
 assert.equal(v.automatic_admission,false);assert.equal(v.legal_agency,false);
});
test('all five proposed operator actions allowed, all dangerous operations forbidden',async()=>{
 const {grant:g}=await grant();
 for(const action of ALLOW)assert.equal((await evaluateGrant({grant:g,at:LATER,action})).authorized,true);
 for(const action of FORBID)assert.equal((await evaluateGrant({grant:g,at:LATER,action})).authorized,false);
});
test('the grant never merges code or signs as user',async()=>{
 const {grant:g}=await grant();
 assert.equal(g.body.requires_human_review_for_merge,true);
 assert.equal(g.body.automatic_execution,false);
 assert.equal(g.body.automatic_admission,false);
 assert.equal(g.body.legal_agency,false);
 assert.equal(g.body.delegate,DELEGATE);
 assert.equal(g.body.audience,AUDIENCE);
});
test('end of grant interval is exclusive',async()=>{
 const {grant:g}=await grant();
 assert.equal((await evaluateGrant({grant:g,at:ISSUED,action:ALLOW[0]})).authorized,true);
 assert.equal((await evaluateGrant({grant:g,at:AFTER,action:ALLOW[0]})).reason,'NOT_IN_GRANT_WINDOW');
 assert.equal((await evaluateGrant({grant:g,at:'2026-11-02T20:00:00.000Z',action:ALLOW[0]})).authorized,false);
});
test('owner signs revocation and one matching grant is invalid thereafter',async()=>{
 const {k,grant:g}=await grant();const rev=await revoked(k,g);
 assert.equal(await verifySigned(rev),true);
 assert.equal((await evaluateGrant({grant:g,at:ISSUED,action:ALLOW[0],revocations:[rev]})).authorized,true);
 assert.equal((await evaluateGrant({grant:g,at:LATER,action:ALLOW[0],revocations:[rev]})).reason,'REVOKED_BY_OWNER');
});
test('different local key revocation cannot impersonate owner',async()=>{
 const {grant:g}=await grant(),bad=await keys();
 const rev=await signBody(createRevocationBody({ownerPublicKey:bad.publicKey,grantHash:await grantDigest(g),
   revokedAt:LATER,nonce:randomNonce()}),bad.privateKey);
 assert.equal((await evaluateGrant({grant:g,at:LATER,action:ALLOW[0],revocations:[rev]})).reason,'REVOCATION_SIGNER_MISMATCH');
});
test('bad revocation signature fails closed rather than reauthorizing',async()=>{
 const {k,grant:g}=await grant();const rev=await revoked(k,g);rev.signature=rev.signature.slice(0,-1)+'Z';
 assert.equal((await evaluateGrant({grant:g,at:LATER,action:ALLOW[0],revocations:[rev]})).authorized,false);
});
test('altered signed scopes cannot authorize disallowed operation',async()=>{
 const {grant:g}=await grant();g.body.scopes=['MERGE_CODE'];
 assert.equal(await verifySigned(g),false);
});
test('altered payload with permitted scope still breaks original signature',async()=>{
 const {grant:g}=await grant();g.body.scopes=['DRAFT_EXPERIMENT'];
 assert.equal(await verifySigned(g),false);
});
test('cannot exceed thirty-day expiration',async()=>{
 const k=await keys();assert.throws(()=>createGrantBody({
   ownerPublicKey:k.publicKey,issuedAt:ISSUED,expiresAt:'2027-01-01T20:00:00.000Z',nonce:randomNonce()
 }));
});
test('cannot set unsorted, duplicated scope set',async()=>{
 const k=await keys();assert.throws(()=>createGrantBody({
   ownerPublicKey:k.publicKey,issuedAt:ISSUED,expiresAt:EXPIRES,
   nonce:randomNonce(),scopes:['DRAFT_EXPERIMENT','DRAFT_EXPERIMENT']
 }));
});
test('unknown scope rejected before signing',async()=>{
 const k=await keys();assert.throws(()=>createGrantBody({
   ownerPublicKey:k.publicKey,issuedAt:ISSUED,expiresAt:EXPIRES,nonce:randomNonce(),scopes:['DO_WIRE_TRANSFER']
 }));
});
test('approval cannot silently become external legal agency',async()=>{
 const {grant:g}=await grant();g.body.legal_agency=true;assert.equal(await verifySigned(g),false);
});
test('cannot silently admit learned cartridges',async()=>{
 const {grant:g}=await grant();g.body.automatic_admission=true;assert.equal(await verifySigned(g),false);
});
test('canonical signed proof cannot be changed to another audience',async()=>{
 const {grant:g}=await grant();g.body.audience='other-repo';assert.equal(await verifySigned(g),false);
});
test('unexpected signed metadata fails closed',async()=>{
 const {grant:g}=await grant();g.body.root=true;assert.equal(await verifySigned(g),false);
});
test('private material in public key is disallowed',async()=>{
 const {grant:g}=await grant();g.body.owner_public_key.d='PRIVATE';
 assert.equal(await verifySigned(g),false);
});
test('truncated signature fails closed',async()=>{
 const {grant:g}=await grant();g.signature='bad';assert.equal(await verifySigned(g),false);
});
test('bad origin timestamp cannot authenticate',async()=>{
 const {grant:g}=await grant();g.body.issued_at='2026-11-03';assert.equal(await verifySigned(g),false);
});
test('a different owner key may not sign original key identity',async()=>{
 const {grant:g}=await grant(),bad=await keys();
 const stolen=await signBody(g.body,bad.privateKey);
 assert.equal(await verifySigned(stolen),false);
});
test('empty revocation list is explicit and permitted',async()=>{
 const {grant:g}=await grant();
 assert.equal((await evaluateGrant({grant:g,at:LATER,action:ALLOW[0],revocations:[]})).authorized,true);
});
test('nonarray revocations fail closed',async()=>{
 const {grant:g}=await grant();
 assert.equal((await evaluateGrant({grant:g,at:LATER,action:ALLOW[0],revocations:null})).authorized,false);
});
test('cannot sign a revocation using public verify key',async()=>{
 const {k,grant:g}=await grant();
 await assert.rejects(signBody(createRevocationBody({ownerPublicKey:k.publicKey,
   grantHash:await grantDigest(g),revokedAt:LATER,nonce:randomNonce()}),{}));
});
