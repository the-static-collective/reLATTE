/* Minecraft 010 — pure observed-game validator; no RCON, Mineflayer,
 * network or game mutations. Explicitly handles unexpected observations
 * as research HOLD rather than forcing one of the seeded hypotheses.
 */
import {SPEC_SCHEMA} from './compose.mjs';

export const RESULT_SCHEMA='relatte.minecraft-010-live-observation/v0';
export const BUNDLE_SCHEMA='relatte.minecraft-010-signed-result/v0';
const fail=(ok,why)=>{if(!ok)throw Error('MINECRAFT_010_TRACE_'+why)};
const positions=Array.from({length:9},(_,i)=>({x:-40+10*i,y:65,z:46}));
const same=(a,b)=>a?.x===b.x&&a?.y===b.y&&a?.z===b.z;

export function checkGameTrace(state,trace,meta){
  fail(state?.schema===SPEC_SCHEMA&&state.world==='A'&&
    state.world_seed==='381654729'&&state.fault_x===-28&&
    state.threshold===3&&
    state.stage_indexes?.join(',')==='2,3' &&
    state.complete_9_stage_census_mandatory===true &&
    state.game_only===true &&
    state.receiver_disposition==='R3_HOLD','INVALID_SOURCE_INSTRUMENT');
  fail(trace?.schema==='relatte.minecraft-010-game-trace/v0' &&
    trace.world==='A'&&trace.seed==='381654729'&&
    trace.server_seed_observed==='381654729' &&
    trace.fault_x===-28 &&
    trace.instrument_proposal_crossing===trace.experiment_signed_instrument &&
    meta?.id==='26.1.1'&&
    /^[0-9a-f]{40}$/.test(meta.server_sha1??''),
    'UNEXPECTED_WORLD_OR_OFFICIAL_VERSION');
  fail(Array.isArray(trace.stations)&&trace.stations.length===9&&
    trace.stations.every((s,i)=>same(s.at,positions[i])&&typeof s.cue==='string'),
    'STAGE_COORDINATES_UNRECOGNIZED');
  for(const stateName of ['initial','fault','reset','restored']) {
    const rows=trace.states?.[stateName]?.server;
    fail(Array.isArray(rows)&&rows.length===9&&rows.every((v,i)=>
      v.cue===trace.stations[i].cue&&same(v.at,positions[i])&&
      typeof v.lit==='boolean'),
      'INCOMPLETE_SERVER_CENSUS_'+stateName);
  }
  fail(trace.states.initial.server.every(r=>!r.lit) &&
    trace.states.reset.server.every(r=>!r.lit),
    'UNPOWERED_CIRCUIT_NOT_VERIFIED');
  fail(trace.states.restored.server.every(r=>r.lit),
    'NINE_LAMP_RESTORATION_NOT_VERIFIED');
  for(const label of ['fault','restored']){
    const reference=trace.states[label].server;
    const viewer=trace.states[label].fresh_nonop;
    fail(viewer?.operator===false &&
      viewer.independent_new_connection===true &&
      Array.isArray(viewer.rows)&&viewer.rows.length===9 &&
      reference.every((r,i)=>viewer.rows[i].lit===r.lit &&
        viewer.rows[i].name==='redstone_lamp' &&
        viewer.rows[i].cue===r.cue &&
        same(viewer.rows[i].at,positions[i])),
      'FRESH_NONOP_DISAGREES_'+label);
  }
  fail(trace.states.fault.fresh_nonop.username !==
    trace.states.restored.fresh_nonop.username,'DUPLICATE_FRESH_OBSERVER');
  fail(trace.author_disconnect_before_fresh_witness===true &&
    trace.nonoperator_chunk_keeper_is_distinct===true &&
    trace.actual_game_execution===true &&
    trace.real_physical_environment_effect===false &&
    trace.receiver_disposition==='R3_HOLD' &&
    (trace.owner_admission===false ||
      trace.source_owner_admission===false) &&
    trace.owner_admission!==true &&
    trace.source_owner_admission!==true,
    'GAME_AUTHORITY_OR_EXECUTION_CLAIM');

  const micro=trace.micro_readout;
  fail(micro?.sampled_before_full_census===true &&
    Array.isArray(micro.stages)&&micro.stages.length===2 &&
    micro.stages.map(x=>x.index).join(',')==='2,3' &&
    micro.stages.every(s=>s.position&&same(s.position,positions[s.index])&&
      typeof s.lit==='boolean'&&
      trace.states.fault.server[s.index].lit===s.lit&&
      trace.states.fault.fresh_nonop.rows[s.index].lit===s.lit),
    'MICRO_SENSOR_REFUTED_BY_FULL_CENSUS');
  const rows=trace.states.fault.server;
  const total=rows.filter(x=>x.lit).length;
  fail(trace.observed_fault_count===total &&
    trace.micro_prediction_gte3===micro.stages[0].lit &&
    trace.observed_fault_class_gte3===(total>=3),
    'GAME_RESULT_COUNTS_FORGED');
  const prefix=rows.every((r,i)=>r.lit===(i<total));
  const observedMatch=total===2||total===3;
  const inferredCount=micro.stages[0].lit?3:2;
  const microCorrect=total===inferredCount;
  const status=!prefix?'HOLD_PREFIX_ASSUMPTION_REFUTED':
    !observedMatch||!microCorrect?'HOLD_OUT_OF_MODEL_GAME_OBSERVATION':
    'GAME_MICRO_INSTRUMENT_CONFIRMED_BY_NINE_LAMP_AUDIT';
  return {
    faultCount:total,
    microDiscriminatorLit:micro.stages[0].lit,
    microSentinelLit:micro.stages[1].lit,
    inferredCount,
    prefixPatternObserved:prefix,
    microCountMatchesNineLampAudit:microCorrect,
    status,
    provisionalClassification:total>=3?'GE_3':'LT_3',
    hypothesis_selected_only_if_in_model:status==='GAME_MICRO_INSTRUMENT_CONFIRMED_BY_NINE_LAMP_AUDIT'?
      (total===2?'position-invariant-prefix':'world-local-hidden-relay'):null,
    gaming_only:true,
    no_authority:true,
  };
}
