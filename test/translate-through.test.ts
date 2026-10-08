import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  createTranslateThroughAttachment,
  generateP256KeyPair,
  sealTranslateThroughCrossing,
  sealTranslateThroughRouteReceipt,
  sealTranslateThroughStageReceipt,
  verifyTranslateThroughCrossing,
  verifyTranslateThroughRouteReceipt,
  verifyTranslateThroughStageReceipt,
} from '../src/index.ts';

async function foundingSpec(): Promise<any> {
  return JSON.parse(
    await readFile(
      'fixtures/translate-through-en-ja-en-spec.json',
      'utf8',
    ),
  );
}

test('translate.through attachment makes the route part of operation identity', async () => {
  const spec = await foundingSpec();
  const attachment = createTranslateThroughAttachment(spec);

  assert.equal(attachment.schema, 'relatte.translate-through/v0');
  assert.match(
    attachment.operation_id as string,
    /^relatte-translate-through-v0:[0-9a-f]{64}$/,
  );
  assert.deepEqual(
    attachment.route.map((stage) => [
      stage.role,
      stage.domain,
      stage.representation,
    ]),
    [
      ['source', 'language', 'en'],
      ['through', 'language', 'ja'],
      ['return', 'language', 'en'],
    ],
  );
  assert.equal(attachment.policy.preserve_intermediates, true);
  assert.equal(attachment.policy.require_stage_receipts, true);
  assert.equal(attachment.policy.semantic_equivalence_claim, 'none');

  const changed = structuredClone(spec);
  changed.route[1].representation = 'fr';
  const changedAttachment = createTranslateThroughAttachment(changed);
  assert.notEqual(
    changedAttachment.operation_id,
    attachment.operation_id,
    'route mutation must create another operation identity',
  );
});

test('translate.through refuses semantic-equivalence authority and malformed routes', async () => {
  const equivalence = await foundingSpec();
  equivalence.policy.semantic_equivalence_claim = 'equivalent';
  assert.throws(
    () => createTranslateThroughAttachment(equivalence),
    /INVALID_TRANSLATE_THROUGH_POLICY/,
  );

  const noThrough = await foundingSpec();
  noThrough.route = [
    noThrough.route[0],
    {
      stage_id: 'target-ja',
      domain: 'language',
      representation: 'ja',
      role: 'target',
      policy_ref: null,
    },
  ];
  assert.throws(
    () => createTranslateThroughAttachment(noThrough),
    /TRANSLATE_THROUGH_ROUTE_REQUIRES_THROUGH_STAGE/,
  );

  const badMiddle = await foundingSpec();
  badMiddle.route[1].role = 'target';
  assert.throws(
    () => createTranslateThroughAttachment(badMiddle),
    /TRANSLATE_THROUGH_INTERMEDIATE_MUST_BE_THROUGH/,
  );
});

test('signed crossing carries translate.through as a signed attachment without changing CrossingEnvelopeV0', async () => {
  const spec = await foundingSpec();
  const crossing = await sealTranslateThroughCrossing(
    spec,
    await generateP256KeyPair(),
  );

  assert.equal(await verifyTranslateThroughCrossing(crossing), true);
  assert.equal(crossing.declared_kind, 'TRANSLATE_THROUGH');
  assert.equal(crossing.requested_effect.kind, 'translate.through');
  assert.equal(crossing.requested_effect.authority, 'receiver-local');
  assert.equal(
    crossing.extensions.translate_through.operation_id,
    crossing.requested_effect.operation_id,
  );
  assert.equal(
    crossing.payload_refs[0].address,
    spec.source_ref.address,
  );

  const tampered = structuredClone(crossing);
  tampered.extensions.translate_through.route[1].representation = 'ko';
  assert.equal(await verifyTranslateThroughCrossing(tampered), false);
});

test('EN -> JA -> EN produces independently signed stage receipts and a COMPLETE route receipt', async () => {
  const spec = await foundingSpec();
  const crossing = await sealTranslateThroughCrossing(
    spec,
    await generateP256KeyPair(),
  );
  const executorKeys = await generateP256KeyPair();

  const japaneseRef = 'sha256:' + 'b'.repeat(64);
  const returnRef = 'sha256:' + 'c'.repeat(64);

  const japanese = await sealTranslateThroughStageReceipt({
    crossing,
    stage_index: 1,
    input_ref: spec.source_ref.address,
    output_ref: japaneseRef,
    state: 'COMPLETE',
    world_id: 'world:translation-organ-ja',
    receiver_particular: 'particular:translation-organ-ja',
    created_at: '2026-10-08T00:23:00.000Z',
    keys: executorKeys,
  });

  const returned = await sealTranslateThroughStageReceipt({
    crossing,
    stage_index: 2,
    input_ref: japaneseRef,
    output_ref: returnRef,
    state: 'COMPLETE',
    world_id: 'world:translation-organ-return',
    receiver_particular: 'particular:translation-organ-return',
    prior_stage_receipt: japanese,
    created_at: '2026-10-08T00:24:00.000Z',
    keys: executorKeys,
  });

  assert.equal(
    await verifyTranslateThroughStageReceipt({
      crossing,
      receipt: japanese,
    }),
    true,
  );
  assert.equal(
    await verifyTranslateThroughStageReceipt({
      crossing,
      receipt: returned,
      prior_stage_receipt: japanese,
    }),
    true,
  );

  assert.equal(
    japanese.extensions.translate_through_stage.to.representation,
    'ja',
  );
  assert.equal(
    returned.extensions.translate_through_stage.from.representation,
    'ja',
  );
  assert.equal(
    returned.extensions.translate_through_stage.to.representation,
    'en',
  );
  assert.equal(
    returned.extensions.translate_through_stage.semantic_equivalence_claim,
    'none',
  );

  const routeReceipt = await sealTranslateThroughRouteReceipt({
    crossing,
    stage_receipts: [japanese, returned],
    world_id: 'world:translate-through-router',
    receiver_particular: 'particular:translate-through-router',
    created_at: '2026-10-08T00:25:00.000Z',
    keys: executorKeys,
  });

  assert.equal(
    await verifyTranslateThroughRouteReceipt({
      crossing,
      stage_receipts: [japanese, returned],
      receipt: routeReceipt,
    }),
    true,
  );
  assert.equal(
    routeReceipt.extensions.translate_through_route.route_state,
    'COMPLETE',
  );
  assert.equal(routeReceipt.kind, 'EXECUTED');
  assert.equal(routeReceipt.semantic_effect, 'return-created');
  assert.deepEqual(routeReceipt.descendant_refs, [japaneseRef, returnRef]);
  assert.deepEqual(routeReceipt.residual_refs, [spec.source_ref.address]);
  assert.equal(routeReceipt.post_state_ref, returnRef);
});

test('HELD route preserves the completed intermediate instead of collapsing it', async () => {
  const spec = await foundingSpec();
  const crossing = await sealTranslateThroughCrossing(
    spec,
    await generateP256KeyPair(),
  );
  const executorKeys = await generateP256KeyPair();
  const japaneseRef = 'sha256:' + 'd'.repeat(64);

  const japanese = await sealTranslateThroughStageReceipt({
    crossing,
    stage_index: 1,
    input_ref: spec.source_ref.address,
    output_ref: japaneseRef,
    state: 'COMPLETE',
    world_id: 'world:translation-organ-ja',
    receiver_particular: 'particular:translation-organ-ja',
    created_at: '2026-10-08T00:26:00.000Z',
    keys: executorKeys,
  });

  const held = await sealTranslateThroughStageReceipt({
    crossing,
    stage_index: 2,
    input_ref: japaneseRef,
    output_ref: null,
    state: 'HELD',
    world_id: 'world:translation-organ-return',
    receiver_particular: 'particular:translation-organ-return',
    prior_stage_receipt: japanese,
    created_at: '2026-10-08T00:27:00.000Z',
    keys: executorKeys,
  });

  const routeReceipt = await sealTranslateThroughRouteReceipt({
    crossing,
    stage_receipts: [japanese, held],
    world_id: 'world:translate-through-router',
    receiver_particular: 'particular:translate-through-router',
    created_at: '2026-10-08T00:28:00.000Z',
    keys: executorKeys,
  });

  assert.equal(
    routeReceipt.extensions.translate_through_route.route_state,
    'HELD',
  );
  assert.equal(routeReceipt.kind, 'HELD');
  assert.equal(routeReceipt.semantic_effect, 'none');
  assert.equal(
    routeReceipt.extensions.translate_through_route.last_addressable_ref,
    japaneseRef,
  );
  assert.deepEqual(routeReceipt.descendant_refs, [japaneseRef]);
  assert.equal(
    await verifyTranslateThroughRouteReceipt({
      crossing,
      stage_receipts: [japanese, held],
      receipt: routeReceipt,
    }),
    true,
  );
});

test('stage and route receipt mutation breaks signed verification', async () => {
  const spec = await foundingSpec();
  const crossing = await sealTranslateThroughCrossing(
    spec,
    await generateP256KeyPair(),
  );
  const keys = await generateP256KeyPair();
  const japaneseRef = 'sha256:' + 'e'.repeat(64);

  const stage = await sealTranslateThroughStageReceipt({
    crossing,
    stage_index: 1,
    input_ref: spec.source_ref.address,
    output_ref: japaneseRef,
    state: 'COMPLETE',
    world_id: 'world:translation-organ-ja',
    receiver_particular: 'particular:translation-organ-ja',
    created_at: '2026-10-08T00:29:00.000Z',
    keys,
  });

  const tamperedStage = structuredClone(stage);
  tamperedStage.extensions.translate_through_stage.output_ref =
    'sha256:' + 'f'.repeat(64);
  assert.equal(
    await verifyTranslateThroughStageReceipt({
      crossing,
      receipt: tamperedStage,
    }),
    false,
  );

  const routeReceipt = await sealTranslateThroughRouteReceipt({
    crossing,
    stage_receipts: [stage],
    world_id: 'world:translate-through-router',
    receiver_particular: 'particular:translate-through-router',
    created_at: '2026-10-08T00:30:00.000Z',
    keys,
  });
  assert.equal(
    routeReceipt.extensions.translate_through_route.route_state,
    'PARTIAL',
  );

  const tamperedRoute = structuredClone(routeReceipt);
  tamperedRoute.extensions.translate_through_route.route_state = 'COMPLETE';
  assert.equal(
    await verifyTranslateThroughRouteReceipt({
      crossing,
      stage_receipts: [stage],
      receipt: tamperedRoute,
    }),
    false,
  );
});

test('translate.through core remains representation-generic rather than language-specific', async () => {
  const spec = await foundingSpec();
  spec.source_particular = 'particular:program:001';
  spec.source_ref = {
    address: 'sha256:' + '1'.repeat(64),
    media_type: 'text/typescript',
  };
  spec.route = [
    {
      stage_id: 'source-ts',
      domain: 'representation',
      representation: 'typescript',
      role: 'source',
      policy_ref: null,
    },
    {
      stage_id: 'through-ast',
      domain: 'representation',
      representation: 'typescript-ast',
      role: 'through',
      policy_ref: null,
    },
    {
      stage_id: 'target-wasm',
      domain: 'representation',
      representation: 'wasm',
      role: 'target',
      policy_ref: null,
    },
  ];

  const crossing = await sealTranslateThroughCrossing(
    spec,
    await generateP256KeyPair(),
  );
  assert.equal(await verifyTranslateThroughCrossing(crossing), true);
  assert.deepEqual(
    crossing.extensions.translate_through.route.map(
      (stage: any) => stage.representation,
    ),
    ['typescript', 'typescript-ast', 'wasm'],
  );
});
