// End-to-end actual CLI exercise with a freshly generated SYNTHETIC owner key.
// No chat user's signed grant, identity, or private key enters GitHub Actions.
import {mkdtempSync,mkdirSync,rmSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {
 createGrantBody,createRevocationBody,normalizePublicKey,signBody,grantDigest,
 publicFingerprint,randomNonce
} from '../../world-forge-008/src/delegation-core.mjs';
const cli=process.env.WF009_CLI_BUNDLED ? resolve(process.env.WF009_CLI_BUNDLED) : fileURLToPath(new URL('../src/cli.mjs',import.meta.url));
const root=mkdtempSync(join(tmpdir(),'wf009-cli-'));
const source=join(root,'synthetic-public-signed-grant.json');
const trustRoot=join(root,'receiver-trust');
const previewPath=join(root,'preview.json');
const holdPath=join(root,'hold.json');
const revPath=join(root,'synthetic-public-signed-revocation.json');
const refusedPath=join(root,'refused.json');
const issued='2026-11-03T20:00:00.000Z',now='2026-11-04T20:00:00.000Z',revAt='2026-11-04T19:00:00.000Z';
function run(args,expected=0){
 const r=spawnSync(process.execPath,['--experimental-strip-types',cli,...args],{
   encoding:'utf8',timeout:30000
 });
 if(r.status!==expected)throw Error('CLI code '+r.status+' expected '+expected+'\n'+r.stdout+'\n'+r.stderr);
 return r.stdout;
}
try{
 const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']);
 const jwk=await crypto.subtle.exportKey('jwk',keys.publicKey);
 const publicKey=normalizePublicKey({kty:jwk.kty,crv:jwk.crv,x:jwk.x,y:jwk.y});
 const fingerprint=await publicFingerprint(publicKey);
 const grant=await signBody(createGrantBody({ownerPublicKey:publicKey,
   issuedAt:issued,expiresAt:'2026-11-22T20:00:00.000Z',
   nonce:randomNonce(),scopes:['DRAFT_EXPERIMENT','PROPOSE_PULL_REQUEST','CHECK_MATH']
 }),keys.privateKey);
 writeFileSync(source,JSON.stringify(grant,null,2)+'\n',{mode:0o600});
 run(['preview',source,previewPath]);
 const preview=JSON.parse(readFileSync(previewPath));
 assert.equal(preview.owner_fingerprint,fingerprint);
 assert.equal(preview.already_enrolled,false);
 run(['enroll',source,trustRoot,'0'.repeat(64),now],1);
 assert.equal(existsSync(trustRoot),false);
 run(['enroll',source,trustRoot,fingerprint,now]);
 run(['policy',source,trustRoot,'PROPOSE_PULL_REQUEST',now,join(root,'decision.json')]);
 assert.equal(JSON.parse(readFileSync(join(root,'decision.json'))).local_disposition,'HOLD');
 run(['review',source,trustRoot,'PROPOSE_PULL_REQUEST',now,'cli-hold-001',holdPath]);
 const held=JSON.parse(readFileSync(holdPath));
 assert.equal(held.decision,'HOLD');
 assert.equal(held.native_receiver_receipts_verified,true);
 assert.equal(held.native_receiver_admitted,0);
 const revocation=await signBody(createRevocationBody({ownerPublicKey:publicKey,
   grantHash:await grantDigest(grant),revokedAt:revAt,nonce:randomNonce()
 }),keys.privateKey);
 writeFileSync(revPath,JSON.stringify(revocation,null,2)+'\n',{mode:0o600});
 run(['revoke',source,trustRoot,revPath,join(root,'revocation-received.json')]);
 run(['review',source,trustRoot,'PROPOSE_PULL_REQUEST',now,'cli-refuse-002',refusedPath]);
 const refusal=JSON.parse(readFileSync(refusedPath));
 assert.equal(refusal.decision,'REFUSE');
 assert.equal(refusal.payload_retained_for_review,false);
 assert.equal(refusal.native_receiver_admitted,0);
 assert.equal(existsSync(join(trustRoot,'native-receiver','payloads',refusal.native_crossing_id+'.bin')),false);
 console.log('WF009_CLI_LOCAL_NATIVE_SMOKE='+JSON.stringify({
   synthetic_only:true,
   signed_grant_verification:true,
   invalid_fingerprint_enrollment_refused:true,
   explicit_fingerprint_enrollment:true,
   allowed_proposal_native_hold:true,
   owner_signed_revocation_verified:true,
   after_revocation_native_refuse:true,
   refused_payload_retained:false,
   native_receiver_admitted:0,
   owner_private_key_exported:false,
   user_real_grant_used:false
 }));
}finally{rmSync(root,{force:true,recursive:true})}
