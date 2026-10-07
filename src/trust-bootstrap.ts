/** TRUST-BOOTSTRAP-EQUIVOCATION-001. A foreign root is evidence, never a
 * locally selected authority. Bilateral future policy needs a fresh, explicit
 * edge-scoped decision signed by each pre-existing local root.
 * Administrative/human independence and honest root control remain external.
 */
import { canonicalize, canonicalizeDomainValue, sha256Hex } from './canonical.ts';
import { verifyReceipt } from './protocol.ts';
import { forbidPrivateEvidence, signingKeyIdentity, type PublicRecord } from './foundation-of-trust.ts';

export interface BootstrapRootPin { admin_id: string; key: string; genesis_id: string; head_id: string; active_edge_id?: string }
export interface BootstrapJournal { admin_id: string; records: PublicRecord[] }
export interface BootstrapBundle {
  schema: 'relatte.trust-bootstrap-bundle/v0';
  journals: BootstrapJournal[];
  policy_claims: PublicRecord[];
  proposal: PublicRecord | null;
  decisions: PublicRecord[];
  closures: PublicRecord[];
}
export interface BootstrapAssessment {
  schema: 'relatte.trust-bootstrap-assessment/v0';
  status: 'HOLD' | 'MUTUALLY_WITNESSED';
  evidence_level: 'E0 UNOBSERVED' | 'E2 SIGNED' | 'E3 CORROBORATED-KEYS';
  evidence_subject: 'THIS_MUTUAL_POLICY_EDGE';
  signature_evidence_level: 'E0 UNOBSERVED' | 'E2 SIGNED';
  confidence: number;
  reasons: string[];
  conflict: 'UNOBSERVED' | 'EQUIVOCATION';
  conflict_ids: string[];
  signature_valid_ids: string[];
  historical_heads: string[];
  historical_selections: string[];
  joint_edge_id: string | null;
  local_admission: 'UNOBSERVED' | 'ADMITTED_BY_SIGNED_LOCAL_DECISION';
  peer_admission: 'UNOBSERVED' | 'ATTRIBUTABLE_SIGNED_LOCAL_DECISION';
  foreign_root_imported: false;
  automatic_convergence: false;
  authority_scope: 'NONE' | 'THIS_FUTURE_POLICY_EDGE_ONLY';
  administrative_independence: 'UNOBSERVED';
  human_independence: 'UNOBSERVED';
  historical_truth: 'UNOBSERVED';
  global_completeness: 'UNOBSERVED';
  current_liveness: 'UNOBSERVED';
}

const requireThat = (ok: unknown, code: string): void => { if (!ok) throw new Error(code); };
function exact(value: any, fields: string[], code: string): void {
  requireThat(value && typeof value === 'object' && !Array.isArray(value), code);
  requireThat(canonicalize(Object.keys(value).sort()) === canonicalize([...fields].sort()), code);
}
const sorted = (ids: string[]): string => canonicalize([...ids].sort());
const head = (journal: BootstrapJournal): string => journal.records.at(-1)!.receipt_id;
const rootKey = (journal: BootstrapJournal): string => signingKeyIdentity(journal.records[0]);
const journalBody = (record: PublicRecord): any => record.extensions?.bootstrap_journal;
const policyBody = (record: PublicRecord): any => record.extensions?.bootstrap_policy;
export function bootstrapEdgeId(proposal: PublicRecord, decisions: PublicRecord[]): string {
  return 'relatte-bootstrap-edge-v0:' + sha256Hex(canonicalizeDomainValue('reLATTE-BootstrapEdge-v0|', {
    proposal_id: proposal.receipt_id, decision_ids: decisions.map(r => r.receipt_id).sort(),
  }));
}
export function bootstrapCoreDigest(bundle: BootstrapBundle): string {
  const { closures: _closures, ...core } = bundle;
  return sha256Hex(canonicalizeDomainValue('reLATTE-BootstrapCore-v0|', core));
}
export function bootstrapRecordIds(bundle: BootstrapBundle): string[] {
  return [...bundle.journals.flatMap(j => j.records), ...bundle.policy_claims,
    ...(bundle.proposal ? [bundle.proposal] : []), ...bundle.decisions].map(r => r.receipt_id).sort();
}

async function signature(record: PublicRecord, out: BootstrapAssessment): Promise<void> {
  requireThat(await verifyReceipt(record), 'INVALID_BOOTSTRAP_SIGNATURE');
  requireThat(record.kind === 'RECEIVED' && record.semantic_effect === 'none', 'BOOTSTRAP_RECEIPT_ROLE_MISMATCH');
  out.signature_valid_ids.push(record.receipt_id);
  out.signature_evidence_level = 'E2 SIGNED';
}
async function validateJournal(journal: BootstrapJournal, out: BootstrapAssessment): Promise<void> {
  exact(journal, ['admin_id', 'records'], 'INVALID_ADMIN_JOURNAL');
  requireThat(typeof journal.admin_id === 'string' && journal.admin_id.length && Array.isArray(journal.records) && journal.records.length >= 3, 'INCOMPLETE_ADMIN_HISTORY');
  const key = rootKey(journal); let previous: string | null = null;
  const ids = new Set<string>(); let delegated = false, selected = false;
  for (let i = 0; i < journal.records.length; i++) {
    const record = journal.records[i]; await signature(record, out);
    requireThat(signingKeyIdentity(record) === key, 'ADMIN_JOURNAL_SIGNER_CHANGED');
    requireThat(!ids.has(record.receipt_id), 'DUPLICATE_HISTORY_RECORD'); ids.add(record.receipt_id);
    exact(record.extensions, ['bootstrap_journal'], 'UNEXPECTED_JOURNAL_EXTENSION');
    const event = journalBody(record);
    exact(event, ['schema', 'admin_id', 'kind', 'parent', 'data'], 'INVALID_JOURNAL_EVENT');
    requireThat(event.schema === 'relatte.bootstrap-journal/v0' && event.admin_id === journal.admin_id && record.world_id === journal.admin_id && record.receiver_particular === journal.admin_id, 'ADMIN_JOURNAL_ROLE_MISMATCH');
    requireThat(event.parent === previous && record.crossing_id === (previous ?? 'bootstrap:genesis'), 'HISTORY_PARENT_MISMATCH');
    if (i === 0) {
      requireThat(event.kind === 'GENESIS', 'ADMIN_GENESIS_REQUIRED');
      exact(event.data, ['scope', 'constitution_nonce'], 'INVALID_ADMIN_GENESIS');
      requireThat(event.data.scope === 'SOVEREIGN_LOCAL_ROOT' && typeof event.data.constitution_nonce === 'string' && event.data.constitution_nonce.length, 'INVALID_ADMIN_GENESIS');
    } else if (event.kind === 'DELEGATE_POLICY') {
      exact(event.data, ['policy_key', 'slot', 'version', 'scope'], 'INVALID_POLICY_DELEGATION');
      requireThat(!delegated && !selected && event.data.scope === 'ONE_DECLARED_POLICY_SLOT' && typeof event.data.policy_key === 'string' && /^[a-f0-9]{64}$/.test(event.data.policy_key) && typeof event.data.slot === 'string' && event.data.slot.length && Number.isSafeInteger(event.data.version) && event.data.version >= 1, 'INVALID_POLICY_DELEGATION');
      delegated = true;
    } else if (event.kind === 'SELECT_POLICY') {
      exact(event.data, ['claim_id'], 'INVALID_POLICY_SELECTION');
      requireThat(delegated && !selected && typeof event.data.claim_id === 'string', 'INVALID_POLICY_SELECTION'); selected = true;
    } else if (event.kind === 'OBSERVE_CONFLICT') {
      exact(event.data, ['claim_ids'], 'INVALID_CONFLICT_OBSERVATION');
      requireThat(selected && Array.isArray(event.data.claim_ids) && event.data.claim_ids.length >= 2 && new Set(event.data.claim_ids).size === event.data.claim_ids.length, 'INVALID_CONFLICT_OBSERVATION');
    } else throw new Error('UNSUPPORTED_HISTORY_EVENT');
    previous = record.receipt_id;
  }
  requireThat(delegated && selected, 'INCOMPLETE_ADMIN_HISTORY');
}

function initial(): BootstrapAssessment {
  return { schema: 'relatte.trust-bootstrap-assessment/v0', status: 'HOLD', evidence_level: 'E0 UNOBSERVED', confidence: 0,
    evidence_subject: 'THIS_MUTUAL_POLICY_EDGE', signature_evidence_level: 'E0 UNOBSERVED',
    reasons: [], conflict: 'UNOBSERVED', conflict_ids: [], signature_valid_ids: [], historical_heads: [], historical_selections: [],
    joint_edge_id: null, local_admission: 'UNOBSERVED', peer_admission: 'UNOBSERVED', foreign_root_imported: false,
    automatic_convergence: false, authority_scope: 'NONE', administrative_independence: 'UNOBSERVED', human_independence: 'UNOBSERVED',
    historical_truth: 'UNOBSERVED', global_completeness: 'UNOBSERVED', current_liveness: 'UNOBSERVED' };
}

/** Caller selects its own durable root/head BEFORE receiving the foreign proof.
 * Missing selection never defaults to a self-reported bundle root. A signed
 * local decision introduces only the peer key for this exact future edge.
 */
export async function assessTrustBootstrap(args: { bundle: BootstrapBundle; local_root?: BootstrapRootPin }): Promise<BootstrapAssessment> {
  const out = initial();
  try {
    const { bundle } = args; forbidPrivateEvidence(bundle);
    exact(bundle, ['schema', 'journals', 'policy_claims', 'proposal', 'decisions', 'closures'], 'UNEXPECTED_BOOTSTRAP_FIELD');
    requireThat(bundle.schema === 'relatte.trust-bootstrap-bundle/v0' && Array.isArray(bundle.journals) && bundle.journals.length === 2 && Array.isArray(bundle.policy_claims) && Array.isArray(bundle.decisions) && Array.isArray(bundle.closures), 'INVALID_BOOTSTRAP_BUNDLE');
    for (const journal of bundle.journals) await validateJournal(journal, out);
    requireThat(new Set(bundle.journals.map(j => j.admin_id)).size === 2, 'ADMIN_LABELS_NOT_DISTINCT');
    requireThat(new Set(bundle.journals.map(rootKey)).size === 2, 'ROOT_KEYS_NOT_DISTINCT');
    const local = args.local_root && bundle.journals.find(j => j.admin_id === args.local_root!.admin_id);
    if (args.local_root) {
      requireThat(local && rootKey(local) === args.local_root.key && local.records[0].receipt_id === args.local_root.genesis_id, 'LOCAL_ROOT_SELECTION_MISMATCH');
      requireThat(head(local!) === args.local_root.head_id, 'PINNED_LOCAL_HISTORY_CHANGED');
    }
    const delegated = bundle.journals.map(j => journalBody(j.records.find(r => journalBody(r).kind === 'DELEGATE_POLICY')!).data);
    requireThat(delegated[0].policy_key === delegated[1].policy_key && delegated[0].slot === delegated[1].slot && delegated[0].version === delegated[1].version, 'NO_COMMON_ATTRIBUTABLE_POLICY_SLOT');
    const slot = delegated[0]; const claims = new Map<string, PublicRecord>();
    requireThat(!bundle.journals.some(j => rootKey(j) === slot.policy_key), 'POLICY_KEY_IS_ADMIN_ROOT');
    // Closure signatures commit the observed encounter, not global completeness.
    // A recorded contradiction cannot be removed from a frozen encounter to
    // improve its conclusion. Unsigned broker listings cannot supply closure.
    const closureAdmins = new Set<string>();
    for (const closure of bundle.closures) {
      await signature(closure, out);
      exact(closure.extensions, ['bootstrap_closure'], 'UNEXPECTED_CLOSURE_EXTENSION');
      const body = closure.extensions.bootstrap_closure;
      exact(body, ['schema', 'admin_id', 'core_digest', 'record_ids', 'local_head', 'proposal_id', 'scope'], 'INVALID_ENCOUNTER_CLOSURE');
      const journal = bundle.journals.find(j => j.admin_id === body.admin_id);
      requireThat(journal && signingKeyIdentity(closure) === rootKey(journal) && closure.world_id === body.admin_id && closure.receiver_particular === body.admin_id, 'CLOSURE_SIGNER_OR_ROLE_MISMATCH');
      requireThat(body.schema === 'relatte.bootstrap-closure/v0' && body.scope === 'THIS_FROZEN_ENCOUNTER_ONLY' && body.proposal_id === bundle.proposal?.receipt_id && closure.crossing_id === body.proposal_id && body.local_head === head(journal!), 'CLOSURE_BINDING_MISMATCH');
      requireThat(body.core_digest === bootstrapCoreDigest(bundle) && Array.isArray(body.record_ids) && sorted(body.record_ids) === sorted(bootstrapRecordIds(bundle)), 'FROZEN_ENCOUNTER_EVIDENCE_CHANGED');
      requireThat(!closureAdmins.has(body.admin_id), 'DUPLICATE_ENCOUNTER_CLOSURE'); closureAdmins.add(body.admin_id);
    }
    for (const claim of bundle.policy_claims) {
      await signature(claim, out); exact(claim.extensions, ['bootstrap_policy'], 'UNEXPECTED_POLICY_EXTENSION');
      const body = policyBody(claim);
      exact(body, ['schema', 'slot', 'version', 'scope', 'basis_heads', 'terms'], 'INVALID_BOOTSTRAP_POLICY');
      exact(body.terms, ['handoff_rule'], 'INVALID_POLICY_TERMS');
      requireThat(['SOURCE_MAY_SELF_ADMIT', 'RECEIVER_MUST_ATTEST'].includes(body.terms.handoff_rule), 'INVALID_POLICY_TERMS');
      requireThat(body.schema === 'relatte.bootstrap-policy/v0' && body.slot === slot.slot && body.version === slot.version && body.scope === 'ONE_RULE_FOR_BOTH_ADMINS' && signingKeyIdentity(claim) === slot.policy_key, 'POLICY_SIGNER_OR_SLOT_MISMATCH');
      requireThat(claim.crossing_id === 'bootstrap:policy:' + slot.slot, 'POLICY_RECEIPT_BINDING_MISMATCH');
      requireThat(!claims.has(claim.receipt_id), 'DUPLICATE_POLICY_ACCOUNT'); claims.set(claim.receipt_id, claim);
    }
    for (const journal of bundle.journals) {
      const selected = journalBody(journal.records.find(r => journalBody(r).kind === 'SELECT_POLICY')!).data.claim_id;
      requireThat(claims.has(selected), 'HISTORICAL_POLICY_ACCOUNT_MISSING'); out.historical_selections.push(selected); out.historical_heads.push(head(journal));
    }
    // Own-root causal receipts may differ before contact. They cannot silently
    // preselect a peer or turn matching policy terms into a contradiction.
    const accounts = new Set(bundle.policy_claims.map(r => canonicalize(policyBody(r).terms)));
    if (accounts.size <= 1) throw new Error('POLICY_EQUIVOCATION_NOT_OBSERVED');
    out.conflict = 'EQUIVOCATION'; out.conflict_ids = [...claims.keys()].sort(); out.reasons.push('POLICY_EQUIVOCATION');
    const delegationIds = bundle.journals.map(j => j.records.find(r => journalBody(r).kind === 'DELEGATE_POLICY')!.receipt_id);
    for (const claim of bundle.policy_claims) {
      const parents = policyBody(claim).basis_heads;
      requireThat(Array.isArray(parents) && parents.length >= 1 && new Set(parents).size === parents.length && parents.every((id: string) => delegationIds.includes(id)), 'POLICY_CAUSAL_BASIS_MISMATCH');
    }
    for (let i = 0; i < bundle.journals.length; i++) {
      const selected = out.historical_selections[i];
      requireThat(policyBody(claims.get(selected)!).basis_heads.includes(delegationIds[i]), 'LOCAL_POLICY_CAUSAL_BINDING_MISSING');
    }
    // Observation is not acceptance of the foreign root. Neither conflict nor
    // admission may be inferred from an absent/lost observation record.
    for (const journal of bundle.journals) {
      const observations = journal.records.filter(r => journalBody(r).kind === 'OBSERVE_CONFLICT');
      if (bundle.proposal) requireThat(observations.length && observations.some(r => sorted(journalBody(r).data.claim_ids) === sorted(out.conflict_ids)), 'LOCAL_CONFLICT_OBSERVATION_MISSING');
      for (const observation of observations) requireThat(journalBody(observation).data.claim_ids.every((id: string) => claims.has(id)), 'KNOWN_CONFLICT_ACCOUNT_MISSING');
    }
    if (!args.local_root) { out.reasons.push('NO_LOCAL_ROOT_SELECTION'); return out; }
    if (!bundle.proposal) { out.reasons.push('FOREIGN_ROOT_NOT_LOCALLY_SELECTED', 'NO_MUTUAL_POLICY_EDGE'); return out; }
    await signature(bundle.proposal, out);
    exact(bundle.proposal.extensions, ['bootstrap_proposal'], 'UNEXPECTED_PROPOSAL_EXTENSION');
    const proposal = bundle.proposal.extensions.bootstrap_proposal;
    exact(proposal, ['schema', 'proposal_nonce', 'slot', 'version', 'participants', 'conflict_ids', 'terms', 'activation', 'history_mode'], 'INVALID_JOINT_PROPOSAL');
    requireThat(proposal.schema === 'relatte.bootstrap-proposal/v0' && typeof proposal.proposal_nonce === 'string' && proposal.proposal_nonce.length && proposal.slot === slot.slot && proposal.version === slot.version + 1, 'INVALID_JOINT_POLICY_VERSION');
    requireThat(Array.isArray(proposal.conflict_ids) && sorted(proposal.conflict_ids) === sorted(out.conflict_ids), 'PROPOSAL_DISPUTE_BINDING_MISMATCH');
    requireThat(proposal.history_mode === 'RETAIN_BOTH_UNCHANGED' && proposal.activation === 'AFTER_BOTH_LOCAL_ADMISSIONS', 'RETROACTIVE_CONVERGENCE_FORBIDDEN');
    exact(proposal.terms, ['scope', 'quorum', 'membership', 'root_import', 'history_rewrite'], 'INVALID_FUTURE_TERMS');
    requireThat(proposal.terms.scope === 'FUTURE_CROSS_ADMIN_HANDOFFS' && proposal.terms.quorum === 2 && proposal.terms.membership === 'EXACT_EDGE_PARTICIPANTS' && proposal.terms.root_import === false && proposal.terms.history_rewrite === false, 'ROOT_IMPORT_OR_HISTORY_REWRITE_FORBIDDEN');
    requireThat(Array.isArray(proposal.participants) && proposal.participants.length === 2, 'INVALID_EDGE_PARTICIPANTS');
    for (const journal of bundle.journals) {
      const participant = proposal.participants.find((p: any) => p.admin_id === journal.admin_id);
      exact(participant, ['admin_id', 'key', 'genesis_id', 'head_id', 'prior_policy_id'], 'INVALID_EDGE_PARTICIPANT');
      requireThat(participant.key === rootKey(journal) && participant.genesis_id === journal.records[0].receipt_id && participant.head_id === head(journal), 'PROPOSAL_HISTORY_OR_ROOT_MISMATCH');
      requireThat(participant.prior_policy_id === journalBody(journal.records.find(r => journalBody(r).kind === 'SELECT_POLICY')!).data.claim_id, 'HISTORICAL_SELECTION_REWRITE');
    }
    const proposer = proposal.participants.find((p: any) => p.key === signingKeyIdentity(bundle.proposal!));
    requireThat(proposer && bundle.proposal.world_id === proposer.admin_id && bundle.proposal.receiver_particular === proposer.admin_id, 'UNAUTHORIZED_PROPOSER');
    requireThat(bundle.proposal.crossing_id === 'bootstrap:join:' + sorted(out.historical_heads), 'PROPOSAL_PARENT_BINDING_MISMATCH');
    if (!bundle.decisions.length) { out.reasons.push('EXPLICIT_LOCAL_DECISIONS_REQUIRED'); return out; }
    const decisions = new Map<string, PublicRecord>();
    for (const decision of bundle.decisions) {
      await signature(decision, out); exact(decision.extensions, ['bootstrap_decision'], 'UNEXPECTED_DECISION_EXTENSION');
      const choice = decision.extensions.bootstrap_decision;
      exact(choice, ['schema', 'admin_id', 'proposal_id', 'base_head', 'local_genesis', 'peer_key', 'peer_genesis', 'decision', 'scope', 'selection_basis', 'decision_nonce'], 'INVALID_LOCAL_DECISION');
      const participant = proposal.participants.find((p: any) => p.admin_id === choice.admin_id);
      const peer = proposal.participants.find((p: any) => p.admin_id !== choice.admin_id);
      requireThat(participant && peer && signingKeyIdentity(decision) === participant.key && decision.world_id === choice.admin_id && decision.receiver_particular === choice.admin_id, 'LOCAL_DECISION_SIGNER_OR_ROLE_MISMATCH');
      requireThat(choice.schema === 'relatte.bootstrap-local-decision/v0' && choice.proposal_id === bundle.proposal.receipt_id && decision.crossing_id === bundle.proposal.receipt_id && choice.base_head === participant.head_id && choice.local_genesis === participant.genesis_id, 'LOCAL_DECISION_PARENT_MISMATCH');
      requireThat(choice.peer_key === peer.key && choice.peer_genesis === peer.genesis_id && choice.scope === 'THIS_FUTURE_POLICY_EDGE_ONLY' && choice.selection_basis === 'EXPLICIT_LOCAL_ROOT_DECISION' && typeof choice.decision_nonce === 'string' && choice.decision_nonce.length, 'LOCAL_PEER_SELECTION_MISMATCH');
      requireThat(['ADMIT', 'REFUSE'].includes(choice.decision), 'INVALID_LOCAL_ADMISSION');
      requireThat(!decisions.has(choice.admin_id), 'LOCAL_DECISION_EQUIVOCATION_OR_DUPLICATE'); decisions.set(choice.admin_id, decision);
      requireThat(choice.decision === 'ADMIT', 'LOCAL_ADMISSION_REFUSED');
    }
    if (decisions.size !== 2) { out.reasons.push('BOTH_LOCAL_ADMISSIONS_REQUIRED'); return out; }
    if (closureAdmins.size !== 2) { out.reasons.push('BOTH_FROZEN_ENCOUNTER_CLOSURES_REQUIRED'); return out; }
    const edgeId = bootstrapEdgeId(bundle.proposal, bundle.decisions);
    requireThat(!args.local_root.active_edge_id || args.local_root.active_edge_id === edgeId, 'KNOWN_ACTIVE_POLICY_FORK');
    out.status = 'MUTUALLY_WITNESSED'; out.evidence_level = 'E3 CORROBORATED-KEYS'; out.confidence = 3;
    out.joint_edge_id = edgeId;
    out.local_admission = 'ADMITTED_BY_SIGNED_LOCAL_DECISION'; out.peer_admission = 'ATTRIBUTABLE_SIGNED_LOCAL_DECISION';
    out.authority_scope = 'THIS_FUTURE_POLICY_EDGE_ONLY';
    out.reasons.push('BILATERAL_EDGE_SCOPED_ROOT_DECISIONS', 'PASTS_RETAINED_WITH_DISAGREEMENT', 'ADMINISTRATIVE_INDEPENDENCE_UNOBSERVED');
    return out;
  } catch (e) {
    out.status = 'HOLD'; out.evidence_level = 'E0 UNOBSERVED'; out.confidence = 0;
    out.reasons.push(e instanceof Error ? e.message : 'INVALID_BOOTSTRAP_EVIDENCE'); return out;
  }
}
