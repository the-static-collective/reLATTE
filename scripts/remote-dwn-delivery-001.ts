import assert from 'node:assert/strict';
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
  generateP256KeyPair,
  sealCrossingEnvelope,
} from '../src/index.ts';
import { LocalReceiver } from '../src/receiver.ts';

const dhtGateway = process.env.DID_DHT_GATEWAY_URL;
const remoteDwn = process.env.REMOTE_DWN_URL;
if (!dhtGateway) throw new Error('DID_DHT_GATEWAY_URL is required');
if (!remoteDwn) throw new Error('REMOTE_DWN_URL is required');

const locatorDid = await DidDht.create({
  options: {
    publish: false,
    services: [{
      id: 'dwn',
      type: 'DecentralizedWebNode',
      serviceEndpoint: [remoteDwn],
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
  source_particular: 'particular:remote-dwn-delivery-001',
  source_world: 'world:remote-dwn-origin',
  source_history_head: 'local:remote-dwn-delivery-001:head',
  parents: [],
  declared_kind: 'REMOTE_DWN_DELIVERY_001',
  payload_refs: [{
    address: 'sha256:' + 'f'.repeat(64),
    role: 'payload',
    media_type: 'application/json',
  }],
  requested_effect: null,
  capability_ref: null,
  privacy_policy: null,
  audience_policy: null,
  return_address: null,
  created_at: '2026-10-01T23:56:00.000Z',
  extensions: {
    witness: 'REMOTE-DWN-DELIVERY-001',
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
  created_at: '2026-10-01T23:57:00.000Z',
});
assert.equal(await verifyDidBindingForCrossing(binding, crossing), true);

const gatewayRoundTrip = await publishAndResolveDidDhtGateway({
  did: locatorDid,
  gateway_uri: dhtGateway,
});
assert.equal(gatewayRoundTrip.candidates_preserved, true);

const resolvedLocator = await DidDht.resolve(locatorDid.uri, {
  gatewayUri: gatewayRoundTrip.gateway_uri,
});
assert.ok(resolvedLocator.didDocument);

const discovery = discoverDwnRoadCandidatesFromDidDocument(resolvedLocator.didDocument);
assert.equal(discovery.candidates.length, 1);

const selection = selectDwnRoadCandidate(
  discovery,
  discovery.candidates[0].candidate_id,
  '2026-10-01T23:58:00.000Z',
);
assert.equal(selection.authorized, false);
assert.equal(selection.delivered, false);

const tenant = await TestDataGenerator.generateDidKeyPersona();
const tenantSigner = Jws.createSigner(tenant);

const remoteWrite = await writeCrossingToRemoteDwn({
  endpoint: selection.endpoint,
  tenant_did: tenant.did,
  signer: tenantSigner,
  crossing,
});
assert.equal(remoteWrite.crossing_id, crossing.crossing_id);
assert.equal(remoteWrite.semantic_effect, 'none');

const remoteRead = await readCrossingFromRemoteDwn({
  endpoint: selection.endpoint,
  tenant_did: tenant.did,
  signer: tenantSigner,
  record_id: remoteWrite.dwn_record_id,
});
assert.equal(remoteRead.crossing_id, crossing.crossing_id);
assert.deepEqual(remoteRead.crossing, crossing);
assert.equal(remoteRead.semantic_effect, 'none');

const receiverWorkspace = await mkdtemp(join(tmpdir(), 'relatte-remote-dwn-receiver-'));
const receiverRoot = join(receiverWorkspace, 'receiver');
try {
  const receiver = await LocalReceiver.create(receiverRoot, {
    world_id: 'world:remote-dwn-receiver',
    receiver_particular: 'particular:remote-dwn-receiver',
    contract_ref: 'relatte:remote-dwn-delivery-001/v0',
  });

  const receiveReceipt = await receiver.receive(
    remoteRead.crossing,
    '2026-10-01T23:59:00.000Z',
  );

  const afterReceive = receiver.snapshot();
  assert.deepEqual(afterReceive.received, [crossing.crossing_id]);
  assert.deepEqual(afterReceive.admitted, []);
  assert.deepEqual(afterReceive.refused, []);
  assert.equal(receiveReceipt.semantic_effect, 'none');

  const refusal = await receiver.dispose(
    crossing.crossing_id,
    'REFUSE',
    '2026-10-02T00:00:00.000Z',
    { note: 'remote delivery does not compel local admission' },
  );

  const afterRefuse = receiver.snapshot();
  assert.deepEqual(afterRefuse.admitted, []);
  assert.deepEqual(afterRefuse.refused, [crossing.crossing_id]);
  assert.equal(refusal.semantic_effect, 'none');

  console.log(JSON.stringify({
    schema: 'relatte.remote-dwn-delivery-witness/v0',
    locator_did: locatorDid.uri,
    locator_binding_id: binding.binding_id,
    selected_candidate_id: selection.candidate_id,
    selected_endpoint: selection.endpoint,
    dwn_tenant_did: tenant.did,
    crossing_id: crossing.crossing_id,
    remote_record_id: remoteWrite.dwn_record_id,
    remote_write_status: remoteWrite.dwn_status,
    remote_read_status: remoteRead.dwn_status,
    crossing_preserved: remoteRead.crossing_id === crossing.crossing_id,
    receive_receipt_id: receiveReceipt.receipt_id,
    local_disposition: 'REFUSE',
    local_disposition_receipt_id: refusal.receipt_id,
    admitted: afterRefuse.admitted,
    refused: afterRefuse.refused,
    semantic_effect_before_local_disposition: 'none',
    laws: [
      'ROAD LOCATOR != DWN TENANT',
      'DISCOVERED != SELECTED',
      'SELECTED != AUTHORIZED',
      'REMOTE STORED != RELATTE ADMITTED',
      'REMOTE READ != RELATTE RECEIVE',
      'RECEIVED != ADMITTED',
      'DELIVERED != ADMITTED',
    ],
  }, null, 2));
} finally {
  await rm(receiverWorkspace, { recursive: true, force: true });
}
