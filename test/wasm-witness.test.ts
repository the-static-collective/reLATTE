import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import {
  RelatteVm, LocalReceiver,
  createVmManifest, createWasmVmPackage,
  generateP256KeyPair, proposeWasmVm, sealReceipt,
  runWitnessedWasmVm, verifyWasmExecutionWitness,
  verifyIndependentWasmWitnessPair, wasmInputDigest, wasmOutputDigest,
} from '../src/index.ts';

const wasm = Buffer.from('AGFzbQEAAAABBwFgAn9/AX8DAgEABwgBBHN0ZXAAAAoJAQcAIAAgAWoL','base64');
const date = '2026-10-09T16:01:00.000Z';
const identity = (id: string) => ({
  world_id: 'world:vm3-' + id, particular: 'particular:vm3-' + id,
  runtime_id: 'runtime:vm3-' + id,
});
async function source() {
  const manifest = createVmManifest(8, 2);
  const vm = new RelatteVm(manifest,identity('source'));
  const child = vm.spawnGuest(identity('guest'));
  child.increment();
  const keys = await generateP256KeyPair();
  const parent_crossing = await child.proposeSelf(keys,date);
  const pkg = createWasmVmPackage(manifest,wasm);
  const wasm_crossing = await proposeWasmVm({
    manifest,parent_crossing,wasm_bytes:wasm,package:pkg,signing_keys:keys,
    created_at:'2026-10-09T16:02:00.000Z',
  });
  return {manifest,parent_crossing,wasm_crossing,package:pkg,wasm_bytes:wasm};
}
async function host(base: string, name: string, candidate: Awaited<ReturnType<typeof source>>) {
  const receiver = await LocalReceiver.create(join(base,name),{
    world_id:'world:host-'+name,
    receiver_particular:'particular:host-'+name,
    contract_ref:'contract:host-'+name+'/v0',
  });
  const receive_receipt = await receiver.receive(candidate.wasm_crossing,date);
  const admit_receipt = await receiver.dispose(candidate.wasm_crossing.crossing_id,'ADMIT',
    '2026-10-09T16:03:00.000Z',{admit_effect:'relatte-wasm-vm-launch'});
  const evidence = {
    owner: {
      world_id:receiver.config.world_id,
      receiver_particular:receiver.config.receiver_particular,
      contract_ref:receiver.config.contract_ref,
      public_key:structuredClone(receive_receipt.signing.public_key),
    },
    receive_receipt,admit_receipt,
  };
  const keys = await generateP256KeyPair();
  const witness = await runWitnessedWasmVm({
    candidate,evidence,host_root:receiver.root,
    successor:identity('successor-'+name),left:19,right:23,
    witness_keys:keys,runner_label:name,observed_at:'2026-10-09T16:04:00.000Z',
  });
  return {receiver,evidence,witness,pinned_witness_key:keys.publicKeyJwk,keys};
}
function verifyInput(candidate: Awaited<ReturnType<typeof source>>, h: Awaited<ReturnType<typeof host>>) {
  return {candidate,evidence:h.evidence,receipt:h.witness.receipt,pinned_witness_key:h.pinned_witness_key};
}

test('VM003 two owner-local runs produce separately signed, cold-verifiable execution witnesses',async()=>{
  const base=await mkdtemp(join(tmpdir(),'vm003-pair-'));
  try {
    const candidate=await source();
    const a=await host(base,'host-a',candidate);
    const b=await host(base,'host-b',candidate);
    assert.equal(a.witness.run.result,42);
    assert.equal(b.witness.run.result,42);
    assert.notEqual(a.witness.run.pid,process.pid);
    assert.notEqual(b.witness.run.pid,process.pid);
    assert.equal(a.witness.receipt.kind,'R15_VM_EXECUTION_WITNESS');
    assert.equal(a.witness.receipt.semantic_effect,'none');
    assert.equal(a.witness.receipt.extensions.vm003.output_digest,wasmOutputDigest(42));
    assert.equal(a.witness.receipt.extensions.vm003.input_digest,wasmInputDigest(19,23));
    assert.equal(await verifyWasmExecutionWitness(verifyInput(candidate,a)),true);
    assert.equal(await verifyWasmExecutionWitness(verifyInput(candidate,b)),true);
    assert.equal(await verifyIndependentWasmWitnessPair(candidate,verifyInput(candidate,a),verifyInput(candidate,b)),true);

    const archive=join(base,'public-witness.json');
    await writeFile(archive,JSON.stringify({
      candidate:{
        ...candidate,wasm_b64:candidate.wasm_bytes.toString('base64'),
      },
      a:{evidence:a.evidence,receipt:a.witness.receipt,pinned_witness_key:a.pinned_witness_key},
      b:{evidence:b.evidence,receipt:b.witness.receipt,pinned_witness_key:b.pinned_witness_key},
    }));
    await rm(a.receiver.root,{force:true,recursive:true});
    await rm(b.receiver.root,{force:true,recursive:true});
    const cold=JSON.parse(await readFile(archive,'utf8'));
    cold.candidate.wasm_bytes=Buffer.from(cold.candidate.wasm_b64,'base64');
    delete cold.candidate.wasm_b64;
    assert.equal(await verifyIndependentWasmWitnessPair(cold.candidate,cold.a,cold.b),true);
  } finally {await rm(base,{force:true,recursive:true});}
});

test('VM003 hostile mutations, replay swaps, forged signatures and unpinned keys are denied',async()=>{
  const base=await mkdtemp(join(tmpdir(),'vm003-hostile-'));
  try {
    const candidate=await source();
    const a=await host(base,'host-a',candidate);
    const b=await host(base,'host-b',candidate);
    const valid=verifyInput(candidate,a);
    const mutation=(change:(r:any)=>void)=>{const receipt=structuredClone(a.witness.receipt);change(receipt);return {...valid,receipt};};
    assert.equal(await verifyWasmExecutionWitness(mutation(r=>{r.extensions.vm003.observed_result=999;})),false);
    assert.equal(await verifyWasmExecutionWitness(mutation(r=>{r.extensions.vm003.resource.observed_wall_ms=-1;})),false);
    assert.equal(await verifyWasmExecutionWitness(mutation(r=>{r.extensions.vm003.authority.inherited_grants.push('admin');})),false);
    assert.equal(await verifyWasmExecutionWitness(mutation(r=>{r.extensions.vm003.admit_receipt_id=b.evidence.admit_receipt.receipt_id;})),false);
    assert.equal(await verifyWasmExecutionWitness({...valid,pinned_witness_key:b.pinned_witness_key}),false);
    assert.equal(await verifyWasmExecutionWitness({...valid,evidence:b.evidence}),false);
    assert.equal(await verifyWasmExecutionWitness({...valid,candidate:{...candidate,wasm_bytes:Buffer.from([0])}}),false);
    const guest=await generateP256KeyPair();
    const forged=await sealReceipt(a.witness.receipt,guest);
    assert.equal(await verifyWasmExecutionWitness({...valid,receipt:forged}),false);
    assert.equal(await verifyIndependentWasmWitnessPair(candidate,valid,valid),false);
    // The 002 executor still insists on the current journal; a signed witness
    // alone cannot authorize another guest execution after the host dies.
    await rm(a.receiver.root,{recursive:true,force:true});
    await assert.rejects(runWitnessedWasmVm({
      candidate,evidence:a.evidence,host_root:a.receiver.root,
      successor:identity('forbidden'),left:19,right:23,
      witness_keys:a.keys,runner_label:'forbidden',observed_at:date,
    }),/WASM_HOST_NOT_LIVE/);
  } finally {await rm(base,{recursive:true,force:true});}
});

test('VM003 input and output digests are domain separated and bounded',()=>{
  assert.notEqual(wasmInputDigest(19,23),wasmOutputDigest(42));
  assert.notEqual(wasmInputDigest(19,23),wasmInputDigest(23,19));
  assert.throws(()=>wasmInputDigest(2**45,1),/INVALID_VM003_INPUT/);
  assert.throws(()=>wasmOutputDigest(NaN),/INVALID_VM003_OUTPUT/);
});
