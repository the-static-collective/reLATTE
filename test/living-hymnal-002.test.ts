import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { generateP256KeyPair, verifyCrossingEnvelope } from '../src/protocol.ts';
import { verifyOpaqueOrganCrossing } from '../src/organ.ts';
import { LocalReceiver } from '../src/receiver.ts';
import { makeTransportFrame, verifyAndExtractTransportFrame, writeFileBundle, readFileBundle } from '../src/transport.ts';
import { sealLivingHymnalBundle, verifyLivingHymnalBundle } from '../examples/living-hymnal-002/ingress.ts';

const now = '2026-10-18T17:00:00.000Z';
const later = '2026-10-18T17:01:00.000Z';

function sampleBundle() {
  // Same contract and JSON.stringify byte convention as Static Live's
  // labs/living-hymnal-001/src/core.mjs toRelatteExportBundle().
  const published = {
    id: '11111111-2222-4333-8444-555555555555',
    title: 'At the Morning Door',
    lyrics: 'Here is a new song we may sing together.',
    scriptureRef: 'Psalm 40:3',
    bpm: 92,
    meter: '4/4'
  };
  const payload_text = JSON.stringify(published);
  const digest = createHash('sha256').update(Buffer.from(payload_text, 'utf8')).digest('hex');
  return {
    schema: 'living-hymnal.relatte-export/v0.1',
    payload_text,
    spec: {
      schema: 'relatte.opaque-organ-spec/v0',
      family_ref: 'living-hymnal/v0.1',
      donor_contract_ref: 'living-hymnal.published-song/v0.1',
      artifact_kind: 'PUBLISHED_CONGREGATIONAL_SONG',
      source_world: 'church:sample-church',
      source_particular: 'song:' + published.id,
      source_history_head: null,
      payload_refs: [{ address: 'sha256:' + digest, role: 'song-projection', media_type: 'application/json' }],
      donor_claims: {
        status: 'PUBLISHED',
        rights_review_affirmed: true,
        pastoral_review_affirmed: true,
        interchurch_sharing_approved: true,
        share_scope: 'PUBLIC_LYRICS_ONLY',
        terms: 'Nonexclusive permission for other congregations to sing these lyrics',
        payload_projection: 'id,title,lyrics,scriptureRef,bpm,meter'
      },
      requested_effect: { type: 'CANDIDATE_IMPORT', target: 'recipient-local-review' },
      return_address: null,
      created_at: now
    }
  };
}
test('an approved public lyric travels as a real signed crossing; churches decide independently', async () => {
  const root = await mkdtemp(join(tmpdir(), 'relatte-hymnal-'));
  try {
    const sourceKeys = await generateP256KeyPair();
    const { crossing, publishedSong } = await sealLivingHymnalBundle(sampleBundle(), sourceKeys);
    assert.equal(publishedSong.title, 'At the Morning Door');
    assert.equal(await verifyOpaqueOrganCrossing(crossing), true);
    assert.equal(await verifyCrossingEnvelope(crossing), true);
    const frame = await makeTransportFrame(crossing, 'file-bundle', now, 'an optional shared lyric');
    await writeFileBundle(join(root, 'song-crossing.json'), frame);
    const reading = await readFileBundle(join(root, 'song-crossing.json'));
    assert.equal(reading.crossing.crossing_id, crossing.crossing_id);
    assert.equal((await verifyAndExtractTransportFrame(frame)).crossing_id, crossing.crossing_id);
    const churchB = await LocalReceiver.create(join(root, 'church-b'), {
      world_id: 'church:other-church',
      receiver_particular: 'church-b-worship-review',
      contract_ref: 'church-b:local-hymnal-policy'
    });
    const churchC = await LocalReceiver.create(join(root, 'church-c'), {
      world_id: 'church:third-church',
      receiver_particular: 'church-c-worship-review',
      contract_ref: 'church-c:local-hymnal-policy'
    });
    const bReceive = await churchB.receive(reading.crossing, now);
    const cReceive = await churchC.receive(reading.crossing, now);
    assert.equal(bReceive.kind, 'RECEIVED');
    assert.equal(cReceive.kind, 'RECEIVED');
    assert.equal((await churchB.receive(reading.crossing, now)).receipt_id, bReceive.receipt_id);
    const b = await churchB.dispose(crossing.crossing_id, 'ADMIT', later,
      { admit_effect: 'local-review-approved-lyrics' });
    const c = await churchC.dispose(crossing.crossing_id, 'REFUSE', later,
      { note: 'church-c declines this candidate' });
    assert.equal(b.kind, 'R3_ADMIT');
    assert.equal(c.kind, 'R3_REFUSE');
    assert.deepEqual(churchB.snapshot().admitted, [crossing.crossing_id]);
    assert.deepEqual(churchC.snapshot().refused, [crossing.crossing_id]);
    assert.equal(churchC.snapshot().admitted.length, 0);
    assert.notEqual(churchB.snapshot().state_ref, churchC.snapshot().state_ref);
    const restoredB = await LocalReceiver.open(join(root, 'church-b'));
    const restoredC = await LocalReceiver.open(join(root, 'church-c'));
    assert.deepEqual(restoredB.snapshot(), churchB.snapshot());
    assert.deepEqual(restoredC.snapshot(), churchC.snapshot());
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('a public bundle cannot silently carry extra personal data or unverified altered lyrics', async () => {
  const bundle = sampleBundle();
  verifyLivingHymnalBundle(bundle);
  const corrupted = structuredClone(bundle);
  corrupted.payload_text = corrupted.payload_text.replace('new song', 'old song');
  assert.throws(() => verifyLivingHymnalBundle(corrupted), /HASH_MISMATCH/);

  const privateFields = structuredClone(bundle);
  privateFields.payload_text = JSON.stringify({
    ...JSON.parse(privateFields.payload_text),
    contributorAlias: 'Do not cross a boundary',
    privatePrayer: 'Do not export'
  });
  privateFields.spec.payload_refs[0].address = 'sha256:' +
    createHash('sha256').update(Buffer.from(privateFields.payload_text)).digest('hex');
  assert.throws(() => verifyLivingHymnalBundle(privateFields), /PRIVATE_OR_UNKNOWN/);

  const unlicensed = structuredClone(bundle);
  unlicensed.spec.donor_claims.interchurch_sharing_approved = false;
  assert.throws(() => verifyLivingHymnalBundle(unlicensed), /PERMISSION/);

  const wrongSource = structuredClone(bundle);
  wrongSource.spec.source_particular = 'song:some-other-song';
  assert.throws(() => verifyLivingHymnalBundle(wrongSource), /INVALID_PUBLISHED/);
});
test('changing a signed permission claim breaks reLATTE verification', async () => {
  const keys = await generateP256KeyPair();
  const { crossing } = await sealLivingHymnalBundle(sampleBundle(), keys);
  crossing.extensions.organ_adapter.donor_claims.interchurch_sharing_approved = false;
  assert.equal(await verifyOpaqueOrganCrossing(crossing), false);
});
