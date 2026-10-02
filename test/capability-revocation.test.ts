import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CapabilityKernel } from '../src/capability-kernel.ts';
import {
  generateP256KeyPair,
  sealCrossingEnvelope,
} from '../src/index.ts';

test('capability revocation blocks future use without erasing historical validity', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'relatte-revocation-'));
  try {
    const kernel = await CapabilityKernel.create({
      root: join(workspace, 'kernel'),
      world_id: 'world:b',
    });
    const holder = await generateP256KeyPair();
    const grant = await kernel.issueReceiveCapability({
      holder_public_key: holder.publicKeyJwk,
      declared_kind: 'SEALED_MESSAGE',
      not_before: '2026-10-02T01:00:00.000Z',
      expires_at: '2026-10-03T01:00:00.000Z',
      created_at: '2026-10-02T01:00:00.000Z',
    });

    const crossing = await sealCrossingEnvelope({
      schema: 'relatte.crossing-envelope/v0',
      protocol_version: '0',
      source_particular: 'particular:a',
      source_world: 'world:a',
      source_history_head: 'local:a:head',
      parents: [],
      declared_kind: 'SEALED_MESSAGE',
      payload_refs: [{
        address: 'sha256:' + '4'.repeat(64),
        role: 'encrypted-payload',
        media_type: 'application/vnd.relatte.encrypted-payload+json',
      }],
      requested_effect: null,
      capability_ref: grant.capability_id,
      privacy_policy: null,
      audience_policy: { target_world: 'world:b' },
      return_address: 'world:a',
      created_at: '2026-10-02T01:01:00.000Z',
      extensions: {},
    }, holder);

    assert.equal(
      (
        await kernel.authorizeForeignCrossing({
          crossing,
          action: 'runtime.receive.crossing',
          observed_at: '2026-10-02T01:02:00.000Z',
        })
      ).capability_id,
      grant.capability_id,
    );

    const revocation = await kernel.revokeCapability({
      capability_id: grant.capability_id,
      revoked_at: '2026-10-02T01:03:00.000Z',
      reason: 'destination closed the door',
    });
    assert.equal(await kernel.verifyRevocation(revocation), true);

    assert.equal(
      (
        await kernel.authorizeForeignCrossing({
          crossing,
          action: 'runtime.receive.crossing',
          observed_at: '2026-10-02T01:02:30.000Z',
        })
      ).capability_id,
      grant.capability_id,
    );

    await assert.rejects(
      () => kernel.authorizeForeignCrossing({
        crossing,
        action: 'runtime.receive.crossing',
        observed_at: '2026-10-02T01:04:00.000Z',
      }),
      /CAPABILITY_REVOKED/,
    );

    const reopened = await CapabilityKernel.open(join(workspace, 'kernel'));
    assert.equal(
      await reopened.isRevoked(
        grant.capability_id,
        '2026-10-02T01:04:00.000Z',
      ),
      true,
    );
    assert.ok(
      revocation.laws.includes('REVOCATION != HISTORY ERASURE'),
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
