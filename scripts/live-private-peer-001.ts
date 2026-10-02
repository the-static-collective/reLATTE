import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DidDht } from '@web5/dids';

import {
  canonicalize,
  sha256Hex,
} from '../src/canonical.ts';
import {
  createWorldManifest,
} from '../src/runtime-manifest.ts';
import {
  ReLatteRuntime,
} from '../src/runtime.ts';
import {
  discoverRelatteRuntimePeersFromDidDocument,
  fetchRelattePeerDescriptor,
} from '../src/peer-discovery.ts';
import {
  encryptPayloadForRecipient,
} from '../src/encrypted-payload.ts';
import {
  generateP256KeyPair,
  sealCrossingEnvelope,
} from '../src/index.ts';

const gatewayUri = process.env.DID_DHT_GATEWAY_URL;
if (!gatewayUri) throw new Error('DID_DHT_GATEWAY_URL is required');

const workspace = await mkdtemp(join(tmpdir(), 'relatte-live-private-peer-'));
const worldARoot = join(workspace, 'world-a');
const worldBRoot = join(workspace, 'world-b');
const peerPort = 4102;
const peerBase = `http://127.0.0.1:${peerPort}/`;
const descriptorEndpoint = new URL('/relatte/peer/v0', peerBase).toString();

async function waitForHealth(url: string): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const response = await fetch(new URL('/health', url));
      if (response.ok) return;
    } catch {
      // wait for the child peer process to bind
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('PEER_SERVER_HEALTH_TIMEOUT');
}

async function startPeer(root: string) {
  const child = spawn(
    process.execPath,
    ['--experimental-strip-types', 'scripts/runtime-peer-server-001.ts'],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        RELATTE_RUNTIME_ROOT: root,
        RELATTE_PEER_HOST: '127.0.0.1',
        RELATTE_PEER_PORT: String(peerPort),
        RELATTE_PEER_PUBLIC_BASE_URL: peerBase,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', (chunk) => {
    stdout += String(chunk);
  });
  child.stderr?.on('data', (chunk) => {
    stderr += String(chunk);
  });

  await waitForHealth(peerBase);
  return { child, stdout: () => stdout, stderr: () => stderr };
}

async function stopPeer(child: ReturnType<typeof spawn>): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((resolve) => {
    child.once('exit', () => resolve());
  });
  child.kill('SIGTERM');
  await exited;
}

try {
  const worldA = await ReLatteRuntime.create({
    root: worldARoot,
    manifest: createWorldManifest({
      world_id: 'world:live-peer:a',
      receiver_particular: 'particular:live-peer:a',
      receiver_contract_ref: 'relatte:live-peer:a/v0',
      pulse_interval_ms: 25,
    }),
    created_at: '2026-10-02T02:00:00.000Z',
  });

  const worldB = await ReLatteRuntime.create({
    root: worldBRoot,
    manifest: createWorldManifest({
      world_id: 'world:live-peer:b',
      receiver_particular: 'particular:live-peer:b',
      receiver_contract_ref: 'relatte:live-peer:b/v0',
      pulse_interval_ms: 25,
    }),
    created_at: '2026-10-02T02:00:00.000Z',
  });

  const firstPeer = await startPeer(worldBRoot);

  const locator = await DidDht.create({
    options: {
      publish: false,
      services: [{
        id: 'relatte',
        type: 'RelatteRuntime',
        serviceEndpoint: [descriptorEndpoint],
      }],
    },
  });

  const localDiscovery = discoverRelatteRuntimePeersFromDidDocument(
    locator.document,
  );
  assert.equal(localDiscovery.candidates.length, 1);

  const publication = await DidDht.publish({
    did: locator,
    gatewayUri,
  });
  assert.equal(publication.didDocumentMetadata?.published, true);

  const freshResolution = await DidDht.resolve(locator.uri, {
    gatewayUri,
  });
  assert.ok(freshResolution.didDocument);

  const resolvedDiscovery = discoverRelatteRuntimePeersFromDidDocument(
    freshResolution.didDocument,
  );
  assert.equal(resolvedDiscovery.candidates.length, 1);
  assert.equal(
    resolvedDiscovery.candidates[0].candidate_id,
    localDiscovery.candidates[0].candidate_id,
  );

  const peerDescriptor = await fetchRelattePeerDescriptor({
    candidate: resolvedDiscovery.candidates[0],
  });
  assert.equal(peerDescriptor.world_id, worldB.manifest.world_id);
  assert.equal(peerDescriptor.encryption_key_id, worldB.encryption.key_id);
  assert.equal(
    peerDescriptor.capability_issuer_ref,
    worldB.capabilityKernel.issuer_ref,
  );

  const aOutbound = await generateP256KeyPair();
  const grant = await worldB.capabilityKernel.issueReceiveCapability({
    holder_public_key: aOutbound.publicKeyJwk,
    declared_kind: 'SEALED_MESSAGE',
    not_before: '2026-09-01T00:00:00.000Z',
    expires_at: '2027-10-01T00:00:00.000Z',
    created_at: '2026-10-02T02:00:01.000Z',
  });

  const plaintextObject = {
    message: 'private crossing from A to B',
    sequence: 1,
  };
  const plaintext = new TextEncoder().encode(
    JSON.stringify(plaintextObject),
  );

  const encrypted = await encryptPayloadForRecipient({
    plaintext,
    recipient_public_key: peerDescriptor.encryption_public_key,
    context: {
      target_world: worldB.manifest.world_id,
      capability_id: grant.capability_id,
      declared_kind: 'SEALED_MESSAGE',
      media_type: 'application/json',
    },
  });

  const envelopeAddress =
    'sha256:' + sha256Hex(Buffer.from(canonicalize(encrypted), 'utf8'));

  const firstCrossing = await sealCrossingEnvelope({
    schema: 'relatte.crossing-envelope/v0',
    protocol_version: '0',
    source_particular: 'particular:live-peer:a:outbound',
    source_world: worldA.manifest.world_id,
    source_history_head: 'local:live-peer:a:head-1',
    parents: [],
    declared_kind: 'SEALED_MESSAGE',
    payload_refs: [{
      address: envelopeAddress,
      role: 'encrypted-payload',
      media_type: 'application/vnd.relatte.encrypted-payload+json',
    }],
    requested_effect: null,
    capability_ref: grant.capability_id,
    privacy_policy: {
      encrypted: true,
    },
    audience_policy: {
      target_world: worldB.manifest.world_id,
    },
    return_address: worldA.manifest.world_id,
    created_at: '2026-10-02T02:00:02.000Z',
    extensions: {
      encrypted_payload: encrypted,
    },
  }, aOutbound);

  const firstDelivery = await fetch(peerDescriptor.crossing_endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ crossing: firstCrossing }),
  });
  assert.equal(firstDelivery.status, 202);
  const firstAcceptance = await firstDelivery.json() as Record<string, any>;
  assert.equal(firstAcceptance.crossing_id, firstCrossing.crossing_id);

  await stopPeer(firstPeer.child);

  const reopenedB = await ReLatteRuntime.open({
    root: worldBRoot,
    created_at: '2026-10-02T02:00:03.000Z',
  });

  const decrypted = await reopenedB.encryption.decrypt(
    firstCrossing.extensions.encrypted_payload,
  );
  assert.deepEqual(
    JSON.parse(new TextDecoder().decode(decrypted.plaintext)),
    plaintextObject,
  );

  const holdReceipt = await reopenedB.receiver.dispose(
    firstCrossing.crossing_id,
    'HOLD',
    '2026-10-02T02:00:04.000Z',
    {
      note: 'decryption proves readability, not admission',
    },
  );
  assert.equal(holdReceipt.semantic_effect, 'none');

  const revocation = await reopenedB.capabilityKernel.revokeCapability({
    capability_id: grant.capability_id,
    revoked_at: new Date().toISOString(),
    reason: 'destination closes this directional door',
  });
  assert.equal(
    await reopenedB.capabilityKernel.verifyRevocation(revocation),
    true,
  );

  const secondPeer = await startPeer(worldBRoot);

  const encryptedSecond = await encryptPayloadForRecipient({
    plaintext: new TextEncoder().encode(JSON.stringify({
      message: 'second use after revocation',
      sequence: 2,
    })),
    recipient_public_key: peerDescriptor.encryption_public_key,
    context: {
      target_world: worldB.manifest.world_id,
      capability_id: grant.capability_id,
      declared_kind: 'SEALED_MESSAGE',
      media_type: 'application/json',
    },
  });

  const secondCrossing = await sealCrossingEnvelope({
    schema: 'relatte.crossing-envelope/v0',
    protocol_version: '0',
    source_particular: 'particular:live-peer:a:outbound',
    source_world: worldA.manifest.world_id,
    source_history_head: 'local:live-peer:a:head-2',
    parents: [firstCrossing.crossing_id],
    declared_kind: 'SEALED_MESSAGE',
    payload_refs: [{
      address:
        'sha256:' +
        sha256Hex(Buffer.from(canonicalize(encryptedSecond), 'utf8')),
      role: 'encrypted-payload',
      media_type: 'application/vnd.relatte.encrypted-payload+json',
    }],
    requested_effect: null,
    capability_ref: grant.capability_id,
    privacy_policy: {
      encrypted: true,
    },
    audience_policy: {
      target_world: worldB.manifest.world_id,
    },
    return_address: worldA.manifest.world_id,
    created_at: '2026-10-02T02:00:05.000Z',
    extensions: {
      encrypted_payload: encryptedSecond,
    },
  }, aOutbound);

  const rejectedDelivery = await fetch(peerDescriptor.crossing_endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ crossing: secondCrossing }),
  });
  assert.equal(rejectedDelivery.status, 403);
  const rejection = await rejectedDelivery.json() as Record<string, any>;
  assert.equal(rejection.error, 'CAPABILITY_REVOKED');

  await stopPeer(secondPeer.child);

  const finalB = await ReLatteRuntime.open({
    root: worldBRoot,
    created_at: '2026-10-02T02:00:06.000Z',
  });
  const finalSnapshot = await finalB.snapshot();

  assert.deepEqual(
    finalSnapshot.receiver.received,
    [firstCrossing.crossing_id],
  );
  assert.deepEqual(
    finalSnapshot.receiver.held,
    [firstCrossing.crossing_id],
  );
  assert.deepEqual(finalSnapshot.receiver.admitted, []);
  assert.equal(
    await finalB.capabilityKernel.isRevoked(
      grant.capability_id,
      new Date(Date.now() + 1000).toISOString(),
    ),
    true,
  );

  console.log(JSON.stringify({
    schema: 'relatte.live-private-peer-witness/v0',
    locator_did: locator.uri,
    gateway_uri: gatewayUri,
    discovered_peer_candidate_id:
      resolvedDiscovery.candidates[0].candidate_id,
    descriptor_endpoint: peerDescriptor.descriptor_endpoint,
    crossing_endpoint: peerDescriptor.crossing_endpoint,
    discovered_world_id: peerDescriptor.world_id,
    discovery_semantic_effect: 'none',
    encryption_profile: encrypted.profile,
    encryption_recipient_key_id: encrypted.recipient_key_id,
    first_crossing_id: firstCrossing.crossing_id,
    first_http_status: firstDelivery.status,
    plaintext_recovered_only_by_destination: true,
    first_disposition: 'HOLD',
    first_admitted: false,
    capability_id: grant.capability_id,
    revocation_id: revocation.revocation_id,
    historical_first_crossing_preserved: true,
    second_crossing_id: secondCrossing.crossing_id,
    second_http_status: rejectedDelivery.status,
    second_rejection: rejection.error,
    second_crossing_received: false,
    final_received: finalSnapshot.receiver.received,
    final_held: finalSnapshot.receiver.held,
    final_admitted: finalSnapshot.receiver.admitted,
    laws: [
      'DISCOVERY != TRUST',
      'DISCOVERED != AUTHORIZED',
      'CIPHERTEXT != AUTHORITY',
      'DECRYPTABLE != ADMITTED',
      'CAPABILITY != ADMISSION',
      'REVOCATION != HISTORY ERASURE',
      'REVOKED NOW != NEVER VALID',
      'CAPABILITY STATUS != CROSSING HISTORY',
    ],
  }, null, 2));
} finally {
  await rm(workspace, { recursive: true, force: true });
}
