import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { LocalReceiver } from '../src/receiver.ts';
import { generateP256KeyPair, verifyReceipt } from '../src/protocol.ts';
import {
  deliverSunoListeningForReview,
  inspectSunoListeningCapture,
  sunoListeningDigest,
} from '../src/suno-listening.ts';

function syntheticCapture() {
  return {
    schema: 'humkin.suno-listening-capture/v1',
    recording_id: 'humkin:synthetic-song-one',
    suno_audio_id: '00000000-0000-4000-8000-000000000001',
    visibility: 'private',
    captured_at: '2026-11-23T22:30:00Z',
    measured: {
      source: 'suno.audio_analysis',
      bpm: 91.25,
      key: 'F major',
      time_signature: 4,
      section_labels: ['A', 'B', 'A', 'C'],
    },
    heard: {
      source: 'suno.audio_listen',
      audible_evidence: 'Synthetic fixture: soft keys and rhythmic clicks.',
      interpretation: 'Synthetic fixture: an intimate, reflective arrangement.',
      uncertainties: ['The clicks may be snaps.'],
    },
    approval: { public_release: false, broadcast_control: false },
  } as const;
}

async function fixture() {
  const base = await mkdtemp(join(tmpdir(), 'relatte-suno-listening-'));
  const receiver = await LocalReceiver.create(join(base, 'humkin-review'), {
    world_id: 'world:humkin-review-fixture',
    receiver_particular: 'particular:fixture-editor',
    contract_ref: 'contract:humkin-suno-listening-review/v1',
  });
  const sourceKeys = await generateP256KeyPair();
  const route = {
    receiver, sourceKeys, sourceWorld: 'world:synthetic-suno-adapter',
    sourceParticular: 'particular:fixture-listening',
    recordedAt: '2026-11-23T22:35:00Z',
    ownerApprovedReview: true,
    receiverDecision: 'HOLD' as const,
  };
  return { base, receiver, route };
}

test('bounded capture remains separate from playback and audience statistics', () => {
  const valid = syntheticCapture();
  assert.equal(inspectSunoListeningCapture(valid).suno_audio_id, valid.suno_audio_id);
  assert.match(sunoListeningDigest(valid), /^[0-9a-f]{64}$/);
  assert.equal(sunoListeningDigest(valid), sunoListeningDigest(structuredClone(valid)));
  const invalid = [
    { ...valid, views: 1200 },
    { ...valid, approval: { public_release: true, broadcast_control: false } },
    { ...valid, measured: { ...valid.measured, source: 'owner-prompt' } },
    { ...valid, heard: { ...valid.heard, source: 'radio-play-counter' } },
    { ...valid, suno_audio_id: '29AjbC42d3nt9cjZ' },
    { ...valid, measured: { ...valid.measured, bpm: Number.NaN } },
    { ...valid, heard: { ...valid.heard, uncertainties: ['x'], lyrics: 'private text' } },
  ];
  invalid.forEach((item) => assert.throws(() => inspectSunoListeningCapture(item), /HOLD/));
});

test('the first Suno review crossing is cryptographically witnessed but never admitted or published', async () => {
  const { base, receiver, route } = await fixture();
  try {
    const capture = syntheticCapture();
    await assert.rejects(
      () => deliverSunoListeningForReview(capture, { ...route, ownerApprovedReview: false }),
      /HOLD_OWNER_REVIEW_NOT_APPROVED/,
    );
    assert.equal(receiver.journalLength(), 0);

    const out = await deliverSunoListeningForReview(capture, route);
    assert.equal(out.disposition, 'HOLD');
    assert.equal(out.publicReleaseAllowed, false);
    assert.equal(out.broadcastControlAllowed, false);
    assert.equal(out.actualPlaybackVerified, false);
    assert.equal(out.sunoAudienceStatsImported, false);
    assert.deepEqual(receiver.snapshot().admitted, []);
    assert.equal(receiver.snapshot().held.length, 1);
    assert.equal(await verifyReceipt(out.receiveReceipt), true);
    assert.equal(await verifyReceipt(out.dispositionReceipt), true);

    const count = receiver.journalLength();
    const again = await deliverSunoListeningForReview(capture, route);
    assert.equal(again.crossingId, out.crossingId);
    assert.equal(receiver.journalLength(), count);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('receiver refusal leaves no authorized broadcast or release', async () => {
  const { base, receiver, route } = await fixture();
  try {
    const out = await deliverSunoListeningForReview(
      syntheticCapture(), { ...route, receiverDecision: 'REFUSE' },
    );
    assert.equal(out.disposition, 'REFUSE');
    assert.equal(receiver.snapshot().refused.length, 1);
    assert.equal(receiver.snapshot().admitted.length, 0);
    assert.equal(out.publicReleaseAllowed, false);
    assert.equal(out.broadcastControlAllowed, false);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
