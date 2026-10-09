export interface TerraformQuest {
  schema:'ghot.riff-raft-terraform-quest/v0';
  source_project:string;source_donor_commit:string;mode:string;
  world_id:'A'|'B';world_seed:string;selection:string;priority:string;question:string;
  intervention:string;fault_repeater_position:{x:number;y:number;z:number};
  expected_lit_during_fault:boolean[];expected_lit_initial:boolean[];
  expected_lit_reset:boolean[];expected_lit_repaired:boolean[];
  station_labels:string[];sandbox:string;operator_must_select:true;
  simulator_can_trigger:false;game_execution_observed:false;actual_soil_change_verified:false;
  ghot_resource_transfer:false;owner_admission:false;authority_effect:'none';
  quest_sha256:string;
}
export const GHOT_004_COMMIT:string;
export const QUEST_SCHEMA:string;
export const RETURN_SCHEMA:string;
export const BUNDLE_SCHEMA:string;
export function questDigest(quest:TerraformQuest):string;
export function validateQuest(quest:TerraformQuest,worldId:string,seed:string|number):TerraformQuest;
export function questScenario(world:string):{id:string;seed:string;priority:string;fault:number;count:number;question:string}|null;
