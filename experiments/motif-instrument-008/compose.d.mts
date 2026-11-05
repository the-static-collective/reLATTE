export const SCHEMA: string;
export interface VerifiedHistory {
  schema:string;
  source_sha256:string;
  original_signed_004_crossing:string;
  original_signed_005_crossing:string;
  observed_prior_and_next:{A:number[];B:number[]};
  all_original_signatures_and_source_bytes_verified:true;
  admission:false;physical_actuation:false;disposition:'HOLD';
}
export interface ObservedFault {
  world:'A'|'B';fault_x:number;lit_count:number;
}
export interface InstrumentState {
  schema:string;
  target_world:'A'|'B';
  new_fault_repeater:{x:number;y:number;z:number};
  original_005_crossing:string;
  parent_source_sha256:string;
  pending_disposition:'R3_HOLD';
  automated_game_execution_occurred:false;
  remote_execution:false;
  [key:string]:unknown;
}
export interface GamePack {
  files:Record<string,string>;
  readback:{
    actual_server_test_executed:false;
    prior_game_source_reused_as_new_observation:false;
    [key:string]:unknown;
  };
  plan_operations:number;
  build_plan_sha256:string;
}
export function extractAuthenticatedPrior(audit:VerifiedHistory):ObservedFault[];
export function composeNativeMinecraftExperiment(input:{
  motifRoot:string;sourceBytes:Buffer;
}):Promise<{
  state:InstrumentState;
  decision:{
    status:string;selected:{target:{world:'A'|'B';fault_x:number;threshold:number;observation:string};expected_information_bits:number};
    [key:string]:unknown;
  };
  pack:GamePack;
  audit:VerifiedHistory;
}>;
export function buildMinecraftDatapack(plan:unknown,state:InstrumentState):GamePack;
export function sealSyntheticQuest(state:InstrumentState):Promise<{
  schema:string;
  crossing:Record<string,any>;
  receipt:Record<string,any>;
  game_execution_verified:false;
  admission:false;
}>;
export function runExperiment(opts?:{motifRoot?:string;sourceFile?:string;outDir?:string;}):Promise<Record<string,unknown>>;
