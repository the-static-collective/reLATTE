// Standalone receiver-side public-grant/revocation verification.
// Strictly REVIEW-ONLY; does not authorize any actual external account operation.
import {readFileSync} from 'node:fs';
import {verifySigned,evaluateGrant,publicFingerprint} from './delegation-core.mjs';
const [grantPath,revPath,action='PROPOSE_PULL_REQUEST',at=new Date().toISOString()]=process.argv.slice(2);
if(!grantPath)throw Error('Usage: verify-public.mjs GRANT.json [REVOCATION.json or -] [ALLOWLIST_ACTION] [ISO_TIME]');
const grant=JSON.parse(readFileSync(grantPath,'utf8'));
const revocations=revPath&&revPath!=='-'?[JSON.parse(readFileSync(revPath,'utf8'))]:[];
if(!(await verifySigned(grant)))throw Error('OWNER_PUBLIC_GRANT_SIGNATURE_INVALID');
for(const r of revocations)if(!(await verifySigned(r)))throw Error('OWNER_PUBLIC_REVOCATION_SIGNATURE_INVALID');
const result=await evaluateGrant({grant,at,action,revocations});
const answer={
  schema:'world-forge/verified-local-operator-scope/v0',
  at,action,
  grant_signature_valid:true,
  owner_key_fingerprint:await publicFingerprint(grant.body.owner_public_key),
  ...result,
  external_human_identity_verified:false,
  delegate_possesses_owner_private_key:false,
  can_sign_as_owner:false,
  can_merge_or_execute:false,
  legal_agency:false,
  remote_state_changed:false
};
console.log(JSON.stringify(answer,null,2));
if(!result.authorized)process.exitCode=2;
