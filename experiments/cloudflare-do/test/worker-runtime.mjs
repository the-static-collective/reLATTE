// Actual local Workers runtime proof: no Cloudflare account, remote deploy,
// customer data, or production secrets. Requires Wrangler installed locally.
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { generateP256KeyPair, sealCrossingEnvelope, verifyReceipt } from '../../../src/protocol.ts';
import { sourceFingerprint, SOURCE_PARTICULAR, SOURCE_WORLD, ALLOWED_KIND } from '../receiver.mjs';
const root=resolve('experiments/cloudflare-do');
const vars=join(root,'.dev.vars');
const work=await mkdtemp(join(tmpdir(),'relatte-cf-do-'));
const endpoint='http://127.0.0.1:8787';
let runner=null;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function ready() {
  let lastError;
  for(let n=0;n<100;n++) {
    try {
      const response=await fetch(endpoint+'/health',{signal:AbortSignal.timeout(1200)});
      if(response.ok) return;
      lastError=Error('HTTP '+response.status);
    } catch(e) {lastError=e;}
    if(runner?.exitCode !== null || runner?.signalCode) throw Error('Wrangler exited before ready: '+runner?.exitCode+' '+lastError);
    await delay(150);
  }
  throw Error('Worker did not become ready: '+lastError);
}
function start() {
  runner=spawn(process.execPath,[
    resolve('node_modules/wrangler/bin/wrangler.js'),'dev',
    '--config',join(root,'wrangler.jsonc'),'--local','--ip','127.0.0.1',
    '--port','8787','--persist-to',work,
  ],{cwd:process.cwd(),env:{...process.env,WRANGLER_SEND_METRICS:'false'},
    stdio:['ignore','pipe','pipe']});
  let printed=0;
  for(const pipe of [runner.stdout,runner.stderr]) pipe.on('data',chunk=>{
    if (printed < 12000) {process.stderr.write(chunk); printed+=chunk.length;}
  });
}
async function stop() {
  if(!runner || runner.exitCode!==null)return;
  const p=runner;
  p.kill('SIGTERM');
  await Promise.race([once(p,'exit'),delay(2500)]);
  if(p.exitCode===null && !p.signalCode) p.kill('SIGKILL');
  runner=null;
}
const owner=await generateP256KeyPair();
const pinned=sourceFingerprint(owner.publicKeyJwk);
const token=randomBytes(32).toString('hex');
const sha=createHash('sha256').update('fictional public hours').digest('hex');
const crossing=await sealCrossingEnvelope({
  schema:'relatte.crossing-envelope/v0',protocol_version:'0',
  source_world:SOURCE_WORLD,source_particular:SOURCE_PARTICULAR,
  source_history_head:null,parents:[],declared_kind:ALLOWED_KIND,
  payload_refs:[{address:'sha256:'+sha,role:'service-hours-proposal',media_type:'application/json'}],
  requested_effect:null,capability_ref:null,privacy_policy:null,audience_policy:null,
  return_address:null,created_at:new Date().toISOString(),extensions:{},
},owner);
function api(path,options={}) {
  return fetch(endpoint+path,{...options,headers:{
    Authorization:'Bearer '+token,...options.headers,
  }});
}
async function readState() {
  const response=await api('/v0/state');
  assert.equal(response.status,200);
  return response.json();
}
try {
  await assert.rejects(()=>access(vars),/ENOENT/); // Never overwrite a developer's local secret file.
  await writeFile(vars,'MW_OPERATOR_TOKEN='+token+'\nMW_TRUSTED_SOURCE_FINGERPRINT='+pinned+'\n',{flag:'wx',mode:0o600});
  start();
  await ready();
  assert.equal((await fetch(endpoint+'/v0/state')).status,401);
  assert.equal((await readState()).journal_length,0);
  const firstResponse=await api('/v0/crossings',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify(crossing),
  });
  assert.equal(firstResponse.status,202,await firstResponse.text().catch(()=>'')); // below uses new request
  // Test the actual returned signed receipts via the same reLATTE verifier.
  const repeatedResponse=await api('/v0/crossings',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify(crossing),
  });
  assert.equal(repeatedResponse.status,200);
  const repeat=await repeatedResponse.json();
  assert.equal(repeat.duplicate,true);
  assert.ok(await verifyReceipt(repeat.receive_receipt));
  assert.ok(await verifyReceipt(repeat.disposition_receipt));
  assert.equal(repeat.disposition_receipt.kind,'R3_HOLD');
  assert.equal((await readState()).journal_length,2);
  const receiptId=repeat.receive_receipt.receipt_id;
  await stop();
  start();
  await ready();
  const cold=await readState();
  assert.equal(cold.journal_length,2);
  assert.equal(cold.held[0],crossing.crossing_id);
  const afterRestart=await api('/v0/crossings',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify(crossing),
  });
  assert.equal(afterRestart.status,200);
  assert.equal((await afterRestart.json()).receive_receipt.receipt_id,receiptId);
  assert.equal((await readState()).journal_length,2);
  console.log('CF_DO_RUNTIME_PROOF: local worker + persistent SQLite restart + matching reLATTE receipts PASS');
} finally {
  await stop();
  await rm(vars,{force:true});
  await rm(work,{recursive:true,force:true});
}
