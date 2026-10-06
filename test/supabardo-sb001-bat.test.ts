import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

import {
  generateP256KeyPair,
  sealCrossingEnvelope,
  sealReceipt,
} from '../src/index.ts';
import {
  SB001_PAYLOAD_SHA256,
  SB001_PINNED_EVIDENCE_SET_ID,
  computeSb001EvidenceSetId,
  verifyPinnedSb001EvidenceSet,
  verifySb001Bundle,
} from '../scripts/sb001-verify.ts';

const PARTICULAR = join(process.cwd(), 'fixtures', 'sb001-static-os-particular.json');
const EVIDENCE_MANIFEST = join(process.cwd(), 'fixtures', 'sb001-evidence-manifest.json');

async function pinnedBundle() {
  return {
    particular_bytes: await readFile(PARTICULAR),
    crossing: JSON.parse(await readFile(join(process.cwd(), 'fixtures', 'sb001-signed-crossing.json'), 'utf8')),
    release: JSON.parse(await readFile(join(process.cwd(), 'fixtures', 'sb001-release-receipt.json'), 'utf8')),
    unresolved: JSON.parse(await readFile(join(process.cwd(), 'fixtures', 'sb001-unresolved-receipt.json'), 'utf8')),
    disposition: JSON.parse(await readFile(join(process.cwd(), 'fixtures', 'sb001-admit-receipt.json'), 'utf8')),
    exit: JSON.parse(await readFile(join(process.cwd(), 'fixtures', 'sb001-exit-receipt.json'), 'utf8')),
  };
}

function receiptDraft(receipt: any): any {
  const { receipt_id: _receiptId, signing: _signing, ...draft } = receipt;
  return structuredClone(draft);
}

function crossingDraft(crossing: any): any {
  const { crossing_id: _crossingId, signing: _signing, ...draft } = crossing;
  return structuredClone(draft);
}

async function freshBundle(options: {
  destinationUsesSourceKey?: boolean;
  destinationUsesBardoKey?: boolean;
} = {}) {
  const particularBytes = await readFile(PARTICULAR);
  const sourceKeys = await generateP256KeyPair();
  const bardoKeys = await generateP256KeyPair();
  const destinationKeys = options.destinationUsesSourceKey
    ? sourceKeys
    : options.destinationUsesBardoKey
      ? bardoKeys
      : await generateP256KeyPair();

  const crossing = await sealCrossingEnvelope({
    schema: 'relatte.crossing-envelope/v0',
    protocol_version: '0',
    source_particular: 'static-os:world-receipt:world-001',
    source_world: 'static-os:experiment/witness-to-world-crossing-001',
    source_history_head: 'c1f3024e267ecf033e03f7707bcb07e784e1f095',
    parents: [],
    declared_kind: 'STATIC_OS_WHOLE_BODY_PARTICULAR',
    payload_refs: [{
      address: `sha256:${SB001_PAYLOAD_SHA256}`,
      role: 'whole-body',
      media_type: 'application/json',
    }],
    requested_effect: { destination_disposition: 'local' },
    capability_ref: null,
    privacy_policy: { field: 'bounded', retention: 'decay-after-export' },
    audience_policy: { destination: 'world:sb001-b' },
    return_address: 'supabardo:return:sb001',
    created_at: '2026-10-06T23:32:00.000Z',
    extensions: { specimen: 'SB-001-BAT' },
  }, sourceKeys);

  const release = await sealReceipt({
    schema: 'relatte.receipt/v0',
    crossing_id: crossing.crossing_id,
    world_id: crossing.source_world,
    receiver_particular: crossing.source_particular,
    kind: 'SB001_RELEASE',
    semantic_effect: 'crossing-released',
    contract_ref: 'supabardo:sb001/v0',
    pre_state_ref: `sha256:${SB001_PAYLOAD_SHA256}`,
    post_state_ref: crossing.crossing_id,
    descendant_refs: [],
    residual_refs: [`sha256:${SB001_PAYLOAD_SHA256}`],
    note: 'release without erasure',
    created_at: '2026-10-06T23:33:00.000Z',
    extensions: {
      supabardo: {
        laws: ['RELEASE != ERASURE', 'COPY != SECOND AUTHORITY'],
        source_bytes_may_remain: true,
      },
    },
  }, sourceKeys);

  const unresolved = await sealReceipt({
    schema: 'relatte.receipt/v0',
    crossing_id: crossing.crossing_id,
    world_id: 'supabardo:sb001',
    receiver_particular: 'crossing-field:sb001',
    kind: 'SB001_UNRESOLVED_INTERVAL',
    semantic_effect: 'none',
    contract_ref: 'supabardo:sb001/v0',
    pre_state_ref: release.receipt_id,
    post_state_ref: crossing.crossing_id,
    descendant_refs: [],
    residual_refs: [`sha256:${SB001_PAYLOAD_SHA256}`],
    note: 'released but not yet locally constituted',
    created_at: '2026-10-06T23:34:00.000Z',
    extensions: {
      supabardo: {
        state: 'OPEN',
        occurrence_classes: ['ENTER', 'FORM', 'WITNESS', 'WAIT'],
        destination_disposition: null,
        laws: ['OPEN != ADMITTED', 'WITNESS != AUTHORITY', 'PRESENCE != ASSENT'],
      },
    },
  }, bardoKeys);

  const disposition = await sealReceipt({
    schema: 'relatte.receipt/v0',
    crossing_id: crossing.crossing_id,
    world_id: 'world:sb001-b',
    receiver_particular: 'particular:sb001-b',
    kind: 'R3_ADMIT',
    semantic_effect: 'sb001-local-constitution',
    contract_ref: 'relatte:r3-local/v0',
    pre_state_ref: 'local-state:sb001-b:before',
    post_state_ref: 'local-state:sb001-b:after',
    descendant_refs: ['particular:sb001-b:constituted-world-001'],
    residual_refs: [],
    note: 'destination B independently admits X',
    created_at: '2026-10-06T23:35:00.000Z',
    extensions: {
      local_receiver: {
        disposition: 'ADMIT',
        laws: ['RECEIPT != ADMISSION', 'HOLD != ADMIT', 'AUTHORITY IS LOCAL'],
        supabardo_unresolved_receipt_id: unresolved.receipt_id,
      },
    },
  }, destinationKeys);

  const exit = await sealReceipt({
    schema: 'relatte.receipt/v0',
    crossing_id: crossing.crossing_id,
    world_id: 'supabardo:sb001',
    receiver_particular: 'crossing-field:sb001',
    kind: 'SB001_EXIT',
    semantic_effect: 'none',
    contract_ref: 'supabardo:sb001/v0',
    pre_state_ref: unresolved.receipt_id,
    post_state_ref: disposition.receipt_id,
    descendant_refs: [],
    residual_refs: [],
    note: 'destination disposition exists; field can exit',
    created_at: '2026-10-06T23:36:00.000Z',
    extensions: {
      supabardo: {
        state_before_exit: 'OPEN',
        terminal_occurrence: 'EXIT',
        destination_disposition_receipt_id: disposition.receipt_id,
        laws: ['EXIT != ADMISSION', 'DESTINATION MEANING REMAINS LOCAL'],
      },
    },
  }, bardoKeys);

  return {
    particularBytes,
    sourceKeys,
    bardoKeys,
    destinationKeys,
    crossing,
    release,
    unresolved,
    disposition,
    exit,
  };
}

async function expectRefusal(
  bundle: Awaited<ReturnType<typeof freshBundle>>,
  pattern: RegExp,
): Promise<void> {
  await assert.rejects(
    () => verifySb001Bundle({
      particular_bytes: bundle.particularBytes,
      crossing: bundle.crossing,
      release: bundle.release,
      unresolved: bundle.unresolved,
      disposition: bundle.disposition,
      exit: bundle.exit,
    }),
    pattern,
  );
}

test('BAT positive control: independently signed lawful SB-001 bundle survives', async () => {
  const b = await freshBundle();
  assert.equal(await verifySb001Bundle({
    particular_bytes: b.particularBytes,
    crossing: b.crossing,
    release: b.release,
    unresolved: b.unresolved,
    disposition: b.disposition,
    exit: b.exit,
  }), true);
});

test('BAT refuses source attempt to preselect destination disposition', async () => {
  const b = await freshBundle();
  const draft = crossingDraft(b.crossing);
  draft.requested_effect = { destination_disposition: 'ADMIT' };
  b.crossing = await sealCrossingEnvelope(draft, b.sourceKeys);
  await expectRefusal(b, /SB001_GLOBALIZED_REQUEST/);
});

test('BAT refuses permanent Bardo retention even when source signs it', async () => {
  const b = await freshBundle();
  const draft = crossingDraft(b.crossing);
  draft.privacy_policy.retention = 'permanent';
  b.crossing = await sealCrossingEnvelope(draft, b.sourceKeys);
  await expectRefusal(b, /SB001_RETENTION_DRIFT/);
});

test('BAT refuses RELEASE rewritten as erasure', async () => {
  const b = await freshBundle();
  const draft = receiptDraft(b.release);
  draft.extensions.supabardo.source_bytes_may_remain = false;
  b.release = await sealReceipt(draft, b.sourceKeys);
  await expectRefusal(b, /SB001_RELEASE_ERASURE_CONFUSION/);
});

test('BAT refuses a validly signed Bardo claim that WAIT already means ADMIT', async () => {
  const b = await freshBundle();
  const draft = receiptDraft(b.unresolved);
  draft.extensions.supabardo.destination_disposition = 'ADMIT';
  b.unresolved = await sealReceipt(draft, b.bardoKeys);
  await expectRefusal(b, /SB001_PREMATURE_DESTINATION_MEANING/);
});

test('BAT refuses Bardo manufacturing semantic consequence', async () => {
  const b = await freshBundle();
  const draft = receiptDraft(b.unresolved);
  draft.semantic_effect = 'admitted-by-field';
  b.unresolved = await sealReceipt(draft, b.bardoKeys);
  await expectRefusal(b, /SB001_BARDO_CREATED_MEANING/);
});

test('BAT refuses EXIT smuggled into the unresolved interval', async () => {
  const b = await freshBundle();
  const draft = receiptDraft(b.unresolved);
  draft.extensions.supabardo.occurrence_classes.push('EXIT');
  b.unresolved = await sealReceipt(draft, b.bardoKeys);
  await expectRefusal(b, /SB001_EXIT_BEFORE_DESTINATION/);
});

test('BAT refuses destination HOLD substituted for the admitted specimen', async () => {
  const b = await freshBundle();
  const draft = receiptDraft(b.disposition);
  draft.kind = 'R3_HOLD';
  draft.semantic_effect = 'none';
  draft.extensions.local_receiver.disposition = 'HOLD';
  b.disposition = await sealReceipt(draft, b.destinationKeys);
  await expectRefusal(b, /SB001_DESTINATION_NOT_ADMIT/);
});

test('BAT refuses destination authority impersonated by the Bardo identity', async () => {
  const b = await freshBundle({ destinationUsesBardoKey: true });
  await expectRefusal(b, /SB001_BARDO_DESTINATION_AUTHORITY_COLLAPSE/);
});

test('BAT refuses destination authority inherited from the source identity', async () => {
  const b = await freshBundle({ destinationUsesSourceKey: true });
  await expectRefusal(b, /SB001_SOURCE_DESTINATION_AUTHORITY_COLLAPSE/);
});

test('BAT refuses destination pretending to be the Bardo world', async () => {
  const b = await freshBundle();
  const draft = receiptDraft(b.disposition);
  draft.world_id = 'supabardo:sb001';
  b.disposition = await sealReceipt(draft, b.destinationKeys);
  await expectRefusal(b, /SB001_DESTINATION_WORLD/);
});

test('BAT refuses EXIT manufacturing destination meaning', async () => {
  const b = await freshBundle();
  const draft = receiptDraft(b.exit);
  draft.semantic_effect = 'inherited-admission';
  b.exit = await sealReceipt(draft, b.bardoKeys);
  await expectRefusal(b, /SB001_EXIT_CREATED_MEANING/);
});

test('BAT refuses EXIT pointing at a different validly shaped destination receipt', async () => {
  const b = await freshBundle();
  const fakeDisposition = await sealReceipt({
    ...receiptDraft(b.disposition),
    note: 'second independently signed disposition with different receipt identity',
  }, b.destinationKeys);
  const draft = receiptDraft(b.exit);
  draft.post_state_ref = fakeDisposition.receipt_id;
  draft.extensions.supabardo.destination_disposition_receipt_id = fakeDisposition.receipt_id;
  b.exit = await sealReceipt(draft, b.bardoKeys);
  await expectRefusal(b, /SB001_EXIT_LOST_DESTINATION|SB001_EXIT_WRONG_DESTINATION_RECEIPT/);
});

test('BAT does not trust clock order: backdated destination remains valid when hash-linked to WAIT', async () => {
  const b = await freshBundle();
  const draft = receiptDraft(b.disposition);
  draft.created_at = '2026-10-06T23:01:00.000Z';
  b.disposition = await sealReceipt(draft, b.destinationKeys);

  const exitDraft = receiptDraft(b.exit);
  exitDraft.post_state_ref = b.disposition.receipt_id;
  exitDraft.extensions.supabardo.destination_disposition_receipt_id =
    b.disposition.receipt_id;
  b.exit = await sealReceipt(exitDraft, b.bardoKeys);

  assert.equal(await verifySb001Bundle({
    particular_bytes: b.particularBytes,
    crossing: b.crossing,
    release: b.release,
    unresolved: b.unresolved,
    disposition: b.disposition,
    exit: b.exit,
  }), true);
});

test('BAT does not trust clock order: backdated EXIT remains valid when it references the exact disposition', async () => {
  const b = await freshBundle();
  const draft = receiptDraft(b.exit);
  draft.created_at = '2026-10-06T23:02:00.000Z';
  b.exit = await sealReceipt(draft, b.bardoKeys);

  assert.equal(await verifySb001Bundle({
    particular_bytes: b.particularBytes,
    crossing: b.crossing,
    release: b.release,
    unresolved: b.unresolved,
    disposition: b.disposition,
    exit: b.exit,
  }), true);
});

test('BAT refuses a different particular wearing the original payload address', async () => {
  const b = await freshBundle();
  b.particularBytes = Buffer.from('not the STATIC-OS particular\n', 'utf8');
  await expectRefusal(b, /SB001_PARTICULAR_HASH_MISMATCH/);
});


test('BAT pinned evidence manifest validates the exact surviving historical bundle', async () => {
  const bundle = await pinnedBundle();
  const manifest = JSON.parse(await readFile(EVIDENCE_MANIFEST, 'utf8'));
  assert.equal(await verifyPinnedSb001EvidenceSet(bundle, manifest), true);
  assert.equal(computeSb001EvidenceSetId(bundle), SB001_PINNED_EVIDENCE_SET_ID);
});

test('BAT evidence-set commitment changes when a role key changes even if the new bundle is lawful', async () => {
  const pinned = await pinnedBundle();
  const fresh = await freshBundle();
  assert.notEqual(
    computeSb001EvidenceSetId({
      particular_bytes: fresh.particularBytes,
      crossing: fresh.crossing,
      release: fresh.release,
      unresolved: fresh.unresolved,
      disposition: fresh.disposition,
      exit: fresh.exit,
    }),
    computeSb001EvidenceSetId(pinned),
  );
});

test('BAT pinned manifest rejects a fresh lawful ceremony replayed as SB-001 history', async () => {
  const fresh = await freshBundle();
  const manifest = JSON.parse(await readFile(EVIDENCE_MANIFEST, 'utf8'));
  await assert.rejects(
    () => verifyPinnedSb001EvidenceSet({
      particular_bytes: fresh.particularBytes,
      crossing: fresh.crossing,
      release: fresh.release,
      unresolved: fresh.unresolved,
      disposition: fresh.disposition,
      exit: fresh.exit,
    }, manifest),
    /SB001_EVIDENCE_BODY_MISMATCH|SB001_EVIDENCE_SET_ID_MISMATCH|SB001_PINNED_EVIDENCE_SET_MISMATCH/,
  );
});

test('BAT rejects mix-and-match receipts from two independently lawful ceremonies', async () => {
  const a = await freshBundle();
  const b = await freshBundle();

  await assert.rejects(
    () => verifySb001Bundle({
      particular_bytes: a.particularBytes,
      crossing: a.crossing,
      release: a.release,
      unresolved: a.unresolved,
      disposition: b.disposition,
      exit: b.exit,
    }),
    /SB001_CROSSING_ID_SPLIT|SB001_DESTINATION_LOST_UNRESOLVED_ANCESTRY|SB001_EXIT_LOST_WAIT|SB001_EXIT_LOST_DESTINATION/,
  );
});
