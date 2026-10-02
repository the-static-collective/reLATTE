import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  canonicalize,
  sha256Hex,
} from '../src/canonical.ts';
import {
  createWorldManifest,
} from '../src/runtime-manifest.ts';
import {
  ReLatteRuntime,
} from '../src/runtime.ts';
import {
  buildSovereignResponseBundle,
  verifySovereignResponseBundle,
} from '../src/sovereign.ts';
import {
  generateP256KeyPair,
  sealCrossingEnvelope,
} from '../src/index.ts';

async function waitForFile(path: string): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      await stat(path);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error('TWO_WORLDS_BLACK_FLAG_MARKER_TIMEOUT');
}

async function waitForExit(
  child: ReturnType<typeof spawn>,
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
}

const workspace = await mkdtemp(join(tmpdir(), 'relatte-two-worlds-001-'));
const worldARoot = join(workspace, 'world-a');
const worldBRoot = join(workspace, 'world-b');
const haltMarker = join(workspace, 'world-b-halt-marker.json');

try {
  const worldA = await ReLatteRuntime.create({
    root: worldARoot,
    manifest: createWorldManifest({
      world_id: 'world:two-worlds:a',
      receiver_particular: 'particular:two-worlds:a',
      receiver_contract_ref: 'relatte:two-worlds:a/v0',
      pulse_interval_ms: 25,
    }),
    created_at: '2026-10-02T01:40:00.000Z',
  });

  const worldB = await ReLatteRuntime.create({
    root: worldBRoot,
    manifest: createWorldManifest({
      world_id: 'world:two-worlds:b',
      receiver_particular: 'particular:two-worlds:b',
      receiver_contract_ref: 'relatte:two-worlds:b/v0',
      pulse_interval_ms: 25,
    }),
    created_at: '2026-10-02T01:40:00.000Z',
  });

  assert.notEqual(worldA.manifest.manifest_id, worldB.manifest.manifest_id);
  assert.notEqual(
    worldA.capabilityKernel.issuer_ref,
    worldB.capabilityKernel.issuer_ref,
  );

  const aOutboundKeys = await generateP256KeyPair();
  const permissionAIntoB = await worldB.capabilityKernel.issueReceiveCapability({
    holder_public_key: aOutboundKeys.publicKeyJwk,
    declared_kind: 'WORLD_A_PROPOSAL',
    not_before: '2026-10-02T01:40:00.000Z',
    expires_at: '2026-10-02T02:40:00.000Z',
    created_at: '2026-10-02T01:40:01.000Z',
  });

  const proposal = await sealCrossingEnvelope({
    schema: 'relatte.crossing-envelope/v0',
    protocol_version: '0',
    source_particular: 'particular:two-worlds:a:composer',
    source_world: worldA.manifest.world_id,
    source_history_head: 'local:two-worlds:a:proposal-head',
    parents: [],
    declared_kind: 'WORLD_A_PROPOSAL',
    payload_refs: [{
      address: 'sha256:' + '3'.repeat(64),
      role: 'proposal',
      media_type: 'application/json',
    }],
    requested_effect: {
      requested: 'consider-this-proposal',
    },
    capability_ref: permissionAIntoB.capability_id,
    privacy_policy: null,
    audience_policy: {
      target_world: worldB.manifest.world_id,
    },
    return_address: worldA.manifest.world_id,
    created_at: '2026-10-02T01:40:02.000Z',
    extensions: {
      two_worlds: {
        voyage: 'A-to-B',
      },
    },
  }, aOutboundKeys);

  const bQueueItem = await worldB.enqueueForeignCrossing({
    crossing: proposal,
    enqueued_at: '2026-10-02T01:40:03.000Z',
    source: worldA.manifest.world_id,
  });

  const bChild = spawn(
    process.execPath,
    ['--experimental-strip-types', 'scripts/runtime-node-001.ts'],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        RELATTE_RUNTIME_ROOT: worldBRoot,
        RELATTE_RUNTIME_BOOT_AT: '2026-10-02T01:40:04.000Z',
        RELATTE_RUNTIME_TEST_HALT_AFTER_RECEIVE_FILE: haltMarker,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  let bChildStdout = '';
  let bChildStderr = '';
  bChild.stdout?.on('data', (chunk) => {
    bChildStdout += String(chunk);
  });
  bChild.stderr?.on('data', (chunk) => {
    bChildStderr += String(chunk);
  });

  await waitForFile(haltMarker);
  const bHalt = JSON.parse(await readFile(haltMarker, 'utf8'));
  assert.equal(bHalt.crossing_id, proposal.crossing_id);
  assert.equal(bHalt.queue_item_id, bQueueItem.queue_item_id);

  const bExit = waitForExit(bChild);
  bChild.kill('SIGKILL');
  const killed = await bExit;
  assert.equal(killed.signal, 'SIGKILL');

  const worldBAfterDeath = await ReLatteRuntime.open({
    root: worldBRoot,
    created_at: '2026-10-02T01:40:05.000Z',
  });
  const bInterrupted = await worldBAfterDeath.snapshot();

  assert.equal(bInterrupted.pending_inbox.length, 1);
  assert.deepEqual(bInterrupted.receiver.received, [proposal.crossing_id]);
  assert.deepEqual(bInterrupted.receiver.admitted, []);

  const resumedB = await worldBAfterDeath.pulseOne({
    claimed_at: '2026-10-02T01:40:06.000Z',
    received_at: '2026-10-02T01:40:07.000Z',
    committed_at: '2026-10-02T01:40:08.000Z',
  });
  assert.equal(resumedB.receive_receipt_id, bHalt.receive_receipt_id);

  const bRefusal = await worldBAfterDeath.receiver.dispose(
    proposal.crossing_id,
    'REFUSE',
    '2026-10-02T01:40:09.000Z',
    {
      note: 'world B declines A proposal under B-local authority',
    },
  );
  assert.equal(bRefusal.semantic_effect, 'none');

  const bResponseBundle = buildSovereignResponseBundle(
    worldBAfterDeath.receiver,
    proposal.crossing_id,
  );
  assert.equal(
    await verifySovereignResponseBundle(
      bResponseBundle,
      proposal.crossing_id,
    ),
    true,
  );

  const bResponseKeys = await generateP256KeyPair();
  const permissionBIntoA = await worldA.capabilityKernel.issueReceiveCapability({
    holder_public_key: bResponseKeys.publicKeyJwk,
    declared_kind: 'SOVEREIGN_RESPONSE',
    not_before: '2026-10-02T01:40:00.000Z',
    expires_at: '2026-10-02T02:40:00.000Z',
    created_at: '2026-10-02T01:40:10.000Z',
  });

  assert.notEqual(
    permissionAIntoB.capability_id,
    permissionBIntoA.capability_id,
  );
  assert.equal(
    permissionAIntoB.scope.target_world,
    worldB.manifest.world_id,
  );
  assert.equal(
    permissionBIntoA.scope.target_world,
    worldA.manifest.world_id,
  );

  const bundleAddress =
    'sha256:' + sha256Hex(Buffer.from(canonicalize(bResponseBundle), 'utf8'));

  const responseCrossing = await sealCrossingEnvelope({
    schema: 'relatte.crossing-envelope/v0',
    protocol_version: '0',
    source_particular: 'particular:two-worlds:b:response',
    source_world: worldB.manifest.world_id,
    source_history_head: worldBAfterDeath.receiver.snapshot().history_head,
    parents: [proposal.crossing_id],
    declared_kind: 'SOVEREIGN_RESPONSE',
    payload_refs: [{
      address: bundleAddress,
      role: 'sovereign-response',
      media_type: 'application/vnd.relatte.sovereign-response+json',
    }],
    requested_effect: null,
    capability_ref: permissionBIntoA.capability_id,
    privacy_policy: null,
    audience_policy: {
      target_world: worldA.manifest.world_id,
    },
    return_address: worldB.manifest.world_id,
    created_at: '2026-10-02T01:40:11.000Z',
    extensions: {
      sovereign_response: bResponseBundle,
      two_worlds: {
        voyage: 'B-to-A',
      },
    },
  }, bResponseKeys);

  await worldA.enqueueForeignCrossing({
    crossing: responseCrossing,
    enqueued_at: '2026-10-02T01:40:12.000Z',
    source: worldB.manifest.world_id,
  });

  const aPulse = await worldA.pulseOne({
    claimed_at: '2026-10-02T01:40:13.000Z',
    received_at: '2026-10-02T01:40:14.000Z',
    committed_at: '2026-10-02T01:40:15.000Z',
  });
  assert.equal(aPulse.status, 'processed');

  const aHold = await worldA.receiver.dispose(
    responseCrossing.crossing_id,
    'HOLD',
    '2026-10-02T01:40:16.000Z',
    {
      note: 'world A holds B response for later local consideration',
    },
  );
  assert.equal(aHold.semantic_effect, 'none');

  const aSnapshot = await worldA.snapshot();
  const bSnapshot = await worldBAfterDeath.snapshot();

  assert.deepEqual(aSnapshot.receiver.admitted, []);
  assert.deepEqual(aSnapshot.receiver.held, [responseCrossing.crossing_id]);
  assert.deepEqual(bSnapshot.receiver.admitted, []);
  assert.deepEqual(bSnapshot.receiver.refused, [proposal.crossing_id]);

  const bBus = await worldBAfterDeath.readReceiptBus();
  const bProposalReceiptPublishes = bBus.filter(
    (event) =>
      event.event_type === 'RECEIPT_REF_PUBLISHED' &&
      event.crossing_id === proposal.crossing_id,
  );
  assert.equal(bProposalReceiptPublishes.length, 1);

  console.log(JSON.stringify({
    schema: 'relatte.two-worlds-in-a-box-witness/v0',
    world_a: {
      manifest_id: worldA.manifest.manifest_id,
      world_id: worldA.manifest.world_id,
      capability_issuer: worldA.capabilityKernel.issuer_ref,
      response_capability_id: permissionBIntoA.capability_id,
      received_crossing_id: responseCrossing.crossing_id,
      disposition: 'HOLD',
      admitted: aSnapshot.receiver.admitted,
      held: aSnapshot.receiver.held,
      state_ref: aSnapshot.receiver.state_ref,
    },
    world_b: {
      manifest_id: worldB.manifest.manifest_id,
      world_id: worldB.manifest.world_id,
      capability_issuer: worldB.capabilityKernel.issuer_ref,
      proposal_capability_id: permissionAIntoB.capability_id,
      received_crossing_id: proposal.crossing_id,
      runtime_killed_mid_receive: true,
      kill_signal: killed.signal,
      receive_receipt_reused_after_restart:
        resumedB.receive_receipt_id === bHalt.receive_receipt_id,
      receive_receipt_publish_count: bProposalReceiptPublishes.length,
      disposition: 'REFUSE',
      admitted: bSnapshot.receiver.admitted,
      refused: bSnapshot.receiver.refused,
      state_ref: bSnapshot.receiver.state_ref,
    },
    crossing_a_to_b: {
      crossing_id: proposal.crossing_id,
      declared_kind: proposal.declared_kind,
      capability_ref: proposal.capability_ref,
    },
    crossing_b_to_a: {
      crossing_id: responseCrossing.crossing_id,
      parent_crossing_id: proposal.crossing_id,
      declared_kind: responseCrossing.declared_kind,
      capability_ref: responseCrossing.capability_ref,
      response_bundle_verified: true,
    },
    worlds_share_receiver_state: false,
    worlds_share_capability_authority: false,
    automatic_admission_anywhere: false,
    child_stdout: bChildStdout,
    child_stderr: bChildStderr,
    laws: [
      'IDENTITY != CAPABILITY',
      'CAPABILITY != ADMISSION',
      'CAPABILITY A→B != CAPABILITY B→A',
      'REFERENCE != AUTHORITY',
      'PROCESS DEATH != WORLD DEATH',
      'REPLAY != DUPLICATE CONSEQUENCE',
      'RESPONSE != AGREEMENT',
      'WORLD A != WORLD B',
      'SHARED CROSSING != SHARED WORLD STATE',
      'DIVERGENT DISPOSITION != PROTOCOL FAILURE',
    ],
  }, null, 2));
} finally {
  await rm(workspace, { recursive: true, force: true });
}
