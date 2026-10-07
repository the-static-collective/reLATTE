/** SOVEREIGN-BOOTSTRAP-EXTERNAL-001: owner-pinned, monotone knowledge of
 * signed claims; active peer equivocation; explicit future reconciliation.
 * No root creation, administrative-independence inference or global finality.
 */
import { canonicalize, canonicalizeDomainValue, sha256Hex } from './canonical.ts';
import { verifyReceipt } from './protocol.ts';
import { forbidPrivateEvidence, signingKeyIdentity, type PublicRecord } from './foundation-of-trust.ts';
import type { BootstrapRootPin, BootstrapJournal } from './trust-bootstrap.ts';

export interface SovereignSelection { root: BootstrapRootPin; observation_head: string | null }
export interface SovereignView {
  schema: 'relatte.sovereign-view/v0'; history: BootstrapJournal;
  archive: PublicRecord[]; observations: PublicRecord[];
}
export interface SignedConflict {
  id: string; kind: 'POLICY_EQUIVOCATION' | 'ROOT_ACTIVATION_EQUIVOCATION' | 'ROOT_HISTORY_EQUIVOCATION';
  key: string; claim_ids: string[]; evidence_level: 'E2 SIGNED'; authority: 'UNOBSERVED';
}
export interface SovereignEncounterAssessment {
  status: 'HOLD'; evidence_subject: 'KNOWN_SIGNED_CONTRADICTIONS';
  conflict_evidence_level: 'E0 UNOBSERVED' | 'E2 SIGNED';
  known_conflict_ids: string[]; reconstructed_conflicts: SignedConflict[];
  reasons: string[]; archive: PublicRecord[]; observation_draft: PublicRecord | null;
  peer_authority: 'UNOBSERVED'; historical_truth: 'UNOBSERVED'; global_completeness: 'UNOBSERVED';
  administrative_independence: 'UNOBSERVED'; foreign_sovereignty_imported: false;
}
export interface SovereignEdgeBundle {
  schema: 'relatte.sovereign-edge-bundle/v0'; views: SovereignView[];
  proposal: PublicRecord; decisions: PublicRecord[]; closures: PublicRecord[];
}
const need = (v: unknown, reason: string): void => { if (!v) throw new Error(reason); };
const exact = (v: any, fields: string[], reason: string): void => {
  need(v && typeof v === 'object' && !Array.isArray(v) && canonicalize(Object.keys(v).sort()) === canonicalize([...fields].sort()), reason);
};
const sorted = (ids: string[]): string => canonicalize([...ids].sort());
const hash = (domain: string, v: any): string => sha256Hex(canonicalizeDomainValue(domain, v));
const body = (r: PublicRecord, extension: string): any => r.extensions?.[extension];
const latest = (view: SovereignView): string | null => view.observations.at(-1)?.receipt_id ?? null;
const ownKey = (view: SovereignView): string => signingKeyIdentity(view.history.records[0]);
const historyHead = (view: SovereignView): string => view.history.records.at(-1)!.receipt_id;
const delegation = (view: SovereignView): any => body(view.history.records.find(r => body(r, 'bootstrap_journal').kind === 'DELEGATE_POLICY')!, 'bootstrap_journal').data;
const selectionId = (view: SovereignView): string => body(view.history.records.find(r => body(r, 'bootstrap_journal').kind === 'SELECT_POLICY')!, 'bootstrap_journal').data.claim_id;
export const sovereignViewDigest = (view: SovereignView): string => hash('reLATTE-SovereignView-v0|', view);
export function sovereignSelection(view: SovereignView): SovereignSelection {
  return { root: { admin_id: view.history.admin_id, key: ownKey(view), genesis_id: view.history.records[0].receipt_id, head_id: historyHead(view) }, observation_head: latest(view) };
}
async function signed(r: PublicRecord): Promise<void> {
  need(await verifyReceipt(r), 'INVALID_SOVEREIGN_SIGNATURE');
  need(r.kind === 'RECEIVED' && r.semantic_effect === 'none', 'SOVEREIGN_RECEIPT_ROLE_MISMATCH');
}

/** Attribution needs a valid signature, not admission of that signer as a
 * sovereign. Only P has an already locally delegated role at discovery. */
export function sovereignConflicts(view: SovereignView, records: PublicRecord[]): SignedConflict[] {
  const groups = new Map<string, { kind: SignedConflict['kind']; key: string; accounts: { r: PublicRecord; account: string }[] }>();
  const add = (kind: SignedConflict['kind'], key: string, context: any, r: PublicRecord, account: any): void => {
    const id = canonicalize({ kind, key, context });
    if (!groups.has(id)) groups.set(id, { kind, key, accounts: [] });
    groups.get(id)!.accounts.push({ r, account: canonicalize(account) });
  };
  const policyRole = delegation(view), byId = new Map(records.map(r => [r.receipt_id, r]));
  for (const r of records) {
    const key = signingKeyIdentity(r), policy = body(r, 'bootstrap_policy');
    if (policy && key === policyRole.policy_key && policy.slot === policyRole.slot && policy.version === policyRole.version) {
      exact(r.extensions, ['bootstrap_policy'], 'INVALID_SIGNED_POLICY_ACCOUNT');
      exact(policy, ['schema','slot','version','scope','basis_heads','terms'], 'INVALID_SIGNED_POLICY_ACCOUNT');
      need(policy.schema === 'relatte.bootstrap-policy/v0' && policy.scope === 'ONE_RULE_FOR_BOTH_ADMINS' && r.crossing_id === 'bootstrap:policy:' + policy.slot, 'INVALID_SIGNED_POLICY_ACCOUNT');
      exact(policy.terms, ['handoff_rule'], 'INVALID_SIGNED_POLICY_ACCOUNT');
      need(['SOURCE_MAY_SELF_ADMIT','RECEIVER_MUST_ATTEST'].includes(policy.terms.handoff_rule), 'INVALID_SIGNED_POLICY_ACCOUNT');
      add('POLICY_EQUIVOCATION', key, { slot: policy.slot, version: policy.version, scope: policy.scope }, r, policy.terms);
    }
    const event = body(r, 'bootstrap_journal');
    if (event && event.parent !== null) {
      exact(r.extensions, ['bootstrap_journal'], 'INVALID_SIGNED_HISTORY_ACCOUNT');
      exact(event, ['schema','admin_id','kind','parent','data'], 'INVALID_SIGNED_HISTORY_ACCOUNT');
      need(event.schema === 'relatte.bootstrap-journal/v0' && r.world_id === event.admin_id && r.receiver_particular === event.admin_id && r.crossing_id === event.parent, 'INVALID_SIGNED_HISTORY_ACCOUNT');
      add('ROOT_HISTORY_EQUIVOCATION', key, { admin_id: event.admin_id, parent: event.parent }, r, { kind: event.kind, data: event.data });
    }
    const choice = body(r, 'bootstrap_decision');
    if (choice) {
      exact(r.extensions, ['bootstrap_decision'], 'INVALID_SIGNED_ACTIVATION_ACCOUNT');
      exact(choice, ['schema','admin_id','proposal_id','base_head','local_genesis','peer_key','peer_genesis','decision','scope','selection_basis','decision_nonce'], 'INVALID_SIGNED_ACTIVATION_ACCOUNT');
      const proposalRecord = byId.get(choice.proposal_id), proposal = proposalRecord && body(proposalRecord, 'bootstrap_proposal');
      // An absent referenced proposal is not evidence of compatibility.
      need(proposal, 'ACTIVATION_PROPOSAL_UNAVAILABLE');
      exact(proposalRecord!.extensions, ['bootstrap_proposal'], 'INVALID_SIGNED_ACTIVATION_ACCOUNT');
      exact(proposal, ['schema','proposal_nonce','slot','version','participants','conflict_ids','terms','activation','history_mode'], 'INVALID_SIGNED_ACTIVATION_ACCOUNT');
      need(proposal.schema === 'relatte.bootstrap-proposal/v0' && typeof proposal.slot === 'string' && Number.isSafeInteger(proposal.version) && Array.isArray(proposal.participants), 'INVALID_SIGNED_ACTIVATION_ACCOUNT');
      const participant = proposal.participants.find((p: any) => p.admin_id === choice.admin_id && p.key === key);
      const peer = proposal.participants.find((p: any) => p.admin_id !== choice.admin_id);
      const proposer = proposal.participants.find((p: any) => p.key === signingKeyIdentity(proposalRecord!));
      need(participant && proposer && proposalRecord!.world_id === proposer.admin_id && proposalRecord!.receiver_particular === proposer.admin_id && choice.schema === 'relatte.bootstrap-local-decision/v0' && r.world_id === choice.admin_id && r.receiver_particular === choice.admin_id && r.crossing_id === choice.proposal_id && participant.head_id === choice.base_head && participant.genesis_id === choice.local_genesis && ['ADMIT','REFUSE'].includes(choice.decision), 'SIGNED_ACTIVATION_ROLE_MISMATCH');
      need(peer && choice.peer_key === peer.key && choice.peer_genesis === peer.genesis_id && choice.scope === 'THIS_FUTURE_POLICY_EDGE_ONLY' && choice.selection_basis === 'EXPLICIT_LOCAL_ROOT_DECISION', 'SIGNED_ACTIVATION_SCOPE_MISMATCH');
      add('ROOT_ACTIVATION_EQUIVOCATION', key, { admin_id: choice.admin_id, slot: proposal.slot, version: proposal.version, base_head: choice.base_head, genesis: choice.local_genesis }, r, { proposal_id: choice.proposal_id, decision: choice.decision });
    }
    const fresh = body(r, 'sovereign_edge_decision');
    if (fresh) {
      exact(r.extensions, ['sovereign_edge_decision'], 'INVALID_SIGNED_ACTIVATION_ACCOUNT');
      exact(fresh, ['schema','admin_id','proposal_id','slot','version','own_genesis','own_history_head','own_observation_head','peer_key','peer_genesis','acknowledged_conflicts','decision','scope','sovereignty_import'], 'INVALID_SIGNED_ACTIVATION_ACCOUNT');
      const pr = byId.get(fresh.proposal_id), p = pr && body(pr, 'sovereign_reconciliation'); need(p, 'ACTIVATION_PROPOSAL_UNAVAILABLE');
      exact(pr!.extensions, ['sovereign_reconciliation'], 'INVALID_SIGNED_ACTIVATION_ACCOUNT');
      exact(p, ['schema','nonce','slot','version','participants','conflict_ids','archive_ids','scope','history_rewrite','sovereignty_import','conflict_erasure','activation'], 'INVALID_SIGNED_ACTIVATION_ACCOUNT');
      need(p.schema === 'relatte.sovereign-reconciliation/v0' && Array.isArray(p.participants) && Number.isSafeInteger(p.version), 'INVALID_SIGNED_ACTIVATION_ACCOUNT');
      const member = p.participants.find((p: any) => p.admin_id === fresh.admin_id && p.key === key), peer = p.participants.find((p: any) => p.admin_id !== fresh.admin_id), proposer = p.participants.find((p: any) => p.key === signingKeyIdentity(pr!));
      need(member && peer && proposer && pr!.world_id === proposer.admin_id && pr!.receiver_particular === proposer.admin_id && fresh.schema === 'relatte.sovereign-edge-decision/v0' && r.world_id === fresh.admin_id && r.receiver_particular === fresh.admin_id && r.crossing_id === fresh.proposal_id && fresh.slot === p.slot && fresh.version === p.version && fresh.own_genesis === member.genesis_id && fresh.own_history_head === member.head_id && fresh.own_observation_head === member.observation_head && ['ADMIT','REFUSE'].includes(fresh.decision), 'SIGNED_ACTIVATION_ROLE_MISMATCH');
      need(fresh.peer_key === peer.key && fresh.peer_genesis === peer.genesis_id && fresh.scope === 'THIS_NEW_EDGE_ONLY' && fresh.sovereignty_import === false && Array.isArray(fresh.acknowledged_conflicts) && sorted(fresh.acknowledged_conflicts) === sorted(p.conflict_ids), 'SIGNED_ACTIVATION_SCOPE_MISMATCH');
      add('ROOT_ACTIVATION_EQUIVOCATION', key, { admin_id: fresh.admin_id, slot: p.slot, version: p.version, base_head: fresh.own_history_head, genesis: fresh.own_genesis }, r, { proposal_id: fresh.proposal_id, decision: fresh.decision });
    }
  }
  const conflicts = new Map<string, SignedConflict>();
  for (const [context, group] of groups) for (let i = 0; i < group.accounts.length; i++) for (let j = i + 1; j < group.accounts.length; j++) {
    const [a, b] = [group.accounts[i], group.accounts[j]]; if (a.account === b.account) continue;
    const claim_ids = [a.r.receipt_id, b.r.receipt_id].sort();
    const id = 'relatte-signed-conflict-v0:' + hash('reLATTE-SignedConflict-v0|', { context, claim_ids });
    conflicts.set(id, { id, kind: group.kind, key: group.key, claim_ids, evidence_level: 'E2 SIGNED', authority: 'UNOBSERVED' });
  }
  return [...conflicts.values()].sort((a, b) => a.id.localeCompare(b.id));
}

async function validateHistory(view: SovereignView, selection: SovereignSelection): Promise<void> {
  exact(view, ['schema','history','archive','observations'], 'INVALID_SOVEREIGN_VIEW');
  need(view.schema === 'relatte.sovereign-view/v0' && Array.isArray(view.archive) && Array.isArray(view.observations), 'INVALID_SOVEREIGN_VIEW');
  const j = view.history; exact(j, ['admin_id','records'], 'INVALID_LOCAL_HISTORY');
  need(Array.isArray(j.records) && j.records.length >= 3 && j.admin_id === selection.root.admin_id && ownKey(view) === selection.root.key && j.records[0].receipt_id === selection.root.genesis_id, 'LOCAL_SOVEREIGN_SELECTION_MISMATCH');
  let parent: string | null = null; let delegates = 0, selections = 0;
  for (const [i, r] of j.records.entries()) {
    await signed(r); exact(r.extensions, ['bootstrap_journal'], 'INVALID_LOCAL_HISTORY');
    const e = body(r, 'bootstrap_journal'); exact(e, ['schema','admin_id','kind','parent','data'], 'INVALID_LOCAL_HISTORY');
    need(signingKeyIdentity(r) === selection.root.key && r.world_id === j.admin_id && r.receiver_particular === j.admin_id && e.schema === 'relatte.bootstrap-journal/v0' && e.admin_id === j.admin_id && e.parent === parent && r.crossing_id === (parent ?? 'bootstrap:genesis'), 'LOCAL_HISTORY_BINDING_MISMATCH');
    if (!i) need(e.kind === 'GENESIS' && e.data.scope === 'SOVEREIGN_LOCAL_ROOT', 'LOCAL_GENESIS_REQUIRED');
    else if (e.kind === 'DELEGATE_POLICY') { need(!delegates && !selections && e.data.scope === 'ONE_DECLARED_POLICY_SLOT' && e.data.policy_key !== selection.root.key && typeof e.data.slot === 'string' && Number.isSafeInteger(e.data.version), 'INVALID_LOCAL_DELEGATION'); delegates++; }
    else if (e.kind === 'SELECT_POLICY') { need(delegates === 1 && !selections && typeof e.data.claim_id === 'string', 'INVALID_LOCAL_POLICY_SELECTION'); selections++; }
    else need(e.kind === 'OBSERVE_CONFLICT' && selections === 1, 'UNSUPPORTED_LOCAL_HISTORY_EVENT');
    parent = r.receipt_id;
  }
  need(delegates === 1 && selections === 1 && historyHead(view) === selection.root.head_id, 'PINNED_SOVEREIGN_HISTORY_CHANGED');
}
function initialEncounter(): SovereignEncounterAssessment {
  return { status: 'HOLD', evidence_subject: 'KNOWN_SIGNED_CONTRADICTIONS', conflict_evidence_level: 'E0 UNOBSERVED', known_conflict_ids: [], reconstructed_conflicts: [], reasons: [], archive: [], observation_draft: null,
    peer_authority: 'UNOBSERVED', historical_truth: 'UNOBSERVED', global_completeness: 'UNOBSERVED', administrative_independence: 'UNOBSERVED', foreign_sovereignty_imported: false };
}
export async function assessSovereignEncounter(args: { selection?: SovereignSelection; view: SovereignView; incoming?: PublicRecord[] }): Promise<SovereignEncounterAssessment> {
  const out = initialEncounter();
  try {
    need(args.selection, 'NO_LOCAL_SOVEREIGN_SELECTION'); const selection = args.selection!;
    // First preserve remembered conflict IDs from the correctly pinned signed
    // local log. A lost payload degrades reconstruction, not remembered knowledge.
    need(Array.isArray(args.view.observations), 'INVALID_LOCAL_OBSERVATION');
    forbidPrivateEvidence(args.view.observations); let parent: string | null = null, priorIds: string[] = [], priorConflicts: string[] = [];
    for (const r of args.view.observations) {
      await signed(r); exact(r.extensions, ['sovereign_observation'], 'INVALID_LOCAL_OBSERVATION');
      const e = body(r, 'sovereign_observation'); exact(e, ['schema','admin_id','parent','history_head','archive_ids','conflict_ids','authority_import','scope'], 'INVALID_LOCAL_OBSERVATION');
      need(e.schema === 'relatte.sovereign-observation/v0' && signingKeyIdentity(r) === selection.root.key && r.world_id === selection.root.admin_id && r.receiver_particular === selection.root.admin_id && e.admin_id === selection.root.admin_id && e.history_head === selection.root.head_id && e.parent === parent && r.crossing_id === (parent ?? selection.root.head_id) && e.authority_import === false && e.scope === 'KNOWN_SIGNED_CLAIMS_ONLY', 'LOCAL_OBSERVATION_BINDING_MISMATCH');
      need(Array.isArray(e.archive_ids) && Array.isArray(e.conflict_ids) && new Set(e.archive_ids).size === e.archive_ids.length && new Set(e.conflict_ids).size === e.conflict_ids.length && priorIds.every(id => e.archive_ids.includes(id)) && priorConflicts.every(id => e.conflict_ids.includes(id)), 'LOCAL_KNOWLEDGE_ROLLBACK');
      parent = r.receipt_id; priorIds = e.archive_ids; priorConflicts = e.conflict_ids;
    }
    need(parent === selection.observation_head, 'PINNED_OBSERVATION_HEAD_CHANGED'); out.known_conflict_ids = [...priorConflicts].sort();
    forbidPrivateEvidence(args.view.history); await validateHistory(args.view, selection);
    forbidPrivateEvidence(args.view.archive); const records = new Map<string, PublicRecord>();
    for (const r of args.view.archive) { await signed(r); need(!records.has(r.receipt_id), 'DUPLICATE_LOCAL_ARCHIVE_ID'); records.set(r.receipt_id, r); }
    out.archive = [...records.values()];
    need(args.view.history.records.every(r => records.has(r.receipt_id)) && records.has(selectionId(args.view)), 'LOCAL_INITIAL_RECORD_UNAVAILABLE');
    const selected = records.get(selectionId(args.view))!, policy = body(selected, 'bootstrap_policy'), role = delegation(args.view);
    need(policy && signingKeyIdentity(selected) === role.policy_key && policy.slot === role.slot && policy.version === role.version && policy.basis_heads.includes(args.view.history.records.find(r => body(r, 'bootstrap_journal').kind === 'DELEGATE_POLICY')!.receipt_id), 'LOCAL_SELECTED_POLICY_BINDING_MISMATCH');
    if (parent) need(sorted(priorIds) === sorted([...records.keys()]), 'KNOWN_ARCHIVE_EVIDENCE_MISSING_OR_CHANGED');
    for (const observation of args.view.observations) {
      const e = body(observation, 'sovereign_observation');
      const then = sovereignConflicts(args.view, e.archive_ids.map((id: string) => records.get(id)!));
      need(sorted(then.map(c => c.id)) === sorted(e.conflict_ids), 'LOCAL_CONFLICT_RECORD_NOT_REPRODUCIBLE');
    }
    const before = sovereignConflicts(args.view, out.archive); out.reconstructed_conflicts = before;
    out.known_conflict_ids = [...new Set([...out.known_conflict_ids, ...before.map(c => c.id)])].sort();
    if (before.length) out.conflict_evidence_level = 'E2 SIGNED';
    forbidPrivateEvidence(args.incoming ?? []); need(Array.isArray(args.incoming ?? []), 'INVALID_ENCOUNTER_INPUT');
    for (const r of args.incoming ?? []) { await signed(r); if (!records.has(r.receipt_id)) records.set(r.receipt_id, r); }
    const archive = [...records.values()], conflicts = sovereignConflicts(args.view, archive);
    need(out.known_conflict_ids.every(id => conflicts.some(c => c.id === id)), 'KNOWN_CONFLICT_DISAPPEARED');
    out.archive = archive; out.reconstructed_conflicts = conflicts; out.known_conflict_ids = conflicts.map(c => c.id);
    if (conflicts.length) out.conflict_evidence_level = 'E2 SIGNED';
    out.reasons.push(...new Set(conflicts.map(c => c.kind)), 'PEER_AUTHORITY_NOT_IMPORTED', 'FRESH_BILATERAL_ACT_REQUIRED');
    out.observation_draft = { schema: 'relatte.sovereign-observation/v0', admin_id: selection.root.admin_id, parent,
      history_head: selection.root.head_id, archive_ids: [...records.keys()].sort(), conflict_ids: out.known_conflict_ids,
      authority_import: false, scope: 'KNOWN_SIGNED_CLAIMS_ONLY' };
  } catch (e) { out.reasons.push(e instanceof Error ? e.message : 'INVALID_SOVEREIGN_EVIDENCE'); }
  return out;
}

export function sovereignEdgeCoreDigest(bundle: SovereignEdgeBundle): string {
  const { closures: _, ...core } = bundle; return hash('reLATTE-SovereignEdgeCore-v0|', core);
}
export function sovereignEdgeId(bundle: SovereignEdgeBundle): string {
  return 'relatte-sovereign-edge-v0:' + hash('reLATTE-SovereignEdge-v0|', { proposal_id: bundle.proposal.receipt_id, decisions: bundle.decisions.map(r => r.receipt_id).sort() });
}
export async function sovereignProposalDraft(views: SovereignView[]): Promise<PublicRecord> {
  need(views.length === 2 && new Set(views.map(ownKey)).size === 2 && new Set(views.map(v => v.history.admin_id)).size === 2, 'SOVEREIGN_ROOT_KEYS_OR_LABELS_NOT_DISTINCT');
  const results = await Promise.all(views.map(view => assessSovereignEncounter({ selection: sovereignSelection(view), view })));
  need(results.every(r => r.observation_draft), 'PRIOR_KNOWLEDGE_NOT_RECONSTRUCTIBLE');
  need(views.every(v => latest(v)), 'BOTH_LOCAL_OBSERVATIONS_REQUIRED');
  const role = delegation(views[0]); need(views.every(v => canonicalize(delegation(v)) === canonicalize(role)), 'NO_COMMON_DECLARED_POLICY_SLOT');
  const archive = [...new Map(views.flatMap(v => v.archive).map(r => [r.receipt_id, r])).values()];
  const conflicts = sovereignConflicts(views[0], archive); need(conflicts.some(c => c.kind === 'POLICY_EQUIVOCATION'), 'POLICY_EQUIVOCATION_UNOBSERVED');
  let oldVersion = role.version;
  const participantKeys = new Set(views.map(ownKey));
  const citedProposals = new Set(archive.filter(r => participantKeys.has(signingKeyIdentity(r)) && (body(r, 'bootstrap_decision') || body(r, 'sovereign_edge_decision'))).map(r => (body(r, 'bootstrap_decision') ?? body(r, 'sovereign_edge_decision')).proposal_id));
  for (const r of archive) { const b = body(r, 'bootstrap_proposal') ?? body(r, 'sovereign_reconciliation'); if (citedProposals.has(r.receipt_id) && b?.slot === role.slot && Number.isSafeInteger(b.version)) oldVersion = Math.max(oldVersion, b.version); }
  need(Number.isSafeInteger(oldVersion + 1), 'POLICY_VERSION_OVERFLOW');
  return { schema: 'relatte.sovereign-reconciliation/v0', nonce: crypto.randomUUID(), slot: role.slot, version: oldVersion + 1,
    participants: views.map(v => ({ ...sovereignSelection(v).root, observation_head: latest(v), original_policy_id: selectionId(v), view_digest: sovereignViewDigest(v) })),
    conflict_ids: conflicts.map(c => c.id), archive_ids: archive.map(r => r.receipt_id).sort(),
    scope: 'THIS_NEW_EDGE_ONLY', history_rewrite: false, sovereignty_import: false, conflict_erasure: false, activation: 'AFTER_BOTH_LOCAL_DECISIONS_AND_CLOSURES' };
}
export async function assessSovereignEdge(args: { selection?: SovereignSelection; bundle: SovereignEdgeBundle; local_view?: SovereignView }) {
  const out = { status: 'HOLD', evidence_level: 'E0 UNOBSERVED', confidence: 0, joint_edge_id: null as string | null,
    known_conflict_ids: [] as string[], reasons: [] as string[], ready_for_decision: false, ready_for_closure: false,
    authority_scope: 'NONE', foreign_sovereignty_imported: false, administrative_independence: 'UNOBSERVED', historical_truth: 'UNOBSERVED', global_finality: 'UNOBSERVED', global_completeness: 'UNOBSERVED' };
  try {
    need(args.selection, 'NO_LOCAL_SOVEREIGN_SELECTION'); const selection = args.selection!, bundle = args.bundle;
    // Retain own knowledge even when the arriving edge has an invalid closure.
    if (args.local_view) {
      const retained = await assessSovereignEncounter({ selection, view: args.local_view }); out.known_conflict_ids = retained.known_conflict_ids;
      need(retained.observation_draft, retained.reasons.at(-1) ?? 'LOCAL_KNOWLEDGE_NOT_RECONSTRUCTIBLE');
    }
    need(Array.isArray(bundle.views), 'INVALID_SOVEREIGN_EDGE');
    const own = bundle.views.find(v => v.history.admin_id === selection.root.admin_id); need(own, 'LOCAL_VIEW_UNAVAILABLE');
    if (args.local_view) need(sovereignViewDigest(own!) === sovereignViewDigest(args.local_view), 'RETAINED_LOCAL_VIEW_REPLACEMENT');
    const local = await assessSovereignEncounter({ selection, view: own! }); out.known_conflict_ids = local.known_conflict_ids;
    need(local.observation_draft, local.reasons.at(-1) ?? 'LOCAL_KNOWLEDGE_NOT_RECONSTRUCTIBLE');
    forbidPrivateEvidence(bundle); exact(bundle, ['schema','views','proposal','decisions','closures'], 'INVALID_SOVEREIGN_EDGE');
    need(bundle.schema === 'relatte.sovereign-edge-bundle/v0' && Array.isArray(bundle.decisions) && Array.isArray(bundle.closures), 'INVALID_SOVEREIGN_EDGE');
    const expected = await sovereignProposalDraft(bundle.views); await signed(bundle.proposal);
    exact(bundle.proposal.extensions, ['sovereign_reconciliation'], 'INVALID_RECONCILIATION_PROPOSAL'); const proposal = body(bundle.proposal, 'sovereign_reconciliation');
    exact(proposal, Object.keys(expected), 'INVALID_RECONCILIATION_PROPOSAL');
    need(typeof proposal.nonce === 'string' && proposal.nonce.length, 'INVALID_RECONCILIATION_NONCE');
    need(proposal.history_rewrite === false && proposal.sovereignty_import === false && proposal.conflict_erasure === false && proposal.scope === 'THIS_NEW_EDGE_ONLY', 'SOVEREIGNTY_IMPORT_OR_PAST_REWRITE_FORBIDDEN');
    need(sorted(proposal.conflict_ids) === sorted(expected.conflict_ids), 'KNOWN_CONTRADICTION_NOT_ACKNOWLEDGED');
    need(proposal.slot === expected.slot && proposal.version === expected.version, 'FRESH_POLICY_VERSION_REQUIRED');
    need(canonicalize({ ...proposal, nonce: expected.nonce }) === canonicalize(expected), 'RECONCILIATION_PAST_OR_SCOPE_MISMATCH');
    const proposer = proposal.participants.find((p: any) => p.key === signingKeyIdentity(bundle.proposal));
    need(proposer && bundle.proposal.world_id === proposer.admin_id && bundle.proposal.receiver_particular === proposer.admin_id && bundle.proposal.crossing_id === 'sovereign:reconcile:' + sorted(bundle.views.map(v => latest(v)!)), 'RECONCILIATION_PROPOSER_OR_PARENT_MISMATCH');
    out.known_conflict_ids = expected.conflict_ids; out.ready_for_decision = true;
    const seen = new Set<string>();
    for (const r of bundle.decisions) {
      await signed(r); exact(r.extensions, ['sovereign_edge_decision'], 'INVALID_SOVEREIGN_EDGE_DECISION'); const d = body(r, 'sovereign_edge_decision');
      exact(d, ['schema','admin_id','proposal_id','slot','version','own_genesis','own_history_head','own_observation_head','peer_key','peer_genesis','acknowledged_conflicts','decision','scope','sovereignty_import'], 'INVALID_SOVEREIGN_EDGE_DECISION');
      const participant = proposal.participants.find((p: any) => p.admin_id === d.admin_id), peer = proposal.participants.find((p: any) => p.admin_id !== d.admin_id);
      need(participant && peer && participant.key === signingKeyIdentity(r) && r.world_id === d.admin_id && r.receiver_particular === d.admin_id, 'SOVEREIGN_EDGE_DECISION_SIGNER_OR_ROLE_MISMATCH');
      need(d.schema === 'relatte.sovereign-edge-decision/v0' && d.proposal_id === bundle.proposal.receipt_id && r.crossing_id === d.proposal_id && d.slot === proposal.slot && d.version === proposal.version && d.own_genesis === participant.genesis_id && d.own_history_head === participant.head_id && d.own_observation_head === participant.observation_head, 'SOVEREIGN_EDGE_DECISION_PARENT_MISMATCH');
      need(d.peer_key === peer.key && d.peer_genesis === peer.genesis_id && d.scope === 'THIS_NEW_EDGE_ONLY' && d.sovereignty_import === false, 'EXPLICIT_SCOPED_PEER_CHOICE_REQUIRED');
      need(Array.isArray(d.acknowledged_conflicts) && sorted(d.acknowledged_conflicts) === sorted(expected.conflict_ids), 'LOCAL_CONTRADICTION_NOT_ACKNOWLEDGED');
      need(!seen.has(d.admin_id), 'SOVEREIGN_EDGE_DECISION_EQUIVOCATION_OR_DUPLICATE'); seen.add(d.admin_id);
      need(d.decision === 'ADMIT', 'SOVEREIGN_EDGE_LOCALLY_REFUSED');
    }
    if (seen.size !== 2) { out.reasons.push('BOTH_FRESH_SOVEREIGN_DECISIONS_REQUIRED'); return out; }
    out.ready_for_closure = true; const closed = new Set<string>();
    for (const r of bundle.closures) {
      await signed(r); exact(r.extensions, ['sovereign_edge_closure'], 'INVALID_SOVEREIGN_EDGE_CLOSURE'); const c = body(r, 'sovereign_edge_closure');
      exact(c, ['schema','admin_id','proposal_id','core_digest','scope'], 'INVALID_SOVEREIGN_EDGE_CLOSURE');
      const participant = proposal.participants.find((p: any) => p.admin_id === c.admin_id);
      need(participant && participant.key === signingKeyIdentity(r) && r.world_id === c.admin_id && r.receiver_particular === c.admin_id, 'SOVEREIGN_EDGE_CLOSURE_SIGNER_MISMATCH');
      need(c.schema === 'relatte.sovereign-edge-closure/v0' && c.proposal_id === bundle.proposal.receipt_id && r.crossing_id === c.proposal_id && c.scope === 'THIS_FROZEN_EDGE_ONLY', 'SOVEREIGN_EDGE_CLOSURE_BINDING_MISMATCH');
      need(c.core_digest === sovereignEdgeCoreDigest(bundle), 'FROZEN_SOVEREIGN_EDGE_EVIDENCE_CHANGED');
      need(!closed.has(c.admin_id), 'DUPLICATE_SOVEREIGN_EDGE_CLOSURE'); closed.add(c.admin_id);
    }
    if (closed.size !== 2) { out.reasons.push('BOTH_SOVEREIGN_EDGE_CLOSURES_REQUIRED'); return out; }
    out.status = 'MUTUALLY_WITNESSED'; out.evidence_level = 'E3 CORROBORATED-KEYS'; out.confidence = 3;
    out.joint_edge_id = sovereignEdgeId(bundle); out.authority_scope = 'THIS_NEW_EDGE_ONLY';
    out.reasons.push('KNOWN_CONTRADICTIONS_RETAINED', 'BOTH_PASTS_RETAINED', 'ADMINISTRATIVE_INDEPENDENCE_UNOBSERVED');
  } catch (e) { out.ready_for_decision = false; out.ready_for_closure = false; out.reasons.push(e instanceof Error ? e.message : 'INVALID_SOVEREIGN_EDGE'); }
  return out;
}
