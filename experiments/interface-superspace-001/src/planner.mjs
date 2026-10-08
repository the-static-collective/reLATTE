import { blocked, outgoing, transition } from './graph.mjs';
import { digest, seal, verifySeal } from './receipts.mjs';
import { validate, assertRegistryIntegrity } from './registry.mjs';
export const VERSION = 'interface-planner/0.1';
export async function synthesize(registry, request) {
  assertRegistryIntegrity(registry);
  await validate('route-request', request);
  const source = registry.nodes.get(request.from);
  if (!source || !source.emits.includes(request.state.representation)) throw new Error('INVALID_SOURCE_STATE');
  if (request.state.facts.some(f => f !== 'ordered' || source.information.ordering !== 'ordered')) throw new Error('UNSUPPORTED_SOURCE_INFORMATION');
  const queue = [{ node: request.from, representation: request.state.representation, facts: request.state.facts, loss: 0, nodes: [request.from], edges: [] }];
  const candidates = [], rejections = []; let expansions = 0;
  // Enumerate bounded simple paths. A cycle is not progress, even if it adds facts.
  while (queue.length && candidates.length < request.constraints.max_candidates && expansions < 10000) {
    const state = queue.shift(); expansions++;
    const node = registry.nodes.get(state.node);
    const goal = state.edges.length > 0 && node.emits.includes(request.goal.emits) && (!request.goal.interface_id || request.goal.interface_id === state.node);
    if (goal) {
      if (request.constraints.ordering === 'ordered' && !state.facts.includes('ordered')) {
        rejections.push({ interface_id: state.node, relation_id: null, reasons: [{ code: 'ordering_requirement_unsatisfied', detail: { actual: state.facts, required: 'ordered; no lawful repair reached' } }] });
      } else {
        const body = { schema: 'relatte.route-candidate.experimental/v0', source_interface: request.from, destination_goal: request.goal, interface_sequence: state.nodes, relation_sequence: state.edges, constraints_considered: request.constraints, constraints_satisfied: Object.keys(request.constraints), constraints_rejected: [], planner_version: VERSION, registry_digest: registry.registry_digest, request };
        const route_id = 'route:' + digest(body).slice(7);
        candidates.push(seal({ ...body, route_id }, 'plan_digest')); continue;
      }
    }
    for (const r of outgoing(registry, state.node)) {
      const reasons = blocked(registry, state, r, request);
      if (state.nodes.includes(r.destination)) reasons.push({ code: 'cycle_no_progress', detail: {} });
      if (state.edges.length >= request.constraints.max_depth) reasons.push({ code: 'depth_bound', detail: {} });
      if (reasons.length) { rejections.push({ interface_id: r.destination, relation_id: r.relation_id, prefix: state.edges, reasons }); continue; }
      queue.push({ node: r.destination, representation: r.produces, facts: transition(state.facts, r), loss: state.loss + r.loss_cost, nodes: [...state.nodes, r.destination], edges: [...state.edges, r.relation_id] });
    }
  }
  const truncated = queue.length > 0;
  return { schema: 'relatte.route-search.experimental/v0', status: candidates.length ? 'CANDIDATES' : truncated ? 'SEARCH_LIMIT' : 'NO_ROUTE', candidates, rejections, expansions, truncated };
}
export async function verifyPlan(registry, plan) {
  await validate('route-candidate', plan); verifySeal(plan, 'plan_digest');
  if (plan.registry_digest !== registry.registry_digest) throw new Error('REGISTRY_CHANGED');
  const search = await synthesize(registry, plan.request);
  if (!search.candidates.some(p => p.plan_digest === plan.plan_digest)) throw new Error('PLAN_NOT_DERIVED');
}
