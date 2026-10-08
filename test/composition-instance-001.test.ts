import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

import { generateP256KeyPair } from '../src/protocol.ts';
import {
  compositionInstanceId,
  finalizeCompositionInstance,
  makeCompositionInstanceSpec,
  openCompositionInstance,
} from '../experiments/composition-instance-001/contract.ts';

const FROZEN_SRC_TREE_SHA =
  'c0e4d2c59481e0fb2a4bf4bb294f373907fd2b76';

function spec(goal = 'BUILD A WORLD') {
  return makeCompositionInstanceSpec({
    runtime_id: 'test-runtime/v0',
    base_snapshot_ref: 'snapshot:test:001',
    goal,
    capabilities: ['compose', 'observe'],
    limits: { memory_mb: 64, network: 'none' },
    observer_mode: 'fresh-session',
    requested_output_class: 'test-world',
    normative_src_tree: FROZEN_SRC_TREE_SHA,
  });
}

async function opened(value = spec()) {
  return openCompositionInstance({
    spec: value,
    signer: await generateP256KeyPair(),
    receiver: await generateP256KeyPair(),
    hop_index: 30,
  });
}

test('COMPOSITION-INSTANCE-001: governing src snapshot remains exactly addressable', () => {
  const current = execFileSync('git', ['rev-parse', 'HEAD:src'], {
    encoding: 'utf8',
  }).trim();
  assert.equal(current, FROZEN_SRC_TREE_SHA);
});

test('COMPOSITION-INSTANCE-001: identical spec has stable instance identity', () => {
  assert.equal(compositionInstanceId(spec()), compositionInstanceId(spec()));
  assert.notEqual(
    compositionInstanceId(spec('BUILD A WORLD')),
    compositionInstanceId(spec('BUILD SOMETHING ELSE')),
  );
});

test('COMPOSITION-INSTANCE-001: opening admits the instance, not its future result', async () => {
  const value = spec();
  const instance = await opened(value);

  assert.equal(instance.launch.receipt.kind, 'R3_ADMIT');
  assert.equal(instance.launch.disposition, 'R3_ADMIT');
  assert.match(instance.instance_id, /^composition-instance-v0:[a-f0-9]{64}$/);
});

test('COMPOSITION-INSTANCE-001: result is always a child HOLD candidate', async () => {
  const value = spec();
  const instance = await opened(value);
  const candidateBytes = Buffer.from('new particular born inside runtime', 'utf8');

  const finalized = await finalizeCompositionInstance({
    opened: instance,
    spec: value,
    runtime_evidence: {
      runtime_id: value.runtime_id,
      author_session_id: 'author:1',
      observer_session_id: 'observer:2',
      observed_state_ref: 'sha256:' + 'a'.repeat(64),
      observed_state_sha256: 'a'.repeat(64),
      action_trace_ref: 'sha256:' + 'b'.repeat(64),
      claims: { runtime_observed: true },
    },
    candidate_bytes: candidateBytes,
    signer: await generateP256KeyPair(),
    receiver: await generateP256KeyPair(),
    hop_index: 31,
  });

  assert.equal(finalized.candidate.receipt.kind, 'R3_HOLD');
  assert.equal(finalized.result.result_disposition, 'R3_HOLD');
  assert.deepEqual(
    finalized.candidate.crossing.parents,
    [instance.launch.crossing.crossing_id],
  );
  assert.equal(
    finalized.result.launch_crossing_id,
    instance.launch.crossing.crossing_id,
  );
});

test('COMPOSITION-INSTANCE-001: author cannot satisfy required fresh observer role', async () => {
  const value = spec();
  const instance = await opened(value);

  await assert.rejects(
    finalizeCompositionInstance({
      opened: instance,
      spec: value,
      runtime_evidence: {
        runtime_id: value.runtime_id,
        author_session_id: 'same-session',
        observer_session_id: 'same-session',
        observed_state_ref: 'sha256:' + 'a'.repeat(64),
        observed_state_sha256: 'a'.repeat(64),
        action_trace_ref: 'sha256:' + 'b'.repeat(64),
        claims: {},
      },
      candidate_bytes: Buffer.from('candidate'),
      signer: await generateP256KeyPair(),
      receiver: await generateP256KeyPair(),
      hop_index: 32,
    }),
    /COMPOSITION_OBSERVER_NOT_DISTINCT/,
  );
});

test('COMPOSITION-INSTANCE-001: runtime cannot swap identity after instance admission', async () => {
  const value = spec();
  const instance = await opened(value);

  await assert.rejects(
    finalizeCompositionInstance({
      opened: instance,
      spec: value,
      runtime_evidence: {
        runtime_id: 'different-runtime/v9',
        author_session_id: 'author',
        observer_session_id: 'observer',
        observed_state_ref: 'sha256:' + 'a'.repeat(64),
        observed_state_sha256: 'a'.repeat(64),
        action_trace_ref: 'sha256:' + 'b'.repeat(64),
        claims: {},
      },
      candidate_bytes: Buffer.from('candidate'),
      signer: await generateP256KeyPair(),
      receiver: await generateP256KeyPair(),
      hop_index: 33,
    }),
    /COMPOSITION_RUNTIME_MISMATCH/,
  );
});

test('COMPOSITION-INSTANCE-001: empty composition cannot become a candidate', async () => {
  const value = spec();
  const instance = await opened(value);

  await assert.rejects(
    finalizeCompositionInstance({
      opened: instance,
      spec: value,
      runtime_evidence: {
        runtime_id: value.runtime_id,
        author_session_id: 'author',
        observer_session_id: 'observer',
        observed_state_ref: 'sha256:' + 'a'.repeat(64),
        observed_state_sha256: 'a'.repeat(64),
        action_trace_ref: 'sha256:' + 'b'.repeat(64),
        claims: {},
      },
      candidate_bytes: Buffer.alloc(0),
      signer: await generateP256KeyPair(),
      receiver: await generateP256KeyPair(),
      hop_index: 34,
    }),
    /COMPOSITION_EMPTY_CANDIDATE/,
  );
});

test('COMPOSITION-INSTANCE-001: snapshot and capability changes create new instance identity', () => {
  const a = spec();
  const b = makeCompositionInstanceSpec({
    runtime_id: a.runtime_id,
    base_snapshot_ref: 'snapshot:test:002',
    goal: a.goal,
    capabilities: [...a.capabilities, 'extra-capability'],
    limits: a.limits,
    observer_mode: a.observer_policy.mode,
    requested_output_class: a.requested_output_class,
    normative_src_tree: FROZEN_SRC_TREE_SHA,
  });

  assert.notEqual(compositionInstanceId(a), compositionInstanceId(b));
});
