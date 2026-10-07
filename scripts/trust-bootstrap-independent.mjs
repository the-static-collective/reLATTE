/** Independent bootstrap semantics, native P-256 verification/ID rebuilding.
 * No primary assessor, policy helper, protocol.ts or canonical.ts imports.
 * Shared native receipt primitive and strict JSON ingress are declared limits.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { canon, fingerprint, publicOnly, signedRecord } from './foundation-of-trust-independent.mjs';
import { parseEvidenceJson } from '../src/evidence-json.ts';
const need = (v, reason) => { if (!v) throw new Error(reason); };
const exact = (v, fields) => need(v && typeof v === 'object' && !Array.isArray(v) && canon(Object.keys(v).sort()) === canon([...fields].sort()), 'UNEXPECTED_OR_MISSING_FIELD');
const digest = (domain, body) => createHash('sha256').update(domain + canon(body)).digest('hex');
const sort = ids => canon([...ids].sort());
const event = r => r.extensions.bootstrap_journal;
const policy = r => r.extensions.bootstrap_policy;
const top = j => j.records.at(-1).receipt_id;
const key = j => fingerprint(j.records[0]);
function signed(r) { signedRecord(r); need(r.kind === 'RECEIVED' && r.semantic_effect === 'none', 'BOOTSTRAP_RECEIPT_ROLE_MISMATCH'); }
function journal(j) {
  exact(j, ['admin_id','records']); need(typeof j.admin_id === 'string' && j.admin_id && Array.isArray(j.records) && j.records.length >= 3, 'INCOMPLETE_ADMIN_HISTORY');
  let parent = null, delegated = false, selected = false; const ids = new Set();
  for (const [i, r] of j.records.entries()) {
    signed(r); exact(r.extensions, ['bootstrap_journal']); const e = event(r);
    exact(e, ['schema','admin_id','kind','parent','data']);
    need(fingerprint(r) === key(j) && e.schema === 'relatte.bootstrap-journal/v0' && e.admin_id === j.admin_id && r.world_id === j.admin_id && r.receiver_particular === j.admin_id, 'ADMIN_JOURNAL_ROLE_OR_SIGNER_MISMATCH');
    need(e.parent === parent && r.crossing_id === (parent ?? 'bootstrap:genesis'), 'HISTORY_PARENT_MISMATCH');
    need(!ids.has(r.receipt_id), 'DUPLICATE_HISTORY_RECORD'); ids.add(r.receipt_id);
    if (i === 0) { exact(e.data, ['scope','constitution_nonce']); need(e.kind === 'GENESIS' && e.data.scope === 'SOVEREIGN_LOCAL_ROOT' && typeof e.data.constitution_nonce === 'string' && e.data.constitution_nonce.length, 'INVALID_ADMIN_GENESIS'); }
    else if (e.kind === 'DELEGATE_POLICY') {
      exact(e.data, ['policy_key','slot','version','scope']); need(!delegated && !selected && e.data.scope === 'ONE_DECLARED_POLICY_SLOT' && /^[a-f0-9]{64}$/.test(e.data.policy_key) && typeof e.data.slot === 'string' && e.data.slot.length && Number.isSafeInteger(e.data.version) && e.data.version >= 1, 'INVALID_POLICY_DELEGATION'); delegated = true;
    } else if (e.kind === 'SELECT_POLICY') { exact(e.data, ['claim_id']); need(delegated && !selected && typeof e.data.claim_id === 'string', 'INVALID_POLICY_SELECTION'); selected = true; }
    else if (e.kind === 'OBSERVE_CONFLICT') { exact(e.data, ['claim_ids']); need(selected && Array.isArray(e.data.claim_ids) && e.data.claim_ids.length >= 2 && new Set(e.data.claim_ids).size === e.data.claim_ids.length, 'INVALID_CONFLICT_OBSERVATION'); }
    else throw new Error('UNSUPPORTED_HISTORY_EVENT');
    parent = r.receipt_id;
  }
  need(delegated && selected, 'INCOMPLETE_ADMIN_HISTORY');
}
export function independentlyVerifyBootstrap(bundle, localRoot) {
  const result = { status: 'HOLD', evidence_level: 'E0 UNOBSERVED', evidence_subject: 'THIS_MUTUAL_POLICY_EDGE', conflict: 'UNOBSERVED', conflict_ids: [], historical_selections: [], joint_edge_id: null, foreign_root_imported: false, administrative_independence: 'UNOBSERVED', reasons: [] };
  try {
    canon(bundle); publicOnly(bundle); exact(bundle, ['schema','journals','policy_claims','proposal','decisions','closures']);
    need(bundle.schema === 'relatte.trust-bootstrap-bundle/v0' && Array.isArray(bundle.journals) && bundle.journals.length === 2 && Array.isArray(bundle.policy_claims) && Array.isArray(bundle.decisions) && Array.isArray(bundle.closures), 'INVALID_BOOTSTRAP_BUNDLE');
    bundle.journals.forEach(journal); need(new Set(bundle.journals.map(j => j.admin_id)).size === 2 && new Set(bundle.journals.map(key)).size === 2, 'ROOTS_NOT_DISTINCT');
    if (localRoot) { const own = bundle.journals.find(j => j.admin_id === localRoot.admin_id); need(own && key(own) === localRoot.key && own.records[0].receipt_id === localRoot.genesis_id, 'LOCAL_ROOT_SELECTION_MISMATCH'); need(top(own) === localRoot.head_id, 'PINNED_LOCAL_HISTORY_CHANGED'); }
    const delegations = bundle.journals.map(j => event(j.records.find(r => event(r).kind === 'DELEGATE_POLICY')).data);
    need(canon(delegations[0]) === canon(delegations[1]), 'NO_COMMON_ATTRIBUTABLE_POLICY_SLOT'); const slot = delegations[0];
    need(!bundle.journals.some(j => key(j) === slot.policy_key), 'POLICY_KEY_IS_ADMIN_ROOT');
    const { closures: _, ...core } = bundle; const recordIds = [...bundle.journals.flatMap(j => j.records), ...bundle.policy_claims, ...(bundle.proposal ? [bundle.proposal] : []), ...bundle.decisions].map(r => r.receipt_id).sort();
    const closureAdmins = new Set();
    for (const r of bundle.closures) {
      signed(r); exact(r.extensions, ['bootstrap_closure']); const c = r.extensions.bootstrap_closure;
      exact(c, ['schema','admin_id','core_digest','record_ids','local_head','proposal_id','scope']); const j = bundle.journals.find(j => j.admin_id === c.admin_id);
      need(j && fingerprint(r) === key(j) && r.world_id === c.admin_id && r.receiver_particular === c.admin_id, 'CLOSURE_SIGNER_OR_ROLE_MISMATCH');
      need(c.schema === 'relatte.bootstrap-closure/v0' && c.scope === 'THIS_FROZEN_ENCOUNTER_ONLY' && c.proposal_id === bundle.proposal?.receipt_id && r.crossing_id === c.proposal_id && c.local_head === top(j), 'CLOSURE_BINDING_MISMATCH');
      need(c.core_digest === digest('reLATTE-BootstrapCore-v0|', core) && Array.isArray(c.record_ids) && sort(c.record_ids) === sort(recordIds), 'FROZEN_ENCOUNTER_EVIDENCE_CHANGED');
      need(!closureAdmins.has(c.admin_id), 'DUPLICATE_ENCOUNTER_CLOSURE'); closureAdmins.add(c.admin_id);
    }
    const ids = new Set();
    for (const r of bundle.policy_claims) {
      signed(r); exact(r.extensions, ['bootstrap_policy']); const b = policy(r);
      exact(b, ['schema','slot','version','scope','basis_heads','terms']);
      exact(b.terms, ['handoff_rule']); need(['SOURCE_MAY_SELF_ADMIT','RECEIVER_MUST_ATTEST'].includes(b.terms.handoff_rule), 'INVALID_POLICY_TERMS');
      need(b.schema === 'relatte.bootstrap-policy/v0' && b.slot === slot.slot && b.version === slot.version && b.scope === 'ONE_RULE_FOR_BOTH_ADMINS' && fingerprint(r) === slot.policy_key, 'POLICY_SIGNER_OR_SLOT_MISMATCH');
      need(r.crossing_id === 'bootstrap:policy:' + slot.slot, 'POLICY_BINDING_MISMATCH');
      need(!ids.has(r.receipt_id), 'DUPLICATE_POLICY_ACCOUNT'); ids.add(r.receipt_id);
    }
    result.historical_selections = bundle.journals.map(j => event(j.records.find(r => event(r).kind === 'SELECT_POLICY')).data.claim_id);
    need(result.historical_selections.every(id => ids.has(id)), 'HISTORICAL_POLICY_ACCOUNT_MISSING');
    need(new Set(bundle.policy_claims.map(r => canon(policy(r).terms))).size > 1, 'POLICY_EQUIVOCATION_NOT_OBSERVED'); result.conflict = 'EQUIVOCATION'; result.conflict_ids = [...ids].sort();
    const delegationIds = bundle.journals.map(j => j.records.find(r => event(r).kind === 'DELEGATE_POLICY').receipt_id);
    for (const r of bundle.policy_claims) { const parents = policy(r).basis_heads; need(Array.isArray(parents) && parents.length >= 1 && new Set(parents).size === parents.length && parents.every(id => delegationIds.includes(id)), 'POLICY_CAUSAL_BASIS_MISMATCH'); }
    for (let i = 0; i < 2; i++) need(policy(bundle.policy_claims.find(r => r.receipt_id === result.historical_selections[i])).basis_heads.includes(delegationIds[i]), 'LOCAL_POLICY_CAUSAL_BINDING_MISSING');
    for (const j of bundle.journals) {
      const observations = j.records.filter(r => event(r).kind === 'OBSERVE_CONFLICT');
      if (bundle.proposal) need(observations.some(r => sort(event(r).data.claim_ids) === sort(result.conflict_ids)), 'LOCAL_CONFLICT_OBSERVATION_MISSING');
      need(observations.every(r => event(r).data.claim_ids.every(id => ids.has(id))), 'KNOWN_CONFLICT_ACCOUNT_MISSING');
    }
    need(localRoot, 'NO_LOCAL_ROOT_SELECTION'); need(bundle.proposal, 'NO_MUTUAL_POLICY_EDGE');
    const r = bundle.proposal; signed(r); exact(r.extensions, ['bootstrap_proposal']); const b = r.extensions.bootstrap_proposal;
    exact(b, ['schema','proposal_nonce','slot','version','participants','conflict_ids','terms','activation','history_mode']);
    need(b.schema === 'relatte.bootstrap-proposal/v0' && typeof b.proposal_nonce === 'string' && b.proposal_nonce.length && b.slot === slot.slot && b.version === slot.version + 1, 'INVALID_JOINT_POLICY_VERSION');
    need(Array.isArray(b.conflict_ids) && sort(b.conflict_ids) === sort(result.conflict_ids), 'PROPOSAL_DISPUTE_BINDING_MISMATCH');
    need(b.activation === 'AFTER_BOTH_LOCAL_ADMISSIONS' && b.history_mode === 'RETAIN_BOTH_UNCHANGED', 'RETROACTIVE_CONVERGENCE_FORBIDDEN');
    exact(b.terms, ['scope','quorum','membership','root_import','history_rewrite']);
    need(b.terms.scope === 'FUTURE_CROSS_ADMIN_HANDOFFS' && b.terms.quorum === 2 && b.terms.membership === 'EXACT_EDGE_PARTICIPANTS' && b.terms.root_import === false && b.terms.history_rewrite === false, 'ROOT_IMPORT_OR_HISTORY_REWRITE_FORBIDDEN');
    need(Array.isArray(b.participants) && b.participants.length === 2, 'INVALID_EDGE_PARTICIPANTS');
    for (const j of bundle.journals) {
      const p = b.participants.find(p => p.admin_id === j.admin_id); exact(p, ['admin_id','key','genesis_id','head_id','prior_policy_id']);
      need(p.key === key(j) && p.genesis_id === j.records[0].receipt_id && p.head_id === top(j), 'PROPOSAL_HISTORY_OR_ROOT_MISMATCH');
      need(p.prior_policy_id === event(j.records.find(r => event(r).kind === 'SELECT_POLICY')).data.claim_id, 'HISTORICAL_SELECTION_REWRITE');
    }
    const proposer = b.participants.find(p => p.key === fingerprint(r));
    need(proposer && r.world_id === proposer.admin_id && r.receiver_particular === proposer.admin_id && r.crossing_id === 'bootstrap:join:' + sort(bundle.journals.map(top)), 'PROPOSAL_SIGNER_OR_PARENT_MISMATCH');
    const admins = new Set();
    for (const choice of bundle.decisions) {
      signed(choice); exact(choice.extensions, ['bootstrap_decision']); const c = choice.extensions.bootstrap_decision;
      exact(c, ['schema','admin_id','proposal_id','base_head','local_genesis','peer_key','peer_genesis','decision','scope','selection_basis','decision_nonce']);
      const own = b.participants.find(p => p.admin_id === c.admin_id), peer = b.participants.find(p => p.admin_id !== c.admin_id);
      need(own && peer && fingerprint(choice) === own.key && choice.world_id === c.admin_id && choice.receiver_particular === c.admin_id, 'LOCAL_DECISION_SIGNER_OR_ROLE_MISMATCH');
      need(c.schema === 'relatte.bootstrap-local-decision/v0' && c.proposal_id === r.receipt_id && choice.crossing_id === r.receipt_id && c.base_head === own.head_id && c.local_genesis === own.genesis_id, 'LOCAL_DECISION_PARENT_MISMATCH');
      need(c.peer_key === peer.key && c.peer_genesis === peer.genesis_id && c.scope === 'THIS_FUTURE_POLICY_EDGE_ONLY' && c.selection_basis === 'EXPLICIT_LOCAL_ROOT_DECISION' && typeof c.decision_nonce === 'string' && c.decision_nonce.length, 'LOCAL_PEER_SELECTION_MISMATCH');
      need(['ADMIT','REFUSE'].includes(c.decision), 'INVALID_LOCAL_ADMISSION'); need(!admins.has(c.admin_id), 'LOCAL_DECISION_EQUIVOCATION_OR_DUPLICATE'); admins.add(c.admin_id); need(c.decision === 'ADMIT', 'LOCAL_ADMISSION_REFUSED');
    }
    need(admins.size === 2, 'BOTH_LOCAL_ADMISSIONS_REQUIRED'); need(closureAdmins.size === 2, 'BOTH_FROZEN_ENCOUNTER_CLOSURES_REQUIRED');
    const edgeId = 'relatte-bootstrap-edge-v0:' + digest('reLATTE-BootstrapEdge-v0|', { proposal_id: r.receipt_id, decision_ids: bundle.decisions.map(r => r.receipt_id).sort() });
    need(!localRoot.active_edge_id || localRoot.active_edge_id === edgeId, 'KNOWN_ACTIVE_POLICY_FORK');
    result.status = 'MUTUALLY_WITNESSED'; result.evidence_level = 'E3 CORROBORATED-KEYS'; result.joint_edge_id = edgeId;
  } catch (e) { result.reasons.push(e.message); }
  return result;
}
if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const [bundlePath, rootPath] = process.argv.slice(2);
  const result = independentlyVerifyBootstrap(parseEvidenceJson(await readFile(bundlePath, 'utf8')), rootPath ? parseEvidenceJson(await readFile(rootPath, 'utf8')) : undefined);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n'); process.exitCode = result.status === 'MUTUALLY_WITNESSED' ? 0 : 1;
}
