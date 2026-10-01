import assert from 'node:assert/strict';
import test from 'node:test';

import { DidDht } from '@web5/dids';

import {
  createDidBinding,
  verifyDidBindingAgainstDidDocument,
  verifyDidBindingForCrossing,
} from '../src/did-binding.ts';
import {
  discoverDwnRoadCandidatesFromDidDocument,
  resolveDwnRoadCandidates,
  selectDwnRoadCandidate,
} from '../src/did-dht-discovery.ts';
import {
  generateP256KeyPair,
  sealCrossingEnvelope,
} from '../src/index.ts';

async function makeDhtDid(endpoints: string[]) {
  return DidDht.create({
    options: {
      publish: false,
      services: [{
        id: 'dwn',
        type: 'DecentralizedWebNode',
        serviceEndpoint: endpoints,
      }],
    },
  });
}

async function makeCrossing(keys: Awaited<ReturnType<typeof generateP256KeyPair>>) {
  return sealCrossingEnvelope({
    schema: 'relatte.crossing-envelope/v0',
    protocol_version: '0',
    source_particular: 'particular:did-dht-discovery-subject',
    source_world: 'world:did-dht-discovery-source',
    source_history_head: 'local:did-dht-discovery:head-001',
    parents: [],
    declared_kind: 'DID_DHT_DISCOVERY_001',
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
    created_at: '2026-10-01T23:20:00.000Z',
    extensions: {
      specimen: 'DID-DHT-DISCOVERY-001',
    },
  }, keys);
}

test('actual did:dht document advertises DWN endpoints as non-executable road candidates', async () => {
  const did = await makeDhtDid([
    'https://node-a.example/dwn',
    'http://127.0.0.1:8080/dwn',
  ]);

  assert.equal(did.metadata.published, false);
  assert.ok(did.uri.startsWith('did:dht:'));

  const report = discoverDwnRoadCandidatesFromDidDocument(did.document);

  assert.equal(report.did_uri, did.uri);
  assert.equal(report.resolution_status, 'resolved');
  assert.equal(report.road_observation, 'candidate-observed');
  assert.equal(report.candidates.length, 2);
  assert.equal(report.semantic_effect, 'none');

  const secure = report.candidates.find((entry) => entry.protocol === 'https:');
  const local = report.candidates.find((entry) => entry.endpoint.startsWith('http://127.0.0.1'));

  assert.ok(secure);
  assert.ok(local);
  assert.equal(secure.transport_security, 'tls');
  assert.equal(local.transport_security, 'cleartext');

  for (const candidate of report.candidates) {
    assert.equal(candidate.discovered_from_did, did.uri);
    assert.equal(candidate.service_id, `${did.uri}#dwn`);
    assert.equal(candidate.executable, false);
    assert.equal(candidate.semantic_effect, 'none');
    assert.ok(candidate.laws.includes('DISCOVERED != SELECTED'));
    assert.ok(candidate.laws.includes('ENDPOINT != AUTHORITY'));
  }
});

test('resolution failure remains UNKNOWN rather than becoming evidence that no road exists', async () => {
  const did = await makeDhtDid(['https://node.example/dwn']);

  const unavailable = await resolveDwnRoadCandidates(did.uri, {
    async resolve() {
      throw new Error('gateway offline');
    },
  });

  assert.equal(unavailable.resolution_status, 'unavailable');
  assert.equal(unavailable.road_observation, 'unknown');
  assert.deepEqual(unavailable.candidates, []);
  assert.equal(unavailable.resolver_error, 'gateway offline');
  assert.ok(unavailable.laws.includes('RESOLUTION FAILURE != ROAD ABSENCE'));
  assert.ok(unavailable.laws.includes('UNKNOWN != NONE'));

  const resolved = await resolveDwnRoadCandidates(did.uri, {
    async resolve() {
      return { didDocument: did.document, didResolutionMetadata: {} };
    },
  });

  assert.equal(resolved.resolution_status, 'resolved');
  assert.equal(resolved.road_observation, 'candidate-observed');
  assert.equal(resolved.candidates.length, 1);
});

test('hostile endpoint shapes are retained as ignored observations rather than executable roads', () => {
  const report = discoverDwnRoadCandidatesFromDidDocument({
    id: 'did:dht:hostile-example',
    service: [
      {
        id: '#dwn',
        type: 'DecentralizedWebNode',
        serviceEndpoint: [
          'https://good.example/dwn',
          'ftp://wrong.example/dwn',
          'https://user:pass@credential.example/dwn',
          { nodes: ['https://object.example/dwn'] },
        ],
      },
      {
        id: '',
        type: 'DecentralizedWebNode',
        serviceEndpoint: 'https://missing-id.example/dwn',
      },
      {
        id: '#not-dwn',
        type: 'SomethingElse',
        serviceEndpoint: 'https://irrelevant.example',
      },
    ],
  });

  assert.equal(report.candidates.length, 1);
  assert.equal(report.candidates[0].endpoint, 'https://good.example/dwn');
  assert.equal(report.ignored.length, 4);
  assert.deepEqual(
    report.ignored.map((entry) => entry.reason).sort(),
    [
      'ENDPOINT_CREDENTIALS_FORBIDDEN',
      'INVALID_SERVICE_ID',
      'UNSUPPORTED_ENDPOINT_PROTOCOL',
      'UNSUPPORTED_ENDPOINT_SHAPE',
    ].sort(),
  );
});

test('selection is explicit and still grants no authorization, delivery, or semantic effect', async () => {
  const did = await makeDhtDid(['https://node.example/dwn']);
  const report = discoverDwnRoadCandidatesFromDidDocument(did.document);
  const candidate = report.candidates[0];

  const selection = selectDwnRoadCandidate(
    report,
    candidate.candidate_id,
    '2026-10-01T23:21:00.000Z',
  );

  assert.equal(selection.candidate_id, candidate.candidate_id);
  assert.equal(selection.endpoint, candidate.endpoint);
  assert.equal(selection.authorized, false);
  assert.equal(selection.delivered, false);
  assert.equal(selection.semantic_effect, 'none');
  assert.ok(selection.laws.includes('SELECTED != AUTHORIZED'));
  assert.ok(selection.laws.includes('DELIVERED != ADMITTED'));

  assert.throws(
    () => selectDwnRoadCandidate(report, 'relatte-dwn-road-candidate-v0:missing', '2026-10-01T23:21:00.000Z'),
    /UNKNOWN_DWN_ROAD_CANDIDATE/,
  );
});

test('did:dht identity binding and DWN discovery compose without collapsing identity into location', async () => {
  const did = await makeDhtDid([
    'https://node-a.example/dwn',
    'https://node-b.example/dwn',
  ]);
  const signer = await did.getSigner();
  const method = did.document.verificationMethod?.find((entry) => entry.id === signer.keyId);
  assert.ok(method?.publicKeyJwk);

  const keys = await generateP256KeyPair();
  const crossing = await makeCrossing(keys);

  const binding = await createDidBinding({
    crossing,
    particular_id: crossing.source_particular,
    relatte_keys: keys,
    did_uri: did.uri,
    did_verification_method_id: signer.keyId,
    did_public_key_jwk: method!.publicKeyJwk!,
    did_signer: signer,
    created_at: '2026-10-01T23:22:00.000Z',
  });

  const discovery = discoverDwnRoadCandidatesFromDidDocument(did.document);

  assert.equal(await verifyDidBindingForCrossing(binding, crossing), true);
  assert.equal(verifyDidBindingAgainstDidDocument(binding, did.document), true);
  assert.equal(discovery.did_uri, binding.did_uri);
  assert.equal(discovery.candidates.length, 2);

  for (const candidate of discovery.candidates) {
    assert.notEqual(candidate.candidate_id, binding.binding_id);
    assert.equal(candidate.semantic_effect, 'none');
    assert.equal(candidate.executable, false);
  }
});
