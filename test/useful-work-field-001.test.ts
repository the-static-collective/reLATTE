import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, test } from 'node:test';
import { generateP256KeyPair, sealReceipt } from '../src/protocol.ts';
import { sealOpaqueOrganCrossing } from '../src/organ.ts';
import { canonicalBytes } from '../src/useful_work/job.ts';
import { rational } from '../src/useful_work/valuation/rational.ts';
import { verifyExchange } from '../src/useful_work/settlement/exchange.ts';
import { createFieldArchive, verifyFieldArchive, verifyFieldDelivery, fieldId, FIELD_LAWS } from '../src/useful_work/field_test/archive.ts';
import type { FieldInput } from '../src/useful_work/field_test/archive.ts';
import { WORLD_KEYS } from '../src/useful_work/field_test/profile.ts';
import type { Wire } from '../src/useful_work/settlement/wire.ts';
const root = fileURLToPath(new URL('../', import.meta.url));
async function child(args: string[], cwd = root) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((yes, no) => {
    const p = spawn(args[0], args.slice(1), { cwd, stdio: ['ignore', 'pipe', 'pipe'] }); let stdout = '', stderr = '';
    const timer = setTimeout(() => { p.kill('SIGTERM'); no(new Error('FIELD_TEST_SUBPROCESS_TIMEOUT')); }, 150_000);
    p.stdout.on('data', b => stdout += b); p.stderr.on('data', b => stderr += b); p.once('error', error => { clearTimeout(timer); no(error); });
    p.once('close', code => { clearTimeout(timer); yes({ code, stdout, stderr }); });
  });
}
function rehash(a: Wire) { const { field_id: _, ...body } = a; a.field_id = fieldId(body); return a; }
describe('Useful Work Field Test 001 — Two Worlds Trade', { skip: process.platform !== 'linux' }, () => {
  let dir: string, out: string, delivery: Wire;
  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'relatte-two-worlds-trade-')); out = join(dir, 'run');
    const result = await child([process.execPath, '--experimental-strip-types', 'src/useful_work/cli_field_001.ts', 'run', 'examples/useful-work-001/julia-001.json', '--out', out]);
    assert.equal(result.code, 0, result.stdout + result.stderr); delivery = JSON.parse(await readFile(join(out, 'public-delivery/field.json'), 'utf8'));
  }, { timeout: 180_000 });
  after(async () => { if (dir) await rm(dir, { recursive: true, force: true }); });

  test('all ten kernels compose through distinct actor processes and stores, with exact native/legacy job/count binding', async () => {
    const verified = await verifyFieldDelivery(delivery), a = verified.archive, s = a.summary;
    assert.deepEqual(Object.keys(s.kernel_trace), ['001', '002', '003', '004', '005', '006', '007', '008', '009', '010']);
    assert.equal(s.kernel_trace['002'].relation, 'compatible'); assert.equal(s.kernel_trace['003'].relation, 'compatible');
    assert.equal(s.claims.native_and_legacy_job_and_counts_matched, true); assert.notEqual(s.kernel_trace['001'].work_id, s.kernel_trace['004'].native_work_id);
    assert.deepEqual(s.laws, FIELD_LAWS); assert.ok(s.observations.reported_process_count > 30);
    const transcript = JSON.parse(await readFile(join(out, 'process-transcript.json'), 'utf8'));
    const producer = transcript.find((r: Wire) => r.command === 'produce'), server = transcript.find((r: Wire) => r.command === 'server'); assert.notEqual(producer.pid, server.pid);
    const primaryKeys = Object.values(a.actors).map(actor => canonicalBytes((actor as Wire).keys.primary.public_key).toString()); assert.equal(new Set(primaryKeys).size, 5);
    for (const [role, names] of Object.entries(WORLD_KEYS)) {
      assert.equal((await stat(join(out, 'private-worlds', role, 'state'))).mode & 0o777, 0o700);
      for (const name of names) assert.equal((await stat(join(out, 'private-worlds', role, 'state', name + '.json'))).mode & 0o777, 0o600);
    }
  });

  test('the signed count fault and expired issued service challenge survive B acceptance without selecting mathematical truth', async () => {
    const a = await verifyFieldArchive(delivery.archive), s = a.summary;
    assert.equal(s.kernel_trace['005'].contradictions.length, 1);
    assert.deepEqual(s.kernel_trace['004'].comparisons.map(c => c.relation), ['contradictory', 'compatible']);
    assert.equal(s.kernel_trace['006'].schedule_accounting.completed_observation_slots, 2);
    assert.equal(s.kernel_trace['008'].schedule_accounting.planned_slots, 2); assert.equal(s.kernel_trace['008'].schedule_accounting.in_window_verified_slots, 1);
    assert.deepEqual(s.observations.expired_service_slots, [1]); assert.equal(s.kernel_trace['010'].choice, 'ACCEPT');
    const v = await verifyExchange(a.settlement.exchange); assert.equal((v.offer.terms.policy.clauses[0] as Wire).reject_contradictions, false);
    assert.equal(v.report.policy_evaluation.status, 'PASS'); assert.equal(s.claims.shared_truth_selected, false);
    assert.ok(a.settlement.exchange.evidence.audit.submissions.some((e: Wire) => e.receipt.receipt_id === s.observations.deliberate_fault_receipt_id));
  });

  test('B values 12, D values 5 under the same complete valuation context and unit; neither opinion replaces the other', async () => {
    const a = await verifyFieldArchive(delivery.archive), c = a.summary.kernel_trace['007'];
    assert.equal(c.relation, 'different-local-amounts'); assert.equal(c.winner_selected, false); assert.equal(c.universal_value_asserted, false);
    assert.deepEqual(a.summary.observations.B_local_value, rational(12)); assert.deepEqual(a.summary.observations.D_local_value, rational(5));
    assert.equal(a.dissent.context.context_id, a.settlement.exchange.evidence.valuations[0].context.context_id);
    assert.equal(a.dissent.receipt.semantic_effect, 'none'); assert.equal(a.settlement.exchange.decision.semantic_effect, 'none');
  });

  test('CPU/file/interface sources are live, individually attributed and independently replayed; absent energy stays unknown', async () => {
    const a = await verifyFieldArchive(delivery.archive), resources = a.settlement.exchange.evidence.resources;
    assert.equal(resources.summary.unique_measurements, 3); assert.deepEqual(resources.summary.by_adapter.energy, []);
    assert.equal(resources.summary.claims.aggregate_job_resource_cost_computed, false);
    for (const entry of resources.observations) {
      const family = entry.measurement.extensions.organ_adapter.artifact_kind.slice('resource-'.length), p = entry.measurement.extensions.organ_adapter.donor_claims['resource_' + family];
      assert.equal(p.provenance.capture_mode, 'live-local/v1'); assert.equal(p.claims.exclusive_job_resource_use_verified, false);
      assert.equal(entry.receipt.world_id, a.actors.C.world_id); assert.equal(entry.measurement.source_world, a.actors.A.world_id);
      if (family === 'network') assert.ok(BigInt(p.observed.interface_rx_bytes_observed) > 0n);
    }
  });

  test('the separate Python ledger executes once after ACCEPT; repeated requests are idempotent and settlement replay cannot transfer again', async () => {
    const a = await verifyFieldArchive(delivery.archive), ledgerPath = join(out, 'external-ledger/state.json'), before = await readFile(ledgerPath);
    assert.deepEqual(JSON.parse(before.toString()).balances, { A: '12', B: '88' });
    const requestPath = join(dir, 'repeat-ledger-request.json'); await writeFile(requestPath, JSON.stringify(a.external_ledger.request));
    const duplicate = await child(['python3', '-I', '-B', 'examples/useful-work-field-001/ledger.py', 'transfer', ledgerPath, requestPath, join(dir, 'repeat-record.json')]);
    assert.equal(duplicate.code, 0, duplicate.stderr); assert.ok(before.equals(await readFile(ledgerPath)));
    await verifyFieldDelivery(delivery); assert.ok(before.equals(await readFile(ledgerPath)));
    const ledgerSource = await readFile(join(root, 'examples/useful-work-field-001/ledger.py'), 'utf8'); assert.doesNotMatch(ledgerSource, /^\s*(from|import)\s+.*relatte/im);
    assert.equal(a.summary.kernel_trace['010'].receipt.claims.credit_ledger_changed, true);
    assert.equal(a.summary.kernel_trace['010'].receipt.claims.transfer_performed_by_relatte, false);
    assert.equal(a.summary.kernel_trace['010'].receipt.claims.ownership_verified, false);
  });

  test('A/B/C/D independently HOLD the same preserved archive and keep their own local receiver state', async () => {
    const verified = await verifyFieldDelivery(delivery); assert.equal(verified.retention.length, 4);
    for (const h of verified.retention) {
      assert.equal(h.received.kind, 'RECEIVED'); assert.equal(h.hold.kind, 'R3_HOLD'); assert.equal(h.hold.semantic_effect, 'none');
      assert.ok((await stat(join(out, 'private-worlds', h.role, 'local/receiver-archive'))).isDirectory());
      const copy = JSON.parse(await readFile(join(out, 'private-worlds', h.role, 'local/public-archive.json'), 'utf8'));
      assert.deepEqual(copy, delivery.archive);
    }
    assert.equal(verified.crossing.extensions.organ_adapter.donor_claims.winner_selected, false);
    assert.equal(verified.archive.summary.claims.shared_state_established, false);
  });

  test('archive hashes cannot launder deleted disagreement, expired-slot status, valuation changes or stronger global claims', async () => {
    for (const mutate of [(a: Wire) => a.summary.claims.shared_truth_selected = true,
      (a: Wire) => a.summary.kernel_trace['005'].contradictions = [], (a: Wire) => a.summary.observations.expired_service_slots = [],
      (a: Wire) => a.summary.observations.D_local_value = rational(12), (a: Wire) => a.summary.kernel_trace['010'].receipt.claims.universal_finality_asserted = true]) {
      const a = structuredClone(delivery.archive); mutate(a); await assert.rejects(verifyFieldArchive(rehash(a)), /REPLAY_MISMATCH/);
    }
    const removed = structuredClone(delivery.archive); removed.settlement.exchange.evidence.audit.submissions.pop();
    await assert.rejects(verifyFieldArchive(rehash(removed)), /ID_MISMATCH/);
    const badSignature = structuredClone(delivery.archive); badSignature.dissent.receipt.signing.signature = 'invalid';
    await assert.rejects(verifyFieldArchive(rehash(badSignature)), /SIGNATURE/);
  });

  test('role substitutions, shared keys, wrong ledger correlation and duplicated world retention reject', async () => {
    for (const mutate of [(a: Wire) => a.actors.D.keys.primary = a.actors.B.keys.primary,
      (a: Wire) => a.actors.C.keys.primary.world_id = 'alias', (a: Wire) => a.external_ledger.request.acceptance_ref = 'other-acceptance',
      (a: Wire) => a.external_ledger.record.credit.after = rational(13), (a: Wire) => a.boundary_holds.pop()]) {
      const a = structuredClone(delivery.archive); mutate(a); await assert.rejects(verifyFieldArchive(rehash(a)));
    }
    const duplicated = structuredClone(delivery); duplicated.retention[1] = duplicated.retention[0]; await assert.rejects(verifyFieldDelivery(duplicated), /RETENTION_WORLD/);
  });

  test('preservation crossing binds exact inventory; fully signed admission effects and wrong scopes cannot masquerade as peer HOLD', async () => {
    const changed = structuredClone(delivery); changed.archive.transcript[0].pid++;
    const { schema: ___, field_id: ____, summary: _____, ...input } = changed.archive;
    changed.archive = await createFieldArchive(input as FieldInput);
    await assert.rejects(verifyFieldDelivery(changed), /REFERENCE_MISMATCH/);
    const rogue = await generateP256KeyPair(), crossing = structuredClone(delivery.crossing), d = crossing.extensions.organ_adapter;
    const spec = { schema: 'relatte.opaque-organ-spec/v0' as const, family_ref: d.family_ref, donor_contract_ref: d.donor_contract_ref,
      artifact_kind: d.artifact_kind, source_world: crossing.source_world, source_particular: crossing.source_particular, source_history_head: null,
      payload_refs: crossing.payload_refs, donor_claims: d.donor_claims, requested_effect: crossing.requested_effect, return_address: null, created_at: crossing.created_at };
    await assert.rejects(verifyFieldDelivery({ ...delivery, crossing: await sealOpaqueOrganCrossing(spec, rogue) }), /SIGNER_ROLE/);
    const h = structuredClone(delivery.retention[0]), { receipt_id: _, signing: __, ...body } = h.hold;
    h.hold = await sealReceipt({ ...body, semantic_effect: 'ADMIT' }, rogue);
    await assert.rejects(verifyFieldDelivery({ ...delivery, retention: [h, ...delivery.retention.slice(1)] }), /RETENTION_RECEIPT/);
  });

  test('new public archive verification works after deleting actors, ledger, private worlds, Python and all mathematical checker/worker modules', async () => {
    const portable = join(dir, 'portable'); await cp(join(root, 'src'), join(portable, 'src'), { recursive: true });
    await symlink(join(root, 'node_modules'), join(portable, 'node_modules'), 'dir'); await writeFile(join(portable, 'package.json'), '{"type":"module"}');
    await writeFile(join(portable, 'field.json'), canonicalBytes(delivery));
    for (const path of ['resources/collectors.ts', 'algorithm.ts', 'worker.ts', 'verifier.ts', 'python_verifier.ts', 'challenge/worker.ts', 'challenge/typescript_checker.ts',
      'challenge/python_checker.ts', 'merkle_native/worker.ts', 'merkle_native/typescript_checker.ts', 'merkle_native/python_checker.ts']) await rm(join(portable, 'src/useful_work', path));
    const result = await child([process.execPath, '--experimental-strip-types', 'src/useful_work/cli_field_001.ts', 'verify', 'field.json', '--out', 'verified'], portable);
    assert.equal(result.code, 0, result.stderr); const saved = JSON.parse(await readFile(join(portable, 'verified/field.json'), 'utf8'));
    assert.equal(saved.archive.field_id, delivery.archive.field_id); assert.equal(saved.archive.summary.kernel_trace['010'].choice, 'ACCEPT');
    assert.deepEqual(saved.archive.summary.observations.D_local_value, rational(5));
  });
});
