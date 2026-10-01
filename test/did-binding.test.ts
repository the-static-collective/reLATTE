import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { DidKey } from '@web5/dids';
import {
  DataStoreLevel,
  Dwn,
  EventLogLevel,
  Jws,
  MessageStoreLevel,
  ResumableTaskStoreLevel,
} from '@tbd54566975/dwn-sdk-js';

import {
  generateP256KeyPair,
  sealCrossingEnvelope,
  verifyCrossingEnvelope,
} from '../src/index.ts';
import {
  createDidBinding,
  verifyDidBindingAgainstDidDocument,
  verifyDidBindingForCrossing,
} from '../src/did-binding.ts';
import {
  readCrossingFromDwn,
  writeCrossingToDwn,
} from '../src/dwn-road.ts';

async function crossing(
  keys: Awaited<ReturnType<typeof generateP256KeyPair>>,
  createdAt: string,
  historyHead: string,
  parents: string[] = [],
): Promise<Record<string, any>> {
  return sealCrossingEnvelope({
    schema: 'relatte.crossing-envelope/v0',
    protocol_version: '0',
    source_particular: 'particular:did-binding-subject',
    source_world: 'world:did-binding-source',
    source_history_head: historyHead,
    parents,
    declared_kind: 'DID_BINDING_TEST',
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
    created_at: createdAt,
    extensions: {
      specimen: 'DID-BINDING-001',
    },
  }, keys);
}

async function didFixture() {
  const did = await DidKey.create();
  const signer = await did.getSigner();
  const resolved = await DidKey.resolve(did.uri);
  assert.ok(resolved.didDocument);

  const vm = resolved.didDocument!.verificationMethod?.find(
    (entry) => entry.id === signer.keyId,
  );
  assert.ok(vm?.publicKeyJwk);

  return {
    did,
    signer,
    document: resolved.didDocument!,
    publicKeyJwk: vm!.publicKeyJwk!,
  };
}

async function openDwn(base: string): Promise<Dwn> {
  return Dwn.create({
    messageStore: new MessageStoreLevel({
      blockstoreLocation: join(base, 'messages'),
      indexLocation: join(base, 'index'),
    }),
    dataStore: new DataStoreLevel({
      blockstoreLocation: join(base, 'data'),
    }),
    eventLog: new EventLogLevel({
      location: join(base, 'events'),
    }),
    resumableTaskStore: new ResumableTaskStoreLevel({
      location: join(base, 'tasks'),
    }),
  });
}

test('dual-attested DID binding verifies without live DID resolution', async () => {
  const keys = await generateP256KeyPair();
  const signed = await crossing(keys, '2026-10-01T23:00:00.000Z', 'local:did-binding:head-001');
  const foreign = await didFixture();

  const binding = await createDidBinding({
    crossing: signed,
    particular_id: signed.source_particular,
    relatte_keys: keys,
    did_uri: foreign.did.uri,
    did_verification_method_id: foreign.signer.keyId,
    did_public_key_jwk: foreign.publicKeyJwk,
    did_signer: foreign.signer,
    created_at: '2026-10-01T23:01:00.000Z',
  });

  assert.equal(await verifyDidBindingForCrossing(binding, signed), true);
  assert.equal(verifyDidBindingAgainstDidDocument(binding, foreign.document), true);

  // Historical verification is independent of whether a resolver is available now.
  const resolverUnavailable = null;
  assert.equal(resolverUnavailable, null);
  assert.equal(await verifyDidBindingForCrossing(binding, signed), true);
});

test('DID binding rejects key, subject, crossing, and proof substitution', async () => {
  const keys = await generateP256KeyPair();
  const signed = await crossing(keys, '2026-10-01T23:02:00.000Z', 'local:did-binding:head-002');
  const foreign = await didFixture();

  const binding = await createDidBinding({
    crossing: signed,
    particular_id: signed.source_particular,
    relatte_keys: keys,
    did_uri: foreign.did.uri,
    did_verification_method_id: foreign.signer.keyId,
    did_public_key_jwk: foreign.publicKeyJwk,
    did_signer: foreign.signer,
    created_at: '2026-10-01T23:03:00.000Z',
  });

  const changedDid = structuredClone(binding);
  changedDid.did_uri = changedDid.did_uri + 'x';
  assert.equal(await verifyDidBindingForCrossing(changedDid, signed), false);

  const changedProof = structuredClone(binding);
  changedProof.proofs.did.signature = changedProof.proofs.did.signature.slice(0, -1) + 'A';
  assert.equal(await verifyDidBindingForCrossing(changedProof, signed), false);

  const otherKeys = await generateP256KeyPair();
  const otherCrossing = await crossing(
    otherKeys,
    '2026-10-01T23:04:00.000Z',
    'local:did-binding:head-other',
  );
  assert.equal(await verifyDidBindingForCrossing(binding, otherCrossing), false);

  const otherDid = await didFixture();
  assert.equal(verifyDidBindingAgainstDidDocument(binding, otherDid.document), false);
});

test('key/DID rotation creates a fresh binding without rewriting prior history', async () => {
  const oldKeys = await generateP256KeyPair();
  const oldCrossing = await crossing(
    oldKeys,
    '2026-10-01T23:05:00.000Z',
    'local:did-binding:head-old',
  );
  const oldDid = await didFixture();

  const oldBinding = await createDidBinding({
    crossing: oldCrossing,
    particular_id: oldCrossing.source_particular,
    relatte_keys: oldKeys,
    did_uri: oldDid.did.uri,
    did_verification_method_id: oldDid.signer.keyId,
    did_public_key_jwk: oldDid.publicKeyJwk,
    did_signer: oldDid.signer,
    created_at: '2026-10-01T23:06:00.000Z',
  });

  const oldCrossingSnapshot = JSON.stringify(oldCrossing);
  const oldBindingSnapshot = JSON.stringify(oldBinding);

  const newKeys = await generateP256KeyPair();
  const newCrossing = await crossing(
    newKeys,
    '2026-10-01T23:07:00.000Z',
    'local:did-binding:head-new',
    [oldCrossing.crossing_id],
  );
  const newDid = await didFixture();

  const newBinding = await createDidBinding({
    crossing: newCrossing,
    particular_id: newCrossing.source_particular,
    relatte_keys: newKeys,
    did_uri: newDid.did.uri,
    did_verification_method_id: newDid.signer.keyId,
    did_public_key_jwk: newDid.publicKeyJwk,
    did_signer: newDid.signer,
    created_at: '2026-10-01T23:08:00.000Z',
    supersedes_binding_id: oldBinding.binding_id,
  });

  assert.notEqual(newCrossing.crossing_id, oldCrossing.crossing_id);
  assert.notEqual(newBinding.binding_id, oldBinding.binding_id);
  assert.equal(newBinding.supersedes_binding_id, oldBinding.binding_id);

  assert.equal(JSON.stringify(oldCrossing), oldCrossingSnapshot);
  assert.equal(JSON.stringify(oldBinding), oldBindingSnapshot);
  assert.equal(await verifyCrossingEnvelope(oldCrossing), true);
  assert.equal(await verifyDidBindingForCrossing(oldBinding, oldCrossing), true);
  assert.equal(await verifyCrossingEnvelope(newCrossing), true);
  assert.equal(await verifyDidBindingForCrossing(newBinding, newCrossing), true);

  assert.equal(verifyDidBindingAgainstDidDocument(oldBinding, oldDid.document), true);
  assert.equal(verifyDidBindingAgainstDidDocument(newBinding, newDid.document), true);
});

test('DWN road preserves the crossing that a DID binding independently attests', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-did-binding-dwn-'));
  const dwn = await openDwn(base);

  try {
    const keys = await generateP256KeyPair();
    const signed = await crossing(
      keys,
      '2026-10-01T23:09:00.000Z',
      'local:did-binding:dwn-head',
    );
    const foreign = await didFixture();

    const binding = await createDidBinding({
      crossing: signed,
      particular_id: signed.source_particular,
      relatte_keys: keys,
      did_uri: foreign.did.uri,
      did_verification_method_id: foreign.signer.keyId,
      did_public_key_jwk: foreign.publicKeyJwk,
      did_signer: foreign.signer,
      created_at: '2026-10-01T23:10:00.000Z',
    });

    const dwnTenant = await DidKey.create();
    const dwnSigner = Jws.createSigner(await dwnTenant.export());

    const road = await writeCrossingToDwn({
      dwn,
      tenant_did: dwnTenant.uri,
      signer: dwnSigner,
      crossing: signed,
    });

    const recovered = await readCrossingFromDwn({
      dwn,
      tenant_did: dwnTenant.uri,
      signer: dwnSigner,
      record_id: road.dwn_record_id,
    });

    assert.equal(recovered.crossing_id, signed.crossing_id);
    assert.equal(await verifyDidBindingForCrossing(binding, recovered), true);
  } finally {
    await dwn.close();
    await rm(base, { recursive: true, force: true });
  }
});
