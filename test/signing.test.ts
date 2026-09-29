import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  generateP256KeyPair,
  sealCrossingEnvelope,
  sealReceipt,
  verifyCrossingEnvelope,
  verifyReceipt,
} from '../src/index.ts';

function crossingDraft(overrides: Record<string, unknown> = {}) {
  return {
    schema: 'relatte.crossing-envelope/v0',
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
    extensions: {},
    ...overrides,
  };
}

function receiptDraft(crossingId: string, overrides: Record<string, unknown> = {}) {
  return {
    schema: 'relatte.receipt/v0',
    crossing_id: crossingId,
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
    extensions: {},
    ...overrides,
  };
}

test('seals and verifies a crossing with ECDSA P-256', async () => {
  const keys = await generateP256KeyPair();
  const envelope = await sealCrossingEnvelope(crossingDraft(), keys);
  assert.match(envelope.crossing_id, /^relatte-crossing-v0:[0-9a-f]{64}$/);
  assert.equal(envelope.signing.algorithm, 'ECDSA-P256-SHA256');
  assert.equal(envelope.signing.domain, 'relatte.crossing-signature/v0');
  assert.ok(envelope.signing.signature.length > 20);
  assert.equal(await verifyCrossingEnvelope(envelope), true);
});

test('semantic mutation after signing fails verification', async () => {
  const keys = await generateP256KeyPair();
  const envelope = await sealCrossingEnvelope(crossingDraft(), keys);
  const mutated = { ...envelope, source_world: 'world:other' };
  assert.equal(await verifyCrossingEnvelope(mutated), false);
});

test('wrong public key fails verification', async () => {
  const keys = await generateP256KeyPair();
  const other = await generateP256KeyPair();
  const envelope = await sealCrossingEnvelope(crossingDraft(), keys);
  const mutated = {
    ...envelope,
    signing: { ...envelope.signing, public_key: other.publicKeyJwk },
  };
  assert.equal(await verifyCrossingEnvelope(mutated), false);
});

test('wrong signing domain fails verification', async () => {
  const keys = await generateP256KeyPair();
  const envelope = await sealCrossingEnvelope(crossingDraft(), keys);
  const mutated = {
    ...envelope,
    signing: { ...envelope.signing, domain: 'relatte.receipt-signature/v0' },
  };
  assert.equal(await verifyCrossingEnvelope(mutated), false);
});

test('seals and verifies a receipt independently from the source crossing key', async () => {
  const sourceKeys = await generateP256KeyPair();
  const receiverKeys = await generateP256KeyPair();
  const envelope = await sealCrossingEnvelope(crossingDraft(), sourceKeys);
  const receipt = await sealReceipt(receiptDraft(envelope.crossing_id), receiverKeys);
  assert.match(receipt.receipt_id, /^relatte-receipt-v0:[0-9a-f]{64}$/);
  assert.equal(await verifyReceipt(receipt), true);
  assert.notDeepEqual(receipt.signing.public_key, envelope.signing.public_key);
});

test('serialized crossing verifies in a fresh Node process', async () => {
  const keys = await generateP256KeyPair();
  const envelope = await sealCrossingEnvelope(crossingDraft(), keys);
  const script = [
    "import { verifyCrossingEnvelope } from './src/index.ts';",
    "const chunks=[]; for await (const chunk of process.stdin) chunks.push(chunk);",
    "const envelope=JSON.parse(Buffer.concat(chunks).toString('utf8'));",
    "process.stdout.write(String(await verifyCrossingEnvelope(envelope)));",
  ].join(' ');
  const child = spawnSync(
    process.execPath,
    ['--experimental-strip-types', '--input-type=module', '--eval', script],
    { cwd: process.cwd(), input: JSON.stringify(envelope), encoding: 'utf8' },
  );
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout, 'true');
});

test('stored genesis signed fixtures verify without private key material', async () => {
  const crossing = JSON.parse(readFileSync('fixtures/genesis-signed-crossing.json', 'utf8'));
  const receipt = JSON.parse(readFileSync('fixtures/genesis-signed-receipt.json', 'utf8'));
  assert.equal(Object.prototype.hasOwnProperty.call(crossing.signing.public_key, 'd'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(receipt.signing.public_key, 'd'), false);
  assert.equal(await verifyCrossingEnvelope(crossing), true);
  assert.equal(await verifyReceipt(receipt), true);
  assert.equal(receipt.crossing_id, crossing.crossing_id);
});


test('tampering only with the stored crossing id fails verification', async () => {
  const keys = await generateP256KeyPair();
  const envelope = await sealCrossingEnvelope(crossingDraft(), keys);
  const tampered = {
    ...envelope,
    crossing_id: 'relatte-crossing-v0:' + '0'.repeat(64),
  };
  assert.equal(await verifyCrossingEnvelope(tampered), false);
});

test('tampering only with the stored receipt id fails verification', async () => {
  const sourceKeys = await generateP256KeyPair();
  const receiverKeys = await generateP256KeyPair();
  const envelope = await sealCrossingEnvelope(crossingDraft(), sourceKeys);
  const receipt = await sealReceipt(receiptDraft(envelope.crossing_id), receiverKeys);
  const tampered = {
    ...receipt,
    receipt_id: 'relatte-receipt-v0:' + '0'.repeat(64),
  };
  assert.equal(await verifyReceipt(tampered), false);
});


test('extra root fields cannot ride unsigned across crossing or receipt verification', async () => {
  const sourceKeys = await generateP256KeyPair();
  const receiverKeys = await generateP256KeyPair();
  const envelope = await sealCrossingEnvelope(crossingDraft(), sourceKeys);
  const receipt = await sealReceipt(receiptDraft(envelope.crossing_id), receiverKeys);

  assert.equal(await verifyCrossingEnvelope({ ...envelope, injected: 'unsigned-root-data' }), false);
  assert.equal(await verifyReceipt({ ...receipt, injected: 'unsigned-root-data' }), false);
});

test('extra signing fields cannot ride unsigned across crossing or receipt verification', async () => {
  const sourceKeys = await generateP256KeyPair();
  const receiverKeys = await generateP256KeyPair();
  const envelope = await sealCrossingEnvelope(crossingDraft(), sourceKeys);
  const receipt = await sealReceipt(receiptDraft(envelope.crossing_id), receiverKeys);

  assert.equal(
    await verifyCrossingEnvelope({
      ...envelope,
      signing: { ...envelope.signing, injected: 'unsigned-signing-data' },
    }),
    false,
  );
  assert.equal(
    await verifyReceipt({
      ...receipt,
      signing: { ...receipt.signing, injected: 'unsigned-signing-data' },
    }),
    false,
  );
});

test('signature text must use canonical unpadded base64url', async () => {
  const sourceKeys = await generateP256KeyPair();
  const receiverKeys = await generateP256KeyPair();
  const envelope = await sealCrossingEnvelope(crossingDraft(), sourceKeys);
  const receipt = await sealReceipt(receiptDraft(envelope.crossing_id), receiverKeys);

  assert.equal(
    await verifyCrossingEnvelope({
      ...envelope,
      signing: { ...envelope.signing, signature: envelope.signing.signature + '=' },
    }),
    false,
  );
  assert.equal(
    await verifyReceipt({
      ...receipt,
      signing: { ...receipt.signing, signature: receipt.signing.signature + '=' },
    }),
    false,
  );
});


test('serialized receipt verifies in a fresh Node process', async () => {
  const sourceKeys = await generateP256KeyPair();
  const receiverKeys = await generateP256KeyPair();
  const envelope = await sealCrossingEnvelope(crossingDraft(), sourceKeys);
  const receipt = await sealReceipt(receiptDraft(envelope.crossing_id), receiverKeys);
  const script = [
    "import { verifyReceipt } from './src/index.ts';",
    "const chunks=[]; for await (const chunk of process.stdin) chunks.push(chunk);",
    "const receipt=JSON.parse(Buffer.concat(chunks).toString('utf8'));",
    "process.stdout.write(String(await verifyReceipt(receipt)));",
  ].join(' ');
  const child = spawnSync(
    process.execPath,
    ['--experimental-strip-types', '--input-type=module', '--eval', script],
    { cwd: process.cwd(), input: JSON.stringify(receipt), encoding: 'utf8' },
  );
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout, 'true');
});
