import { createHash } from 'node:crypto';
import {
  buildWorldPlan, operationToCommand, validateWorldPlan, WORLD_BOUNDS,
} from '../vanilla-worldbuilder-006/world-grammar.mjs';

export const RIFF_RAFT_GHOT_COMMIT =
  'a63624f1be6a533f5ab927b1e4e8b1a629f1ba53';
export const RIFF_RAFT_GHOT_DOC =
  'https://github.com/the-static-collective/GHoT/pull/113';
export const RIFF_RAFT_STAGES = Object.freeze([
  'READ_FIELD', 'LAY_BONES', 'CATCH_WATER', 'MAKE_SHADE',
  'MAKE_GROUND', 'SEED_NUCLEUS', 'FEED_FIELD', 'WITNESS_DELTA',
  'ONE_METER_OUTWARD',
]);
const BLOCKS = Object.freeze([
  'minecraft:note_block',
  'minecraft:stone_bricks',
  'minecraft:blue_stained_glass',
  'minecraft:oak_leaves',
  'minecraft:rooted_dirt',
  'minecraft:oak_sapling',
  'minecraft:composter',
  'minecraft:observer',
  'minecraft:amethyst_block',
]);
const BASES = Object.freeze([
  'minecraft:stone_bricks', 'minecraft:stone_bricks',
  'minecraft:stone_bricks', 'minecraft:oak_log',
  'minecraft:dirt', 'minecraft:dirt',
  'minecraft:stone_bricks', 'minecraft:stone_bricks',
  'minecraft:stone_bricks',
]);
const sha = (data) => createHash('sha256').update(data).digest('hex');

function expect(ok, code) {
  if (!ok) throw new Error('RIFF_RAFT_' + code);
}

export function validateGhotProvenance(provenance) {
  expect(provenance && typeof provenance === 'object' &&
    Object.keys(provenance).sort().join('|') === [
      'claims', 'source_commit', 'source_document', 'source_repo',
      'stages', 'witness_class',
    ].sort().join('|'), 'DONOR_FIELDS_CHANGED');
  expect(provenance.source_repo === 'the-static-collective/GHoT' &&
    provenance.source_commit === RIFF_RAFT_GHOT_COMMIT &&
    provenance.source_document === RIFF_RAFT_GHOT_DOC,
    'DONOR_PIN_INVALID');
  expect(provenance.witness_class === 'ghot-simulation-manifest-only',
    'DONOR_FALSE_WITNESS');
  expect(Array.isArray(provenance.stages) &&
    JSON.stringify(provenance.stages) === JSON.stringify(RIFF_RAFT_STAGES),
    'DONOR_STAGES_CHANGED');
  expect(provenance.claims && typeof provenance.claims === 'object' &&
    Object.keys(provenance.claims).sort().join('|') === [
      'actual_minecraft_actions_executed',
      'physical_field_improvement_verified',
      'real_world_actuation',
      'signed_ghot_receipts_ingested',
    ].sort().join('|') &&
    Object.values(provenance.claims).every(x => x === false),
    'DONOR_CLAIM_PROMOTED');
  return true;
}

/**
 * The Riff-Raft Minecraft experience is a WORLD-AUTHORING PROPOSAL, never
 * a re-enactment of actual soil biology or proof that the GHoT Python
 * simulation was executed in the Minecraft runtime.
 *
 * Operations are appended to the existing bounded vanilla worldbuilder plan
 * with nine independent server-checkable anchor blocks.
 * Uses a reserved northern strip; existing districts' anchors stay intact.
 */
export function buildRiffRaftMinecraftPlan({
  goal, serverSeed, provenance,
}) {
  validateGhotProvenance(provenance);
  expect(typeof goal === 'string' && goal.trim() !== '',
    'GOAL_REQUIRED');
  const parent = buildWorldPlan({ goal, serverSeed });
  validateWorldPlan(parent);
  const ops = [...parent.operations];
  const anchors = [...parent.anchors];
  const stations = [];
  // A symbolic copper trace, not a powered redstone circuit.
  ops.push({
    kind: 'fill', from: {x:-44,y:64,z:42},
    to: {x:44,y:64,z:42},
    block: 'minecraft:oxidized_copper',
  });
  for (let index = 0; index < RIFF_RAFT_STAGES.length; index += 1) {
    const x = -40 + index * 10;
    const z = 44;
    ops.push({
      kind:'setblock', at:{x,y:64,z}, block: BASES[index],
    });
    ops.push({
      kind:'setblock', at:{x,y:65,z}, block: BLOCKS[index],
    });
    stations.push({
      sequence: index + 1,
      cue: RIFF_RAFT_STAGES[index],
      at: {x,y:65,z},
      expected_block: BLOCKS[index],
      physical_causality_claimed: false,
      ghot_receipt_attached: false,
    });
    anchors.push({
      at: {x,y:65,z}, block: BLOCKS[index],
      role: 'riff-raft-' + RIFF_RAFT_STAGES[index].toLowerCase().replaceAll('_','-'),
    });
  }
  const body = {
    schema: parent.schema,
    goal: parent.goal,
    server_seed: parent.server_seed,
    seed: parent.seed,
    palette: parent.palette,
    districts: parent.districts,
    operations: ops,
    anchors,
    riff_raft: {
      schema: 'relatte.riff-raft-minecraft-001/v0',
      source_project: provenance.source_repo,
      source_commit: provenance.source_commit,
      source_document: provenance.source_document,
      source_evidence_class: provenance.witness_class,
      source_manifest_sha256: sha(JSON.stringify(provenance)),
      actual_ghot_execution_observed: false,
      actual_minecraft_execution_observed: false,
      stations,
      stage_order: [...RIFF_RAFT_STAGES],
      created_as: 'world-authoring-intent-not-execution',
      world_contact_required: 'fresh-non-op-protocol-observer',
      default_candidate_disposition: 'R3_HOLD',
    },
  };
  const plan = {...body, plan_sha256: sha(JSON.stringify(body))};
  validateWorldPlan(plan);
  const commands = ops.map(operationToCommand);
  expect(commands.every(s => /^\/(?:fill|setblock|summon) /.test(s)),
    'FORBIDDEN_VANILLA_COMMAND');
  expect(stations.length === 9 && anchors.length >= 14,
    'STATIONS_NOT_COMPLETE');
  expect(stations.every(s =>
    s.at.x >= WORLD_BOUNDS.minX && s.at.x <= WORLD_BOUNDS.maxX &&
    s.at.y >= WORLD_BOUNDS.minY && s.at.y <= WORLD_BOUNDS.maxY &&
    s.at.z >= WORLD_BOUNDS.minZ && s.at.z <= WORLD_BOUNDS.maxZ),
    'OUT_OF_BOUNDS');
  return plan;
}
