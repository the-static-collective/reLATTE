import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildVerifiedMetabolicNeighborhood,
  renderVerifiedMetabolicNeighborhood,
} from '../src/index.ts';

function fixture(name: string): unknown {
  return JSON.parse(
    readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'),
  );
}

const crossing = fixture('genesis-signed-crossing.json') as Record<string, unknown>;
const receipt = fixture('genesis-signed-receipt.json') as Record<string, unknown>;
const crossingId = crossing.crossing_id as string;

test('verified crossing + receipt reconstruct a focal COM5 neighborhood', async () => {
  const neighborhood = await buildVerifiedMetabolicNeighborhood(
    crossingId,
    [crossing, receipt],
  );

  assert.equal(neighborhood.accepted_record_count, 2);
  assert.equal(neighborhood.rejected_records.length, 0);

  const compose = neighborhood.room.doors.find((door) => door.role === 'COMPOSE');
  const compute = neighborhood.room.doors.find((door) => door.role === 'COMPUTE');
  const commute = neighborhood.room.doors.find((door) => door.role === 'COMMUTE');
  const commune = neighborhood.room.doors.find((door) => door.role === 'COMMUNE');

  assert.equal(compose?.observations.length, 1);
  assert.equal(compute?.observations.length, 1);
  assert.equal(commute?.observations.length, 1);
  assert.equal(commune?.observations.length, 0);
  assert.ok(neighborhood.neighbor_refs.includes('world:alpha'));
  assert.ok(neighborhood.neighbor_refs.includes('world:beta'));
  assert.ok(neighborhood.neighbor_refs.includes('particular:genesis-a'));
  assert.ok(neighborhood.neighbor_refs.includes('particular:genesis-b'));
});

test('tampered crossing is rejected and its receipt becomes orphaned', async () => {
  const tampered = structuredClone(crossing) as Record<string, unknown>;
  tampered.source_world = 'world:tampered';

  const neighborhood = await buildVerifiedMetabolicNeighborhood(
    crossingId,
    [tampered, receipt],
  );

  assert.equal(neighborhood.accepted_record_count, 0);
  assert.deepEqual(
    neighborhood.rejected_records.map((entry) => entry.reason),
    ['INVALID_SIGNATURE_OR_ID', 'ORPHAN_RECEIPT'],
  );
  assert.equal(neighborhood.observations.length, 0);
});

test('valid receipt cannot manufacture a road without its verified crossing in the cut', async () => {
  const neighborhood = await buildVerifiedMetabolicNeighborhood(
    crossingId,
    [receipt],
  );

  assert.equal(neighborhood.accepted_record_count, 0);
  assert.equal(neighborhood.rejected_records[0]?.reason, 'ORPHAN_RECEIPT');

  const commute = neighborhood.room.doors.find((door) => door.role === 'COMMUTE');
  assert.equal(commute?.observations.length, 0);
});

test('receiver particular gets its own compute view without becoming the crossing', async () => {
  const neighborhood = await buildVerifiedMetabolicNeighborhood(
    'particular:genesis-b',
    [crossing, receipt],
  );

  const compute = neighborhood.room.doors.find((door) => door.role === 'COMPUTE');
  assert.equal(compute?.observations.length, 1);
  assert.equal(compute?.observations[0]?.relation, 'issued-receipt:VERIFIED');
  assert.ok(neighborhood.neighbor_refs.includes(crossingId));
});

test('verified road renderer makes empty doors explicit', async () => {
  const rendered = await renderVerifiedMetabolicNeighborhood(
    crossingId,
    [crossing, receipt],
  );

  assert.match(rendered, /\[COMPOST\]\n  \(no verified direct observation\)/);
  assert.match(rendered, /\[COMMUNE\]\n  \(no verified direct observation\)/);
  assert.match(rendered, /receiver-signed-receipt-at/);
  assert.match(rendered, /accepted records: 2/);
});
