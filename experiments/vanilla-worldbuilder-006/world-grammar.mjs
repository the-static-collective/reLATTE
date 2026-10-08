import { createHash } from 'node:crypto';

export const WORLD_BOUNDS = Object.freeze({
  minX: -48,
  maxX: 48,
  minY: 63,
  maxY: 92,
  minZ: -48,
  maxZ: 48,
});

const PALETTES = [
  {
    name: 'ruin-garden',
    primary: 'minecraft:stone_bricks',
    secondary: 'minecraft:mossy_stone_bricks',
    accent: 'minecraft:copper_block',
    light: 'minecraft:sea_lantern',
    leaf: 'minecraft:oak_leaves',
    log: 'minecraft:oak_log',
    floor: 'minecraft:grass_block',
  },
  {
    name: 'night-observatory',
    primary: 'minecraft:deepslate_tiles',
    secondary: 'minecraft:polished_blackstone_bricks',
    accent: 'minecraft:amethyst_block',
    light: 'minecraft:end_rod',
    leaf: 'minecraft:azalea_leaves',
    log: 'minecraft:stripped_dark_oak_log',
    floor: 'minecraft:stone',
  },
  {
    name: 'white-water',
    primary: 'minecraft:quartz_block',
    secondary: 'minecraft:prismarine',
    accent: 'minecraft:lapis_block',
    light: 'minecraft:glowstone',
    leaf: 'minecraft:birch_leaves',
    log: 'minecraft:birch_log',
    floor: 'minecraft:sandstone',
  },
  {
    name: 'earth-machine',
    primary: 'minecraft:bricks',
    secondary: 'minecraft:mud_bricks',
    accent: 'minecraft:iron_block',
    light: 'minecraft:lantern',
    leaf: 'minecraft:mangrove_leaves',
    log: 'minecraft:mangrove_log',
    floor: 'minecraft:dirt',
  },
];

const DISTRICTS = [
  'garden',
  'archive',
  'observatory',
  'foundry',
  'shrine',
  'orchard',
  'watercourt',
  'monolith',
];

function sha(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function seed32(value) {
  return Number.parseInt(sha(value).slice(0, 8), 16) >>> 0;
}

function rngFrom(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
}

function choose(rand, values) {
  return values[Math.floor(rand() * values.length)];
}

function int(rand, min, max) {
  return min + Math.floor(rand() * (max - min + 1));
}

function fill(x1, y1, z1, x2, y2, z2, block) {
  return { kind: 'fill', from: { x: x1, y: y1, z: z1 }, to: { x: x2, y: y2, z: z2 }, block };
}

function setblock(x, y, z, block) {
  return { kind: 'setblock', at: { x, y, z }, block };
}

function summon(entity, x, y, z) {
  return { kind: 'summon', entity, at: { x, y, z } };
}

function assertPos(pos) {
  if (
    pos.x < WORLD_BOUNDS.minX || pos.x > WORLD_BOUNDS.maxX ||
    pos.y < WORLD_BOUNDS.minY || pos.y > WORLD_BOUNDS.maxY ||
    pos.z < WORLD_BOUNDS.minZ || pos.z > WORLD_BOUNDS.maxZ
  ) throw new Error('WORLDBUILDER_OUT_OF_BOUNDS:' + JSON.stringify(pos));
}

function assertOperation(op) {
  if (op.kind === 'fill') {
    assertPos(op.from);
    assertPos(op.to);
    const dx = Math.abs(op.to.x - op.from.x) + 1;
    const dy = Math.abs(op.to.y - op.from.y) + 1;
    const dz = Math.abs(op.to.z - op.from.z) + 1;
    if (dx * dy * dz > 32768) throw new Error('WORLDBUILDER_FILL_TOO_LARGE');
  } else {
    assertPos(op.at);
  }
}

function addTree(ops, x, z, palette, height) {
  ops.push(fill(x, 64, z, x, 63 + height, z, palette.log));
  ops.push(fill(x - 2, 64 + height, z - 2, x + 2, 65 + height, z + 2, palette.leaf));
  ops.push(fill(x - 1, 66 + height, z - 1, x + 1, 66 + height, z + 1, palette.leaf));
}

function addGarden(ops, cx, cz, palette, rand, anchors) {
  const r = int(rand, 8, 11);
  ops.push(fill(cx - r, 63, cz - r, cx + r, 63, cz + r, palette.floor));
  ops.push(fill(cx - 3, 63, cz - r + 2, cx + 3, 63, cz + r - 2, 'minecraft:water'));
  for (let i = 0; i < 5; i += 1) {
    const x = cx + int(rand, -r + 2, r - 2);
    const z = cz + int(rand, -r + 2, r - 2);
    addTree(ops, x, z, palette, int(rand, 4, 6));
  }
  ops.push(setblock(cx, 64, cz, palette.light));
  anchors.push({ at: { x: cx, y: 64, z: cz }, block: palette.light, role: 'garden-heart' });
}

function addArchive(ops, cx, cz, palette, rand, anchors) {
  const w = int(rand, 7, 10);
  const d = int(rand, 6, 9);
  const h = int(rand, 5, 8);
  ops.push(fill(cx - w, 63, cz - d, cx + w, 63, cz + d, palette.primary));
  ops.push(fill(cx - w, 64, cz - d, cx + w, 63 + h, cz - d, palette.primary));
  ops.push(fill(cx - w, 64, cz + d, cx + w, 63 + h, cz + d, palette.primary));
  ops.push(fill(cx - w, 64, cz - d, cx - w, 63 + h, cz + d, palette.secondary));
  ops.push(fill(cx + w, 64, cz - d, cx + w, 63 + h, cz + d, palette.secondary));
  ops.push(fill(cx - w + 1, 64, cz - d + 1, cx + w - 1, 64, cz + d - 1, 'minecraft:oak_planks'));
  for (let x = cx - w + 2; x <= cx + w - 2; x += 3) {
    ops.push(fill(x, 65, cz - d + 1, x, 67, cz - d + 1, 'minecraft:bookshelf'));
    ops.push(fill(x, 65, cz + d - 1, x, 67, cz + d - 1, 'minecraft:bookshelf'));
  }
  ops.push(setblock(cx, 64, cz - d, 'minecraft:air'));
  ops.push(setblock(cx, 65, cz - d, 'minecraft:air'));
  ops.push(setblock(cx, 64 + h, cz, palette.light));
  anchors.push({ at: { x: cx, y: 64 + h, z: cz }, block: palette.light, role: 'archive-crown' });
}

function addObservatory(ops, cx, cz, palette, rand, anchors) {
  const h = int(rand, 10, 15);
  ops.push(fill(cx - 3, 63, cz - 3, cx + 3, 63, cz + 3, palette.primary));
  ops.push(fill(cx - 2, 64, cz - 2, cx + 2, 63 + h, cz + 2, palette.primary));
  ops.push(fill(cx - 1, 65, cz - 1, cx + 1, 62 + h, cz + 1, 'minecraft:air'));
  ops.push(fill(cx - 4, 63 + h, cz - 4, cx + 4, 63 + h, cz + 4, 'minecraft:glass'));
  ops.push(setblock(cx, 64 + h, cz, palette.accent));
  ops.push(setblock(cx, 65 + h, cz, palette.light));
  anchors.push({ at: { x: cx, y: 65 + h, z: cz }, block: palette.light, role: 'observatory-star' });
}

function addFoundry(ops, cx, cz, palette, rand, anchors) {
  const w = int(rand, 7, 10);
  const d = int(rand, 6, 8);
  ops.push(fill(cx - w, 63, cz - d, cx + w, 63, cz + d, palette.secondary));
  ops.push(fill(cx - w + 1, 64, cz - 1, cx + w - 1, 64, cz + 1, 'minecraft:lava'));
  ops.push(fill(cx - w, 64, cz - d, cx - w, 69, cz + d, palette.primary));
  ops.push(fill(cx + w, 64, cz - d, cx + w, 69, cz + d, palette.primary));
  ops.push(fill(cx - 2, 64, cz - d, cx + 2, 70, cz - d, palette.accent));
  ops.push(fill(cx - 2, 64, cz + d, cx + 2, 70, cz + d, palette.accent));
  ops.push(setblock(cx, 71, cz - d, palette.light));
  anchors.push({ at: { x: cx, y: 71, z: cz - d }, block: palette.light, role: 'foundry-flame' });
}

function addShrine(ops, cx, cz, palette, rand, anchors) {
  const r = int(rand, 6, 9);
  ops.push(fill(cx - r, 63, cz - r, cx + r, 63, cz + r, palette.primary));
  for (const [dx, dz] of [[-r,-r],[r,-r],[-r,r],[r,r]]) {
    ops.push(fill(cx + dx, 64, cz + dz, cx + dx, 70, cz + dz, palette.secondary));
    ops.push(setblock(cx + dx, 71, cz + dz, palette.light));
  }
  ops.push(fill(cx - 1, 64, cz - 1, cx + 1, 66, cz + 1, palette.accent));
  ops.push(setblock(cx, 67, cz, 'minecraft:beacon'));
  anchors.push({ at: { x: cx, y: 67, z: cz }, block: 'minecraft:beacon', role: 'shrine-center' });
}

function addOrchard(ops, cx, cz, palette, rand, anchors) {
  const span = int(rand, 7, 10);
  ops.push(fill(cx - span, 63, cz - span, cx + span, 63, cz + span, palette.floor));
  for (let x = cx - span + 2; x <= cx + span - 2; x += 5) {
    for (let z = cz - span + 2; z <= cz + span - 2; z += 5) {
      addTree(ops, x, z, palette, int(rand, 4, 5));
    }
  }
  ops.push(setblock(cx, 64, cz, palette.light));
  anchors.push({ at: { x: cx, y: 64, z: cz }, block: palette.light, role: 'orchard-lamp' });
}

function addWatercourt(ops, cx, cz, palette, rand, anchors) {
  const r = int(rand, 8, 11);
  ops.push(fill(cx - r, 63, cz - r, cx + r, 63, cz + r, palette.secondary));
  ops.push(fill(cx - r + 2, 64, cz - r + 2, cx + r - 2, 64, cz + r - 2, 'minecraft:water'));
  ops.push(fill(cx - 2, 64, cz - r, cx + 2, 64, cz + r, palette.primary));
  ops.push(fill(cx - r, 64, cz - 2, cx + r, 64, cz + 2, palette.primary));
  ops.push(setblock(cx, 65, cz, palette.light));
  anchors.push({ at: { x: cx, y: 65, z: cz }, block: palette.light, role: 'watercourt-center' });
}

function addMonolith(ops, cx, cz, palette, rand, anchors) {
  const h = int(rand, 14, 22);
  ops.push(fill(cx - 2, 63, cz - 2, cx + 2, 63 + h, cz + 2, palette.primary));
  ops.push(fill(cx - 1, 64, cz - 1, cx + 1, 62 + h, cz + 1, palette.accent));
  ops.push(setblock(cx, 64 + h, cz, palette.light));
  anchors.push({ at: { x: cx, y: 64 + h, z: cz }, block: palette.light, role: 'monolith-crown' });
}

function addDistrict(ops, kind, cx, cz, palette, rand, anchors) {
  if (kind === 'garden') return addGarden(ops, cx, cz, palette, rand, anchors);
  if (kind === 'archive') return addArchive(ops, cx, cz, palette, rand, anchors);
  if (kind === 'observatory') return addObservatory(ops, cx, cz, palette, rand, anchors);
  if (kind === 'foundry') return addFoundry(ops, cx, cz, palette, rand, anchors);
  if (kind === 'shrine') return addShrine(ops, cx, cz, palette, rand, anchors);
  if (kind === 'orchard') return addOrchard(ops, cx, cz, palette, rand, anchors);
  if (kind === 'watercourt') return addWatercourt(ops, cx, cz, palette, rand, anchors);
  return addMonolith(ops, cx, cz, palette, rand, anchors);
}

export function buildWorldPlan({ goal, serverSeed }) {
  if (typeof goal !== 'string' || goal.trim() === '') throw new Error('WORLDBUILDER_GOAL_REQUIRED');
  const seedMaterial = goal + '|server-seed:' + String(serverSeed);
  const seed = seed32(seedMaterial);
  const rand = rngFrom(seed);
  const palette = choose(rand, PALETTES);
  const ops = [];
  const anchors = [];

  // Blank authored plot + neutral ground. Vanilla /fill is capped, so the
  // vertical clear is deliberately sliced into legal 3-layer operations.
  ops.push(fill(-48, 63, -48, 48, 63, 48, 'minecraft:grass_block'));
  for (let y = 64; y <= 92; y += 3) {
    ops.push(fill(-48, y, -48, 48, Math.min(92, y + 2), 48, 'minecraft:air'));
  }

  const roads = [
    fill(-4, 64, -48, 4, 64, 48, palette.primary),
    fill(-48, 64, -4, 48, 64, 4, palette.primary),
  ];
  ops.push(...roads);

  const candidates = [...DISTRICTS];
  const selected = [];
  while (selected.length < 4) {
    const index = Math.floor(rand() * candidates.length);
    selected.push(candidates.splice(index, 1)[0]);
  }

  const centers = [
    { x: -26, z: -26 },
    { x: 26, z: -26 },
    { x: -26, z: 26 },
    { x: 26, z: 26 },
  ];

  selected.forEach((kind, index) => {
    const jitterX = int(rand, -3, 3);
    const jitterZ = int(rand, -3, 3);
    addDistrict(
      ops,
      kind,
      centers[index].x + jitterX,
      centers[index].z + jitterZ,
      palette,
      rand,
      anchors,
    );
  });

  const coreHeight = int(rand, 8, 15);
  ops.push(fill(-2, 65, -2, 2, 64 + coreHeight, 2, palette.accent));
  ops.push(setblock(0, 65 + coreHeight, 0, palette.light));
  anchors.push({ at: { x: 0, y: 65 + coreHeight, z: 0 }, block: palette.light, role: 'world-heart' });

  // Small inhabited signal: passive entities only.
  const animals = ['minecraft:cow', 'minecraft:sheep', 'minecraft:pig'];
  for (let i = 0; i < 3; i += 1) {
    ops.push(summon(choose(rand, animals), int(rand, -8, 8), 65, int(rand, -8, 8)));
  }

  for (const op of ops) assertOperation(op);

  const planBody = {
    schema: 'relatte.vanilla-world-plan/v0',
    goal,
    server_seed: String(serverSeed),
    seed,
    palette,
    districts: selected,
    operations: ops,
    anchors,
  };

  return {
    ...planBody,
    plan_sha256: sha(JSON.stringify(planBody)),
  };
}

export function operationToCommand(op) {
  assertOperation(op);
  if (op.kind === 'fill') {
    return '/fill ' +
      op.from.x + ' ' + op.from.y + ' ' + op.from.z + ' ' +
      op.to.x + ' ' + op.to.y + ' ' + op.to.z + ' ' +
      op.block;
  }
  if (op.kind === 'setblock') {
    return '/setblock ' + op.at.x + ' ' + op.at.y + ' ' + op.at.z + ' ' + op.block;
  }
  if (op.kind === 'summon') {
    return '/summon ' + op.entity + ' ' + op.at.x + ' ' + op.at.y + ' ' + op.at.z;
  }
  throw new Error('WORLDBUILDER_UNKNOWN_OPERATION');
}

export function validateWorldPlan(plan) {
  if (!plan || plan.schema !== 'relatte.vanilla-world-plan/v0') throw new Error('WORLDBUILDER_PLAN_SCHEMA');
  if (!Array.isArray(plan.operations) || plan.operations.length < 10) throw new Error('WORLDBUILDER_PLAN_TOO_SMALL');
  if (!Array.isArray(plan.districts) || plan.districts.length !== 4) throw new Error('WORLDBUILDER_DISTRICTS');
  if (!Array.isArray(plan.anchors) || plan.anchors.length < 5) throw new Error('WORLDBUILDER_ANCHORS');
  for (const op of plan.operations) assertOperation(op);
  const copy = { ...plan };
  delete copy.plan_sha256;
  if (sha(JSON.stringify(copy)) !== plan.plan_sha256) throw new Error('WORLDBUILDER_PLAN_HASH');
  return true;
}
