import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

import { generateP256KeyPair } from '../../src/protocol.ts';
import {
  finalizeCompositionInstance,
  makeCompositionInstanceSpec,
  openCompositionInstance,
} from './contract.ts';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

const META_PATH =
  process.env.MC_VERSION_META ?? 'work/composition-instance/server-version.json';
const OUT_DIR =
  process.env.COMPOSITION_INSTANCE_OUT_DIR ?? 'work/composition-instance';
const RUNTIME_EVIDENCE =
  process.env.RUNTIME_EVIDENCE_OUT ??
  OUT_DIR + '/runtime-evidence.json';
const RUNTIME_MAP =
  process.env.RUNTIME_MAP_OUT ??
  OUT_DIR + '/runtime-world-map.txt';
const COMPOSITION_EVIDENCE =
  process.env.COMPOSITION_EVIDENCE_OUT ??
  OUT_DIR + '/composition-evidence.json';

const GOAL = process.env.MC_WORLD_GOAL ?? 'BUILD A WORLD';
const PROVISIONED_SEED =
  process.env.MC_LEVEL_SEED ?? '381654729';

function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

function parseSeedResponse(response) {
  const text = String(response);
  const bracket = text.match(/\[(-?[0-9]+)\]/);
  if (bracket) return bracket[1];
  const bare = text.match(/-?[0-9]{2,}/);
  if (bare) return bare[0];
  return text.trim();
}

function worldCandidate(runtimeEvidence) {
  const body = {
    schema: 'relatte.composition-candidate.minecraft-world/v0',
    goal: runtimeEvidence.goal,
    minecraft_version: runtimeEvidence.version.id,
    server_seed: runtimeEvidence.server_seed,
    plan_sha256: runtimeEvidence.plan.plan_sha256,
    observed_field_sha256: runtimeEvidence.scan.field_sha256,
    non_air_blocks: runtimeEvidence.scan.non_air_blocks,
    histogram: runtimeEvidence.scan.histogram,
    districts: runtimeEvidence.plan.districts,
    anchors: runtimeEvidence.plan.anchors,
  };
  return Buffer.from(JSON.stringify(body), 'utf8');
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const meta = JSON.parse(await readFile(META_PATH, 'utf8'));
  const serverSeed = String(PROVISIONED_SEED);

  const spec = makeCompositionInstanceSpec({
    runtime_id: 'minecraft-vanilla-worldbuilder-006',
    base_snapshot_ref:
      'minecraft-vanilla:' +
      meta.id +
      ':jar-sha1:' +
      meta.server_sha1 +
      ':seed:' +
      serverSeed,
    goal: GOAL,
    capabilities: [
      'minecraft.operator',
      'minecraft.creative',
      'minecraft.command.fill',
      'minecraft.command.setblock',
    ],
    limits: {
      runtime: 'official-unmodified-mojang-server',
      network: 'localhost-only',
      command_surface: ['fill', 'setblock'],
      world_bounds: {
        min_x: -48,
        max_x: 48,
        min_y: 63,
        max_y: 92,
        min_z: -48,
        max_z: 48,
      },
    },
    observer_mode: 'fresh-non-op-protocol-client',
    requested_output_class: 'minecraft-authored-world-state',
    normative_src_tree:
      'c0e4d2c59481e0fb2a4bf4bb294f373907fd2b76',
    extensions: {
      minecraft_version: meta.id,
      server_jar_sha1: meta.server_sha1,
      runtime_specimen: 'VANILLA-WORLDBUILDER-006',
      runtime_contract: 'black-box',
    },
  });

  const opened = await openCompositionInstance({
    spec,
    signer: await generateP256KeyPair(),
    receiver: await generateP256KeyPair(),
    hop_index: 40,
  });

  const childEnv = {
    ...process.env,
    MC_VERSION_META: META_PATH,
    MC_EVIDENCE_OUT: RUNTIME_EVIDENCE,
    MC_MAP_OUT: RUNTIME_MAP,
    MC_WORLD_GOAL: GOAL,
  };

  const child = await execFileAsync(
    process.execPath,
    [
      '--experimental-strip-types',
      'experiments/vanilla-worldbuilder-006/worldbuilder.mjs',
    ],
    {
      env: childEnv,
      maxBuffer: 20 * 1024 * 1024,
    },
  );

  process.stdout.write(child.stdout);
  process.stderr.write(child.stderr);

  const runtimeEvidence = JSON.parse(
    await readFile(RUNTIME_EVIDENCE, 'utf8'),
  );

  if (String(runtimeEvidence.server_seed) !== serverSeed) {
    throw new Error('COMPOSITION_RUNTIME_SEED_MISMATCH');
  }

  if (
    runtimeEvidence.claims?.official_vanilla_server_runtime !== 'OBSERVED' ||
    runtimeEvidence.claims?.fresh_non_op_client_scanned_final_region !==
      'OBSERVED' ||
    runtimeEvidence.claims
      ?.author_and_observer_are_distinct_client_sessions !== 'OBSERVED'
  ) throw new Error('COMPOSITION_RUNTIME_EVIDENCE_INSUFFICIENT');

  if (
    runtimeEvidence.version?.id !== meta.id ||
    runtimeEvidence.version?.server_sha1 !== meta.server_sha1
  ) throw new Error('COMPOSITION_RUNTIME_SNAPSHOT_MISMATCH');

  const candidateBytes = worldCandidate(runtimeEvidence);
  const actionTraceBytes = Buffer.from(
    JSON.stringify(runtimeEvidence.command_log),
    'utf8',
  );

  const authorSessionId =
    'minecraft-session:author:' +
    runtimeEvidence.bot.username +
    ':' +
    runtimeEvidence.bot.author_protocol_version;

  const observerSessionId =
    'minecraft-session:observer:' +
    runtimeEvidence.bot.fresh_observer_username +
    ':' +
    runtimeEvidence.bot.observer_protocol_version;

  const finalized = await finalizeCompositionInstance({
    opened,
    spec,
    runtime_evidence: {
      runtime_id: spec.runtime_id,
      author_session_id: authorSessionId,
      observer_session_id: observerSessionId,
      observed_state_ref:
        'sha256:' + runtimeEvidence.scan.field_sha256,
      observed_state_sha256:
        runtimeEvidence.scan.field_sha256,
      action_trace_ref:
        'sha256:' + sha256Hex(actionTraceBytes),
      claims: {
        official_vanilla_server_runtime: 'OBSERVED',
        minecraft_version: runtimeEvidence.version.id,
        server_jar_sha1: runtimeEvidence.version.server_sha1,
        bot_operator_privilege: 'OBSERVED',
        bounded_autonomous_world_plan: 'OBSERVED',
        server_verified_anchor_blocks: 'OBSERVED',
        fresh_non_op_client_scanned_final_region: 'OBSERVED',
        authored_world_field_sha256:
          runtimeEvidence.scan.field_sha256,
        plan_sha256: runtimeEvidence.plan.plan_sha256,
        non_air_blocks: runtimeEvidence.scan.non_air_blocks,
        palette: runtimeEvidence.plan.palette.name,
        districts: runtimeEvidence.plan.districts,
      },
    },
    candidate_bytes: candidateBytes,
    signer: await generateP256KeyPair(),
    receiver: await generateP256KeyPair(),
    hop_index: 41,
  });

  if (opened.launch.receipt.kind !== 'R3_ADMIT') {
    throw new Error('COMPOSITION_INSTANCE_LAUNCH_NOT_ADMITTED');
  }
  if (finalized.candidate.receipt.kind !== 'R3_HOLD') {
    throw new Error('COMPOSITION_CANDIDATE_NOT_HELD');
  }
  if (
    finalized.candidate.crossing.parents?.[0] !==
    opened.launch.crossing.crossing_id
  ) throw new Error('COMPOSITION_PARENT_BINDING_MISMATCH');

  const evidence = {
    schema: 'relatte.composition-instance-001-evidence/v0',
    spec,
    instance_id: opened.instance_id,
    launch: {
      crossing: opened.launch.crossing,
      receipt: opened.launch.receipt,
    },
    runtime: {
      evidence_path: RUNTIME_EVIDENCE,
      world_map_path: RUNTIME_MAP,
      goal: runtimeEvidence.goal,
      plan_sha256: runtimeEvidence.plan.plan_sha256,
      observed_field_sha256:
        runtimeEvidence.scan.field_sha256,
      non_air_blocks: runtimeEvidence.scan.non_air_blocks,
      author_session_id: authorSessionId,
      observer_session_id: observerSessionId,
      claims: runtimeEvidence.claims,
    },
    result: finalized.result,
    candidate: {
      content_sha256: sha256Hex(candidateBytes),
      crossing: finalized.candidate.crossing,
      receipt: finalized.candidate.receipt,
    },
    laws: [
      'INSTANCE ADMISSION != RESULT ADMISSION',
      'EXECUTION != ADMISSION',
      'AUTHOR != OBSERVER',
      'PLAN != OBSERVED STATE',
      'COMPOSITION != SELF-ADMISSION',
      'SNAPSHOT != FREEZE',
    ],
  };

  await writeFile(
    COMPOSITION_EVIDENCE,
    JSON.stringify(evidence, null, 2) + '\n',
  );

  process.stdout.write(
    JSON.stringify(
      {
        instance_id: opened.instance_id,
        runtime: spec.runtime_id,
        goal: spec.goal,
        launch_disposition: opened.launch.receipt.kind,
        plan_sha256: runtimeEvidence.plan.plan_sha256,
        observed_field_sha256:
          runtimeEvidence.scan.field_sha256,
        non_air_blocks: runtimeEvidence.scan.non_air_blocks,
        author_session_id: authorSessionId,
        observer_session_id: observerSessionId,
        candidate_disposition:
          finalized.candidate.receipt.kind,
        launch_crossing_id:
          opened.launch.crossing.crossing_id,
        candidate_crossing_id:
          finalized.candidate.crossing.crossing_id,
        candidate_receipt_id:
          finalized.candidate.receipt.receipt_id,
      },
      null,
      2,
    ) + '\n',
  );
}

main().catch((error) => {
  process.stderr.write(String(error?.stack ?? error) + '\n');
  process.exitCode = 1;
});
