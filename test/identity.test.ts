import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canonicalizeDomainValue,
  computeCrossingId,
  computeReceiptId,
  constructCrossingIdentityBody,
  crossingSignatureBytes,
} from '../src/index.ts';

const PUBLIC_JWK = {
  kty: 'EC',
  crv: 'P-256',
  x: 'f83OJ3D2xF4nwDfcx7B3oG6Zq8rZQqjz3fV0A0V7Q1w',
  y: 'x_FEzRu9W2n6KkZ6J6xQJpP8iYyW8M2CWxkT6VfL2sA',
};

function crossing(overrides: Record<string, unknown> = {}) {
  return {
    schema: 'relatte.crossing-envelope/v0',
    crossing_id: 'placeholder',
    protocol_version: '0',
    source_particular: 'particular:genesis-a',
    source_world: 'world:alpha',
    source_history_head: null,
    parents: [],
    declared_kind: 'GENESIS_ECHO',
    payload_refs: [
      { address: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', role: 'payload', media_type: 'application/json' },
    ],
    requested_effect: null,
    capability_ref: null,
    privacy_policy: null,
    audience_policy: null,
    return_address: null,
    created_at: '2026-09-29T17:00:00.000Z',
    signing: {
      algorithm: 'ECDSA-P256-SHA256',
      public_key: PUBLIC_JWK,
      signature: 'placeholder-signature',
      domain: 'relatte.crossing-signature/v0',
    },
    extensions: {},
    ...overrides,
  };
}

function receipt(overrides: Record<string, unknown> = {}) {
  return {
    schema: 'relatte.receipt/v0',
    receipt_id: 'placeholder',
    crossing_id: computeCrossingId(crossing()),
    world_id: 'world:beta',
    receiver_particular: 'particular:genesis-b',
    kind: 'VERIFIED',
    semantic_effect: 'none',
    contract_ref: null,
    pre_state_ref: null,
    post_state_ref: null,
    descendant_refs: [],
    residual_refs: [],
    note: null,
    created_at: '2026-09-29T17:01:00.000Z',
    signing: {
      algorithm: 'ECDSA-P256-SHA256',
      public_key: PUBLIC_JWK,
      signature: 'placeholder-signature',
      domain: 'relatte.receipt-signature/v0',
    },
    extensions: {},
    ...overrides,
  };
}

test('crossing identity is invariant to object key insertion order', () => {
  const a = crossing();
  const b = {
    extensions: {},
    signing: {
      domain: 'relatte.crossing-signature/v0',
      signature: 'different-signature-is-not-identity',
      public_key: { y: PUBLIC_JWK.y, x: PUBLIC_JWK.x, crv: 'P-256', kty: 'EC' },
      algorithm: 'ECDSA-P256-SHA256',
    },
    created_at: '2026-09-29T17:00:00.000Z',
    return_address: null,
    audience_policy: null,
    privacy_policy: null,
    capability_ref: null,
    requested_effect: null,
    payload_refs: [{ role: 'payload', media_type: 'application/json', address: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }],
    declared_kind: 'GENESIS_ECHO',
    parents: [],
    source_history_head: null,
    source_world: 'world:alpha',
    source_particular: 'particular:genesis-a',
    protocol_version: '0',
    crossing_id: 'another-placeholder',
    schema: 'relatte.crossing-envelope/v0',
  };

  assert.equal(computeCrossingId(a), computeCrossingId(b));
  assert.match(computeCrossingId(a), /^relatte-crossing-v0:[0-9a-f]{64}$/);
});

test('omitted optional crossing fields normalize to the same identity as explicit defaults', () => {
  const explicit = crossing();
  const omitted = crossing();
  for (const key of ['source_history_head','parents','requested_effect','capability_ref','privacy_policy','audience_policy','return_address','extensions']) {
    delete (omitted as Record<string, unknown>)[key];
  }
  assert.equal(computeCrossingId(explicit), computeCrossingId(omitted));
});

test('crossing id and signature bytes are explicitly excluded from identity construction', () => {
  const a = crossing({ crossing_id: 'one' });
  const b = crossing({ crossing_id: 'two', signing: { ...crossing().signing, signature: 'other' } });
  assert.deepEqual(constructCrossingIdentityBody(a), constructCrossingIdentityBody(b));
  assert.equal(computeCrossingId(a), computeCrossingId(b));
});

test('signature preimage binds the derived crossing id', () => {
  const a = crossing();
  const bytes = crossingSignatureBytes(a);
  assert.ok(bytes.toString('utf8').startsWith('reLATTE-CrossingSignature-v0|'));
  assert.ok(bytes.toString('utf8').includes(computeCrossingId(a)));
});

test('changing source world changes crossing identity', () => {
  assert.notEqual(
    computeCrossingId(crossing()),
    computeCrossingId(crossing({ source_world: 'world:other' })),
  );
});

test('receipt identity ignores receipt_id/signature but binds crossing and receiver world', () => {
  const base = receipt();
  const same = receipt({ receipt_id: 'different', signing: { ...receipt().signing, signature: 'different' } });
  assert.equal(computeReceiptId(base), computeReceiptId(same));
  assert.notEqual(computeReceiptId(base), computeReceiptId(receipt({ world_id: 'world:other' })));
  assert.notEqual(computeReceiptId(base), computeReceiptId(receipt({ crossing_id: 'relatte-crossing-v0:' + 'b'.repeat(64) })));
  assert.match(computeReceiptId(base), /^relatte-receipt-v0:[0-9a-f]{64}$/);
});

test('canonicalization rejects hostile runtime values from the Project0 profile', () => {
  const cases: Array<[unknown, RegExp]> = [
    [{ nested: undefined }, /UNDEFINED_VALUE/],
    [{ value: Number.NaN }, /NON_FINITE_NUMBER/],
    [{ value: Infinity }, /NON_FINITE_NUMBER/],
    [{ values: [1, , 3] }, /SPARSE_ARRAY/],
    [{ value: BigInt(1) }, /UNSUPPORTED_TYPE/],
  ];
  for (const [value, error] of cases) {
    assert.throws(() => canonicalizeDomainValue('test|', value), error);
  }
});

test('public signing metadata rejects private JWK material', () => {
  const privateKeyEnvelope = crossing({
    signing: {
      ...crossing().signing,
      public_key: { ...PUBLIC_JWK, d: 'must-not-cross' },
    },
  });
  assert.throws(() => computeCrossingId(privateKeyEnvelope), /PRIVATE_KEY_MATERIAL/);
});
