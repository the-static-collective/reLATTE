import assert from 'node:assert/strict';
import test from 'node:test';

import {
  Jws,
  TestDataGenerator,
} from '@tbd54566975/dwn-sdk-js';

import { replicateCrossingBetweenRemoteDwns } from '../src/mortal-road.ts';

test('mortal road requires two distinct transport nodes', async () => {
  const persona = await TestDataGenerator.generateDidKeyPersona();
  const signer = Jws.createSigner(persona);

  await assert.rejects(
    () => replicateCrossingBetweenRemoteDwns({
      source_endpoint: 'https://node.example/dwn',
      source_record_id: 'record:a',
      destination_endpoint: 'https://node.example/dwn',
      tenant_did: persona.did,
      signer,
    }),
    /MORTAL_ROAD_REQUIRES_DISTINCT_NODES/,
  );
});

test('mortal road rejects credential-bearing node URLs before transport', async () => {
  const persona = await TestDataGenerator.generateDidKeyPersona();
  const signer = Jws.createSigner(persona);

  await assert.rejects(
    () => replicateCrossingBetweenRemoteDwns({
      source_endpoint: 'https://user:pass@node-a.example/',
      source_record_id: 'record:a',
      destination_endpoint: 'https://node-b.example/',
      tenant_did: persona.did,
      signer,
    }),
    /MORTAL_ROAD_ENDPOINT_CREDENTIALS_FORBIDDEN/,
  );
});
