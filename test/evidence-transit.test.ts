import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { LocalReceiver } from '../src/receiver.ts';
import { generateP256KeyPair, verifyCrossingEnvelope, verifyReceipt } from '../src/protocol.ts';
import {
  evidenceEventId, sealEvidenceObservation, transportEvidence, pollEvidenceOnce,
} from '../src/evidence-transit.ts';
import type {
  EvidenceObservation, EvidenceRoute, EvidenceCursorStore,
} from '../src/evidence-transit.ts';

const payload = 'sha256:' + 'f'.repeat(64);
function observation(change: Partial<EvidenceObservation> = {}): EvidenceObservation {
  return {
    schema: 'relatte.evidence-observation/v0',
    source_system: 'github',
    source_world: 'world:github-public',
    source_particular: 'source:github-pr',
    source_event_id: 'the-static-collective/reLATTE#121:MERGED:270169eb',
    subject_ref: 'repo:the-static-collective/reLATTE',
    assertion_kind: 'github.pull_request.state',
    payload_ref: payload,
    evidence_level: 'source_observed',
    occurred_at: '2026-10-27T07:49:35.000Z',
    observed_at: '2026-10-27T08:46:39.000Z',
    ...change,
  };
}
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'relatte-evidence-'));
  const receiver = await LocalReceiver.create(join(root, 'receiver'), {
    world_id: 'world:night-shift',
    receiver_particular: 'particular:night-evidence-inbox',
    contract_ref: 'contract:night-observation-admission/v0',
  });
  const keys = await generateP256KeyPair();
  const stored = new Set<string>();
  const route: EvidenceRoute = {
    destination: 'night-shift-observation-inbox',
    capability_ref: 'capability:synthetic-only',
    source_keys: keys,
    receiver,
    received_at: () => '2026-10-27T08:46:40.000Z',
    evaluate: async () => ({ disposition: 'ADMIT', reason: 'local receiver approved public PR observation' }),
    store: async (_event, context) => {
      const already = stored.has(context.event_id);
      stored.add(context.event_id);
      return { status: already ? 'already-stored' : 'stored', record_ref: 'night:observation/one' };
    },
  };
  return { root, route, stored };
}
test('crossing is cryptographically signed and source payload stays outside envelope', async () => {
  const { root, route } = await setup();
  try {
    const signed = await sealEvidenceObservation(observation(), route.destination, route.source_keys, route.capability_ref);
    assert.equal(await verifyCrossingEnvelope(signed), true);
    assert.equal(signed.declared_kind, 'EVIDENCE_OBSERVATION');
    assert.equal(signed.extensions.evidence_transit.evidence_level, 'source_observed');
    assert.equal(signed.payload_refs[0].address, payload);
    assert.equal(JSON.stringify(signed).includes('COMMUTER-001'), false);
    const modified = { ...signed, extensions: {
      ...signed.extensions,
      evidence_transit: { ...signed.extensions.evidence_transit, evidence_level: 'bytes_verified' },
    }};
    assert.equal(await verifyCrossingEnvelope(modified), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('without owner policy, HOLD is signed and nothing enters the destination', async () => {
  const { root, route, stored } = await setup();
  try {
    delete route.evaluate;
    const result = await transportEvidence(observation(), route);
    assert.equal(result.status, 'HELD');
    assert.equal(stored.size, 0);
    assert.equal(route.receiver.snapshot().held.length, 1);
    assert.equal(await verifyReceipt(route.receiver.getReceiveReceipt(result.crossing_id)), true);
    assert.equal(await verifyReceipt(route.receiver.getDispositionReceipt(result.crossing_id)), true);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('owner-approved admission only stores an observation, idempotently across receiver restart', async () => {
  const { root, route, stored } = await setup();
  try {
    const first = await transportEvidence(observation(), route);
    assert.equal(first.status, 'STORED');
    assert.equal(stored.size, 1);
    assert.equal(route.receiver.snapshot().admitted.length, 1);
    const before = route.receiver.journalLength();
    route.receiver = await LocalReceiver.open(join(root, 'receiver'));
    const replay = await transportEvidence(observation(), route);
    assert.equal(replay.status, 'ALREADY_STORED');
    assert.equal(replay.crossing_id, first.crossing_id);
    assert.equal(replay.receive_receipt_id, first.receive_receipt_id);
    assert.equal(replay.disposition_receipt_id, first.disposition_receipt_id);
    assert.equal(route.receiver.journalLength(), before);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('policy can block replay after admission even if a previous admission exists', async () => {
  const { root, route, stored } = await setup();
  try {
    await transportEvidence(observation(), route);
    route.evaluate = async () => ({ disposition: 'HOLD', reason: 'source now blocked by receiver policy' });
    const blocked = await transportEvidence(observation(), route);
    assert.equal(blocked.status, 'BLOCKED');
    assert.equal(stored.size, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('absence of a sink prevents accidental ADMIT', async () => {
  const { root, route } = await setup();
  try {
    delete route.store;
    const result = await transportEvidence(observation(), route);
    assert.equal(result.status, 'HELD');
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('explicit receiver refusal does not call sink', async () => {
  const { root, route, stored } = await setup();
  try {
    route.evaluate = async () => ({ disposition: 'REFUSE', reason: 'source not on owner allowlist' });
    const result = await transportEvidence(observation(), route);
    assert.equal(result.status, 'REFUSED');
    assert.equal(stored.size, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('opaque references and evidence levels are validated before signing', () => {
  assert.equal(evidenceEventId(observation()), evidenceEventId(observation()));
  assert.notEqual(evidenceEventId(observation()), evidenceEventId(observation({ source_event_id: 'other' })));
  assert.throws(() => evidenceEventId(observation({ subject_ref: 'person@example.test' })), /UNSAFE_EVIDENCE_SUBJECT_REF/);
  assert.throws(() => evidenceEventId(observation({ payload_ref: 'https://example.test/not-a-hash' })), /INVALID_EVIDENCE_PAYLOAD_REF/);
  assert.throws(() => evidenceEventId(observation({ evidence_level: 'proved' as any })), /INVALID_EVIDENCE_LEVEL/);
  assert.throws(() => evidenceEventId({ ...observation(), secret: 'value' } as any), /UNEXPECTED_EVIDENCE_FIELD/);
});
test('failed downstream storage does not advance poll cursor', async () => {
  const { root, route } = await setup();
  try {
    let position: string | null = null;
    let attempts = 0;
    const cursor: EvidenceCursorStore = {
      read: async () => position,
      write: async next => { position = next; },
    };
    const source = {
      poll: async (current: string | null) => {
        assert.equal(current, null);
        return { observations: [observation()], next_cursor: 'after-121' };
      },
    };
    const realStore = route.store!;
    route.store = async (value, context) => {
      attempts++;
      if (attempts === 1) throw new Error('temporary destination outage');
      return realStore(value, context);
    };
    await assert.rejects(pollEvidenceOnce(source, cursor, route), /temporary destination outage/);
    assert.equal(position, null);
    const results = await pollEvidenceOnce(source, cursor, route);
    assert.equal(results[0].status, 'STORED');
    assert.equal(position, 'after-121');
  } finally { await rm(root, { recursive: true, force: true }); }
});
