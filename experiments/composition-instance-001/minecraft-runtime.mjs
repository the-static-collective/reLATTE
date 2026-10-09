import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

import { generateP256KeyPair } from '../../src/protocol.ts';
import {GHOT_004_COMMIT,validateQuest} from '../riff-raft-minecraft-004/quest-grammar.mjs';
import {GHOT_005_COMMIT,validateCounterfactualQuest} from '../riff-raft-minecraft-005/counterfactual-grammar.mjs';
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
const RIFF_RAFT_MODE = process.env.MC_RIFF_RAFT_PLAN === '1';
const RIFF_REDSTONE_MODE = process.env.MC_RIFF_RAFT_REDSTONE === '1';
const DYNAMIC_QUEST_MODE = process.env.MC_RIFF_RAFT_DYNAMIC_QUEST === '1';
const COUNTERFACTUAL_MODE = process.env.MC_RIFF_RAFT_COUNTERFACTUAL === '1';
if(COUNTERFACTUAL_MODE && !DYNAMIC_QUEST_MODE){
  throw Error('COUNTERFACTUAL_REQUIRES_OPERATOR_SELECTED_GAME_MODE');
}
if(DYNAMIC_QUEST_MODE && (!RIFF_REDSTONE_MODE ||
  process.env.MC_RIFF_RAFT_REDSTONE_FAULT !== '1' ||
  !process.env.MC_RIFF_RAFT_QUEST_PATH)){
  throw Error('RIFF_RAFT_QUEST_NOT_OPERATOR_SELECTED');
}
if (RIFF_REDSTONE_MODE && !RIFF_RAFT_MODE) {
  throw new Error('RIFF_RAFT_REDSTONE_NO_PARENT_MODE');
}
const TWO_WORLD_LABEL=process.env.MC_RIFF_RAFT_WORLD_ID;
if(TWO_WORLD_LABEL && (!['A','B'].includes(TWO_WORLD_LABEL) || !RIFF_REDSTONE_MODE ||
    process.env.MC_RIFF_RAFT_REDSTONE_FAULT !== '1')){
  throw Error('RIFF_RAFT_TWO_WORLD_REQUIRES_EXPLICIT_FAULT_AND_LABEL');
}
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
    ...(runtimeEvidence.plan.riff_raft
      ? {riff_raft: runtimeEvidence.plan.riff_raft}
      : {}),
    ...(runtimeEvidence.redstone
      ? {redstone_execution: {
          circuit_plan_sha256:runtimeEvidence.redstone.circuit_plan_sha256,
          initial:runtimeEvidence.redstone.original_unpowered_states,
          fault:runtimeEvidence.redstone.broken_link_trial,
          reset:runtimeEvidence.redstone.reset_states,
          powered:runtimeEvidence.redstone.powered_states,
          fresh_observer:runtimeEvidence.redstone.final_observer,
          ...(runtimeEvidence.redstone.dynamic_quest
            ? {dynamic_quest:runtimeEvidence.redstone.dynamic_quest} : {}),
          physical_field_improvement_verified:false,
        }} : {}),
  };
  return Buffer.from(JSON.stringify(body), 'utf8');
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const meta = JSON.parse(await readFile(META_PATH, 'utf8'));
  const serverSeed = String(PROVISIONED_SEED);
  const quest=DYNAMIC_QUEST_MODE?(COUNTERFACTUAL_MODE
    ? validateCounterfactualQuest : validateQuest)(
    JSON.parse(await readFile(process.env.MC_RIFF_RAFT_QUEST_PATH,'utf8')),
    TWO_WORLD_LABEL,serverSeed):null;

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
      ...(RIFF_RAFT_MODE ? ['minecraft.riff-raft.terraformer'] : []),
      ...(RIFF_REDSTONE_MODE ? ['minecraft.riff-raft.redstone-causality'] : []),
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
      ...(RIFF_RAFT_MODE ? {
        riff_raft_mode: 'opt-in-nine-station-voxel-rehearsal',
        riff_raft_source_commit: 'a63624f1be6a533f5ab927b1e4e8b1a629f1ba53',
        physical_world_claim: false,
      } : {}),
      ...(RIFF_REDSTONE_MODE ? {
        riff_raft_redstone_mode:'operator-triggered-game-only',
        fault_control:process.env.MC_RIFF_RAFT_REDSTONE_FAULT === '1',
        independent_fresh_observer_required:true,
      } : {}),
      ...(TWO_WORLD_LABEL ? {
        riff_raft_two_world_label:TWO_WORLD_LABEL,
        riff_raft_two_world_replay:true,
      } : {}),
      ...(quest ? {
        riff_raft_dynamic_quest:COUNTERFACTUAL_MODE?'observed-counterfactual-game-only':'explicit-gHot-proposal-game-only',
        riff_raft_quest_sha256:quest.quest_sha256,
        riff_raft_quest_priority:COUNTERFACTUAL_MODE?quest.policy:quest.priority,
        riff_raft_ghot_proposer_commit:COUNTERFACTUAL_MODE?GHOT_005_COMMIT:GHOT_004_COMMIT,
      } : {}),
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

  if (RIFF_RAFT_MODE) {
    const riff = runtimeEvidence.plan.riff_raft;
    if (riff?.source_commit !==
          'a63624f1be6a533f5ab927b1e4e8b1a629f1ba53' ||
        riff.stations?.length !== 9 ||
        riff.default_candidate_disposition !== 'R3_HOLD' ||
        riff.actual_ghot_execution_observed !== false ||
        riff.actual_minecraft_execution_observed !== false) {
      throw new Error('RIFF_RAFT_RUNTIME_PLAN_PROVENANCE_INVALID');
    }
    const receiptByRole = new Map(
      runtimeEvidence.anchor_verification.map(item => [item.role, item]),
    );
    for (const station of riff.stations) {
      const role = 'riff-raft-' +
        station.cue.toLowerCase().replaceAll('_', '-');
      const receipt = receiptByRole.get(role);
      if (receipt?.score !== 1 ||
          receipt.observer_block !== station.expected_block.replace(/^minecraft:/, '')) {
        throw new Error('RIFF_RAFT_STATION_NOT_OBSERVED:' + station.cue);
      }
    }
  } else if (runtimeEvidence.plan.riff_raft) {
    throw new Error('RIFF_RAFT_UNDECLARED_RUNTIME_VARIANT');
  }

  if (RIFF_REDSTONE_MODE) {
    const trace=runtimeEvidence.redstone;
    const circuit=runtimeEvidence.plan.riff_raft_redstone;
    if (!trace || !circuit ||
        trace.schema !== 'relatte.riff-raft-redstone-execution/v0' ||
        trace.circuit_plan_sha256 !== runtimeEvidence.plan.plan_sha256 ||
        trace.source_ghot_commit !==
          'a63624f1be6a533f5ab927b1e4e8b1a629f1ba53' ||
        trace.physical_field_improvement_verified !== false ||
        trace.ghot_resource_moved !== false ||
        trace.redstone_circuit_actuated_in_game !== true ||
        trace.original_unpowered_states?.length !== 9 ||
        trace.powered_states?.length !== 9 ||
        !trace.original_unpowered_states.every(x=>x.lit===false) ||
        !trace.powered_states.every(x=>x.lit===true) ||
        trace.final_observer?.stages?.length !== 9 ||
        trace.final_observer?.independent_fresh_client !== true ||
        trace.final_observer?.physical_field_evidence !== false ||
        trace.final_observer?.observer === runtimeEvidence.bot.username ||
        trace.final_observer?.observer !==
          runtimeEvidence.bot.fresh_observer_username ||
        !trace.final_observer.stages.every(x =>
          x.observer_name === 'redstone_lamp' &&
          x.observer_properties?.lit === true && x.server_lit === true) ||
        trace.final_observer.observed_state_sha256 !==
          sha256Hex(Buffer.from(JSON.stringify(trace.final_observer.stages)))) {
      throw new Error('RIFF_RAFT_REDSTONE_CROSSING_EVIDENCE_INVALID');
    }
    if (process.env.MC_RIFF_RAFT_REDSTONE_FAULT === '1' &&
      (trace.broken_link_trial?.length !== 9 ||
       trace.reset_states?.length !== 9 ||
       !trace.broken_link_trial.every((x,i) => x.lit === (quest ? quest.expected_lit_during_fault[i] : i<3)) ||
       !trace.reset_states.every(x=>x.lit === false))) {
      throw new Error('RIFF_RAFT_REDSTONE_FAULT_CONTROL_INVALID');
    }
  } else if (runtimeEvidence.redstone) {
    throw new Error('RIFF_RAFT_REDSTONE_UNDECLARED_EVIDENCE');
  }
  if(quest){
    const actual=runtimeEvidence.redstone?.dynamic_quest;
    if(!actual || JSON.stringify(actual.proposal)!==JSON.stringify(quest) ||
      actual.source_ghot_proposer_commit!==(COUNTERFACTUAL_MODE?GHOT_005_COMMIT:GHOT_004_COMMIT) ||
      JSON.stringify(actual.selected_fault_position)!==
        JSON.stringify(quest.fault_repeater_position) ||
      actual.actual_game_fault_observed!==true ||
      actual.physical_ecological_effect!==false ||
      actual.automatic_authority!==false){
      throw Error('RIFF_RAFT_DYNAMIC_QUEST_EXECUTION_NOT_WITNESSED');
    }
  }else if(runtimeEvidence.redstone?.dynamic_quest){
    throw Error('RIFF_RAFT_UNDECLARED_DYNAMIC_QUEST');
  }

  // Type-only voxel scans omit block properties such as redstone_lamp.lit.
  // Bind the observed-state ID to BOTH block types and the fresh, non-OP
  // client-verified powered states so a lamp bit change changes identity.
  const observedStateSha256=RIFF_REDSTONE_MODE
    ? sha256Hex(Buffer.from(JSON.stringify({
        vanilla_block_field_sha256:runtimeEvidence.scan.field_sha256,
        independently_observed_redstone_state_sha256:
          runtimeEvidence.redstone.final_observer.observed_state_sha256,
      })))
    : runtimeEvidence.scan.field_sha256;

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
        'sha256:' + observedStateSha256,
      observed_state_sha256:
        observedStateSha256,
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
        ...(RIFF_REDSTONE_MODE ? {
          riff_raft_redstone_causality_in_vanilla:'OBSERVED',
          riff_raft_redstone_fault_control:runtimeEvidence.redstone.broken_link_trial
            ? 'OBSERVED' : 'NOT_ATTEMPTED',
          riff_raft_fresh_observer_state_sha256:
            runtimeEvidence.redstone.final_observer.observed_state_sha256,
          riff_raft_game_and_field_conflation:false,
          ...(quest ? {
            riff_raft_dynamic_quest_sha256:quest.quest_sha256,
            riff_raft_dynamic_quest_priority:COUNTERFACTUAL_MODE?quest.policy:quest.priority,
            riff_raft_dynamic_broken_lamps:
              runtimeEvidence.redstone.broken_link_trial.filter(x=>x.lit).length,
            riff_raft_dynamic_source_ghot_commit:COUNTERFACTUAL_MODE?GHOT_005_COMMIT:GHOT_004_COMMIT,
          } : {}),
        } : {}),
        palette: runtimeEvidence.plan.palette.name,
        districts: runtimeEvidence.plan.districts,
        ...(RIFF_RAFT_MODE ? {
          riff_raft_minecraft_stations_observed: 'OBSERVED_IN_MINECRAFT_ONLY',
          real_soil_fertility_verified: false,
          living_ecosystem_terraforming_verified: false,
          ghot_python_simulation_executed_here: false,
        } : {}),
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
      observed_state_sha256: observedStateSha256,
      ...(RIFF_REDSTONE_MODE ? {
        redstone_observed_sha256:
          runtimeEvidence.redstone.final_observer.observed_state_sha256,
        redstone_server_powered_count:runtimeEvidence.redstone.powered_states.filter(x=>x.lit).length,
        redstone_fault_control:runtimeEvidence.redstone.broken_link_trial !== null,
      } : {}),
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
        observed_state_sha256:observedStateSha256,
        ...(RIFF_REDSTONE_MODE ? {
          redstone_observed_sha256:
            runtimeEvidence.redstone.final_observer.observed_state_sha256,
        } : {}),
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
