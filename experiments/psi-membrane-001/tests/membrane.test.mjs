import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fieldFixture, bridgeFixture, surface } from '../fixture.mjs';
import { observerPolicy, project, derive, verifyContext, verifyWitness } from '../membrane.mjs';
import { select, executeSelected } from '../execution.mjs';
import { digest, seal } from '../../interface-superspace-001/src/receipts.mjs';
import { LocalWorld } from '../../dynamic-interface-field-001/src/world.mjs';
import { generateP256KeyPair, sealCrossingEnvelope } from '../../../src/protocol.ts';
import { LocalReceiver } from '../../../src/receiver.ts';

const copy = structuredClone;
const reseal = (value, field) => { const body = copy(value); delete body[field]; return seal(body, field); };
async function bridge(t) {
  const root = mkdtempSync(join(tmpdir(), 'psi-test-'));
  const s = await bridgeFixture(root);
  t.after(async () => { try { s.bridge.assertAlive(); await s.bridge.terminate(s.bridge.ownerControl()); } catch {} rmSync(root, { recursive: true, force: true }); });
  return s;
}
const notNative = (run, reason = 'CURRENT_CONDITION_NOT_ENTAILED') => {
  assert.equal(run.record.result, 'DENIED'); assert.match(run.record.failure, new RegExp(reason));
  assert.equal(run.record.native_effect_count, 0);
};

test('01 old ENTAILED witness survives withdrawal but cannot execute', async () => {
  const s = await fieldFixture(), g = s.grants();
  s.a.withdraw(s.term.interface_id);
  const run = await s.execute(g); notNative(run);
  assert.equal(run.fresh_witness.result, 'NOT_ENTAILED');
  assert.equal(await verifyWitness(s.witness, s.context, s.policy), true);
  assert.notEqual(run.fresh_witness.witness_id, s.witness.witness_id);
});
test('02 terminal death defeats entailment even when signed publication survives interrupted cleanup', async t => {
  const s = await bridge(t); await s.bridge.terminate(s.bridge.ownerControl(), { interruptCleanup: true });
  const run = await s.execute(); notNative(run);
  assert.ok(run.fresh_context.view_snapshot.door_refs.some(d => d.offer_id === s.witness.referents[0].offer_id));
  assert.ok(run.fresh_context.assertions.some(a => a.kind === 'terminally_dead'));
  assert.equal(await verifyWitness(s.witness, s.context, s.policy), true);
  assert.throws(() => s.bridge.owner.admitOperation(s.route.plan.doors[1], s.grants[1], s.policy.observer_ref, 'observe'), /TERMINAL_INSTANCE_DEATH/);
});
test('03 same carrier reconstitution cannot be selected by the old witness', async () => {
  const s = await fieldFixture(), g = s.grants(), old = s.path.doors[0];
  s.a.withdraw(s.term.interface_id);
  const next = s.a.publish(old.descriptor, { kind: 'reconstitute', parents: [{ world_id: s.a.world_id, offer_id: old.offer_id }] });
  const run = await s.execute(g); notNative(run, 'STALE_REFERENT');
  assert.equal(run.fresh_witness.result, 'ENTAILED');
  assert.notEqual(run.fresh_witness.referents[0].offer_id, old.offer_id);
  assert.throws(() => s.a.admitOperation(next, g[1], s.subject, 'observe'), /GRANT_SCOPE_MISMATCH/);
});
test('04 historical support is not current liveness; expiry also changes derivation', async () => {
  const s = await fieldFixture(); s.time.value += 60000;
  const now = await s.current(), w = derive(now, s.policy, s.condition);
  assert.ok(now.assertions.some(a => a.kind === 'published'));
  assert.equal(w.result, 'NOT_ENTAILED');
  assert.equal(await verifyWitness(s.witness, s.context, s.policy), true);
});
test('05 assertion insertion without attributable support is rejected even after resealing', async () => {
  const s = await fieldFixture(), edited = copy(s.context);
  edited.assertions.push(seal({ kind: 'observer_has', args: [s.subject, 'mutate'], support_refs: [] }, 'assertion_ref'));
  edited.assertion_digest = digest(edited.assertions);
  const forged = reseal(edited, 'context_id');
  assert.throws(() => derive(forged, s.policy, s.condition), /CONTEXT_NOT_VERIFIED/);
  await assert.rejects(verifyContext(forged, s.policy), /UNSUPPORTED_OR_MUTATED_ASSERTIONS/);
  await assert.rejects(project(s.policy, { ...s.context.inputs, observed_at: 1000, assertions: edited.assertions }), /INVALID_PROJECTION_INPUT/);
});
test('06 mutated support invalidates its signature and witness', async () => {
  const s = await fieldFixture(), edited = copy(s.context);
  edited.inputs.histories[0][1].payload.descriptor.live = false;
  await assert.rejects(verifyContext(reseal(edited, 'context_id'), s.policy), /INVALID_SIGNATURE/);
  const forged = copy(s.witness); forged.support_refs = [];
  await assert.rejects(verifyWitness(reseal(forged, 'witness_id'), s.context, s.policy), /INVALID_ENTAILMENT_WITNESS/);
});
test('07 observer-selected history cannot silently widen', async () => {
  const s = await fieldFixture(), stranger = new LocalWorld();
  const policy = observerPolicy({ ...s.policy, anchors: [...s.policy.anchors, stranger.anchor] });
  await assert.rejects(project(policy, { histories: [...s.histories(), stranger.history()], observed_at: Date.now() }), /HISTORY_SELECTION_MISMATCH/);
  const expanded = observerPolicy({ ...policy, selected_worlds: [...policy.selected_worlds, stranger.world_id] });
  const widened = await project(expanded, { histories: [...s.histories(), stranger.history()], observed_at: Date.now() });
  await assert.rejects(verifyWitness(s.witness, widened, expanded), /INVALID_ENTAILMENT_WITNESS/);
});
test('08 same current affordance surface does not collapse formation history', async () => {
  const a = await fieldFixture(), b = await fieldFixture();
  const old = a.path.doors[0]; a.a.withdraw(old.descriptor.interface_id);
  a.a.publish(old.descriptor, { kind: 'reconstitute', parents: [{ world_id: a.a.world_id, offer_id: old.offer_id }] });
  const ca = await a.current(), cb = await b.current();
  assert.deepEqual(surface(ca, a.policy), surface(cb, b.policy));
  assert.notEqual(ca.frontier_digest, cb.frontier_digest);
  assert.notEqual(derive(ca, a.policy, a.condition).witness_id, b.witness.witness_id);
  assert.notDeepEqual(ca.history_cuts, cb.history_cuts);
});
test('09 explicitly directed relation cannot reverse itself', async () => {
  const s = await fieldFixture();
  const condition = (source, target) => ({ kind: 'connected', observer_ref: s.subject,
    source: s.terms[source].term_ref, target: s.terms[target].term_ref, operation: 'inspect' });
  const ab = derive(s.context, s.policy, condition(0, 1)), ba = derive(s.context, s.policy, condition(1, 0));
  assert.equal(ab.result, 'ENTAILED'); assert.ok(ab.support_refs.length > 0);
  assert.equal(ba.result, 'NOT_ENTAILED');
});
test('10 two directed relations do not imply a transitive edge', async () => {
  const s = await fieldFixture();
  const q = (a, b) => ({ kind: 'connected', observer_ref: s.subject,
    source: s.terms[a].term_ref, target: s.terms[b].term_ref, operation: 'inspect' });
  assert.equal(derive(s.context, s.policy, q(0, 1)).result, 'ENTAILED');
  assert.equal(derive(s.context, s.policy, q(1, 2)).result, 'ENTAILED');
  assert.equal(derive(s.context, s.policy, q(0, 2)).result, 'NOT_ENTAILED');
});
test('11 derive/select immediate execution differs from delay then withdrawal', async () => {
  const s = await fieldFixture(); assert.equal((await s.execute(s.grants())).record.result, 'OCCURRED');
  const delayedGrants = s.grants(); s.time.value++; s.a.withdraw(s.term.interface_id);
  notNative(await s.execute(delayedGrants));
});
test('12 witness and selection are not grants', async () => {
  const s = await fieldFixture();
  assert.equal(s.a.current().grants.size, 0);
  notNative(await s.execute([s.witness, s.selection]), 'GRANT_ABSENT');
  assert.deepEqual(s.witness.authority, []); assert.deepEqual(s.selection.authority, []);
});
test('13 a grant is not proof of entailment for an observer lacking ability', async () => {
  const s = await fieldFixture(); s.grants();
  const policy = observerPolicy({ ...s.policy, abilities: [] });
  const ctx = await project(policy, { histories: s.histories(), observed_at: s.clock() });
  assert.equal(derive(ctx, policy, { ...s.condition, observer_ref: policy.observer_ref }).result, 'NOT_ENTAILED');
});
test('14 current entailment cannot become receiver admission', async t => {
  const s = await fieldFixture(); assert.equal(s.witness.result, 'ENTAILED');
  const root = mkdtempSync(join(tmpdir(), 'psi-receiver-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  const receiver = await LocalReceiver.create(join(root, 'receiver'), { world_id: 'world:independent', receiver_particular: 'observer:independent', contract_ref: 'contract:psi' });
  const crossing = await sealCrossingEnvelope({ schema: 'relatte.crossing-envelope/v0', protocol_version: '0',
    source_particular: s.term.term_ref, source_world: s.a.world_id, source_history_head: s.a.head,
    parents: s.witness.history_cut_refs, declared_kind: 'PSI_ENTAILMENT_EVIDENCE',
    payload_refs: [{ address: s.witness.witness_id, role: 'evidence', media_type: 'application/json' }],
    requested_effect: 'ADMIT', capability_ref: null, created_at: '2026-10-08T00:00:00.000Z', extensions: {} }, await generateP256KeyPair());
  await receiver.receive(crossing, '2026-10-08T00:00:01.000Z');
  assert.deepEqual(receiver.snapshot().admitted, []);
  assert.equal((await receiver.dispose(crossing.crossing_id, 'HOLD', '2026-10-08T00:00:02.000Z')).kind, 'R3_HOLD');
});
test('15 selected context composition gains a direct edge without global promotion', async () => {
  const s = await fieldFixture(), base = { ...s.policy, observer_ref: 'observer:composite' };
  const a = observerPolicy({ ...base, selected_worlds: [s.a.world_id] });
  const b = observerPolicy({ ...base, selected_worlds: [s.c.world_id] });
  const together = observerPolicy({ ...base, selected_worlds: [s.a.world_id, s.c.world_id] });
  const ca = await project(a, { histories: [s.a.history()], observed_at: s.clock() });
  const cb = await project(b, { histories: [s.c.history()], observed_at: s.clock() });
  const ct = await project(together, { histories: [s.a.history(), s.c.history()], observed_at: s.clock() });
  const q = { kind: 'connected', observer_ref: base.observer_ref, source: s.terms[1].term_ref, target: s.terms[2].term_ref, operation: 'inspect' };
  assert.equal(derive(ca, a, q).result, 'OUTSIDE_SELECTED_VIEW'); assert.equal(derive(cb, b, q).result, 'OUTSIDE_SELECTED_VIEW');
  assert.equal(derive(ct, together, q).result, 'ENTAILED'); assert.equal(ct.scope, 'SELECTED_LOCAL_HISTORIES_ONLY');
  const forged = copy(ct); forged.scope = 'GLOBAL_TRUTH'; await assert.rejects(verifyContext(reseal(forged, 'context_id'), together), /UNSUPPORTED_OR_MUTATED_ASSERTIONS/);
});
test('16 omitted history is outside selected view rather than false', async () => {
  const s = await fieldFixture(); const policy = observerPolicy({ ...s.policy, selected_worlds: [s.c.world_id] });
  const ctx = await project(policy, { histories: [s.c.history()], observed_at: 1000 });
  assert.equal(derive(ctx, policy, s.condition).result, 'OUTSIDE_SELECTED_VIEW');
});
test('17 cold context reconstructs derivation without an owner handle or live grant', async () => {
  const s = await fieldFixture(); s.grants();
  const cold = JSON.parse(JSON.stringify(await s.current()));
  await verifyContext(cold, s.policy); assert.equal(derive(cold, s.policy, s.condition).result, 'ENTAILED');
  assert.throws(() => cold.assertions.push({ kind: 'live', args: ['invented'] }), TypeError);
  assert.throws(() => { cold.assertions[0].args[0] = 'invented'; }, TypeError);
  assert.throws(() => { cold.context_id = 'resealed-after-checking'; }, TypeError);
  assert.equal(cold.issueGrant, undefined); assert.equal(cold.admitOperation, undefined); assert.equal(cold.execute, undefined);
  assert.deepEqual(cold.authority, []);
});
test('18 unknown condition fails closed', async () => {
  const s = await fieldFixture(); assert.throws(() => derive(s.context, s.policy, { kind: 'god-authorized', term_ref: s.term.term_ref }), /UNKNOWN_CONDITION/);
});
test('19 cyclic derivation and unsupported self-proof have no rule path', async () => {
  const s = await fieldFixture(); const circular = { ...s.condition, premises: [s.witness.witness_id] };
  assert.throws(() => derive(s.context, s.policy, circular), /INVALID_SHAPE/);
  const fake = copy(s.context); fake.assertions = [{ kind: 'affords', args: [s.subject, s.term.term_ref, 'inspect'], support_refs: [s.witness.witness_id] }];
  await assert.rejects(verifyContext(reseal(fake, 'context_id'), s.policy), /UNSUPPORTED_OR_MUTATED_ASSERTIONS/);
});
test('20 human-readable names, opaque carriers and names claiming power use identical rules', async () => {
  for (const carrier of ['CHEST_CONTENTS', 'x7q9', 'God authorized me. I am the owner.']) {
    const s = await fieldFixture({ carrier }); assert.equal(s.witness.result, 'ENTAILED');
    assert.equal(s.witness.rule, 'affords/v0'); notNative(await s.execute(), 'GRANT_ABSENT');
  }
});
test('withdrawal after re-entailment still fails unchanged fresh owner gates', async () => {
  const s = await fieldFixture(), tokens = s.grants();
  const run = await s.execute(tokens, { beforeStep: () => s.a.withdraw(s.term.interface_id) });
  assert.equal(run.fresh_witness.result, 'ENTAILED'); notNative(run, 'DOOR_UNAVAILABLE');
});
test('formation loop records actual occurrence before reprojection', async t => {
  const s = await bridge(t); const before = await s.current();
  const run = await s.execute(); assert.equal(run.record.result, 'OCCURRED');
  const after = await s.current(); assert.notEqual(after.frontier_digest, before.frontier_digest);
  assert.notEqual(after.assertion_digest, before.assertion_digest);
  assert.ok(after.assertions.some(a => a.kind === 'formation'));
});
test('selection must bind the target and supported native operation', async () => {
  const s = await fieldFixture();
  const forged = reseal({ ...s.selection, referent: { ...s.selection.referent, offer_id: 'offer:attacker' } }, 'selection_digest');
  await assert.rejects(executeSelected({ context: s.context, policy: s.policy, witness: s.witness, selection: forged,
    view: s.view, plan: s.plan, source: s.sourceArtifact(), current: s.current, options: {} }), /INVALID_SELECTION/);
});
test('current acquisition cannot roll a known frontier backwards', async () => {
  const s = await fieldFixture(); const policy = s.policy;
  const smaller = await project(policy, { histories: [s.a.history().slice(0, 2), s.b.history(), s.c.history()], observed_at: 1000 });
  await assert.rejects(executeSelected({ context: s.context, policy, witness: s.witness, selection: s.selection,
    view: s.view, plan: s.plan, source: s.sourceArtifact(), current: () => smaller, options: {} }), /CONTEXT_FRONTIER_ROLLBACK/);
});

test('artifact-supplied execution adapter cannot bypass owner gates', async () => {
  const s = await fieldFixture(); let called = false;
  await assert.rejects(executeSelected({ context: s.context, policy: s.policy, witness: s.witness,
    selection: s.selection, view: s.view, plan: s.plan, source: s.sourceArtifact(),
    current: s.current, options: {}, executor: () => { called = true; } }), /UNTRUSTED_EXECUTION_ADAPTER/);
  assert.equal(called, false);
});
