import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  assessTrustBootstrap, verifyReceipt, canonicalize, generateP256KeyPair, validateTrustRootGraph, parseEvidenceJson,
  type BootstrapBundle,
} from '../src/index.ts';
import { bootstrapScenario, signDecision, signProposal, bootstrapReceipt, journalEvent, journalPin, closeEncounter } from './support/bootstrap.ts';
// Independent high-level semantics and native receipt verifier; shared strict ingress.
// @ts-ignore Standalone JS verification implementation.
import { independentlyVerifyBootstrap } from '../scripts/trust-bootstrap-independent.mjs';
// @ts-ignore Standalone process campaign.
import { generateBootstrapSpecimen, replayBootstrap } from '../scripts/trust-bootstrap-specimen.mjs';

const hold = (r: any, reason: string) => { assert.equal(r.status, 'HOLD'); assert.ok(r.reasons.includes(reason), JSON.stringify(r)); assert.equal(r.foreign_root_imported, false); };
const assess = (s: any, side = 0, bundle = s.bundle) => assessTrustBootstrap({ bundle, local_root: s.roots[side] });

test('BOOTSTRAP: P disagreement is discoverable before accepting a foreign root', async () => {
  const s = await bootstrapScenario();
  for (let i = 0; i < 2; i++) {
    const result = await assessTrustBootstrap({ bundle: s.beforeMeeting, local_root: s.beforePins[i] });
    hold(result, 'FOREIGN_ROOT_NOT_LOCALLY_SELECTED'); assert.equal(result.conflict, 'EQUIVOCATION');
    assert.equal(result.conflict_ids.length, 2); assert.equal(result.automatic_convergence, false);
    assert.notEqual(result.historical_selections[0], result.historical_selections[1]);
  }
  assert.equal(await verifyReceipt(s.bundle.policy_claims[0]), true); assert.equal(await verifyReceipt(s.bundle.policy_claims[1]), true);
});

test('BOOTSTRAP: compatible double signatures never select a newcomer local root', async () => {
  const s = await bootstrapScenario(); const result = await assessTrustBootstrap({ bundle: s.bundle });
  hold(result, 'NO_LOCAL_ROOT_SELECTION'); assert.equal(result.authority_scope, 'NONE'); assert.equal(result.local_admission, 'UNOBSERVED');
});

test('BOOTSTRAP: local decision and bilateral edge preserve both incompatible histories', async () => {
  const s = await bootstrapScenario(); const before = canonicalize(s.bundle.journals);
  const [a, b] = await Promise.all([assess(s, 0), assess(s, 1)]);
  for (const result of [a, b]) {
    assert.equal(result.status, 'MUTUALLY_WITNESSED'); assert.equal(result.evidence_level, 'E3 CORROBORATED-KEYS');
    assert.equal(result.local_admission, 'ADMITTED_BY_SIGNED_LOCAL_DECISION'); assert.equal(result.authority_scope, 'THIS_FUTURE_POLICY_EDGE_ONLY');
    assert.equal(result.conflict, 'EQUIVOCATION'); assert.equal(result.conflict_ids.length, 2); assert.equal(result.foreign_root_imported, false);
    assert.equal(result.automatic_convergence, false); assert.equal(result.administrative_independence, 'UNOBSERVED'); assert.equal(result.historical_truth, 'UNOBSERVED');
  }
  assert.equal(a.joint_edge_id, b.joint_edge_id); assert.equal(canonicalize(s.bundle.journals), before);
  assert.notEqual(a.historical_selections[0], a.historical_selections[1]);
});

test('BOOTSTRAP: claimed root labels cannot replace the externally selected local root', async () => {
  const s = await bootstrapScenario(); const wrong = { ...s.roots[0], key: s.roots[1].key };
  hold(await assessTrustBootstrap({ bundle: s.bundle, local_root: wrong }), 'LOCAL_ROOT_SELECTION_MISMATCH');
});

for (const side of [0, 1]) {
  test(`BOOTSTRAP: ${side} withholding its local admission refuses silent convergence`, async () => {
    const s = await bootstrapScenario(); const bundle = structuredClone(s.bundle); bundle.decisions.splice(side, 1); bundle.closures = [];
    hold(await assess(s, 0, bundle), 'BOTH_LOCAL_ADMISSIONS_REQUIRED');
  });
  test(`BOOTSTRAP: ${side} can refuse a cryptographically valid proposed future edge`, async () => {
    const s = await bootstrapScenario(); s.bundle.decisions[side] = await signDecision(s, side, { fields: { decision: 'REFUSE' } });
    await closeEncounter(s); assert.equal(await verifyReceipt(s.bundle.decisions[side]), true); hold(await assess(s), 'LOCAL_ADMISSION_REFUSED');
  });
}

test('BOOTSTRAP: policy P cannot impersonate a sovereign local admission', async () => {
  const s = await bootstrapScenario(); s.bundle.decisions[1] = await signDecision(s, 1, { key: s.policyKey });
  await closeEncounter(s); assert.equal(await verifyReceipt(s.bundle.decisions[1]), true); hold(await assess(s), 'LOCAL_DECISION_SIGNER_OR_ROLE_MISMATCH');
});

test('BOOTSTRAP: sharing a policy key with an admin root defeats bounded delegation', async () => {
  const keys = [await generateP256KeyPair(), await generateP256KeyPair()], s = await bootstrapScenario(keys, keys[0]);
  assert.equal(await verifyReceipt(s.bundle.policy_claims[0]), true);
  hold(await assess(s), 'POLICY_KEY_IS_ADMIN_ROOT'); assert.equal(independentlyVerifyBootstrap(s.bundle, s.roots[0]).reasons[0], 'POLICY_KEY_IS_ADMIN_ROOT');
});

test('BOOTSTRAP: valid proposer signature with another admin role is HOLD', async () => {
  const s = await bootstrapScenario(); s.bundle.proposal = await signProposal(s, s.bundle.proposal!.extensions.bootstrap_proposal, s.keys[1]);
  s.bundle.decisions = await Promise.all([signDecision(s, 0), signDecision(s, 1)]); await closeEncounter(s);
  assert.equal(await verifyReceipt(s.bundle.proposal), true); hold(await assess(s), 'UNAUTHORIZED_PROPOSER');
  assert.equal(independentlyVerifyBootstrap(s.bundle, s.roots[0]).status, 'HOLD');
});

test('BOOTSTRAP: a valid signature on an unsupported policy rule proves no declared rule', async () => {
  const s = await bootstrapScenario(), b = s.beforeMeeting;
  b.policy_claims[0] = await bootstrapReceipt('bootstrap_policy', { ...b.policy_claims[0].extensions.bootstrap_policy, terms: { handoff_rule: 'ADMIN_ROOTS_AUTO_IMPORT' } }, s.policyKey, 'policy:P', b.policy_claims[0].crossing_id);
  assert.equal(await verifyReceipt(b.policy_claims[0]), true);
  hold(await assessTrustBootstrap({ bundle: b, local_root: s.beforePins[0] }), 'INVALID_POLICY_TERMS');
});

for (const field of ['peer_key', 'peer_genesis', 'scope', 'selection_basis', 'base_head', 'proposal_id']) {
  test(`BOOTSTRAP: valid signature with altered ${field} cannot bind local choice`, async () => {
    const s = await bootstrapScenario(); s.bundle.decisions[0] = await signDecision(s, 0, { fields: { [field]: 'malicious-alternative' } });
    await closeEncounter(s); assert.equal(await verifyReceipt(s.bundle.decisions[0]), true);
    hold(await assess(s), ['base_head', 'proposal_id'].includes(field) ? 'LOCAL_DECISION_PARENT_MISMATCH' : 'LOCAL_PEER_SELECTION_MISMATCH');
  });
}

for (const change of ['root_import', 'history_rewrite', 'history_mode', 'prior_policy_id', 'head_id', 'dispute', 'version']) {
  test(`BOOTSTRAP: signed proposal ${change} cannot rewrite or silently unify old roots`, async () => {
    const s = await bootstrapScenario(); const body = structuredClone(s.bundle.proposal!.extensions.bootstrap_proposal);
    let reason = '';
    if (change === 'root_import' || change === 'history_rewrite') { body.terms[change] = true; reason = 'ROOT_IMPORT_OR_HISTORY_REWRITE_FORBIDDEN'; }
    if (change === 'history_mode') { body.history_mode = 'REPLACE_BOTH'; reason = 'RETROACTIVE_CONVERGENCE_FORBIDDEN'; }
    if (change === 'prior_policy_id') { body.participants[1].prior_policy_id = body.participants[0].prior_policy_id; reason = 'HISTORICAL_SELECTION_REWRITE'; }
    if (change === 'head_id') { body.participants[1].head_id = 'overwritten'; reason = 'PROPOSAL_HISTORY_OR_ROOT_MISMATCH'; }
    if (change === 'dispute') { body.conflict_ids.pop(); reason = 'PROPOSAL_DISPUTE_BINDING_MISMATCH'; }
    if (change === 'version') { body.version = 1; reason = 'INVALID_JOINT_POLICY_VERSION'; }
    s.bundle.proposal = await signProposal(s, body); s.bundle.decisions = await Promise.all([signDecision(s, 0), signDecision(s, 1)]);
    await closeEncounter(s); assert.equal(await verifyReceipt(s.bundle.proposal), true); hold(await assess(s), reason);
  });
}

test('BOOTSTRAP: copied admission under a second filename is not a second admin', async () => {
  const s = await bootstrapScenario(); s.bundle.decisions = [s.bundle.decisions[0], s.bundle.decisions[0]]; await closeEncounter(s);
  hold(await assess(s), 'LOCAL_DECISION_EQUIVOCATION_OR_DUPLICATE');
});

test('BOOTSTRAP: one root signs contradictory decisions; both remain in evidence', async () => {
  const s = await bootstrapScenario(); s.bundle.decisions.push(await signDecision(s, 0, { fields: { decision: 'REFUSE' } })); await closeEncounter(s);
  hold(await assess(s), 'LOCAL_DECISION_EQUIVOCATION_OR_DUPLICATE'); assert.equal(s.bundle.decisions.length, 3);
});

test('BOOTSTRAP: replaying local admissions against a fresh proposal is HOLD', async () => {
  const s = await bootstrapScenario(); const body = { ...s.bundle.proposal!.extensions.bootstrap_proposal, proposal_nonce: crypto.randomUUID() };
  s.bundle.proposal = await signProposal(s, body); await closeEncounter(s); hold(await assess(s), 'LOCAL_DECISION_PARENT_MISMATCH');
});

test('BOOTSTRAP: valid self-signed newcomer history cannot replace a previously selected root', async () => {
  const s = await bootstrapScenario(); const newcomer = await bootstrapScenario();
  hold(await assessTrustBootstrap({ bundle: newcomer.bundle, local_root: s.roots[0] }), 'LOCAL_ROOT_SELECTION_MISMATCH');
});

test('BOOTSTRAP: missing old policy record never collapses disagreement into agreement', async () => {
  const s = await bootstrapScenario(); s.bundle.policy_claims.pop();
  hold(await assess(s), 'FROZEN_ENCOUNTER_EVIDENCE_CHANGED');
});

test('BOOTSTRAP: journal truncation is caught by independently retained head', async () => {
  const s = await bootstrapScenario(); s.bundle.journals[0].records.pop();
  hold(await assess(s), 'PINNED_LOCAL_HISTORY_CHANGED');
});

test('BOOTSTRAP: a fully re-signed replacement past cannot replace an old pinned head', async () => {
  const s = await bootstrapScenario(); const j = s.bundle.journals[0]; const old = j.records[2];
  j.records[2] = await journalEvent(s.keys[0], j.admin_id, j.records.slice(0, 2), 'SELECT_POLICY', { claim_id: s.bundle.policy_claims[1].receipt_id });
  j.records[3] = await journalEvent(s.keys[0], j.admin_id, j.records.slice(0, 3), 'OBSERVE_CONFLICT', { claim_ids: s.bundle.policy_claims.map(r => r.receipt_id).sort() });
  assert.equal(await verifyReceipt(j.records[2]), true); assert.notEqual(j.records[2].receipt_id, old.receipt_id);
  // All requisite signers cooperate to re-sign a complete replacement proof.
  // The independently retained old history head must still stop it.
  const body = structuredClone(s.bundle.proposal!.extensions.bootstrap_proposal);
  body.participants[0].head_id = j.records[3].receipt_id;
  body.participants[0].prior_policy_id = s.bundle.policy_claims[1].receipt_id;
  s.bundle.proposal = await signProposal(s, body);
  s.bundle.decisions = await Promise.all([signDecision(s, 0), signDecision(s, 1)]); await closeEncounter(s);
  hold(await assess(s), 'PINNED_LOCAL_HISTORY_CHANGED');
});

test('BOOTSTRAP: unrecorded contact cannot pretend both roots observed the dispute', async () => {
  const s = await bootstrapScenario(); s.bundle.journals[1].records.pop(); s.roots[1] = journalPin(s.bundle.journals[1]); await closeEncounter(s);
  hold(await assess(s), 'LOCAL_CONFLICT_OBSERVATION_MISSING');
});

test('BOOTSTRAP: clock hostility and benign serialization do not erase causality', async () => {
  const s = await bootstrapScenario();
  for (const i of [0, 1]) {
    const body = s.bundle.decisions[i].extensions.bootstrap_decision;
    s.bundle.decisions[i] = await bootstrapReceipt('bootstrap_decision', body, s.keys[i], body.admin_id, body.proposal_id,
      i ? '1900-01-01T00:00:00.000Z' : '2999-01-01T00:00:00.000Z');
  }
  await closeEncounter(s); const bundle = JSON.parse(JSON.stringify(s.bundle, null, 4)); assert.equal((await assess(s, 0, bundle)).status, 'MUTUALLY_WITNESSED');
  assert.equal((await assessTrustBootstrap({ bundle, local_root: s.roots[1] })).status, 'MUTUALLY_WITNESSED');
});

test('BOOTSTRAP: same underlying root with different labels or JWK metadata is HOLD', async () => {
  const key = await generateP256KeyPair(), s = await bootstrapScenario([key, key]);
  for (const j of s.bundle.journals) for (const record of j.records) assert.equal(await verifyReceipt(record), true);
  s.bundle.journals[1].records[0].signing.public_key.kid = 'independent-looking-label';
  await closeEncounter(s);
  hold(await assess(s), 'ROOT_KEYS_NOT_DISTINCT'); assert.equal(independentlyVerifyBootstrap(s.bundle, s.roots[0]).status, 'HOLD');
});

test('BOOTSTRAP: identical policy terms signed at different times are not equivocation', async () => {
  const s = await bootstrapScenario(), b = s.beforeMeeting, body = { ...b.policy_claims[1].extensions.bootstrap_policy, terms: b.policy_claims[0].extensions.bootstrap_policy.terms };
  b.policy_claims[1] = await bootstrapReceipt('bootstrap_policy', body, s.policyKey, 'policy:P', b.policy_claims[0].crossing_id, '1900-01-01T00:00:00.000Z');
  const j = b.journals[1]; j.records[2] = await journalEvent(s.keys[1], j.admin_id, j.records.slice(0, 2), 'SELECT_POLICY', { claim_id: b.policy_claims[1].receipt_id });
  const r = await assessTrustBootstrap({ bundle: b, local_root: s.beforePins[0] });
  hold(r, 'POLICY_EQUIVOCATION_NOT_OBSERVED'); assert.equal(r.conflict, 'UNOBSERVED');
  assert.equal(independentlyVerifyBootstrap(b, s.beforePins[0]).reasons[0], 'POLICY_EQUIVOCATION_NOT_OBSERVED');
});

test('BOOTSTRAP: initial local policy has no preselected peer root commitment', async () => {
  const s = await bootstrapScenario();
  for (let i = 0; i < 2; i++) {
    const body = s.bundle.policy_claims[i].extensions.bootstrap_policy, peer = s.roots[1 - i];
    assert.deepEqual(body.basis_heads, [s.bundle.journals[i].records[1].receipt_id]);
    assert.equal(canonicalize(body).includes(peer.key), false); assert.equal(canonicalize(body).includes(peer.genesis_id), false);
    assert.equal((await assess(s, i)).status, 'MUTUALLY_WITNESSED');
  }
});

test('BOOTSTRAP: P contradicts a rule and its causal basis; contradiction remains attributable', async () => {
  const s = await bootstrapScenario(), b = s.beforeMeeting;
  b.policy_claims[1] = await bootstrapReceipt('bootstrap_policy', { ...b.policy_claims[1].extensions.bootstrap_policy, basis_heads: ['invented-delegation'] }, s.policyKey, 'policy:P', b.policy_claims[1].crossing_id);
  const j = b.journals[1]; j.records[2] = await journalEvent(s.keys[1], j.admin_id, j.records.slice(0, 2), 'SELECT_POLICY', { claim_id: b.policy_claims[1].receipt_id });
  const r = await assessTrustBootstrap({ bundle: b, local_root: s.beforePins[0] });
  hold(r, 'POLICY_CAUSAL_BASIS_MISMATCH'); assert.equal(r.conflict, 'EQUIVOCATION'); assert.equal(r.conflict_ids.length, 2);
  assert.equal(await verifyReceipt(b.policy_claims[1]), true); assert.equal(independentlyVerifyBootstrap(b, s.beforePins[0]).conflict, 'EQUIVOCATION');
});

test('BOOTSTRAP: unclosed broker record listing cannot substitute for signed encounter scope', async () => {
  const s = await bootstrapScenario(); s.bundle.closures = [];
  hold(await assess(s), 'BOTH_FROZEN_ENCOUNTER_CLOSURES_REQUIRED');
});

test('BOOTSTRAP: withholding a committed conflicting decision cannot improve trust', async () => {
  const s = await bootstrapScenario(); s.bundle.decisions.push(await signDecision(s, 0, { fields: { decision: 'REFUSE' } })); await closeEncounter(s);
  const full = await assess(s); hold(full, 'LOCAL_DECISION_EQUIVOCATION_OR_DUPLICATE');
  s.bundle.decisions.pop(); const loss = await assess(s); hold(loss, 'FROZEN_ENCOUNTER_EVIDENCE_CHANGED');
  assert.ok(loss.confidence <= full.confidence); assert.equal(independentlyVerifyBootstrap(s.bundle, s.roots[0]).status, 'HOLD');
});

test('BOOTSTRAP: every closure loss or mutation remains HOLD', async () => {
  const s = await bootstrapScenario();
  for (const index of [0, 1]) {
    const b = structuredClone(s.bundle); b.closures.splice(index, 1);
    hold(await assess(s, 0, b), 'BOTH_FROZEN_ENCOUNTER_CLOSURES_REQUIRED');
    b.closures[0].extensions.bootstrap_closure.scope = 'ALL_HISTORY';
    hold(await assess(s, 0, b), 'INVALID_BOOTSTRAP_SIGNATURE');
  }
});

test('BOOTSTRAP: loss of local selection cannot turn internal proof into local authority', async () => {
  const s = await bootstrapScenario(), joined = await assess(s);
  const unselected = await assessTrustBootstrap({ bundle: s.bundle }); hold(unselected, 'NO_LOCAL_ROOT_SELECTION');
  assert.ok(unselected.confidence <= joined.confidence); assert.equal(independentlyVerifyBootstrap(s.bundle).status, 'HOLD');
});

test('BOOTSTRAP: malicious verifier output cannot supply bootstrap evidence', async () => {
  const s = await bootstrapScenario();
  (s.bundle as any).assessment = { status: 'MUTUALLY_WITNESSED', administrative_independence: 'OBSERVED' };
  hold(await assess(s), 'UNEXPECTED_BOOTSTRAP_FIELD'); assert.equal(independentlyVerifyBootstrap(s.bundle, s.roots[0]).status, 'HOLD');
});

test('BOOTSTRAP: a second valid joint edge cannot overwrite a locally retained activation', async () => {
  const s = await bootstrapScenario(), original = structuredClone(s.bundle), first = await assess(s);
  s.bundle.proposal = await signProposal(s, { ...s.bundle.proposal!.extensions.bootstrap_proposal, proposal_nonce: crypto.randomUUID() });
  s.bundle.decisions = await Promise.all([signDecision(s, 0), signDecision(s, 1)]); await closeEncounter(s);
  const local_root = { ...s.roots[0], active_edge_id: first.joint_edge_id! };
  hold(await assessTrustBootstrap({ bundle: s.bundle, local_root }), 'KNOWN_ACTIVE_POLICY_FORK');
  assert.equal(independentlyVerifyBootstrap(s.bundle, local_root).reasons[0], 'KNOWN_ACTIVE_POLICY_FORK');
  assert.equal((await assessTrustBootstrap({ bundle: original, local_root })).status, 'MUTUALLY_WITNESSED');
  // Honest limit: without the retained activation, a fresh historical verifier
  // sees another valid signed edge. No cryptographic global uniqueness proof.
  assert.equal((await assess(s)).status, 'MUTUALLY_WITNESSED');
  assert.notEqual((await assess(s)).joint_edge_id, first.joint_edge_id);
});

test('BOOTSTRAP: seeded hostile local decisions agree across implementations', async () => {
  const s = await bootstrapScenario(); let seed = 0x71b00a;
  for (let i = 0; i < 128; i++) {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    const field = ['peer_key','peer_genesis','scope','selection_basis','base_head','proposal_id'][(seed >>> 0) % 6];
    const side = (seed >>> 10) & 1;
    s.bundle.decisions = await Promise.all([signDecision(s, 0), signDecision(s, 1)]);
    s.bundle.decisions[side] = await signDecision(s, side, { fields: { [field]: crypto.randomUUID() } }); await closeEncounter(s);
    const primary = await assess(s), secondary = independentlyVerifyBootstrap(s.bundle, s.roots[0]);
    hold(primary, ['base_head','proposal_id'].includes(field) ? 'LOCAL_DECISION_PARENT_MISMATCH' : 'LOCAL_PEER_SELECTION_MISMATCH');
    assert.equal(secondary.status, primary.status); assert.equal(secondary.reasons[0], primary.reasons.at(-1));
  }
});

test('BOOTSTRAP: frozen public specimen replays across both implementations', async () => {
  const r = await replayBootstrap(); assert.equal(r.status, 'REPLAYED'); assert.equal(r.administrative_independence, 'UNOBSERVED');
  validateTrustRootGraph(parseEvidenceJson(await readFile(new URL('../fixtures/trust-bootstrap-equivocation-001/trust-root-graph.json', import.meta.url), 'utf8')) as any);
});

test('BOOTSTRAP: separate processes, dead roots and public-only receiver restart preserve both pasts', async () => {
  const s = await generateBootstrapSpecimen();
  assert.equal(s.report.restarted_B.status, 'MUTUALLY_WITNESSED'); assert.equal(s.report.original_private_keys_deleted, 'OBSERVED_IN_LOCAL_CAMPAIGN');
  for (const result of s.report.replacement_verifiers) assert.equal(result.joint_edge_id, s.report.outcomes[0].joint_edge_id);
  for (const side of s.report.history_hashes) assert.equal(side.before_is_exact_prefix, true);
  for (const result of s.report.outcomes) { assert.equal(result.conflict, 'EQUIVOCATION'); assert.equal(result.administrative_independence, 'UNOBSERVED'); }
});

test('BOOTSTRAP: deleting any dependency cannot increase a joined edge conclusion', async () => {
  const s = await bootstrapScenario(); const full = await assess(s);
  for (let mask = 1; mask < 64; mask++) {
    const b = structuredClone(s.bundle);
    if (mask & 1) b.proposal = null; if (mask & 2) b.decisions.pop(); if (mask & 4) b.policy_claims.pop();
    if (mask & 8) b.journals[0].records.pop(); if (mask & 16) b.journals[1].records.shift(); if (mask & 32) b.decisions.shift();
    const r = await assess(s, 0, b); assert.equal(r.status, 'HOLD'); assert.ok(r.confidence <= full.confidence);
  }
});
