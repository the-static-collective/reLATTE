#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  LocalReceiver, RelatteVm,
  createVmManifest, createWasmVmPackage, generateP256KeyPair,
  proposeWasmVm, runWitnessedWasmVm,
  verifyWasmVmCandidate, verifyWasmExecutionWitness,
  verifyIndependentWasmWitnessPair,
} from '../src/index.ts';

const ADD_WASM = Buffer.from('AGFzbQEAAAABBwFgAn9/AX8DAgEABwgBBHN0ZXAAAAoJAQcAIAAgAWoL','base64');
const identity = suffix => ({
  world_id:'world:vm003-'+suffix,
  particular:'particular:vm003-'+suffix,
  runtime_id:'runtime:vm003-'+suffix,
});
const timestamp = () => new Date().toISOString();
const readJson = async filename => JSON.parse(await readFile(filename,'utf8'));
async function save(filename,value) {
  await writeFile(filename,JSON.stringify(value,null,2)+'\n','utf8');
}
function hydrate(payload) {
  assert.equal(typeof payload.wasm_b64,'string');
  const {wasm_b64,...candidate}=payload;
  return {...candidate,wasm_bytes:Buffer.from(wasm_b64,'base64')};
}
async function prepare(outDir) {
  await mkdir(outDir,{recursive:true});
  const manifest=createVmManifest(8,1);
  const parent = new RelatteVm(manifest,identity('origin'));
  const guest = parent.spawnGuest(identity('source'));
  guest.increment();
  const keys = await generateP256KeyPair();
  const parent_crossing=await guest.proposeSelf(keys,timestamp());
  const pkg=createWasmVmPackage(manifest,ADD_WASM,1500);
  const wasm_crossing=await proposeWasmVm({
    manifest,parent_crossing,wasm_bytes:ADD_WASM,package:pkg,
    signing_keys:keys,created_at:timestamp(),
  });
  const candidate={manifest,parent_crossing,wasm_crossing,package:pkg,wasm_bytes:ADD_WASM};
  assert.equal(await verifyWasmVmCandidate(candidate),true);
  await save(join(outDir,'candidate.json'),{
    manifest,parent_crossing,wasm_crossing,package:pkg,
    wasm_b64:ADD_WASM.toString('base64'),
  });
  console.log(JSON.stringify({stage:'prepare',candidate_id:wasm_crossing.crossing_id,public_carrier:true}));
}
async function host(sourceFile,outDir,label) {
  if (!['runner-a','runner-b'].includes(label)) throw new Error('UNSUPPORTED_RUNNER_LABEL');
  const candidate=hydrate(await readJson(sourceFile));
  assert.equal(await verifyWasmVmCandidate(candidate),true);
  const hostRoot = await mkdtemp(join(tmpdir(),'relatte-vm003-private-'+label+'-'));
  try {
    const receiver=await LocalReceiver.create(join(hostRoot,'owner'),{
      world_id:'world:vm003-owner-'+label,
      receiver_particular:'particular:vm003-owner-'+label,
      contract_ref:'contract:vm003-host-'+label+'/v0',
    });
    const receive_receipt=await receiver.receive(candidate.wasm_crossing,timestamp());
    const admit_receipt=await receiver.dispose(candidate.wasm_crossing.crossing_id,'ADMIT',
      timestamp(),{admit_effect:'relatte-wasm-vm-launch'});
    const evidence={
      receive_receipt,admit_receipt,
      owner:{
        world_id:receiver.config.world_id,
        receiver_particular:receiver.config.receiver_particular,
        contract_ref:receiver.config.contract_ref,
        public_key:structuredClone(receive_receipt.signing.public_key),
      },
    };
    const witness_keys=await generateP256KeyPair();
    const execution=await runWitnessedWasmVm({
      candidate,evidence,host_root:receiver.root,
      successor:identity('fresh-'+label),
      left:19,right:23,witness_keys,
      runner_label:label,observed_at:timestamp(),
    });
    const publicWitness={
      evidence,
      receipt:execution.receipt,
      pinned_witness_key:witness_keys.publicKeyJwk,
    };
    assert.equal(await verifyWasmExecutionWitness({candidate,...publicWitness}),true);
    assert.equal(execution.run.result,42);
    await mkdir(outDir,{recursive:true});
    await save(join(outDir,'witness.json'),publicWitness);
    console.log(JSON.stringify({
      stage:label,verified:true,
      receipt_id:execution.receipt.receipt_id,
      owner_world:evidence.owner.world_id,
      result:execution.run.result,
      process_id:execution.run.pid,
      private_keys_exported:false,
    }));
  } finally {
    await rm(hostRoot,{recursive:true,force:true});
  }
}
async function verify(sourceFile,aFile,bFile) {
  const candidate=hydrate(await readJson(sourceFile));
  const a=await readJson(aFile);
  const b=await readJson(bFile);
  if (a.receipt.extensions?.vm003?.runner_label !== 'runner-a' ||
      b.receipt.extensions?.vm003?.runner_label !== 'runner-b') {
    throw new Error('VM003_RUNNER_LINEAGE_MISMATCH');
  }
  if (!(await verifyIndependentWasmWitnessPair(candidate,a,b))) {
    throw new Error('VM003_WITNESS_PAIR_INVALID');
  }
  const observedA=a.receipt.extensions.vm003;
  const observedB=b.receipt.extensions.vm003;
  assert.equal(observedA.observed_result,42);
  assert.equal(observedB.observed_result,42);
  console.log(JSON.stringify({
    schema:'relatte.vm003-two-runner-verified/v0',
    verified:true,
    candidate_crossing_id:candidate.wasm_crossing.crossing_id,
    wasm_sha256:candidate.package.wasm_sha256,
    a_receipt_id:a.receipt.receipt_id,
    b_receipt_id:b.receipt.receipt_id,
    independent_owner_worlds:true,
    independently_signed_observations:true,
    results_equal:true,
    physically_distinct_hardware_proven:false,
    remote_attestation:false,
    trust_note:'GitHub workflow artifact provenance is CI-controlled; witness public keys are not certified identities',
  }));
}
const [mode,...params]=process.argv.slice(2);
if (mode==='prepare' && params.length===1) await prepare(params[0]);
else if(mode==='host' && params.length===3) await host(...params);
else if(mode==='verify' && params.length===3) await verify(...params);
else throw new Error('USAGE: prepare out | host source.json out runner-a|runner-b | verify source.json a.json b.json');
