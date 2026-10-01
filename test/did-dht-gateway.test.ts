import assert from 'node:assert/strict';
import test from 'node:test';

import { DidDht } from '@web5/dids';

import { publishAndResolveDidDhtGateway } from '../src/did-dht-gateway.ts';

test('live gateway helper rejects non-dht subjects before network activity', async () => {
  await assert.rejects(
    () => publishAndResolveDidDhtGateway({
      did: { uri: 'did:key:zFake', document: { id: 'did:key:zFake' } },
      gateway_uri: 'http://127.0.0.1:8305/',
    }),
    /DID_METHOD_MISMATCH/,
  );
});

test('live gateway helper rejects credential-bearing gateway URLs', async () => {
  const did = await DidDht.create({ options: { publish: false } });

  await assert.rejects(
    () => publishAndResolveDidDhtGateway({
      did,
      gateway_uri: 'https://user:pass@example.com/',
    }),
    /DID_DHT_GATEWAY_CREDENTIALS_FORBIDDEN/,
  );
});
