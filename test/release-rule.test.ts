import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import test from 'node:test';

import {
  LocalReceiver,
  createHttpRelayServer,
  generateP256KeyPair,
  makeTransportFrame,
  postHttpTransport,
  readFileBundle,
  sealOpaqueOrganCrossing,
  verifyOpaqueOrganCrossing,
  verifyReceipt,
  writeFileBundle,
} from '../src/index.ts';

function dailySliceSpec(): any {
  return {
    schema: 'relatte.opaque-organ-spec/v0',
    family_ref: 'organ:daily-slice/chronological-public-witness',
    donor_contract_ref:
      'github:the-static-collective/the-daily-slice@main#README',
    artifact_kind: 'dated-public-witness',
    source_world: 'world:daily-slice',
    source_particular: 'particular:daily-slice:2026-10-01-release-rule',
    source_history_head: 'daily-slice:chronology:2026-10-01',
    payload_refs: [{
      address: 'sha256:' + 'd'.repeat(64),
      role: 'witness-markdown',
      media_type: 'text/markdown',
    }],
    donor_claims: {
      posture: 'OBSERVATION',
      visible_from_here_then: true,
      source_authority: false,
      canonical_now: false,
    },
    requested_effect: {
      kind: 'candidate-public-orientation',
      authority: 'receiver-local',
    },
    return_address: 'relatte:return:daily-slice',
    created_at: '2026-10-02T01:00:00.000Z',
  };
}

function hauntedToasterSpec(): any {
  return {
    schema: 'relatte.opaque-organ-spec/v0',
    family_ref: 'organ:haunted-toaster/deterministic-media-execution',
    donor_contract_ref:
      'github:the-static-collective/the-haunted-toaster@main#README',
    artifact_kind: 'kept-render-evidence-bundle',
    source_world: 'world:haunted-toaster',
    source_particular: 'particular:haunted-toaster:render-001',
    source_history_head: 'toaster:accepted-history:render-001',
    payload_refs: [
      {
        address: 'sha256:' + 'a'.repeat(64),
        role: 'video-receipt',
        media_type: 'application/json',
      },
      {
        address: 'sha256:' + 'b'.repeat(64),
        role: 'finished-video',
        media_type: 'video/mp4',
      },
    ],
    donor_claims: {
      continuation_verdict: 'KEEP',
      continuation_scope: 'exact-creature-only',
      resolved_timeline_authority: 'donor-local',
      receipt_is_residual_witness: true,
    },
    requested_effect: {
      kind: 'candidate-render-evidence-ingress',
      authority: 'receiver-local',
    },
    return_address: 'relatte:return:haunted-toaster',
    created_at: '2026-10-02T01:01:00.000Z',
  };
}

async function sealBoth(): Promise<{ daily: any; toaster: any }> {
  return {
    daily: await sealOpaqueOrganCrossing(
      dailySliceSpec(),
      await generateP256KeyPair(),
    ),
    toaster: await sealOpaqueOrganCrossing(
      hauntedToasterSpec(),
      await generateP256KeyPair(),
    ),
  };
}

test('two materially different donor families cross the same opaque adapter', async () => {
  const { daily, toaster } = await sealBoth();

  for (const crossing of [daily, toaster]) {
    assert.equal(await verifyOpaqueOrganCrossing(crossing), true);
    assert.equal(crossing.declared_kind, 'OPAQUE_ORGAN_ARTIFACT');
    assert.equal(crossing.capability_ref, null);
    assert.equal(crossing.requested_effect.authority, 'receiver-local');
    assert.equal(
      crossing.extensions.organ_adapter.laws.includes(
        'DONOR SEMANTICS != SUBSTRATE SEMANTICS',
      ),
      true,
    );
  }

  assert.equal(daily.payload_refs.length, 1);
  assert.equal(daily.payload_refs[0].media_type, 'text/markdown');
  assert.equal(
    daily.extensions.organ_adapter.donor_claims.posture,
    'OBSERVATION',
  );

  assert.equal(toaster.payload_refs.length, 2);
  assert.equal(toaster.payload_refs[1].media_type, 'video/mp4');
  assert.equal(
    toaster.extensions.organ_adapter.donor_claims.continuation_verdict,
    'KEEP',
  );

  assert.notEqual(
    daily.extensions.organ_adapter.family_ref,
    toaster.extensions.organ_adapter.family_ref,
  );
  assert.notEqual(
    daily.extensions.organ_adapter.adapter_id,
    toaster.extensions.organ_adapter.adapter_id,
  );
});

test('both organ families use the same file + HTTP transport and durable receiver path', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-release-rule-'));
  const receiver = await LocalReceiver.create(join(base, 'receiver'), {
    world_id: 'world:release-gate-receiver',
    receiver_particular: 'particular:release-gate-receiver',
    contract_ref: 'contract:release-gate-local-law/v0',
  });

  const deliveredByHttp: string[] = [];
  const server = createHttpRelayServer(async (incoming) => {
    deliveredByHttp.push(incoming.crossing_id);
    await receiver.receive(incoming, '2026-10-02T01:10:00.000Z');
  });

  try {
    const { daily, toaster } = await sealBoth();
    const crossings = [daily, toaster];

    for (let i = 0; i < crossings.length; i++) {
      const crossing = crossings[i];
      const frame = await makeTransportFrame(
        crossing,
        'file-bundle',
        `2026-10-02T01:0${2 + i}:00.000Z`,
        'release-rule file road',
      );
      const path = join(base, `organ-${i}.bundle.json`);
      await writeFileBundle(path, frame);
      const delivered = await readFileBundle(path);
      const receipt = await receiver.receive(
        delivered.crossing,
        `2026-10-02T01:0${4 + i}:00.000Z`,
      );

      assert.equal(await verifyReceipt(receipt), true);
      assert.equal(receipt.kind, 'RECEIVED');
      assert.equal(receipt.semantic_effect, 'none');
      assert.equal(receipt.crossing_id, crossing.crossing_id);
    }

    assert.equal(receiver.journalLength(), 2);

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address() as AddressInfo;

    for (let i = 0; i < crossings.length; i++) {
      const crossing = crossings[i];
      const frame = await makeTransportFrame(
        crossing,
        'http-relay',
        `2026-10-02T01:0${6 + i}:00.000Z`,
        'release-rule HTTP road',
      );
      const ack = await postHttpTransport(
        `http://127.0.0.1:${address.port}/relatte/v0/crossings`,
        frame,
      );
      assert.equal(ack.crossing_id, crossing.crossing_id);
      assert.equal(ack.semantic_effect, 'none');
    }

    assert.equal(receiver.journalLength(), 2);
    assert.deepEqual(
      new Set(deliveredByHttp),
      new Set(crossings.map((crossing) => crossing.crossing_id)),
    );

    // Donor-specific meaning remains outside the substrate. Local law may
    // make different decisions without adding family branches to RECEIVE.
    const dailyDisposition = await receiver.dispose(
      daily.crossing_id,
      'ADMIT',
      '2026-10-02T01:11:00.000Z',
      { admit_effect: 'local-public-orientation' },
    );
    const toasterDisposition = await receiver.dispose(
      toaster.crossing_id,
      'HOLD',
      '2026-10-02T01:12:00.000Z',
    );

    assert.equal(dailyDisposition.kind, 'R3_ADMIT');
    assert.equal(toasterDisposition.kind, 'R3_HOLD');
    assert.equal(await verifyReceipt(dailyDisposition), true);
    assert.equal(await verifyReceipt(toasterDisposition), true);
  } finally {
    await new Promise<void>((resolve) => {
      if (!server.listening) return resolve();
      server.close(() => resolve());
    });
    await rm(base, { recursive: true, force: true });
  }
});

test('substrate source contains no donor-family semantic branches', async () => {
  const corePaths = [
    'src/organ.ts',
    'src/protocol.ts',
    'src/transport.ts',
    'src/receiver.ts',
  ];

  const forbidden = [
    'daily-slice',
    'haunted-toaster',
    'OBSERVATION',
    'KEEP',
    'SCRAPE',
    'ResolvedTimeline',
  ];

  for (const path of corePaths) {
    const source = await readFile(path, 'utf8');
    for (const token of forbidden) {
      assert.equal(
        source.includes(token),
        false,
        `${path} contains donor-specific token ${token}`,
      );
    }
  }
});

test('generic adapter accepts an unknown third family without a new enum or branch', async () => {
  const spec = {
    schema: 'relatte.opaque-organ-spec/v0',
    family_ref: 'organ:future-unknown/sensorial-sculpture',
    donor_contract_ref: 'donor:future-unknown:contract-v9',
    artifact_kind: 'multisensory-state',
    source_world: 'world:future-unknown',
    source_particular: 'particular:future-unknown:001',
    source_history_head: null,
    payload_refs: [{
      address: 'sha256:' + '9'.repeat(64),
      role: 'opaque-state',
      media_type: 'application/x-future-material',
    }],
    donor_claims: {
      alien_semantics: {
        phase: 17,
        reversible: 'maybe',
      },
    },
    requested_effect: {
      whatever_the_donor_means: true,
      authority: 'receiver-local',
    },
    return_address: null,
    created_at: '2026-10-02T01:13:00.000Z',
  };

  const crossing = await sealOpaqueOrganCrossing(
    spec,
    await generateP256KeyPair(),
  );

  assert.equal(await verifyOpaqueOrganCrossing(crossing), true);
  assert.equal(
    crossing.extensions.organ_adapter.family_ref,
    spec.family_ref,
  );
  assert.equal(
    crossing.payload_refs[0].media_type,
    'application/x-future-material',
  );
});

test('donor semantics are signed opaque data and cannot be changed after crossing creation', async () => {
  const daily = await sealOpaqueOrganCrossing(
    dailySliceSpec(),
    await generateP256KeyPair(),
  );

  const donorTamper = structuredClone(daily);
  donorTamper.extensions.organ_adapter.donor_claims.source_authority = true;
  assert.equal(await verifyOpaqueOrganCrossing(donorTamper), false);

  const payloadTamper = structuredClone(daily);
  payloadTamper.payload_refs[0].media_type = 'video/mp4';
  assert.equal(await verifyOpaqueOrganCrossing(payloadTamper), false);

  const descriptorSidecar = structuredClone(daily);
  descriptorSidecar.extensions.organ_adapter.special_daily_slice_rule = true;
  assert.equal(await verifyOpaqueOrganCrossing(descriptorSidecar), false);

  await assert.rejects(
    () => sealOpaqueOrganCrossing(
      {
        ...dailySliceSpec(),
        special_family_hint: 'please branch on me',
      },
      await generateP256KeyPair(),
    ),
    /UNEXPECTED_ORGAN_SPEC_FIELD/,
  );
});
