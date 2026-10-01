import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  openVerifiedNeighbor,
  renderTraversalStep,
  walkVerifiedMetabolicPath,
} from '../src/index.ts';

function fixture(name: string): unknown {
  return JSON.parse(
    readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'),
  );
}

const crossing = fixture('genesis-signed-crossing.json') as Record<string, unknown>;
const receipt = fixture('genesis-signed-receipt.json') as Record<string, unknown>;
const crossingId = crossing.crossing_id as string;
const receiver = 'particular:genesis-b';

test('verified neighbor can be opened and road evidence is preserved', async () => {
  const step = await openVerifiedNeighbor(
    crossingId,
    receiver,
    [crossing, receipt],
  );

  assert.equal(step.from_subject, crossingId);
  assert.equal(step.to_subject, receiver);
  assert.ok(step.road_observations.length >= 1);
  assert.ok(
    step.road_observations.every(
      (observation) =>
        observation.subject === crossingId
        && observation.evidence_refs?.includes(receiver),
    ),
  );

  const computeDoor = step.to.room.doors.find((door) => door.role === 'COMPUTE');
  assert.equal(computeDoor?.observations.length, 1);
});

test('arbitrary re-centering is rejected as non-neighbor traversal', async () => {
  await assert.rejects(
    () => openVerifiedNeighbor(
      crossingId,
      'particular:not-on-the-road',
      [crossing, receipt],
    ),
    /NON_NEIGHBOR_TRAVERSAL/,
  );
});

test('tampering removes the road instead of preserving stale traversal', async () => {
  const tampered = structuredClone(crossing) as Record<string, unknown>;
  tampered.source_world = 'world:tampered';

  await assert.rejects(
    () => openVerifiedNeighbor(
      crossingId,
      receiver,
      [tampered, receipt],
    ),
    /NON_NEIGHBOR_TRAVERSAL/,
  );
});

test('a verified path preserves ordered road memory', async () => {
  const walk = await walkVerifiedMetabolicPath(
    [crossingId, receiver],
    [crossing, receipt],
  );

  assert.deepEqual(walk.subjects, [crossingId, receiver]);
  assert.equal(walk.steps.length, 1);
  assert.equal(walk.steps[0]?.from_subject, crossingId);
  assert.equal(walk.steps[0]?.to_subject, receiver);
  assert.equal(walk.current.focal_subject, receiver);
});

test('a destination may be sparse without erasing the verified road to it', async () => {
  const step = await openVerifiedNeighbor(
    crossingId,
    'world:beta',
    [crossing, receipt],
  );

  const directCount = step.to.room.doors.reduce(
    (count, door) => count + door.observations.length,
    0,
  );

  assert.equal(directCount, 0);
  assert.ok(step.road_observations.length >= 1);

  const rendered = renderTraversalStep(step);
  assert.match(rendered, /road evidence:/);
  assert.match(rendered, /destination direct observations: 0/);
});

test('empty path is rejected', async () => {
  await assert.rejects(
    () => walkVerifiedMetabolicPath([], [crossing, receipt]),
    /EMPTY_TRAVERSAL_PATH/,
  );
});
