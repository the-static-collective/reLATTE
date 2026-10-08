import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  LocalReceiver,
  generateP256KeyPair,
  makeTransportFrame,
  readFileBundle,
  sealOpaqueOrganCrossing,
  verifyOpaqueOrganCrossing,
  verifyReceipt,
  writeFileBundle,
} from '../src/index.ts';

const PARENT = 'manga-parcel:7bf10323cac82bdb8a1d9d2fdf883b177a8888d04da28963963f87f837cf3656';
const CHILDREN = [{"page":2,"kind":"voice","id":"manga-descendant:b199c792f3ffe320a576c2c3f9106a4b06ad6cccf1905a2741042b0137d671d5","payloads":[["ancestor-page","2b16bfd9f746b384499509f3d3b03f94fe18c8f7355f8afe962dff37a8ef1a88","image/png"],["narration-script","7f8b19e76caa4e7e0a0c9ca549fbf29f1423e79596fc09022400468179b566fa","text/plain"],["timing-map","eee15afd8fa99596e6d35e3ffba2e42128a48474495c7f0dcb49cf2d16188f07","application/json"],["voice-track","b933b49fbd052b13d855a737893d92a21670ac6570d10f172073af16938623d0","audio/wav"],["motion-edition","02ca87453ab2190afb61408eaa4590118f513b813b42c41f9bfe0aba21f5feb2","video/mp4"]]},{"page":3,"kind":"music","id":"manga-descendant:fec77751e789336d41e9a3435fc379363e8e21d843d730f245b195f5f50219ca","payloads":[["ancestor-page","7b268159a971f47e916bcdd2b3f4a2b04f5ea2e4241688db452e22acfa5f3b88","image/png"],["music-spec","18feefca4cc85d18d4cffb37530262ef9632fe1c0e0b385e6cb88fe8194107f2","application/json"],["music-track","448265e902858a75664795375ea748d954071229b4020ad7a75a834d5582a7a4","audio/wav"],["motion-edition","c66df21777354126525d6a90f5e3cdfba6f6517ff90d285d94c31d56b260f385","video/mp4"]]},{"page":4,"kind":"glitch","id":"manga-descendant:e8170f03392012bcf66facad89d484e38ecd8b81d9f50a588f1b08a155002580","payloads":[["ancestor-page","9ef74a717f71c61968c2688037dafab5130faeb2aaabd5aa16930485a085895d","image/png"],["glitch-recipe","f545817f6501458720b1715cb99e0862b141f286bc7c1d286246ce7ca7c7be1c","application/json"],["glitch-track","3476f5653db7347c86d7ac6fb1f964680bfb60f7af87758874767d7308d112a1","audio/wav"],["motion-edition","594bcff5691d13973766d428ba27184318378f45c0331669b95584f02edf7831","video/mp4"]]},{"page":5,"kind":"crawler","id":"manga-descendant:d214463302401bc85d2fdcc4f01f28e75929e8f52617f2db672c7770e4c22126","payloads":[["ancestor-page","8b4f0f92eb19f4d659107bdb1e94608258d0dfbd0c8aabe6711354b6906cba6a","image/png"],["crawler-markdown","7c1874e352369ee172cbaa60b5494b9332d3f415d99e6ad6d87d6d54ce639e25","text/markdown"],["retrieval-fragments","24a1e83641c1c673b51a653b9a5a9ec0641fad63745d50ddb4e825fe3969986f","application/json"],["crawler-preview","46b47c89df182d952dbe46aa19aed21c4834ac6bb0f9b902bdcdc4aada7cc8bc","video/mp4"]]}] as const;
const PARENTS = ["manga-descendant:9b798be1bf145749faa496e88e8493d0da277bd2206b511c6f173c3af445a00a","manga-descendant:b199c792f3ffe320a576c2c3f9106a4b06ad6cccf1905a2741042b0137d671d5","manga-descendant:fec77751e789336d41e9a3435fc379363e8e21d843d730f245b195f5f50219ca","manga-descendant:e8170f03392012bcf66facad89d484e38ecd8b81d9f50a588f1b08a155002580","manga-descendant:d214463302401bc85d2fdcc4f01f28e75929e8f52617f2db672c7770e4c22126"] as const;

function childSpec(child: typeof CHILDREN[number]): any {
  return {
    schema: 'relatte.opaque-organ-spec/v0',
    family_ref: 'organ:lemonpress/manga-descendant',
    donor_contract_ref:
      'github:the-static-collective/lemonPRESS@experiment/manga-parcel-001#works/national-treasure-manga-parcel-001/litter/index.json',
    artifact_kind: 'manga-' + child.kind + '-descendant',
    source_world: 'world:lemonpress',
    source_particular: child.id,
    source_history_head: PARENT,
    payload_refs: child.payloads.map(([role, hash, media_type]) => ({
      address: 'sha256:' + hash,
      role,
      media_type,
    })),
    donor_claims: {
      status: 'CANDIDATE',
      parent_parcel_id: PARENT,
      descendant_id: child.id,
      page: child.page,
      mutation_kind: child.kind,
      source_replacement: false,
    },
    requested_effect: {
      kind: 'candidate-descendant-ingress',
      authority: 'receiver-local',
      preferred_initial_disposition: 'HOLD',
    },
    return_address:
      'relatte:return:lemonpress:manga-litter-001:page-' +
      String(child.page).padStart(2, '0'),
    created_at: '2026-10-06T21:40:00.000Z',
  };
}

function issueSpec(): any {
  return {
    schema: 'relatte.opaque-organ-spec/v0',
    family_ref: 'organ:lemonpress/manga-issue',
    donor_contract_ref:
      'github:the-static-collective/lemonPRESS@experiment/manga-parcel-001#works/national-treasure-manga-parcel-001/litter/issue-001.json',
    artifact_kind: 'manga-family-composition',
    source_world: 'world:lemonpress',
    source_particular: 'manga-issue:432c93f1e797dbd486b8db4218cd4631380d1c0b35fed067dbadfe500763aa9c',
    source_history_head: PARENT,
    payload_refs: [
      {
        address:
          'sha256:9251d172743d5030cf0ed266f21cfacd8b68a8d54e68c6febcf7c146252f11ca',
        role: 'issue-manifest',
        media_type: 'application/json',
      },
      ...PARENTS.map((id, i) => ({
        address: 'id:' + id,
        role: 'sibling-' + (i + 1),
        media_type: 'application/vnd.lemonpress.descendant-id',
      })),
    ],
    donor_claims: {
      status: 'CANDIDATE',
      parent_parcel_id: PARENT,
      parents: [...PARENTS],
      parent_count: PARENTS.length,
      composition_law: 'FAMILY != FLATTENING',
    },
    requested_effect: {
      kind: 'candidate-family-composition-ingress',
      authority: 'receiver-local',
      preferred_initial_disposition: 'HOLD',
    },
    return_address: 'relatte:return:lemonpress:manga-issue-001',
    created_at: '2026-10-06T21:44:00.000Z',
  };
}

test('four unlike Manga Litter siblings cross one generic opaque membrane', async () => {
  const mutationKinds = new Set<string>();
  const ids = new Set<string>();

  for (const child of CHILDREN) {
    const spec = childSpec(child);
    const crossing = await sealOpaqueOrganCrossing(
      spec,
      await generateP256KeyPair(),
    );

    assert.equal(await verifyOpaqueOrganCrossing(crossing), true);
    assert.equal(crossing.source_history_head, PARENT);
    assert.equal(crossing.source_particular, child.id);
    assert.equal(
      crossing.extensions.organ_adapter.donor_claims.source_replacement,
      false,
    );

    mutationKinds.add(child.kind);
    ids.add(child.id);
  }

  assert.equal(mutationKinds.size, 4);
  assert.equal(ids.size, 4);
});

test('five-parent Issue 001 preserves sibling identities through RECEIVE and HOLD', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-manga-litter-'));

  try {
    const spec = issueSpec();
    const crossing = await sealOpaqueOrganCrossing(
      spec,
      await generateP256KeyPair(),
    );

    assert.equal(await verifyOpaqueOrganCrossing(crossing), true);
    assert.equal(crossing.source_particular, 'manga-issue:432c93f1e797dbd486b8db4218cd4631380d1c0b35fed067dbadfe500763aa9c');
    assert.equal(
      crossing.extensions.organ_adapter.donor_claims.composition_law,
      'FAMILY != FLATTENING',
    );
    assert.deepEqual(
      crossing.extensions.organ_adapter.donor_claims.parents,
      [...PARENTS],
    );
    assert.equal(
      new Set(crossing.extensions.organ_adapter.donor_claims.parents).size,
      5,
    );

    const frame = await makeTransportFrame(
      crossing,
      'file-bundle',
      '2026-10-06T21:45:00.000Z',
      'manga litter issue 001 file road',
    );
    const path = join(base, 'manga-issue-001.bundle.json');
    await writeFileBundle(path, frame);
    const delivered = await readFileBundle(path);

    const receiver = await LocalReceiver.create(join(base, 'receiver'), {
      world_id: 'world:manga-family-incubator',
      receiver_particular: 'particular:manga-family-incubator:001',
      contract_ref: 'contract:manga-family-incubator-local-law/v0',
    });

    const received = await receiver.receive(
      delivered.crossing,
      '2026-10-06T21:46:00.000Z',
    );
    assert.equal(await verifyReceipt(received), true);
    assert.equal(received.kind, 'RECEIVED');
    assert.equal(received.semantic_effect, 'none');

    const held = await receiver.dispose(
      crossing.crossing_id,
      'HOLD',
      '2026-10-06T21:47:00.000Z',
    );
    assert.equal(await verifyReceipt(held), true);
    assert.equal(held.kind, 'R3_HOLD');
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
