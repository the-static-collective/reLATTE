import assert from 'node:assert/strict';

import { DidDht } from '@web5/dids';

import {
  createDidBinding,
  verifyDidBindingAgainstDidDocument,
  verifyDidBindingForCrossing,
} from '../src/did-binding.ts';
import {
  discoverDwnRoadCandidatesFromDidDocument,
} from '../src/did-dht-discovery.ts';
import {
  publishAndResolveDidDhtGateway,
} from '../src/did-dht-gateway.ts';
import {
  generateP256KeyPair,
  sealCrossingEnvelope,
} from '../src/index.ts';

const gatewayUri = process.env.DID_DHT_GATEWAY_URL;
if (!gatewayUri) {
  throw new Error('DID_DHT_GATEWAY_URL is required');
}

const did = await DidDht.create({
  options: {
    publish: false,
    services: [{
      id: 'dwn',
      type: 'DecentralizedWebNode',
      serviceEndpoint: [
        'https://node-a.invalid/relatte/live-dht-gateway-001',
        'https://node-b.invalid/relatte/live-dht-gateway-001',
      ],
    }],
  },
});

const signer = await did.getSigner();
const method = did.document.verificationMethod?.find((entry) => entry.id === signer.keyId);
assert.ok(method?.publicKeyJwk);

const relatteKeys = await generateP256KeyPair();
const crossing = await sealCrossingEnvelope({
  schema: 'relatte.crossing-envelope/v0',
  protocol_version: '0',
  source_particular: 'particular:live-dht-gateway-001',
  source_world: 'world:live-dht-gateway-001',
  source_history_head: 'local:live-dht-gateway-001:head',
  parents: [],
  declared_kind: 'LIVE_DHT_GATEWAY_001',
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
  created_at: '2026-10-01T23:45:00.000Z',
  extensions: {
    witness: 'LIVE-DHT-GATEWAY-001',
  },
}, relatteKeys);

const binding = await createDidBinding({
  crossing,
  particular_id: crossing.source_particular,
  relatte_keys: relatteKeys,
  did_uri: did.uri,
  did_verification_method_id: signer.keyId,
  did_public_key_jwk: method!.publicKeyJwk!,
  did_signer: signer,
  created_at: '2026-10-01T23:46:00.000Z',
});

assert.equal(await verifyDidBindingForCrossing(binding, crossing), true);
assert.equal(verifyDidBindingAgainstDidDocument(binding, did.document), true);

const localDiscovery = discoverDwnRoadCandidatesFromDidDocument(did.document);
assert.equal(localDiscovery.candidates.length, 2);

const roundTrip = await publishAndResolveDidDhtGateway({
  did,
  gateway_uri: gatewayUri,
});

const freshResolution = await DidDht.resolve(did.uri, { gatewayUri: roundTrip.gateway_uri });
assert.ok(freshResolution.didDocument);
assert.equal(
  verifyDidBindingAgainstDidDocument(binding, freshResolution.didDocument),
  true,
);

const freshDiscovery = discoverDwnRoadCandidatesFromDidDocument(freshResolution.didDocument);
assert.deepEqual(
  freshDiscovery.candidates.map((entry) => entry.candidate_id).sort(),
  roundTrip.resolved_candidate_ids,
);

const witness = {
  schema: 'relatte.live-dht-gateway-witness/v0',
  did_uri: did.uri,
  gateway_uri: roundTrip.gateway_uri,
  crossing_id: crossing.crossing_id,
  binding_id: binding.binding_id,
  local_candidate_ids: roundTrip.local_candidate_ids,
  resolved_candidate_ids: roundTrip.resolved_candidate_ids,
  publish_accepted: roundTrip.publish_accepted,
  resolved: roundTrip.resolved,
  candidates_preserved: roundTrip.candidates_preserved,
  historical_binding_preserved: true,
  semantic_effect: 'none',
  claims: roundTrip.claims,
  laws: roundTrip.laws,
};

console.log(JSON.stringify(witness, null, 2));
