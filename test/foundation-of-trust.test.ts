import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  assessFoundationBundle, assessContinuityPath, assessTwoWitnessHandoff, canonicalize, computeCrossingId,
  generateP256KeyPair, signingKeyIdentity, verifyCrossingEnvelope, verifyReceipt, parseEvidenceJson,
  createParticularConstitution, createParticularStateSurface, createParticularStateTransition,
  replayParticularity, statesShareParticular, createCapabilityGrant, hasCapability,
  createNameSurface, createNameSurfaceTransition, hasWitnessableNamePath,
  validateTrustRootGraph, sha256Hex, sealCrossingEnvelope, sealReceipt,
  createParticularEventWitness, witnessedEventExists, stateCanAccessEvent,
} from '../src/index.ts';
import { scenario, freeze, makeSource, makeReceiver, makePolicy, member, TIME, THING } from './support/foundation.ts';

const hold = (r: any, code: string) => { assert.equal(r.status, 'HOLD'); assert.ok(r.reasons.includes(code), JSON.stringify(r)); };
const assess = (s: any) => assessFoundationBundle(s);
const refreeze = async (s: any, records: any[], policy = s.policy) => ({ ...s, ...await freeze(policy, records, s.root) });

test('D: frozen baseline same-key metadata fraud is killed for cryptographic sameness', async () => {
  const fixture = JSON.parse(await readFile(new URL('../fixtures/foundation-of-trust-001/same-key-metadata-failure.json', import.meta.url), 'utf8'));
  assert.equal(fixture.baseline_result.status, 'CORROBORATED');
  assert.equal(await verifyCrossingEnvelope(fixture.crossing), true);
  assert.equal(await verifyReceipt(fixture.receipt), true);
  hold(await assessTwoWitnessHandoff({ crossing: fixture.crossing, receiver_receipt: fixture.receipt }), 'WITNESS_KEYS_NOT_DISTINCT');
});

for (const label of ['kid', 'use', 'key_ops', 'imported-twice', 'serialized-identity']) {
  test(`D: same underlying key with ${label} cannot wear two witness hats`, async () => {
    const s = await scenario();
    const receipt = await makeReceiver(s.crossing, s.keys[0]);
    if (label === 'key_ops') receipt.signing.public_key.key_ops = ['verify'];
    else if (label === 'imported-twice') {
      const exported = await crypto.subtle.exportKey('jwk', s.keys[0].privateKey);
      const imported = await crypto.subtle.importKey('jwk', exported, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
      Object.assign(receipt, await makeReceiver(s.crossing, { ...s.keys[0], privateKey: imported }));
    } else receipt.signing.public_key[label] = 'different identity';
    assert.equal(await verifyReceipt(receipt), true);
    hold(await assessTwoWitnessHandoff({ crossing: s.crossing, receiver_receipt: receipt }), 'WITNESS_KEYS_NOT_DISTINCT');
  });
}

test('E: two genuine keys under one custodian earn keys only, forever', async () => {
  const s = await scenario(); const r = await assess(s);
  assert.equal(r.status, 'VERIFIED'); assert.equal(r.evidence_level, 'E3 CORROBORATED-KEYS');
  assert.equal(r.independence_basis, 'DISTINCT_SIGNING_KEYS_ONLY');
  for (const k of ['distinct_process', 'distinct_machine', 'distinct_custody_domain', 'distinct_administrative_domain', 'distinct_human', 'non_collusion']) assert.equal(r.custody[k], 'UNOBSERVED');
  assert.equal(r.admission, 'UNOBSERVED'); assert.equal(r.authority, 'UNOBSERVED'); assert.equal(r.finality, 'UNOBSERVED');
});

test('A: pointer forgery has no consequential path even when all surfaces are copied', async () => {
  const s = await scenario({ source: 'P', receiver: 'P', relation: { kind: 'CONTINUITY', from: 'A', to: 'B', identity_basis: 'BYTE_IDENTITY' } });
  const r = await assessContinuityPath({ edges: [s], from: 'A', to: 'impostor', particular: 'P' });
  hold(r, 'NO_WITNESSED_CONTINUITY_PATH'); assert.equal(r.same_particular, false);
});

test('A: forged signature cannot authorize a pointer transition', async () => {
  const s = await scenario(); const bad = structuredClone(s.crossing); bad.signing.signature = 'A'.repeat(86);
  const changed = await refreeze(s, [bad, ...s.receipts]);
  hold(await assess(changed), 'INVALID_WITNESS_SIGNATURE');
});

test('A/J: valid structurally matching transition signed by unauthorized key stays HOLD', async () => {
  const s = await scenario();
  const outsider = await generateP256KeyPair(); const crossing = await makeSource(outsider, s.policy);
  const receipt = await makeReceiver(crossing, s.keys[1]);
  assert.equal(await verifyCrossingEnvelope(crossing), true); assert.equal(await verifyReceipt(receipt), true);
  hold(await assess({ ...await refreeze(s, [crossing, receipt]), crossing_id: crossing.crossing_id }), 'UNAUTHORIZED_SOURCE_ROLE');
});

test('A: preserve unsigned hash-only transition weakness as a structural claim, never authority', async () => {
  const p = createParticularConstitution({ world_id: 'W', lineage_root: 'L', inherited_content_ref: THING, constitution_nonce: crypto.randomUUID(), created_at: TIME });
  const a = createParticularStateSurface({ particular_id: p.particular_id, state_id: 'A', self_surface: 'A', controller_id: 'owner', accessible_event_ids: [], created_at: TIME });
  const b = createParticularStateSurface({ ...a, state_id: 'impostor', controller_id: 'attacker' });
  const invented = createParticularStateTransition({ from_surface: a, to_surface: b, created_at: TIME });
  assert.equal(statesShareParticular(replayParticularity([p, a, b, invented]), a.surface_id, b.surface_id), true);
  // Legacy structural assertion is reproducible, but never enters the signed consequential graph.
  hold(await assessContinuityPath({ edges: [], from: a.surface_id, to: b.surface_id, particular: p.particular_id }), 'NO_WITNESSED_CONTINUITY_PATH');
});

test('B: byte-identical cloned seeds independently constituted diverge on cold replay and death', () => {
  const seed = Buffer.from('identical seed bytes'); const copies = [Buffer.from(seed), Buffer.from(seed)];
  assert.deepEqual(copies[0], copies[1]);
  const constitutions = copies.map(bytes => createParticularConstitution({ world_id: 'same-world', lineage_root: 'one-ancestor', inherited_content_ref: 'sha256:' + sha256Hex(bytes), constitution_nonce: crypto.randomUUID(), created_at: TIME }));
  const [q, r] = constitutions;
  assert.equal(q.inherited_content_ref, r.inherited_content_ref); assert.equal(q.lineage_root, r.lineage_root);
  assert.notEqual(q.particular_id, r.particular_id);
  const states = constitutions.map((p, i) => createParticularStateSurface({ particular_id: p.particular_id, state_id: String(i), self_surface: 'same-surface', controller_id: String(i), accessible_event_ids: [String(i)], created_at: TIME }));
  const grant = createCapabilityGrant({ capability_id: 'dead-child-authority', subject: { kind: 'PARTICULAR', id: q.particular_id }, created_at: TIME });
  const cold = replayParticularity(JSON.parse(JSON.stringify([...constitutions, ...states, grant])));
  assert.equal(statesShareParticular(cold, states[0].surface_id, states[1].surface_id), false);
  assert.equal(hasCapability(cold, { particular_id: r.particular_id, controller_id: states[1].controller_id, capability_id: 'dead-child-authority' }), false);
  delete cold.states[states[0].surface_id];
  assert.equal(cold.states[states[1].surface_id].particular_id, r.particular_id);
});

test('B: copying a full constitution receipt cannot establish a second independent event', async () => {
  const p = createParticularConstitution({ world_id: 'W', lineage_root: 'ancestor', inherited_content_ref: THING, constitution_nonce: crypto.randomUUID(), created_at: TIME });
  const copied = JSON.parse(JSON.stringify(p));
  assert.equal(copied.particular_id, p.particular_id);
  assert.equal(Object.keys(replayParticularity([p, copied]).particulars).length, 1);
  // IDs cannot manufacture an observation of a second constitution or a
  // continuity edge. This is a successful limit attack, not an identity proof.
  hold(await assessContinuityPath({ edges: [], from: 'original', to: 'copied-process', particular: p.particular_id }), 'NO_WITNESSED_CONTINUITY_PATH');
});

test('C: A to B to C survives every surface change only with both signed edges', async () => {
  const p = crypto.randomUUID();
  const surfaces = ['A', 'B', 'C'].map((stage, i) => canonicalize({ particular_id: p, self_name: stage, controller: crypto.randomUUID(), events: i ? [] : ['e'], local_representation: stage, process: crypto.randomUUID(), transport: ['http', 'file', 'offline'][i], directory: crypto.randomUUID() }));
  const ab = await scenario({ source: p, receiver: p, relation: { kind: 'CONTINUITY', from: surfaces[0], to: surfaces[1], identity_basis: 'BYTE_IDENTITY' } });
  const bc = await scenario({ source: p, receiver: p, relation: { kind: 'CONTINUITY', from: surfaces[1], to: surfaces[2], identity_basis: 'BYTE_IDENTITY' } });
  assert.equal((await assessContinuityPath({ edges: [ab, bc], from: surfaces[0], to: surfaces[2], particular: p })).same_particular, true);
  assert.equal((await assessContinuityPath({ edges: [ab], from: surfaces[0], to: surfaces[1], particular: p })).status, 'VERIFIED');
  hold(await assessContinuityPath({ edges: [ab], from: surfaces[0], to: surfaces[2], particular: p }), 'NO_WITNESSED_CONTINUITY_PATH');
  const broken = structuredClone(bc); broken.bundle.records.pop();
  hold(await assessContinuityPath({ edges: [ab, broken], from: surfaces[0], to: surfaces[2], particular: p }), 'NO_WITNESSED_CONTINUITY_PATH');
});

for (const role of ['SOURCE', 'RECEIVER']) {
  test(`H: ${role} equivocation remains reconstructible across observer exchange and replay`, async () => {
    const s = await scenario();
    let second: any;
    if (role === 'SOURCE') second = await makeSource(s.keys[0], s.policy, { handoff: s.crossing.extensions.two_witness_handoff.handoff_id, receiver: 'contradictory-child' });
    else second = await makeReceiver(s.crossing, s.keys[1], { draft: { kind: 'REFUSED' } });
    assert.equal(role === 'SOURCE' ? await verifyCrossingEnvelope(second) : await verifyReceipt(second), true);
    const observerC = [s.crossing, s.receipts[0]]; const observerD = [second];
    const union = await refreeze(s, [...observerC, ...observerD]);
    const r = await assess(union); hold(r, 'EQUIVOCATION'); assert.ok(r.conflict_ids.includes(role === 'SOURCE' ? second.crossing_id : second.receipt_id));
    const replay = { ...union, bundle: JSON.parse(JSON.stringify(union.bundle)) };
    assert.deepEqual((await assess(replay)).conflict_ids, r.conflict_ids);
    // A broker cannot erase the contradiction from a pinned observation scope.
    replay.bundle.records.pop(); hold(await assess(replay), 'MISSING_REQUIRED_EVIDENCE');
  });
}

test('H: conflicting quorum and conflicting minority both HOLD without overwriting', async () => {
  const s = await scenario({ count: 5, quorum: 3 });
  const opposing = await Promise.all(s.keys.slice(1).map(k => makeReceiver(s.crossing, k, { draft: { kind: 'REFUSED' } })));
  hold(await assess(await refreeze(s, [...s.bundle.records, opposing[0]])), 'EQUIVOCATION');
  hold(await assess(await refreeze(s, [...s.bundle.records, ...opposing])), 'EQUIVOCATION');
});

test('I: same handoff, parties and timestamps with only payload substitution HOLD', async () => {
  const s = await scenario(); const binding = structuredClone(s.receipts[0].extensions);
  binding.two_witness_handoff.thing_ref = 'sha256:' + '0'.repeat(64);
  const receipt = await makeReceiver(s.crossing, s.keys[1], { draft: { extensions: binding } });
  assert.equal(await verifyReceipt(receipt), true);
  hold(await assess(await refreeze(s, [s.crossing, receipt])), 'HANDOFF_BINDING_DISAGREEMENT');
});

test('K: receipt replay changes only causal crossing binding and fails for that reason', async () => {
  const s = await scenario();
  const receipt = await makeReceiver(s.crossing, s.keys[1], { draft: { crossing_id: 'relatte-crossing-v0:' + 'f'.repeat(64) } });
  assert.equal(await verifyReceipt(receipt), true);
  hold(await assessTwoWitnessHandoff({ crossing: s.crossing, receiver_receipt: receipt }), 'CROSSING_ID_DISAGREEMENT');
});

test('I: semantically equivalent bytes do not silently become byte identity', async () => {
  const s = await scenario(); const bytesA = '{"a":1,"b":2}', bytesB = '{ "b":2, "a":1 }';
  assert.deepEqual(JSON.parse(bytesA), JSON.parse(bytesB)); assert.notEqual(sha256Hex(Buffer.from(bytesA)), sha256Hex(Buffer.from(bytesB)));
  const semantic = await makeSource(s.keys[0], s.policy, { relation: { kind: 'LINEAGE', from: 'P', to: 'Q', identity_basis: 'SEMANTIC_IDENTITY' } });
  const receipt = await makeReceiver(semantic, s.keys[1]);
  hold(await assess({ ...await refreeze(s, [semantic, receipt]), crossing_id: semantic.crossing_id }), 'UNSUPPORTED_IDENTITY_BASIS');
});

for (const swap of ['giver/receiver', 'source/observer', 'witness/authority', 'child/ancestor']) {
  test(`J: valid signature fails swapped ${swap} semantics`, async () => {
    const s = await scenario();
    const keys = swap === 'giver/receiver' ? s.keys[0] : await generateP256KeyPair();
    const receipt = await makeReceiver(s.crossing, keys, { draft: swap === 'child/ancestor' ? { receiver_particular: 'P' } : {} });
    assert.equal(await verifyReceipt(receipt), true);
    hold(await assess(await refreeze(s, [s.crossing, receipt])), 'UNAUTHORIZED_RECEIVER_ROLE');
  });
}

for (const swap of ['source/observer', 'witness/authority', 'child/ancestor']) {
  test(`J: authorized valid keys cannot bypass ${swap} relation semantics`, async () => {
    const s = await scenario({ count: 3 });
    const options: any = swap === 'witness/authority' ? { draft: { requested_effect: { kind: 'handoff', authority: 'inherited-ancestor-authority' } } }
      : swap === 'child/ancestor' ? { relation: { kind: 'LINEAGE', from: 'Q', to: 'P', identity_basis: 'BYTE_IDENTITY' } } : {};
    const crossing = await makeSource(swap === 'source/observer' ? s.keys[2] : s.keys[0], s.policy, options);
    const receipt = await makeReceiver(crossing, s.keys[1]);
    assert.equal(await verifyCrossingEnvelope(crossing), true); assert.equal(await verifyReceipt(receipt), true);
    hold(await assess({ ...await refreeze(s, [crossing, receipt]), crossing_id: crossing.crossing_id }),
      swap === 'source/observer' ? 'UNAUTHORIZED_SOURCE_ROLE' : swap === 'witness/authority' ? 'ROLE_AUTHORITY_ESCALATION' : 'RELATION_ROLE_DISAGREEMENT');
  });
}

for (const context of ['same world', 'fresh world', 'key rotation', 'revocation', 'receiver restart', 'source death', 'policy change']) {
  test(`K/M: historical replay after ${context} never implies current authorization`, async () => {
    const s = await scenario(); const current = { version: 'current:1', world: 'world:B', policy_id: s.policy.receipt_id, retired_keys: [] as string[], accepted_crossings: [s.crossing_id] };
    if (context === 'fresh world') current.world = 'world:fresh';
    if (context === 'key rotation' || context === 'revocation') current.retired_keys = [signingKeyIdentity(s.crossing)];
    if (context === 'policy change') current.policy_id = 'policy:v2';
    const replay = { ...s, bundle: JSON.parse(JSON.stringify(s.bundle)), current };
    const r = await assess(replay); assert.equal(r.historically_verified, true);
    assert.equal(r.currently_acceptable, !['fresh world', 'key rotation', 'revocation', 'policy change'].includes(context));
    assert.equal(r.authority, 'UNOBSERVED'); assert.equal(r.admission, 'UNOBSERVED');
  });
}

test('M: compromised old source key cannot insert a backdated act into pinned history', async () => {
  const s = await scenario(); const attacker = s.keys[0];
  const fake = await makeSource(attacker, s.policy, { time: '2000-01-01T00:00:00.000Z', handoff: 'fake-historical' });
  assert.equal(await verifyCrossingEnvelope(fake), true);
  const injected = { ...s, bundle: { ...s.bundle, records: [...s.bundle.records, fake] } };
  hold(await assess(injected), 'UNINVENTORIED_EVIDENCE');
  const newReceipt = await makeReceiver(fake, s.keys[1]);
  const newScope = await refreeze(s, [fake, newReceipt]);
  const r = await assess({ ...newScope, crossing_id: fake.crossing_id, current: { version: '2', world: 'world:B', policy_id: s.policy.receipt_id, retired_keys: [signingKeyIdentity(fake)], accepted_crossings: [fake.crossing_id] } });
  assert.equal(r.historically_verified, true); assert.equal(r.currently_acceptable, false); assert.ok(r.reasons.includes('CURRENT_KEY_RETIRED'));
  assert.equal((await assess(s)).historically_verified, true);
});

test('K: malformed current policy rejects current acceptability without damaging valid history', async () => {
  const s = await scenario(); const result = await assess({ ...s, current: { version: 'broken', retired_keys: null } });
  assert.equal(result.historically_verified, true); assert.equal(result.currently_acceptable, false); assert.ok(result.reasons.includes('INVALID_CURRENT_POLICY'));
  assert.equal(await verifyCrossingEnvelope(s.crossing), true); assert.equal(await verifyReceipt(s.receipts[0]), true);
});

test('M/N: both endpoint keys can forge compatible testimony, but cannot rewrite pinned history or prove truth', async () => {
  const s = await scenario(); const crossing = await makeSource(s.keys[0], s.policy, { handoff: 'fabricated-by-both', time: '1900-01-01T00:00:00.000Z' });
  const receipt = await makeReceiver(crossing, s.keys[1], { time: '1899-01-01T00:00:00.000Z' });
  assert.equal((await assessTwoWitnessHandoff({ crossing, receiver_receipt: receipt })).status, 'CORROBORATED');
  hold(await assess({ ...s, crossing_id: crossing.crossing_id, bundle: { ...s.bundle, records: [crossing, receipt] } }), 'MISSING_REQUIRED_EVIDENCE');
  // A separately selected new observation scope can verify the forgery's internal
  // coherence. No cryptographic check can recover truth after both keys are owned.
  const acceptedScope = await refreeze(s, [crossing, receipt]);
  const r = await assess({ ...acceptedScope, crossing_id: crossing.crossing_id });
  assert.equal(r.status, 'VERIFIED'); assert.equal(r.historical_truth, 'UNOBSERVED'); assert.equal(r.trusted_chronology, 'UNOBSERVED');
});

test('N: compromised receiver can backdate a valid receipt; chronology remains UNOBSERVED', async () => {
  const s = await scenario(); const forgedTime = await makeReceiver(s.crossing, s.keys[1], { time: '1900-01-01T00:00:00.000Z' });
  assert.equal(await verifyReceipt(forgedTime), true);
  const r = await assess(await refreeze(s, [s.crossing, forgedTime]));
  assert.equal(r.historically_verified, true); assert.equal(r.finality, 'UNOBSERVED');
  assert.equal(r.trusted_chronology, 'UNOBSERVED'); assert.equal(r.historical_truth, 'UNOBSERVED');
  // This successful attack is a preserved limit: no trusted arrival time is earned.
  assert.equal(r.custody.non_collusion, 'UNOBSERVED');
});

for (const time of ['2026-10-07T00:00:01.000Z', '2026-10-07T12:00:00.000Z', '2026-10-10T00:00:00.000Z', '2099-01-01T00:00:00.000Z', '1900-01-01T00:00:00.000Z', TIME]) {
  test(`L: hostile receipt clock ${time} does not become causality`, async () => {
    const s = await scenario(); const receipt = await makeReceiver(s.crossing, s.keys[1], { time });
    assert.equal((await assess(await refreeze(s, [s.crossing, receipt]))).status, 'VERIFIED');
    assert.equal(receipt.crossing_id, s.crossing_id);
  });
}

test('O: lying verifier output is rejected as evidence; another fresh verifier recomputes', async () => {
  const s = await scenario(); const fakeOutput = { ...s.bundle, assessment: { status: 'VERIFIED', evidence_level: 'E7' } };
  hold(await assess({ ...s, bundle: fakeOutput }), 'UNEXPECTED_BUNDLE_FIELD');
  const changed = structuredClone(s.bundle); changed.records[0].source_particular = 'fake';
  hold(await assess({ ...s, bundle: changed }), 'INVALID_WITNESS_SIGNATURE');
  assert.equal((await assess({ ...s, bundle: JSON.parse(JSON.stringify(s.bundle)) })).status, 'VERIFIED');
});

test('Q: every deletion subset of a frozen scope can only lower confidence', async () => {
  const s = await scenario({ count: 3, quorum: 2 });
  const full = await assess(s); assert.equal(full.status, 'VERIFIED');
  for (let mask = 1; mask < 32; mask++) {
    const bundle = structuredClone(s.bundle);
    if (mask & 1) bundle.policy = null; if (mask & 2) bundle.inventory = null;
    bundle.records = bundle.records.filter((_, i) => !(mask & (4 << i)));
    const r = await assess({ ...s, bundle }); assert.ok(r.confidence <= full.confidence); assert.equal(r.status, 'HOLD');
    assert.equal(r.historically_verified, false);
  }
});

test('Q: source-only inventory earns CLAIMED; empty observed scope is UNRECOVERABLE within that scope', async () => {
  const s = await scenario();
  const sourceOnly = await assess(await refreeze(s, [s.crossing]));
  assert.equal(sourceOnly.status, 'CLAIMED'); assert.equal(sourceOnly.evidence_level, 'E2 SIGNED');
  const empty = await assess(await refreeze(s, [])); assert.equal(empty.status, 'UNRECOVERABLE'); assert.equal(empty.evidence_level, 'E0 UNOBSERVED');
});

test('Q: deleting any known conflicting account never raises trust', async () => {
  const s = await scenario(); const rival = await makeSource(s.keys[0], s.policy, { handoff: s.crossing.extensions.two_witness_handoff.handoff_id, receiver: 'rival' });
  const union = await refreeze(s, [...s.bundle.records, rival]); const before = await assess(union);
  hold(before, 'EQUIVOCATION');
  for (let mask = 1; mask < 8; mask++) {
    const bundle = structuredClone(union.bundle); bundle.records = bundle.records.filter((_: any, i: number) => !(mask & (1 << i)));
    const result = await assess({ ...union, bundle }); hold(result, 'MISSING_REQUIRED_EVIDENCE'); assert.ok(result.confidence <= before.confidence);
  }
});

for (const [count, quorum] of [[2, 2], [3, 2], [5, 3]]) {
  test(`R: versioned ${quorum}-of-${count} cryptographic policy`, async () => {
    const s = await scenario({ count, quorum }); const r = await assess(s);
    assert.equal(r.status, 'VERIFIED'); assert.equal(r.quorum_kind, 'CRYPTOGRAPHIC_KEYS');
    assert.equal(r.evidence_level, quorum === 2 ? 'E3 CORROBORATED-KEYS' : 'E6 THRESHOLD');
    assert.equal(r.custody.distinct_administrative_domain, 'UNOBSERVED');
  });
}

test('R: insufficient quorum fails specifically', async () => {
  const s = await scenario({ count: 5, quorum: 3 });
  hold(await assess(await refreeze(s, [s.crossing, s.receipts[0]])), 'INSUFFICIENT_QUORUM');
});

test('R: one key cannot count twice by making two signed receipts', async () => {
  const s = await scenario({ count: 3, quorum: 3 });
  const second = await makeReceiver(s.crossing, s.keys[1], { time: '2026-10-07T00:00:01.000Z' });
  hold(await assess(await refreeze(s, [s.crossing, s.receipts[0], second])), 'DUPLICATE_SIGNER');
});

test('R: duplicate member key under separate IDs is rejected before quorum', async () => {
  const s = await scenario(); const policy = await makePolicy(s.keys, s.root, { members: [member(s.keys[0], 'SOURCE', 'P', 'world:A'), member(s.keys[0], 'RECEIVER', 'Q', 'world:B')] });
  hold(await assess(await refreeze(s, s.bundle.records, policy)), 'DUPLICATE_MEMBER_KEY');
});

for (const change of ['membership', 'removal', 'threshold']) {
  test(`R: ${change} cannot retroactively change the event policy`, async () => {
    const s = await scenario({ count: 3, quorum: 2 });
    const policy = await makePolicy(change === 'removal' ? s.keys.slice(0, 2) : s.keys, s.root, { version: '2', quorum: change === 'threshold' ? 3 : 2 });
    hold(await assess(await refreeze(s, s.bundle.records, policy)), 'EVENT_POLICY_MISMATCH');
    assert.equal((await assess(s)).status, 'VERIFIED');
  });
}

test('S: 1000 keys from one operator satisfy only Sybil-vulnerable cryptographic quorum', async () => {
  const s = await scenario({ count: 1000, quorum: 667 });
  const r = await assess(s); assert.equal(r.status, 'VERIFIED'); assert.equal(r.quorum_kind, 'CRYPTOGRAPHIC_KEYS');
  assert.ok(r.reasons.includes('SYBIL_RESISTANCE_UNOBSERVED')); assert.equal(r.custody.distinct_human, 'UNOBSERVED');
});

test('T/U: root graph must terminate in explicit assumptions and reject circular proof', () => {
  validateTrustRootGraph([{ id: 'root', class: 'ASSUMED', basis: 'external selection', depends_on: [] }, { id: 'signature', class: 'DERIVED', basis: 'P-256', depends_on: ['root'] }]);
  assert.throws(() => validateTrustRootGraph([{ id: 'A', class: 'DERIVED', basis: 'B', depends_on: ['B'] }, { id: 'B', class: 'DERIVED', basis: 'A', depends_on: ['A'] }]), /CIRCULAR_TRUST_JUSTIFICATION/);
  assert.throws(() => validateTrustRootGraph([{ id: 'A', class: 'DERIVED', basis: 'none', depends_on: [] }]), /UNFOUNDED_DERIVATION/);
});

test('T: policy signer compromise cannot change an externally pinned policy', async () => {
  const s = await scenario(); const replaced = await makePolicy(s.keys, s.root, { version: 'malicious' });
  hold(await assess({ ...s, bundle: { ...s.bundle, policy: replaced } }), 'UNTRUSTED_POLICY_ROOT');
  // Selecting a new root pin is an external decision; crypto cannot defend its own bootstrap.
  assert.equal((await assess(s)).status, 'VERIFIED');
});

test('U: a fresh verifier with bundle-supplied roots cannot silently accept them', async () => {
  const s = await scenario();
  hold(await assess({ ...s, roots: { policy_key: 'unknown', policy_id: s.policy.receipt_id, inventory_id: s.roots.inventory_id } }), 'UNTRUSTED_POLICY_ROOT');
  const fresh = await assess({ bundle: JSON.parse(JSON.stringify(s.bundle)), roots: JSON.parse(JSON.stringify(s.roots)), crossing_id: s.crossing_id });
  assert.equal(fresh.status, 'VERIFIED'); assert.ok(fresh.reasons.includes('GLOBAL_COMPLETENESS_UNOBSERVED'));
});

test('G: duplicate witness under another name cannot add quorum', async () => {
  const s = await scenario(); hold(await assess(await refreeze(s, [...s.bundle.records, s.receipts[0]])), 'DUPLICATE_INVENTORY_ID');
});

for (const attack of ['delete source', 'substitute source', 'replace receiver', 'mix runs', 'replay old pair', 'change signed bytes', 'extra semantic field']) {
  test(`G: hostile broker ${attack} cannot manufacture continuity`, async () => {
    const s = await scenario(); const other = await scenario(); const b = structuredClone(s.bundle);
    let reason = 'MISSING_REQUIRED_EVIDENCE';
    if (attack === 'delete source') b.records.shift();
    if (attack === 'substitute source') b.records[0] = other.crossing;
    if (attack === 'replace receiver' || attack === 'mix runs') b.records[1] = other.receipts[0];
    if (attack === 'replay old pair') b.records = other.bundle.records;
    if (attack === 'change signed bytes') { b.records[0].created_at = '2020-01-01T00:00:00.000Z'; reason = 'INVALID_WITNESS_SIGNATURE'; }
    if (attack === 'extra semantic field') { b.records[0].authority = 'all'; reason = 'INVALID_WITNESS_SIGNATURE'; }
    hold(await assess({ ...s, bundle: b }), reason);
  });
}

test('W: benign object key order and whitespace preserve signed identity', async () => {
  const s = await scenario();
  const reorder = (v: any): any => Array.isArray(v) ? v.map(reorder) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).reverse().map(k => [k, reorder(v[k])])) : v;
  const changed = parseEvidenceJson(JSON.stringify(reorder(s.bundle), null, 4));
  assert.equal(computeCrossingId(changed.records[0]), s.crossing_id); assert.equal((await assess({ ...s, bundle: changed })).status, 'VERIFIED');
});

for (const raw of ['{"a":1,"a":2}', '{"a":1,"\\u0061":2}', '{"nested":{"k":0,"k":1}}']) {
  test(`W: duplicate JSON keys fail at parser boundary ${raw}`, () => assert.throws(() => parseEvidenceJson(raw), /DUPLICATE_JSON_KEY/));
}
for (const raw of ['{', '{"a":}', '{"a":1} garbage', '[1,]', '{"a":NaN}', '\u00a0{}']) {
  test(`G/W: malformed JSON ${raw} has a parser oracle`, () => assert.throws(() => parseEvidenceJson(raw), /MALFORMED_ARTIFACT/));
}

for (const [name, mutation, code] of [
  ['Unicode normalization', (v: any) => { v.extensions.label = '\u00e9'; }, 'identity'],
  ['arrays reordered', (v: any) => { v.parents = ['b', 'a']; }, 'identity'],
  ['unknown field', (v: any) => { v.unearned_authority = true; }, 'invalid'],
  ['padded signature', (v: any) => { v.signing.signature += '='; }, 'signature'],
  ['malformed base64url', (v: any) => { v.signing.signature = '!'; }, 'signature'],
  ['padded coordinate', (v: any) => { v.signing.public_key.x += '='; }, 'invalid'],
  ['accessor', (v: any) => { Object.defineProperty(v, 'created_at', { get: () => TIME, enumerable: true }); }, 'ACCESSOR_PROPERTY'],
  ['non-enumerable', (v: any) => { Object.defineProperty(v, 'hidden', { value: 'authority' }); }, 'NON_ENUMERABLE_PROPERTY'],
  ['symbol', (v: any) => { v[Symbol('authority')] = true; }, 'SYMBOL_KEYED_PROPERTY'],
  ['prototype', (v: any) => { Object.setPrototypeOf(v, { authority: true }); }, 'CUSTOM_PROTOTYPE'],
  ['unsafe number', (v: any) => { v.extensions.number = Number.MAX_SAFE_INTEGER + 1; }, 'UNSAFE_INTEGER'],
] as const) {
  test(`W: ${name} changes identity or fails verification for a documented reason`, async () => {
    const s = await scenario(); const v = structuredClone(s.crossing); mutation(v);
    assert.equal(await verifyCrossingEnvelope(v), false);
    if (code === 'identity') assert.notEqual(computeCrossingId(v), s.crossing_id);
    else if (code !== 'signature' && code !== 'invalid') assert.throws(() => canonicalize(v), new RegExp(code));
  });
}

test('W: null/omitted defaults, numeric JSON spelling and slash escapes have explicit meaning', async () => {
  const s = await scenario(); const original = structuredClone(s.crossing); const omitted = structuredClone(original);
  delete omitted.source_history_head;
  assert.equal(computeCrossingId(omitted), computeCrossingId(original)); // protocol declares nullable default
  assert.equal(canonicalize(parseEvidenceJson('{"n":1.0,"s":"a\\/b"}')), canonicalize({ n: 1, s: 'a/b' }));
  assert.equal(canonicalize(-0), canonicalize(0));
  assert.notEqual(canonicalize({ label: '\u00e9' }), canonicalize({ label: 'e\u0301' }));
  assert.notEqual(canonicalize({ s: 'a/b' }), canonicalize({ s: 'a\\b' }));
  assert.notEqual(canonicalize({ v: null }), canonicalize({}));
});

test('VIII: provisional name surfaces mutate independently; carrier/ancestry never grant authority', () => {
  const p = createParticularConstitution({ world_id: 'W', lineage_root: 'ancestor', inherited_content_ref: THING, constitution_nonce: crypto.randomUUID(), created_at: TIME });
  const types = ['SACRED', 'TITLE', 'ROLE', 'SIGN', 'SPOKEN'] as const;
  for (const kind of types) {
    const [a, b, c] = ['A', 'B', 'C'].map(carrier => createNameSurface({ kind, carrier, referent_id: p.particular_id }));
    const ab = createNameSurfaceTransition({ particular_id: p.particular_id, from_surface: a, to_surface: b, transformation_kind: 'PROVISIONAL_NU', continuity_claim: 'SAME_REFERENT', created_at: TIME });
    const bc = createNameSurfaceTransition({ particular_id: p.particular_id, from_surface: b, to_surface: c, transformation_kind: 'PROVISIONAL_NU', continuity_claim: 'SAME_REFERENT', created_at: TIME });
    const check = (records: any[]) => hasWitnessableNamePath(replayParticularity([p, ...records]), { particular_id: p.particular_id, from_surface_id: a.surface_id, to_surface_id: c.surface_id, referent_id: p.particular_id });
    assert.equal(check([ab, bc]), true); assert.equal(check([ab]), false);
    const competitor = createNameSurface({ kind, carrier: 'C', referent_id: 'another-particular' });
    assert.equal(competitor.carrier, c.carrier); assert.notEqual(competitor.referent_id, c.referent_id);
    assert.equal(ab.authority_transferred, false); assert.equal(bc.authority_transferred, false);
  }
});

test('X: seeded 2048 random graphs preserve identity, gaps, authority and confidence monotonicity', async () => {
  let seed = 0x1f0a001; const next = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; };
  const s = await scenario({ count: 3, quorum: 2 }); const baseline = await assess(s);
  for (let iteration = 0; iteration < 2048; iteration++) {
    const n = next(), p = createParticularConstitution({ world_id: 'W', lineage_root: 'same', inherited_content_ref: THING, constitution_nonce: String(iteration), created_at: TIME });
    const q = createParticularConstitution({ ...p, constitution_nonce: String(iteration) + ':independent' });
    assert.notEqual(q.particular_id, p.particular_id);
    const surfaces = Array.from({ length: 3 + n % 5 }, (_, i) => createParticularStateSurface({ particular_id: p.particular_id, state_id: `${iteration}:${i}`, self_surface: String(next()), controller_id: String(next()), accessible_event_ids: n & 1 ? [] : ['e'], created_at: TIME }));
    const missing = next() % (surfaces.length - 1);
    const transitions = surfaces.slice(1).map((v, i) => createParticularStateTransition({ from_surface: surfaces[i], to_surface: v, created_at: TIME }));
    const grant = createCapabilityGrant({ capability_id: 'cap', subject: { kind: 'PARTICULAR', id: q.particular_id }, created_at: TIME });
    const event = createParticularEventWitness({ particular_id: p.particular_id, event_id: 'e', event_ref: THING, observed_in_state_id: surfaces[0].state_id, created_at: TIME });
    const projection = replayParticularity([p, q, ...surfaces, event, ...transitions.filter((_, i) => i !== missing), grant]);
    assert.equal(statesShareParticular(projection, surfaces[0].surface_id, surfaces.at(-1)!.surface_id), false);
    assert.equal(hasCapability(projection, { particular_id: p.particular_id, controller_id: surfaces[0].controller_id, capability_id: 'cap' }), false);
    assert.equal(witnessedEventExists(projection, p.particular_id, 'e'), true);
    if (n & 1) assert.equal(stateCanAccessEvent(projection, surfaces[0].surface_id, 'e'), false);
    const keyChoice = next() % s.keys.length;
    const retired = Boolean(next() & 1);
    const live = await assess({ ...s, current: { version: String(next()), world: 'world:B', policy_id: s.policy.receipt_id,
      retired_keys: retired ? [signingKeyIdentity({ signing: { public_key: s.keys[keyChoice].publicKeyJwk } })] : [], accepted_crossings: [s.crossing_id] } });
    assert.equal(live.historically_verified, true); assert.equal(live.currently_acceptable, !retired);
    assert.equal(live.authority, 'UNOBSERVED');
    const b = structuredClone(s.bundle); const mask = next() % 32;
    if (mask & 1) b.policy = null; if (mask & 2) b.inventory = null;
    b.records = b.records.filter((_, i) => !(mask & (4 << i)));
    const r = await assess({ ...s, bundle: b }); assert.ok(r.confidence <= baseline.confidence, `seed=0x1f0a001 iteration=${iteration}`);
    if (mask) assert.equal(r.historically_verified, false);
    const replay = await assess({ ...s, bundle: JSON.parse(JSON.stringify(b)) });
    assert.equal(replay.confidence, r.confidence);
  }
});
