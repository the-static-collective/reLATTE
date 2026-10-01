import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCom5Room,
  renderCom5Room,
  type Com5Observation,
} from '../src/index.ts';

const observations: Com5Observation[] = [
  {
    role: 'COMPOST',
    subject: 'artifact:A',
    relation: 'available-as-substrate',
  },
  {
    role: 'COMPOSE',
    subject: 'artifact:A',
    relation: 'parent-of',
  },
  {
    role: 'COMMUTE',
    subject: 'artifact:A',
    relation: 'carried-by-git',
  },
  {
    role: 'COMMUNE',
    subject: 'room:R',
    relation: 'hosts',
    evidence_refs: ['artifact:A'],
  },
];

test('five-door room preserves canonical COM5 door order', () => {
  const room = buildCom5Room('artifact:A', observations);

  assert.deepEqual(
    room.doors.map((door) => door.role),
    ['COMPOST', 'COMPOSE', 'COMPUTE', 'COMMUTE', 'COMMUNE'],
  );
});

test('room includes only exact focal-subject observations', () => {
  const room = buildCom5Room('artifact:A', observations);

  assert.equal(room.doors[0]?.observations.length, 1);
  assert.equal(room.doors[1]?.observations.length, 1);
  assert.equal(room.doors[2]?.observations.length, 0);
  assert.equal(room.doors[3]?.observations.length, 1);
  assert.equal(room.doors[4]?.observations.length, 0);
  assert.equal(room.unrelated_observation_count, 1);
});

test('evidence reference does not silently become room membership', () => {
  const room = buildCom5Room('artifact:A', observations);
  const commune = room.doors.find((door) => door.role === 'COMMUNE');

  assert.equal(commune?.observations.length, 0);
});

test('one focal subject may appear behind several doors', () => {
  const room = buildCom5Room('artifact:A', observations);
  const occupied = room.doors
    .filter((door) => door.observations.length > 0)
    .map((door) => door.role);

  assert.deepEqual(occupied, ['COMPOST', 'COMPOSE', 'COMMUTE']);
});

test('renderer preserves empty doors as absence of observation', () => {
  const rendered = renderCom5Room('artifact:A', observations);

  assert.match(rendered, /\[COMPUTE\]\n  \(no direct observation\)/);
  assert.match(rendered, /\[COMMUNE\]\n  \(no direct observation\)/);
  assert.match(rendered, /outside focal subject: 1 observation\(s\)/);
});

test('blank focal subject is rejected', () => {
  assert.throws(
    () => buildCom5Room('   ', observations),
    /INVALID_COM5_FOCAL_SUBJECT/,
  );
});
