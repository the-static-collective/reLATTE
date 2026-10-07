import {
  generateP256KeyPair, sealReceipt, signingKeyIdentity,
  bootstrapCoreDigest, bootstrapRecordIds, type P256KeyMaterial, type BootstrapBundle, type BootstrapRootPin, type PublicRecord,
} from '../../src/index.ts';

export const BOOTSTRAP_TIME = '2026-10-07T00:00:00.000Z';
export async function bootstrapReceipt(extension: string, data: any, keys: P256KeyMaterial, admin: string, crossing: string, createdAt = BOOTSTRAP_TIME) {
  return sealReceipt({ schema: 'relatte.receipt/v0', crossing_id: crossing, world_id: admin,
    receiver_particular: admin, kind: 'RECEIVED', semantic_effect: 'none', created_at: createdAt,
    extensions: { [extension]: data } }, keys);
}
export async function journalEvent(keys: P256KeyMaterial, admin: string, records: PublicRecord[], kind: string, data: any) {
  const parent = records.at(-1)?.receipt_id ?? null;
  return bootstrapReceipt('bootstrap_journal', { schema: 'relatte.bootstrap-journal/v0', admin_id: admin, kind, parent, data }, keys, admin, parent ?? 'bootstrap:genesis');
}
export function journalPin(journal: { admin_id: string; records: PublicRecord[] }): BootstrapRootPin {
  return { admin_id: journal.admin_id, key: signingKeyIdentity(journal.records[0]), genesis_id: journal.records[0].receipt_id, head_id: journal.records.at(-1)!.receipt_id };
}
export async function signProposal(s: any, body = s.bundle.proposal.extensions.bootstrap_proposal, key = s.keys[0]) {
  return bootstrapReceipt('bootstrap_proposal', body, key, s.bundle.journals[0].admin_id,
    'bootstrap:join:' + JSON.stringify(s.bundle.journals.map((j: any) => j.records.at(-1).receipt_id).sort()));
}
export async function signDecision(s: any, index: number, options: any = {}) {
  const proposal = options.proposal ?? s.bundle.proposal; const body = proposal.extensions.bootstrap_proposal;
  const own = body.participants[index], peer = body.participants[1 - index];
  return bootstrapReceipt('bootstrap_decision', { schema: 'relatte.bootstrap-local-decision/v0', admin_id: own.admin_id,
    proposal_id: proposal.receipt_id, base_head: own.head_id, local_genesis: own.genesis_id, peer_key: peer.key, peer_genesis: peer.genesis_id,
    decision: 'ADMIT', scope: 'THIS_FUTURE_POLICY_EDGE_ONLY', selection_basis: 'EXPLICIT_LOCAL_ROOT_DECISION', decision_nonce: crypto.randomUUID(),
    ...options.fields }, options.key ?? s.keys[index], options.admin ?? own.admin_id, options.crossing ?? proposal.receipt_id);
}
export async function closeEncounter(s: any) {
  s.bundle.closures = await Promise.all(s.keys.map((key: P256KeyMaterial, i: number) => bootstrapReceipt('bootstrap_closure', {
    schema: 'relatte.bootstrap-closure/v0', admin_id: s.bundle.journals[i].admin_id,
    core_digest: bootstrapCoreDigest(s.bundle), record_ids: bootstrapRecordIds(s.bundle),
    local_head: s.bundle.journals[i].records.at(-1).receipt_id, proposal_id: s.bundle.proposal.receipt_id,
    scope: 'THIS_FROZEN_ENCOUNTER_ONLY',
  }, key, s.bundle.journals[i].admin_id, s.bundle.proposal.receipt_id)));
}
export async function bootstrapScenario(rootKeys?: P256KeyMaterial[], policyMaterial?: P256KeyMaterial) {
  const keys = rootKeys ?? [await generateP256KeyPair(), await generateP256KeyPair()];
  const admins = [crypto.randomUUID(), crypto.randomUUID()];
  // Existing local roots have independent constitutions before P's public acts.
  const journals = await Promise.all(keys.map(async (key, i) => ({ admin_id: admins[i], records: [await journalEvent(key, admins[i], [], 'GENESIS', { scope: 'SOVEREIGN_LOCAL_ROOT', constitution_nonce: crypto.randomUUID() })] })));
  const genesisPins = journals.map(journalPin);
  const policyKey = policyMaterial ?? await generateP256KeyPair(); const policyFingerprint = signingKeyIdentity({ signing: { public_key: policyKey.publicKeyJwk } });
  const slot = crypto.randomUUID();
  for (let i = 0; i < 2; i++) journals[i].records.push(await journalEvent(keys[i], admins[i], journals[i].records, 'DELEGATE_POLICY', { policy_key: policyFingerprint, slot, version: 1, scope: 'ONE_DECLARED_POLICY_SLOT' }));
  const delegationIds = journals.map(j => j.records.at(-1)!.receipt_id);
  const policy_claims = await Promise.all(['SOURCE_MAY_SELF_ADMIT', 'RECEIVER_MUST_ATTEST'].map((rule, i) => bootstrapReceipt('bootstrap_policy', {
    schema: 'relatte.bootstrap-policy/v0', slot, version: 1, scope: 'ONE_RULE_FOR_BOTH_ADMINS', basis_heads: [delegationIds[i]],
    terms: { handoff_rule: rule },
  }, policyKey, 'policy:P', 'bootstrap:policy:' + slot)));
  for (let i = 0; i < 2; i++) journals[i].records.push(await journalEvent(keys[i], admins[i], journals[i].records, 'SELECT_POLICY', { claim_id: policy_claims[i].receipt_id }));
  const beforeMeeting: BootstrapBundle = { schema: 'relatte.trust-bootstrap-bundle/v0', journals: structuredClone(journals), policy_claims: structuredClone(policy_claims), proposal: null, decisions: [], closures: [] };
  const beforePins = journals.map(journalPin);
  for (let i = 0; i < 2; i++) journals[i].records.push(await journalEvent(keys[i], admins[i], journals[i].records, 'OBSERVE_CONFLICT', { claim_ids: policy_claims.map(r => r.receipt_id).sort() }));
  const roots = journals.map(journalPin);
  const body = { schema: 'relatte.bootstrap-proposal/v0', proposal_nonce: crypto.randomUUID(), slot, version: 2,
    participants: journals.map((j, i) => ({ ...roots[i], prior_policy_id: policy_claims[i].receipt_id })),
    conflict_ids: policy_claims.map(r => r.receipt_id).sort(),
    terms: { scope: 'FUTURE_CROSS_ADMIN_HANDOFFS', quorum: 2, membership: 'EXACT_EDGE_PARTICIPANTS', root_import: false, history_rewrite: false },
    activation: 'AFTER_BOTH_LOCAL_ADMISSIONS', history_mode: 'RETAIN_BOTH_UNCHANGED' };
  const bundle: BootstrapBundle = { schema: 'relatte.trust-bootstrap-bundle/v0', journals, policy_claims, proposal: null, decisions: [], closures: [] };
  const s = { keys, policyKey, genesisPins, beforeMeeting, beforePins, roots, bundle };
  bundle.proposal = await signProposal(s, body);
  bundle.decisions = await Promise.all([signDecision(s, 0), signDecision(s, 1)]);
  await closeEncounter(s);
  return s;
}
