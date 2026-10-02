import assert from 'node:assert/strict';
import test from 'node:test';

import {
  Jws,
  TestDataGenerator,
} from '@tbd54566975/dwn-sdk-js';

import {
  discoverDwnRoadCandidatesFromDidDocument,
} from '../src/did-dht-discovery.ts';
import {
  readCrossingWithAutomaticFailover,
} from '../src/automatic-failover.ts';
import {
  generateP256KeyPair,
  sealCrossingEnvelope,
} from '../src/index.ts';

async function makeCrossing(sourceParticular = 'particular:automatic-failover-unit') {
  const keys = await generateP256KeyPair();
  return sealCrossingEnvelope({
    schema: 'relatte.crossing-envelope/v0',
    protocol_version: '0',
    source_particular: sourceParticular,
    source_world: 'world:automatic-failover-unit',
    source_history_head: 'local:automatic-failover-unit:head',
    parents: [],
    declared_kind: 'AUTOMATIC_FAILOVER_UNIT',
    payload_refs: [{
      address: 'sha256:' + 'b'.repeat(64),
      role: 'payload',
      media_type: 'application/json',
    }],
    requested_effect: null,
    capability_ref: null,
    privacy_policy: null,
    audience_policy: null,
    return_address: null,
    created_at: '2026-10-02T00:40:00.000Z',
    extensions: {},
  }, keys);
}

function discovery() {
  return discoverDwnRoadCandidatesFromDidDocument({
    id: 'did:dht:automatic-failover-unit',
    service: [{
      id: 'dwn',
      type: 'DecentralizedWebNode',
      serviceEndpoint: [
        'https://node-a.example/',
        'https://node-b.example/',
      ],
    }],
  });
}

test('ordered policy preserves failed A attempt before recovering from B', async () => {
  const persona = await TestDataGenerator.generateDidKeyPersona();
  const signer = Jws.createSigner(persona);
  const crossing = await makeCrossing();
  const report = discovery();
  const [a, b] = report.candidates.sort((x, y) => x.endpoint.localeCompare(y.endpoint));
  const calls: string[] = [];

  const result = await readCrossingWithAutomaticFailover({
    discovery: report,
    routes: [
      { candidate_id: a.candidate_id, record_id: 'record:a', selected_at: '2026-10-02T00:41:00.000Z' },
      { candidate_id: b.candidate_id, record_id: 'record:b', selected_at: '2026-10-02T00:41:01.000Z' },
    ],
    tenant_did: persona.did,
    signer,
    expected_crossing_id: crossing.crossing_id,
    read_impl: async (args) => {
      calls.push(args.endpoint);
      if (args.endpoint === a.endpoint) throw new TypeError('fetch failed');
      return {
        schema: 'relatte.remote-dwn-read/v0',
        crossing,
        crossing_id: crossing.crossing_id,
        dwn_record_id: 'record:b',
        tenant_did: persona.did,
        endpoint: b.endpoint,
        dwn_status: 200,
        semantic_effect: 'none',
        laws: [],
      };
    },
  });

  assert.deepEqual(calls, [a.endpoint, b.endpoint]);
  assert.equal(result.attempts.length, 2);
  assert.equal(result.attempts[0].outcome, 'failed');
  assert.equal(result.attempts[0].failure_code, 'TRANSPORT_UNREACHABLE');
  assert.equal(result.attempts[1].outcome, 'recovered');
  assert.equal(result.recovered_candidate_id, b.candidate_id);
  assert.equal(result.crossing_id, crossing.crossing_id);
  assert.equal(result.semantic_effect, 'none');
});

test('ordered policy stops after first successful road', async () => {
  const persona = await TestDataGenerator.generateDidKeyPersona();
  const signer = Jws.createSigner(persona);
  const crossing = await makeCrossing();
  const report = discovery();
  const [a, b] = report.candidates.sort((x, y) => x.endpoint.localeCompare(y.endpoint));
  let calls = 0;

  const result = await readCrossingWithAutomaticFailover({
    discovery: report,
    routes: [
      { candidate_id: a.candidate_id, record_id: 'record:a', selected_at: '2026-10-02T00:42:00.000Z' },
      { candidate_id: b.candidate_id, record_id: 'record:b', selected_at: '2026-10-02T00:42:01.000Z' },
    ],
    tenant_did: persona.did,
    signer,
    expected_crossing_id: crossing.crossing_id,
    read_impl: async (args) => {
      calls += 1;
      return {
        schema: 'relatte.remote-dwn-read/v0',
        crossing,
        crossing_id: crossing.crossing_id,
        dwn_record_id: args.record_id,
        tenant_did: persona.did,
        endpoint: args.endpoint,
        dwn_status: 200,
        semantic_effect: 'none',
        laws: [],
      };
    },
  });

  assert.equal(calls, 1);
  assert.equal(result.attempts.length, 1);
  assert.equal(result.recovered_candidate_id, a.candidate_id);
});

test('unexpected crossing identity aborts failover instead of routing around integrity drift', async () => {
  const persona = await TestDataGenerator.generateDidKeyPersona();
  const signer = Jws.createSigner(persona);
  const crossing = await makeCrossing();
  const other = await makeCrossing('particular:automatic-failover-other');
  const report = discovery();
  const [a, b] = report.candidates.sort((x, y) => x.endpoint.localeCompare(y.endpoint));
  let calls = 0;

  await assert.rejects(
    () => readCrossingWithAutomaticFailover({
      discovery: report,
      routes: [
        { candidate_id: a.candidate_id, record_id: 'record:a', selected_at: '2026-10-02T00:43:00.000Z' },
        { candidate_id: b.candidate_id, record_id: 'record:b', selected_at: '2026-10-02T00:43:01.000Z' },
      ],
      tenant_did: persona.did,
      signer,
      expected_crossing_id: crossing.crossing_id,
      read_impl: async (args) => {
        calls += 1;
        return {
          schema: 'relatte.remote-dwn-read/v0',
          crossing: other,
          crossing_id: other.crossing_id,
          dwn_record_id: args.record_id,
          tenant_did: persona.did,
          endpoint: args.endpoint,
          dwn_status: 200,
          semantic_effect: 'none',
          laws: [],
        };
      },
    }),
    /FAILOVER_INTEGRITY_FAILURE/,
  );

  assert.equal(calls, 1);
});
