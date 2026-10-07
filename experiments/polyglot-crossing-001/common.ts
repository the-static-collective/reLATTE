import { sha256Hex } from '../../src/canonical.ts';
import {
  sealCrossingEnvelope,
  sealReceipt,
  verifyCrossingEnvelope,
  verifyReceipt,
  type P256KeyMaterial,
} from '../../src/protocol.ts';

export const FROZEN_CORE_SHA =
  'f5cb7488bebc1a6e27fd458ad40af9b9b6f9e858';

export type PolyglotSubstrate =
  | 'git'
  | 'filesystem'
  | 'sqlite'
  | 'http'
  | 'signed-json'
  | 'physical-carrier'
  | 'udp-datagram-swarm'
  | 'midi-event-stream'
  | 'langton-ant-field';

export type LocalDisposition = 'R3_HOLD' | 'R3_ADMIT' | 'R3_REFUSE' | 'RETURN';

export interface AdapterObservation {
  schema: 'relatte.polyglot-observation/v0';
  substrate: PolyglotSubstrate;
  native_id: string;
  content_sha256: string;
  byte_length: number;
  media_type: string;
  observed_bytes: Uint8Array;
  native_claims: Record<string, unknown>;
}

export interface PolyglotHop {
  observation: AdapterObservation;
  crossing: Record<string, any>;
  receipt: Record<string, any>;
  disposition: LocalDisposition;
}

export function makeObservation(
  substrate: PolyglotSubstrate,
  nativeId: string,
  bytes: Uint8Array,
  mediaType: string,
  nativeClaims: Record<string, unknown>,
): AdapterObservation {
  const copy = Buffer.from(bytes);
  return {
    schema: 'relatte.polyglot-observation/v0',
    substrate,
    native_id: nativeId,
    content_sha256: sha256Hex(copy),
    byte_length: copy.length,
    media_type: mediaType,
    observed_bytes: copy,
    native_claims: structuredClone(nativeClaims),
  };
}

export function assertObservationBytes(
  value: AdapterObservation,
  expected: Uint8Array,
): void {
  const observed = Buffer.from(value.observed_bytes);
  if (!observed.equals(Buffer.from(expected))) throw new Error('ADAPTER_BYTES_CHANGED');
  if (sha256Hex(observed) !== value.content_sha256) {
    throw new Error('ADAPTER_DIGEST_MISMATCH');
  }
  if (observed.length !== value.byte_length) throw new Error('ADAPTER_LENGTH_MISMATCH');
}

export async function makePolyglotHop(args: {
  observation: AdapterObservation;
  signer: P256KeyMaterial;
  receiver: P256KeyMaterial;
  parent_crossing_id: string | null;
  disposition: LocalDisposition;
  hop_index: number;
}): Promise<PolyglotHop> {
  assertObservationBytes(args.observation, args.observation.observed_bytes);

  const crossing = await sealCrossingEnvelope({
    schema: 'relatte.crossing-envelope/v0',
    protocol_version: '0',
    source_particular: `particular:${args.observation.native_id}`,
    source_world: `polyglot:${args.observation.substrate}`,
    source_history_head: null,
    parents: args.parent_crossing_id ? [args.parent_crossing_id] : [],
    declared_kind: 'POLYGLOT_ADAPTER_ARTIFACT',
    payload_refs: [{
      address: `sha256:${args.observation.content_sha256}`,
      role: 'observed-substrate-bytes',
      media_type: args.observation.media_type,
    }],
    requested_effect: { kind: 'candidate-ingress', authority: 'receiver-local' },
    capability_ref: null,
    privacy_policy: null,
    audience_policy: null,
    return_address: 'relatte:return:polyglot',
    created_at: `2026-10-07T00:00:${String(args.hop_index).padStart(2, '0')}.000Z`,
    extensions: {
      polyglot_crossing_001: {
        frozen_core_sha: FROZEN_CORE_SHA,
        adapter_only: true,
        substrate: args.observation.substrate,
        native_id: args.observation.native_id,
        native_claims: args.observation.native_claims,
        content_sha256: args.observation.content_sha256,
        byte_length: args.observation.byte_length,
        laws: [
          'INTERNAL MODEL != CROSSING MODEL',
          'CONTENT IDENTITY != PARTICULAR IDENTITY',
          'ADAPTER CLAIM != CORE AUTHORITY',
        ],
      },
    },
  }, args.signer);

  if (!(await verifyCrossingEnvelope(crossing))) throw new Error('POLYGLOT_CROSSING_INVALID');

  const receipt = await sealReceipt({
    schema: 'relatte.receipt/v0',
    crossing_id: crossing.crossing_id,
    world_id: `polyglot:receiver:${args.observation.substrate}`,
    receiver_particular: `receiver:${args.observation.substrate}`,
    kind: args.disposition,
    semantic_effect: 'local-only',
    contract_ref: null,
    pre_state_ref: null,
    post_state_ref: null,
    descendant_refs: [],
    residual_refs: [],
    note: 'Substrate-local disposition; does not propagate authority.',
    created_at: `2026-10-07T00:01:${String(args.hop_index).padStart(2, '0')}.000Z`,
    extensions: {
      polyglot_crossing_001: {
        substrate: args.observation.substrate,
        native_id: args.observation.native_id,
        content_sha256: args.observation.content_sha256,
        disposition: args.disposition,
        authority_scope: 'THIS_RECEIVER_ONLY',
      },
    },
  }, args.receiver);

  if (!(await verifyReceipt(receipt))) throw new Error('POLYGLOT_RECEIPT_INVALID');
  return { observation: structuredClone(args.observation), crossing, receipt, disposition: args.disposition };
}

export function verifyHopBinding(hop: PolyglotHop, expected: Uint8Array): void {
  assertObservationBytes(hop.observation, expected);
  if (hop.receipt.crossing_id !== hop.crossing.crossing_id) {
    throw new Error('POLYGLOT_RECEIPT_CROSSING_MISMATCH');
  }
  const ext = hop.crossing.extensions?.polyglot_crossing_001;
  if (
    ext?.substrate !== hop.observation.substrate ||
    ext?.native_id !== hop.observation.native_id ||
    ext?.content_sha256 !== hop.observation.content_sha256
  ) throw new Error('POLYGLOT_ADAPTER_BINDING_MISMATCH');
}
