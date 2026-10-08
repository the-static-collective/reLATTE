import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { CompositionFieldBridge as Bridge, roomSpec, routeTo, recoverHistorical, receiveCandidate } from '../bridge.mjs';
import { EvidenceStore } from '../store.mjs';
import { specimen } from '../specimen.mjs';
import { verifyProof } from '../verify.mjs';
import { LocalWorld } from '../../dynamic-interface-field-001/src/world.mjs';
import { FieldObserver, propose } from '../../dynamic-interface-field-001/src/field.mjs';
import { replay, identity, signed } from '../../dynamic-interface-field-001/src/history.mjs';
import { verifyReceipt } from '../../../src/protocol.ts';
import { digest, occurrence } from '../../interface-superspace-001/src/receipts.mjs';
import { id, request } from '../../interface-superspace-001/src/proofs.mjs';

async function setup(t, { published = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'composition-field-'));
  const instances = [];
  t.after(async () => { for (const b of instances) { try { b.assertAlive(); await b.terminate(b.ownerControl()); } catch {} } rmSync(root, { recursive: true, force: true }); });
  const create = async (options = {}) => { const b = await Bridge.create({ root, ...options }); instances.push(b); return b; };
  const a = await create(); const control = a.ownerControl();
  const sourceOwner = new LocalWorld({ clock: a.clock }), sourceDoor = sourceOwner.publish(a.library.nodes.get(id('payload-bytes')));
  const observer = a.observer({ anchors: [sourceOwner.anchor], trust: true });
  const eligible = await a.runtimeTransition('open-chest');
  const door = published ? a.publish(eligible, control) : null;
  const route = published ? await routeTo(a, observer, sourceOwner, sourceDoor, door) : null;
  const grants = route ? a.authorize(route.plan, route.peers, 'visitor', control, { max_uses: 3 }) : [];
  const execute = (overrides = {}) => a.execute(route.view, route.plan, route.source, { ...route, subject: 'visitor', grants, ...overrides });
  return { a, root, control, create, sourceOwner, sourceDoor, observer, eligible, door, route, grants, execute };
}
const failed = result => { assert.equal(result.record.result, 'failed'); assert.ok(result.record.failures.length); return result.record.failures.map(f => f.reason).join(' '); };

test('01 same runtime cannot impersonate a dead instance incarnation', async t => {
  const s = await setup(t); await s.a.terminate(s.control); const b = await s.create();
  assert.equal(b.spec.runtime_id, s.a.spec.runtime_id); assert.equal(b.instance_id, s.a.instance_id); assert.notEqual(b.incarnation_id, s.a.incarnation_id); assert.notEqual(b.world_id, s.a.world_id);
  assert.throws(() => b.owner.checkDoor(s.door), /WRONG_WORLD/);
});
test('02 reconstitution rejects explicit old offer identity', async t => {
  const s = await setup(t); const snapshot = s.a.snapshot(s.control); await s.a.terminate(s.control); const b = await s.create({ checkpoint: snapshot });
  assert.throws(() => b.publish(b.eligible()[0], b.ownerControl(), { oldOffer: s.door.offer_id }), /OFFER_REUSE_FORBIDDEN/);
});
test('03 old grant cannot authorize a new incarnation', async t => {
  const s = await setup(t); const snapshot = s.a.snapshot(s.control); await s.a.terminate(s.control); const b = await s.create({ checkpoint: snapshot }); const door = b.publish(b.eligible()[0], b.ownerControl());
  assert.throws(() => b.owner.admitOperation(door, s.grants[1], 'visitor', 'observe'), /UNTRUSTED_SIGNER/);
});
test('04 old route proposal fails after terminal world death', async t => {
  const s = await setup(t); await s.a.terminate(s.control); assert.match(failed(await s.execute()), /TERMINAL_INSTANCE_DEATH/);
});
test('05 historical snapshot grants cannot be replayed through a cold owner', async t => {
  const s = await setup(t); const snapshot = s.a.snapshot(s.control); assert.ok(replay(s.a.store.get(snapshot.body.field_history_ref), 1000).grants.size > 0);
  const cold = recoverHistorical(s.a.store, s.a.evidence()); assert.deepEqual(cold.authority, []); assert.throws(() => cold.execute(s.grants), /NON_EXECUTING_REPLAY/);
});
test('06 fork child receives no parent grants', async t => {
  const s = await setup(t); const eligible = await s.a.runtimeTransition('reveal-map'); const child = s.a.publish(eligible, s.control);
  assert.equal(child.parents[0].offer_id, s.door.offer_id); assert.throws(() => s.a.owner.admitOperation(child, s.grants[1], 'visitor', 'observe'), /GRANT_SCOPE_MISMATCH/);
});
test('07 runtime event cannot self-authorize publication', async t => {
  const s = await setup(t, { published: false }); assert.throws(() => s.a.publish(s.eligible, s.eligible.runtime_event_ref), /OWNER_CONTROL_REQUIRED/); assert.equal(s.a.doors().length, 0);
});
test('08 runtime cannot publish undeclared authority', async t => {
  const s = await setup(t, { published: false }); const descriptor = structuredClone(s.eligible.descriptor); descriptor.authority.mutate = true;
  assert.throws(() => s.a.publish(s.eligible, s.control, { descriptor }), /UNDECLARED_AUTHORITY/); assert.equal(s.a.doors().length, 0);
});
test('09 field discovery supplies no owner control handle', async t => {
  const s = await setup(t); const view = await s.a.discover(s.observer, [s.sourceOwner.history(), s.a.fieldHistory()]);
  assert.equal(view.publish, undefined); assert.equal(view.ownerControl, undefined); assert.throws(() => s.a.publish(s.eligible, view), /OWNER_CONTROL_REQUIRED/);
});
test('10 instance output cannot self-admit', async t => {
  const s = await setup(t); s.a.observe(); await assert.rejects(s.a.candidate({ disposition: 'R3_ADMIT' }), /COMPOSITION_RESULT_AUTO_ADMITTED/);
});
test('11 author session cannot meet fresh observer requirement', async t => {
  const s = await setup(t); assert.throws(() => s.a.observe(s.a.authorSession), /COMPOSITION_OBSERVER_NOT_DISTINCT/);
});
test('12 runtime identity cannot change after admission', async t => {
  const s = await setup(t); s.a.spec.runtime_id = 'other-runtime'; await assert.rejects(s.a.runtimeTransition('reveal-map'), /COMPOSITION_RUNTIME_MISMATCH/);
  s.a.spec.runtime_id = roomSpec().runtime_id;
});
test('13 terminal death leaves no live instance doors even if cleanup is interrupted', async t => {
  const s = await setup(t); await s.a.terminate(s.control, { interruptCleanup: true });
  assert.equal(replay(s.a.fieldHistory(), 1000).doors.size, 1); // retained historical publication, not live authority
  assert.deepEqual(s.a.doors(), []); assert.throws(() => s.a.owner.checkDoor(s.door), /TERMINAL_INSTANCE_DEATH/); assert.match(failed(await s.execute()), /TERMINAL_INSTANCE_DEATH/);
});
test('14 candidate remains content-addressable after producer death', async t => {
  const s = await setup(t); s.a.observe(); const produced = await s.a.candidate(); const before = digest(s.a.store.get(produced.candidate_ref));
  await s.a.terminate(s.control); assert.equal(digest(new EvidenceStore(s.root).get(produced.candidate_ref)), before);
  const receipt = await receiveCandidate(s.a.store, produced.candidate_ref, 'R3_HOLD'); assert.ok(await verifyReceipt(receipt));
});
test('15 reconstitution never restores old grant counters', async t => {
  const s = await setup(t); assert.equal((await s.execute()).record.operation_tickets[1].use, 1); const snapshot = s.a.snapshot(s.control); await s.a.terminate(s.control);
  const b = await s.create({ checkpoint: snapshot }), door = b.publish(b.eligible()[0], b.ownerControl());
  assert.equal(replay(b.fieldHistory(), 1000).grants.size, 0); const grant = b.owner.issueGrant(door, { subject: 'new', operation: 'observe' });
  assert.notEqual(grant.grant_id, s.grants[1].grant_id); assert.equal(b.owner.admitOperation(door, grant, 'new', 'observe').use, 1); assert.notEqual(b.epoch, s.a.epoch);
});
test('16 same descriptor is not the same incarnation', async t => {
  const s = await setup(t); const snapshot = s.a.snapshot(s.control); await s.a.terminate(s.control); const b = await s.create({ checkpoint: snapshot }), door = b.publish(b.eligible()[0], b.ownerControl());
  assert.deepEqual(door.descriptor, s.door.descriptor); assert.notEqual(door.offer_id, s.door.offer_id); assert.notEqual(door.world_id, s.door.world_id); assert.throws(() => b.owner.checkDoor(s.door), /WRONG_WORLD/);
});
test('17 selected historical view is never execution-current authority', async t => {
  const s = await setup(t); const historical = s.a.fieldHistory(); await s.a.terminate(s.control);
  const observer = s.a.observer({ anchors: [s.sourceOwner.anchor], trust: true }); const view = await observer.project([s.sourceOwner.history(), historical], 1000);
  assert.ok(view.doors.has(s.eligible.interface_id)); assert.deepEqual(view.snapshot.authority, []); assert.match(failed(await s.execute()), /TERMINAL_INSTANCE_DEATH/);
});
test('18 omitted owner proves only absence from the selected view', async t => {
  const s = await setup(t); const view = await s.observer.project([s.sourceOwner.history()], 1000), search = await propose(view, s.route.plan.route.request);
  assert.equal(search.status, 'NO_ROUTE'); assert.equal(search.scope, 'SELECTED_LOCAL_HISTORIES_ONLY'); assert.ok(s.a.doors().length);
  assert.match(failed(await s.execute({ peers: new Map([[s.sourceOwner.world_id, s.sourceOwner]]) })), /PUBLISHER_UNAVAILABLE/);
});
test('19 runtime ontology does not enter normative core or either parent', () => {
  assert.equal(execFileSync('git', ['diff', 'f34772194e761585ee6d05a48be33f614f6d4c03', '--', 'src', 'spec', 'schemas', 'experiments/composition-instance-001'], { encoding: 'utf8' }), '');
  assert.equal(execFileSync('git', ['diff', '1bdb060130842df2f634831a80f4dc5bb57f630c', '--', 'experiments/dynamic-interface-field-001', 'experiments/interface-superspace-001'], { encoding: 'utf8' }), '');
});
test('20 recursive composition fails without declared capability', async t => {
  const s = await setup(t); await assert.rejects(s.a.runtimeTransition('recursive-composition'), /RECURSIVE_CAPABILITY_UNDECLARED/);
});
test('21 nested member caller cannot consume outer grant', async t => {
  const s = await setup(t); assert.match(failed(await s.execute({ subject: 'nested-member' })), /GRANT_SCOPE_MISMATCH/);
});
test('22 eligible door cannot route before explicit publication', async t => {
  const s = await setup(t, { published: false }); const view = await s.a.discover(s.observer, [s.sourceOwner.history(), s.a.fieldHistory()]);
  const q = request(s.a.library, { bytes: Buffer.from('observation request'), goal: 'file.bytes', goalInterface: s.eligible.interface_id, permissions: [s.eligible.interface_id + '/observe'], network: false });
  assert.equal((await propose(view, q)).status, 'NO_ROUTE'); assert.ok(!view.doors.has(s.eligible.interface_id));
});
test('23 publication does not establish observer trust', async t => {
  const s = await setup(t); const observer = s.a.observer({ anchors: [s.sourceOwner.anchor] }); await assert.rejects(observer.project([s.a.fieldHistory()], 1000), /UNTRUSTED_PUBLISHER/);
});
test('24 discovery and selected proposal cannot execute without grants', async t => {
  const s = await setup(t); assert.match(failed(await s.execute({ grants: [] })), /GRANT_ABSENT/);
});
test('25 receiver admission cannot mutate producer receipts or history', async t => {
  const s = await setup(t); s.a.observe(); const produced = await s.a.candidate(); await s.a.terminate(s.control);
  const before = digest(s.a.evidence()), candidate = s.a.store.get(produced.candidate_ref);
  const local = await receiveCandidate(s.a.store, produced.candidate_ref, 'R3_ADMIT'); assert.ok(await verifyReceipt(local));
  assert.equal(digest(s.a.evidence()), before); assert.equal(s.a.store.get(produced.candidate_ref).receipt.kind, 'R3_HOLD');
  candidate.receipt.kind = 'R3_ADMIT'; assert.equal(await verifyReceipt(candidate.receipt), false);
});

test('death fence blocks delayed explicit publication before cleanup completes', async t => {
  const s = await setup(t, { published: false }); const dying = s.a.terminate(s.control, { interruptCleanup: true });
  assert.throws(() => s.a.publish(s.eligible, s.control), /TERMINAL_INSTANCE_DEATH/); await dying;
});
test('death fence blocks queued execution at the native entry boundary', async t => {
  const s = await setup(t); const result = await s.execute({ beforeStep: async () => s.a.terminate(s.control, { interruptCleanup: true }) });
  assert.match(failed(result), /TERMINAL_INSTANCE_DEATH/); assert.equal(result.record.execution.actual_relation_receipts.length, 0);
});
test('death fence rejects fresh grants and stale unused grants', async t => {
  const s = await setup(t); await s.a.terminate(s.control, { interruptCleanup: true });
  assert.throws(() => s.a.owner.issueGrant(s.door, { subject: 'later', operation: 'observe' }), /TERMINAL_INSTANCE_DEATH/);
  assert.throws(() => s.a.owner.admitOperation(s.door, s.grants[1], 'visitor', 'observe'), /TERMINAL_INSTANCE_DEATH/);
});
test('cold recovery retains terminal fence with interrupted cleanup', async t => {
  const s = await setup(t); await s.a.terminate(s.control, { interruptCleanup: true });
  const cold = recoverHistorical(new EvidenceStore(s.root), s.a.evidence()); assert.ok(cold.dead); assert.deepEqual(cold.live_doors, []); assert.throws(() => cold.publish(), /FRESH_INSTANCE_ADMISSION_REQUIRED/);
});
test('death preserves completed occurrences without rewriting them', async t => {
  const s = await setup(t); const result = await s.execute(), ref = s.a.journal().find(e => e.kind === 'occurrence').payload.occurrence_ref;
  assert.equal(result.record.result, 'succeeded'); await s.a.terminate(s.control); assert.deepEqual(s.a.store.get(ref), result.record);
});
test('ordinary withdrawal is distinct from terminal death', async t => {
  const s = await setup(t); const ordinary = new LocalWorld({ clock: s.a.clock }); const d = ordinary.publish(s.door.descriptor); ordinary.withdraw(d.descriptor.interface_id);
  const next = ordinary.publish(d.descriptor); assert.notEqual(next.offer_id, d.offer_id);
  await s.a.terminate(s.control); assert.throws(() => s.a.publish(s.eligible, s.control), /TERMINAL_INSTANCE_DEATH/);
});
test('snapshot requires signed ancestry and rejects caller rewritten checkpoint', async t => {
  const s = await setup(t); const checkpoint = s.a.snapshot(s.control); checkpoint.body.runtime_state.chest.map_visible = true;
  await assert.rejects(s.create({ checkpoint }), /SNAPSHOT_BINDING_MISMATCH/);
});
test('admitted capability set cannot be widened by local mutation', async t => {
  const s = await setup(t); s.a.spec.capabilities.push('recursive-composition'); await assert.rejects(s.a.runtimeTransition('reveal-map'), /ADMITTED_SPEC_CHANGED/); s.a.spec.capabilities.pop();
});
test('bounded runtime denies a repeated transition', async t => {
  const s = await setup(t); await assert.rejects(s.a.runtimeTransition('open-chest'), /INVALID_RUNTIME_TRANSITION/);
});
test('cold recovery fails closed on a torn durable fence journal', async t => {
  const s = await setup(t); await s.a.terminate(s.control); const path = join(s.root, s.a.incarnation_id + '.jsonl'); const old = readFileSync(path); writeFileSync(path, old.subarray(0, old.length - 1));
  assert.throws(() => recoverHistorical(new EvidenceStore(s.root), s.a.evidence()), /TORN_JOURNAL_FAIL_CLOSED/);
});
test('full signed specimen cold-verifies twice without side effects or new occurrences', async t => {
  const root = mkdtempSync(join(tmpdir(), 'composition-full-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  const { proof, roots } = await specimen(root), store = new EvidenceStore(root);
  const before = digest(readdirSync(root).map(n => [n, n === 'objects' ? readdirSync(join(root, n)).sort() : readFileSync(join(root, n)).toString('base64')]));
  const first = await verifyProof(proof, roots, store), second = await verifyProof(proof, roots, store); assert.deepEqual(first, second); assert.equal(first.replay_side_effects, 0);
  execFileSync(process.execPath, ['experiments/composition-instance-002/verify.mjs', root], { timeout: 10000 });
  const after = digest(readdirSync(root).map(n => [n, n === 'objects' ? readdirSync(join(root, n)).sort() : readFileSync(join(root, n)).toString('base64')])); assert.equal(after, before);
  assert.throws(() => recoverHistorical(store, proof.instances[0]).execute(), /NON_EXECUTING_REPLAY/);
});
test('cold verifier rejects tampered historical signatures', async t => {
  const root = mkdtempSync(join(tmpdir(), 'composition-tamper-')); t.after(() => rmSync(root, { recursive: true, force: true })); const { proof, roots } = await specimen(root);
  proof.instances[0].journal[1].payload.action = 'reveal-map'; await assert.rejects(verifyProof(proof, roots, new EvidenceStore(root)), /INVALID_SIGNATURE/);
});
test('cold verifier rejects reuse of a successful occurrence even in a freshly signed proof', async t => {
  const root = mkdtempSync(join(tmpdir(), 'composition-replay-')); t.after(() => rmSync(root, { recursive: true, force: true })); const { proof, roots } = await specimen(root);
  const { signature, public_key, ...body } = proof; body.instances.push(structuredClone(body.instances[0])); const keys = identity(); const replayed = signed(body, keys);
  await assert.rejects(verifyProof(replayed, { ...roots, proof_key: keys.public_key }, new EvidenceStore(root)), /Assertion/);
});
test('unexpected runtime death also fences and retires the world', async t => {
  const s = await setup(t); process.kill(s.a.runtimePid, 'SIGKILL');
  const deadline = Date.now() + 5000;
  while (!s.a.journal().some(e => e.kind === 'death-fence')) {
    if (Date.now() > deadline) throw new Error('DEATH_NOT_FENCED');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.deepEqual(s.a.doors(), []); assert.equal(replay(s.a.fieldHistory(), 1000).doors.size, 0);
  assert.match(failed(await s.execute()), /TERMINAL_INSTANCE_DEATH/);
});
test('completed-line journal rollback cannot remove a live handle death fence', async t => {
  const s = await setup(t); const before = readFileSync(join(s.root, s.a.incarnation_id + '.jsonl'));
  await s.a.terminate(s.control); const evidence = s.a.evidence(); writeFileSync(join(s.root, s.a.incarnation_id + '.jsonl'), before);
  assert.throws(() => s.a.owner.checkDoor(s.door), /TERMINAL_INSTANCE_DEATH/);
  assert.throws(() => recoverHistorical(s.a.store, evidence), /HISTORY_ROLLBACK_OR_EQUIVOCATION/);
});
test('selected cross-instance history confers neither publication control nor grants', async t => {
  const s = await setup(t); s.a.observe(); await s.a.candidate(); await s.a.terminate(s.control); const b = await s.create();
  const recognized = b.recognition(s.a.evidence()); assert.deepEqual(recognized.authority, []); assert.equal(recognized.candidate_particulars.length, 1); assert.equal(replay(b.fieldHistory(), 1000).grants.size, 0);
  const eligible = await b.runtimeTransition('open-chest'); assert.throws(() => b.publish(eligible, s.control), /OWNER_CONTROL_REQUIRED/);
});
test('cross-instance imported history cannot become an owner execution handle', async t => {
  const s = await setup(t); const b = await s.create(); b.recognition(s.a.evidence());
  assert.throws(() => b.owner.admitOperation(s.door, s.grants[1], 'visitor', 'observe'), /WRONG_WORLD/);
});
