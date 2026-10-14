// Deploy a disposable remote Cloudflare staging specimen through Wrangler's
// temporary-account flow. Never touches user DNS, existing Cloudflare account,
// mysticalwhimsey.org, production Vercel, booking, payments or customer data.
// Intended to run in a private GitHub Actions job: logs include claim capability.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve('experiments/cloudflare-do');
const receiverConfig = join(root,'wrangler.jsonc');
const ownerConfig = join(root,'owner','wrangler.jsonc');
const wrangler = resolve('node_modules/wrangler/bin/wrangler.js');
const home = await mkdtemp(join(tmpdir(),'mw-edge-temp-'));
const recvToken = randomBytes(32).toString('hex');
const ownerToken = randomBytes(32).toString('hex');
// Single receiver-scoped token: the owner Worker may relay but cannot read the receiver's key.
const relayToken = recvToken;
const receiverTemp = join(home,'receiver-secrets.json');
const ownerTemp = join(home,'owner-secrets.json');
const claimUrls = [];
let receiverUrl = '', ownerUrl = '';

if (process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_API_KEY) {
  throw Error('Refusing temporary deployment when authenticated Cloudflare credentials are present');
}
if (!process.env.CI || !process.env.GITHUB_ACTIONS) {
  throw Error('This disposable deployment command requires a private GitHub Actions runner');
}
const baseEnv = {
  ...process.env,
  HOME: home,
  XDG_CONFIG_HOME: join(home,'.config'),
  WRANGLER_SEND_METRICS: 'false',
};
const hostRegex = /https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev/ig;
const claimRegex = /https:\/\/dash\.cloudflare\.com\/claim-preview\?claimToken=[^\s"'<>]+/ig;

async function wranglerRun(args) {
  const child = spawn(process.execPath,[wrangler,...args],{
    env:baseEnv,cwd:process.cwd(),stdio:['ignore','pipe','pipe'],
  });
  const captured = [];
  let len=0;
  const add=x=>{
    const s=String(x);
    len+=s.length;
    if(len<500_000)captured.push(s);
  };
  child.stdout.on('data',add);
  child.stderr.on('data',add);
  const exit = await new Promise((resolve,reject)=>{
    child.on('close',resolve);child.on('error',reject);
  });
  const output=captured.join('');
  for(const url of output.match(claimRegex)??[]) {
    if(!claimUrls.includes(url))claimUrls.push(url);
  }
  // Never print Cloudflare claim tokens, API credentials or full CLI traces.
  if(exit!==0) {
    const scrubbed=output.replace(claimRegex,'[CLAIM_URL_REDACTED]')
      .replaceAll(recvToken,'[REDACTED]').replaceAll(ownerToken,'[REDACTED]')
      .replaceAll(relayToken,'[REDACTED]').slice(-2700);
    throw Error('Wrangler '+args.slice(0,2).join(' ')+' failed (exit '+exit+'): '+scrubbed);
  }
  return output;
}
const accountClaimStatus = () => claimUrls.length ? 'available' : 'not_printed';
async function deploy(config,secrets) {
  const path=config===receiverConfig?receiverTemp:ownerTemp;
  await writeFile(path,JSON.stringify(secrets),{mode:0o600,flag:'w'});
  const out=await wranglerRun(['deploy','--temporary','--config',config,'--secrets-file',path]);
  // A deploy URL is derived ONLY from output verified by Wrangler.
  const urls=out.match(hostRegex)??[];
  if(!urls.length) throw Error('Cloudflare deploy produced no workers.dev URL');
  return urls.at(-1);
}
async function call(url,path,token,body) {
  const response=await fetch(url+path,{
    method:body===undefined?'GET':'POST',
    headers:{Authorization:'Bearer '+token,...(body===undefined?{}:{'Content-Type':'application/json'})},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),
    signal:AbortSignal.timeout(15000),
  });
  const payload=await response.json().catch(()=>({invalid_json:true}));
  return {status:response.status,payload};
}
async function awaitReady(url,label) {
  let last = 'unavailable';
  for (let n=0;n<45;n++) {
    try {
      const response=await fetch(url+'/health',{signal:AbortSignal.timeout(4500)});
      const body=await response.text();
      if(response.status===200) {
        const parsed=JSON.parse(body);
        if(parsed.pilot===true)return;
      }
      last='HTTP '+response.status+' '+body.slice(0,160);
    } catch(error) {last=error.message;}
    await new Promise(r=>setTimeout(r,2000));
  }
  throw Error(label+' endpoint did not become ready: '+last);
}
function required(actual,label,status=200) {
  if(actual.status!==status)throw Error(label+' unexpectedly returned HTTP '+actual.status+': '
    +JSON.stringify(actual.payload).slice(0,600));
  return actual.payload;
}
const dummy='sha256:'+'0'.repeat(64);
const sample={schema:'mw.public-hours/v0',timezone:'America/Chicago',
  days:[1,2,3,4,5],opens:'09:00',closes:'21:00'};
try {
  console.log('TEMP_STAGING_BEGIN: fictional public-hours hash only; no business writes');
  // Target service must exist before caller can deploy a Service Binding.
  receiverUrl = await deploy(receiverConfig,{
    MW_OPERATOR_TOKEN:recvToken, MW_TRUSTED_SOURCE_FINGERPRINT:dummy,
  });
  await awaitReady(receiverUrl,'receiver');
  const receiverIdentity=required(
    await call(receiverUrl,'/v0/identity',recvToken), 'receiver identity');
  if(!/^sha256:[a-f0-9]{64}$/.test(receiverIdentity.fingerprint))
    throw Error('Invalid receiver public key fingerprint');

  ownerUrl = await deploy(ownerConfig,{
    MW_OPERATOR_TOKEN:ownerToken, MW_RELAY_TOKEN:relayToken,
    MW_RECEIVER_FINGERPRINT:receiverIdentity.fingerprint,
  });
  await awaitReady(ownerUrl,'owner');
  const ownerIdentity=required(await call(ownerUrl,'/v0/identity',ownerToken),'owner identity');
  if(!/^sha256:[a-f0-9]{64}$/.test(ownerIdentity.fingerprint)
      || ownerIdentity.fingerprint===receiverIdentity.fingerprint)
    throw Error('Owner and receiver public key enrollment invalid');

  // Re-deploy the SAME receiver namespace, now pinned to the owner public key.
  const afterPinUrl=await deploy(receiverConfig,{
    MW_OPERATOR_TOKEN:recvToken,
    MW_TRUSTED_SOURCE_FINGERPRINT:ownerIdentity.fingerprint,
  });
  if(afterPinUrl!==receiverUrl)throw Error('Receiver URL changed across pinned-key redeploy');
  await awaitReady(receiverUrl,'receiver after source pin');
  // Remote secret propagation can lag behind an already healthy old Worker.
  // Confirm the new public trust anchor before attempting the crossing.
  let trustConfirmed=false, observedPin='not-returned';
  for(let n=0;n<45;n++){
    const trust=await call(receiverUrl,'/v0/trust',recvToken).catch(()=>null);
    observedPin=trust?.payload?.source_fingerprint??'missing';
    if(trust?.status===200 && observedPin===ownerIdentity.fingerprint){
      trustConfirmed=true;break;
    }
    await new Promise(r=>setTimeout(r,1800));
  }
  if(!trustConfirmed)throw Error('Remote pinned source signer did not update: '+observedPin);


  // The public edge is authenticated; business data is never accepted.
  const denied=await fetch(ownerUrl+'/v0/outbox',{signal:AbortSignal.timeout(15000)});
  if(denied.status!==401)throw Error('Owner state endpoint did not refuse anonymous access');
  const crossing=required(await call(ownerUrl,'/v0/propose',ownerToken,{hours:sample}),
    'owner to receiver signed proposal',202);
  if(!crossing.confirmed||crossing.admitted||crossing.published||crossing.booked
      ||crossing.receipt_ids?.length!==2)
    throw Error('Unexpected proposal consequence or receipt count');

  const receiverState=required(await call(receiverUrl,'/v0/state',recvToken),'receiver state');
  const ownerState=required(await call(ownerUrl,'/v0/outbox',ownerToken),'owner state');
  if(receiverState.journal_length!==2||receiverState.held?.length!==1
      ||receiverState.admitted?.length||ownerState.confirmed!==1
      ||ownerState.pending!==0)throw Error('Receiver/owner independent histories mismatch');

  // Redeploy both and verify durable state after remote service code replacement.
  await deploy(receiverConfig,{MW_OPERATOR_TOKEN:recvToken,
    MW_TRUSTED_SOURCE_FINGERPRINT:ownerIdentity.fingerprint});
  await deploy(ownerConfig,{MW_OPERATOR_TOKEN:ownerToken,MW_RELAY_TOKEN:relayToken,
    MW_RECEIVER_FINGERPRINT:receiverIdentity.fingerprint});
  const retried=required(await call(ownerUrl,'/v0/propose',ownerToken,{hours:sample}),
    'owner durable retry',200);
  if(!retried.duplicate||retried.crossing_id!==crossing.crossing_id)
    throw Error('Remote duplicate receipt not stable after deploy');
  const afterState=required(await call(receiverUrl,'/v0/state',recvToken),'receiver state after redeploy');
  if(afterState.journal_length!==2||afterState.held?.[0]!==crossing.crossing_id)
    throw Error('Remote receiver lost history after redeploy');

  console.log('TEMP_STAGING_RESULT=PASS');
  console.log('REMOTE_RECEIVER_URL='+receiverUrl+'/health');
  console.log('REMOTE_OWNER_URL='+ownerUrl+'/health');
  console.log('REMOTE_CROSSING_ID='+crossing.crossing_id);
  console.log('REMOTE_RECEIVER_JOURNAL_LENGTH=2');
  console.log('REMOTE_OWNER_CONFIRMED=1');
  console.log('REMOTE_OWNER_AND_RECEIVER_KEYS_DISTINCT=true');
  console.log('REMOTE_PROPOSAL_BUSINESS_EFFECT=none');
  console.log('CLOUDFLARE_TEMP_ACCOUNT_CLAIM='+accountClaimStatus());
  // Claim URLs are bearer capabilities. Private GitHub repo logs are readable
  // by its collaborators. No private key or API token is printed.
  if(claimUrls.length)console.log('PRIVATE_CLOUDFLARE_CLAIM_LINK='+claimUrls.at(-1));
  else console.log('CLAIM_LINK_NOT_RETURNED: temporary account will expire');
} catch(error) {
  console.error('TEMP_STAGING_RESULT=FAIL');
  console.error(error.message);
  if(receiverUrl)console.error('CREATED_RECEIVER_HEALTH='+receiverUrl+'/health');
  if(ownerUrl)console.error('CREATED_OWNER_HEALTH='+ownerUrl+'/health');
  if(claimUrls.length)console.error('PRIVATE_CLOUDFLARE_CLAIM_LINK='+claimUrls.at(-1));
  process.exitCode=1;
} finally {
  await rm(home,{recursive:true,force:true});
}
