import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  Jws,
  TestDataGenerator,
} from '@tbd54566975/dwn-sdk-js';
import { DidDht } from '@web5/dids';

import {
  createDidBinding,
  verifyDidBindingForCrossing,
} from '../src/did-binding.ts';
import {
  discoverDwnRoadCandidatesFromDidDocument,
} from '../src/did-dht-discovery.ts';
import {
  publishAndResolveDidDhtGateway,
} from '../src/did-dht-gateway.ts';
import {
  writeCrossingToRemoteDwn,
} from '../src/remote-dwn-road.ts';
import {
  replicateCrossingBetweenRemoteDwns,
} from '../src/mortal-road.ts';
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
import { LocalReceiver } from '../src/receiver.ts';

const dhtGateway = process.env.DID_DHT_GATEWAY_URL;
const nodeA = process.env.REMOTE_DWN_A_URL;
const nodeB = process.env.REMOTE_DWN_B_URL;
const nodeAContainer = process.env.REMOTE_DWN_A_CONTAINER;

if (!dhtGateway) throw new Error('DID_DHT_GATEWAY_URL is required');
if (!nodeA) throw new Error('REMOTE_DWN_A_URL is required');
if (!nodeB) throw new Error('REMOTE_DWN_B_URL is required');
if (!nodeAContainer) throw new Error('REMOTE_DWN_A_CONTAINER is required');

async function waitForHealth(url: string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(new URL('/health', url));
      if (response.ok) return;
    } catch {
      // The half-open probe must wait until the restarted foreign process is reachable.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('ROAD_MEMORY_RESTART_HEALTH_TIMEOUT');
}

const locatorDid = await DidDht.create({
  options: {
    publish: false,
    services: [{
      id: 'dwn',
      type: 'DecentralizedWebNode',
      serviceEndpoint: [nodeA, nodeB],
    }],
  },
});

const locatorSigner = await locatorDid.getSigner();
const locatorMethod = locatorDid.document.verificationMethod?.find(
  (entry) => entry.id === locatorSigner.keyId,
);
assert.ok(locatorMethod?.publicKeyJwk);

const relatteKeys = await generateP256KeyPair();
const crossing = await sealCrossingEnvelope({
  schema: 'relatte.crossing-envelope/v0',
  protocol_version: '0',
  source_particular: 'particular:road-memory-circuit-breaker-001',
  source_world: 'world:road-memory-origin',
  source_history_head: 'local:road-memory-circuit-breaker-001:head',
  parents: [],
  declared_kind: 'ROAD_MEMORY_CIRCUIT_BREAKER_001',
  payload_refs: [{
    address: 'sha256:' + 'e'.repeat(64),
    role: 'payload',
    media_type: 'application/json',
  }],
  requested_effect: null,
  capability_ref: null,
  privacy_policy: null,
  audience_policy: null,
  return_address: null,
  created_at: '2026-10-02T00:57:00.000Z',
  extensions: {
    witness: 'ROAD-MEMORY-CIRCUIT-BREAKER-001',
  },
}, relatteKeys);

const binding = await createDidBinding({
  crossing,
  particular_id: crossing.source_particular,
  relatte_keys: relatteKeys,
  did_uri: locatorDid.uri,
  did_verification_method_id: locatorSigner.keyId,
  did_public_key_jwk: locatorMethod!.publicKeyJwk!,
  did_signer: locatorSigner,
  created_at: '2026-10-02T00:57:01.000Z',
});
assert.equal(await verifyDidBindingForCrossing(binding, crossing), true);

const gatewayRoundTrip = await publishAndResolveDidDhtGateway({
  did: locatorDid,
  gateway_uri: dhtGateway,
});
assert.equal(gatewayRoundTrip.candidates_preserved, true);

const resolved = await DidDht.resolve(locatorDid.uri, {
  gatewayUri: gatewayRoundTrip.gateway_uri,
});
assert.ok(resolved.didDocument);

const discovery = discoverDwnRoadCandidatesFromDidDocument(resolved.didDocument);
assert.equal(discovery.candidates.length, 2);

const candidateA = discovery.candidates.find(
  (entry) => entry.endpoint === new URL(nodeA).toString(),
);
const candidateB = discovery.candidates.find(
  (entry) => entry.endpoint === new URL(nodeB).toString(),
);
assert.ok(candidateA);
assert.ok(candidateB);

const tenant = await TestDataGenerator.generateDidKeyPersona();
const tenantSigner = Jws.createSigner(tenant);

const firstWrite = await writeCrossingToRemoteDwn({
  endpoint: candidateA!.endpoint,
  tenant_did: tenant.did,
  signer: tenantSigner,
  crossing,
});
assert.equal(firstWrite.dwn_status, 202);

const replication = await replicateCrossingBetweenRemoteDwns({
  source_endpoint: candidateA!.endpoint,
  source_record_id: firstWrite.dwn_record_id,
  destination_endpoint: candidateB!.endpoint,
  tenant_did: tenant.did,
  signer: tenantSigner,
});
assert.equal(replication.crossing_preserved, true);

const workspace = await mkdtemp(join(tmpdir(), 'relatte-road-memory-live-'));
const memoryRoot = join(workspace, 'road-memory');

try {
  let memory = await LocalRoadMemory.create(memoryRoot, {
    failure_threshold: 1,
    cooldown_ms: 60_000,
  });

  execFileSync('docker', ['stop', nodeAContainer], { stdio: 'pipe' });

  const firstRecovery = await readCrossingWithRoadMemory({
    discovery,
    routes: [
      {
        candidate_id: candidateA!.candidate_id,
        record_id: firstWrite.dwn_record_id,
        selected_at: '2026-10-02T00:58:00.000Z',
      },
      {
        candidate_id: candidateB!.candidate_id,
        record_id: replication.destination_record_id,
        selected_at: '2026-10-02T00:58:01.000Z',
      },
    ],
    tenant_did: tenant.did,
    signer: tenantSigner,
    expected_crossing_id: crossing.crossing_id,
    memory,
  });

  assert.equal(firstRecovery.steps.length, 2);
  assert.equal(firstRecovery.steps[0].outcome, 'failed');
  assert.equal(firstRecovery.steps[0].attempt?.failure_code, 'TRANSPORT_UNREACHABLE');
  assert.equal(firstRecovery.steps[1].outcome, 'recovered');
  assert.equal(firstRecovery.recovered_candidate_id, candidateB!.candidate_id);

  const afterFailure = memory.snapshot();
  const aAfterFailure = afterFailure.candidates.find(
    (entry) => entry.candidate_id === candidateA!.candidate_id,
  );
  assert.equal(aAfterFailure?.circuit, 'OPEN');
  assert.equal(aAfterFailure?.open_until, '2026-10-02T00:59:00.000Z');

  memory = await LocalRoadMemory.open(memoryRoot);

  const cooldownRecovery = await readCrossingWithRoadMemory({
    discovery,
    routes: [
      {
        candidate_id: candidateA!.candidate_id,
        record_id: firstWrite.dwn_record_id,
        selected_at: '2026-10-02T00:58:30.000Z',
      },
      {
        candidate_id: candidateB!.candidate_id,
        record_id: replication.destination_record_id,
        selected_at: '2026-10-02T00:58:31.000Z',
      },
    ],
    tenant_did: tenant.did,
    signer: tenantSigner,
    expected_crossing_id: crossing.crossing_id,
    memory,
  });

  assert.equal(cooldownRecovery.steps[0].outcome, 'skipped-open');
  assert.equal(cooldownRecovery.steps[0].decision.state, 'OPEN');
  assert.equal(cooldownRecovery.steps[0].attempt, null);
  assert.equal(cooldownRecovery.steps[1].outcome, 'recovered');
  assert.equal(cooldownRecovery.recovered_candidate_id, candidateB!.candidate_id);

  execFileSync('docker', ['start', nodeAContainer], { stdio: 'pipe' });
  await waitForHealth(nodeA);

  memory = await LocalRoadMemory.open(memoryRoot);

  const healedRecovery = await readCrossingWithRoadMemory({
    discovery,
    routes: [
      {
        candidate_id: candidateA!.candidate_id,
        record_id: firstWrite.dwn_record_id,
        selected_at: '2026-10-02T00:59:01.000Z',
      },
      {
        candidate_id: candidateB!.candidate_id,
        record_id: replication.destination_record_id,
        selected_at: '2026-10-02T00:59:02.000Z',
      },
    ],
    tenant_did: tenant.did,
    signer: tenantSigner,
    expected_crossing_id: crossing.crossing_id,
    memory,
  });

  assert.equal(healedRecovery.steps.length, 1);
  assert.equal(healedRecovery.steps[0].decision.state, 'HALF_OPEN');
  assert.equal(healedRecovery.steps[0].decision.action, 'PROBE_HALF_OPEN');
  assert.equal(healedRecovery.steps[0].outcome, 'recovered');
  assert.equal(healedRecovery.recovered_candidate_id, candidateA!.candidate_id);
  assert.equal(healedRecovery.crossing_id, crossing.crossing_id);

  const finalMemory = memory.snapshot();
  const aFinal = finalMemory.candidates.find(
    (entry) => entry.candidate_id === candidateA!.candidate_id,
  );
  assert.equal(aFinal?.circuit, 'CLOSED');
  assert.equal(aFinal?.consecutive_failures, 0);
  assert.equal(aFinal?.open_until, null);

  const receiverRoot = join(workspace, 'receiver');
  const receiver = await LocalReceiver.create(receiverRoot, {
    world_id: 'world:road-memory-receiver',
    receiver_particular: 'particular:road-memory-receiver',
    contract_ref: 'relatte:road-memory-circuit-breaker-001/v0',
  });

  const receiveReceipt = await receiver.receive(
    healedRecovery.crossing,
    '2026-10-02T01:00:00.000Z',
  );
  assert.equal(receiveReceipt.semantic_effect, 'none');
  assert.deepEqual(receiver.snapshot().admitted, []);

  const refusal = await receiver.dispose(
    crossing.crossing_id,
    'REFUSE',
    '2026-10-02T01:00:01.000Z',
    { note: 'healed transport remains separate from receiver authority' },
  );
  const receiverSnapshot = receiver.snapshot();
  assert.deepEqual(receiverSnapshot.admitted, []);
  assert.deepEqual(receiverSnapshot.refused, [crossing.crossing_id]);

  console.log(JSON.stringify({
    schema: 'relatte.road-memory-circuit-breaker-witness/v0',
    locator_did: locatorDid.uri,
    locator_binding_id: binding.binding_id,
    crossing_id: crossing.crossing_id,
    node_a_candidate_id: candidateA!.candidate_id,
    node_b_candidate_id: candidateB!.candidate_id,
    node_a_record_id: firstWrite.dwn_record_id,
    node_b_record_id: replication.destination_record_id,
    memory_config: {
      failure_threshold: memory.config.failure_threshold,
      cooldown_ms: memory.config.cooldown_ms,
    },
    first_cycle: {
      node_a_stopped: true,
      a_outcome: firstRecovery.steps[0].outcome,
      a_failure_code: firstRecovery.steps[0].attempt?.failure_code,
      recovered_candidate_id: firstRecovery.recovered_candidate_id,
      a_circuit_after_failure: aAfterFailure?.circuit,
      a_open_until: aAfterFailure?.open_until,
    },
    cooldown_cycle: {
      a_action: cooldownRecovery.steps[0].decision.action,
      a_network_attempt: cooldownRecovery.steps[0].attempt !== null,
      recovered_candidate_id: cooldownRecovery.recovered_candidate_id,
    },
    healing_cycle: {
      node_a_restarted: true,
      a_state_before_probe: healedRecovery.steps[0].decision.state,
      a_action: healedRecovery.steps[0].decision.action,
      a_outcome: healedRecovery.steps[0].outcome,
      recovered_candidate_id: healedRecovery.recovered_candidate_id,
      recovered_crossing_preserved: healedRecovery.crossing_id === crossing.crossing_id,
      a_circuit_after_probe: aFinal?.circuit,
      a_failures_after_probe: aFinal?.consecutive_failures,
    },
    road_memory_event_count: finalMemory.event_count,
    road_memory_history_head: finalMemory.history_head,
    road_memory_state_ref: finalMemory.state_ref,
    did_document_mutated_by_memory: false,
    receiver_disposition: 'REFUSE',
    receiver_admitted: receiverSnapshot.admitted,
    receiver_refused: receiverSnapshot.refused,
    semantic_effect_before_receiver_disposition: 'none',
    laws: [
      'LOCAL ROAD MEMORY != GLOBAL REPUTATION',
      'FAILURE OBSERVED != ROAD ERASED',
      'SKIP != ERASURE',
      'OPEN != PERMANENTLY DEAD',
      'PROBE != TRUST',
      'AVAILABILITY FAILURE != INTEGRITY FAILURE',
      'ROAD HEALTH != RECEIVER AUTHORITY',
      'ROAD CHANGE != CROSSING CHANGE',
    ],
  }, null, 2));
} finally {
  await rm(workspace, { recursive: true, force: true });
}
