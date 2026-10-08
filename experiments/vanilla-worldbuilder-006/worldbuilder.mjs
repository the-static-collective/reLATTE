import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

import { buildWorldPlan, operationToCommand, validateWorldPlan, WORLD_BOUNDS } from './world-grammar.mjs';
import { FROZEN_CORE_SHA } from '../polyglot-crossing-001/common.ts';
import { generateP256KeyPair } from '../../src/protocol.ts';
import {
  finalizeCompositionInstance,
  makeCompositionInstanceSpec,
  openCompositionInstance,
} from '../composition-instance-001/contract.ts';

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

    const instanceSpec = makeCompositionInstanceSpec({
      runtime_id: 'minecraft-vanilla-26.1.1',
      base_snapshot_ref:
        'minecraft-server:sha1:' + meta.server_sha1 + ':seed:' + String(serverSeed),
      goal: GOAL,
      capabilities: [
        'minecraft.operator',
        'minecraft.creative',
        'minecraft.command.fill',
        'minecraft.command.setblock',
        'minecraft.command.summon',
      ],
      limits: {
        world_bounds: WORLD_BOUNDS,
        command_surface: ['fill', 'setblock', 'summon'],
        network: 'localhost-only',
        runtime: 'official-unmodified-mojang-server',
      },
      observer_mode: 'fresh-non-op-protocol-client',
      requested_output_class: 'minecraft-authored-world-state',
      normative_src_tree: 'c0e4d2c59481e0fb2a4bf4bb294f373907fd2b76',
      extensions: {
        minecraft_version: meta.id,
        server_jar_sha1: meta.server_sha1,
        fixed_blueprint: false,
        generative_grammar: true,
      },
    });

    const openedInstance = await openCompositionInstance({
      spec: instanceSpec,
      signer: await generateP256KeyPair(),
      receiver: await generateP256KeyPair(),
      hop_index: 12,
    });

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

    const observerName = 'WorldObserver';
    observerBot = mineflayer.createBot({
      host: HOST,
      port: PORT,
      username: observerName,
      auth: 'offline',
    });
    await waitForSpawn(observerBot);
    await rcon.send('tp ' + observerName + ' 0 80 0');
    await observerBot.waitForChunksToLoad();
    await sleep(1500);

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

    const actionTraceSha256 = sha(Buffer.from(JSON.stringify(commandLog), 'utf8'));
    const authorSessionId =
      'minecraft-session:author:' + BOT_NAME + ':' + authorProtocolVersion;
    const observerSessionId =
      'minecraft-session:observer:' + observerName + ':' + observerBot.version;

    const finalizedInstance = await finalizeCompositionInstance({
      opened: openedInstance,
      spec: instanceSpec,
      runtime_evidence: {
        runtime_id: instanceSpec.runtime_id,
        author_session_id: authorSessionId,
        observer_session_id: observerSessionId,
        observed_state_ref: 'sha256:' + scan.field_sha256,
        observed_state_sha256: scan.field_sha256,
        action_trace_ref: 'sha256:' + actionTraceSha256,
        claims: {
          identity_model: 'official vanilla server + bounded composition instance',
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
          author_was_op: true,
          observer_was_op: false,
          fixed_blueprint: false,
          generative_grammar: true,
          bounded_command_surface: ['fill', 'setblock', 'summon'],
        },
      },
      candidate_bytes: worldDescriptor,
      signer: await generateP256KeyPair(),
      receiver: await generateP256KeyPair(),
      hop_index: 13,
    });

    const hop = finalizedInstance.candidate;
    const observation = hop.observation;

    const evidence = {
      schema: 'relatte.vanilla-worldbuilder-006-evidence/v0',
      frozen_core_sha: FROZEN_CORE_SHA,
      goal: GOAL,
      version: meta,
      server_seed: String(serverSeed),
      bot: {
        username: BOT_NAME,
        version: authorProtocolVersion,
        mineflayer_version: require('mineflayer/package.json').version,
        author_protocol_version: authorProtocolVersion,
        observer_protocol_version: observerBot.version,
        operator: true,
        gamemode: 'creative',
        fresh_observer_username: observerName,
        fresh_observer_operator: false,
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
      composition_instance: {
        spec: instanceSpec,
        instance_id: openedInstance.instance_id,
        launch_crossing: openedInstance.launch.crossing,
        launch_receipt: openedInstance.launch.receipt,
        result: finalizedInstance.result,
        candidate_crossing: finalizedInstance.candidate.crossing,
        candidate_receipt: finalizedInstance.candidate.receipt,
      },
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
        composition_instance_admitted: 'OBSERVED',
        candidate_forced_to_hold: 'OBSERVED',
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
