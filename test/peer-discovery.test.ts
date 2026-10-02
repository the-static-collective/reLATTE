import assert from 'node:assert/strict';
import test from 'node:test';

import {
  discoverRelatteRuntimePeersFromDidDocument,
  fetchRelattePeerDescriptor,
} from '../src/peer-discovery.ts';
import {
  generateP256KeyPair,
} from '../src/index.ts';

test('DID peer discovery yields a location candidate, not trust or authority', async () => {
  const report = discoverRelatteRuntimePeersFromDidDocument({
    id: 'did:dht:peer-unit',
    service: [{
      id: 'relatte',
      type: 'RelatteRuntime',
      serviceEndpoint: [
        'http://127.0.0.1:4102/relatte/peer/v0',
      ],
    }],
  });

  assert.equal(report.candidates.length, 1);
  const candidate = report.candidates[0];
  assert.equal(candidate.executable, false);
  assert.equal(candidate.semantic_effect, 'none');

  const issuer = await generateP256KeyPair();
  const encryption = await generateP256KeyPair();

  const descriptor = await fetchRelattePeerDescriptor({
    candidate,
    fetch_impl: async () => new Response(JSON.stringify({
      schema: 'relatte.peer-descriptor/v0',
      world_id: 'world:b',
      descriptor_endpoint: candidate.descriptor_endpoint,
      crossing_endpoint: 'http://127.0.0.1:4102/relatte/crossings/v0',
      capability_issuer_ref: 'world:b#capability-kernel',
      capability_issuer_public_key: issuer.publicKeyJwk,
      encryption_key_id: 'relatte-encryption-key-v0:test',
      encryption_public_key: encryption.publicKeyJwk,
      semantic_effect: 'none',
      laws: ['DISCOVERY != TRUST'],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  });

  assert.equal(descriptor.world_id, 'world:b');
  assert.equal(descriptor.semantic_effect, 'none');
  assert.equal(
    descriptor.crossing_endpoint,
    'http://127.0.0.1:4102/relatte/crossings/v0',
  );
});
