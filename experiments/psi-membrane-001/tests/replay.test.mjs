import test from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { prove } from '../specimen.mjs';
import { verifyProof } from '../verify.mjs';
import { identity, signed } from '../../dynamic-interface-field-001/src/history.mjs';
import { digest, seal } from '../../interface-superspace-001/src/receipts.mjs';

let evidence;
const root = mkdtempSync(join(tmpdir(), 'psi-cold-proof-'));
test.after(() => rmSync(root, { recursive: true, force: true }));
const fixture = () => evidence ??= prove(root);
const signAgain = proof => {
  const keys = identity(); const { signature, public_key, ...body } = proof;
  return { proof: signed(body, keys), proof_key: keys.public_key };
};
const snapshot = path => readdirSync(path).sort().flatMap(name => {
  const item = join(path, name); return statSync(item).isDirectory() ? snapshot(item) : [[item, digest(readFileSync(item).toString('base64'))]];
});

test('cold proof verifies all founding cases with zero live authority and side effects', async () => {
  const { proof, roots, store } = await fixture();
  const before = snapshot(root);
  const verified = await verifyProof(proof, roots, store);
  assert.deepEqual(verified, { verified: true, history_cut_contexts: 16, entailment_witnesses: 23,
    native_occurrences: 4, denials_before_native_effect: 3, owner_tickets: 8,
    live_authority_restored: 0, replay_side_effects: 0, normative_core_mutations: 0 });
  const output = JSON.parse(execFileSync(process.execPath, ['experiments/psi-membrane-001/verify.mjs', root], { encoding: 'utf8' }));
  assert.deepEqual(output, verified); assert.deepEqual(snapshot(root), before);
});
test('modified historical proof cannot ride the original proof signature', async () => {
  const { proof, roots, store } = await fixture(); const forged = structuredClone(proof);
  forged.cases.timing.old_offer = forged.cases.timing.fresh_offer;
  await assert.rejects(verifyProof(forged, roots, store), /INVALID_SIGNATURE/);
});
test('validly signed bundle with unsupported assertions still fails derivation reconstruction', async () => {
  const { proof, roots, store } = await fixture(); const forged = structuredClone(proof);
  const saved = forged.contexts[0], ctx = store.get(saved.ref);
  ctx.assertions.push({ kind: 'live', args: ['made-up'], support_refs: [], assertion_ref: 'self-proof' });
  delete ctx.context_id; const changed = seal(ctx, 'context_id');
  saved.ref = store.put(changed); saved.context_id = changed.context_id;
  const again = signAgain(forged);
  await assert.rejects(verifyProof(again.proof, { ...roots, proof_key: again.proof_key }, store), /UNSUPPORTED_OR_MUTATED_ASSERTIONS/);
});
test('validly signed bundle cannot promote delayed denial into occurrence', async () => {
  const { proof, roots, store } = await fixture(); const forged = structuredClone(proof);
  const item = forged.occurrences.find(i => i.record.occurrence_id === forged.cases.timing.delayed);
  const record = { ...item.record, result: 'OCCURRED', failure: null }; delete record.occurrence_digest;
  item.record = seal(record, 'occurrence_digest');
  const again = signAgain(forged);
  await assert.rejects(verifyProof(again.proof, { ...roots, proof_key: again.proof_key }, store));
});
test('recomputed hashes do not turn altered witness support into a valid derivation', async () => {
  const { proof, roots, store } = await fixture(); const forged = structuredClone(proof);
  const witness = { ...forged.witnesses[0], support_refs: [] }; delete witness.witness_id;
  forged.witnesses[0] = seal(witness, 'witness_id');
  const again = signAgain(forged);
  await assert.rejects(verifyProof(again.proof, { ...roots, proof_key: again.proof_key }, store), /INVALID_ENTAILMENT_WITNESS/);
});
test('the proof signer cannot select an unanchored owner as a hidden new trust root', async () => {
  const { proof, roots, store } = await fixture(); const forged = structuredClone(proof);
  const policy = { ...forged.policies[0], anchors: [...forged.policies[0].anchors, { world_id: 'world:invented', public_key: identity().public_key }] };
  delete policy.policy_id; forged.policies[0] = seal(policy, 'policy_id');
  const again = signAgain(forged);
  await assert.rejects(verifyProof(again.proof, { ...roots, proof_key: again.proof_key }, store), /EXPLICIT_ROOT_REQUIRED/);
});


test('checked-in compact receipt matches its archived signed historical proof', async t => {
  const archive = 'fixtures/psi-membrane-001/evidence.tar.gz';
  const receipt = JSON.parse(readFileSync('fixtures/psi-membrane-001/receipt.json', 'utf8'));
  const sha = bytes => createHash('sha256').update(bytes).digest('hex');
  assert.equal(sha(readFileSync(archive)), receipt.archive_sha256);
  const paths = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).trim().split('\n');
  assert.ok(paths.every(path => /^(objects\/|objects\/[a-f0-9]{64}\.json|proof\.json|roots\.json)$/.test(path)));
  const dir = mkdtempSync(join(tmpdir(), 'psi-archived-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  execFileSync('tar', ['-xzf', archive, '-C', dir]);
  const proofBytes = readFileSync(join(dir, 'proof.json')), rootBytes = readFileSync(join(dir, 'roots.json'));
  assert.equal(sha(proofBytes), receipt.proof_bytes_sha256); assert.equal(sha(rootBytes), receipt.roots_bytes_sha256);
  const checked = JSON.parse(execFileSync(process.execPath, ['experiments/psi-membrane-001/verify.mjs', dir], { encoding: 'utf8' }));
  assert.deepEqual(checked, receipt.verification);
  const proof = JSON.parse(proofBytes);
  for (const key of ['h0', 'h1']) assert.deepEqual(receipt[key], proof.witnesses.find(w => w.witness_id === receipt[key].witness_id));
  assert.equal(receipt.h0.result, 'ENTAILED'); assert.equal(receipt.h1.result, 'NOT_ENTAILED');
  assert.deepEqual(receipt.authority, []); assert.equal(receipt.semantic_effect, 'none');
});
