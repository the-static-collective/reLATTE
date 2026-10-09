export interface CounterfactualQuest {
  schema:'ghot.riff-raft-counterfactual-quest/v0';
  source_project:string;source_donor_commit:string;mode:string;
  world_id:'A'|'B';world_seed:string;policy:string;
  previous_fault_x:number;previous_fault_lit:number;
  source_004_crossing_id:string;source_004_receipt_id:string;
  source_004_packet_sha256:string;source_004_instance_id:string;
  source_004_candidate_crossing_id:string;source_004_observed_state_sha256:string;
  source_004_quest_sha256:string;reason:string;
  fault_repeater_position:{x:number;y:number;z:number};
  expected_lit_during_fault:boolean[];expected_lit_initial:boolean[];
  expected_lit_reset:boolean[];expected_lit_repaired:boolean[];
  station_labels:string[];permitted_operation:string;sandbox:string;
  operator_must_select:true;source_verified_as_game_evidence:true;
  future_game_execution_observed:false;real_soil_improvement_verified:false;
  ghot_resource_moved:false;owner_admission:false;auto_dispatch:false;
  authority_effect:'none';quest_sha256:string;
}
export const GHOT_005_COMMIT:string;
export const QUEST_SCHEMA:string;
export const RETURN_SCHEMA:string;
export const BUNDLE_SCHEMA:string;
export const SOURCE_CROSSING:string;
export const SOURCE_RECEIPT:string;
export const SOURCE_PACKET:string;
export function validateCounterfactualQuest(q:CounterfactualQuest,
  worldId:string,seed:string|number):CounterfactualQuest;
export function counterfactualScenario(world:string):{
  seed:string;old:number;oldLit:number;next:number;newLit:number;policy:string;
}|null;
