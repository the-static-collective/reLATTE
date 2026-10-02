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
  readCrossingWithAutomaticFailover,
} from '../src/automatic-failover.ts';
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
  source_particular: 'particular:automatic-failover-001',
  source_world: 'world:automatic-failover-origin',
  source_history_head: 'local:automatic-failover-001:head',
  parents: [],
  declared_kind: 'AUTOMATIC_FAILOVER_001',
  payload_refs: [{
    address: 'sha256:' + 'c'.repeat(64),
    role: 'payload',
    media_type: 'application/json',
  }],
  requested_effect: null,
  capability_ref: null,
  privacy_policy: null,
  audience_policy: null,
  return_address: null,
  created_at: '2026-10-02T00:45:00.000Z',
  extensions: {
    witness: 'AUTOMATIC-FAILOVER-001',
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
  created_at: '2026-10-02T00:46:00.000Z',
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

const candidateA = discovery.candidates.find((entry) => entry.endpoint === new URL(nodeA).toString());
const candidateB = discovery.candidates.find((entry) => entry.endpoint === new URL(nodeB).toString());
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

execFileSync('docker', ['stop', nodeAContainer], { stdio: 'pipe' });

const failover = await readCrossingWithAutomaticFailover({
  discovery,
  routes: [
    {
      candidate_id: candidateA!.candidate_id,
      record_id: firstWrite.dwn_record_id,
      selected_at: '2026-10-02T00:47:00.000Z',
    },
    {
      candidate_id: candidateB!.candidate_id,
      record_id: replication.destination_record_id,
      selected_at: '2026-10-02T00:47:01.000Z',
    },
  ],
  tenant_did: tenant.did,
  signer: tenantSigner,
  expected_crossing_id: crossing.crossing_id,
});

assert.equal(failover.attempts.length, 2);
assert.equal(failover.attempts[0].candidate_id, candidateA!.candidate_id);
assert.equal(failover.attempts[0].outcome, 'failed');
assert.equal(failover.attempts[1].candidate_id, candidateB!.candidate_id);
assert.equal(failover.attempts[1].outcome, 'recovered');
assert.equal(failover.crossing_id, crossing.crossing_id);

const workspace = await mkdtemp(join(tmpdir(), 'relatte-automatic-failover-'));
const receiverRoot = join(workspace, 'receiver');
try {
  const receiver = await LocalReceiver.create(receiverRoot, {
    world_id: 'world:automatic-failover-receiver',
    receiver_particular: 'particular:automatic-failover-receiver',
    contract_ref: 'relatte:automatic-failover-001/v0',
  });

  const receiveReceipt = await receiver.receive(
    failover.crossing,
    '2026-10-02T00:48:00.000Z',
  );
  assert.equal(receiveReceipt.semantic_effect, 'none');
  assert.deepEqual(receiver.snapshot().admitted, []);

  const refusal = await receiver.dispose(
    crossing.crossing_id,
    'REFUSE',
    '2026-10-02T00:49:00.000Z',
    { note: 'automatic road substitution does not transfer semantic authority' },
  );
  const snapshot = receiver.snapshot();
  assert.deepEqual(snapshot.admitted, []);
  assert.deepEqual(snapshot.refused, [crossing.crossing_id]);

  console.log(JSON.stringify({
    schema: 'relatte.automatic-failover-witness/v0',
    locator_did: locatorDid.uri,
    locator_binding_id: binding.binding_id,
    crossing_id: crossing.crossing_id,
    node_a_candidate_id: candidateA!.candidate_id,
    node_b_candidate_id: candidateB!.candidate_id,
    node_a_record_id: firstWrite.dwn_record_id,
    node_b_record_id: replication.destination_record_id,
    node_a_stopped: true,
    failover_id: failover.failover_id,
    failover_policy: failover.policy,
    attempt_count: failover.attempts.length,
    attempts: failover.attempts.map((attempt) => ({
      attempt_id: attempt.attempt_id,
      candidate_id: attempt.candidate_id,
      endpoint: attempt.endpoint,
      outcome: attempt.outcome,
      failure_code: attempt.failure_code,
      crossing_id: attempt.crossing_id,
    })),
    recovered_candidate_id: failover.recovered_candidate_id,
    recovered_endpoint: failover.recovered_endpoint,
    recovered_crossing_preserved: failover.crossing_id === crossing.crossing_id,
    receive_receipt_id: receiveReceipt.receipt_id,
    receiver_disposition: 'REFUSE',
    receiver_disposition_receipt_id: refusal.receipt_id,
    receiver_admitted: snapshot.admitted,
    receiver_refused: snapshot.refused,
    semantic_effect_before_receiver_disposition: 'none',
    laws: failover.laws,
  }, null, 2));
} finally {
  await rm(workspace, { recursive: true, force: true });
}
