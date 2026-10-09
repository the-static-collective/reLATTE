import {createHash} from 'node:crypto';

export const GHOT_004_COMMIT='f611c388c9c81d701d09019337cb459ac6b0e984';
export const QUEST_SCHEMA='ghot.riff-raft-terraform-quest/v0';
export const RETURN_SCHEMA='ghot.riff-raft-dynamic-return/v0';
export const BUNDLE_SCHEMA='ghot.riff-raft-dynamic-return-bundle/v0';
const SOURCE='a63624f1be6a533f5ab927b1e4e8b1a629f1ba53';
const STAGES=[
  'READ_FIELD','LAY_BONES','CATCH_WATER','MAKE_SHADE','MAKE_GROUND',
  'SEED_NUCLEUS','FEED_FIELD','WITNESS_DELTA','ONE_METER_OUTWARD'];
const FIELDS=['schema','source_project','source_donor_commit','mode','world_id','world_seed',
  'selection','priority','question','intervention','fault_repeater_position',
  'expected_lit_during_fault','expected_lit_initial','expected_lit_reset',
  'expected_lit_repaired','station_labels','sandbox','operator_must_select',
  'simulator_can_trigger','game_execution_observed','actual_soil_change_verified',
  'ghot_resource_transfer','owner_admission','authority_effect','quest_sha256'];
const SPEC={
  A:{seed:'381654729',priority:'rain-retention',fault:-13,count:3,
    question:'What persists when the water-stage link withdraws?'},
  B:{seed:'918273645',priority:'biomass-return',fault:17,count:6,
    question:'What persists when the biomass-stage link withdraws?'},
};
const compact=x=>JSON.stringify(sortKeys(x));
function sortKeys(x){
  if(Array.isArray(x))return x.map(sortKeys);
  if(x!==null&&typeof x==='object')return Object.fromEntries(
    Object.keys(x).sort().map(k=>[k,sortKeys(x[k])]));
  return x;
}
export const questDigest=q=>createHash('sha256').update(compact(
  Object.fromEntries(Object.entries(q).filter(([k])=>k!=='quest_sha256')))).digest('hex');
const demand=(c,m)=>{if(!c)throw Error('RIFF_RAFT_QUEST_'+m);};
const equality=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function validateQuest(q,worldId,seed){
  demand(q&&typeof q==='object'&&!Array.isArray(q),'NOT_OBJECT');
  demand(equality(Object.keys(q).sort(),FIELDS.slice().sort()),'FIELDS_CHANGED');
  demand(q.schema===QUEST_SCHEMA&&q.mode==='synthetic-game-proposal-only'&&
    q.source_project==='the-static-collective/GHoT'&&
    q.source_donor_commit===SOURCE,'PROVENANCE_CHANGED');
  const plan=SPEC[worldId];
  demand(!!plan&&q.world_id===worldId&&q.world_seed===String(seed)&&
    q.world_seed===plan.seed&&q.priority===plan.priority,
    'WORLD_OR_PRIORITY_CHANGED');
  demand(q.selection==='explicit-scenario-proposal'&&
    q.question===plan.question&&
    q.intervention==='remove-one-redstone-repeater-then-restore'&&
    equality(q.fault_repeater_position,{x:plan.fault,y:66,z:46}),
    'INTERVENTION_CHANGED');
  demand(equality(q.expected_lit_during_fault,STAGES.map((_,i)=>i<plan.count))&&
    equality(q.expected_lit_initial,STAGES.map(()=>false))&&
    equality(q.expected_lit_reset,STAGES.map(()=>false))&&
    equality(q.expected_lit_repaired,STAGES.map(()=>true))&&
    equality(q.station_labels,STAGES),'OUTCOME_CHANGED');
  demand(q.sandbox==='official-vanilla-minecraft-localhost'&&
    q.operator_must_select===true&&q.simulator_can_trigger===false&&
    q.game_execution_observed===false&&q.actual_soil_change_verified===false&&
    q.ghot_resource_transfer===false&&q.owner_admission===false&&
    q.authority_effect==='none','AUTHORITY_SMUGGLED');
  demand(typeof q.quest_sha256==='string'&&q.quest_sha256===questDigest(q),
    'HASH_CHANGED');
  return q;
}
export const questScenario=world=>SPEC[world]?{
  ...SPEC[world],id:world,
}:null;
