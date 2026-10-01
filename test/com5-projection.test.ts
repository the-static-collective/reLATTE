import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COM5_ROLES,
  projectCom5,
  renderCom5Trace,
  type Com5Observation,
} from '../src/index.ts';

test('COM5 roles remain in stable metabolic display order', () => {
  assert.deepEqual(COM5_ROLES, [
    'COMPOST',
    'COMPOSE',
    'COMPUTE',
    'COMMUTE',
    'COMMUNE',
  ]);
});

test('one subject may occupy multiple COM5 roles without collapse', () => {
  const observations: Com5Observation[] = [
    {
      role: 'COMPOST',
      subject: 'receipt:R1',
      relation: 'available-as-substrate',
    },
    {
      role: 'COMPOSE',
      subject: 'receipt:R1',
      relation: 'cited-by',
      evidence_refs: ['crossing:T2'],
    },
    {
      role: 'COMMUNE',
      subject: 'receipt:R1',
      relation: 'discussed-in',
      evidence_refs: ['room:alpha'],
    },
  ];

  const projection = projectCom5(observations);

  assert.equal(projection.COMPOST[0]?.subject, 'receipt:R1');
  assert.equal(projection.COMPOSE[0]?.subject, 'receipt:R1');
  assert.equal(projection.COMMUNE[0]?.subject, 'receipt:R1');
  assert.equal(projection.COMPUTE.length, 0);
  assert.equal(projection.COMMUTE.length, 0);
});

test('projection preserves supplied observations without inferring missing roles', () => {
  const projection = projectCom5([
    { role: 'COMMUTE', subject: 'crossing:T1', relation: 'carried-by', note: 'Git mirror' },
  ]);

  assert.equal(projection.COMMUTE.length, 1);
  assert.equal(projection.COMPOST.length, 0);
  assert.equal(projection.COMPOSE.length, 0);
  assert.equal(projection.COMPUTE.length, 0);
  assert.equal(projection.COMMUNE.length, 0);
});

test('renderer exposes divergence without claiming semantic convergence', () => {
  const trace = renderCom5Trace([
    { role: 'COMMUTE', subject: 'crossing:T1', relation: 'arrived-at', evidence_refs: ['world:B', 'world:D'] },
    { role: 'COMPUTE', subject: 'world:B', relation: 'ADMIT', evidence_refs: ['crossing:T1'] },
    { role: 'COMPUTE', subject: 'world:D', relation: 'REFUSE', evidence_refs: ['crossing:T1'] },
  ]);

  assert.match(trace, /COMMUTE/);
  assert.match(trace, /world:B --ADMIT-->/);
  assert.match(trace, /world:D --REFUSE-->/);
  assert.ok(trace.indexOf('COMPOST') < trace.indexOf('COMPOSE'));
  assert.ok(trace.indexOf('COMPOSE') < trace.indexOf('COMPUTE'));
  assert.ok(trace.indexOf('COMPUTE') < trace.indexOf('COMMUTE'));
  assert.ok(trace.indexOf('COMMUTE') < trace.indexOf('COMMUNE'));
});

test('invalid empty observation fields are rejected', () => {
  assert.throws(
    () => projectCom5([{ role: 'COMPOSE', subject: '   ' }]),
    /INVALID_COM5_SUBJECT/,
  );

  assert.throws(
    () => projectCom5([{ role: 'COMMUNE', subject: 'room:A', evidence_refs: [''] }]),
    /INVALID_COM5_EVIDENCE_REF/,
  );
});
