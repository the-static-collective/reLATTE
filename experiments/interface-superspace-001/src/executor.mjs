import { verifyPlan } from './planner.mjs';
import { blocked, transition } from './graph.mjs';
import { occurrence, digest, byteDigest, seal } from './receipts.mjs';
import { validate } from './registry.mjs';
export async function execute(registry, plan, source, environment) {
  await verifyPlan(registry, plan);
  const execution_id = occurrence('execution');
  const record = { schema: 'relatte.route-execution.experimental/v0', execution_id, route_id: plan.route_id, plan_digest: plan.plan_digest, actual_interfaces_traversed: [plan.source_interface], actual_relation_receipts: [], native_particular_refs: [], crossing_refs: [], result: 'failed', residuals: [], failures: [], source: {}, particulars: [] };
  const first = { particular_id: occurrence('particular'), interface_id: plan.source_interface, parent: null, content_digest: byteDigest(source.bytes), native_ref: source.native_ref, authority: [], transformation: null };
  record.source = first; record.native_particular_refs.push(source.native_ref);
  let current = source, particular = first;
  let state = { representation: plan.request.state.representation, facts: plan.request.state.facts, loss: 0 };
  try {
    if (source.bytes.length !== plan.request.state.byte_length) throw new Error('SOURCE_LENGTH_CHANGED');
    for (let index = 0; index < plan.relation_sequence.length; index++) {
      const r = registry.edges.get(plan.relation_sequence[index]);
      if (r.source !== plan.interface_sequence[index] || r.destination !== plan.interface_sequence[index+1]) throw new Error('ROUTE_SEQUENCE_MISMATCH');
      const request = structuredClone(plan.request);
      // Caller-supplied grants are independent of descriptors and proposal permissions.
      request.constraints.permissions = environment.grants ?? [];
      request.constraints.witnesses = environment.witnesses ?? [];
      request.constraints.network = environment.network === true && request.constraints.network;
      request.constraints.local_state = environment.local_state === true && request.constraints.local_state;
      const reasons = blocked(registry, state, r, request);
      if (reasons.length) throw new Error('EXECUTION_BLOCKED:' + JSON.stringify(reasons));
      const binding = environment.bindings.get(r.binding_ref);
      if (!binding || binding.contract_digest !== digest(registry.contracts[r.binding_ref])) throw new Error('UNAVAILABLE_OR_UNATTESTED_BINDING');
      const next = await binding.run(current, { ...environment, relation: r, execution_id, parent: particular, plan, history: record });
      if (next.representation !== r.produces) throw new Error('EXECUTION_PROTOCOL_MISMATCH');
      if (!next.bytes || !next.native_ref || !next.evidence) throw new Error('MISSING_NATIVE_EVIDENCE');
      if (next.authority?.length) throw new Error('INHERITED_AUTHORITY');
      for (const fact of r.postconditions) if (!next.evidence.facts?.includes(fact)) throw new Error('POSTCONDITION_UNOBSERVED:' + fact);
      if (!await binding.verify(current, next)) throw new Error('BINDING_VERIFICATION_FAILED');
      if (r.preserves.bytes && !Buffer.from(next.bytes).equals(Buffer.from(current.bytes))) throw new Error('PAYLOAD_BYTES_NOT_PRESERVED');
      const descendant = { particular_id: occurrence('particular'), interface_id: r.destination, parent: particular.particular_id, content_digest: byteDigest(next.bytes), native_ref: next.native_ref, authority: [], transformation: { relation_id: r.relation_id, reversible: r.reversible, preserves: r.preserves, may_lose: r.may_lose } };
      const receipt = seal({ receipt_id: occurrence('relation-receipt'), execution_id, relation_id: r.relation_id, source_interface: r.source, destination_interface: r.destination, source_particular: particular.particular_id, descendant_particular: descendant.particular_id, input_digest: byteDigest(current.bytes), output_digest: byteDigest(next.bytes), native_ref: next.native_ref, evidence: next.evidence, verification_ref: r.verification_ref }, 'receipt_digest');
      record.actual_relation_receipts.push(receipt); record.particulars.push(descendant);
      record.actual_interfaces_traversed.push(r.destination); record.native_particular_refs.push(next.native_ref);
      if (next.crossing) record.crossing_refs.push(next.crossing.crossing_id);
      if (next.residuals) record.residuals.push(...next.residuals);
      current = next; particular = descendant;
      state = { representation: r.produces, facts: transition(state.facts, r), loss: state.loss + r.loss_cost };
    }
    record.result = 'succeeded';
  } catch (error) {
    record.failures.push({ at_interface: record.actual_interfaces_traversed.at(-1), after_relations: record.actual_relation_receipts.length, reason: String(error.message ?? error) });
  } finally {
    for (const dispose of environment.cleanup ?? []) {
      try { await dispose(); } catch (error) { record.residuals.push({ cleanup_failure: String(error) }); }
    }
  }
  const result = seal(record, 'execution_digest'); await validate('route-execution', result);
  return { record: result, artifact: current };
}
