// Real two-Wrangler-process integration: independent persisted DOs,
// service binding across Workers, signed packets and origin-verified receipts.
// Requires Wrangler installed; never contacts a Cloudflare account or real business.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp,writeFile,rm,access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
const root=resolve('experiments/cloudflare-do');
const receiverVars=join(root,'.dev.vars');
const ownerVars=join(root,'owner','.dev.vars');
const rootDir=await mkdtemp(join(tmpdir(),'relatte-two-worlds-'));
const runnerBin=resolve('node_modules/wrangler/bin/wrangler.js');
const recvToken=randomBytes(32).toString('hex');
const ownerToken=randomBytes(32).toString('hex');
const dummy='sha256:'+'0'.repeat(64);
const instances=new Map();
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const base={receiver:'http://127.0.0.1:8787',owner:'http://127.0.0.1:8788'};
function cfg(name) {
 return name==='receiver'?join(root,'wrangler.jsonc'):join(root,'owner','wrangler.jsonc');
}
function newProc(name) {
 const port=name==='receiver'?'8787':'8788';
 const proc=spawn(process.execPath,[runnerBin,'dev','--config',cfg(name),
  '--local','--ip','127.0.0.1','--port',port,
  '--persist-to',join(rootDir,name)
 ],{cwd:process.cwd(),env:{...process.env,WRANGLER_SEND_METRICS:'false'},
   stdio:['ignore','pipe','pipe']});
 let printed=0;
 for(const stream of [proc.stdout,proc.stderr]) stream.on('data',c=>{
  if(printed<12000) {process.stderr.write(c);printed+=c.length;}
 });
 instances.set(name,proc);
 return proc;
}
async function boot(name){
 const proc=newProc(name);
 let last='';
 for(let n=0;n<140;n++) {
  try {
   const r=await fetch(base[name]+'/health',{signal:AbortSignal.timeout(1200)});
   if(r.status===200)return;
   last='HTTP '+r.status;
  } catch(e){last=e.message;}
  if(proc.exitCode!==null || proc.signalCode)throw Error(name+' exited before startup: '+last);
  await wait(150);
 }
 throw Error(name+' startup timed out: '+last);
}
async function stop(name) {
 const proc=instances.get(name);
 if(!proc || proc.exitCode!==null)return;
 proc.kill('SIGTERM');
 await Promise.race([once(proc,'exit'),wait(3000)]);
 if(proc.exitCode===null && !proc.signalCode)proc.kill('SIGKILL');
 instances.delete(name);
}
async function jsonCall(name,path,token,body) {
 const r=await fetch(base[name]+path,{
  ...(body===undefined?{}:{method:'POST',body:JSON.stringify(body)}),
  headers:{Authorization:'Bearer '+token,...(body===undefined?{}:{'Content-Type':'application/json'})},
  signal:AbortSignal.timeout(7500),
 });
 return {status:r.status,body:await r.json()};
}
async function setVars(path,pairs) {
 await writeFile(path,Object.entries(pairs).map(([k,v])=>k+'='+v).join('\n')+'\n',{mode:0o600});
}
const hours={schema:'mw.public-hours/v0',timezone:'America/Chicago',
 days:[1,2,3,4,5],opens:'09:00',closes:'21:00'};
try {
 await assert.rejects(()=>access(receiverVars),/ENOENT/);
 await assert.rejects(()=>access(ownerVars),/ENOENT/);
 // First bootstrap receiver identity without assuming its source authorization.
 await setVars(receiverVars,{MW_OPERATOR_TOKEN:recvToken,MW_TRUSTED_SOURCE_FINGERPRINT:dummy});
 await boot('receiver');
 const initialRecipient=await jsonCall('receiver','/v0/identity',recvToken);
 assert.equal(initialRecipient.status,200,JSON.stringify(initialRecipient.body));
 const recipientPin=initialRecipient.body.fingerprint;
 assert.match(recipientPin,/^sha256:[a-f0-9]{64}$/);
 // Separate owner node generates and privately stores its own key in its own DO.
 await setVars(ownerVars,{MW_OPERATOR_TOKEN:ownerToken,MW_RELAY_TOKEN:recvToken,
  MW_RECEIVER_FINGERPRINT:recipientPin});
 await boot('owner');
 const source=await jsonCall('owner','/v0/identity',ownerToken);
 assert.equal(source.status,200,JSON.stringify(source.body));
 const sourcePin=source.body.fingerprint;
 assert.notEqual(sourcePin,recipientPin);
 // Enrol source key independently at the receiver; no source secret is transferred.
 await stop('owner');
 await stop('receiver');
 await setVars(receiverVars,{MW_OPERATOR_TOKEN:recvToken,MW_TRUSTED_SOURCE_FINGERPRINT:sourcePin});
 await boot('receiver');
 await boot('owner');
 const denial=await fetch(base.owner+'/v0/outbox');
 assert.equal(denial.status,401);
 const delivered=await jsonCall('owner','/v0/propose',ownerToken,{hours});
 assert.equal(delivered.status,202,JSON.stringify(delivered.body));
 assert.equal(delivered.body.confirmed,true);
 assert.equal(delivered.body.published,false);
 assert.equal(delivered.body.booked,false);
 assert.equal(delivered.body.admitted,false);
 assert.equal(delivered.body.receipt_ids.length,2);
 const ownerState=await jsonCall('owner','/v0/outbox',ownerToken);
 const recvState=await jsonCall('receiver','/v0/state',recvToken);
 assert.equal(ownerState.body.generated,1);
 assert.equal(ownerState.body.confirmed,1);
 assert.equal(ownerState.body.pending,0);
 assert.equal(recvState.body.journal_length,2);
 assert.deepEqual(recvState.body.held,[delivered.body.crossing_id]);
 assert.deepEqual(recvState.body.admitted,[]);
 // Kill both Workers, recreate isolates with the *same* private durable databases.
 await stop('owner');
 await stop('receiver');
 await boot('receiver');
 await boot('owner');
 const recovery=await jsonCall('owner','/v0/propose',ownerToken,{hours});
 assert.equal(recovery.status,200,JSON.stringify(recovery.body));
 assert.equal(recovery.body.duplicate,true);
 assert.equal(recovery.body.crossing_id,delivered.body.crossing_id);
 assert.equal((await jsonCall('receiver','/v0/state',recvToken)).body.journal_length,2);
 assert.equal((await jsonCall('owner','/v0/outbox',ownerToken)).body.confirmed,1);
 assert.equal((await jsonCall('receiver','/v0/identity',recvToken)).body.fingerprint,recipientPin);
 assert.equal((await jsonCall('owner','/v0/identity',ownerToken)).body.fingerprint,sourcePin);
 console.log('TWO_WORLD_EDGE_PROOF: distinct Worker processes, independent persisted keys, service binding, signed crossing, signed receipt, restart PASS');
} finally {
 await stop('owner');await stop('receiver');
 await rm(receiverVars,{force:true});await rm(ownerVars,{force:true});
 await rm(rootDir,{recursive:true,force:true});
}
