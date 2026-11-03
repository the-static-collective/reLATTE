// WORLD-FORGE-008 owner-directed local delegation. Runs in browser and Node 24.
// A key holder proves possession of a local P-256 key, NOT their civil/human identity.
// Nothing in this module grants an agent a signing key or power to merge/execute.
export const FORMAT='world-forge/locally-signed-delegation/v0';
export const DOMAIN='WORLD-FORGE-008-P256-SHA256|';
export const AUDIENCE='the-static-collective/reLATTE/world-forge-experiments';
export const DELEGATE='chatgpt-assisted-project-operator-no-private-key';
export const ALLOW=['DRAFT_EXPERIMENT','PROPOSE_PULL_REQUEST','SUMMARIZE_VERIFIED_RESULTS','CHECK_MATH','COMMUNICATE_PROJECT'];
export const FORBID=['MERGE_CODE','ADMIT_CARTRIDGE','DEPLOY_PRODUCTION','SPEND_FUNDS','SIGN_AS_OWNER','LEGAL_REPRESENTATION','ISSUE_TOKENS','CONTROL_REAL_WORLD_EQUIPMENT'];
export const MS_DAY=86400000;
const isObj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const exact=(v,keys)=>isObj(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const b64encode=u8=>btoa(String.fromCharCode(...u8)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
function b64decode(str){
  if(typeof str!=='string'||!/^[A-Za-z0-9_-]+$/.test(str))throw Error('BAD_BASE64URL');
  const raw=atob(str.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-str.length%4)%4));
  const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
  if(b64encode(bytes)!==str)throw Error('NONCANONICAL_BASE64URL');
  return bytes;
}
export function stable(value){
  if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
  if(isObj(value))return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';
  if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
  if(typeof value==='number'&&Number.isFinite(value)&&Number.isSafeInteger(value))return String(value);
  throw Error('INVALID_CANONICAL_VALUE');
}
const bytesOf=v=>new TextEncoder().encode(v);
const signingBytes=body=>bytesOf(DOMAIN+stable(body));
export async function digest(value){
  const data=typeof value==='string'?bytesOf(value):value;
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data))).map(x=>x.toString(16).padStart(2,'0')).join('');
}
export function normalizePublicKey(v){
  if(!exact(v,['kty','crv','x','y'])||v.kty!=='EC'||v.crv!=='P-256')
    throw Error('INVALID_PUBLIC_KEY_FIELDS');
  if(b64decode(v.x).length!==32||b64decode(v.y).length!==32)
    throw Error('INVALID_P256_COORDINATES');
  return {kty:'EC',crv:'P-256',x:v.x,y:v.y};
}
export async function publicFingerprint(jwk){
  return digest(stable(normalizePublicKey(jwk)));
}
export function validateBody(body){
  if(!isObj(body))throw Error('BODY_REQUIRED');
  if(body.schema==='world-forge/delegation-grant/v0'){
    if(!exact(body,['schema','audience','delegate','owner_public_key','issued_at','expires_at','nonce','scopes','purpose','mode',
                    'requires_human_review_for_merge','automatic_admission','automatic_execution','legal_agency','issuer_attestation']))
      throw Error('GRANT_FIELDS_MISMATCH');
    if(body.audience!==AUDIENCE||body.delegate!==DELEGATE
      ||body.purpose!=='bounded-project-operator-assistance'
      ||body.mode!=='PROPOSE_AND_REVIEW_ONLY'
      ||body.requires_human_review_for_merge!==true
      ||body.automatic_admission!==false||body.automatic_execution!==false
      ||body.legal_agency!==false||body.issuer_attestation!=='SELF_ATTESTED_LOCAL_KEY_HOLDER')
      throw Error('UNAPPROVED_GRANT_AUTHORITY');
    normalizePublicKey(body.owner_public_key);
    if(typeof body.nonce!=='string'||b64decode(body.nonce).length!==16)
      throw Error('INVALID_NONCE');
    if(!Array.isArray(body.scopes)||body.scopes.length===0||body.scopes.length>ALLOW.length
      ||new Set(body.scopes).size!==body.scopes.length||body.scopes.some(s=>!ALLOW.includes(s)))
      throw Error('UNKNOWN_OR_DUPLICATE_SCOPE');
    const start=Date.parse(body.issued_at),expiry=Date.parse(body.expires_at);
    if(!Number.isFinite(start)||!Number.isFinite(expiry)||new Date(start).toISOString()!==body.issued_at
      ||new Date(expiry).toISOString()!==body.expires_at||expiry<=start||expiry-start>30*MS_DAY)
      throw Error('EXPIRED_OR_EXCESSIVE_GRANT_INTERVAL');
  }else if(body.schema==='world-forge/delegation-revocation/v0'){
    if(!exact(body,['schema','audience','owner_public_key','grant_digest','revoked_at','nonce','reason','effect']))
      throw Error('REVOCATION_FIELDS_MISMATCH');
    if(body.audience!==AUDIENCE||body.effect!=='REVOKE_LOCAL_REPRESENTATIVE_ASSISTANCE'
      ||body.reason!=='OWNER_DISCRETION'||!(/^[a-f0-9]{64}$/.test(body.grant_digest))
      ||typeof body.nonce!=='string'||b64decode(body.nonce).length!==16)
      throw Error('BAD_REVOCATION');
    normalizePublicKey(body.owner_public_key);
    const t=Date.parse(body.revoked_at);
    if(!Number.isFinite(t)||new Date(t).toISOString()!==body.revoked_at)throw Error('BAD_REVOCATION_TIME');
  }else throw Error('UNKNOWN_DELEGATION_BODY');
  stable(body);
  return true;
}
export async function signBody(body,privateKey){
  validateBody(body);
  if(privateKey?.algorithm?.name!=='ECDSA'||privateKey.algorithm.namedCurve!=='P-256'
    ||privateKey.usages?.includes('sign')!==true)throw Error('NO_LOCAL_SIGNING_KEY');
  const sig=new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},privateKey,signingBytes(body)));
  if(sig.length!==64)throw Error('UNEXPECTED_SIGNATURE_FORMAT');
  return {format:FORMAT,body,algorithm:'ECDSA-P256-SHA256',signature:b64encode(sig)};
}
export async function verifySigned(doc){
  try{
    if(!exact(doc,['format','body','algorithm','signature'])||doc.format!==FORMAT||doc.algorithm!=='ECDSA-P256-SHA256')
      return false;
    validateBody(doc.body);
    const key=await crypto.subtle.importKey('jwk',normalizePublicKey(doc.body.owner_public_key),
      {name:'ECDSA',namedCurve:'P-256'},false,['verify']);
    const sig=b64decode(doc.signature);
    if(sig.length!==64)return false;
    return crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,sig,signingBytes(doc.body));
  }catch{return false;}
}
export async function grantDigest(grant){
  if(!(await verifySigned(grant))||grant.body.schema!=='world-forge/delegation-grant/v0')
    throw Error('INVALID_GRANT_SIGNATURE');
  return digest(stable(grant));
}
export async function evaluateGrant({grant,at,action,revocations=[]}){
  if(!(await verifySigned(grant))||grant.body.schema!=='world-forge/delegation-grant/v0')
    return {authorized:false,reason:'BAD_SIGNED_GRANT'};
  if(!ALLOW.includes(action)||!grant.body.scopes.includes(action))
    return {authorized:false,reason:'ACTION_NOT_DELEGATED'};
  const time=Date.parse(at);
  if(!Number.isFinite(time)||new Date(time).toISOString()!==at)return {authorized:false,reason:'INVALID_TIME'};
  if(time<Date.parse(grant.body.issued_at)||time>=Date.parse(grant.body.expires_at))
    return {authorized:false,reason:'NOT_IN_GRANT_WINDOW'};
  const fingerprint=await publicFingerprint(grant.body.owner_public_key);
  const ghash=await grantDigest(grant);
  if(!Array.isArray(revocations))return {authorized:false,reason:'INVALID_REVOCATION_SET'};
  for(const rev of revocations){
    if(!(await verifySigned(rev))||rev.body.schema!=='world-forge/delegation-revocation/v0')
      return {authorized:false,reason:'UNVERIFIABLE_REVOCATION_SET'};
    if(await publicFingerprint(rev.body.owner_public_key)!==fingerprint)
      return {authorized:false,reason:'REVOCATION_SIGNER_MISMATCH'};
    // A valid revocation cancels this grant from its recorded time. There is
    // no shared timestamp authority: receiver must still choose its clock.
    if(rev.body.grant_digest===ghash&&Date.parse(rev.body.revoked_at)<=time)
      return {authorized:false,reason:'REVOKED_BY_OWNER'};
  }
  return {authorized:true,reason:'PROPOSAL_ONLY_UNDER_LOCAL_SELF_ATTESTED_KEY',
    owner_fingerprint:fingerprint,allowlisted_action:action,
    actual_human_identity_verified:false,legal_agency:false,automatic_admission:false};
}
export function createGrantBody({ownerPublicKey,issuedAt,expiresAt,nonce,scopes=ALLOW}){
  const body={schema:'world-forge/delegation-grant/v0',audience:AUDIENCE,delegate:DELEGATE,
    owner_public_key:normalizePublicKey(ownerPublicKey),issued_at:issuedAt,expires_at:expiresAt,
    nonce,scopes,purpose:'bounded-project-operator-assistance',
    mode:'PROPOSE_AND_REVIEW_ONLY',requires_human_review_for_merge:true,
    automatic_admission:false,automatic_execution:false,legal_agency:false,
    issuer_attestation:'SELF_ATTESTED_LOCAL_KEY_HOLDER'};
  validateBody(body);return body;
}
export function createRevocationBody({ownerPublicKey,grantHash,revokedAt,nonce}){
  const body={schema:'world-forge/delegation-revocation/v0',audience:AUDIENCE,
    owner_public_key:normalizePublicKey(ownerPublicKey),grant_digest:grantHash,
    revoked_at:revokedAt,nonce,reason:'OWNER_DISCRETION',
    effect:'REVOKE_LOCAL_REPRESENTATIVE_ASSISTANCE'};
  validateBody(body);return body;
}
export function randomNonce(){
  const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);return b64encode(bytes);
}
