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
  selectDwnRoadCandidate,
} from '../src/did-dht-discovery.ts';
import {
  publishAndResolveDidDhtGateway,
} from '../src/did-dht-gateway.ts';
import {
  writeCrossingToRemoteDwn,
  readCrossingFromRemoteDwn,
} from '../src/remote-dwn-road.ts';
import {
  replicateCrossingBetweenRemoteDwns,
} from '../src/mortal-road.ts';
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
  source_particular: 'particular:mortal-road-001',
  source_world: 'world:mortal-road-origin',
  source_history_head: 'local:mortal-road-001:head',
  parents: [],
  declared_kind: 'MORTAL_ROAD_001',
  payload_refs: [{
    address: 'sha256:' + 'a'.repeat(64),
    role: 'payload',
    media_type: 'application/json',
  }],
  requested_effect: null,
  capability_ref: null,
  privacy_policy: null,
  audience_policy: null,
  return_address: null,
  created_at: '2026-10-02T00:30:00.000Z',
  extensions: {
    witness: 'MORTAL-ROAD-001',
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
  created_at: '2026-10-02T00:31:00.000Z',
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

const selectedA = selectDwnRoadCandidate(
  discovery,
  candidateA!.candidate_id,
  '2026-10-02T00:32:00.000Z',
);
const selectedB = selectDwnRoadCandidate(
  discovery,
  candidateB!.candidate_id,
  '2026-10-02T00:32:01.000Z',
);

const tenant = await TestDataGenerator.generateDidKeyPersona();
const tenantSigner = Jws.createSigner(tenant);

const firstWrite = await writeCrossingToRemoteDwn({
  endpoint: selectedA.endpoint,
  tenant_did: tenant.did,
  signer: tenantSigner,
  crossing,
});
assert.equal(firstWrite.dwn_status, 202);

const replication = await replicateCrossingBetweenRemoteDwns({
  source_endpoint: selectedA.endpoint,
  source_record_id: firstWrite.dwn_record_id,
  destination_endpoint: selectedB.endpoint,
  tenant_did: tenant.did,
  signer: tenantSigner,
});
assert.equal(replication.crossing_preserved, true);
assert.equal(replication.destination_write_status, 202);

const preMortalityRead = await readCrossingFromRemoteDwn({
  endpoint: selectedB.endpoint,
  tenant_did: tenant.did,
  signer: tenantSigner,
  record_id: replication.destination_record_id,
});
assert.equal(preMortalityRead.crossing_id, crossing.crossing_id);

execFileSync('docker', ['stop', nodeAContainer], { stdio: 'pipe' });

let nodeAUnavailable = false;
try {
  await readCrossingFromRemoteDwn({
    endpoint: selectedA.endpoint,
    tenant_did: tenant.did,
    signer: tenantSigner,
    record_id: firstWrite.dwn_record_id,
  });
} catch {
  nodeAUnavailable = true;
}
assert.equal(nodeAUnavailable, true);

const recoveredFromB = await readCrossingFromRemoteDwn({
  endpoint: selectedB.endpoint,
  tenant_did: tenant.did,
  signer: tenantSigner,
  record_id: replication.destination_record_id,
});
assert.equal(recoveredFromB.crossing_id, crossing.crossing_id);
assert.deepEqual(recoveredFromB.crossing, crossing);

const workspace = await mkdtemp(join(tmpdir(), 'relatte-mortal-road-'));
const receiverRoot = join(workspace, 'successor-receiver');
try {
  const receiver = await LocalReceiver.create(receiverRoot, {
    world_id: 'world:mortal-road-successor',
    receiver_particular: 'particular:mortal-road-successor',
    contract_ref: 'relatte:mortal-road-001/v0',
  });

  const received = await receiver.receive(
    recoveredFromB.crossing,
    '2026-10-02T00:33:00.000Z',
  );
  assert.equal(received.semantic_effect, 'none');
  assert.deepEqual(receiver.snapshot().admitted, []);

  const refusal = await receiver.dispose(
    crossing.crossing_id,
    'REFUSE',
    '2026-10-02T00:34:00.000Z',
    { note: 'node mortality does not inherit or compel local authority' },
  );
  const finalSnapshot = receiver.snapshot();

  assert.deepEqual(finalSnapshot.admitted, []);
  assert.deepEqual(finalSnapshot.refused, [crossing.crossing_id]);

  console.log(JSON.stringify({
    schema: 'relatte.mortal-road-witness/v0',
    locator_did: locatorDid.uri,
    locator_binding_id: binding.binding_id,
    node_a_candidate_id: selectedA.candidate_id,
    node_b_candidate_id: selectedB.candidate_id,
    dwn_tenant_did: tenant.did,
    crossing_id: crossing.crossing_id,
    node_a_record_id: firstWrite.dwn_record_id,
    node_b_record_id: replication.destination_record_id,
    replication_crossing_preserved: replication.crossing_preserved,
    node_a_stopped: true,
    node_a_unavailable_after_stop: nodeAUnavailable,
    node_b_recovery_status: recoveredFromB.dwn_status,
    recovered_crossing_preserved: recoveredFromB.crossing_id === crossing.crossing_id,
    successor_receive_receipt_id: received.receipt_id,
    successor_disposition: 'REFUSE',
    successor_disposition_receipt_id: refusal.receipt_id,
    successor_admitted: finalSnapshot.admitted,
    successor_refused: finalSnapshot.refused,
    semantic_effect_before_successor_disposition: 'none',
    laws: [
      'REPLICATION != CONSENSUS',
      'REPLICATION != ADMISSION',
      'COPY != AUTHORITY',
      'NODE A != NODE B',
      'NODE DEATH != CROSSING DEATH',
      'ROAD DEATH != HISTORY DEATH',
      'RECOVERY != ADMISSION',
      'SUCCESSOR AUTHORITY != TRANSPORT CONTINUITY',
    ],
  }, null, 2));
} finally {
  await rm(workspace, { recursive: true, force: true });
}
