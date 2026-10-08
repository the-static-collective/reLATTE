import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

import {
  WORLD_BOUNDS,
  buildWorldPlan,
  operationToCommand,
  validateWorldPlan,
} from '../experiments/vanilla-worldbuilder-006/world-grammar.mjs';

const FROZEN_SRC_TREE_SHA = 'c0e4d2c59481e0fb2a4bf4bb294f373907fd2b76';

test('VANILLA-WORLDBUILDER-006: normative reLATTE src tree remains frozen', () => {
  const current = execFileSync('git', ['rev-parse', 'HEAD:src'], {
    encoding: 'utf8',
  }).trim();
  assert.equal(current, FROZEN_SRC_TREE_SHA);
});

test('VANILLA-WORLDBUILDER-006: same goal and server seed replay exactly', () => {
  const one = buildWorldPlan({ goal: 'BUILD A WORLD', serverSeed: '12345' });
  const two = buildWorldPlan({ goal: 'BUILD A WORLD', serverSeed: '12345' });

  assert.deepEqual(one, two);
  assert.equal(validateWorldPlan(one), true);
});

test('VANILLA-WORLDBUILDER-006: different server seeds actually produce different authored plans', () => {
  const hashes = new Set(
    ['1', '2', '3', '4', '5', '6', '7', '8'].map((serverSeed) =>
      buildWorldPlan({ goal: 'BUILD A WORLD', serverSeed }).plan_sha256
    ),
  );

  assert.ok(hashes.size >= 6);
});

test('VANILLA-WORLDBUILDER-006: changing the goal changes the world plan', () => {
  const one = buildWorldPlan({ goal: 'BUILD A WORLD', serverSeed: '777' });
  const two = buildWorldPlan({ goal: 'BUILD A STRANGE QUIET WORLD', serverSeed: '777' });

  assert.notEqual(one.plan_sha256, two.plan_sha256);
});

test('VANILLA-WORLDBUILDER-006: generated command surface is bounded and contains no arbitrary command escape', () => {
  const plan = buildWorldPlan({ goal: 'BUILD A WORLD', serverSeed: '90210' });

  for (const op of plan.operations) {
    const command = operationToCommand(op);
    assert.match(command, /^\/(fill|setblock|summon) /);

    const points =
      op.kind === 'fill'
        ? [op.from, op.to]
        : [op.at];

    for (const point of points) {
      assert.ok(point.x >= WORLD_BOUNDS.minX && point.x <= WORLD_BOUNDS.maxX);
      assert.ok(point.y >= WORLD_BOUNDS.minY && point.y <= WORLD_BOUNDS.maxY);
      assert.ok(point.z >= WORLD_BOUNDS.minZ && point.z <= WORLD_BOUNDS.maxZ);
    }
  }
});

test('VANILLA-WORLDBUILDER-006: a world has multiple distinct districts, anchors, and authored operations', () => {
  const plan = buildWorldPlan({ goal: 'BUILD A WORLD', serverSeed: '314159265' });

  assert.equal(plan.districts.length, 4);
  assert.equal(new Set(plan.districts).size, 4);
  assert.ok(plan.anchors.length >= 5);
  assert.ok(plan.operations.length >= 20);
  assert.ok(plan.palette.name.length > 0);
});

test('VANILLA-WORLDBUILDER-006: fuzzed plans remain valid across many seeds', () => {
  for (let index = 0; index < 64; index += 1) {
    const plan = buildWorldPlan({
      goal: 'BUILD A WORLD',
      serverSeed: 'seed-' + index,
    });
    assert.equal(validateWorldPlan(plan), true);
  }
});
