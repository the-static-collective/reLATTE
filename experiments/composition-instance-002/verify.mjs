// Cold verifier: never creates a runtime or owner, and never invokes execution.
// It reconstructs history using the parents' existing verification functions.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { EvidenceStore, verifyJournal } from './store.mjs';
import { verifySigned, verifyHistory, replay } from '../dynamic-interface-field-001/src/history.mjs';
import { FieldObserver, verifyProposal } from '../dynamic-interface-field-001/src/field.mjs';
import { verifyDynamic } from '../dynamic-interface-field-001/src/runtime.mjs';
import { loadRegistry } from '../interface-superspace-001/src/registry.mjs';
import { digest, byteDigest } from '../interface-superspace-001/src/receipts.mjs';
import { verifyCrossingEnvelope, verifyReceipt } from '../../src/protocol.ts';
import { compositionInstanceId } from '../composition-instance-001/contract.ts';
import { initialState, transition, eligibleSemantic, RUNTIME_ID, observationFor } from './room-state.mjs';

export async function verifyProof(proof, roots, store, { checkCore = true } = {}) {
  verifySigned(proof, roots.proof_key);
  assert.equal(proof.schema, 'relatte.composition-instance-002-proof.experimental/v0');
  assert.equal(proof.normative_core_mutations, 0);
  if (checkCore) assert.equal(execFileSync('git', ['diff', proof.parents.composition, '--', 'src', 'spec', 'schemas'], { encoding: 'utf8' }), '');
  const library = await loadRegistry(), histories = new Map(), ledgers = new Map(), offers = new Set(), epochs = new Set(), incarnations = new Set(), seenTickets = new Set(), uses = new Map();
  const anchored = (a, anchors) => assert.ok(anchors.some(root => digest(a) === digest(root)), 'EXPLICIT_ROOT_REQUIRED');
  anchored(proof.source_anchor, roots.fields); verifyHistory(proof.source_history, proof.source_anchor); histories.set(proof.source_anchor.world_id, proof.source_history);
  for (const i of proof.instances) {
    anchored(i.ledger_anchor, roots.ledgers); anchored(i.field_anchor, roots.fields);
    assert.equal(i.world_id, i.field_anchor.world_id);
    const verified = verifyJournal(i.journal, i.ledger_anchor);
    assert.ok(verified.dead); assert.deepEqual(store.journal(i.incarnation_id), i.journal);
    assert.ok(!incarnations.has(i.incarnation_id)); incarnations.add(i.incarnation_id);
    assert.ok(!epochs.has(i.epoch)); epochs.add(i.epoch);
    verifyHistory(i.field_history, i.field_anchor); replay(i.field_history, i.field_history.at(-1).at_ms);
    assert.ok(!histories.has(i.world_id)); histories.set(i.world_id, i.field_history); ledgers.set(i.world_id, i);
    for (const e of i.field_history.filter(e => ['publish', 'fork-door', 'reconstitute', 'relation-publish'].includes(e.kind))) { assert.ok(!offers.has(e.payload.offer_id), 'OFFER_REUSE'); offers.add(e.payload.offer_id); }
  }
  let successes = 0, denials = 0, runtimeEvents = 0, publications = 0, candidates = 0;
  const knownRuntimeEvents = new Map(), knownCandidates = new Set();
  for (const i of proof.instances) {
    const admission = i.journal[0].payload, spec = JSON.parse(Buffer.from(admission.spec_bytes_base64, 'base64')), launch = store.get(admission.launch_ref);
    assert.deepEqual(store.get(admission.spec_ref), spec); assert.equal(compositionInstanceId(spec), i.instance_id); assert.equal(admission.instance_id, i.instance_id);
    assert.equal(admission.world_id, i.world_id); assert.equal(admission.epoch, i.epoch); assert.equal(spec.runtime_id, RUNTIME_ID);
    assert.equal(new Set([i.instance_id, i.incarnation_id, i.world_id, spec.runtime_id, i.epoch]).size, 5);
    assert.ok(await verifyCrossingEnvelope(launch.crossing)); assert.ok(await verifyReceipt(launch.receipt));
    assert.equal(launch.receipt.crossing_id, launch.crossing.crossing_id); assert.equal(launch.receipt.kind, 'R3_ADMIT');
    assert.equal(launch.crossing.payload_refs[0].address, byteDigest(Buffer.from(JSON.stringify(spec))));
    assert.equal(launch.crossing.source_particular, 'particular:' + i.instance_id);
    let state = initialState();
    const eligible = new Map(), published = new Map(), views = new Map(), selected = new Set(), runtimeObservations = new Map();
    if (admission.parent) {
      const parent = ledgers.get(admission.parent.world_id); assert.ok(parent); assert.notEqual(parent.world_id, i.world_id); assert.notEqual(parent.incarnation_id, i.incarnation_id); assert.notEqual(parent.epoch, i.epoch);
      const snapshot = store.get(admission.parent.snapshot_ref);
      assert.ok(parent.journal.some(e => e.kind === 'snapshot' && e.payload.snapshot_ref === admission.parent.snapshot_ref));
      assert.equal(snapshot.world_id, parent.world_id); state = snapshot.runtime_state;
      for (const e of snapshot.eligible) { assert.ok(knownRuntimeEvents.has(e.runtime_event_ref)); eligible.set(e.interface_id, e); }
    }
    for (const e of i.journal.slice(1)) {
      const p = e.payload;
      switch (e.kind) {
        case 'runtime-event':
          assert.equal(p.runtime_id, spec.runtime_id); assert.deepEqual(p.before, state); assert.deepEqual(p.after, transition(state, p.action));
          state = p.after; knownRuntimeEvents.set(digest(e), e); runtimeEvents++; break;
        case 'eligible-interface': {
          const cause = knownRuntimeEvents.get(p.runtime_event_ref); assert.ok(cause);
          assert.equal(cause.incarnation_id, i.incarnation_id); assert.equal(p.semantic, eligibleSemantic(cause.payload.action));
          assert.ok(!eligible.has(p.interface_id)); assert.equal(p.descriptor.interface_id, p.interface_id); assert.equal(p.descriptor.participant_ref, i.instance_id);
          assert.equal(p.parent_interface, cause.payload.action === 'reveal-map' ? [...eligible.keys()][0] : null);
          eligible.set(p.interface_id, p); break;
        }
        case 'explicit-publication': {
          const particular = eligible.get(p.interface_id); assert.ok(particular); assert.equal(p.eligible_ref, digest(particular)); assert.equal(p.runtime_event_ref, particular.runtime_event_ref);
          assert.equal(p.world_id, i.world_id); assert.equal(p.epoch, i.epoch); assert.ok(!published.has(p.interface_id)); assert.equal(new Set([i.instance_id, spec.runtime_id, i.world_id, p.interface_id, p.offer_id]).size, 5);
          const event = i.field_history.find(h => digest(h) === p.field_event_ref); assert.ok(event); assert.equal(event.kind, 'publish'); assert.equal(event.payload.offer_id, p.offer_id); assert.deepEqual(event.payload.descriptor, particular.descriptor); assert.deepEqual(event.payload.parents, p.parents);
          if (particular.parent_interface) assert.ok(p.parents.some(parent => parent.offer_id === published.get(particular.parent_interface)?.offer_id));
          if (admission.parent) { const previous = store.get(admission.parent.snapshot_ref).doors.find(d => d.descriptor.interface_id === p.interface_id); assert.ok(previous); assert.ok(p.parents.some(parent => parent.offer_id === previous.offer_id && parent.world_id === previous.world_id)); assert.notEqual(p.offer_id, previous.offer_id); }
          published.set(p.interface_id, p); publications++; break;
        }
        case 'discovery': {
          const selectedHistories = store.get(p.histories_ref);
          for (const h of selectedHistories) { const complete = histories.get(h[0].world_id); assert.ok(complete); assert.deepEqual(h, complete.slice(0, h.length)); }
          const observer = new FieldObserver({ anchors: roots.fields, surfaces: library.surfaces, contracts: library.contracts });
          const view = await observer.project(selectedHistories, p.snapshot.observed_at); assert.deepEqual(view.snapshot, p.snapshot); assert.deepEqual(view.snapshot.authority, []);
          for (const d of view.doors.values()) if (d.world_id === i.world_id) assert.equal(published.get(d.descriptor.interface_id)?.offer_id, d.offer_id);
          views.set(p.snapshot.view_digest, view); break;
        }
        case 'selection': {
          const plan = store.get(p.plan_ref), view = views.get(plan.view_digest); assert.ok(view); await verifyProposal(view, plan); assert.equal(p.plan_digest, plan.field_plan_digest); selected.add(p.plan_digest); break;
        }
        case 'authorization': {
          assert.ok(selected.has(p.plan_digest)); assert.equal(p.epoch, i.epoch);
          for (const grant of store.get(p.grants_ref)) { const h = histories.get(grant.world_id); assert.ok(h?.some(e => e.kind === 'grant' && digest(e.payload) === digest(grant))); if (grant.world_id === i.world_id) assert.equal(published.get(grant.interface_id)?.offer_id, grant.offer_id); }
          break;
        }
        case 'runtime-observation': {
          assert.deepEqual(p.before, state); const after = structuredClone(state); after.observations++;
          assert.deepEqual(p.after, after); assert.ok(after.observations <= 8); assert.equal(published.get(p.interface_id)?.offer_id, p.offer_id);
          const meaning = eligible.get(p.interface_id).semantic; assert.ok(state.chest.open); if (meaning === 'MAP-FRAGMENT-OBSERVATION-DOOR') assert.ok(state.chest.map_visible);
          assert.deepEqual(p.observation, observationFor(p.after, meaning)); state = p.after; runtimeObservations.set(digest(e), e); break;
        }
        case 'occurrence': case 'denial': {
          const plan = store.get(p.plan_ref), record = store.get(p.occurrence_ref), saved = store.get(p.view_ref), view = views.get(plan.view_digest);
          assert.ok(view); assert.deepEqual(view.snapshot, saved.snapshot); assert.deepEqual(saved.histories, store.get(i.journal.find(e => e.kind === 'discovery' && e.payload.snapshot.view_digest === plan.view_digest).payload.histories_ref));
          await verifyProposal(view, plan); verifyDynamic(plan, record, roots.fields);
          if (e.kind === 'denial') { assert.equal(record.result, 'failed'); assert.ok(record.failures.some(f => f.reason.includes('TERMINAL_INSTANCE_DEATH'))); }
          for (const t of record.operation_tickets) {
            assert.ok(!seenTickets.has(t.ticket_id)); seenTickets.add(t.ticket_id);
            const h = histories.get(t.world_id), position = h.findIndex(e => digest(e) === t.head); assert.ok(position >= 0);
            const at = replay(h.slice(0, position + 1), t.at_ms), grant = at.grants.get(t.grant_id), door = at.doors.get(t.interface_id);
            assert.ok(grant && door); assert.equal(grant.offer_id, t.offer_id); assert.equal(door.offer_id, t.offer_id); assert.equal(grant.subject, t.subject); assert.equal(grant.operation, t.operation); assert.equal(grant.permission, t.permission); assert.ok(!at.revoked.has(t.grant_id)); assert.ok(grant.expires_at > t.at_ms);
            const used = (uses.get(t.grant_id) ?? 0) + 1; assert.equal(t.use, used); assert.ok(used <= grant.max_uses); uses.set(t.grant_id, used);
          }
          for (const r of record.execution?.actual_relation_receipts ?? []) {
            const native = r.evidence.native, observed = runtimeObservations.get(native.runtime_observation_ref); assert.ok(observed); assert.match(r.native_ref, /^fs:dev:/); assert.equal(native.regular_file, true); assert.equal(native.filesystem_content_sha256, r.output_digest.slice(7)); assert.equal(native.state_digest, digest(observed.payload.after)); assert.deepEqual(native.observation, observed.payload.observation);
          }
          record.result === 'succeeded' ? successes++ : denials++; break;
        }
        case 'observer':
          assert.notEqual(p.author_session_id, p.observer_session_id); assert.deepEqual(store.get(p.observed_state_ref), state); assert.equal(p.observed_state_sha256, p.observed_state_ref.slice(7));
          assert.deepEqual(store.get(p.action_trace_ref), i.journal.slice(0, e.seq).filter(e => e.kind.startsWith('runtime-'))); break;
        case 'snapshot': {
          const snapshot = store.get(p.snapshot_ref); assert.equal(snapshot.instance_id, i.instance_id); assert.equal(snapshot.incarnation_id, i.incarnation_id); assert.equal(snapshot.world_id, i.world_id); assert.equal(snapshot.epoch, i.epoch); assert.deepEqual(snapshot.spec, spec); assert.deepEqual(snapshot.runtime_state, state); assert.deepEqual(store.get(snapshot.runtime_snapshot_ref), state);
          assert.deepEqual(store.get(snapshot.trace_ref), i.journal.slice(0, e.seq)); assert.deepEqual(snapshot.live_authority, []); assert.deepEqual(snapshot.grant_counters, []); assert.equal(snapshot.authorization_history, 'EVIDENCE_ONLY'); assert.deepEqual(snapshot.governing_snapshot, spec.governing_snapshot);
          const field = store.get(snapshot.field_history_ref); assert.deepEqual(field, i.field_history.slice(0, field.length)); assert.equal(digest(field.at(-1)), snapshot.owner_frontier); assert.deepEqual([...replay(field, field.at(-1).at_ms).doors.values()], snapshot.doors); assert.deepEqual(snapshot.eligible, [...eligible.values()]);
          assert.equal(snapshot.candidate_ancestry.launch_crossing_id, launch.crossing.crossing_id);
          if (snapshot.observer_evidence) assert.ok(i.journal.slice(0, e.seq).some(e => e.kind === 'observer' && digest(e.payload) === digest(snapshot.observer_evidence))); break;
        }
        case 'candidate': {
          const c = store.get(p.candidate_ref), result = store.get(c.result_ref), bytes = Buffer.from(store.get(c.content_ref).bytes_base64, 'base64');
          assert.deepEqual(c.result, result); assert.deepEqual(JSON.parse(Buffer.from(c.result_bytes_base64, 'base64')), result); assert.equal(c.particular_id, p.particular_id); assert.equal(c.crossing.source_particular, c.particular_id); assert.equal(c.producer_world, i.world_id); assert.equal(c.producer_incarnation, i.incarnation_id);
          assert.equal(result.candidate_content_sha256, byteDigest(bytes).slice(7)); assert.equal(result.candidate_byte_length, bytes.length); assert.deepEqual(JSON.parse(bytes), state); assert.equal(result.result_disposition, 'R3_HOLD');
          assert.notEqual(result.author_session_id, result.observer_session_id); assert.ok(i.journal.slice(0, e.seq).some(e => e.kind === 'observer' && e.payload.observer_session_id === result.observer_session_id));
          const observerEvidence = i.journal.slice(0, e.seq).find(e => e.kind === 'observer' && e.payload.observer_session_id === result.observer_session_id)?.payload; assert.ok(observerEvidence);
          for (const key of ['observed_state_ref', 'observed_state_sha256', 'action_trace_ref', 'author_session_id', 'observer_session_id']) assert.equal(result[key], observerEvidence[key]);
          assert.equal(result.runtime_id, spec.runtime_id); assert.equal(result.instance_id, i.instance_id); assert.deepEqual(c.crossing.parents, [launch.crossing.crossing_id]); assert.equal(c.crossing.payload_refs[0].address, byteDigest(Buffer.from(c.result_bytes_base64, 'base64')));
          assert.ok(await verifyCrossingEnvelope(c.crossing)); assert.ok(await verifyReceipt(c.receipt)); assert.equal(c.receipt.crossing_id, c.crossing.crossing_id); assert.equal(c.receipt.kind, 'R3_HOLD'); assert.ok(!offers.has(c.particular_id)); assert.notEqual(c.particular_id, i.instance_id); assert.notEqual(c.particular_id, i.world_id); knownCandidates.add(p.candidate_ref); candidates++; break;
        }
        case 'death-fence':
          assert.equal(p.world_id, i.world_id); assert.equal(p.epoch, i.epoch); assert.deepEqual([...p.retirement].sort(), [...published.values()].map(p => p.offer_id).sort()); break;
        case 'terminated': assert.equal(p.signal, 'SIGKILL'); break;
        case 'cleanup': {
          const h = store.get(p.field_history_ref); assert.deepEqual(h, i.field_history); const current = replay(h, h.at(-1).at_ms); assert.equal(current.doors.size, 0); assert.equal(current.relations.size, 0); break;
        }
        case 'reconstitution': assert.deepEqual(p.restored_grants, []); assert.deepEqual(p.restored_counters, []); assert.equal(p.historical_authority, 'EVIDENCE_ONLY'); break;
        case 'recognition': {
          assert.equal(p.observer_instance, i.incarnation_id); assert.equal(p.same_live_authority, false); assert.deepEqual(p.authority, []); const historical = ledgers.get(p.historical_world); assert.ok(historical); assert.deepEqual(p.parent, historical.journal[0].payload.parent); break;
        }
        default: throw new Error('UNKNOWN_BRIDGE_EVENT:' + e.kind);
      }
    }
    // Every field publication must be explicitly evidenced by the removable bridge.
    assert.equal(i.field_history.filter(e => e.kind === 'publish').length, published.size);
  }
  assert.equal(successes, 3); assert.equal(denials, 2); assert.equal(runtimeEvents, 2); assert.equal(publications, 4); assert.equal(candidates, 1);
  assert.ok(knownCandidates.has(proof.produced.candidate_ref)); assert.deepEqual(store.get(proof.produced.candidate_ref), proof.produced.candidate);
  for (const receipt of proof.candidate_receipts) { assert.ok(await verifyReceipt(receipt)); assert.equal(receipt.crossing_id, proof.produced.candidate.crossing.crossing_id); assert.equal(receipt.extensions.candidate_ref, proof.produced.candidate_ref); }
  assert.deepEqual(proof.candidate_receipts.map(r => r.kind), ['R3_HOLD', 'R3_REFUSE', 'R3_ADMIT']);
  assert.deepEqual(proof.checkpoint.body, store.get(proof.checkpoint.snapshot_ref));
  const prefix = store.get(proof.historical_prefix_ref), producer = ledgers.get(prefix.world_id); assert.ok(producer);
  assert.deepEqual(prefix.journal, producer.journal.slice(0, prefix.journal.length)); assert.deepEqual(prefix.field_history, producer.field_history.slice(0, prefix.field_history.length));
  assert.deepEqual(proof.recognition, proof.instances.flatMap(i => i.journal.filter(e => e.kind === 'recognition').map(e => e.payload)));
  assert.ok(proof.candidate_receipts.every(r => r.world_id !== proof.produced.candidate.receipt.world_id));
  return { successful_routes: successes, stale_or_historical_denials: denials, runtime_transitions: runtimeEvents, explicit_publications: publications, surviving_candidates: candidates, signed_owner_tickets: seenTickets.size, live_authority_restored: 0, replay_side_effects: 0, normative_core_mutations: 0 };
}
if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const root = resolve(process.argv[2] ?? 'work/composition-instance-002');
  console.log(JSON.stringify(await verifyProof(JSON.parse(readFileSync(resolve(root, 'proof.json'))), JSON.parse(readFileSync(resolve(root, 'roots.json'))), new EvidenceStore(root))));
}
