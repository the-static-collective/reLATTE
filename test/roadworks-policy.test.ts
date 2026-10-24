import assert from 'node:assert/strict';
import test from 'node:test';
import { dispatchRoadworks, ROAD_CAPABILITIES } from '../src/roadworks.ts';

const local = [{ id: 'local-one', kind: 'loopback-http' as const }, { id: 'local-two', kind: 'loopback-http' as const }];
const policy = { allowedRoadIds: ['local-one', 'local-two'], allowedKinds: ['loopback-http' as const], maxAttempts: 2 };
const ack = (id: string) => ({ schema: 'relatte.transport-ack/v0', crossing_id: 'crossing:x', transport_id: id, accepted_for_delivery: true, semantic_effect: 'none' });

test('tries an explicitly permitted second road after the first fails', async () => {
  let calls = 0;
  const result = await dispatchRoadworks('crossing:x', local, policy, async (road) => {
    calls++;
    if (road.id === 'local-one') throw new Error('down');
    return { frame_id: 'frame:two', ack: ack('frame:two') };
  });
  assert.equal(calls, 2);
  assert.equal(result.road_id, 'local-two');
  assert.deepEqual(result.attempts.map((a) => a.result), ['failed', 'transport-ack']);
  assert.equal(result.semantic_effect, 'none');
});

test('rejects a forged or mismatched transport ACK rather than declaring delivery', async () => {
  const result = await dispatchRoadworks('crossing:x', local, policy, async (road) => {
    return road.id === 'local-one'
      ? { frame_id: 'frame:one', ack: ack('frame:wrong') }
      : { frame_id: 'frame:two', ack: ack('frame:two') };
  });
  assert.equal(result.attempts[0].reason, 'INVALID_ACK');
  assert.equal(result.road_id, 'local-two');
});

test('no direct route can be silently substituted for a Tor-only policy', async () => {
  let calls = 0;
  await assert.rejects(
    dispatchRoadworks('crossing:x', [
      { id: 'onion', kind: 'tor-onion' }, ...local,
    ], { allowedRoadIds: ['onion'], allowedKinds: ['tor-onion'], maxAttempts: 1 }, async () => {
      calls++;
      return { frame_id: 'frame:a', ack: ack('frame:a') };
    }),
    /ROADWORKS_NOT_AN_AUTOMATED_ADAPTER/,
  );
  assert.equal(calls, 0);
});

test('Briar remains a human-only participation door, not an imaginary machine adapter', async () => {
  assert.equal(ROAD_CAPABILITIES.briar.execution, 'human-only');
  await assert.rejects(
    dispatchRoadworks('crossing:x', [{ id: 'friend', kind: 'briar' }], {
      allowedRoadIds: ['friend'], allowedKinds: ['briar'], maxAttempts: 1,
    }, async () => { throw new Error('must not run'); }),
    /ROADWORKS_NOT_AN_AUTOMATED_ADAPTER/,
  );
});

test('exhaustion and policy narrowing fail closed', async () => {
  await assert.rejects(dispatchRoadworks('crossing:x', local, policy, async () => {
    throw new Error('down');
  }), /ROADWORKS_DELIVERY_EXHAUSTED/);
  await assert.rejects(dispatchRoadworks('crossing:x', local, {
    allowedRoadIds: ['local-one', 'local-two'], allowedKinds: ['file-bundle'], maxAttempts: 2,
  }, async () => ({ frame_id: 'frame:two', ack: ack('frame:two') })), /ROADWORKS_KIND_NOT_ALLOWED/);
  await assert.rejects(dispatchRoadworks('crossing:x', local, {
    allowedRoadIds: ['unknown'], allowedKinds: ['loopback-http'], maxAttempts: 1,
  }, async () => ({ frame_id: 'frame:two', ack: ack('frame:two') })), /ROADWORKS_UNKNOWN_ALLOWED_ROAD/);
  await assert.rejects(dispatchRoadworks('crossing:x', local, {
    allowedRoadIds: ['local-one', 'local-one'], allowedKinds: ['loopback-http'], maxAttempts: 2,
  }, async () => ({ frame_id: 'frame:two', ack: ack('frame:two') })), /ROADWORKS_INVALID_POLICY/);
});
