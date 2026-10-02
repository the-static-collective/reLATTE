import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  CapabilityKernel,
} from '../src/capability-kernel.ts';
import {
  createWorldManifest,
} from '../src/runtime-manifest.ts';
import {
  ReLatteRuntime,
} from '../src/runtime.ts';
import {
  generateP256KeyPair,
  sealCrossingEnvelope,
} from '../src/index.ts';

async function crossingWithCapability(args: {
  keys: Awaited<ReturnType<typeof generateP256KeyPair>>;
  capability_ref: string | null;
  declared_kind?: string;
  source_world?: string;
}) {
  return sealCrossingEnvelope({
    schema: 'relatte.crossing-envelope/v0',
    protocol_version: '0',
    source_particular: 'particular:capability-unit-source',
    source_world: args.source_world ?? 'world:capability-unit-source',
    source_history_head: 'local:capability-unit-source:head',
    parents: [],
    declared_kind: args.declared_kind ?? 'CAPABILITY_UNIT',
    payload_refs: [{
      address: 'sha256:' + '2'.repeat(64),
      role: 'payload',
      media_type: 'application/json',
    }],
    requested_effect: null,
    capability_ref: args.capability_ref,
    privacy_policy: null,
    audience_policy: null,
    return_address: null,
    created_at: '2026-10-02T01:30:00.000Z',
    extensions: {},
  }, args.keys);
}

test('destination kernel issues a signed scoped grant and survives restart', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'relatte-capability-kernel-'));
  const root = join(workspace, 'kernel');

  try {
    const holder = await generateP256KeyPair();
    const kernel = await CapabilityKernel.create({
      root,
      world_id: 'world:destination',
    });

    const grant = await kernel.issueReceiveCapability({
      holder_public_key: holder.publicKeyJwk,
      declared_kind: 'CAPABILITY_UNIT',
      not_before: '2026-10-02T01:29:00.000Z',
      expires_at: '2026-10-02T02:29:00.000Z',
      created_at: '2026-10-02T01:29:00.000Z',
    });

    assert.equal(await kernel.verifyGrant(grant), true);
    assert.equal(grant.scope.target_world, 'world:destination');
    assert.equal(grant.action, 'runtime.receive.crossing');

    const reopened = await CapabilityKernel.open(root);
    assert.equal(await reopened.verifyGrant(grant), true);
    assert.deepEqual(await reopened.listGrantIds(), [grant.capability_id]);

    const crossing = await crossingWithCapability({
      keys: holder,
      capability_ref: grant.capability_id,
    });

    const authorized = await reopened.authorizeForeignCrossing({
      crossing,
      action: 'runtime.receive.crossing',
      observed_at: '2026-10-02T01:31:00.000Z',
    });
    assert.equal(authorized.capability_id, grant.capability_id);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('capability reference alone is not authority when holder key does not match', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'relatte-capability-holder-'));
  const root = join(workspace, 'kernel');

  try {
    const holder = await generateP256KeyPair();
    const attacker = await generateP256KeyPair();
    const kernel = await CapabilityKernel.create({
      root,
      world_id: 'world:destination',
    });
    const grant = await kernel.issueReceiveCapability({
      holder_public_key: holder.publicKeyJwk,
      declared_kind: 'CAPABILITY_UNIT',
      not_before: '2026-10-02T01:29:00.000Z',
      expires_at: '2026-10-02T02:29:00.000Z',
      created_at: '2026-10-02T01:29:00.000Z',
    });

    const crossing = await crossingWithCapability({
      keys: attacker,
      capability_ref: grant.capability_id,
    });

    await assert.rejects(
      () => kernel.authorizeForeignCrossing({
        crossing,
        action: 'runtime.receive.crossing',
        observed_at: '2026-10-02T01:31:00.000Z',
      }),
      /CAPABILITY_HOLDER_MISMATCH/,
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('foreign runtime enqueue requires capability but local enqueue remains a distinct door', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'relatte-capability-runtime-'));
  const root = join(workspace, 'runtime');

  try {
    const runtime = await ReLatteRuntime.create({
      root,
      manifest: createWorldManifest({
        world_id: 'world:capability-runtime',
        receiver_particular: 'particular:capability-runtime',
        receiver_contract_ref: 'relatte:capability-runtime/v0',
      }),
      created_at: '2026-10-02T01:29:00.000Z',
    });

    const holder = await generateP256KeyPair();
    const noCapability = await crossingWithCapability({
      keys: holder,
      capability_ref: null,
    });

    await assert.rejects(
      () => runtime.enqueueForeignCrossing({
        crossing: noCapability,
        enqueued_at: '2026-10-02T01:31:00.000Z',
        source: 'world:foreign',
      }),
      /CAPABILITY_REQUIRED/,
    );

    const grant = await runtime.capabilityKernel.issueReceiveCapability({
      holder_public_key: holder.publicKeyJwk,
      declared_kind: 'CAPABILITY_UNIT',
      not_before: '2026-10-02T01:29:00.000Z',
      expires_at: '2026-10-02T02:29:00.000Z',
      created_at: '2026-10-02T01:29:01.000Z',
    });
    const authorizedCrossing = await crossingWithCapability({
      keys: holder,
      capability_ref: grant.capability_id,
    });

    const item = await runtime.enqueueForeignCrossing({
      crossing: authorizedCrossing,
      enqueued_at: '2026-10-02T01:31:01.000Z',
      source: 'world:foreign',
    });
    assert.equal(item.crossing_id, authorizedCrossing.crossing_id);

    const pulse = await runtime.pulseOne({
      claimed_at: '2026-10-02T01:31:02.000Z',
      received_at: '2026-10-02T01:31:03.000Z',
      committed_at: '2026-10-02T01:31:04.000Z',
    });
    assert.equal(pulse.status, 'processed');

    const snapshot = await runtime.snapshot();
    assert.deepEqual(snapshot.receiver.received, [authorizedCrossing.crossing_id]);
    assert.deepEqual(snapshot.receiver.admitted, []);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
