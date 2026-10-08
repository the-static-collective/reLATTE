import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { loadRegistry,validate } from './src/registry.mjs';
import { verifyPlan } from './src/planner.mjs';
import { verifyExecution } from './src/verifier.mjs';
import { verifyCrossingEnvelope,verifyReceipt } from '../../src/protocol.ts';
import { id } from './src/proofs.mjs';
const proof=JSON.parse(await readFile(process.argv[2],'utf8')),registry=await loadRegistry();
assert.equal(proof.registry_digest,registry.registry_digest);
assert.equal(execFileSync('git',['diff','f5cb7488bebc1a6e27fd458ad40af9b9b6f9e858','--','src','spec','schemas'],{encoding:'utf8'}),'');
assert.equal(new Set(proof.records.map(r=>r.execution_id)).size,proof.records.length);
for(const plan of proof.plans)await verifyPlan(registry,plan);
for(const record of proof.records){
  await validate('route-execution',record);
  verifyExecution(proof.plans.find(p=>p.route_id===record.route_id),record);
  assert.equal(record.result,'succeeded');
  const pair=proof.crossings.find(c=>c.execution_id===record.execution_id);
  assert.ok(pair);assert.ok(await verifyCrossingEnvelope(pair.crossing));assert.ok(await verifyReceipt(pair.receipt));
  assert.equal(pair.receipt.crossing_id,pair.crossing.crossing_id);
  assert.ok(record.crossing_refs.includes(pair.crossing.crossing_id));assert.equal(pair.receipt.kind,'R3_HOLD');
  const ext=pair.crossing.extensions.interface_superspace_001;
  assert.equal(ext.execution_id,record.execution_id);assert.equal(ext.plan_digest,record.plan_digest);
  assert.equal(pair.crossing.payload_refs[0].address,record.particulars.at(-1).content_digest);
}
for(const required of ['udp-send','midi-event-out','ghot-field-lab','reduced-rendering'])assert.ok(proof.records.some(r=>r.actual_interfaces_traversed.includes(id(required))));
if(process.argv.includes('--require-minecraft')){
  assert.equal(proof.vanilla_observed,true);
  const r=proof.records.find(r=>r.actual_interfaces_traversed.includes(id('minecraft-server-verify')));
  const native=r.actual_relation_receipts.find(r=>r.destination_interface===id('minecraft-server-verify')).evidence.native;
  assert.ok(native.serverVerification.length>0);assert.equal(native.serverVerification.length,native.placed.length);
  assert.equal(native.meta.id,'26.1.1');assert.equal(native.meta.server_sha1,'49c8195703ad0ba4f0a4efbccfd85a4a8ca57431');
}
assert.ok(proof.records.some(r=>r.route_id===proof.unprompted_route));
console.log(JSON.stringify({verified_executions:proof.records.length,vanilla_observed:proof.vanilla_observed,normative_core_mutations:0}));
