import assert from 'node:assert/strict';
import test from 'node:test';
import {
  nightShiftEvidenceObservation, NightShiftPublicEvidenceSource,
} from '../src/night-shift-evidence-source.ts';
import { evidenceEventId } from '../src/evidence-transit.ts';

const one = {
  source_ref: 'the-static-collective/reLATTE#121',
  source_url: 'https://github.com/the-static-collective/reLATTE/pull/121',
  title: 'COMMUTER-001: automatic correspondence organ with receiver-owned consent gates',
  state: 'MERGED' as const,
  commit_sha: '270169ebcc54c87de37b773a7bcaa2a090e7d04c',
  observed_at: '2026-10-27T08:45:32.125Z',
  source_happened_at: '2026-10-27T07:49:35.000Z',
};
function source(values: unknown[]) {
  const fake = async () => new Response(JSON.stringify({ external: values }), {
    headers: { 'Content-Type': 'application/json' },
  });
  return new NightShiftPublicEvidenceSource(fake as typeof fetch);
}
test('real Night Shift 005 GitHub observation becomes a source-owned address, not a receipt of truth', () => {
  const event = nightShiftEvidenceObservation(one);
  assert.equal(event.evidence_level, 'source_observed');
  assert.equal(event.assertion_kind, 'github.pull_request.state');
  assert.equal(event.occurred_at, one.source_happened_at);
  assert.match(event.payload_ref, /^sha256:[a-f0-9]{64}$/);
  assert.match(event.source_event_id, /^night-source-v0:[a-f0-9]{64}$/);
  assert.equal(event.subject_ref, 'repo:the-static-collective/reLATTE');
  assert.equal(evidenceEventId(event), evidenceEventId(nightShiftEvidenceObservation({...one})));
  assert.notEqual(evidenceEventId(event), evidenceEventId(nightShiftEvidenceObservation({
    ...one,
    commit_sha: 'f'.repeat(40),
  })));
});
test('pulls from the public feed once and advances cursor deterministically', async () => {
  const remote = source([one]);
  const first = await remote.poll(null);
  assert.equal(first.observations.length, 1);
  assert.equal(first.next_cursor?.includes('#121'), true);
  const repeated = await remote.poll(first.next_cursor);
  assert.deepEqual(repeated.observations, []);
  assert.equal(repeated.next_cursor, first.next_cursor);
});
test('rejects mismatched host and invalid source status', () => {
  assert.throws(() => nightShiftEvidenceObservation({...one,source_url:'https://evil.example/pull/121'}),/INVALID_NIGHT_SOURCE_URL/);
  assert.throws(() => nightShiftEvidenceObservation({...one,state:'OPEN'}),/UNSUPPORTED_NIGHT_SOURCE_STATE/);
  assert.throws(() => nightShiftEvidenceObservation({...one,commit_sha:'not-a-sha'}),/UNSUPPORTED_NIGHT_SOURCE_STATE/);
});
test('fail closed when bounded public feed no longer contains the stored cursor', async () => {
  const five=Array.from({length:5},(_,i)=>({...one,source_ref:'the-static-collective/reLATTE#'+(200+i),source_url:'https://github.com/the-static-collective/reLATTE/pull/'+(200+i)}));
  await assert.rejects(()=>source(five).poll('2026-01-01T00:00:00.000Z|not-there'),/NIGHT_SOURCE_CURSOR_OUTSIDE_FEED_WINDOW/);
});
test('does not silently skip source outages', async () => {
  const bad = new NightShiftPublicEvidenceSource(async()=>new Response('down',{status:502}) as any);
  await assert.rejects(()=>bad.poll(null),/NIGHT_SOURCE_HTTP_502/);
});

test('production PostgREST microsecond timestamps normalize to strict reLATTE milliseconds', () => {
  const live = {
    ...one,
    observed_at: '2026-10-27T08:45:32.125712+00:00',
    source_happened_at: '2026-10-27T07:49:35+00:00',
  };
  const event = nightShiftEvidenceObservation(live);
  assert.equal(event.observed_at, '2026-10-27T08:45:32.125Z');
  assert.equal(event.occurred_at, '2026-10-27T07:49:35.000Z');
  assert.match(evidenceEventId(event), /^relatte-evidence-event-v0:[a-f0-9]{64}$/);
});
