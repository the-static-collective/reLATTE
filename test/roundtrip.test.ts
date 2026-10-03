import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';

import {
  computeOpaqueRoundTripRequestId,
  runOpaqueOrganRoundTrip,
  verifyOpaqueOrganCrossing,
  verifyReceipt,
} from '../src/index.ts';

function spec(createdAt: string): any {
  return {
    schema: 'relatte.opaque-organ-spec/v0',
    family_ref: 'organ:test/door-like-donor',
    donor_contract_ref: 'donor:test/contract-v0',
    artifact_kind: 'selected-proposal-artifact',
    source_world: 'world:test-house',
    source_particular: 'particular:test-house:receipt-001',
    source_history_head: 'sha256:' + '1'.repeat(64),
    payload_refs: [{
      address: 'sha256:' + '2'.repeat(64),
      role: 'local-artifact',
      media_type: 'application/json',
    }],
    donor_claims: {
      proposal_selected_locally: true,
      donor_authority_transferred: false,
    },
    requested_effect: {
      kind: 'candidate-ingress',
      authority: 'receiver-local',
    },
    return_address: 'return:test-house:receipt-001',
    created_at: createdAt,
  };
}

test('opaque round-trip crosses file transport, RECEIVE, then HOLD with donor semantics opaque', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-opaque-roundtrip-'));
  try {
    const request = {
      schema: 'relatte.opaque-roundtrip-request/v0',
      spec: spec('2026-10-03T03:00:00.000Z'),
      receiver_root: join(base, 'receiver'),
      receiver: {
        world_id: 'world:roundtrip-receiver',
        receiver_particular: 'particular:roundtrip-receiver',
        contract_ref: 'contract:roundtrip-local/v0',
      },
      bundle_path: join(base, 'bundles', 'crossing.json'),
      result_path: join(base, 'results', 'result.json'),
      disposition: 'HOLD',
      transport_created_at: '2026-10-03T03:00:01.000Z',
      received_at: '2026-10-03T03:00:02.000Z',
      disposed_at: '2026-10-03T03:00:03.000Z',
      route_note: 'generic opaque donor -> local receiver',
    } as const;

    const result = await runOpaqueOrganRoundTrip(request);
    assert.equal(result.request_id, computeOpaqueRoundTripRequestId(request));
    assert.equal(await verifyOpaqueOrganCrossing(result.crossing), true);
    assert.equal(await verifyReceipt(result.receive_receipt), true);
    assert.equal(await verifyReceipt(result.disposition_receipt), true);
    assert.equal(result.receive_receipt.kind, 'RECEIVED');
    assert.equal(result.receive_receipt.semantic_effect, 'none');
    assert.equal(result.disposition_receipt.kind, 'R3_HOLD');
    assert.equal(result.disposition_receipt.semantic_effect, 'none');
    assert.deepEqual(result.receiver_snapshot.held, [result.crossing.crossing_id]);
    assert.equal(
      result.crossing.extensions.organ_adapter.family_ref,
      request.spec.family_ref,
    );

    const stored = JSON.parse(await readFile(request.result_path, 'utf8'));
    assert.equal(stored.request_id, result.request_id);

    const duplicate = await runOpaqueOrganRoundTrip(request);
    assert.equal(duplicate.crossing.crossing_id, result.crossing.crossing_id);
    assert.equal(
      duplicate.disposition_receipt.receipt_id,
      result.disposition_receipt.receipt_id,
    );
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('stored result cannot be silently reused for a changed request', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-opaque-roundtrip-mismatch-'));
  try {
    const original: any = {
      schema: 'relatte.opaque-roundtrip-request/v0',
      spec: spec('2026-10-03T03:10:00.000Z'),
      receiver_root: join(base, 'receiver'),
      receiver: {
        world_id: 'world:roundtrip-receiver',
        receiver_particular: 'particular:roundtrip-receiver',
        contract_ref: 'contract:roundtrip-local/v0',
      },
      bundle_path: join(base, 'bundle.json'),
      result_path: join(base, 'result.json'),
      disposition: 'HOLD',
      transport_created_at: '2026-10-03T03:10:01.000Z',
      received_at: '2026-10-03T03:10:02.000Z',
      disposed_at: '2026-10-03T03:10:03.000Z',
      route_note: 'first route',
    };
    await runOpaqueOrganRoundTrip(original);

    await assert.rejects(
      () => runOpaqueOrganRoundTrip({
        ...original,
        route_note: 'changed route',
      }),
      /ROUNDTRIP_RESULT_REQUEST_MISMATCH/,
    );
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});


function runBridge(input: unknown): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--experimental-strip-types', 'scripts/opaque-roundtrip.ts'],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(JSON.stringify(input));
  });
}

test('stdin/stdout bridge executes the same real round-trip surface', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-opaque-roundtrip-cli-'));
  try {
    const request = {
      schema: 'relatte.opaque-roundtrip-request/v0',
      spec: spec('2026-10-03T03:20:00.000Z'),
      receiver_root: join(base, 'receiver'),
      receiver: {
        world_id: 'world:roundtrip-cli-receiver',
        receiver_particular: 'particular:roundtrip-cli-receiver',
        contract_ref: 'contract:roundtrip-cli-local/v0',
      },
      bundle_path: join(base, 'bundle.json'),
      result_path: join(base, 'result.json'),
      disposition: 'HOLD',
      transport_created_at: '2026-10-03T03:20:01.000Z',
      received_at: '2026-10-03T03:20:02.000Z',
      disposed_at: '2026-10-03T03:20:03.000Z',
      route_note: 'CLI aperture test',
    };

    const child = await runBridge(request);
    assert.equal(child.code, 0, child.stderr);
    const result = JSON.parse(child.stdout);
    assert.equal(result.schema, 'relatte.opaque-roundtrip-result/v0');
    assert.equal(result.receive_receipt.kind, 'RECEIVED');
    assert.equal(result.disposition_receipt.kind, 'R3_HOLD');
    assert.equal(await verifyOpaqueOrganCrossing(result.crossing), true);
    assert.equal(await verifyReceipt(result.receive_receipt), true);
    assert.equal(await verifyReceipt(result.disposition_receipt), true);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
