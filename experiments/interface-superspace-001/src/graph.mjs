export function outgoing(registry, id) { return registry.relations.filter(r => r.source === id); }
export function transition(facts, relation) {
  return [...new Set([...facts.filter(f => !relation.removes.includes(f)), ...relation.postconditions])].sort();
}
export function blocked(registry, state, relation, request) {
  const c = request.constraints, target = registry.nodes.get(relation.destination), reasons = [];
  const fail = (code, detail) => reasons.push({ code, detail });
  if (state.representation !== relation.consumes) fail('protocol_incompatible', { actual: state.representation, required: relation.consumes });
  if (target.information.capacity !== null && request.state.byte_length > target.information.capacity) fail('capacity_insufficient', { capacity: target.information.capacity, requested: request.state.byte_length });
  for (const f of relation.preconditions) if (!state.facts.includes(f)) fail('required_observation_unavailable', { required: f, actual: state.facts });
  if (relation.requires.network && !c.network) fail('network_forbidden', {});
  if (relation.requires.live_participant && !target.live) fail('live_participant_unavailable', {});
  if (relation.requires.local_state && !c.local_state) fail('local_state_unavailable', {});
  if (relation.requires.witness && !c.witnesses.includes(relation.requires.witness)) fail('required_witness_absent', { witness: relation.requires.witness });
  if (relation.requires.authority === 'mutate' && !c.mutation_authority) fail('mutation_forbidden', {});
  const permission = relation.destination + '/' + relation.requires.authority;
  if (relation.requires.authority && !c.permissions.includes(permission)) fail('authority_absent', { permission });
  if (c.preserve_ancestry && !relation.preserves.ancestry) fail('ancestry_unpreserved', {});
  if (state.loss + relation.loss_cost > c.loss_budget) fail('loss_budget_exceeded', { accumulated: state.loss, edge: relation.loss_cost });
  if (c.reversible && !relation.reversible) fail('irreversible_relation', {});
  if (target.constraints.forbidden.includes('network') && relation.requires.network) fail('interface_network_forbidden', {});
  if (target.constraints.forbidden.includes(relation.operation)) fail('interface_operation_forbidden', { operation: relation.operation });
  for (const required of target.constraints.required) if (!transition(state.facts, relation).includes(required)) fail('interface_constraint_unsatisfied', { required });
  return reasons;
}
