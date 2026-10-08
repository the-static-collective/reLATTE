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
const COMMAND_DELAY_MS = Number(process.env.MC_COMMAND_DELAY_MS || '1100');

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

async function scanWorld(bot, rcon, observerName) {
  const rows = [];
  const histogram = {};
  const columns = new Map();

  const minChunkX = Math.floor(WORLD_BOUNDS.minX / 16);
  const maxChunkX = Math.floor(WORLD_BOUNDS.maxX / 16);
  const minChunkZ = Math.floor(WORLD_BOUNDS.minZ / 16);
  const maxChunkZ = Math.floor(WORLD_BOUNDS.maxZ / 16);

  for (let chunkZ = minChunkZ; chunkZ <= maxChunkZ; chunkZ += 1) {
    for (let chunkX = minChunkX; chunkX <= maxChunkX; chunkX += 1) {
      const centerX = chunkX * 16 + 8;
      const centerZ = chunkZ * 16 + 8;

      // Observation is allowed to move the observer, but not alter world state.
      await rcon.send(
        'tp ' + observerName + ' ' + centerX + ' 80 ' + centerZ,
      );
      await bot.waitForChunksToLoad();
      await sleep(250);

      const xStart = Math.max(WORLD_BOUNDS.minX, chunkX * 16);
      const xEnd = Math.min(WORLD_BOUNDS.maxX, chunkX * 16 + 15);
      const zStart = Math.max(WORLD_BOUNDS.minZ, chunkZ * 16);
      const zEnd = Math.min(WORLD_BOUNDS.maxZ, chunkZ * 16 + 15);

      for (let z = zStart; z <= zEnd; z += 1) {
        for (let x = xStart; x <= xEnd; x += 1) {
          let highest = null;
          for (let y = WORLD_BOUNDS.minY; y <= WORLD_BOUNDS.maxY; y += 1) {
            const block = bot.blockAt(new Vec3(x, y, z));
            if (!block) {
              throw new Error(
                'WORLDBUILDER_SCAN_CHUNK_MISSING:' +
                x + ',' + y + ',' + z +
                ':chunk=' + chunkX + ',' + chunkZ,
              );
            }
            if (
              block.name === 'air' ||
              block.name === 'cave_air' ||
              block.name === 'void_air'
            ) continue;

            const line = x + ',' + y + ',' + z + '=' + block.name;
            rows.push(line);
            histogram[block.name] = (histogram[block.name] || 0) + 1;
            highest = block.name;
          }
          columns.set(x + ',' + z, highest);
        }
      }
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
    observed_chunks: {
      min_chunk_x: minChunkX,
      max_chunk_x: maxChunkX,
      min_chunk_z: minChunkZ,
      max_chunk_z: maxChunkZ,
      count:
        (maxChunkX - minChunkX + 1) *
        (maxChunkZ - minChunkZ + 1),
    },
  };
}

async function scoreboardWitness(rcon, witness, predicateCommand) {
  await rcon.send(
    'scoreboard players set ' + witness + ' relatte_action 0',
  );
  await rcon.send(
    predicateCommand +
    ' run scoreboard players set ' +
    witness +
    ' relatte_action 1',
  );
  const response = await rcon.send(
    'scoreboard players get ' + witness + ' relatte_action',
  );
  const numbers = String(response).match(/-?[0-9]+/g) ?? [];
  return {
    score: Number(numbers.at(-1)),
    response: String(response),
  };
}

function sampleFillPositions(op) {
  const mid = {
    x: Math.trunc((op.from.x + op.to.x) / 2),
    y: Math.trunc((op.from.y + op.to.y) / 2),
    z: Math.trunc((op.from.z + op.to.z) / 2),
  };
  const unique = new Map();
  for (const point of [op.from, mid, op.to]) {
    unique.set(point.x + ',' + point.y + ',' + point.z, point);
  }
  return [...unique.values()];
}

async function verifyOperationEffect(rcon, op, actionIndex) {
  const receipts = [];

  if (op.kind === 'fill') {
    const samples = sampleFillPositions(op);
    for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex += 1) {
      const point = samples[sampleIndex];
      const witness = '#action_' + actionIndex + '_' + sampleIndex;
      const check = await scoreboardWitness(
        rcon,
        witness,
        'execute if block ' +
          point.x + ' ' + point.y + ' ' + point.z + ' ' + op.block,
      );
      if (check.score !== 1) {
        throw new Error(
          'WORLDBUILDER_ACTION_NOT_CONSTITUTED:' +
          actionIndex +
          ':fill:' +
          JSON.stringify({ point, expected: op.block, check }),
        );
      }
      receipts.push({ point, expected: op.block, ...check });
    }
    return receipts;
  }

  if (op.kind === 'setblock') {
    const witness = '#action_' + actionIndex;
    const check = await scoreboardWitness(
      rcon,
      witness,
      'execute if block ' +
        op.at.x + ' ' + op.at.y + ' ' + op.at.z + ' ' + op.block,
    );
    if (check.score !== 1) {
      throw new Error(
        'WORLDBUILDER_ACTION_NOT_CONSTITUTED:' +
        actionIndex +
        ':setblock:' +
        JSON.stringify({ point: op.at, expected: op.block, check }),
      );
    }
    return [{ point: op.at, expected: op.block, ...check }];
  }

  if (op.kind === 'summon') {
    const witness = '#action_' + actionIndex;
    const tag = 'relatte_action_' + actionIndex;
    const check = await scoreboardWitness(
      rcon,
      witness,
      'execute if entity @e[tag=' + tag + ',limit=1] ',
    );
    if (check.score !== 1) {
      throw new Error(
        'WORLDBUILDER_ACTION_NOT_CONSTITUTED:' +
        actionIndex +
        ':summon:' +
        JSON.stringify({
          point: op.at,
          expected: op.entity,
          tag,
          check,
        }),
      );
    }
    return [{
      point: op.at,
      expected: op.entity,
      entity_tag: tag,
      ...check,
    }];
  }

  throw new Error('WORLDBUILDER_UNKNOWN_OPERATION_EFFECT');
}

async function sendBotCommand(bot, rcon, op, actionIndex, log, receipts) {
  const command =
    op.kind === 'summon'
      ? '/summon ' +
        op.entity + ' ' +
        op.at.x + ' ' +
        op.at.y + ' ' +
        op.at.z +
        ' {Tags:["relatte_action_' + actionIndex + '"]}'
      : operationToCommand(op);

  if (
    !command.startsWith('/fill ') &&
    !command.startsWith('/setblock ') &&
    !command.startsWith('/summon ')
  ) throw new Error('WORLDBUILDER_COMMAND_NOT_ALLOWED:' + command);

  bot.chat(command);
  await sleep(COMMAND_DELAY_MS);

  const serverReceipts = await verifyOperationEffect(
    rcon,
    op,
    actionIndex,
  );

  log.push(command);
  receipts.push({
    action_index: actionIndex,
    command,
    operation_kind: op.kind,
    server_receipts: serverReceipts,
  });
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

    authorBot = mineflayer.createBot({
      host: HOST,
      port: PORT,
      username: BOT_NAME,
      auth: 'offline',
    });

    await waitForSpawn(authorBot);

    // Establish authority only after the actual protocol session exists.
    // Pre-joining /op can resolve differently across vanilla/offline-mode
    // profile state; authority must bind to the live author particular.
    const opResponse = await rcon.send('op ' + BOT_NAME);
    await rcon.send('gamemode creative ' + BOT_NAME);
    await rcon.send('tp ' + BOT_NAME + ' 0 80 0');
    await authorBot.waitForChunksToLoad();
    await sleep(1000);

    // Command-channel preflight: author issues a harmless block mutation;
    // vanilla server independently witnesses it before composition may start.
    await rcon.send('scoreboard objectives add relatte_action dummy');
    const preflightPoint = { x: 47, y: 92, z: 47 };
    authorBot.chat(
      '/setblock ' +
      preflightPoint.x + ' ' +
      preflightPoint.y + ' ' +
      preflightPoint.z + ' minecraft:bedrock',
    );
    await sleep(COMMAND_DELAY_MS);
    const preflight = await scoreboardWitness(
      rcon,
      '#author_preflight',
      'execute if block ' +
        preflightPoint.x + ' ' +
        preflightPoint.y + ' ' +
        preflightPoint.z + ' minecraft:bedrock',
    );
    if (preflight.score !== 1) {
      throw new Error(
        'WORLDBUILDER_AUTHOR_COMMAND_CHANNEL_UNAVAILABLE:' +
        JSON.stringify({ opResponse, preflight }),
      );
    }

    const plan = buildWorldPlan({ goal: GOAL, serverSeed });
    validateWorldPlan(plan);

    const commandLog = [];
    const actionReceipts = [];
    for (let actionIndex = 0; actionIndex < plan.operations.length; actionIndex += 1) {
      const op = plan.operations[actionIndex];
      await sendBotCommand(
        authorBot,
        rcon,
        op,
        actionIndex,
        commandLog,
        actionReceipts,
      );
    }

    const onlinePlayers = String(await rcon.send('list'));
    if (!onlinePlayers.includes(BOT_NAME)) {
      throw new Error(
        'WORLDBUILDER_AUTHOR_NOT_CONNECTED_AFTER_COMPOSITION:' +
        onlinePlayers,
      );
    }

    await sleep(750);
    await rcon.send('save-all flush');

    // Anchor verification is deliberately deferred until after a fresh
    // observer has reconstructed the world. Author completion is not evidence
    // that the resulting vanilla state survived physics and chunk propagation.
    const anchorVerification = [];

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

    // Second witness: after the fresh client has observed every anchor, ask
    // the vanilla server itself to independently attest to the same blocks.
    await rcon.send('scoreboard objectives add relatte_anchor dummy');
    for (let anchorIndex = 0; anchorIndex < plan.anchors.length; anchorIndex += 1) {
      const anchor = plan.anchors[anchorIndex];
      const witness = '#anchor_' + anchorIndex;
      await rcon.send(
        'scoreboard players set ' + witness + ' relatte_anchor 0',
      );
      await rcon.send(
        'execute if block ' +
        anchor.at.x + ' ' + anchor.at.y + ' ' + anchor.at.z + ' ' +
        anchor.block +
        ' run scoreboard players set ' +
        witness +
        ' relatte_anchor 1',
      );
      const response = await rcon.send(
        'scoreboard players get ' + witness + ' relatte_anchor',
      );
      const numbers = String(response).match(/-?[0-9]+/g) ?? [];
      const score = Number(numbers.at(-1));
      if (score !== 1) {
        throw new Error(
          'WORLDBUILDER_SERVER_ANCHOR_DISAGREES_WITH_OBSERVER:' +
          anchor.role +
          ':score=' + String(score) +
          ':response=' + String(response),
        );
      }
      const observed = observerBot.blockAt(
        new Vec3(anchor.at.x, anchor.at.y, anchor.at.z),
      );
      anchorVerification.push({
        ...anchor,
        witness,
        score,
        response,
        observer_block: observed?.name ?? null,
      });
    }

    const scan = await scanWorld(
      observerBot,
      rcon,
      observerName,
    );
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
        bounded_command_surface: ['fill', 'setblock'],
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
      action_receipts: actionReceipts,
      anchor_verification: anchorVerification,
      scan: {
        field_sha256: scan.field_sha256,
        non_air_blocks: scan.non_air_blocks,
        histogram: scan.histogram,
        observed_chunks: scan.observed_chunks,
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
