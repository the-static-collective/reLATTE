import assert from 'node:assert/strict';
import test from 'node:test';

import {
  Jws,
  TestDataGenerator,
} from '@tbd54566975/dwn-sdk-js';

import {
  generateP256KeyPair,
  sealCrossingEnvelope,
} from '../src/index.ts';
import {
  readCrossingFromRemoteDwn,
  writeCrossingToRemoteDwn,
} from '../src/remote-dwn-road.ts';

async function makeCrossing() {
  const keys = await generateP256KeyPair();
  return sealCrossingEnvelope({
    schema: 'relatte.crossing-envelope/v0',
    protocol_version: '0',
    source_particular: 'particular:remote-dwn-unit',
    source_world: 'world:remote-dwn-unit',
    source_history_head: 'local:remote-dwn-unit:head',
    parents: [],
    declared_kind: 'REMOTE_DWN_UNIT',
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
    created_at: '2026-10-01T23:55:00.000Z',
    extensions: {},
  }, keys);
}

test('remote DWN road rejects credential-bearing endpoints before transport', async () => {
  const persona = await TestDataGenerator.generateDidKeyPersona();
  const signer = Jws.createSigner(persona);
  const crossing = await makeCrossing();

  await assert.rejects(
    () => writeCrossingToRemoteDwn({
      endpoint: 'https://user:pass@example.com/',
      tenant_did: persona.did,
      signer,
      crossing,
    }),
    /REMOTE_DWN_ENDPOINT_CREDENTIALS_FORBIDDEN/,
  );
});

test('remote DWN write keeps HTTP acceptance distinct from DWN acceptance', async () => {
  const persona = await TestDataGenerator.generateDidKeyPersona();
  const signer = Jws.createSigner(persona);
  const crossing = await makeCrossing();

  await assert.rejects(
    () => writeCrossingToRemoteDwn({
      endpoint: 'https://node.example/',
      tenant_did: persona.did,
      signer,
      crossing,
      fetch_impl: async () => new Response(JSON.stringify({
        jsonrpc: '2.0',
        id: 'x',
        result: {
          reply: {
            status: { code: 401, detail: 'Unauthorized' },
          },
        },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    }),
    /REMOTE_DWN_WRITE_REJECTED:401/,
  );
});

test('remote DWN read requires the DWN response header', async () => {
  const persona = await TestDataGenerator.generateDidKeyPersona();
  const signer = Jws.createSigner(persona);

  await assert.rejects(
    () => readCrossingFromRemoteDwn({
      endpoint: 'https://node.example/',
      tenant_did: persona.did,
      signer,
      record_id: 'record:missing-header',
      fetch_impl: async () => new Response('{}', { status: 200 }),
    }),
    /REMOTE_DWN_READ_RESPONSE_HEADER_MISSING/,
  );
});
