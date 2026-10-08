import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { loadRegistry, buildRegistry, readJSON, validate } from '../src/registry.mjs';
import { synthesize, verifyPlan } from '../src/planner.mjs';
import { execute } from '../src/executor.mjs';
import { createEnvironment, discoverExternal } from '../src/bindings.mjs';
import { verifyExecution, verifyCrossing } from '../src/verifier.mjs';
import { id, permissions, request, runPlan, prove } from '../src/proofs.mjs';
import { digest, seal, occurrence } from '../src/receipts.mjs';
const registry=await loadRegistry();
const bytes=Buffer.from('same payload, different occurrence, different journey '.repeat(3));
const donors={donorRoot:process.env.TRANCHNOSE_ROOT??'../tranchNOSE',discoveryRoot:process.env.GHOT_ROOT??'../GHoT'};
const input=()=>({interfaces:structuredClone(registry.interfaces),relations:structuredClone(registry.relations),contracts:structuredClone(registry.contracts),surfaces:structuredClone(registry.surfaces)});
const req=overrides=>request(registry,{bytes,permissions:permissions(registry),...overrides});
const candidates=(await synthesize(registry,req())).candidates;
const planThrough=n=>candidates.find(p=>p.interface_sequence.includes(id(n)));

test('frozen normative core and stable schemas match the selected donor SHA',()=>{
  assert.equal(execFileSync('git',['rev-parse','HEAD:src'],{encoding:'utf8'}).trim(),'c0e4d2c59481e0fb2a4bf4bb294f373907fd2b76');
  assert.equal(execFileSync('git',['diff','f5cb7488bebc1a6e27fd458ad40af9b9b6f9e858','--','src','schemas','spec'],{encoding:'utf8'}),'');
});
test('registry: materially different boundaries preserve dimensions and modeled decomposition',()=>{
  assert.equal(registry.interfaces.length,30);
  assert.equal(registry.nodes.get(id('udp-receive')).information.ordering,'unordered');
  assert.ok(registry.nodes.get(id('midi-event-out')).information.native_dimensions.includes('tempo'));
  const names=['controller','body','topology','field','observable','latent','history','coordination'];
  assert.equal(new Set(names.map(n=>registry.nodes.get(id('tranchnose-'+n)).emits[0])).size,8);
  assert.equal(registry.nodes.get(id('tranchnose-latent')).state.retention,'latent');
  assert.notEqual(registry.nodes.get(id('tranchnose-body')).plane,registry.nodes.get(id('tranchnose-topology')).plane);
});
test('JSON schema rejects omitted distinctions and undeclared policy keys',async()=>{
  const n=structuredClone(registry.interfaces[0]);delete n.state;
  await assert.rejects(validate('interface-particular',n),/SCHEMA/);
  const q=req();q.constraints.admit=true;await assert.rejects(synthesize(registry,q),/SCHEMA/);
});
test('synthesis derives several multi-interface proposals; capability is not permission',async()=>{
  assert.ok(candidates.length>=4);
  assert.ok(planThrough('udp-send').relation_sequence.length>=6);
  assert.ok(planThrough('midi-event-out').relation_sequence.length>=5);
  const minecraft=await synthesize(registry,req({mutation_authority:true,witnesses:['server-verifier'],permissions:[]}));
  assert.ok(!minecraft.candidates.some(p=>p.interface_sequence.includes(id('minecraft-client-actuate'))));
  assert.ok(minecraft.rejections.some(b=>b.reasons.some(r=>r.code==='authority_absent')));
});
test('UDP: actual datagrams arrive reordered and duplicated; reassembly is explicit',async()=>{
  const {record,artifact}=await runPlan(registry,planThrough('udp-send'),bytes);
  const native=record.actual_relation_receipts[2].evidence.native;
  assert.ok(native.arrival_order[0]>native.arrival_order[1]);assert.equal(native.arrival_order[1],native.arrival_order[2]);
  assert.ok(record.actual_relation_receipts[3].evidence.native.duplicate_count>=1);
  assert.ok(artifact.bytes.equals(bytes));assert.equal(artifact.receipt.kind,'R3_HOLD');
});
test('MIDI: native event timing changes identity without changing payload',async()=>{
  const p=planThrough('midi-event-out');
  const a=await runPlan(registry,p,bytes),b=await runPlan(registry,p,bytes,{midiOptions:{tempo_us_per_quarter:650000,high_delta:8}});
  assert.ok(a.artifact.bytes.equals(b.artifact.bytes));
  const x=a.record.actual_relation_receipts[2].evidence.native,y=b.record.actual_relation_receipts[2].evidence.native;
  assert.notEqual(x.file_sha256,y.file_sha256);assert.notEqual(x.last_tick,y.last_tick);assert.equal(x.channels.length,2);
  assert.notEqual(a.record.execution_id,b.record.execution_id);assert.notEqual(a.artifact.receipt.receipt_id,b.artifact.receipt.receipt_id);
});
test('multiple routes keep different route, native, crossing and receipt identities',async()=>{
  const selected=['udp-send','midi-event-out','filesystem-output'].map(planThrough),out=[];
  const sourceParticular={particular_id:occurrence('particular'),native_ref:occurrence('source')};
  for(const p of selected)out.push(await runPlan(registry,p,bytes,{sourceParticular}));
  assert.equal(new Set(out.map(x=>x.record.source.particular_id)).size,1);
  assert.equal(new Set(out.map(x=>x.record.source.native_ref)).size,1);
  assert.equal(new Set(out.map(x=>x.record.route_id)).size,3);
  assert.equal(new Set(out.map(x=>x.artifact.receipt.receipt_id)).size,3);
  assert.equal(new Set(out.map(x=>x.artifact.crossing.crossing_id)).size,3);
  for(let i=0;i<out.length;i++){assert.ok(out[i].artifact.bytes.equals(bytes));assert.ok(verifyExecution(selected[i],out[i].record));}
});
test('irreversible descendant: new particular, explicit parent, inspectable projection, no inherited authority',async()=>{
  const q=req({network:false,loss_budget:1}),search=await synthesize(registry,q);
  const p=search.candidates.find(p=>p.interface_sequence.includes(id('reduced-rendering')));
  const {record,artifact}=await runPlan(registry,p,bytes);
  const b=record.particulars[0];assert.notEqual(b.particular_id,record.source.particular_id);assert.equal(b.parent,record.source.particular_id);
  assert.equal(b.transformation.reversible,false);assert.equal(b.transformation.preserves.bytes,false);assert.deepEqual(b.authority,[]);
  assert.equal(artifact.bytes.length,8);assert.ok(!artifact.bytes.equals(bytes));
  assert.match(record.actual_relation_receipts[0].evidence.native.transformation,/discard suffix/);
  const samePrefix=Buffer.concat([bytes.subarray(0,8),Buffer.from('a different suffix')]);
  assert.ok(bytes.subarray(0,8).equals(samePrefix.subarray(0,8)));assert.ok(!bytes.equals(samePrefix));
  assert.ok(!(await synthesize(registry,req({network:false,loss_budget:0}))).candidates.some(p=>p.interface_sequence.includes(id('reduced-rendering'))));
});
test('opaque interfaces, participants and relations derive the same graph and execute',async()=>{
  const data=input();const im=new Map(data.interfaces.map((i,n)=>[i.interface_id,'interface:opaque-'+n]));
  const rm=new Map(data.relations.map((r,n)=>[r.relation_id,'relation:opaque-'+n]));
  for(const i of data.interfaces){i.interface_id=im.get(i.interface_id);i.participant_ref='participant:opaque-'+i.interface_id;}
  for(const r of data.relations){r.source=im.get(r.source);r.destination=im.get(r.destination);r.relation_id=rm.get(r.relation_id);}
  const opaque=await buildRegistry(data),q=req();q.from=im.get(q.from);q.constraints.permissions=q.constraints.permissions.map(p=>{const [n,op]=p.split('/');return im.get(n)+'/'+op;});
  const search=await synthesize(opaque,q),reverse=new Map([...im].map(([a,b])=>[b,a]));
  const normal=candidates.map(p=>p.interface_sequence.join(',')).sort();
  assert.deepEqual(search.candidates.map(p=>p.interface_sequence.map(n=>reverse.get(n)).join(',')).sort(),normal);
  const result=await runPlan(opaque,search.candidates[0],bytes);
  assert.equal(result.record.result,'succeeded');
});
test('planner modules contain no adapter or system switches or execution imports',async()=>{
  for(const file of ['planner','graph','executor']){
    const source=await readFile(new URL('../src/'+file+'.mjs',import.meta.url),'utf8');
    assert.doesNotMatch(source,/field.lab|minecraft|midi|udp|adapter\s*===|system\s*===/i);
    assert.doesNotMatch(source,/from ['"].*bindings|from ['"].*alien-/);
  }
});
test('NO ROUTE explains capacity, witness, authority, network, loss and live-state blocks',async()=>{
  const search=await synthesize(registry,req({goal:'world.observed',network:false,mutation_authority:false,local_state:false,permissions:[]}));
  assert.equal(search.status,'NO_ROUTE');const codes=search.rejections.flatMap(b=>b.reasons.map(r=>r.code));
  for(const code of ['network_forbidden','mutation_forbidden','authority_absent','local_state_unavailable','required_witness_absent','loss_budget_exceeded'])assert.ok(codes.includes(code),code);
  const large=await synthesize(registry,req({bytes:Buffer.alloc(1048577),goal:'relatte.observation'}));
  assert.equal(large.status,'NO_ROUTE');assert.ok(large.rejections.some(b=>b.reasons.some(r=>r.code==='capacity_insufficient')));
});
test('ordering cannot widen without an explicit attested reassembly relation',async()=>{
  const data=input();data.relations=data.relations.filter(r=>r.destination!==id('udp-reassembly'));
  const reduced=await buildRegistry(data),q=req({goal:'received.datagrams',goalInterface:id('udp-receive'),ordering:'ordered'});
  const search=await synthesize(reduced,q);assert.equal(search.status,'NO_ROUTE');
  assert.ok(search.rejections.some(b=>b.reasons.some(r=>r.code==='ordering_requirement_unsatisfied')));
});
const attacks=[
 ['fake compatibility',d=>{d.relations[0].consumes='invented.protocol';},/PROTOCOL_INCOMPATIBLE/],
 ['authority escalation',d=>{d.interfaces[0].authority.authorize=true;},/UNATTESTED_SURFACE|AUTHORITY_ESCALATION/],
 ['observe to mutate escalation',d=>{d.relations[0].operation='mutate';},/OPERATION_UNSUPPORTED|OBSERVE_MUTATE/],
 ['receiver admission bypass',d=>{d.relations.find(r=>r.kind==='cross').postconditions.push('admitted');},/UNATTESTED_RELATION/],
 ['unsupported information widening',d=>{d.relations[0].postconditions.push('complete-operative-state');},/UNATTESTED_RELATION/],
 ['lossless claim over lossy edge',d=>{d.relations.find(r=>r.loss_cost===1).preserves.bytes=true;},/LOSSLESS_OVER_LOSSY/],
 ['reversible claim over irreversible edge',d=>{d.relations.find(r=>r.loss_cost===1).reversible=true;},/REVERSIBLE_OVER_IRREVERSIBLE/],
 ['stateful interface mislabeled stateless',d=>{d.interfaces.find(i=>i.interface_id===id('minecraft-world-mutation')).state.retention='none';},/UNATTESTED_SURFACE/],
 ['replayable interface mislabeled non-replayable',d=>{d.interfaces.find(i=>i.interface_id===id('midi-event-out')).state.replayable=false;},/UNATTESTED_SURFACE/],
 ['witness confused with source',d=>{d.interfaces.find(i=>i.interface_id===id('minecraft-server-verify')).plane='environment';},/UNATTESTED_SURFACE/],
 ['history confused with operative state',d=>{d.interfaces.find(i=>i.interface_id===id('tranchnose-history')).emits=['latent.operative'];},/UNATTESTED_SURFACE/],
 ['coordination confused with field channel',d=>{d.interfaces.find(i=>i.interface_id===id('tranchnose-coordination')).plane='field';},/UNATTESTED_SURFACE/],
];
for(const [name,mutate,pattern] of attacks)test('hostile: '+name,async()=>{const data=input();mutate(data);await assert.rejects(buildRegistry(data),pattern);});
test('cycles cannot manufacture progress or infinite routes',async()=>{
  const data=input(),r=structuredClone(data.relations.find(r=>r.source===id('payload-bytes')&&r.destination===id('midi-event-out')));
  r.relation_id='relation:cycle';r.source=id('midi-reconstruction');r.consumes='reconstructed.bytes';r.binding_ref='binding:cycle';r.verification_ref='verification:cycle';r.postconditions.push('fake-progress');
  data.relations.push(r);data.contracts[r.binding_ref]=structuredClone(r);
  const graph=await buildRegistry(data),search=await synthesize(graph,req());
  assert.ok(search.expansions<100);assert.ok(search.rejections.some(b=>b.reasons.some(r=>r.code==='cycle_no_progress')));
  for(const p of search.candidates)assert.equal(p.interface_sequence.length,new Set(p.interface_sequence).size);
});
test('caller cannot invent operative information or execute a proposal without grants',async()=>{
  const q=req();q.state.facts.push('latent.operative');await assert.rejects(synthesize(registry,q),/UNSUPPORTED_SOURCE_INFORMATION/);
  const p=planThrough('udp-send'),env=createEnvironment(registry,{grants:[],network:true});
  const result=await execute(registry,p,{bytes,native_ref:occurrence('source')},env);
  assert.equal(result.record.result,'failed');assert.equal(result.record.actual_relation_receipts.length,1);
  assert.match(result.record.failures[0].reason,/authority_absent/);verifyExecution(p,result.record);
});
test('planned occurrence tampering, collapsed particulars and forged native receipts fail verification',async()=>{
  const p=planThrough('midi-event-out'),out=await runPlan(registry,p,bytes);
  const q=structuredClone(p);q.interface_sequence.reverse();await assert.rejects(verifyPlan(registry,q),/DIGEST_MISMATCH/);
  const r=structuredClone(out.record);r.particulars[0].particular_id=r.source.particular_id;const sealed=seal({...r,execution_digest:undefined},'execution_digest');
  assert.throws(()=>verifyExecution(p,sealed),/PARTICULAR_ANCESTRY/);
  const falseReceipt=structuredClone(out.artifact);falseReceipt.receipt.kind='R3_ADMIT';assert.equal(await verifyCrossing(falseReceipt),false);
});
test('real founding manifest: discovery is evidence; synthesized bounded process produces addressed receipt',async()=>{
  const discovery=await discoverExternal(donors);assert.ok(discovery.length);
  assert.equal(discovery[0].capability_limits['analysis.tranchnose.field-lab'].network,false);
  const b=Buffer.from(JSON.stringify(await readJSON('fixtures/field-lab-request.json'))),q=request(registry,{from:id('json-request'),representation:'request.json',bytes:b,goal:'content.addressed.bytes',permissions:permissions(registry),network:false});
  const p=(await synthesize(registry,q)).candidates[0];assert.ok(p);
  const result=await runPlan(registry,p,b,donors);assert.equal(result.artifact.value.schema,'tranchNOSE.field-lab.receipt/v0');
  assert.equal(result.record.actual_relation_receipts[1].evidence.native.exit_status,0);
  assert.deepEqual(result.record.particulars.at(-1).authority,[]);
});
test('final hostile question discovers and executes an unnamed route from the full registry',async()=>{
  const proof=await prove(donors);assert.equal(proof.records.length,6);
  assert.equal(proof.records.at(-1).route_id,proof.unprompted_route);
  assert.ok(!proof.records.slice(0,-1).some(r=>r.route_id===proof.unprompted_route));
  for(const r of proof.records)assert.equal(r.result,'succeeded');
});
test('late registry mutation cannot retain an old plan digest',async()=>{
  const graph=await loadRegistry(),p=(await synthesize(graph,req())).candidates[0];
  graph.edges.get(p.relation_sequence[0]).requires.authority=null;
  await assert.rejects(verifyPlan(graph,p),/REGISTRY_CHANGED/);
});
test('a missing live participant blocks a declared door, with attributable evidence',async()=>{
  const data=input(),node=data.interfaces.find(i=>i.interface_id===id('process-stdin'));
  node.live=false;data.surfaces.find(i=>i.interface_id===node.interface_id).live=false;
  const graph=await buildRegistry(data),b=Buffer.from('{}'),q=request(graph,{from:id('json-request'),representation:'request.json',bytes:b,goal:'content.addressed.bytes'});
  const result=await synthesize(graph,q);assert.equal(result.status,'NO_ROUTE');
  assert.ok(result.rejections.some(b=>b.interface_id===node.interface_id&&b.reasons.some(r=>r.code==='live_participant_unavailable')));
});
test('execution refuses runtime byte substitution despite a declared lossless relation',async()=>{
  const p=planThrough('midi-event-out'),env=createEnvironment(registry,{network:true,grants:p.request.constraints.permissions});
  const r=registry.edges.get(p.relation_sequence[0]),binding=env.bindings.get(r.binding_ref),original=binding.run;
  binding.run=async(...args)=>{const a=await original(...args);a.bytes=Buffer.from(a.bytes);a.bytes[0]^=255;return a;};
  const result=await execute(registry,p,{bytes,native_ref:occurrence('source')},env);
  assert.equal(result.record.result,'failed');assert.match(result.record.failures[0].reason,/PAYLOAD_BYTES_NOT_PRESERVED/);
});
test('destination admission remains an independent receiver decision',async()=>{
  const p=planThrough('midi-event-out');
  const refused=await runPlan(registry,p,bytes,{receiverPolicy:()=> 'R3_REFUSE'});
  assert.equal(refused.record.result,'succeeded');assert.equal(refused.artifact.receipt.kind,'R3_REFUSE');
  assert.deepEqual(refused.record.particulars.at(-1).authority,[]);
});
test('signed crossing snapshots survive later execution receipts and JSON persistence',async()=>{
  const p=planThrough('midi-event-out'),result=await runPlan(registry,p,bytes);
  assert.ok(await verifyCrossing(result.artifact));
  const persisted=JSON.parse(JSON.stringify({crossing:result.artifact.crossing,receipt:result.artifact.receipt}));
  assert.ok(await verifyCrossing({...persisted,bytes}));
  assert.equal(persisted.crossing.extensions.interface_superspace_001.ancestry.length,p.relation_sequence.length-1);
});
test('type-compatible crosswiring cannot relabel file evidence as a server witness',async()=>{
  const data=input(),r=data.relations.find(r=>r.source===id('filesystem-output'));
  // Both destinations accept adapter.observation; actual particulars still differ.
  r.destination=id('minecraft-server-verify');
  await assert.rejects(buildRegistry(data),/ENDPOINT_BINDING_MISMATCH/);
});
