import {createHash} from 'node:crypto';

export const GHOT_005_COMMIT='bec31b30ef7f7b6d07314da1ce96793fb8c45a4a';
export const QUEST_SCHEMA='ghot.riff-raft-counterfactual-quest/v0';
export const RETURN_SCHEMA='ghot.riff-raft-counterfactual-return/v0';
export const BUNDLE_SCHEMA='ghot.riff-raft-counterfactual-return-bundle/v0';
export const SOURCE_CROSSING='relatte-crossing-v0:0b61b9476c0ab3e2b57a5090781d2591e8c1145ac84c2eea2f67efb301d54fa3';
export const SOURCE_RECEIPT='relatte-receipt-v0:5ad43d10051e60ce2f5d52fca00808027785b55bc31c70ff75a88f2496a06d11';
export const SOURCE_PACKET='9956d0887a5f65495cb777a5ba06aa03451946c46285930d8d96eeaa2a7d0a17';
const DONOR='a63624f1be6a533f5ab927b1e4e8b1a629f1ba53';
const STAGES=['READ_FIELD','LAY_BONES','CATCH_WATER','MAKE_SHADE','MAKE_GROUND',
 'SEED_NUCLEUS','FEED_FIELD','WITNESS_DELTA','ONE_METER_OUTWARD'];
const FIXED={
 A:{seed:'381654729',old:-13,oldLit:3,next:2,newLit:5,
    policy:'shift-downstream-by-two-stages'},
 B:{seed:'918273645',old:17,oldLit:6,next:-28,newLit:2,
    policy:'shift-upstream-by-four-stages'},
};
const FIELDS=[
  'schema','source_project','source_donor_commit','mode','world_id','world_seed',
  'policy','previous_fault_x','previous_fault_lit','source_004_crossing_id',
  'source_004_receipt_id','source_004_packet_sha256','source_004_instance_id',
  'source_004_candidate_crossing_id','source_004_observed_state_sha256',
  'source_004_quest_sha256','reason','fault_repeater_position',
  'expected_lit_during_fault','expected_lit_initial','expected_lit_reset',
  'expected_lit_repaired','station_labels','permitted_operation','sandbox',
  'operator_must_select','source_verified_as_game_evidence',
  'future_game_execution_observed','real_soil_improvement_verified',
  'ghot_resource_moved','owner_admission','auto_dispatch','authority_effect',
  'quest_sha256',
];
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const digest=x=>createHash('sha256').update(JSON.stringify(sorted(x))).digest('hex');
function sorted(x){
 if(Array.isArray(x))return x.map(sorted);
 if(x!==null&&typeof x==='object')return Object.fromEntries(
   Object.keys(x).sort().map(k=>[k,sorted(x[k])]));
 return x;
}
const need=(test,reason)=>{if(!test)throw Error('RIFF_RAFT_COUNTERFACTUAL_'+reason);};
export function validateCounterfactualQuest(q,worldId,seed){
 need(q&&typeof q==='object'&&!Array.isArray(q),'OBJECT_REQUIRED');
 need(eq(Object.keys(q).sort(),[...FIELDS].sort()),'EXTRA_OR_MISSING_FIELDS');
 const rule=FIXED[worldId];
 need(!!rule&&q.world_id===worldId&&q.world_seed===String(seed)&&
   q.world_seed===rule.seed,'WORLD_SEED_CHANGED');
 need(q.schema===QUEST_SCHEMA&&q.source_project==='the-static-collective/GHoT'&&
   q.source_donor_commit===DONOR&&
   q.mode==='observed-source-counterfactual-proposal-only','PROVENANCE_CHANGED');
 need(q.source_004_crossing_id===SOURCE_CROSSING&&
   q.source_004_receipt_id===SOURCE_RECEIPT&&
   q.source_004_packet_sha256===SOURCE_PACKET,'VERIFIED_PRIOR_RUN_NOT_BOUND');
 need(q.policy===rule.policy&&q.previous_fault_x===rule.old&&
   q.previous_fault_lit===rule.oldLit&&
   q.reason==='bounded-counterfactual-relative-to-observed-lamp-count'&&
   eq(q.fault_repeater_position,{x:rule.next,y:66,z:46})&&
   q.permitted_operation==='remove-one-redstone-repeater-then-restore',
   'POLICY_OR_FAULT_POSITION_CHANGED');
 const lamps=[-40,-30,-20,-10,0,10,20,30,40];
 need(rule.newLit===lamps.filter(x=>x<rule.next).length&&
   eq(q.expected_lit_during_fault,lamps.map(x=>x<rule.next))&&
   eq(q.expected_lit_initial,STAGES.map(()=>false))&&
   eq(q.expected_lit_reset,STAGES.map(()=>false))&&
   eq(q.expected_lit_repaired,STAGES.map(()=>true))&&
   eq(q.station_labels,STAGES),'CAUSAL_EXPECTATION_CHANGED');
 for(const key of ['source_004_instance_id','source_004_candidate_crossing_id']){
   need(typeof q[key]==='string'&&q[key].length>30,'SOURCE_INSTANCE_NOT_BOUND');
 }
 for(const key of ['source_004_observed_state_sha256','source_004_quest_sha256']){
   need(typeof q[key]==='string'&&/^[a-f0-9]{64}$/.test(q[key]),
     'SOURCE_DIGEST_INVALID');
 }
 need(q.sandbox==='official-vanilla-minecraft-localhost'&&
   q.operator_must_select===true&&q.source_verified_as_game_evidence===true&&
   q.future_game_execution_observed===false&&
   q.real_soil_improvement_verified===false&&q.ghot_resource_moved===false&&
   q.owner_admission===false&&q.auto_dispatch===false&&
   q.authority_effect==='none','AUTHORITY_CLAIM_CHANGED');
 const {quest_sha256,...body}=q;
 need(typeof quest_sha256==='string'&&quest_sha256===digest(body),
   'QUEST_DIGEST_CHANGED');
 return q;
}
export const counterfactualScenario=world=>FIXED[world]?{...FIXED[world]}:null;
