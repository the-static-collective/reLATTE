// Entailment and selection are evidence. Existing #78/#79 gates own execution.
import { occurrence, digest, seal, verifySeal } from '../interface-superspace-001/src/receipts.mjs';
import { verifyProposal } from '../dynamic-interface-field-001/src/field.mjs';
import { CompositionFieldBridge } from '../composition-instance-002/bridge.mjs';
import { executeDynamic, verifyDynamic } from '../dynamic-interface-field-001/src/runtime.mjs';
import { NATIVE_OPERATION, derive, verifyContext, verifyWitness } from './membrane.mjs';

export async function select(context, policy, witness, view, plan) {
  await verifyWitness(witness, context, policy); await verifyProposal(view, plan);
  if (witness.result !== 'ENTAILED' || witness.condition.kind !== 'affords') throw new Error('ENTAILED_AFFORDANCE_REQUIRED');
  const target = plan.doors.at(-1), referent = witness.referents[0];
  if (plan.relations.at(-1)?.descriptor.operation !== NATIVE_OPERATION[witness.condition.operation])
    throw new Error('OPERATION_ROUTE_MISMATCH');
  if (target.world_id !== referent.world_id || target.offer_id !== referent.offer_id ||
      target.descriptor.interface_id !== referent.interface_id || view.snapshot.view_digest !== context.view_snapshot.view_digest)
    throw new Error('WITNESS_ROUTE_MISMATCH');
  return seal({ schema: 'relatte.psi-selection.experimental/v0', selection_id: occurrence('selection'),
    witness_id: witness.witness_id, context_id: context.context_id, policy_id: policy.policy_id,
    observer_ref: policy.observer_ref, field_plan_digest: plan.field_plan_digest,
    referent, authority: [] }, 'selection_digest');
}

export async function executeSelected({ context, policy, witness, selection, view, plan, source,
  current, options, bridge = null, ...unexpected }) {
  if (Object.keys(unexpected).length || (bridge !== null && !(bridge instanceof CompositionFieldBridge)))
    throw new Error('UNTRUSTED_EXECUTION_ADAPTER');
  await verifyWitness(witness, context, policy); verifySeal(selection, 'selection_digest');
  await verifyProposal(view, plan);
  if (selection.witness_id !== witness.witness_id || selection.context_id !== context.context_id ||
      selection.policy_id !== policy.policy_id || selection.field_plan_digest !== plan.field_plan_digest ||
      selection.observer_ref !== policy.observer_ref || selection.authority.length ||
      witness.result !== 'ENTAILED' || witness.condition.kind !== 'affords' ||
      digest(selection.referent) !== digest(witness.referents[0])) throw new Error('INVALID_SELECTION');
  const target = plan.doors.at(-1);
  if (plan.relations.at(-1)?.descriptor.operation !== NATIVE_OPERATION[witness.condition.operation])
    throw new Error('OPERATION_ROUTE_MISMATCH');
  if (target.offer_id !== selection.referent.offer_id || target.world_id !== selection.referent.world_id ||
      target.descriptor.interface_id !== selection.referent.interface_id ||
      view.snapshot.view_digest !== context.view_snapshot.view_digest) throw new Error('WITNESS_ROUTE_MISMATCH');
  // Trusted observer-local acquisition callback; it receives no owner/grant operation.
  const fresh_context = await current(); await verifyContext(fresh_context, policy);
  if (fresh_context.observed_at < context.observed_at) throw new Error('CONTEXT_FRONTIER_ROLLBACK');
  for (const kind of ['histories', 'journals']) {
    const sequence = item => kind === 'histories' ? item : item.events;
    const identity = item => kind === 'histories' ? item[0].world_id : item.incarnation_id;
    for (const old of context.inputs[kind]) {
      const next = fresh_context.inputs[kind].find(item => identity(item) === identity(old));
      if (!next || sequence(next).length < sequence(old).length ||
          digest(sequence(next).slice(0, sequence(old).length)) !== digest(sequence(old)))
        throw new Error('CONTEXT_FRONTIER_ROLLBACK');
    }
  }
  const fresh_witness = derive(fresh_context, policy, witness.condition);
  let failure = null, execution = null;
  if (fresh_witness.result !== 'ENTAILED') failure = 'CURRENT_CONDITION_NOT_ENTAILED';
  else if (digest(fresh_witness.referents) !== digest(witness.referents)) failure = 'STALE_REFERENT';
  else {
    if (bridge !== null && bridge.world_id !== target.world_id) throw new Error('WRONG_BRIDGE_OWNER');
    const executed = bridge === null ? await executeDynamic(view, plan, source, options) :
      await bridge.execute(view, plan, source, options);
    execution = executed.record;
    verifyDynamic(plan, execution, policy.anchors);
    if (execution.result !== 'succeeded') failure = execution.failures.map(f => f.reason).join(';');
  }
  return { fresh_context, fresh_witness, record: seal({
    schema: 'relatte.psi-occurrence.experimental/v0', occurrence_id: occurrence('psi-occurrence'),
    selection_digest: selection.selection_digest, historical_witness_id: witness.witness_id,
    current_witness_id: fresh_witness.witness_id, result: failure ? 'DENIED' : 'OCCURRED',
    failure, native_effect_count: execution?.execution?.actual_relation_receipts.length ?? 0,
    owner_occurrence: execution, authority_from_entailment: false,
  }, 'occurrence_digest') };
}
