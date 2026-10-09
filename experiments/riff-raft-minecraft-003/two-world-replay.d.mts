export interface ReplayInput {
  world_id: 'A' | 'B';
  composition_bytes: Buffer;
  runtime_bytes: Buffer;
}
export interface ReplayPacket {
  schema: 'ghot.riff-raft-minecraft-return/v0';
  worlds: Array<{instance_id: string; [key: string]: unknown}>;
  [key: string]: unknown;
}
export interface SignedReturnBundle {
  schema: 'ghot.riff-raft-minecraft-return-bundle/v0';
  packet_json: string;
  crossing: Record<string, any>;
  receipt: Record<string, any>;
  world_evidence: Record<string, unknown>;
}
export const SCHEMA: 'ghot.riff-raft-minecraft-return/v0';
export const BUNDLE_SCHEMA: 'ghot.riff-raft-minecraft-return-bundle/v0';
export const REQUIRED_GOAL: string;
export function assemblePair(inputs: ReplayInput[]): Promise<ReplayPacket>;
export function emitSignedReturn(packet: ReplayPacket,worldEvidence: Record<string,unknown>): Promise<SignedReturnBundle>;
export function buildBundleFromFiles(root: string,outPath: string): Promise<{
  worlds: Array<{id: string; instance:string}>;
  comparison: unknown;
  receipt_kind: string;
  crossing_id: string;
  packet_sha256: string;
  output_path: string;
}>;
