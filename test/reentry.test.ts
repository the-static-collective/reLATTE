import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  renderReentryWitness,
  walkVerifiedReentryPath,
} from '../src/index.ts';

function fixture(name: string): unknown {
  return JSON.parse(
    readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'),
  );
}

const crossing = fixture('genesis-signed-crossing.json') as Record<string, unknown>;
const receipt = fixture('genesis-signed-receipt.json');
const crossingId = crossing.crossing_id as string;
const receiver = 'particular:genesis-b';

test('A -> B -> A creates a re-entry witness for the same subject', async () => {
  const walk = await walkVerifiedReentryPath(
    [crossingId, receiver, crossingId],
    [crossing, receipt],
  );

  assert.equal(walk.encounters.length, 3);
  assert.equal(walk.reentries.length, 1);

  const witness = walk.reentries[0]!;
  assert.equal(witness.subject, crossingId);
  assert.equal(witness.first_encounter_index, 0);
  assert.equal(witness.reentry_encounter_index, 2);
  assert.equal(witness.occurrence_number, 2);
  assert.deepEqual(witness.intervening_subjects, [receiver]);
  assert.equal(witness.return_step.from_subject, receiver);
  assert.equal(witness.return_step.to_subject, crossingId);
});

test('re-entry changes encounter position without claiming subject mutation', async () => {
  const walk = await walkVerifiedReentryPath(
    [crossingId, receiver, crossingId],
    [crossing, receipt],
  );

  const first = walk.encounters[0]!;
  const returned = walk.encounters[2]!;

  assert.equal(first.subject, returned.subject);
  assert.equal(first.is_reentry, false);
  assert.equal(returned.is_reentry, true);
  assert.equal(first.encounter_index, 0);
  assert.equal(returned.encounter_index, 2);
  assert.equal(returned.occurrence_number, 2);

  // Both encounters are derived against the same fixed history cut.
  assert.deepEqual(walk.steps[0]?.from.room, walk.current.room);
});

test('non-repeating path creates no re-entry witness', async () => {
  const walk = await walkVerifiedReentryPath(
    [crossingId, receiver],
    [crossing, receipt],
  );

  assert.equal(walk.reentries.length, 0);
  assert.equal(walk.current_encounter.is_reentry, false);
});

test('multiple returns increment occurrence number deterministically', async () => {
  const walk = await walkVerifiedReentryPath(
    [crossingId, receiver, crossingId, receiver, crossingId],
    [crossing, receipt],
  );

  const crossingEncounters = walk.encounters.filter(
    (encounter) => encounter.subject === crossingId,
  );

  assert.deepEqual(
    crossingEncounters.map((encounter) => encounter.occurrence_number),
    [1, 2, 3],
  );
  assert.equal(walk.reentries.filter((entry) => entry.subject === crossingId).length, 2);
});

test('rendered witness states the non-mutation boundary', async () => {
  const walk = await walkVerifiedReentryPath(
    [crossingId, receiver, crossingId],
    [crossing, receipt],
  );

  const rendered = renderReentryWitness(walk.reentries[0]!);

  assert.match(rendered, /same subject: yes/);
  assert.match(rendered, /same encounter position: no/);
  assert.match(rendered, /underlying subject mutation claimed: no/);
  assert.match(rendered, /return road:/);
});
