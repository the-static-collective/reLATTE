// Experimental, finite derivations over selected history. No grant/owner API.
import { FieldObserver } from '../dynamic-interface-field-001/src/field.mjs';
import { verifyHistory, replay } from '../dynamic-interface-field-001/src/history.mjs';
import { verifyJournal } from '../composition-instance-002/store.mjs';
import { loadRegistry } from '../interface-superspace-001/src/registry.mjs';
import { digest, canonical, seal, verifySeal } from '../interface-superspace-001/src/receipts.mjs';

const clone = structuredClone;
const fail = code => { throw new Error(code); };
const string = value => typeof value === 'string' && value.length > 0 && value.length <= 512;
const unique = values => new Set(values).size === values.length;
const sorted = values => [...values].sort((a, b) => canonical(a).localeCompare(canonical(b)));
const refs = values => [...new Set(values)].sort();
const exact = (value, keys) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).sort().join('|') !== [...keys].sort().join('|')) fail('INVALID_SHAPE');
};
const frozen = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); }
  return value;
};
const checkedContexts = new WeakSet();
let library;
const registry = () => library ??= loadRegistry();
export const NATIVE_OPERATION = Object.freeze({ inspect: 'observe' });

export function cupTerm({ carrier, world_id, interface_id, incarnation_id = null }) {
  if (![carrier, world_id, interface_id].every(string) ||
      (incarnation_id !== null && !string(incarnation_id))) fail('INVALID_TERM');
  return frozen(seal({ schema: 'relatte.psi-cup-term.experimental/v0', carrier,
    world_id, interface_id, incarnation_id }, 'term_ref'));
}

export function observerPolicy({ observer_ref, anchors, selected_worlds, terms, abilities,
  incarnations = [] }) {
  if (!string(observer_ref) || !Array.isArray(anchors) || anchors.length > 8 ||
      !Array.isArray(selected_worlds) || selected_worlds.length > 8 ||
      !unique(selected_worlds) || !selected_worlds.every(string) ||
      !Array.isArray(terms) || terms.length > 16 || !Array.isArray(abilities) ||
      abilities.length > 8 || !unique(abilities) || !abilities.every(string) ||
      !Array.isArray(incarnations) || incarnations.length > 8) fail('UNBOUNDED_OR_INVALID_POLICY');
  for (const anchor of anchors) {
    exact(anchor, ['world_id', 'public_key']);
    if (![anchor.world_id, anchor.public_key].every(string)) fail('INVALID_ANCHOR');
  }
  if (!unique(anchors.map(a => a.world_id)) || selected_worlds.some(w => !anchors.some(a => a.world_id === w)))
    fail('INVALID_SELECTED_ANCHORS');
  for (const term of terms) {
    exact(term, ['schema', 'carrier', 'world_id', 'interface_id', 'incarnation_id', 'term_ref']);
    verifySeal(term, 'term_ref');
    if (term.schema !== 'relatte.psi-cup-term.experimental/v0' ||
        ![term.carrier, term.world_id, term.interface_id].every(string) ||
        (term.incarnation_id !== null && !string(term.incarnation_id))) fail('INVALID_TERM');
  }
  if (!unique(terms.map(t => t.term_ref))) fail('DUPLICATE_TERM');
  for (const entry of incarnations) {
    exact(entry, ['world_id', 'incarnation_id', 'ledger_anchor']);
    exact(entry.ledger_anchor, ['world_id', 'public_key']);
    if (![entry.world_id, entry.incarnation_id, entry.ledger_anchor.world_id,
      entry.ledger_anchor.public_key].every(string) || !selected_worlds.includes(entry.world_id))
      fail('INVALID_INCARNATION_BINDING');
  }
  if (!unique(incarnations.map(i => i.world_id)) || !unique(incarnations.map(i => i.incarnation_id)))
    fail('DUPLICATE_INCARNATION');
  return frozen(seal({ schema: 'relatte.psi-observer-policy.experimental/v0', observer_ref,
    anchors: sorted(anchors), selected_worlds: sorted(selected_worlds), terms: sorted(terms),
    abilities: sorted(abilities), incarnations: sorted(incarnations), scope: 'EXPLICIT_OBSERVER_SELECTION_ONLY' }, 'policy_id'));
}

function verifyPolicy(policy) {
  exact(policy, ['schema', 'observer_ref', 'anchors', 'selected_worlds', 'terms', 'abilities',
    'incarnations', 'scope', 'policy_id']);
  verifySeal(policy, 'policy_id');
  if (digest(observerPolicy(policy)) !== digest(policy)) fail('INVALID_POLICY');
}

export async function project(policy, { histories, journals = [], observed_at, ...extras }) {
  verifyPolicy(policy);
  if (Object.keys(extras).length || !Number.isSafeInteger(observed_at) || observed_at < 0 ||
      !Array.isArray(histories) || histories.length > 8 || !Array.isArray(journals) || journals.length > 8)
    fail('INVALID_PROJECTION_INPUT');
  const selected = histories.map(h => h[0]?.world_id);
  if (!unique(selected) || digest(sorted(selected)) !== digest(policy.selected_worlds))
    fail('HISTORY_SELECTION_MISMATCH');
  if (!unique(journals.map(j => j.incarnation_id)) ||
      digest(sorted(journals.map(j => j.incarnation_id))) !== digest(sorted(policy.incarnations.map(i => i.incarnation_id))))
    fail('JOURNAL_SELECTION_MISMATCH');
  // Reuse #78 verification, attestation and owner-collision behavior, unchanged.
  const l = await registry();
  const view = await new FieldObserver({ anchors: policy.anchors, surfaces: l.surfaces,
    contracts: l.contracts }).project(histories, observed_at);
  const assertions = [], cuts = [], support = new Map(), dead = new Map(), states = new Map();
  const add = (kind, args, support_refs) => {
    const assertion = { kind, args, support_refs: refs(support_refs) };
    assertions.push(seal(assertion, 'assertion_ref'));
  };
  for (const events of histories) {
    const world_id = events[0].world_id, anchor = policy.anchors.find(a => a.world_id === world_id);
    const frontier = verifyHistory(events, anchor);
    cuts.push({ kind: 'field', ...frontier, cut_ref: digest({ anchor, events }) });
    states.set(world_id, replay(events, observed_at));
    for (const e of events) support.set(digest(e), { source: 'field', world_id, seq: e.seq });
  }
  for (const journal of journals) {
    exact(journal, ['incarnation_id', 'events']);
    if (journal.events.length > 4096) fail('JOURNAL_BOUND_EXCEEDED');
    const binding = policy.incarnations.find(i => i.incarnation_id === journal.incarnation_id);
    const check = verifyJournal(journal.events, binding.ledger_anchor);
    const admission = journal.events[0];
    if (admission.incarnation_id !== binding.incarnation_id || admission.payload.world_id !== binding.world_id)
      fail('INCARNATION_WORLD_MISMATCH');
    cuts.push({ kind: 'incarnation', world_id: binding.world_id, incarnation_id: binding.incarnation_id,
      head: check.head, count: journal.events.length, cut_ref: digest(journal) });
    for (const e of journal.events) {
      support.set(digest(e), { source: 'incarnation', incarnation_id: binding.incarnation_id, seq: e.seq });
      if (e.kind === 'death-fence') {
        dead.set(binding.world_id, digest(e));
        add('terminally_dead', [binding.incarnation_id, binding.world_id], [digest(e)]);
      } else if (e.kind === 'occurrence' || e.kind === 'runtime-observation') {
        add('formation', [binding.incarnation_id, e.kind, digest(e.payload)], [digest(e)]);
      }
    }
  }
  const local = { observer_ref: policy.observer_ref, abilities: policy.abilities };
  const local_ref = digest(local); support.set(local_ref, { source: 'observer-declaration', policy_id: policy.policy_id });
  for (const ability of policy.abilities) add('observer_has', [policy.observer_ref, ability], [local_ref]);
  const live = new Map();
  for (const term of policy.terms) {
    const events = histories.find(h => h[0].world_id === term.world_id);
    if (!events) continue; // Outside this selected context, never globally false.
    const incarnation = policy.incarnations.find(i => i.world_id === term.world_id);
    for (const e of events) {
      if (['publish', 'reconstitute', 'fork-door'].includes(e.kind) && e.payload.descriptor.interface_id === term.interface_id) {
        const offer = e.payload.offer_id;
        add('published', [term.term_ref, term.world_id, term.interface_id, offer], [digest(e)]);
        add('incarnation', [offer, incarnation?.incarnation_id ?? offer], [digest(e),
          ...(incarnation ? [digest(journals.find(j => j.incarnation_id === incarnation.incarnation_id).events[0])] : [])]);
        for (const [operation, native] of Object.entries(NATIVE_OPERATION))
          if (e.payload.descriptor.operations.includes(native)) add('supports', [offer, operation], [digest(e)]);
      } else if (e.kind === 'withdraw' && e.payload.interface_id === term.interface_id) {
        add('withdrawn', [e.payload.offer_id], [digest(e)]);
      }
    }
    const door = states.get(term.world_id).doors.get(term.interface_id);
    if (!door || dead.has(term.world_id) || !door.descriptor.live ||
        (term.incarnation_id !== null && term.incarnation_id !== (incarnation?.incarnation_id ?? door.offer_id))) continue;
    const referent = { world_id: term.world_id, interface_id: term.interface_id,
      offer_id: door.offer_id, incarnation_id: incarnation?.incarnation_id ?? door.offer_id };
    live.set(term.term_ref, referent);
    add('live', [term.term_ref, referent], [door.event_ref, local_ref]);
  }
  // Direct, operation-specific edges only. No converse/transitive closure rules.
  for (const relation of view.relations.values()) {
    for (const [from, source] of live) for (const [to, destination] of live) {
      const matches = (a, b) => a.world_id === b.world_id && a.interface_id === b.interface_id && a.offer_id === b.offer_id;
      if (!matches(source, relation.source) || !matches(destination, relation.destination)) continue;
      for (const [operation, native] of Object.entries(NATIVE_OPERATION))
        if (relation.descriptor.operation === native) add('relation', [from, to, operation], [relation.event_ref]);
    }
  }
  if (assertions.length > 512) fail('ASSERTION_BOUND_EXCEEDED');
  const context = seal({ schema: 'relatte.psi-environment.experimental/v0', policy_id: policy.policy_id,
    observer_ref: policy.observer_ref, observed_at, history_cuts: sorted(cuts),
    frontier_digest: digest({ observed_at, cuts: sorted(cuts) }),
    assertions: sorted(assertions), assertion_digest: digest(sorted(assertions)),
    support: sorted([...support].map(([ref, locator]) => ({ ref, locator }))),
    inputs: { histories: clone(histories), journals: clone(journals) },
    view_snapshot: view.snapshot, authority: [], scope: 'SELECTED_LOCAL_HISTORIES_ONLY' }, 'context_id');
  checkedContexts.add(context);
  return frozen(context);
}

export async function verifyContext(context, policy) {
  verifySeal(context, 'context_id');
  if (context.policy_id !== policy.policy_id) fail('OBSERVER_POLICY_MISMATCH');
  const rebuilt = await project(policy, { ...context.inputs, observed_at: context.observed_at });
  if (digest(rebuilt) !== digest(context)) fail('UNSUPPORTED_OR_MUTATED_ASSERTIONS');
  frozen(context);
  checkedContexts.add(context);
  return true;
}

function question(condition, policy) {
  const keys = {
    resolves: ['kind', 'term_ref'], live_referent: ['kind', 'term_ref'],
    affords: ['kind', 'observer_ref', 'term_ref', 'operation'],
    connected: ['kind', 'observer_ref', 'source', 'target', 'operation'],
  }[condition?.kind];
  if (!keys) fail('UNKNOWN_CONDITION');
  exact(condition, keys);
  if (!Object.values(condition).every(string)) fail('INVALID_CONDITION');
  if (condition.observer_ref !== undefined && condition.observer_ref !== policy.observer_ref)
    fail('OBSERVER_MISMATCH');
}

export function derive(context, policy, condition) {
  if (!checkedContexts.has(context)) fail('CONTEXT_NOT_VERIFIED');
  verifyPolicy(policy); verifySeal(context, 'context_id'); question(condition, policy);
  if (context.policy_id !== policy.policy_id) fail('OBSERVER_POLICY_MISMATCH');
  const term_refs = condition.kind === 'connected' ? [condition.source, condition.target] : [condition.term_ref];
  const terms = term_refs.map(ref => policy.terms.find(t => t.term_ref === ref));
  let result = 'NOT_ENTAILED', reason = 'NO_SUPPORTED_RULE', supporting = [], referents = [];
  const outside = terms.some(t => !t || !policy.selected_worlds.includes(t.world_id));
  const find = (kind, predicate) => context.assertions.find(a => a.kind === kind && predicate(a.args));
  const lives = term_refs.map(ref => find('live', a => a[0] === ref));
  if (outside) { result = 'OUTSIDE_SELECTED_VIEW'; reason = 'REFERENT_OUTSIDE_SELECTED_CONTEXT'; }
  else if (lives.every(Boolean)) {
    supporting.push(...lives); referents = lives.map(a => a.args[1]);
    if (['resolves', 'live_referent'].includes(condition.kind)) {
      result = 'ENTAILED'; reason = 'SELECTED_LIVE_PUBLICATION';
    } else {
      const ability = find('observer_has', a => a[0] === policy.observer_ref && a[1] === condition.operation);
      const supports = lives.map(live => find('supports', a => a[0] === live.args[1].offer_id && a[1] === condition.operation));
      const relation = condition.kind === 'connected' ? find('relation', a =>
        a[0] === condition.source && a[1] === condition.target && a[2] === condition.operation) : null;
      if (ability && supports.every(Boolean) && (condition.kind !== 'connected' || relation)) {
        supporting.push(ability, ...supports, ...(relation ? [relation] : []));
        result = 'ENTAILED'; reason = 'FIXED_SUPPORTED_RULE';
      } else reason = !ability ? 'OBSERVER_ABILITY_ABSENT' : supports.some(a => !a) ?
        'OPERATION_UNSUPPORTED' : 'EXPLICIT_DIRECTED_RELATION_ABSENT';
    }
  } else reason = 'LIVE_REFERENT_ABSENT';
  // Negative conclusions depend on the complete selected cut, not a fabricated global negation.
  const witness = seal({ schema: 'relatte.experimental-entailment-witness/v0',
    observer_ref: policy.observer_ref, policy_id: policy.policy_id, context_id: context.context_id,
    history_cut_refs: context.history_cuts.map(c => c.cut_ref), frontier_digest: context.frontier_digest,
    assertion_digest: context.assertion_digest, term_ref: term_refs[0], condition: clone(condition),
    result, reason, referents, support_refs: refs(supporting.flatMap(a => a.support_refs)),
    assertion_refs: refs(supporting.map(a => a.assertion_ref)),
    created_at: new Date(context.observed_at).toISOString(), rule: `${condition.kind}/v0`,
    authority: [], semantic_effect: 'none' }, 'witness_id');
  return frozen(witness);
}

export async function verifyWitness(witness, context, policy) {
  await verifyContext(context, policy); verifySeal(witness, 'witness_id');
  if (digest(derive(context, policy, witness.condition)) !== digest(witness)) fail('INVALID_ENTAILMENT_WITNESS');
  return true;
}
