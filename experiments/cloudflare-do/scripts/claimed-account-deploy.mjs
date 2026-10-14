// Controlled redeployment into the user's already-claimed Cloudflare account.
// Operator credentials are intentionally ephemeral to each manual CI run.
// This script refuses every Cloudflare account whose existing Workers/subdomain
// do not match the original two-world proof. No DNS, routes, payments, or bookings.
import { randomBytes } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';

const EXPECTED_SUBDOMAIN = 'viridian-tail';
const EXPECTED_ORIGINAL_CROSSING =
  'relatte-crossing-v0:1742f91012db87da537e6ddbf161c8bf2004a497657d700a71960952bfb54e34';
const NAMES = ['relatte-mw-durable-pilot', 'relatte-mw-owner-pilot'];
const root=resolve('experiments/cloudflare-do');
const receiverConfig=join(root,'wrangler.jsonc');
const ownerConfig=join(root,'owner','wrangler.jsonc');
const wrangler=resolve('node_modules/wrangler/bin/wrangler.js');
const TOKEN=process.env.CLOUDFLARE_API_TOKEN;
const ACCOUNT=process.env.CLOUDFLARE_ACCOUNT_ID;
const MODE=process.env.CLAIMED_ACCOUNT_DEPLOY_CONFIRM;
if(!['VERIFY_CLAIMED_STAGING','REDEPLOY_CLAIMED_STAGING'].includes(MODE))
  throw Error('Explicit claimed-account verification or staging-deploy mode is missing');
if(!TOKEN || TOKEN.length<15 || !/^[a-f0-9]{32}$/i.test(ACCOUNT??''))
  throw Error('Configure claimed-account CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID; never paste tokens into logs');
if(!process.env.GITHUB_ACTIONS || !process.env.CI)
  throw Error('Only the private, manually dispatched GitHub Actions deployment job may run this script');
if(process.env.CLOUDFLARE_API_KEY)
  throw Error('Global Cloudflare API keys are not permitted; use a scoped token');

const ownerToken=randomBytes(32).toString('hex');
const receiverToken=randomBytes(32).toString('hex');
const dummy='sha256:'+'0'.repeat(64);
const temp=await mkdtemp(join(tmpdir(),'mw-claimed-staging-'));
const endpoints={
  receiver:`https://${NAMES[0]}.${EXPECTED_SUBDOMAIN}.workers.dev`,
  owner:`https://${NAMES[1]}.${EXPECTED_SUBDOMAIN}.workers.dev`,
};
const headers={Authorization:'Bearer '+TOKEN};
async function cloudflare(path) {
  const url='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT+path;
  const r=await fetch(url,{headers,signal:AbortSignal.timeout(12000)});
  const data=await r.json().catch(()=>({}));
  if(!r.ok || data.success!==true)
    throw Error('Claimed Cloudflare account preflight failed for '+path+' (HTTP '+r.status+')');
  return data.result;
}
async function remote(base,path,auth,body) {
  const r=await fetch(base+path,{
    method:body===undefined?'GET':'POST',
    headers:{Authorization:'Bearer '+auth,
      ...(body===undefined?{}:{'Content-Type':'application/json'})},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),
    signal:AbortSignal.timeout(18000),
  });
  const value=await r.json().catch(()=>({invalid_json:true}));
  return {status:r.status,value};
}
function requireOk(result,label,status=200) {
  if(result.status!==status)
    throw Error(label+' rejected (HTTP '+result.status+', error '+String(result.value?.error??'unknown')+')');
  return result.value;
}
async function publicHealth(base,label) {
  const r=await fetch(base+'/health',{signal:AbortSignal.timeout(12000)});
  if(!r.ok || (await r.json()).pilot!==true)
    throw Error(label+' was not already a public experimental pilot');
}
async function deploy(config,vals) {
  const path=join(temp,config===ownerConfig?'owner.json':'receiver.json');
  await writeFile(path,JSON.stringify(vals),{mode:0o600});
  const child=spawn(process.execPath,[wrangler,'deploy','--config',config,
    '--secrets-file',path,'--strict'],{
    cwd:process.cwd(),env:{...process.env,WRANGLER_SEND_METRICS:'false'},
    stdio:['ignore','pipe','pipe'],
  });
  const output=[];
  child.stdout.on('data',x=>output.push(String(x)));
  child.stderr.on('data',x=>output.push(String(x)));
  const code=await new Promise((res,rej)=>{child.on('close',res);child.on('error',rej);});
  // Wrangler CLI errors may contain operator paths or headers; never echo raw output.
  if(code!==0)throw Error('Permanent staging deploy failed for '+(config===ownerConfig?'owner':'receiver')
    +' (exit '+code+'). Review private CI logs with secrets protected.');
}
const identity=x=>{
  if(typeof x?.fingerprint!=='string'||!/^sha256:[0-9a-f]{64}$/.test(x.fingerprint))
    throw Error('Invalid declared reLATTE public-key fingerprint');
  return x.fingerprint;
};
const sample={schema:'mw.public-hours/v0',timezone:'America/Chicago',
  days:[1,2,3,4,5],opens:'09:00',closes:'20:45'};
try {
  // The preflight verifies the *specific* previously claimed account BEFORE
  // uploading any script or rotating any secret.
  const scripts=await cloudflare('/workers/scripts');
  if(!Array.isArray(scripts) || !NAMES.every(name=>scripts.some(x=>x?.id===name)))
    throw Error('Refusing to deploy: both original Workers are not in the chosen Cloudflare account');
  const sub=await cloudflare('/workers/subdomain');
  if(sub?.subdomain!==EXPECTED_SUBDOMAIN)
    throw Error('Refusing to deploy: account is not the claimed '+EXPECTED_SUBDOMAIN+' account');
  await publicHealth(endpoints.owner,'owner');
  await publicHealth(endpoints.receiver,'receiver');
  console.log('CLAIMED_ACCOUNT_PREFLIGHT=PASS; verified both original Workers and exact workers.dev namespace');

  if(MODE==='VERIFY_CLAIMED_STAGING') {
    console.log('CLAIMED_ACCOUNT_VERIFICATION_RESULT=PASS');
    console.log('CLAIMED_OWNER_HEALTH='+endpoints.owner+'/health');
    console.log('CLAIMED_RECEIVER_HEALTH='+endpoints.receiver+'/health');
    console.log('CLOUDFLARE_WORKERS_DEPLOYED=false');
    console.log('NO_HISTORY_MODIFICATIONS=true');
  } else {
  // Owner first: rotate its credential, keep it unable to admit remote receipts
  // until the receiver's existing identity has been independently checked.
  await deploy(ownerConfig,{
    MW_OPERATOR_TOKEN:ownerToken, MW_RELAY_TOKEN:receiverToken,
    MW_RECEIVER_FINGERPRINT:dummy,
  });
  const source=identity(requireOk(await remote(endpoints.owner,'/v0/identity',ownerToken),
    'owner public identity'));
  const ownerBefore=requireOk(await remote(endpoints.owner,'/v0/outbox',ownerToken),
    'owner durable history');
  if(!ownerBefore.crossing_ids?.includes(EXPECTED_ORIGINAL_CROSSING)
      ||ownerBefore.confirmed<1)
    throw Error('Original owner history was not recovered; refusing receiver redeploy');

  // Enroll genuine persisted source signer at receiver, recover original
  // signed history, and reject any accidental use of a fresh empty namespace.
  await deploy(receiverConfig,{
    MW_OPERATOR_TOKEN:receiverToken,
    MW_TRUSTED_SOURCE_FINGERPRINT:source,
  });
  const dest=identity(requireOk(await remote(endpoints.receiver,'/v0/identity',receiverToken),
    'receiver public identity'));
  if(source===dest)throw Error('Source/receiver signing identity unexpectedly identical');
  const receiverBefore=requireOk(await remote(endpoints.receiver,'/v0/state',receiverToken),
    'receiver durable history');
  if(!receiverBefore.held?.includes(EXPECTED_ORIGINAL_CROSSING)
      ||receiverBefore.admitted?.length!==0
      ||receiverBefore.journal_length<2)
    throw Error('Original receiver history was not recovered; stop before further writes');

  // Re-enroll receiver fingerprint in source, preserving independent custody.
  await deploy(ownerConfig,{
    MW_OPERATOR_TOKEN:ownerToken, MW_RELAY_TOKEN:receiverToken,
    MW_RECEIVER_FINGERPRINT:dest,
  });
  if(identity(requireOk(await remote(endpoints.owner,'/v0/identity',ownerToken),
    'owner signing identity after redeploy'))!==source)
    throw Error('Owner signing key unexpectedly changed across redeploy');

  const crossing=requireOk(await remote(endpoints.owner,'/v0/propose',ownerToken,{hours:sample}),
    'signed candidate to recipient',202);
  if(!crossing.confirmed || crossing.admitted!==false
      ||crossing.booked!==false ||crossing.published!==false
      ||crossing.receipt_ids?.length!==2)
    throw Error('Unexpected consequence: crossing must be verified HOLD with no business effect');
  const receiverAfter=requireOk(await remote(endpoints.receiver,'/v0/state',receiverToken),
    'receiver after crossing');
  const ownerAfter=requireOk(await remote(endpoints.owner,'/v0/outbox',ownerToken),
    'owner after crossing');
  if(!receiverAfter.held?.includes(EXPECTED_ORIGINAL_CROSSING)
      ||!receiverAfter.held?.includes(crossing.crossing_id)
      ||ownerAfter.pending!==0||!ownerAfter.crossing_ids?.includes(EXPECTED_ORIGINAL_CROSSING)
      ||ownerAfter.confirmed<ownerBefore.confirmed)
    throw Error('Source or receiver lost original durable state');

  const duplicate=requireOk(await remote(endpoints.owner,'/v0/propose',ownerToken,{hours:sample}),
    'repeat crossing',200);
  if(!duplicate.duplicate||duplicate.crossing_id!==crossing.crossing_id)
    throw Error('Duplicate delivery created new owner history');
  const finalReceiver=requireOk(await remote(endpoints.receiver,'/v0/state',receiverToken),
    'final receiver');
  if(finalReceiver.journal_length!==receiverAfter.journal_length)
    throw Error('Duplicate delivery appended another receiver event');

  console.log('CLAIMED_ACCOUNT_STAGING_RESULT=PASS');
  console.log('CLAIMED_OWNER_HEALTH='+endpoints.owner+'/health');
  console.log('CLAIMED_RECEIVER_HEALTH='+endpoints.receiver+'/health');
  console.log('PERSISTED_ORIGINAL_CROSSING='+EXPECTED_ORIGINAL_CROSSING);
  console.log('NEW_STAGING_CROSSING='+crossing.crossing_id);
  console.log('RECEIVER_HOLD_COUNT='+finalReceiver.held.length);
  console.log('NO_BOOKING_NO_PUBLICATION=true');
  console.log('Operator tokens rotated and intentionally NOT retained by CI.');
  }
} catch(error) {
  console.error(MODE==='VERIFY_CLAIMED_STAGING' ? 'CLAIMED_ACCOUNT_VERIFICATION_RESULT=FAIL' : 'CLAIMED_ACCOUNT_STAGING_RESULT=FAIL');
  console.error(String(error.message).slice(0,600));
  process.exitCode=1;
} finally {
  await rm(temp,{recursive:true,force:true});
}
