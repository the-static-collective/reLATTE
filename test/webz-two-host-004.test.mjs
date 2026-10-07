import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,readdir,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {LocalReceiver,verifyReceipt} from '../src/index.ts';
import {prepareSender,processReceiver,verifyTransfer} from '../scripts/webz-two-host-004.mjs';

const sender={role:'sender',run_id:'local',machine_fingerprint:'a'.repeat(64)};
const receiver={role:'receiver',run_id:'local',machine_fingerprint:'b'.repeat(64)};
async function setup() {
  const root=await mkdtemp(join(tmpdir(),'two-host-webz-004-'));
  const fixtureRoot=join(root,'author-source');
  const output=join(root,'brokered-carriers');
  const publicDir=join(root,'public-receipts');
  const privateRoot=join(root,'recipient-owned-private');
  await mkdir(fixtureRoot,{recursive:true});
  for(const [kind,artifact_kind] of [['fruit','fictional-reality-fruit'],['spore','fictional-uninvited-spore']]) {
    const body={
      schema:'webz.artifact/v0',artifact_kind,
      world_id:'webz:the-static-collective/sanctuary',
      title:kind==='fruit'?'Impossible orange':'Uninvited story-spore',
      description:'Entirely fictional original first-party public JSON fixture.',
      fictional:true,publication_scope:'public-first-party-test-fixture',seed:'022100',
    };
    await writeFile(join(fixtureRoot,'webz-'+kind+'.json'),JSON.stringify(body,null,2)+'\n');
  }
  return {root,fixtureRoot,output,publicDir,privateRoot};
}
async function prepared(h) {
  await prepareSender(h.fixtureRoot,h.output,sender);
  await processReceiver(h.output,h.publicDir,h.privateRoot,receiver);
}
async function update(path,fn) {const data=JSON.parse(await readFile(path,'utf8'));fn(data);await writeFile(path,JSON.stringify(data,null,2)+'\n');}
const changed=async (h)=>await readFile(join(h.publicDir,'orchard-public-receipts.json'),'utf8');

test('sender signs real bytes; receiver independently signs two opposed dispositions; verifier checks both',async()=>{
  const h=await setup();
  try {
    await prepared(h);
    const witness=await verifyTransfer(h.output,h.publicDir);
    assert.equal(witness.verified,true);
    assert.equal(witness.artifacts.fruit.disposition,'HOLD');
    assert.equal(witness.artifacts.spore.disposition,'REFUSE');
    assert.notEqual(witness.sender_machine_fingerprint,witness.receiver_machine_fingerprint);
    assert.equal((await readdir(h.output)).length,3);
    assert.deepEqual(await readdir(h.publicDir),['orchard-public-receipts.json']);
    assert.ok(!(await changed(h)).includes('private_key'));
    const local=await LocalReceiver.open(h.privateRoot);
    assert.equal(local.snapshot().admitted.length,0);
    assert.equal(local.snapshot().held.length,1);
    assert.equal(local.snapshot().refused.length,1);
    const id=witness.artifacts.fruit.crossing_id;
    const carrier=JSON.parse(await readFile(join(h.output,'carrier-fruit.json'),'utf8'));
    assert.deepEqual(await readFile(join(h.privateRoot,'payloads',id+'.bin')),Buffer.from(carrier.payload_base64,'base64'));
    await assert.rejects(()=>stat(join(h.privateRoot,'payloads',witness.artifacts.spore.crossing_id+'.bin')),{code:'ENOENT'});
    const publicDoc=JSON.parse(await changed(h));
    assert.equal(await verifyReceipt(publicDoc.results.fruit.custody_receipt),true);
    assert.equal(await verifyReceipt(publicDoc.results.spore.custody_receipt),true);
  } finally {await rm(h.root,{recursive:true,force:true});}
});

test('unverified byte substitution is caught before receiver creates recipient root',async()=>{
  const h=await setup();
  try{
    await prepareSender(h.fixtureRoot,h.output,sender);
    await update(join(h.output,'carrier-fruit.json'),o=>{o.payload_base64=Buffer.from('{"fake":true}').toString('base64');});
    await assert.rejects(()=>processReceiver(h.output,h.publicDir,h.privateRoot,receiver),/INCONSISTENT_ARTIFACT_HANDOFF|CARRIER_NOT_BOUND_TO_DECLARED_SOURCE|UNAUTHORIZED_FIXTURE|UNRECOGNIZED_FIXTURE_FIELDS/);
    await assert.rejects(()=>stat(h.privateRoot),{code:'ENOENT'});
  }finally{await rm(h.root,{recursive:true,force:true});}
});

test('altered source signature and extra carrier entry are rejected before local receiver effects',async()=>{
  const h=await setup();
  try{
    await prepareSender(h.fixtureRoot,h.output,sender);
    await update(join(h.output,'carrier-fruit.json'),o=>{o.crossing.requested_effect.kind='auto-admit';});
    await assert.rejects(()=>processReceiver(h.output,h.publicDir,h.privateRoot,receiver));
    await assert.rejects(()=>stat(h.privateRoot),{code:'ENOENT'});
  }finally{await rm(h.root,{recursive:true,force:true});}
});

test('receiver public receipt forgery and swapped disposition fail independent verifier',async()=>{
  const h=await setup();
  try{
    await prepared(h);
    await update(join(h.publicDir,'orchard-public-receipts.json'),o=>{
      o.results.fruit.custody_receipt.extensions.local_receiver.payload_custody.byte_length=1337;
    });
    await assert.rejects(()=>verifyTransfer(h.output,h.publicDir),/INVALID_DESTINATION_SIGNED_RECEIPT|CUSTODY_NOT_BOUND/);
  }finally{await rm(h.root,{recursive:true,force:true});}
});

test('receiver machine must differ and source/receiver run must match',async()=>{
  const h=await setup();
  try{
    await prepareSender(h.fixtureRoot,h.output,sender);
    await assert.rejects(()=>processReceiver(h.output,h.publicDir,h.privateRoot,{
      ...receiver,machine_fingerprint:sender.machine_fingerprint,
    }),/NO_INDEPENDENT_RUNNER_EVIDENCE/);
    await assert.rejects(()=>processReceiver(h.output,h.publicDir,h.privateRoot,{
      ...receiver,run_id:'456',
    }),/RUN_IDS_DO_NOT_MATCH/);
  }finally{await rm(h.root,{recursive:true,force:true});}
});

test('receiver private root cannot be uploaded under public receipts',async()=>{
  const h=await setup();
  try{
    await prepareSender(h.fixtureRoot,h.output,sender);
    await assert.rejects(()=>processReceiver(h.output,h.publicDir,join(h.publicDir,'private'),receiver),/PRIVATE_RECEIVER_ROOT_INSIDE_PUBLIC_ARTIFACT/);
    await assert.rejects(()=>stat(join(h.publicDir,'private')),{code:'ENOENT'});
  }finally{await rm(h.root,{recursive:true,force:true});}
});

test('foreign material and malicious extra fields fail exact first-party allowlist',async()=>{
  const h=await setup();
  try{
    await update(join(h.fixtureRoot,'webz-fruit.json'),o=>{o.human_name='secret';});
    await assert.rejects(()=>prepareSender(h.fixtureRoot,h.output,sender),/UNRECOGNIZED_FIXTURE_FIELDS/);
  }finally{await rm(h.root,{recursive:true,force:true});}
});

test('same receiver machine retries a completed handoff without rewriting signed receipts',async()=>{
  const h=await setup();
  try{
    await prepared(h);
    const before=await changed(h);
    const journal=await readFile(join(h.privateRoot,'journal.jsonl'),'utf8');
    const repeated=await processReceiver(h.output,h.publicDir,h.privateRoot,receiver);
    assert.equal(JSON.stringify(repeated,null,2)+'\n',before);
    assert.equal(await readFile(join(h.privateRoot,'journal.jsonl'),'utf8'),journal);
    assert.equal((await verifyTransfer(h.output,h.publicDir)).verified,true);
  }finally{await rm(h.root,{recursive:true,force:true});}
});

test('same-public-receipts retry with a foreign runner refuses rather than adopting a prior result',async()=>{
  const h=await setup();
  try{
    await prepared(h);
    await assert.rejects(()=>processReceiver(h.output,h.publicDir,h.privateRoot,{
      ...receiver,machine_fingerprint:'c'.repeat(64),
    }),/RETRY_FROM_DIFFERENT_RUNNER_OR_SOURCE/);
  }finally{await rm(h.root,{recursive:true,force:true});}
});
