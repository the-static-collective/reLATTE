import { sha256Hex } from '../../src/canonical.ts';
import type { P256KeyMaterial } from '../../src/protocol.ts';
import {
  FROZEN_CORE_SHA,
  makeObservation,
  makePolyglotHop,
  verifyHopBinding,
  type PolyglotHop,
} from '../polyglot-crossing-001/common.ts';

export const GOVERNING_CORE_SNAPSHOT_SHA = FROZEN_CORE_SHA;

export const COMPOSITION_INSTANCE_SCHEMA =
  'relatte.composition-instance-spec/v0' as const;
export const COMPOSITION_RESULT_SCHEMA =
  'relatte.composition-instance-result/v0' as const;

export interface CompositionInput {
  particular_ref: string;
  content_ref: string;
  role: string;
}

export interface CompositionInstanceSpec {
  schema: typeof COMPOSITION_INSTANCE_SCHEMA;
  runtime_id: string;
  base_snapshot_ref: string;
  goal: string;
  inputs: CompositionInput[];
  capabilities: string[];
  limits: Record<string, unknown>;
  observer_policy: {
    require_distinct_session: boolean;
    mode: string;
  };
  requested_output_class: string;
  governing_snapshot: {
    relatte_core_sha: string;
    normative_src_tree: string;
  };
  extensions: Record<string, unknown>;
}

export interface CompositionRuntimeEvidence {
  runtime_id: string;
  author_session_id: string;
  observer_session_id: string;
  observed_state_ref: string;
  observed_state_sha256: string;
  action_trace_ref: string;
  claims: Record<string, unknown>;
}

export interface CompositionInstanceOpened {
  instance_id: string;
  spec_bytes: Buffer;
  launch: PolyglotHop;
}

export interface CompositionInstanceResult {
  schema: typeof COMPOSITION_RESULT_SCHEMA;
  instance_id: string;
  launch_crossing_id: string;
  runtime_id: string;
  observed_state_ref: string;
  observed_state_sha256: string;
  action_trace_ref: string;
  author_session_id: string;
  observer_session_id: string;
  candidate_content_sha256: string;
  candidate_byte_length: number;
  result_disposition: 'R3_HOLD';
  runtime_claims: Record<string, unknown>;
  laws: string[];
}

export interface CompositionInstanceFinalized {
  result: CompositionInstanceResult;
  result_bytes: Buffer;
  candidate: PolyglotHop;
}

function canonicalSpec(spec: CompositionInstanceSpec): Buffer {
  return Buffer.from(JSON.stringify(spec), 'utf8');
}

function requireString(value: unknown, code: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(code);
}

export function validateCompositionInstanceSpec(
  spec: CompositionInstanceSpec,
): true {
  if (spec.schema !== COMPOSITION_INSTANCE_SCHEMA) {
    throw new Error('COMPOSITION_INSTANCE_SCHEMA_INVALID');
  }

  requireString(spec.runtime_id, 'COMPOSITION_RUNTIME_REQUIRED');
  requireString(spec.base_snapshot_ref, 'COMPOSITION_BASE_SNAPSHOT_REQUIRED');
  requireString(spec.goal, 'COMPOSITION_GOAL_REQUIRED');
  requireString(
    spec.requested_output_class,
    'COMPOSITION_OUTPUT_CLASS_REQUIRED',
  );

  if (!Array.isArray(spec.inputs)) throw new Error('COMPOSITION_INPUTS_INVALID');
  for (const input of spec.inputs) {
    requireString(input.particular_ref, 'COMPOSITION_INPUT_PARTICULAR_REQUIRED');
    requireString(input.content_ref, 'COMPOSITION_INPUT_CONTENT_REQUIRED');
    requireString(input.role, 'COMPOSITION_INPUT_ROLE_REQUIRED');
  }

  if (
    !Array.isArray(spec.capabilities) ||
    spec.capabilities.length === 0 ||
    new Set(spec.capabilities).size !== spec.capabilities.length
  ) throw new Error('COMPOSITION_CAPABILITIES_INVALID');

  if (
    !spec.observer_policy ||
    typeof spec.observer_policy.require_distinct_session !== 'boolean' ||
    typeof spec.observer_policy.mode !== 'string' ||
    spec.observer_policy.mode.length === 0
  ) throw new Error('COMPOSITION_OBSERVER_POLICY_INVALID');

  if (
    spec.governing_snapshot.relatte_core_sha !== GOVERNING_CORE_SNAPSHOT_SHA ||
    !/^[a-f0-9]{40}$/.test(spec.governing_snapshot.normative_src_tree)
  ) throw new Error('COMPOSITION_GOVERNING_SNAPSHOT_INVALID');

  return true;
}

export function makeCompositionInstanceSpec(args: {
  runtime_id: string;
  base_snapshot_ref: string;
  goal: string;
  inputs?: CompositionInput[];
  capabilities: string[];
  limits: Record<string, unknown>;
  observer_mode: string;
  requested_output_class: string;
  normative_src_tree: string;
  extensions?: Record<string, unknown>;
}): CompositionInstanceSpec {
  const spec: CompositionInstanceSpec = {
    schema: COMPOSITION_INSTANCE_SCHEMA,
    runtime_id: args.runtime_id,
    base_snapshot_ref: args.base_snapshot_ref,
    goal: args.goal,
    inputs: structuredClone(args.inputs ?? []),
    capabilities: [...args.capabilities],
    limits: structuredClone(args.limits),
    observer_policy: {
      require_distinct_session: true,
      mode: args.observer_mode,
    },
    requested_output_class: args.requested_output_class,
    governing_snapshot: {
      relatte_core_sha: GOVERNING_CORE_SNAPSHOT_SHA,
      normative_src_tree: args.normative_src_tree,
    },
    extensions: structuredClone(args.extensions ?? {}),
  };
  validateCompositionInstanceSpec(spec);
  return spec;
}

export function compositionInstanceId(
  spec: CompositionInstanceSpec,
): string {
  validateCompositionInstanceSpec(spec);
  return `composition-instance-v0:${sha256Hex(canonicalSpec(spec))}`;
}

export async function openCompositionInstance(args: {
  spec: CompositionInstanceSpec;
  signer: P256KeyMaterial;
  receiver: P256KeyMaterial;
  hop_index: number;
}): Promise<CompositionInstanceOpened> {
  const specBytes = canonicalSpec(args.spec);
  const instanceId = compositionInstanceId(args.spec);

  const observation = makeObservation(
    'composition-instance',
    instanceId,
    specBytes,
    'application/vnd.relatte.composition-instance+json',
    {
      phase: 'INSTANCE',
      runtime_id: args.spec.runtime_id,
      goal: args.spec.goal,
      capability_set: args.spec.capabilities,
      requested_output_class: args.spec.requested_output_class,
      observer_policy: args.spec.observer_policy,
      governing_snapshot: args.spec.governing_snapshot,
      laws: [
        'INSTANCE ADMISSION != RESULT ADMISSION',
        'CAPABILITY != AUTHORITY',
        'RUNTIME ONTOLOGY != RELATTE ONTOLOGY',
      ],
    },
  );

  const launch = await makePolyglotHop({
    observation,
    signer: args.signer,
    receiver: args.receiver,
    parent_crossing_id: null,
    disposition: 'R3_ADMIT',
    hop_index: args.hop_index,
  });
  verifyHopBinding(launch, specBytes);

  return { instance_id: instanceId, spec_bytes: specBytes, launch };
}

export async function finalizeCompositionInstance(args: {
  opened: CompositionInstanceOpened;
  spec: CompositionInstanceSpec;
  runtime_evidence: CompositionRuntimeEvidence;
  candidate_bytes: Uint8Array;
  signer: P256KeyMaterial;
  receiver: P256KeyMaterial;
  hop_index: number;
}): Promise<CompositionInstanceFinalized> {
  validateCompositionInstanceSpec(args.spec);

  const expectedInstance = compositionInstanceId(args.spec);
  if (args.opened.instance_id !== expectedInstance) {
    throw new Error('COMPOSITION_INSTANCE_ID_MISMATCH');
  }
  if (args.opened.launch.disposition !== 'R3_ADMIT') {
    throw new Error('COMPOSITION_INSTANCE_NOT_ADMITTED');
  }
  if (args.runtime_evidence.runtime_id !== args.spec.runtime_id) {
    throw new Error('COMPOSITION_RUNTIME_MISMATCH');
  }

  if (
    args.spec.observer_policy.require_distinct_session &&
    args.runtime_evidence.author_session_id ===
      args.runtime_evidence.observer_session_id
  ) throw new Error('COMPOSITION_OBSERVER_NOT_DISTINCT');

  requireString(
    args.runtime_evidence.observed_state_ref,
    'COMPOSITION_OBSERVED_STATE_REQUIRED',
  );
  if (!/^[a-f0-9]{64}$/.test(args.runtime_evidence.observed_state_sha256)) {
    throw new Error('COMPOSITION_OBSERVED_STATE_DIGEST_INVALID');
  }
  requireString(
    args.runtime_evidence.action_trace_ref,
    'COMPOSITION_ACTION_TRACE_REQUIRED',
  );

  const candidateBytes = Buffer.from(args.candidate_bytes);
  if (candidateBytes.length === 0) {
    throw new Error('COMPOSITION_EMPTY_CANDIDATE');
  }

  const result: CompositionInstanceResult = {
    schema: COMPOSITION_RESULT_SCHEMA,
    instance_id: expectedInstance,
    launch_crossing_id: args.opened.launch.crossing.crossing_id,
    runtime_id: args.runtime_evidence.runtime_id,
    observed_state_ref: args.runtime_evidence.observed_state_ref,
    observed_state_sha256: args.runtime_evidence.observed_state_sha256,
    action_trace_ref: args.runtime_evidence.action_trace_ref,
    author_session_id: args.runtime_evidence.author_session_id,
    observer_session_id: args.runtime_evidence.observer_session_id,
    candidate_content_sha256: sha256Hex(candidateBytes),
    candidate_byte_length: candidateBytes.length,
    result_disposition: 'R3_HOLD',
    runtime_claims: structuredClone(args.runtime_evidence.claims),
    laws: [
      'EXECUTION != ADMISSION',
      'AUTHOR != OBSERVER',
      'PLAN != OBSERVED STATE',
      'OUTPUT != ADMISSION',
      'INSTANCE DEATH != CANDIDATE DEATH',
      'COMPOSITION != SELF-ADMISSION',
    ],
  };

  const resultBytes = Buffer.from(JSON.stringify(result), 'utf8');
  const observation = makeObservation(
    'composition-instance',
    `${expectedInstance}:candidate:${result.candidate_content_sha256}`,
    resultBytes,
    'application/vnd.relatte.composition-result+json',
    {
      phase: 'CANDIDATE',
      runtime_id: result.runtime_id,
      instance_id: result.instance_id,
      observed_state_ref: result.observed_state_ref,
      observed_state_sha256: result.observed_state_sha256,
      action_trace_ref: result.action_trace_ref,
      author_session_id: result.author_session_id,
      observer_session_id: result.observer_session_id,
      candidate_content_sha256: result.candidate_content_sha256,
      candidate_byte_length: result.candidate_byte_length,
      runtime_claims: result.runtime_claims,
      laws: result.laws,
    },
  );

  const candidate = await makePolyglotHop({
    observation,
    signer: args.signer,
    receiver: args.receiver,
    parent_crossing_id: args.opened.launch.crossing.crossing_id,
    disposition: 'R3_HOLD',
    hop_index: args.hop_index,
  });
  verifyHopBinding(candidate, resultBytes);

  if (candidate.receipt.kind !== 'R3_HOLD') {
    throw new Error('COMPOSITION_RESULT_AUTO_ADMITTED');
  }

  return { result, result_bytes: resultBytes, candidate };
}
