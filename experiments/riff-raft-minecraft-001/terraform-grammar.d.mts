import type { WorldPlan, WorldPosition } from '../vanilla-worldbuilder-006/world-grammar.mjs';

export interface GhotRiffRaftProvenance {
  source_repo: 'the-static-collective/GHoT';
  source_commit: string;
  source_document: string;
  stages: string[];
  witness_class: 'ghot-simulation-manifest-only';
  claims: {
    actual_minecraft_actions_executed: false;
    physical_field_improvement_verified: false;
    real_world_actuation: false;
    signed_ghot_receipts_ingested: false;
  };
}
export interface TerraformerStation {
  sequence: number;
  cue: string;
  at: WorldPosition;
  expected_block: string;
  physical_causality_claimed: false;
  ghot_receipt_attached: false;
}
export type RiffRaftWorldPlan = WorldPlan & {
  riff_raft: {
    schema: 'relatte.riff-raft-minecraft-001/v0';
    source_project: string;
    source_commit: string;
    source_document: string;
    source_evidence_class: string;
    source_manifest_sha256: string;
    actual_ghot_execution_observed: false;
    actual_minecraft_execution_observed: false;
    stations: TerraformerStation[];
    stage_order: string[];
    created_as: 'world-authoring-intent-not-execution';
    world_contact_required: 'fresh-non-op-protocol-observer';
    default_candidate_disposition: 'R3_HOLD';
  };
};

export const RIFF_RAFT_GHOT_COMMIT: string;
export const RIFF_RAFT_GHOT_DOC: string;
export const RIFF_RAFT_STAGES: ReadonlyArray<string>;
export function validateGhotProvenance(value: GhotRiffRaftProvenance): true;
export function buildRiffRaftMinecraftPlan(args: {
  goal: string;
  serverSeed: string | number;
  provenance: GhotRiffRaftProvenance;
}): RiffRaftWorldPlan;
