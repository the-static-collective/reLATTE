import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { rconSeedSucceeded } from '../vanilla-worldbuilder-006/server-effect-verifier.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

import {
  FROZEN_CORE_SHA,
  makeObservation,
  makePolyglotHop,
  verifyHopBinding,
} from '../polyglot-crossing-001/common.ts';
import {
  generateP256KeyPair,
  verifyCrossingEnvelope,
  verifyReceipt,
} from '../../src/protocol.ts';

const require = createRequire(import.meta.url);
const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const { Vec3 } = require('vec3');
const minecraftData = require('minecraft-data');
const { Rcon } = require('rcon-client');
const { GoalNear, GoalBlock } = goals;

const HOST = process.env.MC_HOST || '127.0.0.1';
const PORT = Number(process.env.MC_PORT || '25565');
const RCON_PORT = Number(process.env.MC_RCON_PORT || '25575');
const RCON_PASSWORD = process.env.MC_RCON_PASSWORD || 'relatte-ci';
const BOT_NAME = process.env.MC_BOT_NAME || 'RelatteBot';
const META_PATH = process.env.MC_VERSION_META || 'work/minecraft/server-version.json';
const OUTPUT_PATH = process.env.MC_EVIDENCE_OUT || 'work/minecraft/evidence.json';

const PAYLOAD = Buffer.from('RELATTE!', 'utf8');
const MAGIC = Buffer.from('MCV5', 'ascii');
const WIDTH = 30;
const Y = 64;
const WALL_Z = 5;
const QUARRY_Z = -5;
const QUARRY_DEPTH = 32;
const WOOL = [
  'white_wool','orange_wool','magenta_wool','light_blue_wool',
  'yellow_wool','lime_wool','pink_wool','gray_wool',
  'light_gray_wool','cyan_wool','purple_wool','blue_wool',
  'brown_wool','green_wool','red_wool','black_wool',
];

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}
function framePayload(payload) {
  const length = Buffer.from([payload.length]);
  const digest = createHash('sha256').update(payload).digest();
  return Buffer.concat([MAGIC, length, payload, digest]);
}
function toNibbles(frame) {
  const out = [];
  for (const byte of frame) out.push(byte >>> 4, byte & 15);
  return out;
}
function parseFrame(frame) {
  if (!frame.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('VANILLA_MAGIC_MISMATCH');
  const length = frame[MAGIC.length];
  const payload = frame.subarray(MAGIC.length + 1, MAGIC.length + 1 + length);
  const digest = frame.subarray(MAGIC.length + 1 + length);
  if (frame.length !== MAGIC.length + 1 + length + 32) throw new Error('VANILLA_FRAME_LENGTH');
  if (!digest.equals(createHash('sha256').update(payload).digest())) throw new Error('VANILLA_PAYLOAD_DIGEST');
  return Buffer.from(payload);
}
function wallPos(index) {
  return { x: index % WIDTH, y: Y, z: WALL_Z + Math.floor(index / WIDTH) };
}
function quarryPos(nibble, occurrence) {
  return { x: nibble * 2, y: Y, z: QUARRY_Z - occurrence };
}
async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
async function waitForSpawn(bot) {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('BOT_SPAWN_TIMEOUT')), 45000);
    bot.once('spawn', () => { clearTimeout(timer); resolve(); });
    bot.once('error', (error) => { clearTimeout(timer); reject(error); });
    bot.once('kicked', (reason) => { clearTimeout(timer); reject(new Error('BOT_KICKED:' + String(reason))); });
  });
}
async function go(bot, pos, radius) {
  await bot.pathfinder.goto(new GoalNear(pos.x, pos.y, pos.z, radius));
}

async function waitForBlock(bot, pos, expectedName, timeoutMs = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const block = bot.blockAt(new Vec3(pos.x, pos.y, pos.z));
    if (block && block.name === expectedName) return block;
    await sleep(100);
  }
  const finalBlock = bot.blockAt(new Vec3(pos.x, pos.y, pos.z));
  throw new Error(
    'CLIENT_BLOCK_SYNC_TIMEOUT:' + expectedName + ':' +
    pos.x + ',' + pos.y + ',' + pos.z + ':' +
    (finalBlock && finalBlock.name)
  );
}
function inventoryCount(bot, name) {
  return bot.inventory.items()
    .filter((item) => item.name === name)
    .reduce((total, item) => total + item.count, 0);
}
async function waitForInventoryIncrease(bot, name, before) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (inventoryCount(bot, name) > before) return inventoryCount(bot, name);
    await sleep(100);
  }
  throw new Error('ITEM_PICKUP_NOT_OBSERVED:' + name + ':before=' + before + ':after=' + inventoryCount(bot, name));
}

export async function* vanillaStages(payload = PAYLOAD) {
  const meta = JSON.parse(await readFile(META_PATH, 'utf8'));
  const frame = framePayload(payload);
  const nibbles = toNibbles(frame);
  const counts = new Array(16).fill(0);
  for (const nibble of nibbles) counts[nibble] += 1;
  if (Math.max(...counts) > QUARRY_DEPTH) throw new Error('QUARRY_TOO_SHALLOW');

  const rcon = await Rcon.connect({
    host: HOST,
    port: RCON_PORT,
    password: RCON_PASSWORD,
  });
  const prep = [];
  const send = async (command) => {
    const response = await rcon.send(command);
    prep.push({ command, response });
    return response;
  };

  await send('setworldspawn 0 ' + Y + ' 0');
  await send('forceload add -16 -48 48 16');
  await send('gamerule doDaylightCycle false');
  await send('gamerule doWeatherCycle false');
  await send('gamerule doMobSpawning false');
  await send('difficulty peaceful');
  await send('fill -5 63 -40 40 63 12 minecraft:stone');
  await send('fill -5 64 -40 40 70 12 minecraft:air');
  for (let nibble = 0; nibble < 16; nibble += 1) {
    const x = nibble * 2;
    const response = await send('fill ' + x + ' ' + Y + ' ' + (QUARRY_Z - QUARRY_DEPTH + 1) + ' ' + x + ' ' + Y + ' ' + QUARRY_Z + ' minecraft:' + WOOL[nibble]);
    if (/fail|not loaded|outside|unknown/i.test(String(response))) {
      throw new Error('QUARRY_FILL_FAILED:' + nibble + ':' + response);
    }
  }

  for (let nibble = 0; nibble < 16; nibble += 1) {
    const target = quarryPos(nibble, 0);
    const expected = 'minecraft:' + WOOL[nibble];
    const response = await rcon.send(
      'execute if block ' + target.x + ' ' + target.y + ' ' + target.z + ' ' + expected + ' run seed'
    );
    if (!rconSeedSucceeded(response)) {
      throw new Error('QUARRY_PREVERIFY_FAILED:' + nibble + ':' + response);
    }
  }

  const bot = mineflayer.createBot({
    host: HOST,
    port: PORT,
    username: BOT_NAME,
    auth: 'offline',
  });
  bot.loadPlugin(pathfinder);

  try {
    await waitForSpawn(bot);
    const data = minecraftData(bot.version);
    const movements = new Movements(bot, data);
    movements.canDig = false;
    movements.allow1by1towers = false;
    movements.allowParkour = false;
    bot.pathfinder.setMovements(movements);

    await send('tp ' + BOT_NAME + ' 0 ' + Y + ' 0');
    await sleep(1500);

    yield { phase: 'client-connected', bytes: payload, native: { bot: BOT_NAME, version: bot.version, server: meta, preparation: prep } };

    const actions = [];
    const mined = new Array(16).fill(0);

    for (let nibble = 0; nibble < 16; nibble += 1) {
      for (let occurrence = 0; occurrence < counts[nibble]; occurrence += 1) {
        const target = quarryPos(nibble, occurrence);
        await go(bot, target, 1);
        const block = await waitForBlock(bot, target, WOOL[nibble]);
        const inventoryBefore = inventoryCount(bot, block.name);
        await bot.dig(block);

        // Vanilla breaking creates an item entity; breaking is not possession.
        // Move onto the broken cell and require the inventory to actually grow.
        await bot.pathfinder.goto(new GoalBlock(target.x, target.y, target.z));
        const inventoryAfter = await waitForInventoryIncrease(
          bot,
          block.name,
          inventoryBefore,
        );

        mined[nibble] += 1;
        actions.push({
          kind: 'mine-and-collect',
          block: block.name,
          at: target,
          inventory_before: inventoryBefore,
          inventory_after: inventoryAfter,
        });
      }
    }

    for (let nibble = 0; nibble < 16; nibble += 1) {
      if (mined[nibble] !== counts[nibble]) throw new Error('MINED_COUNT_MISMATCH:' + nibble);
    }

    const placed = [];
    for (let index = 0; index < nibbles.length; index += 1) {
      const nibble = nibbles[index];
      const target = wallPos(index);
      const stand = { x: target.x, y: target.y, z: target.z + 1 };
      await bot.pathfinder.goto(new GoalBlock(stand.x, stand.y, stand.z));

      const item = bot.inventory.items().find((candidate) => candidate.name === WOOL[nibble]);
      if (!item) throw new Error('INVENTORY_MISSING:' + WOOL[nibble] + ':' + index);
      await bot.equip(item, 'hand');

      const reference = bot.blockAt(new Vec3(target.x, target.y - 1, target.z));
      if (!reference || reference.name !== 'stone') throw new Error('WALL_REFERENCE_MISSING:' + index);

      const before = bot.blockAt(new Vec3(target.x, target.y, target.z));
      if (before && before.name !== 'air') throw new Error('WALL_TARGET_OCCUPIED:' + index + ':' + before.name);

      await bot._placeBlockWithOptions(
        reference,
        new Vec3(0, 1, 0),
        { swingArm: 'right', forceLook: true },
      );
      await sleep(125);
      const after = bot.blockAt(new Vec3(target.x, target.y, target.z));
      if (!after || after.name !== WOOL[nibble]) throw new Error('PLACEMENT_MISMATCH:' + index + ':' + (after && after.name));
      placed.push(after.name);
      actions.push({ kind: 'place', block: after.name, at: target });
    }

    yield { phase: 'world-mutated', bytes: payload, native: { actions, placed, action_digest: hash(Buffer.from(JSON.stringify(actions))) } };

    const recoveredNibbles = placed.map((name) => {
      const index = WOOL.indexOf(name);
      if (index < 0) throw new Error('UNKNOWN_WALL_BLOCK');
      return index;
    });
    const recoveredFrame = Buffer.alloc(recoveredNibbles.length / 2);
    for (let i = 0; i < recoveredFrame.length; i += 1) {
      recoveredFrame[i] = (recoveredNibbles[i * 2] << 4) | recoveredNibbles[i * 2 + 1];
    }
    const recovered = parseFrame(recoveredFrame);
    if (!recovered.equals(payload)) throw new Error('BOT_RECONSTRUCTION_MISMATCH');

    yield { phase: 'world-observed', bytes: recovered, native: { placed, frame_digest: hash(recoveredFrame) } };

    const serverVerification = [];
    for (let index = 0; index < nibbles.length; index += 1) {
      const target = wallPos(index);
      const expected = 'minecraft:' + WOOL[nibbles[index]];
      const response = await rcon.send(
        'execute if block ' + target.x + ' ' + target.y + ' ' + target.z + ' ' + expected + ' run seed'
      );
      if (!rconSeedSucceeded(response)) {
        throw new Error('SERVER_BLOCK_VERIFY_FAILED:' + index + ':' + response);
      }
      serverVerification.push({ index, at: target, expected, response });
    }
    await rcon.send('save-all flush');

    const actionBytes = Buffer.from(JSON.stringify(actions), 'utf8');
    const wallBytes = Buffer.from(placed.join('\\n'), 'utf8');
    const nativeId =
      'minecraft-vanilla:' + meta.id +
      ':jar:' + meta.server_sha1 +
      ':actions:' + hash(actionBytes) +
      ':wall:' + hash(wallBytes);

    const observation = makeObservation(
      'minecraft-vanilla-server',
      nativeId,
      recovered,
      'application/x-minecraft-vanilla-world-playthrough',
      {
        identity_model: 'official vanilla server world + external protocol-client playthrough',
        minecraft_version: meta.id,
        server_jar_sha1: meta.server_sha1,
        server_jar_url: meta.server_url,
        mineflayer_version: require('mineflayer/package.json').version,
        bot_protocol_version: bot.version,
        quarry_payload_independent: true,
        quarry_palette_size: 16,
        mined_blocks: actions.filter((entry) => entry.kind === 'mine-and-collect').length,
        placed_blocks: placed.length,
        server_verified_blocks: serverVerification.length,
        action_transcript_sha256: hash(actionBytes),
        final_wall_sha256: hash(wallBytes),
        actual_mojang_runtime: true,
        server_mods: [],
      },
    );

    yield { phase: 'server-verified', bytes: recovered, observation, native: { serverVerification, actions, placed, meta, frame_bytes: frame.length, generic_quarry_counts: counts, bot: { username: BOT_NAME, version: bot.version, mineflayer_version: require('mineflayer/package.json').version } } };
  } finally {
    try { bot.quit('experiment complete'); } catch {}
    try { await rcon.send('stop'); } catch {}
    rcon.end();
  }
}

async function main() {
  let result;
  for await (const stage of vanillaStages()) result = stage;
  const hop = await makePolyglotHop({ observation: result.observation,
    signer: await generateP256KeyPair(), receiver: await generateP256KeyPair(),
    parent_crossing_id: null, disposition: 'R3_HOLD', hop_index: 11 });
  verifyHopBinding(hop, PAYLOAD);
  if (!(await verifyCrossingEnvelope(hop.crossing))) throw new Error('VANILLA_CROSSING_INVALID');
  if (!(await verifyReceipt(hop.receipt))) throw new Error('VANILLA_RECEIPT_INVALID');
  const { meta, actions, placed, serverVerification } = result.native;
  const evidence = {
    schema: 'relatte.minecraft-vanilla-005-evidence/v0', frozen_core_sha: FROZEN_CORE_SHA,
    version: meta, payload_utf8: PAYLOAD.toString('utf8'), payload_sha256: hash(PAYLOAD),
    bot: result.native.bot, frame_bytes: result.native.frame_bytes,
    generic_quarry_counts: result.native.generic_quarry_counts,
    action_transcript_sha256: result.observation.native_claims.action_transcript_sha256,
    final_wall_sha256: result.observation.native_claims.final_wall_sha256,
    wool_blocks: placed.length, server_verified_blocks: serverVerification.length,
    actions, server_verification: serverVerification,
    observation: { substrate: result.observation.substrate, native_id: result.observation.native_id,
      content_sha256: result.observation.content_sha256, native_claims: result.observation.native_claims },
    crossing: hop.crossing, receipt: hop.receipt,
    claims: { official_vanilla_server_runtime: 'OBSERVED', real_protocol_client_join: 'OBSERVED',
      in_world_mining: 'OBSERVED', in_world_inventory_use: 'OBSERVED',
      in_world_block_placement: 'OBSERVED', server_side_final_block_verification: 'OBSERVED',
      human_player: 'UNOBSERVED', multiplayer_independent_administration: 'UNOBSERVED' },
  };
  await writeFile(OUTPUT_PATH, JSON.stringify(evidence, null, 2) + '\n');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { process.stderr.write(String(error.stack || error) + '\n'); process.exitCode = 1; });
}
