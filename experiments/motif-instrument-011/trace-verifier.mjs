import {checkGameTrace as checkOriginalMethod} from '../motif-instrument-010/trace-verifier.mjs';
import {SPEC_SCHEMA} from './compose.mjs';
const check=(x,s)=>{if(!x)throw Error('MINECRAFT_011_TRACE_'+s)};
export const RESULT_SCHEMA='relatte.minecraft011.real-hostile-game/v0';
export const BUNDLE_SCHEMA='relatte.minecraft011.signed-game-return/v0';
export function checkHostileTrace(originalInstrument,sideProposal,trace,version){
 check(sideProposal?.schema===SPEC_SCHEMA&&sideProposal.world==='A'&&
   sideProposal.seed==='381654729'&&sideProposal.fault_x===-28 &&
   sideProposal.side_power_position?.x===20&&
   sideProposal.side_power_position?.y===65&&
   sideProposal.side_power_position?.z===47&&
   sideProposal.side_power_position?.block==='minecraft:redstone_block'&&
   sideProposal.disposition==='R3_HOLD'&&sideProposal.physical_effect===false,
   'UNREVIEWED_INTERVENTION');
 check(trace?.hostile_proposal_crossing?.startsWith('relatte-crossing-v0:')&&
   trace.hostile_source?.x===20&&trace.hostile_source?.y===65&&
   trace.hostile_source?.z===47&&
   trace.hostile_source?.block==='minecraft:redstone_block'&&
   trace.hostile_source_block_verified===true &&
   trace.injected_after_fault_before_micro===true &&
   trace.intervention_removed_before_restore===true &&
   trace.intervention_absent_after_restore===true &&
   trace.actual_game_execution===true&&
   trace.real_physical_environment_effect===false,
   'INTERVENTION_NOT_OBSERVED_AND_CLEARED');
 const checked=checkOriginalMethod(originalInstrument,trace,version);
 const bits=trace.states.fault.server.map(x=>x.lit);
 const count=bits.filter(Boolean).length;
 const prefix=bits.every((x,i)=>x===(i<count));
 check(checked.faultCount===count&&
   checked.prefixPatternObserved===prefix,
   'NINE_LAMP_CONTRADICTION_NOT_PRESERVED');
 return {
  ...checked,
  adversarial_instrument_not_truth:true,
  side_power_game_command_observed:true,
  original_micro_method_unsafe_if_nonprefix:!prefix,
  previous_source_not_rewritten:true,
  game_only:true,
  source_conclusion:prefix?'HOLD_FALSIFIER_DID_NOT_BREAK_PREFIX':
    'HOLD_ORIGINAL_MEASUREMENT_METHOD_REFUTED_IN_THIS_GAME',
 };
}
