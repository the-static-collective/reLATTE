import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  Jws,
  TestDataGenerator,
} from '@tbd54566975/dwn-sdk-js';

import {
  discoverDwnRoadCandidatesFromDidDocument,
} from '../src/did-dht-discovery.ts';
import {
  LocalRoadMemory,
} from '../src/road-memory.ts';
import {
  readCrossingWithRoadMemory,
} from '../src/road-memory-failover.ts';
import {
  generateP256KeyPair,
  sealCrossingEnvelope,
} from '../src/index.ts';

async function makeCrossing() {
  const keys = await generateP256KeyPair();
  return sealCrossingEnvelope({
    schema: 'relatte.crossing-envelope/v0',
    protocol_version: '0',
    source_particular: 'particular:road-memory-unit',
    source_world: 'world:road-memory-unit',
    source_history_head: 'local:road-memory-unit:head',
    parents: [],
    declared_kind: 'ROAD_MEMORY_UNIT',
    payload_refs: [{
      address: 'sha256:' + 'd'.repeat(64),
      role: 'payload',
      media_type: 'application/json',
    }],
    requested_effect: null,
    capability_ref: null,
    privacy_policy: null,
    audience_policy: null,
    return_address: null,
    created_at: '2026-10-02T00:50:00.000Z',
    extensions: {},
  }, keys);
}

function discovery() {
  return discoverDwnRoadCandidatesFromDidDocument({
    id: 'did:dht:road-memory-unit',
    service: [{
      id: 'dwn',
      type: 'DecentralizedWebNode',
      serviceEndpoint: [
        'https://node-a.example/',
        'https://node-b.example/',
      ],
    }],
  });
}

test('availability failure opens locally, cooldown skips, later probe can close', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'relatte-road-memory-unit-'));
  const root = join(workspace, 'memory');
  try {
    const memory = await LocalRoadMemory.create(root, {
      failure_threshold: 1,
      cooldown_ms: 60_000,
    });

    await memory.observeAvailabilityFailure({
      candidate_id: 'candidate:a',
      endpoint: 'https://node-a.example/',
      failure_code: 'TRANSPORT_UNREACHABLE',
      observed_at: '2026-10-02T00:51:00.000Z',
    });

    const openDecision = memory.decide({
      candidate_id: 'candidate:a',
      endpoint: 'https://node-a.example/',
      observed_at: '2026-10-02T00:51:30.000Z',
    });
    assert.equal(openDecision.state, 'OPEN');
    assert.equal(openDecision.action, 'SKIP_OPEN');

    const probeDecision = memory.decide({
      candidate_id: 'candidate:a',
      endpoint: 'https://node-a.example/',
      observed_at: '2026-10-02T00:52:01.000Z',
    });
    assert.equal(probeDecision.state, 'HALF_OPEN');
    assert.equal(probeDecision.action, 'PROBE_HALF_OPEN');

    await memory.observeSuccess({
      candidate_id: 'candidate:a',
      endpoint: 'https://node-a.example/',
      observed_at: '2026-10-02T00:52:01.000Z',
    });

    const closedDecision = memory.decide({
      candidate_id: 'candidate:a',
      endpoint: 'https://node-a.example/',
      observed_at: '2026-10-02T00:52:02.000Z',
    });
    assert.equal(closedDecision.state, 'CLOSED');
    assert.equal(closedDecision.action, 'ATTEMPT');
    assert.equal(closedDecision.consecutive_failures, 0);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('road memory survives process restart without becoming global reputation', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'relatte-road-memory-replay-'));
  const root = join(workspace, 'memory');
  try {
    const first = await LocalRoadMemory.create(root, {
      failure_threshold: 1,
      cooldown_ms: 60_000,
    });
    await first.observeAvailabilityFailure({
      candidate_id: 'candidate:a',
      endpoint: 'https://node-a.example/',
      failure_code: 'REMOTE_HTTP_UNAVAILABLE',
      observed_at: '2026-10-02T00:53:00.000Z',
    });
    const before = first.snapshot();

    const reopened = await LocalRoadMemory.open(root);
    const after = reopened.snapshot();

    assert.equal(after.history_head, before.history_head);
    assert.equal(after.state_ref, before.state_ref);
    assert.deepEqual(after.candidates, before.candidates);

    const decision = reopened.decide({
      candidate_id: 'candidate:a',
      endpoint: 'https://node-a.example/',
      observed_at: '2026-10-02T00:53:30.000Z',
    });
    assert.equal(decision.action, 'SKIP_OPEN');
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('integrity and authorization failures cannot poison availability memory', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'relatte-road-memory-boundary-'));
  const root = join(workspace, 'memory');
  try {
    const memory = await LocalRoadMemory.create(root, {
      failure_threshold: 1,
      cooldown_ms: 60_000,
    });

    await assert.rejects(
      () => memory.observeAvailabilityFailure({
        candidate_id: 'candidate:a',
        endpoint: 'https://node-a.example/',
        failure_code: 'REMOTE_READ_REJECTED',
        observed_at: '2026-10-02T00:54:00.000Z',
      }),
      /NON_AVAILABILITY_FAILURE_NOT_RECORDABLE/,
    );

    assert.equal(memory.snapshot().event_count, 0);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('memory-aware failover skips open A and recovers through B without network attempt to A', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'relatte-road-memory-failover-'));
  const root = join(workspace, 'memory');
  try {
    const persona = await TestDataGenerator.generateDidKeyPersona();
    const signer = Jws.createSigner(persona);
    const crossing = await makeCrossing();
    const report = discovery();
    const [a, b] = report.candidates.sort((x, y) => x.endpoint.localeCompare(y.endpoint));

    const memory = await LocalRoadMemory.create(root, {
      failure_threshold: 1,
      cooldown_ms: 60_000,
    });
    await memory.observeAvailabilityFailure({
      candidate_id: a.candidate_id,
      endpoint: a.endpoint,
      failure_code: 'TRANSPORT_UNREACHABLE',
      observed_at: '2026-10-02T00:55:00.000Z',
    });

    const calls: string[] = [];
    const result = await readCrossingWithRoadMemory({
      discovery: report,
      routes: [
        {
          candidate_id: a.candidate_id,
          record_id: 'record:a',
          selected_at: '2026-10-02T00:55:30.000Z',
        },
        {
          candidate_id: b.candidate_id,
          record_id: 'record:b',
          selected_at: '2026-10-02T00:55:31.000Z',
        },
      ],
      tenant_did: persona.did,
      signer,
      expected_crossing_id: crossing.crossing_id,
      memory,
      read_impl: async (args) => {
        calls.push(args.endpoint);
        return {
          schema: 'relatte.remote-dwn-read/v0',
          crossing,
          crossing_id: crossing.crossing_id,
          dwn_record_id: args.record_id,
          tenant_did: persona.did,
          endpoint: args.endpoint,
          dwn_status: 200,
          semantic_effect: 'none',
          laws: [],
        };
      },
    });

    assert.deepEqual(calls, [b.endpoint]);
    assert.equal(result.steps[0].outcome, 'skipped-open');
    assert.equal(result.steps[0].decision.state, 'OPEN');
    assert.equal(result.steps[1].outcome, 'recovered');
    assert.equal(result.recovered_candidate_id, b.candidate_id);
    assert.equal(result.crossing_id, crossing.crossing_id);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('half-open probe succeeds on A and closes local circuit before B is touched', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'relatte-road-memory-probe-'));
  const root = join(workspace, 'memory');
  try {
    const persona = await TestDataGenerator.generateDidKeyPersona();
    const signer = Jws.createSigner(persona);
    const crossing = await makeCrossing();
    const report = discovery();
    const [a, b] = report.candidates.sort((x, y) => x.endpoint.localeCompare(y.endpoint));

    const memory = await LocalRoadMemory.create(root, {
      failure_threshold: 1,
      cooldown_ms: 60_000,
    });
    await memory.observeAvailabilityFailure({
      candidate_id: a.candidate_id,
      endpoint: a.endpoint,
      failure_code: 'TRANSPORT_UNREACHABLE',
      observed_at: '2026-10-02T00:56:00.000Z',
    });

    const calls: string[] = [];
    const result = await readCrossingWithRoadMemory({
      discovery: report,
      routes: [
        {
          candidate_id: a.candidate_id,
          record_id: 'record:a',
          selected_at: '2026-10-02T00:57:01.000Z',
        },
        {
          candidate_id: b.candidate_id,
          record_id: 'record:b',
          selected_at: '2026-10-02T00:57:02.000Z',
        },
      ],
      tenant_did: persona.did,
      signer,
      expected_crossing_id: crossing.crossing_id,
      memory,
      read_impl: async (args) => {
        calls.push(args.endpoint);
        return {
          schema: 'relatte.remote-dwn-read/v0',
          crossing,
          crossing_id: crossing.crossing_id,
          dwn_record_id: args.record_id,
          tenant_did: persona.did,
          endpoint: args.endpoint,
          dwn_status: 200,
          semantic_effect: 'none',
          laws: [],
        };
      },
    });

    assert.deepEqual(calls, [a.endpoint]);
    assert.equal(result.steps[0].decision.state, 'HALF_OPEN');
    assert.equal(result.steps[0].decision.action, 'PROBE_HALF_OPEN');
    assert.equal(result.steps[0].outcome, 'recovered');

    const after = memory.decide({
      candidate_id: a.candidate_id,
      endpoint: a.endpoint,
      observed_at: '2026-10-02T00:57:03.000Z',
    });
    assert.equal(after.state, 'CLOSED');
    assert.equal(after.action, 'ATTEMPT');
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
