import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createWorldManifest,
} from '../src/runtime-manifest.ts';
import {
  ReLatteRuntime,
} from '../src/runtime.ts';
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
  throw new Error('BLACK_FLAG_HALT_MARKER_TIMEOUT');
}

async function waitForExit(
  child: ReturnType<typeof spawn>,
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
}

const workspace = await mkdtemp(join(tmpdir(), 'relatte-black-flag-001-'));
const root = join(workspace, 'runtime');
const haltMarker = join(workspace, 'halt-marker.json');

try {
  const manifest = createWorldManifest({
    world_id: 'world:black-flag-001',
    receiver_particular: 'particular:black-flag-001',
    receiver_contract_ref: 'relatte:black-flag-001/v0',
    road_memory_failure_threshold: 1,
    road_memory_cooldown_ms: 60_000,
    pulse_interval_ms: 25,
  });

  const initial = await ReLatteRuntime.create({
    root,
    manifest,
    created_at: '2026-10-02T01:10:00.000Z',
  });

  const keys = await generateP256KeyPair();
  const crossing = await sealCrossingEnvelope({
    schema: 'relatte.crossing-envelope/v0',
    protocol_version: '0',
    source_particular: 'particular:black-flag-source',
    source_world: 'world:black-flag-source',
    source_history_head: 'local:black-flag-source:head',
    parents: [],
    declared_kind: 'BLACK_FLAG_001',
    payload_refs: [{
      address: 'sha256:' + '1'.repeat(64),
      role: 'payload',
      media_type: 'application/json',
    }],
    requested_effect: null,
    capability_ref: null,
    privacy_policy: null,
    audience_policy: null,
    return_address: null,
    created_at: '2026-10-02T01:10:01.000Z',
    extensions: {
      witness: 'BLACK-FLAG-001',
    },
  }, keys);

  const queued = await initial.enqueueCrossing({
    crossing,
    enqueued_at: '2026-10-02T01:10:02.000Z',
    source: 'black-flag-voyage',
  });

  await initial.roadMemory.observeAvailabilityFailure({
    candidate_id: 'relatte-road-candidate:black-flag-dead-road',
    endpoint: 'http://127.0.0.1:65534/',
    failure_code: 'TRANSPORT_UNREACHABLE',
    observed_at: '2026-10-02T01:10:03.000Z',
  });

  const roadStateBeforeKill = initial.roadMemory.snapshot();
  assert.equal(roadStateBeforeKill.candidates[0]?.circuit, 'OPEN');

  const child = spawn(
    process.execPath,
    ['--experimental-strip-types', 'scripts/runtime-node-001.ts'],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        RELATTE_RUNTIME_ROOT: root,
        RELATTE_RUNTIME_BOOT_AT: '2026-10-02T01:10:04.000Z',
        RELATTE_RUNTIME_TEST_HALT_AFTER_RECEIVE_FILE: haltMarker,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  let childStdout = '';
  let childStderr = '';
  child.stdout?.on('data', (chunk) => {
    childStdout += String(chunk);
  });
  child.stderr?.on('data', (chunk) => {
    childStderr += String(chunk);
  });

  await waitForFile(haltMarker);
  const marker = JSON.parse(await readFile(haltMarker, 'utf8'));

  assert.equal(marker.crossing_id, crossing.crossing_id);
  assert.equal(marker.queue_item_id, queued.queue_item_id);
  assert.equal(typeof marker.receive_receipt_id, 'string');

  const exitPromise = waitForExit(child);
  child.kill('SIGKILL');
  const killed = await exitPromise;
  assert.equal(killed.signal, 'SIGKILL');

  const afterKill = await ReLatteRuntime.open({
    root,
    created_at: '2026-10-02T01:10:05.000Z',
  });
  const interrupted = await afterKill.snapshot();

  assert.equal(interrupted.pending_inbox.length, 1);
  assert.equal(interrupted.processed_inbox.length, 0);
  assert.deepEqual(interrupted.receiver.received, [crossing.crossing_id]);
  assert.deepEqual(interrupted.receiver.admitted, []);
  assert.deepEqual(interrupted.receiver.refused, []);
  assert.deepEqual(interrupted.published_receipt_ids, [marker.receive_receipt_id]);
  assert.equal(
    interrupted.road_memory.candidates[0]?.circuit,
    'OPEN',
  );
  assert.equal(
    interrupted.road_memory.state_ref,
    roadStateBeforeKill.state_ref,
  );

  const receiverStateAfterKill = interrupted.receiver.state_ref;
  const receiverJournalLengthAfterKill = afterKill.receiver.journalLength();

  const resumedPulse = await afterKill.pulseOne({
    claimed_at: '2026-10-02T01:10:06.000Z',
    received_at: '2026-10-02T01:10:07.000Z',
    committed_at: '2026-10-02T01:10:08.000Z',
  });

  assert.equal(resumedPulse.status, 'processed');
  assert.equal(resumedPulse.crossing_id, crossing.crossing_id);
  assert.equal(resumedPulse.receive_receipt_id, marker.receive_receipt_id);

  const resumed = await afterKill.snapshot();
  assert.equal(resumed.pending_inbox.length, 0);
  assert.equal(resumed.processed_inbox.length, 1);
  assert.equal(resumed.receiver.state_ref, receiverStateAfterKill);
  assert.equal(afterKill.receiver.journalLength(), receiverJournalLengthAfterKill);
  assert.deepEqual(resumed.receiver.received, [crossing.crossing_id]);
  assert.deepEqual(resumed.receiver.admitted, []);
  assert.deepEqual(resumed.published_receipt_ids, [marker.receive_receipt_id]);

  const refusal = await afterKill.receiver.dispose(
    crossing.crossing_id,
    'REFUSE',
    '2026-10-02T01:10:09.000Z',
    {
      note: 'runtime continuity does not inherit or compel admission',
    },
  );
  const finalSnapshot = await afterKill.snapshot();

  assert.deepEqual(finalSnapshot.receiver.admitted, []);
  assert.deepEqual(finalSnapshot.receiver.refused, [crossing.crossing_id]);

  const bus = await afterKill.readReceiptBus();
  const claims = bus.filter(
    (event) =>
      event.event_type === 'WORK_CLAIMED' &&
      event.crossing_id === crossing.crossing_id,
  );
  const receiptPublishes = bus.filter(
    (event) =>
      event.event_type === 'RECEIPT_REF_PUBLISHED' &&
      event.receipt_id === marker.receive_receipt_id,
  );
  const commits = bus.filter(
    (event) =>
      event.event_type === 'WORK_COMMITTED' &&
      event.crossing_id === crossing.crossing_id,
  );
  const boots = bus.filter((event) => event.event_type === 'BOOT');

  assert.equal(claims.length, 2);
  assert.equal(receiptPublishes.length, 1);
  assert.equal(commits.length, 1);
  assert.ok(boots.length >= 3);

  console.log(JSON.stringify({
    schema: 'relatte.black-flag-witness/v0',
    manifest_id: manifest.manifest_id,
    world_id: manifest.world_id,
    crossing_id: crossing.crossing_id,
    queue_item_id: queued.queue_item_id,
    runtime_process_killed: true,
    kill_signal: killed.signal,
    kill_seam: 'after-receiver-receive-before-queue-commit',
    pending_after_kill: interrupted.pending_inbox.length,
    receiver_received_after_kill: interrupted.receiver.received,
    receiver_state_preserved_across_resume:
      resumed.receiver.state_ref === receiverStateAfterKill,
    receiver_journal_length_preserved_during_resume:
      afterKill.receiver.journalLength() === receiverJournalLengthAfterKill + 1,
    receive_receipt_id: marker.receive_receipt_id,
    receive_receipt_publish_count: receiptPublishes.length,
    work_claim_count: claims.length,
    work_commit_count: commits.length,
    road_memory_state_preserved_across_runtime_death:
      interrupted.road_memory.state_ref === roadStateBeforeKill.state_ref,
    final_receiver_disposition: 'REFUSE',
    final_receiver_disposition_receipt_id: refusal.receipt_id,
    final_receiver_admitted: finalSnapshot.receiver.admitted,
    final_receiver_refused: finalSnapshot.receiver.refused,
    child_stdout: childStdout,
    child_stderr: childStderr,
    laws: [
      'PROCESS DEATH != WORLD DEATH',
      'RESTART != NEW HISTORY',
      'REPLAY != DUPLICATE CONSEQUENCE',
      'QUEUE CLAIM != SEMANTIC EFFECT',
      'RECEIPT BUS != AUTHORITY',
      'PROCESS RESTART != MEMORY RESET',
      'RUNTIME CONTINUITY != ADMISSION',
      'HAPPY PATH != RELEASE',
    ],
  }, null, 2));
} finally {
  await rm(workspace, { recursive: true, force: true });
}
