import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

import { buildWorldPlan, operationToCommand, validateWorldPlan, WORLD_BOUNDS } from './world-grammar.mjs';
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
const { Vec3 } = require('vec3');
const { Rcon } = require('rcon-client');

const HOST = process.env.MC_HOST || '127.0.0.1';
const PORT = Number(process.env.MC_PORT || '25565');
const RCON_PORT = Number(process.env.MC_RCON_PORT || '25575');
const RCON_PASSWORD = process.env.MC_RCON_PASSWORD || 'relatte-ci';
const BOT_NAME = process.env.MC_BOT_NAME || 'WorldBuilder';
const GOAL = process.env.MC_WORLD_GOAL || 'BUILD A WORLD';
const META_PATH = process.env.MC_VERSION_META || 'work/worldbuilder/server-version.json';
const OUTPUT_PATH = process.env.MC_EVIDENCE_OUT || 'work/worldbuilder/evidence.json';
const MAP_PATH = process.env.MC_MAP_OUT || 'work/worldbuilder/world-map.txt';

function sha(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForSpawn(bot) {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WORLDBUILDER_SPAWN_TIMEOUT')), 45000);
    bot.once('spawn', () => {
      clearTimeout(timer);
      resolve();
    });
    bot.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    bot.once('kicked', (reason) => {
      clearTimeout(timer);
      reject(new Error('WORLDBUILDER_KICKED:' + String(reason)));
    });
  });
}

function parseSeedResponse(response) {
  const text = String(response);
  const bracket = text.match(/\[(-?[0-9]+)\]/);
  if (bracket) return bracket[1];
  const bare = text.match(/-?[0-9]{2,}/);
  if (bare) return bare[0];
  return text.trim();
}

function symbolFor(blockName) {
  if (!blockName || blockName === 'air' || blockName === 'cave_air' || blockName === 'void_air') return ' ';
  if (blockName === 'grass_block') return '.';
  if (blockName.includes('water')) return '~';
  if (blockName.includes('lava')) return '^';
  if (blockName.includes('leaves')) return '*';
  if (blockName.includes('log') || blockName.includes('stem') || blockName.includes('hyphae')) return '|';
  if (blockName.includes('glass')) return 'o';
  if (blockName.includes('bookshelf')) return 'B';
  if (blockName.includes('beacon')) return '@';
  if (
    blockName.includes('lantern') ||
    blockName.includes('glowstone') ||
    blockName.includes('sea_lantern') ||
    blockName.includes('end_rod')
  ) return '+';
  return '#';
}

async function waitForObserverAnchors(bot, anchors, timeoutMs = 15000) {
  const started = Date.now();
  let last = [];

  while (Date.now() - started < timeoutMs) {
    last = anchors.map((anchor) => {
      const block = bot.blockAt(
        new Vec3(anchor.at.x, anchor.at.y, anchor.at.z),
      );
      return {
        role: anchor.role,
        expected: anchor.block.replace(/^minecraft:/, ''),
        observed: block?.name ?? null,
      };
    });

    if (
      last.every((entry) => entry.observed === entry.expected)
    ) return last;

    await sleep(250);
  }

  throw new Error(
    'WORLDBUILDER_OBSERVER_SYNC_TIMEOUT:' + JSON.stringify(last),
  );
}

function scanWorld(bot) {
  const rows = [];
  const histogram = {};
  const columns = new Map();

  for (let z = WORLD_BOUNDS.minZ; z <= WORLD_BOUNDS.maxZ; z += 1) {
    for (let x = WORLD_BOUNDS.minX; x <= WORLD_BOUNDS.maxX; x += 1) {
      let highest = null;
      for (let y = WORLD_BOUNDS.minY; y <= WORLD_BOUNDS.maxY; y += 1) {
        const block = bot.blockAt(new Vec3(x, y, z));
        if (!block) throw new Error('WORLDBUILDER_SCAN_CHUNK_MISSING:' + x + ',' + y + ',' + z);
        if (block.name === 'air' || block.name === 'cave_air' || block.name === 'void_air') continue;
        const line = x + ',' + y + ',' + z + '=' + block.name;
        rows.push(line);
        histogram[block.name] = (histogram[block.name] || 0) + 1;
        highest = block.name;
      }
      columns.set(x + ',' + z, highest);
    }
  }

  const map = [];
  for (let z = WORLD_BOUNDS.minZ; z <= WORLD_BOUNDS.maxZ; z += 1) {
    let line = '';
    for (let x = WORLD_BOUNDS.minX; x <= WORLD_BOUNDS.maxX; x += 1) {
      line += symbolFor(columns.get(x + ',' + z));
    }
    map.push(line);
  }

  rows.sort();
  const fieldBytes = Buffer.from(rows.join('\n') + '\n', 'utf8');
  return {
    fieldBytes,
    field_sha256: sha(fieldBytes),
    non_air_blocks: rows.length,
    histogram,
    top_down: map.join('\n') + '\n',
  };
}

async function sendBotCommand(bot, command, log) {
  if (
    !command.startsWith('/fill ') &&
    !command.startsWith('/setblock ') &&
    !command.startsWith('/summon ')
  ) throw new Error('WORLDBUILDER_COMMAND_NOT_ALLOWED:' + command);

  bot.chat(command);
  log.push(command);
  await sleep(70);
}

async function main() {
  const meta = JSON.parse(await readFile(META_PATH, 'utf8'));
  const rcon = await Rcon.connect({
    host: HOST,
    port: RCON_PORT,
    password: RCON_PASSWORD,
  });

  let authorBot;
  let observerBot;
  try {
    const seedResponse = await rcon.send('seed');
    const serverSeed = parseSeedResponse(seedResponse);

    await rcon.send('gamerule doDaylightCycle false');
    await rcon.send('gamerule doWeatherCycle false');
    await rcon.send('gamerule doMobSpawning false');
    await rcon.send('difficulty peaceful');
    await rcon.send('time set day');
    await rcon.send('weather clear');
    await rcon.send('op ' + BOT_NAME);

    authorBot = mineflayer.createBot({
      host: HOST,
      port: PORT,
      username: BOT_NAME,
      auth: 'offline',
    });

    await waitForSpawn(authorBot);
    await rcon.send('gamemode creative ' + BOT_NAME);
    await rcon.send('tp ' + BOT_NAME + ' 0 80 0');
    await authorBot.waitForChunksToLoad();
    await sleep(1000);

    const plan = buildWorldPlan({ goal: GOAL, serverSeed });
    validateWorldPlan(plan);

    const commandLog = [];
    for (const op of plan.operations) {
      await sendBotCommand(authorBot, operationToCommand(op), commandLog);
    }

    await sleep(2500);
    await rcon.send('save-all flush');

    const anchorVerification = [];
    for (const anchor of plan.anchors) {
      const command =
        'execute if block ' +
        anchor.at.x + ' ' + anchor.at.y + ' ' + anchor.at.z + ' ' +
        anchor.block + ' run seed';
      const response = await rcon.send(command);
      if (/fail|unknown|not found/i.test(String(response))) {
        throw new Error('WORLDBUILDER_ANCHOR_FAILED:' + anchor.role + ':' + response);
      }
      anchorVerification.push({ ...anchor, response });
    }

    // Do not trust the author client's own cached world view. Disconnect it,
    // then reconstruct observed reality from a fresh, non-OP client.
    const authorProtocolVersion = authorBot.version;
    authorBot.quit('authorship complete');
    authorBot = undefined;
    await rcon.send('deop ' + BOT_NAME);
    await sleep(500);

    await rcon.send('setworldspawn 0 80 0');
    const observerAttempts = [];
    let observerName = null;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const candidateName = 'WorldObserver' + attempt;
      const candidate = mineflayer.createBot({
        host: HOST,
        port: PORT,
        username: candidateName,
        auth: 'offline',
      });

      try {
        await waitForSpawn(candidate);
        await rcon.send('tp ' + candidateName + ' 0 80 0');
        await candidate.waitForChunksToLoad();
        const anchorsSeen = await waitForObserverAnchors(
          candidate,
          plan.anchors,
        );

        observerAttempts.push({
          attempt,
          username: candidateName,
          result: 'CONVERGED',
          anchors: anchorsSeen,
        });
        observerBot = candidate;
        observerName = candidateName;
        break;
      } catch (error) {
        observerAttempts.push({
          attempt,
          username: candidateName,
          result: 'FAILED',
          error: String(error?.message ?? error),
        });
        try { candidate.quit('observer retry'); } catch {}
        await sleep(500);
      }
    }

    if (!observerBot || !observerName) {
      throw new Error(
        'WORLDBUILDER_NO_OBSERVER_CONVERGED:' +
        JSON.stringify(observerAttempts),
      );
    }

    const scan = scanWorld(observerBot);
    if (scan.non_air_blocks === 0) {
      throw new Error('WORLDBUILDER_FRESH_OBSERVER_SAW_EMPTY_WORLD');
    }
    await writeFile(MAP_PATH, scan.top_down);

    const worldDescriptor = Buffer.from(JSON.stringify({
      schema: 'relatte.vanilla-authored-world/v0',
      goal: GOAL,
      server_seed: String(serverSeed),
      plan_sha256: plan.plan_sha256,
      field_sha256: scan.field_sha256,
      non_air_blocks: scan.non_air_blocks,
      histogram: scan.histogram,
      anchors: plan.anchors,
    }), 'utf8');

    const observation = makeObservation(
      'minecraft-vanilla-authored-world',
      'minecraft-vanilla-authored-world:' +
        meta.id +
        ':plan:' + plan.plan_sha256 +
        ':field:' + scan.field_sha256,
      worldDescriptor,
      'application/x-minecraft-vanilla-authored-world',
      {
        identity_model: 'official vanilla server + autonomous bounded operator-authored region',
        minecraft_version: meta.id,
        server_jar_sha1: meta.server_sha1,
        goal: GOAL,
        server_seed: String(serverSeed),
        plan_sha256: plan.plan_sha256,
        field_sha256: scan.field_sha256,
        palette: plan.palette.name,
        districts: plan.districts,
        operation_count: plan.operations.length,
        command_count: commandLog.length,
        anchor_count: plan.anchors.length,
        non_air_blocks: scan.non_air_blocks,
        actual_mojang_runtime: true,
        bot_was_op: true,
        fixed_blueprint: false,
        generative_grammar: true,
        bounded_command_surface: ['fill', 'setblock', 'summon'],
      },
    );

    const hop = await makePolyglotHop({
      observation,
      signer: await generateP256KeyPair(),
      receiver: await generateP256KeyPair(),
      parent_crossing_id: null,
      disposition: 'R3_HOLD',
      hop_index: 12,
    });
    verifyHopBinding(hop, worldDescriptor);
    if (!(await verifyCrossingEnvelope(hop.crossing))) throw new Error('WORLDBUILDER_CROSSING_INVALID');
    if (!(await verifyReceipt(hop.receipt))) throw new Error('WORLDBUILDER_RECEIPT_INVALID');

    const evidence = {
      schema: 'relatte.vanilla-worldbuilder-006-evidence/v0',
      frozen_core_sha: FROZEN_CORE_SHA,
      goal: GOAL,
      version: meta,
      server_seed: String(serverSeed),
      bot: {
        username: BOT_NAME,
        version: bot.version,
        mineflayer_version: require('mineflayer/package.json').version,
        author_protocol_version: authorProtocolVersion,
        observer_protocol_version: observerBot.version,
        operator: true,
        gamemode: 'creative',
        fresh_observer_username: observerName,
        fresh_observer_operator: false,
        observer_attempts: observerAttempts,
      },
      plan,
      command_log: commandLog,
      anchor_verification: anchorVerification,
      scan: {
        field_sha256: scan.field_sha256,
        non_air_blocks: scan.non_air_blocks,
        histogram: scan.histogram,
      },
      top_down_map: scan.top_down,
      observation: {
        substrate: observation.substrate,
        native_id: observation.native_id,
        content_sha256: observation.content_sha256,
        byte_length: observation.byte_length,
        native_claims: observation.native_claims,
      },
      crossing: hop.crossing,
      receipt: hop.receipt,
      claims: {
        official_vanilla_server_runtime: 'OBSERVED',
        external_protocol_client: 'OBSERVED',
        bot_operator_privilege: 'OBSERVED',
        bounded_autonomous_world_plan: 'OBSERVED',
        bot_issued_world_commands: 'OBSERVED',
        server_verified_anchor_blocks: 'OBSERVED',
        fresh_non_op_client_scanned_final_region: 'OBSERVED',
        author_and_observer_are_distinct_client_sessions: 'OBSERVED',
        observer_failure_does_not_imply_world_absence: 'OBSERVED',
        authored_world_crossed_relatte: 'OBSERVED',
        human_blueprint: 'REFUTED_FOR_EXACT_COORDINATE_PLAN',
        open_ended_general_intelligence: 'UNOBSERVED',
        human_aesthetic_judgment: 'UNOBSERVED',
      },
    };

    await writeFile(OUTPUT_PATH, JSON.stringify(evidence, null, 2) + '\n');

    process.stdout.write(JSON.stringify({
      goal: GOAL,
      minecraft_version: meta.id,
      palette: plan.palette.name,
      districts: plan.districts,
      plan_sha256: plan.plan_sha256,
      field_sha256: scan.field_sha256,
      operations: plan.operations.length,
      anchors: plan.anchors.length,
      non_air_blocks: scan.non_air_blocks,
      crossing_id: hop.crossing.crossing_id,
      receipt_id: hop.receipt.receipt_id,
    }, null, 2) + '\n');
    process.stdout.write('\nTOP-DOWN WORLD MAP\n' + scan.top_down + '\n');
  } finally {
    if (authorBot) {
      try { authorBot.quit('world complete'); } catch {}
    }
    if (observerBot) {
      try { observerBot.quit('observation complete'); } catch {}
    }
    try { await rcon.send('stop'); } catch {}
    rcon.end();
  }
}

main().catch((error) => {
  process.stderr.write(String(error && (error.stack || error)) + '\n');
  process.exitCode = 1;
});
