import { createHash } from 'node:crypto';
import { loadRegistry, readJSON } from './registry.mjs';
import { synthesize } from './planner.mjs';
import { createEnvironment, discoverExternal } from './bindings.mjs';
import { execute } from './executor.mjs';
import { verifyExecution } from './verifier.mjs';
import { occurrence } from './receipts.mjs';
export const id = name => 'interface:' + createHash('sha256').update(name).digest('hex').slice(0,8);
export function request(registry, { from=id('payload-bytes'), representation='payload.bytes', bytes, goal='relatte.observation', goalInterface=null, ...constraints }) {
  return { from, state:{representation,facts:['ordered'],byte_length:bytes.length},goal:{interface_id:goalInterface,emits:goal},constraints:{network:true,preserve_ancestry:true,mutation_authority:false,loss_budget:0,ordering:'ordered',reversible:false,witnesses:[],permissions:[],local_state:true,max_depth:32,max_candidates:128,...constraints} };
}
export function permissions(registry) { return registry.relations.filter(r=>r.requires.authority).map(r=>r.destination+'/'+r.requires.authority); }
export async function runPlan(registry, plan, bytes, options={}) {
  const source={bytes:Buffer.from(bytes),native_ref:occurrence('source'),value:Buffer.from(bytes)};
  const environment=createEnvironment(registry,{...options,grants:options.grants??plan.request.constraints.permissions,witnesses:plan.request.constraints.witnesses,network:plan.request.constraints.network});
  const result=await execute(registry,plan,source,environment);verifyExecution(plan,result.record);
  if(result.record.result!=='succeeded')throw new Error(JSON.stringify(result.record.failures));
  return result;
}
export async function prove(options={}) {
  const registry=await loadRegistry(),bytes=Buffer.from('Existing doors; particulars keep their journeys. '.repeat(3));
  const allPermissions=permissions(registry),records=[],plans=[],crossings=[];
  const base=request(registry,{bytes,permissions:allPermissions});
  const search=await synthesize(registry,base);
  // The named proofs select from independently synthesized proposals.
  for(const n of ['udp-send','midi-event-out']) {
    const plan=search.candidates.find(p=>p.interface_sequence.includes(id(n)));
    if(!plan)throw new Error('MISSING_SYNTHESIZED_PROOF:'+n);
    const result=await runPlan(registry,plan,bytes,options);
    plans.push(plan);records.push(result.record);crossings.push({execution_id:result.record.execution_id,crossing:result.artifact.crossing,receipt:result.artifact.receipt});
  }
  const reqBytes=Buffer.from(JSON.stringify(await readJSON('fixtures/field-lab-request.json')));
  const founding=request(registry,{from:id('json-request'),representation:'request.json',bytes:reqBytes,goal:'relatte.observation',network:false,permissions:allPermissions});
  const discovered=await discoverExternal(options);
  const candidate=(await synthesize(registry,founding)).candidates[0];
  if(!candidate)throw new Error('MISSING_PROCESS_PROOF');
  const field=await runPlan(registry,candidate,reqBytes,options);
  plans.push(candidate);records.push(field.record);crossings.push({execution_id:field.record.execution_id,crossing:field.artifact.crossing,receipt:field.artifact.receipt});
  const lossy=request(registry,{bytes,permissions:allPermissions,network:false,loss_budget:1});
  const descendantPlan=(await synthesize(registry,lossy)).candidates.find(p=>p.interface_sequence.includes(id('reduced-rendering')));
  const descendant=await runPlan(registry,descendantPlan,bytes,options);
  plans.push(descendantPlan);records.push(descendant.record);crossings.push({execution_id:descendant.record.execution_id,crossing:descendant.artifact.crossing,receipt:descendant.artifact.receipt});
  // Hostile final question: only a source, consequence, all interfaces, and constraints.
  // Selection takes the first discovered route not previously exercised; no system hint.
  const unexplored=(await synthesize(registry,base)).candidates.find(p=>!plans.some(q=>q.route_id===p.route_id));
  if(!unexplored)throw new Error('NO_UNPROMPTED_ROUTE');
  plans.push(unexplored);const extra=await runPlan(registry,unexplored,bytes,options);records.push(extra.record);crossings.push({execution_id:extra.record.execution_id,crossing:extra.artifact.crossing,receipt:extra.artifact.receipt});
  let vanilla=null;
  if(options.minecraft) {
    const payload=Buffer.from('DOORS!');
    const req=request(registry,{bytes:payload,permissions:allPermissions,mutation_authority:true,witnesses:['server-verifier']});
    const plan=(await synthesize(registry,req)).candidates.find(p=>p.interface_sequence.includes(id('minecraft-client-actuate')));
    if(!plan)throw new Error('MISSING_VANILLA_PROOF');
    vanilla=await runPlan(registry,plan,payload,options);plans.push(plan);records.push(vanilla.record);crossings.push({execution_id:vanilla.record.execution_id,crossing:vanilla.artifact.crossing,receipt:vanilla.artifact.receipt});
  }
  return {schema:'relatte.interface-superspace-proof.experimental/v0',registry_digest:registry.registry_digest,discovery_evidence:discovered,discovery_authority:[],plans,records,crossings,hostile_question:'What lawful doors are actually open?',unprompted_route:extra.record.route_id,vanilla_observed:!!vanilla,normative_core_mutations:0};
}
