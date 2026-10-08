import { specimen as dynamicSpecimen } from '../dynamic-interface-field-001/src/specimen.mjs';
import { propose } from '../dynamic-interface-field-001/src/field.mjs';
import { authorize } from '../dynamic-interface-field-001/src/runtime.mjs';
import { CompositionFieldBridge as Bridge, routeTo } from '../composition-instance-002/bridge.mjs';
import { LocalWorld } from '../dynamic-interface-field-001/src/world.mjs';
import { id } from '../interface-superspace-001/src/proofs.mjs';
import { cupTerm, observerPolicy, project, derive } from './membrane.mjs';
import { select, executeSelected } from './execution.mjs';

export async function fieldFixture({ carrier = 'cup:c' } = {}) {
  const s = await dynamicSpecimen();
  const path = await s.publishPath(s.a, ['filesystem-output']);
  const observer_ref = 'observer:local';
  const terms = [s.source, path.doors[0], s.observation].map((door, i) => cupTerm({
    carrier: i === 1 ? carrier : `cup:${i}`, world_id: door.world_id,
    interface_id: door.descriptor.interface_id,
  }));
  const term = terms[1];
  const policy = observerPolicy({ observer_ref, anchors: [...s.peers.values()].map(w => w.anchor),
    selected_worlds: [...s.peers.keys()], terms, abilities: ['inspect'] });
  const current = () => project(policy, { histories: s.histories(), observed_at: s.clock() });
  const context = await current();
  const condition = { kind: 'affords', observer_ref, term_ref: term.term_ref, operation: 'inspect' };
  const witness = derive(context, policy, condition);
  const view = await s.project();
  const plan = (await propose(view, s.query('file.bytes'))).plans[0];
  const selection = await select(context, policy, witness, view, plan);
  const subject = observer_ref;
  const grants = () => authorize(plan, s.peers, subject);
  const execute = (tokens = [], options = {}) => executeSelected({ context, policy, witness, selection,
    view, plan, source: s.sourceArtifact(), current,
    options: { peers: s.peers, subject, grants: tokens, ...options } });
  return { ...s, path, policy, term, terms, current, context, condition, witness,
    view, plan, selection, subject, grants, execute };
}

export async function bridgeFixture(root) {
  const bridge = await Bridge.create({ root });
  const sourceOwner = new LocalWorld({ clock: bridge.clock });
  const sourceDoor = sourceOwner.publish(bridge.library.nodes.get(id('payload-bytes')));
  const observer = bridge.observer({ anchors: [sourceOwner.anchor], trust: true });
  const eligible = await bridge.runtimeTransition('open-chest');
  const door = bridge.publish(eligible, bridge.ownerControl());
  const route = await routeTo(bridge, observer, sourceOwner, sourceDoor, door);
  const observer_ref = 'observer:bridge';
  const term = cupTerm({ carrier: 'cup:c', world_id: bridge.world_id,
    interface_id: door.descriptor.interface_id, incarnation_id: bridge.incarnation_id });
  const policy = observerPolicy({ observer_ref, anchors: [sourceOwner.anchor, bridge.anchor],
    selected_worlds: [sourceOwner.world_id, bridge.world_id], terms: [term], abilities: ['inspect'],
    incarnations: [{ world_id: bridge.world_id, incarnation_id: bridge.incarnation_id, ledger_anchor: bridge.ledger_anchor }] });
  const current = () => project(policy, { histories: [sourceOwner.history(), bridge.fieldHistory()],
    journals: [{ incarnation_id: bridge.incarnation_id, events: bridge.journal() }], observed_at: bridge.clock() });
  const context = await current();
  const condition = { kind: 'affords', observer_ref, term_ref: term.term_ref, operation: 'inspect' };
  const witness = derive(context, policy, condition);
  const selection = await select(context, policy, witness, route.view, route.plan);
  const grants = bridge.authorize(route.plan, route.peers, observer_ref, bridge.ownerControl(), { max_uses: 2 });
  const execute = () => executeSelected({ context, policy, witness, selection, view: route.view, plan: route.plan, source: route.source,
    current, options: { peers: route.peers, subject: observer_ref, grants },
    bridge });
  return { bridge, sourceOwner, sourceDoor, route, policy, term, current, context, condition,
    witness, selection, grants, execute };
}

export function surface(context, policy) {
  return policy.terms.map(term => ({ carrier: term.carrier, operation: 'inspect',
    result: derive(context, policy, { kind: 'affords', observer_ref: policy.observer_ref,
      term_ref: term.term_ref, operation: 'inspect' }).result })).sort((a, b) => a.carrier.localeCompare(b.carrier));
}
