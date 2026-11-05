/* Pure game-blockstate verifier; independent signed-return runner does not
 * import Mineflayer, RCON, network sockets or any actuator from execute.mjs.
 */
import {SCHEMA as PROPOSAL_SCHEMA} from '../motif-instrument-008/compose.mjs';
const error=(yes,why)=>{if(!yes)throw Error('MOTIF_MC009_'+why)};
const fixedSeed='918273645';

export function checkGameTrace(state,trace,meta) {
  error(state?.schema===PROPOSAL_SCHEMA &&
    state.target_world==='B' && state.target_world_seed===fixedSeed &&
    state.new_fault_repeater?.x===-13 &&
    state.new_fault_repeater.y===66 &&
    state.new_fault_repeater.z===46,'UNKNOWN_INSTRUMENT');
  error(trace?.schema==='relatte.minecraft-009-game-trace/v0'&&
    trace.world==='B'&&trace.seed===fixedSeed&&trace.fault_x===-13,
    'WRONG_GAME_WORLD_OR_FAULT');
  error(trace?.server_seed_observed===fixedSeed&&
    meta?.id==='26.1.1'&&/^[0-9a-f]{40}$/.test(meta.server_sha1??''),
    'GAME_VERSION_OR_SEED_NOT_VERIFIED');
  const ids=['initial','fault','reset','restored'];
  for(const kind of ids){
    const states=trace?.states?.[kind]?.server;
    error(Array.isArray(states)&&states.length===9 &&
      states.every((row,i)=>row.cue===trace.stations[i].cue &&
        row.at.x===trace.stations[i].at.x &&
        typeof row.lit==='boolean'),
      'BAD_OR_MISSING_SERVER_STATE:'+kind);
  }
  for(const label of ['initial','reset'])
    error(trace.states[label].server.every(x=>!x.lit),
      'CIRCUIT_NOT_OFF:'+label);
  error(trace.states.restored.server.every(x=>x.lit),
    'CIRCUIT_NOT_RESTORED');
  const witness=trace.states.fault.fresh_nonop;
  error(witness?.operator===false && witness.independent_new_connection===true &&
    Array.isArray(witness.rows)&&witness.rows.length===9 &&
    trace.states.fault.server.every((s,i)=>{
      const o=witness.rows[i];
      return o.cue===s.cue&&o.at.x===s.at.x&&
        o.name==='redstone_lamp'&&o.lit===s.lit;
    }),'INDEPENDENT_FAULT_OBSERVER_DISAGREES');
  const repair=trace.states.restored.fresh_nonop;
  error(repair?.operator===false && repair.independent_new_connection===true &&
    repair.username!==witness.username &&
    repair.rows?.length===9&&repair.rows.every(x=>x.name==='redstone_lamp'&&x.lit),
    'INDEPENDENT_RESTORED_OBSERVER_DISAGREES');
  const faultCount=trace.states.fault.server.filter(x=>x.lit).length;
  error(trace.observed_fault_count===faultCount &&
    trace.observed_fault_class_gte4===(faultCount>=4),
    'FALSIFIED_FAULT_COUNT_OR_CLASS');
  error(trace.author_disconnect_before_fresh_witness===true &&
    trace.proposed_threshold===4&&
    trace.actual_game_execution===true&&
    trace.real_physical_environment_effect===false,
    'AUTHORITY_OR_ACTION_CLAIM');
  return {faultCount,classification:faultCount>=4?'GE_4':'LT_4'};
}

