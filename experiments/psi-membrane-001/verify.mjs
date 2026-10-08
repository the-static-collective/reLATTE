// Cold proof checking: no LocalWorld/Bridge construction, runtime, grant or execution calls.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { EvidenceStore, verifyJournal } from '../composition-instance-002/store.mjs';
import { verifySigned, verifyHistory, replay } from '../dynamic-interface-field-001/src/history.mjs';
import { FieldObserver, verifyProposal } from '../dynamic-interface-field-001/src/field.mjs';
import { verifyDynamic } from '../dynamic-interface-field-001/src/runtime.mjs';
import { loadRegistry } from '../interface-superspace-001/src/registry.mjs';
import { digest, byteDigest, verifySeal } from '../interface-superspace-001/src/receipts.mjs';
import { verifyCrossingEnvelope, verifyReceipt } from '../../src/protocol.ts';
import { verifyContext, verifyWitness, derive } from './membrane.mjs';

const PARENT = '21e7d7a7413507b3b9301354f51f7f98d89d2eee';
const inherited = ['src', 'spec', 'schemas', 'experiments/composition-instance-001',
  'experiments/composition-instance-002', 'experiments/dynamic-interface-field-001', 'experiments/interface-superspace-001'];
const unique = array => assert.equal(new Set(array).size, array.length, 'DUPLICATE_EVIDENCE_ID');
export async function verifyProof(proof, roots, store, { checkParent = true } = {}) {
  verifySigned(proof, roots.proof_key);
  assert.equal(proof.schema, 'relatte.psi-membrane-proof.experimental/v0');
  assert.equal(proof.parent, PARENT); assert.equal(proof.normative_core_mutations, 0);
  assert.equal(proof.live_authority_restored, 0);
  assert.equal(roots.scope, 'EXPLICIT_SPECIMEN_TRUST_INPUTS_ONLY');
  if (checkParent) assert.equal(execFileSync('git', ['diff', PARENT, '--', ...inherited], { encoding: 'utf8' }), '');
  assert.ok(proof.contexts.length <= 64 && proof.witnesses.length <= 128 && proof.occurrences.length <= 32);
  unique(roots.fields.map(a => a.world_id)); unique(roots.ledgers.map(a => a.world_id));
  const anchored = (a, list) => assert.ok(list.some(root => digest(a) === digest(root)), 'EXPLICIT_ROOT_REQUIRED');
  const histories = new Map(), journals = new Map(), contexts = new Map(), policies = new Map(), witnesses = new Map(), views = new Map();
  for (const h of proof.histories) {
    anchored(h.anchor, roots.fields); verifyHistory(h.events, h.anchor);
    replay(h.events, h.events.at(-1).at_ms);
    assert.ok(!histories.has(h.anchor.world_id)); histories.set(h.anchor.world_id, h.events);
  }
  for (const j of proof.journals) {
    anchored(j.binding.ledger_anchor, roots.ledgers); verifyJournal(j.events, j.binding.ledger_anchor);
    assert.ok(!journals.has(j.binding.incarnation_id)); journals.set(j.binding.incarnation_id, j.events);
  }
  unique(proof.policies.map(p => p.policy_id));
  for (const p of proof.policies) {
    for (const anchor of p.anchors) anchored(anchor, roots.fields);
    for (const binding of p.incarnations) {
      anchored(binding.ledger_anchor, roots.ledgers);
      assert.deepEqual(binding, proof.journals.find(j => j.binding.incarnation_id === binding.incarnation_id)?.binding);
    }
    policies.set(p.policy_id, p);
  }
  unique(proof.contexts.map(c => c.context_id)); const library = await loadRegistry();
  for (const saved of proof.contexts) {
    const ctx = store.get(saved.ref), policy = policies.get(saved.policy_id);
    assert.ok(policy); assert.equal(ctx.context_id, saved.context_id);
    for (const prefix of ctx.inputs.histories) {
      const complete = histories.get(prefix[0].world_id); assert.ok(complete);
      assert.deepEqual(prefix, complete.slice(0, prefix.length));
    }
    for (const cut of ctx.inputs.journals) {
      const complete = journals.get(cut.incarnation_id); assert.ok(complete);
      assert.deepEqual(cut.events, complete.slice(0, cut.events.length));
    }
    await verifyContext(ctx, policy); contexts.set(ctx.context_id, ctx);
    const view = await new FieldObserver({ anchors: policy.anchors, surfaces: library.surfaces,
      contracts: library.contracts }).project(ctx.inputs.histories, ctx.observed_at);
    assert.deepEqual(view.snapshot, ctx.view_snapshot); views.set(ctx.context_id, view);
  }
  unique(proof.witnesses.map(w => w.witness_id));
  for (const w of proof.witnesses) {
    const ctx = contexts.get(w.context_id), policy = policies.get(w.policy_id); assert.ok(ctx && policy);
    await verifyWitness(w, ctx, policy); witnesses.set(w.witness_id, w);
  }
  const occurrences = new Map(), seenTickets = new Set(), uses = new Map();
  for (const item of proof.occurrences) {
    const ctx = contexts.get(item.context_id), fresh = contexts.get(item.fresh_context_id);
    const w = witnesses.get(item.witness_id), current = witnesses.get(item.fresh_witness_id), record = item.record;
    assert.ok(ctx && fresh && w && current); assert.equal(w.context_id, ctx.context_id);
    assert.equal(current.context_id, fresh.context_id); assert.equal(item.policy_id, w.policy_id);
    assert.equal(current.policy_id, w.policy_id); assert.deepEqual(current.condition, w.condition);
    assert.equal(w.result, 'ENTAILED'); assert.equal(w.condition.kind, 'affords');
    assert.ok(fresh.observed_at >= ctx.observed_at);
    for (const prefix of ctx.inputs.histories) {
      const next = fresh.inputs.histories.find(h => h[0].world_id === prefix[0].world_id);
      assert.deepEqual(prefix, next?.slice(0, prefix.length));
    }
    for (const prefix of ctx.inputs.journals) {
      const next = fresh.inputs.journals.find(j => j.incarnation_id === prefix.incarnation_id);
      assert.deepEqual(prefix.events, next?.events.slice(0, prefix.events.length));
    }
    verifySeal(item.selection, 'selection_digest'); verifySeal(record, 'occurrence_digest');
    assert.equal(item.selection.witness_id, w.witness_id); assert.equal(item.selection.context_id, ctx.context_id);
    assert.equal(item.selection.policy_id, w.policy_id); assert.equal(item.selection.observer_ref, w.observer_ref);
    assert.equal(item.selection.field_plan_digest, item.plan.field_plan_digest);
    assert.deepEqual(item.selection.referent, w.referents[0]); assert.deepEqual(item.selection.authority, []);
    const target = item.plan.doors.at(-1);
    assert.equal(target.offer_id, w.referents[0].offer_id); assert.equal(target.world_id, w.referents[0].world_id);
    assert.equal(target.descriptor.interface_id, w.referents[0].interface_id);
    assert.equal(item.plan.relations.at(-1).descriptor.operation, 'observe');
    await verifyProposal(views.get(ctx.context_id), item.plan);
    assert.equal(record.historical_witness_id, w.witness_id); assert.equal(record.current_witness_id, current.witness_id);
    assert.equal(record.selection_digest, item.selection.selection_digest); assert.equal(record.authority_from_entailment, false);
    assert.ok(!occurrences.has(record.occurrence_id)); occurrences.set(record.occurrence_id, item);
    if (current.result !== 'ENTAILED' || digest(current.referents) !== digest(w.referents)) {
      assert.equal(record.result, 'DENIED'); assert.equal(record.native_effect_count, 0);
      assert.equal(record.owner_occurrence, null);
      assert.equal(record.failure, current.result !== 'ENTAILED' ? 'CURRENT_CONDITION_NOT_ENTAILED' : 'STALE_REFERENT');
      continue;
    }
    const native = record.owner_occurrence; assert.ok(native); verifyDynamic(item.plan, native, roots.fields);
    assert.equal(native.subject, w.observer_ref);
    assert.equal(record.native_effect_count, native.execution?.actual_relation_receipts.length ?? 0);
    assert.equal(record.result, native.result === 'succeeded' ? 'OCCURRED' : 'DENIED');
    assert.equal(record.failure, native.result === 'succeeded' ? null : native.failures.map(f => f.reason).join(';'));
    for (const ticket of native.operation_tickets) {
      assert.ok(!seenTickets.has(ticket.ticket_id)); seenTickets.add(ticket.ticket_id);
      const history = histories.get(ticket.world_id), pos = history.findIndex(e => digest(e) === ticket.head);
      assert.ok(pos >= 0); assert.ok(history[pos].at_ms <= ticket.at_ms);
      const state = replay(history.slice(0, pos + 1), ticket.at_ms), grant = state.grants.get(ticket.grant_id), door = state.doors.get(ticket.interface_id);
      assert.ok(grant && door); assert.equal(door.offer_id, ticket.offer_id); assert.equal(grant.offer_id, ticket.offer_id);
      assert.equal(grant.subject, ticket.subject); assert.equal(grant.operation, ticket.operation);
      assert.equal(grant.permission, ticket.permission); assert.ok(!state.revoked.has(ticket.grant_id));
      assert.ok(grant.expires_at > ticket.at_ms);
      const use = (uses.get(ticket.grant_id) ?? 0) + 1; assert.equal(ticket.use, use);
      assert.ok(use <= grant.max_uses); uses.set(ticket.grant_id, use);
    }
    for (const receipt of native.execution?.actual_relation_receipts ?? []) {
      if (!receipt.evidence.native.runtime_observation_ref) continue;
      const observed = [...journals.values()].flat().find(e => digest(e) === receipt.evidence.native.runtime_observation_ref);
      assert.ok(observed && observed.kind === 'runtime-observation');
      assert.deepEqual(receipt.evidence.native.observation, observed.payload.observation);
      assert.equal(receipt.evidence.native.state_digest, digest(observed.payload.after));
      assert.ok([...journals.values()].flat().some(e => e.kind === 'occurrence' &&
        e.payload.occurrence_ref === byteDigest(Buffer.from(JSON.stringify(native)))));
    }
  }
  const c = proof.cases, byId = id => { const item = occurrences.get(id); assert.ok(item); return item; };
  const positive = id => { const w = witnesses.get(id); assert.equal(w?.result, 'ENTAILED'); return w; };
  const negative = id => { const w = witnesses.get(id); assert.equal(w?.result, 'NOT_ENTAILED'); return w; };
  assert.equal(byId(c.timing.immediate).record.result, 'OCCURRED');
  assert.equal(byId(c.timing.delayed).record.failure, 'CURRENT_CONDITION_NOT_ENTAILED');
  positive(c.timing.old_witness); negative(c.timing.withdrawn_witness);
  assert.equal(byId(c.timing.reconstituted).record.failure, 'STALE_REFERENT');
  assert.notEqual(c.timing.old_offer, c.timing.fresh_offer);
  assert.equal(byId(c.death.immediate).record.result, 'OCCURRED');
  assert.equal(byId(c.death.delayed).record.failure, 'CURRENT_CONDITION_NOT_ENTAILED');
  positive(c.death.old_witness); negative(c.death.dead_witness);
  const before = contexts.get(c.death.before), after = contexts.get(c.death.after_occurrence), dead = contexts.get(c.death.dead_context);
  assert.notEqual(before.frontier_digest, after.frontier_digest); assert.notEqual(before.assertion_digest, after.assertion_digest);
  assert.ok(after.assertions.some(a => a.kind === 'formation'));
  assert.ok(dead.assertions.some(a => a.kind === 'terminally_dead' && a.args[0] === c.death.incarnation_id));
  assert.ok(dead.view_snapshot.door_refs.some(d => d.offer_id === positive(c.death.old_witness).referents[0].offer_id));
  const surfaceOf = (ctx, policy) => policy.terms.map(term => ({ carrier: term.carrier, operation: 'inspect',
    result: derive(ctx, policy, { kind: 'affords', observer_ref: policy.observer_ref, term_ref: term.term_ref,
      operation: 'inspect' }).result })).sort((a,b) => a.carrier.localeCompare(b.carrier));
  const same = c.same_surface, ca = contexts.get(same.a), cb = contexts.get(same.b);
  const pa = policies.get(same.a_policy), pb = policies.get(same.b_policy);
  const surfaces = [surfaceOf(ca, pa), surfaceOf(cb, pb)];
  assert.deepEqual(surfaces, same.surfaces); assert.deepEqual(surfaces[0], surfaces[1]);
  assert.notEqual(ca.frontier_digest, cb.frontier_digest); assert.notEqual(same.a_witness, same.b_witness);
  assert.ok(ca.inputs.histories.some(h => h.some(e => e.kind === 'withdraw') && h.some(e => e.kind === 'reconstitute')));
  assert.ok(cb.inputs.histories.every(h => h.every(e => e.kind !== 'withdraw' && e.kind !== 'reconstitute')));
  positive(same.a_witness); positive(same.b_witness);
  assert.deepEqual(c.connectivity.map(id => witnesses.get(id).result), ['ENTAILED', 'ENTAILED', 'NOT_ENTAILED', 'NOT_ENTAILED']);
  for (const id of c.connectivity.slice(0,2)) assert.ok(positive(id).support_refs.length);
  assert.deepEqual(c.composition.first.map(id => witnesses.get(id).result), ['ENTAILED', 'OUTSIDE_SELECTED_VIEW']);
  assert.deepEqual(c.composition.second.map(id => witnesses.get(id).result), ['OUTSIDE_SELECTED_VIEW', 'ENTAILED']);
  assert.deepEqual(c.composition.composite.map(id => witnesses.get(id).result), ['OUTSIDE_SELECTED_VIEW', 'OUTSIDE_SELECTED_VIEW', 'ENTAILED']);
  for (const id of c.composition.composite) assert.equal(contexts.get(witnesses.get(id).context_id).scope, 'SELECTED_LOCAL_HISTORIES_ONLY');
  assert.equal(proof.crossings.length, 2);
  for (const pair of proof.crossings) {
    const item = byId(pair.occurrence_id), native = item.record.owner_occurrence.execution.particulars.at(-1);
    assert.equal(item.record.result, 'OCCURRED'); assert.ok(await verifyCrossingEnvelope(pair.crossing));
    for (const receipt of [pair.received, pair.disposition]) {
      assert.ok(await verifyReceipt(receipt)); assert.equal(receipt.crossing_id, pair.crossing.crossing_id);
      assert.equal(receipt.semantic_effect, 'none');
    }
    assert.equal(pair.received.kind, 'RECEIVED'); assert.equal(pair.disposition.kind, 'R3_HOLD');
    assert.equal(pair.received.world_id, pair.disposition.world_id);
    assert.equal(pair.crossing.source_particular, native.particular_id);
    assert.equal(pair.crossing.payload_refs[0].address, native.content_digest);
    assert.deepEqual(pair.crossing.parents, [item.witness_id, ...witnesses.get(item.witness_id).history_cut_refs]);
    assert.deepEqual(pair.crossing.extensions.psi_membrane_001, { context_id: item.context_id,
      witness_id: item.witness_id, occurrence_digest: item.record.occurrence_digest });
  }
  assert.notDeepEqual(proof.crossings[0].crossing.parents, proof.crossings[1].crossing.parents);
  assert.notEqual(proof.crossings[0].crossing.source_history_head, proof.crossings[1].crossing.source_history_head);
  return { verified: true, history_cut_contexts: contexts.size, entailment_witnesses: witnesses.size,
    native_occurrences: [...occurrences.values()].filter(i => i.record.result === 'OCCURRED').length,
    denials_before_native_effect: [...occurrences.values()].filter(i => i.record.result === 'DENIED' && i.record.native_effect_count === 0).length,
    owner_tickets: seenTickets.size, live_authority_restored: 0, replay_side_effects: 0, normative_core_mutations: 0 };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(process.argv[2] ?? 'work/psi-membrane-001');
  console.log(JSON.stringify(await verifyProof(JSON.parse(readFileSync(resolve(root, 'proof.json'))),
    JSON.parse(readFileSync(resolve(root, 'roots.json'))), new EvidenceStore(root))));
}
