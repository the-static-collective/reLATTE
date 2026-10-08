import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fieldFixture, bridgeFixture, surface } from './fixture.mjs';
import { observerPolicy, project, derive } from './membrane.mjs';
import { select, executeSelected } from './execution.mjs';
import { propose } from '../dynamic-interface-field-001/src/field.mjs';
import { authorize } from '../dynamic-interface-field-001/src/runtime.mjs';
import { identity, signed } from '../dynamic-interface-field-001/src/history.mjs';
import { EvidenceStore } from '../composition-instance-002/store.mjs';
import { digest, occurrence, byteDigest } from '../interface-superspace-001/src/receipts.mjs';
import { generateP256KeyPair, sealCrossingEnvelope } from '../../src/protocol.ts';
import { LocalReceiver } from '../../src/receiver.ts';

export const PARENT = '21e7d7a7413507b3b9301354f51f7f98d89d2eee';

export async function prove(root) {
  mkdirSync(root, { recursive: true });
  const store = new EvidenceStore(root), contexts = new Map(), policies = new Map(), witnesses = new Map();
  const occurrences = [], histories = new Map(), journals = new Map();
  const retain = (context, policy, witness = null) => {
    policies.set(policy.policy_id, policy);
    contexts.set(context.context_id, { context_id: context.context_id, ref: store.put(context), policy_id: policy.policy_id });
    if (witness) witnesses.set(witness.witness_id, witness);
    return context.context_id;
  };
  const ask = (ctx, p, q) => { const w = derive(ctx, p, q); retain(ctx, p, w); return w; };
  const retainRun = (label, s, run, { context = s.context, witness = s.witness, selection = s.selection, plan = s.plan ?? s.route.plan } = {}) => {
    retain(context, s.policy, witness); retain(run.fresh_context, s.policy, run.fresh_witness);
    occurrences.push({ label, context_id: context.context_id, witness_id: witness.witness_id,
      policy_id: s.policy.policy_id, selection, plan, fresh_context_id: run.fresh_context.context_id,
      fresh_witness_id: run.fresh_witness.witness_id, record: run.record });
    return run.record.occurrence_id;
  };
  const finishField = s => { for (const world of s.peers.values()) histories.set(world.world_id, { anchor: world.anchor, events: world.history() }); };

  const timing = await fieldFixture();
  retain(timing.context, timing.policy, timing.witness);
  const immediate = retainRun('immediate', timing, await timing.execute(timing.grants()));
  const delayedTokens = timing.grants();
  timing.time.value++; // tau: independently owned field transition during delay
  timing.a.withdraw(timing.term.interface_id);
  const delayed = retainRun('delayed-withdrawal', timing, await timing.execute(delayedTokens));
  const withdrawnContext = await timing.current(), withdrawn = ask(withdrawnContext, timing.policy, timing.condition);
  const oldDoor = timing.path.doors[0];
  const nextDoor = timing.a.publish(oldDoor.descriptor, { kind: 'reconstitute',
    parents: [{ world_id: timing.a.world_id, offer_id: oldDoor.offer_id }] });
  const reconstituted = retainRun('same-carrier-new-offer', timing, await timing.execute(delayedTokens));
  finishField(timing);

  const live = await bridgeFixture(join(root, 'runtime-evidence'));
  let death;
  try {
    const before = await live.current(); retain(before, live.policy, derive(before, live.policy, live.condition));
    const immediate = retainRun('bridge-immediate', live, await live.execute());
    const afterOccurrence = await live.current(); retain(afterOccurrence, live.policy, derive(afterOccurrence, live.policy, live.condition));
    await live.bridge.terminate(live.bridge.ownerControl(), { interruptCleanup: true });
    const delayed = retainRun('delayed-terminal-death', live, await live.execute());
    const deadContext = await live.current(), dead = ask(deadContext, live.policy, live.condition);
    death = { immediate, delayed, before: before.context_id, after_occurrence: afterOccurrence.context_id,
      dead_context: deadContext.context_id, dead_witness: dead.witness_id,
      old_witness: live.witness.witness_id, incarnation_id: live.bridge.incarnation_id };
    histories.set(live.sourceOwner.world_id, { anchor: live.sourceOwner.anchor, events: live.sourceOwner.history() });
    histories.set(live.bridge.world_id, { anchor: live.bridge.anchor, events: live.bridge.fieldHistory() });
    journals.set(live.bridge.incarnation_id, { binding: live.policy.incarnations[0], events: live.bridge.journal() });
  } finally {
    try { live.bridge.assertAlive(); await live.bridge.terminate(live.bridge.ownerControl()); } catch {}
  }

  const a = await fieldFixture(), b = await fieldFixture();
  const old = a.path.doors[0]; a.a.withdraw(a.term.interface_id);
  const fresh = a.a.publish(old.descriptor, { kind: 'reconstitute', parents: [{ world_id: a.a.world_id, offer_id: old.offer_id }] });
  a.active.set(a.term.interface_id, fresh);
  for (const r of a.path.relations) { a.a.withdrawRelation(r.descriptor.relation_id); a.publishEdge(a.a, r.descriptor); }
  const ca = await a.current(), wa = ask(ca, a.policy, a.condition);
  const va = await a.project(), pa = (await propose(va, a.query('file.bytes'))).plans[0];
  const sa = await select(ca, a.policy, wa, va, pa);
  const ra = await executeSelected({ context: ca, policy: a.policy, witness: wa, selection: sa,
    view: va, plan: pa, source: a.sourceArtifact(), current: a.current,
    options: { peers: a.peers, subject: a.subject, grants: authorize(pa, a.peers, a.subject) } });
  const rb = await b.execute(b.grants());
  const oa = retainRun('same-surface-reconstituted', a, ra, { context: ca, witness: wa, selection: sa, plan: pa });
  const ob = retainRun('same-surface-never-withdrawn', b, rb);

  async function crossResult(s, ctx, w, run) {
    const native = run.record.owner_occurrence.execution.particulars.at(-1);
    const crossing = await sealCrossingEnvelope({ schema: 'relatte.crossing-envelope/v0', protocol_version: '0',
      source_particular: native.particular_id, source_world: s.a.world_id, source_history_head: s.a.head,
      parents: [w.witness_id, ...w.history_cut_refs], declared_kind: 'PSI_NATIVE_OBSERVATION',
      payload_refs: [{ address: byteDigest(s.bytes), role: 'candidate', media_type: 'application/octet-stream' }],
      requested_effect: null, capability_ref: null, return_address: null,
      created_at: '2026-10-08T00:00:00.000Z',
      extensions: { psi_membrane_001: { context_id: ctx.context_id, witness_id: w.witness_id,
        occurrence_digest: run.record.occurrence_digest } } }, await generateP256KeyPair());
    const privateRoot = mkdtempSync(join(tmpdir(), 'psi-recipient-'));
    try {
      const receiver = await LocalReceiver.create(join(privateRoot, 'node'), { world_id: occurrence('receiver-world'),
        receiver_particular: occurrence('receiver'), contract_ref: 'contract:psi-independent-hold' });
      const received = await receiver.receive(crossing, '2026-10-08T00:00:01.000Z');
      const disposition = await receiver.dispose(crossing.crossing_id, 'HOLD', '2026-10-08T00:00:02.000Z');
      return { crossing, received, disposition, occurrence_id: run.record.occurrence_id };
    } finally { rmSync(privateRoot, { recursive: true, force: true }); }
  }
  const crossings = [await crossResult(a, ca, wa, ra), await crossResult(b, b.context, b.witness, rb)];
  finishField(a); finishField(b);

  const graph = await fieldFixture();
  const connected = (from, to, observer_ref = graph.subject) => ({ kind: 'connected', observer_ref,
    source: graph.terms[from].term_ref, target: graph.terms[to].term_ref, operation: 'inspect' });
  const edgeWitnesses = [ask(graph.context, graph.policy, connected(0, 1)),
    ask(graph.context, graph.policy, connected(1, 2)), ask(graph.context, graph.policy, connected(1, 0)),
    ask(graph.context, graph.policy, connected(0, 2))];
  const p1 = observerPolicy({ ...graph.policy, observer_ref: 'observer:O1', selected_worlds: [graph.a.world_id] });
  const p2 = observerPolicy({ ...graph.policy, observer_ref: 'observer:O2', selected_worlds: [graph.c.world_id] });
  const p12 = observerPolicy({ ...graph.policy, observer_ref: 'observer:O12', selected_worlds: [graph.a.world_id, graph.c.world_id] });
  const c1 = await project(p1, { histories: [graph.a.history()], observed_at: graph.clock() });
  const c2 = await project(p2, { histories: [graph.c.history()], observed_at: graph.clock() });
  const c12 = await project(p12, { histories: [graph.a.history(), graph.c.history()], observed_at: graph.clock() });
  const afford = (p, term) => ({ kind: 'affords', observer_ref: p.observer_ref, term_ref: term.term_ref, operation: 'inspect' });
  const first = [ask(c1, p1, afford(p1, graph.terms[1])), ask(c1, p1, afford(p1, graph.terms[2]))];
  const second = [ask(c2, p2, afford(p2, graph.terms[1])), ask(c2, p2, afford(p2, graph.terms[2]))];
  const composite = [ask(c1, p1, connected(1, 2, p1.observer_ref)), ask(c2, p2, connected(1, 2, p2.observer_ref)),
    ask(c12, p12, connected(1, 2, p12.observer_ref))];
  finishField(graph);

  const keys = identity();
  const roots = { proof_key: keys.public_key, fields: [...histories.values()].map(h => h.anchor),
    ledgers: [...journals.values()].map(j => j.binding.ledger_anchor), scope: 'EXPLICIT_SPECIMEN_TRUST_INPUTS_ONLY' };
  const proof = signed({ schema: 'relatte.psi-membrane-proof.experimental/v0', parent: PARENT,
    policies: [...policies.values()], contexts: [...contexts.values()], witnesses: [...witnesses.values()],
    occurrences, histories: [...histories.values()], journals: [...journals.values()], crossings,
    cases: {
      timing: { immediate, delayed, old_witness: timing.witness.witness_id, withdrawn_witness: withdrawn.witness_id,
        reconstituted, old_offer: oldDoor.offer_id, fresh_offer: nextDoor.offer_id }, death,
      same_surface: { a: ca.context_id, b: b.context.context_id, a_policy: a.policy.policy_id, b_policy: b.policy.policy_id,
        a_witness: wa.witness_id, b_witness: b.witness.witness_id, surfaces: [surface(ca, a.policy), surface(b.context, b.policy)], occurrences: [oa, ob] },
      connectivity: edgeWitnesses.map(w => w.witness_id),
      composition: { first: first.map(w => w.witness_id), second: second.map(w => w.witness_id), composite: composite.map(w => w.witness_id) },
    }, normative_core_mutations: 0, live_authority_restored: 0 }, keys);
  writeFileSync(join(root, 'proof.json'), JSON.stringify(proof, null, 2) + '\n');
  writeFileSync(join(root, 'roots.json'), JSON.stringify(roots, null, 2) + '\n');
  return { proof, roots, store };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(process.argv[2] ?? 'work/psi-membrane-001');
  const { proof } = await prove(root);
  console.log(JSON.stringify({ proof: join(root, 'proof.json'), contexts: proof.contexts.length,
    witnesses: proof.witnesses.length, occurrences: proof.occurrences.length }));
}
