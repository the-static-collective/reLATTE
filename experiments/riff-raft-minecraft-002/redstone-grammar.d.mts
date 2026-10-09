import type { WorldPlan, WorldPosition } from '../vanilla-worldbuilder-006/world-grammar.mjs';
import type { GhotRiffRaftProvenance, RiffRaftWorldPlan } from '../riff-raft-minecraft-001/terraform-grammar.mjs';
export interface RedstoneStage {
  cue: string;
  sequence: number;
  at: WorldPosition;
}
export interface RedstoneCircuit {
  schema: 'relatte.riff-raft-redstone-002/v0';
  trigger: WorldPosition;
  break_repeater: WorldPosition;
  repeaters: number[];
  stages: RedstoneStage[];
  status: 'plan-only';
  allowed_trigger: string;
  physical_field_evidence: false;
  ghot_organ_executed: false;
  auto_authorization: false;
  parent_plan_sha256?: string;
}
export const REDSTONE_CIRCUIT: Readonly<RedstoneCircuit>;
export type RiffRaftRedstonePlan = RiffRaftWorldPlan & {
  riff_raft_redstone: RedstoneCircuit & {parent_plan_sha256:string};
};
export function buildRiffRaftRedstonePlan(args: {
  goal:string;
  serverSeed:string | number;
  provenance:GhotRiffRaftProvenance;
}): RiffRaftRedstonePlan;
