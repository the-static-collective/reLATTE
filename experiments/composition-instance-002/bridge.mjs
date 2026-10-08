import { join } from 'node:path';
import { observeFilesystem } from '../polyglot-crossing-001/filesystem-adapter.ts';
import { generateP256KeyPair, sealReceipt, verifyCrossingEnvelope, verifyReceipt } from '../../src/protocol.ts';
import { makeCompositionInstanceSpec, openCompositionInstance, finalizeCompositionInstance } from '../composition-instance-001/contract.ts';
import { LocalWorld } from '../dynamic-interface-field-001/src/world.mjs';
import { identity, clone, signed } from '../dynamic-interface-field-001/src/history.mjs';
import { FieldObserver, propose } from '../dynamic-interface-field-001/src/field.mjs';
import { authorize, executeDynamic } from '../dynamic-interface-field-001/src/runtime.mjs';
import { loadRegistry } from '../interface-superspace-001/src/registry.mjs';
import { request, id } from '../interface-superspace-001/src/proofs.mjs';
import { digest, occurrence, byteDigest } from '../interface-superspace-001/src/receipts.mjs';
import { EvidenceStore, appendSigned, verifyJournal } from './store.mjs';
import { RoomRuntime } from './runtime.mjs';
import { initialState, RUNTIME_ID, eligibleSemantic, transition } from './room-state.mjs';

export const PARENTS = { composition: 'f34772194e761585ee6d05a48be33f614f6d4c03', field: '1bdb060130842df2f634831a80f4dc5bb57f630c' };
export function roomSpec() {
  return makeCompositionInstanceSpec({ runtime_id: RUNTIME_ID, base_snapshot_ref: digest(initialState()), goal: 'open chest, observe contents, reveal map', capabilities: ['compose', 'observe', 'publish-observation'], limits: { runtime_actions: 2, observations: 8, network: 'none', memory_mb: 32 }, observer_mode: 'fresh-read-only-process', requested_output_class: 'bounded-room-state', normative_src_tree: 'c0e4d2c59481e0fb2a4bf4bb294f373907fd2b76' });
}
// This object is the only owner handle exposed to the field executor. The raw
// LocalWorld and the bridge publication capability never enter runtime/discovery.
class FencedOwner {
  #bridge; #owner;
  constructor(bridge, owner) { this.#bridge = bridge; this.#owner = owner; }
  get world_id() { return this.#owner.world_id; }
  get anchor() { return this.#owner.anchor; }
  checkDoor(...args) { this.#bridge.assertAlive(); return this.#owner.checkDoor(...args); }
  checkRelation(...args) { this.#bridge.assertAlive(); return this.#owner.checkRelation(...args); }
  issueGrant(...args) { this.#bridge.assertAlive(); return this.#owner.issueGrant(...args); }
  admitOperation(...args) { this.#bridge.assertAlive(); return this.#owner.admitOperation(...args); }
}
export class CompositionFieldBridge {
  #world; #keys; #runtime; #control = Object.freeze({}); #eligible = new Map(); #offers = new Map(); #busy = false; #opened; #ancestry = []; #observerEvidence = null; #frontier = null; #terminal = false;
  static async create({ root, spec = roomSpec(), checkpoint = null, clock = () => 1000 } = {}) {
    const bridge = new CompositionFieldBridge();
    bridge.store = new EvidenceStore(root);
    if (checkpoint) {
      const prior = bridge.store.journal(checkpoint.incarnation_id);
      verifyJournal(prior, checkpoint.ledger_anchor);
      if (!prior.some(e => e.kind === 'snapshot' && e.payload.snapshot_ref === checkpoint.snapshot_ref)) throw new Error('UNATTESTED_SNAPSHOT');
      const snapshot = bridge.store.get(checkpoint.snapshot_ref);
      if (digest(snapshot) !== digest(checkpoint.body) || snapshot.world_id !== checkpoint.world_id) throw new Error('SNAPSHOT_BINDING_MISMATCH');
    }
    bridge.spec = clone(spec); bridge.incarnation_id = occurrence('incarnation'); bridge.epoch = occurrence('epoch'); bridge.clock = clock;
    bridge.#keys = identity(); bridge.anchor = { world_id: bridge.#keys.world_id, public_key: bridge.#keys.public_key };
    bridge.#world = new LocalWorld({ clock });
    // Ledger signer is independently anchored; field identity remains the LocalWorld identity.
    bridge.ledger_anchor = bridge.anchor; bridge.world_id = bridge.#world.world_id; bridge.anchor = bridge.#world.anchor;
    bridge.#opened = await openCompositionInstance({ spec: bridge.spec, signer: await generateP256KeyPair(), receiver: await generateP256KeyPair(), hop_index: 40 });
    bridge.instance_id = bridge.#opened.instance_id;
    bridge.library = await loadRegistry();
    bridge.#record('admitted', { instance_id: bridge.instance_id, runtime_id: bridge.spec.runtime_id, world_id: bridge.world_id, epoch: bridge.epoch, spec_ref: bridge.store.put(bridge.spec), spec_bytes_base64: Buffer.from(bridge.#opened.spec_bytes).toString('base64'), launch_ref: bridge.store.put({ crossing: bridge.#opened.launch.crossing, receipt: bridge.#opened.launch.receipt }), parent: checkpoint ? { world_id: checkpoint.world_id, incarnation_id: checkpoint.incarnation_id, snapshot_ref: checkpoint.snapshot_ref } : null });
    if (bridge.spec.runtime_id !== RUNTIME_ID) throw new Error('COMPOSITION_RUNTIME_MISMATCH');
    if (checkpoint) {
      const stored = bridge.store.get(checkpoint.snapshot_ref);
      if (digest(stored) !== digest(checkpoint.body)) throw new Error('SNAPSHOT_BINDING_MISMATCH');
      if (stored.spec.runtime_id !== bridge.spec.runtime_id || digest(stored.spec) !== digest(bridge.spec)) throw new Error('SNAPSHOT_SPEC_MISMATCH');
      bridge.#record('reconstitution', { snapshot_ref: checkpoint.snapshot_ref, parent_world: stored.world_id, historical_authority: 'EVIDENCE_ONLY', restored_grants: [], restored_counters: [] });
      for (const eligible of stored.eligible) bridge.#eligible.set(eligible.interface_id, clone(eligible));
      bridge.#ancestry = clone(stored.doors);
    } else bridge.#ancestry = [];
    bridge.#runtime = new RoomRuntime(join(root, bridge.incarnation_id + '-runtime.json'), checkpoint ? checkpoint.body.runtime_state : initialState(), exit => bridge.#unexpectedDeath(exit));
    await bridge.#runtime.ready;
    bridge.owner = Object.freeze(new FencedOwner(bridge, bridge.#world));
    return Object.freeze(bridge);
  }
  #unexpectedDeath(exit) {
    if (this.#terminal) return;
    const payload = { epoch: this.epoch, world_id: this.world_id, field_history_ref: this.store.put(this.fieldHistory()), retirement: this.doors().map(d => d.offer_id) };
    this.#terminal = true;
    try {
      this.#record('death-fence', payload); this.#record('terminated', { pid: this.runtimePid, signal: exit.signal ?? 'EXIT', unexpected: true });
      this.#retireField();
    } catch { /* in-memory terminal fence still denies every live gate */ }
  }
  #retireField() {
    for (const relation of this.#world.current().relations.keys()) this.#world.withdrawRelation(relation);
    for (const door of this.#world.current().doors.keys()) this.#world.withdraw(door);
    this.#record('cleanup', { field_history_ref: this.store.put(this.fieldHistory()) });
  }
  #record(kind, payload) {
    this.#checkFrontier();
    const e = appendSigned(this.store, this.incarnation_id, this.#keys, kind, payload);
    this.#frontier = { count: e.seq + 1, head: digest(e) }; return e;
  }
  #checkFrontier() {
    const events = this.journal();
    if (this.#frontier && (events.length < this.#frontier.count || digest(events[this.#frontier.count - 1]) !== this.#frontier.head)) throw new Error('HISTORY_ROLLBACK_OR_EQUIVOCATION');
  }
  journal() { return this.store.journal(this.incarnation_id); }
  assertAlive() {
    if (this.#terminal) throw new Error('TERMINAL_INSTANCE_DEATH');
    this.#checkFrontier();
    if (verifyJournal(this.journal(), this.ledger_anchor).dead) throw new Error('TERMINAL_INSTANCE_DEATH');
    if (this.spec.runtime_id !== RUNTIME_ID) throw new Error('COMPOSITION_RUNTIME_MISMATCH');
    if (digest(this.spec) !== digest(this.store.get(this.journal()[0].payload.spec_ref))) throw new Error('ADMITTED_SPEC_CHANGED');
  }
  ownerControl() { return this.#control; }
  requireControl(control) { if (control !== this.#control) throw new Error('OWNER_CONTROL_REQUIRED'); this.assertAlive(); }
  get runtimePid() { return this.#runtime.pid; }
  get authorSession() { return this.#runtime.author_session_id; }
  async runtimeTransition(action) {
    this.assertAlive(); if (this.#busy) throw new Error('RUNTIME_BUSY');
    if (!this.spec.capabilities.includes('compose')) throw new Error('CAPABILITY_UNDECLARED');
    if (action === 'recursive-composition') throw new Error('RECURSIVE_CAPABILITY_UNDECLARED');
    this.#busy = true;
    try {
      const event = await this.#runtime.call(action); this.assertAlive();
      if (event.runtime_id !== this.spec.runtime_id || digest(transition(event.before, action)) !== digest(event.after)) throw new Error('INVALID_RUNTIME_EVIDENCE');
      const runtime_event = this.#record('runtime-event', { runtime_id: event.runtime_id, action, before: event.before, after: event.after });
      const semantic = eligibleSemantic(action), interface_id = occurrence('interface');
      const descriptor = { ...clone(this.library.nodes.get(id('filesystem-output'))), interface_id, participant_ref: this.instance_id };
      const eligible = { interface_id, semantic, descriptor, runtime_event_ref: digest(runtime_event), parent_interface: action === 'reveal-map' ? [...this.#eligible.keys()][0] : null };
      this.#eligible.set(interface_id, eligible); this.#record('eligible-interface', eligible);
      return clone(eligible);
    } finally { this.#busy = false; }
  }
  publish(eligible, control, { oldOffer = null, descriptor = eligible.descriptor } = {}) {
    this.requireControl(control);
    if (!this.spec.capabilities.includes('publish-observation')) throw new Error('CAPABILITY_UNDECLARED');
    if (oldOffer) throw new Error('OFFER_REUSE_FORBIDDEN');
    const known = this.#eligible.get(eligible.interface_id);
    if (!known || digest(known) !== digest(eligible)) throw new Error('INTERFACE_NOT_ELIGIBLE');
    if (digest(descriptor) !== digest(known.descriptor) || descriptor.authority.authorize || descriptor.authority.mutate) throw new Error('UNDECLARED_AUTHORITY');
    const parent = eligible.parent_interface ? this.#offers.get(eligible.parent_interface) : null;
    if (eligible.parent_interface && !parent) throw new Error('PARENT_PUBLICATION_REQUIRED');
    const historical = this.#ancestry.find(d => d.descriptor.interface_id === eligible.interface_id);
    const parents = [parent, historical].filter(Boolean).map(d => ({ world_id: d.world_id, interface_id: d.descriptor.interface_id, offer_id: d.offer_id }));
    const door = this.#world.publish(descriptor, { parents });
    this.#offers.set(eligible.interface_id, door);
    this.#record('explicit-publication', { interface_id: eligible.interface_id, runtime_event_ref: eligible.runtime_event_ref, eligible_ref: digest(eligible), field_event_ref: door.event_ref, offer_id: door.offer_id, world_id: door.world_id, epoch: this.epoch, parents });
    return door;
  }
  eligible() { return clone([...this.#eligible.values()]); }
  doors() { return verifyJournal(this.journal(), this.ledger_anchor).dead ? [] : clone([...this.#offers.values()]); }
  fieldHistory() { return this.#world.history(); }
  publishRelation(descriptor, source, destination, control) { this.requireControl(control); return this.#world.publishRelation(descriptor, source, destination); }
  observer({ anchors = [], trust = false } = {}) { return new FieldObserver({ anchors: trust ? [...anchors, this.anchor] : anchors, surfaces: this.library.surfaces, contracts: this.library.contracts }); }
  async discover(observer, histories) {
    this.assertAlive(); const view = await observer.project(histories, this.clock());
    this.#record('discovery', { snapshot: view.snapshot, histories_ref: this.store.put(histories) }); return view;
  }
  select(plan) { this.assertAlive(); this.#record('selection', { plan_ref: this.store.put(plan), plan_digest: plan.field_plan_digest }); }
  authorize(plan, peers, subject, control, options = {}) {
    this.requireControl(control);
    if (!this.journal().some(e => e.kind === 'selection' && e.payload.plan_digest === plan.field_plan_digest)) throw new Error('SELECTION_REQUIRED');
    const grants = authorize(plan, peers, subject, options);
    this.#record('authorization', { plan_digest: plan.field_plan_digest, epoch: this.epoch, subject, grants_ref: this.store.put(grants) }); return grants;
  }
  async execute(view, plan, source, { peers, subject, grants = [], beforeStep } = {}) {
    const extraBindings = new Map();
    for (const relation of plan.relations) {
      const door = plan.doors.find(d => d.descriptor.interface_id === relation.descriptor.destination);
      const eligible = this.#eligible.get(door?.descriptor.interface_id);
      if (door?.world_id !== this.world_id || !eligible) continue;
      extraBindings.set(relation.descriptor.binding_ref, { contract_digest: digest(this.library.contracts[relation.descriptor.binding_ref]),
        run: async (artifact, context) => {
          this.assertAlive(); if (this.#busy) throw new Error('RUNTIME_BUSY');
          this.#busy = true; let observed;
          try { observed = await this.#runtime.call('observe', eligible.semantic); this.assertAlive(); } finally { this.#busy = false; }
          const event = this.#record('runtime-observation', { interface_id: eligible.interface_id, offer_id: door.offer_id, before: observed.before, after: observed.after, observation: observed.observation });
          this.assertAlive();
          const file = await observeFilesystem(artifact.bytes); context.cleanup.push(file.cleanup); this.assertAlive();
          return { bytes: Buffer.from(file.observation.observed_bytes), representation: relation.descriptor.produces, native_ref: file.observation.native_id, authority: [], evidence: { facts: relation.descriptor.postconditions, native: { ...file.observation.native_claims, filesystem_content_sha256: file.observation.content_sha256, runtime_observation_ref: digest(event), semantic: eligible.semantic, observation: observed.observation, state_digest: digest(observed.after) } } };
        }, verify: async (before, after) => Buffer.from(before.bytes).equals(after.bytes) });
    }
    const result = await executeDynamic(view, plan, source, { peers, subject, grants, extraBindings, beforeStep });
    const dead = verifyJournal(this.journal(), this.ledger_anchor).dead;
    this.#record(dead ? 'denial' : 'occurrence', { plan_ref: this.store.put(plan), view_ref: this.store.put({ snapshot: view.snapshot, histories: this.historiesForView(view) }), occurrence_ref: this.store.put(result.record) });
    return result;
  }
  historiesForView(view) {
    // Caller view reconstruction uses durable discovery histories; never current state.
    const e = this.journal().find(e => e.kind === 'discovery' && e.payload.snapshot.view_digest === view.snapshot.view_digest);
    if (!e) throw new Error('VIEW_NOT_DISCOVERED_BY_BRIDGE');
    return this.store.get(e.payload.histories_ref);
  }
  observe(session = occurrence('observer')) {
    this.assertAlive(); if (this.#busy) throw new Error('RUNTIME_BUSY'); const state = this.#runtime.observe(session), state_ref = this.store.put(state);
    this.#observerEvidence = { runtime_id: this.spec.runtime_id, author_session_id: this.authorSession, observer_session_id: session, observed_state_ref: state_ref, observed_state_sha256: state_ref.slice(7), action_trace_ref: this.store.put(this.journal().filter(e => e.kind.startsWith('runtime-'))), claims: { world_id: this.world_id, incarnation_id: this.incarnation_id, room_state_digest: digest(state) } };
    this.#record('observer', this.#observerEvidence); return clone(this.#observerEvidence);
  }
  snapshot(control) {
    this.requireControl(control); if (this.#busy) throw new Error('RUNTIME_BUSY');
    const body = { schema: 'relatte.composition-field-snapshot.experimental/v0', instance_id: this.instance_id, incarnation_id: this.incarnation_id, world_id: this.world_id, epoch: this.epoch, spec: clone(this.spec), governing_snapshot: this.spec.governing_snapshot, runtime_state: this.#runtime.state(), runtime_snapshot_ref: this.store.put(this.#runtime.state()), trace_ref: this.store.put(this.journal()), eligible: this.eligible(), doors: this.doors(), field_history_ref: this.store.put(this.fieldHistory()), owner_frontier: this.#world.head, candidate_ancestry: { launch_crossing_id: this.#opened.launch.crossing.crossing_id, candidate_refs: this.journal().filter(e => e.kind === 'candidate').map(e => e.payload.candidate_ref) }, observer_evidence: this.#observerEvidence, authorization_history: 'EVIDENCE_ONLY', live_authority: [], grant_counters: [] };
    const snapshot_ref = this.store.put(body); this.#record('snapshot', { snapshot_ref });
    return { snapshot_ref, world_id: this.world_id, incarnation_id: this.incarnation_id, ledger_anchor: clone(this.ledger_anchor), body };
  }
  async candidate({ disposition = 'R3_HOLD' } = {}) {
    this.assertAlive(); if (this.#busy) throw new Error('RUNTIME_BUSY'); if (disposition !== 'R3_HOLD') throw new Error('COMPOSITION_RESULT_AUTO_ADMITTED');
    if (!this.#observerEvidence) throw new Error('FRESH_OBSERVER_REQUIRED');
    const bytes = Buffer.from(JSON.stringify(this.#runtime.state()));
    if (digest(this.store.get(this.#observerEvidence.observed_state_ref)) !== digest(this.#runtime.state())) throw new Error('OBSERVER_STATE_STALE');
    const result = await finalizeCompositionInstance({ opened: this.#opened, spec: this.spec, runtime_evidence: this.#observerEvidence, candidate_bytes: bytes, signer: await generateP256KeyPair(), receiver: await generateP256KeyPair(), hop_index: 41 });
    this.assertAlive();
    const candidate = { particular_id: result.candidate.crossing.source_particular, content_ref: this.store.put({ bytes_base64: bytes.toString('base64') }), result: result.result, result_bytes_base64: Buffer.from(result.result_bytes).toString('base64'), result_ref: this.store.put(result.result), crossing: result.candidate.crossing, receipt: result.candidate.receipt, producer_world: this.world_id, producer_incarnation: this.incarnation_id };
    const candidate_ref = this.store.put(candidate); this.#record('candidate', { candidate_ref, particular_id: candidate.particular_id }); return { candidate_ref, candidate };
  }
  async terminate(control, { interruptCleanup = false } = {}) {
    this.requireControl(control);
    // The incarnation fence is fsynced BEFORE yielding, process kill, or cleanup.
    const fencePayload = { epoch: this.epoch, world_id: this.world_id, field_history_ref: this.store.put(this.fieldHistory()), retirement: this.doors().map(d => d.offer_id) };
    this.#terminal = true;
    try { this.#record('death-fence', fencePayload); } catch (error) { await this.#runtime.kill(); throw error; }
    await this.#runtime.kill(); this.#record('terminated', { pid: this.runtimePid, signal: 'SIGKILL' });
    if (interruptCleanup) return;
    this.#retireField();
  }
  evidence() { return { incarnation_id: this.incarnation_id, instance_id: this.instance_id, world_id: this.world_id, epoch: this.epoch, ledger_anchor: this.ledger_anchor, field_anchor: this.anchor, journal: this.journal(), field_history: this.fieldHistory() }; }
  recognition(history) {
    verifyJournal(history.journal, history.ledger_anchor);
    const admission = history.journal[0].payload;
    const result = { observer_instance: this.incarnation_id, historical_world: history.world_id, parent: admission.parent, same_live_authority: false, authority: [], candidate_particulars: history.journal.filter(e => e.kind === 'candidate').map(e => e.payload.particular_id) };
    this.assertAlive(); this.#record('recognition', result); return result;
  }
}
export async function receiveCandidate(store, ref, kind, receiver = null) {
  if (!['R3_HOLD', 'R3_REFUSE', 'R3_ADMIT'].includes(kind)) throw new Error('INVALID_RECEIVER_DISPOSITION');
  const candidate = store.get(ref), content = store.get(candidate.content_ref);
  if (!(await verifyCrossingEnvelope(candidate.crossing)) || !(await verifyReceipt(candidate.receipt)) || candidate.receipt.crossing_id !== candidate.crossing.crossing_id || candidate.receipt.kind !== 'R3_HOLD') throw new Error('INVALID_CANDIDATE_EVIDENCE');
  const resultBytes = Buffer.from(candidate.result_bytes_base64, 'base64');
  if (digest(JSON.parse(resultBytes)) !== digest(candidate.result) || digest(store.get(candidate.result_ref)) !== digest(candidate.result) || candidate.crossing.payload_refs[0].address !== byteDigest(resultBytes) || candidate.crossing.source_particular !== candidate.particular_id) throw new Error('CANDIDATE_CROSSING_BINDING_MISMATCH');
  if (byteDigest(Buffer.from(content.bytes_base64, 'base64')).slice(7) !== candidate.result.candidate_content_sha256) throw new Error('CANDIDATE_CONTENT_MISMATCH');
  return sealReceipt({ ...candidate.receipt, kind, world_id: occurrence('receiver-world'), receiver_particular: occurrence('independent-receiver'), receipt_id: undefined, extensions: { candidate_ref: ref, authority_scope: 'THIS_RECEIVER_ONLY' } }, receiver ?? await generateP256KeyPair());
}
export async function routeTo(bridge, observer, sourceOwner, sourceDoor, door) {
  const template = bridge.library.relations.find(r => r.source === sourceDoor.descriptor.interface_id && r.destination === id('filesystem-output'));
  bridge.publishRelation({ ...clone(template), relation_id: occurrence('relation'), destination: door.descriptor.interface_id }, sourceDoor, door, bridge.ownerControl());
  const view = await bridge.discover(observer, [sourceOwner.history(), bridge.fieldHistory()]);
  const query = request(bridge.library, { bytes: Buffer.from('observation request'), goal: 'file.bytes', goalInterface: door.descriptor.interface_id, network: false, permissions: [door.descriptor.interface_id + '/observe'] });
  const search = await propose(view, query); if (!search.plans.length) throw new Error('MISSING_DISCOVERED_ROUTE');
  const plan = search.plans[0]; bridge.select(plan);
  return { view, plan, source: { bytes: Buffer.from('observation request'), native_ref: occurrence('source'), particular_id: occurrence('particular') }, peers: new Map([[sourceOwner.world_id, sourceOwner], [bridge.world_id, bridge.owner]]) };
}
export function recoverHistorical(store, evidence) {
  const events = store.journal(evidence.incarnation_id); verifyJournal(events, evidence.ledger_anchor);
  if (events.length < evidence.journal.length || digest(events.slice(0, evidence.journal.length)) !== digest(evidence.journal)) throw new Error('HISTORY_ROLLBACK_OR_EQUIVOCATION');
  return Object.freeze({ dead: verifyJournal(events, evidence.ledger_anchor).dead, live_doors: [], authority: [], journal: events, execute() { throw new Error('NON_EXECUTING_REPLAY'); }, publish() { throw new Error('FRESH_INSTANCE_ADMISSION_REQUIRED'); } });
}
