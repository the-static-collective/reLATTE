import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  LocalReceiver,
  buildCulturalDescendantDraft,
  createCulturalUptake,
  generateP256KeyPair,
  projectField,
  sealCrossingEnvelope,
  sealFieldLens,
  verifyCulturalDescendant,
  verifyCulturalUptakeShape,
  verifyCrossingEnvelope,
  verifyReceipt,
} from '../src/index.ts';

async function ancestorCrossing(): Promise<any> {
  const keys = await generateP256KeyPair();
  return sealCrossingEnvelope({
    schema: 'relatte.crossing-envelope/v0',
    protocol_version: '0',
    source_particular: 'particular:r10-ancestor',
    source_world: 'world:r10-ancestor',
    source_history_head: null,
    parents: [],
    declared_kind: 'R10_ANCESTOR',
    payload_refs: [{
      address: 'sha256:' + 'a'.repeat(64),
      role: 'payload',
      media_type: 'application/json',
    }],
    requested_effect: null,
    capability_ref: null,
    privacy_policy: null,
    audience_policy: null,
    return_address: 'relatte:return:r10-ancestor',
    created_at: '2026-10-01T23:40:00.000Z',
    extensions: {
      specimen: 'CULTURAL-DESCENDANT-001',
    },
  }, keys);
}

function localLens(): any {
  return sealFieldLens({
    schema: 'relatte.field-lens/v0',
    world_id: 'world:r10-local',
    title: 'R10 Uptake Lens',
    channels: [
      {
        name: 'continuation',
        weights: {
          admitted_receipts: 2,
          admitted_descendants: 1,
        },
      },
    ],
    created_at: '2026-10-01T23:41:00.000Z',
    laws: [
      'LENS != HISTORY',
      'LOCAL WEIGHT != UNIVERSAL VALUE',
    ],
  });
}

async function admittedAncestor(base: string): Promise<{
  ancestor: any;
  local: LocalReceiver;
  admit: any;
  field: any;
}> {
  const ancestor = await ancestorCrossing();
  const local = await LocalReceiver.create(join(base, 'local'), {
    world_id: 'world:r10-local',
    receiver_particular: 'particular:r10-local',
    contract_ref: 'contract:r10-local/v0',
  });

  await local.receive(ancestor, '2026-10-01T23:42:00.000Z');
  const admit = await local.dispose(
    ancestor.crossing_id,
    'ADMIT',
    '2026-10-01T23:43:00.000Z',
    {
      admit_effect: 'local-uptake-available',
    },
  );

  const field = await projectField({
    lens: localLens(),
    admitted_receipts: [admit],
  });

  return { ancestor, local, admit, field };
}

async function culturalUptake(base: string): Promise<{
  ancestor: any;
  local: LocalReceiver;
  admit: any;
  field: any;
  uptake: any;
}> {
  const fixture = await admittedAncestor(base);
  const uptake = await createCulturalUptake({
    ancestor_crossing: fixture.ancestor,
    admitted_receipt: fixture.admit,
    field_projection: fixture.field,
    world_id: 'world:r10-local',
    local_particular: 'particular:r10-local-maker',
    variation: {
      preserved: [
        'return-after-transformation',
        'attributable ancestry',
      ],
      varied: [
        'return becomes an invitation rather than a closure',
      ],
      introduced: [
        'a second-world reply door',
      ],
      retired: [
        'single-world ending assumption',
      ],
    },
    note: 'Owner-local uptake after admission and field projection.',
    created_at: '2026-10-01T23:44:00.000Z',
  });
  return { ...fixture, uptake };
}

test('R10 uptake requires admitted ancestry, local field context, and explicit variation', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-r10-uptake-'));
  try {
    const { ancestor, admit, field } = await admittedAncestor(base);

    const uptake = await createCulturalUptake({
      ancestor_crossing: ancestor,
      admitted_receipt: admit,
      field_projection: field,
      world_id: 'world:r10-local',
      local_particular: 'particular:r10-local-maker',
      variation: {
        preserved: ['return-after-transformation'],
        varied: ['return becomes an invitation'],
        introduced: ['reply door'],
        retired: [],
      },
      note: 'Explicit owner-local variation.',
      created_at: '2026-10-01T23:45:00.000Z',
    });

    assert.equal(verifyCulturalUptakeShape(uptake), true);
    assert.equal(uptake.ancestor_crossing_id, ancestor.crossing_id);
    assert.equal(uptake.admitted_receipt_id, admit.receipt_id);
    assert.equal(uptake.field_projection_id, field.projection_id);
    assert.equal(uptake.field_history_root, field.history_root);
    assert.equal(uptake.authority.inherited_from_ancestor, false);
    assert.equal(uptake.authority.inherited_from_field, false);
    assert.equal(uptake.authority.local_owner_required, true);

    await assert.rejects(
      () => createCulturalUptake({
        ancestor_crossing: ancestor,
        admitted_receipt: admit,
        field_projection: field,
        world_id: 'world:r10-local',
        local_particular: 'particular:r10-local-maker',
        variation: {
          preserved: ['return-after-transformation'],
          varied: [],
          introduced: ['silent mutation attempt'],
          retired: [],
        },
        note: 'Variation cannot be implicit.',
        created_at: '2026-10-01T23:46:00.000Z',
      }),
      /CULTURAL_VARIATION_REQUIRED/,
    );
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('descendant preserves ancestry while becoming a fresh locally signed crossing', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-r10-descendant-'));
  try {
    const { ancestor, admit, field, uptake } = await culturalUptake(base);
    const descendantKeys = await generateP256KeyPair();

    const draft = buildCulturalDescendantDraft({
      uptake,
      descendant_payload_ref: {
        address: 'sha256:' + 'd'.repeat(64),
        media_type: 'application/json',
      },
      return_address: 'relatte:return:r10-descendant',
      created_at: '2026-10-01T23:47:00.000Z',
    });
    const descendant = await sealCrossingEnvelope(draft, descendantKeys);

    assert.equal(await verifyCrossingEnvelope(descendant), true);
    assert.equal(
      await verifyCulturalDescendant({
        ancestor_crossing: ancestor,
        admitted_receipt: admit,
        field_projection: field,
        uptake,
        descendant_crossing: descendant,
      }),
      true,
    );

    assert.deepEqual(descendant.parents, [ancestor.crossing_id]);
    assert.equal(descendant.source_world, 'world:r10-local');
    assert.equal(descendant.source_particular, 'particular:r10-local-maker');
    assert.equal(descendant.source_history_head, field.history_root);
    assert.equal(descendant.declared_kind, 'R10_CULTURAL_DESCENDANT');
    assert.equal(descendant.requested_effect.authority, 'receiver-local');
    assert.equal(
      descendant.extensions.cultural_descendant.inherited_authority,
      false,
    );
    assert.equal(
      descendant.extensions.cultural_descendant.field_authorized_action,
      false,
    );
    assert.notEqual(descendant.crossing_id, ancestor.crossing_id);
    assert.notDeepEqual(
      descendant.signing.public_key,
      ancestor.signing.public_key,
    );
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('another sovereign world receives descendant as fresh candidate, not inherited admission', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-r10-fresh-candidate-'));
  try {
    const { ancestor, admit, field, uptake } = await culturalUptake(base);
    const descendant = await sealCrossingEnvelope(
      buildCulturalDescendantDraft({
        uptake,
        descendant_payload_ref: {
          address: 'sha256:' + 'e'.repeat(64),
          media_type: 'application/json',
        },
        created_at: '2026-10-01T23:48:00.000Z',
      }),
      await generateP256KeyPair(),
    );

    const otherWorld = await LocalReceiver.create(join(base, 'other-world'), {
      world_id: 'world:r10-other',
      receiver_particular: 'particular:r10-other',
      contract_ref: 'contract:r10-other/v0',
    });

    const receive = await otherWorld.receive(
      descendant,
      '2026-10-01T23:49:00.000Z',
    );

    assert.equal(await verifyReceipt(receive), true);
    assert.equal(receive.kind, 'RECEIVED');
    assert.equal(receive.semantic_effect, 'none');
    assert.deepEqual(otherWorld.snapshot().received, [descendant.crossing_id]);
    assert.deepEqual(otherWorld.snapshot().admitted, []);
    assert.deepEqual(otherWorld.snapshot().refused, []);
    assert.equal(otherWorld.getDispositionReceipt(descendant.crossing_id), null);

    assert.equal(
      await verifyCulturalDescendant({
        ancestor_crossing: ancestor,
        admitted_receipt: admit,
        field_projection: field,
        uptake,
        descendant_crossing: descendant,
      }),
      true,
    );
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('variation is append-only lineage: editing uptake or parent breaks verification', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-r10-tamper-'));
  try {
    const { ancestor, admit, field, uptake } = await culturalUptake(base);
    const descendant = await sealCrossingEnvelope(
      buildCulturalDescendantDraft({
        uptake,
        descendant_payload_ref: {
          address: 'sha256:' + 'f'.repeat(64),
          media_type: 'application/json',
        },
        created_at: '2026-10-01T23:50:00.000Z',
      }),
      await generateP256KeyPair(),
    );

    const editedUptake = structuredClone(uptake);
    editedUptake.variation.varied[0] = 'retroactively cleaned variation';
    assert.equal(verifyCulturalUptakeShape(editedUptake), false);
    assert.equal(
      await verifyCulturalDescendant({
        ancestor_crossing: ancestor,
        admitted_receipt: admit,
        field_projection: field,
        uptake: editedUptake,
        descendant_crossing: descendant,
      }),
      false,
    );

    const editedParent = structuredClone(descendant);
    editedParent.parents = ['relatte-crossing-v0:' + '0'.repeat(64)];
    assert.equal(await verifyCrossingEnvelope(editedParent), false);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('field projection is context for uptake, never authority to reproduce', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-r10-field-authority-'));
  try {
    const { field } = await admittedAncestor(base);

    assert.equal(field.semantic_effect, 'none');
    assert.equal(field.authorization, null);
    assert.equal(field.recommended_action, null);

    // A field alone cannot manufacture a valid uptake: admission and ancestor are required.
    await assert.rejects(
      () => createCulturalUptake({
        ancestor_crossing: field,
        admitted_receipt: field,
        field_projection: field,
        world_id: 'world:r10-local',
        local_particular: 'particular:r10-local-maker',
        variation: {
          preserved: [],
          varied: ['attempted autonomous reproduction'],
          introduced: [],
          retired: [],
        },
        note: 'Field should not authorize this.',
        created_at: '2026-10-01T23:51:00.000Z',
      }),
      /INVALID_UPTAKE_ANCESTOR|INVALID_UPTAKE_ADMISSION/,
    );
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
