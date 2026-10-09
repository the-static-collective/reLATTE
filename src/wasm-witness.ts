import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { canonicalize, canonicalizeDomainValue, sha256Hex, validateTimestamp } from './canonical.ts';
import { sealReceipt, verifyReceipt } from './protocol.ts';
import type { P256KeyMaterial } from './protocol.ts';
import { runAdmittedWasmVm, verifyWasmVmAdmission, verifyWasmVmCandidate } from './wasm-vm.ts';
import type { WasmVmCandidate, WasmVmResult } from './wasm-vm.ts';
import type { VmAdmissionEvidence, VmIdentity } from './vm.ts';

export const VM003_INPUT_DOMAIN = 'reLATTE-VM003-Input-v0|';
export const VM003_OUTPUT_DOMAIN = 'reLATTE-VM003-Output-v0|';
export const VM003_KIND = 'R15_VM_EXECUTION_WITNESS';
export const VM003_CONTRACT = 'relatte.vm-execution-witness/v0';

export interface Vm003Witness {
  run: WasmVmResult;
  receipt: Record<string, any>;
}

export interface Vm003Verification {
  candidate: WasmVmCandidate;
  evidence: VmAdmissionEvidence;
  receipt: Record<string, any>;
  /** Must be pinned from a trusted host registry, not learned from the guest. */
  pinned_witness_key: JsonWebKey;
}

function object(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasKeys(value: unknown, keys: string[]): value is Record<string, any> {
  return object(value) && Object.keys(value).sort().join('|') === [...keys].sort().join('|');
}

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 128;
}

function int32(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) &&
    value >= -2147483648 && value <= 2147483647;
}

function publicKeyEquals(a: unknown, b: unknown): boolean {
  return canonicalize(a) === canonicalize(b);
}

export function wasmInputDigest(left: number, right: number): string {
  if (!int32(left) || !int32(right)) throw new Error('INVALID_VM003_INPUT');
  return 'sha256:' + sha256Hex(canonicalizeDomainValue(
    VM003_INPUT_DOMAIN, { schema: 'relatte.vm003-input/v0', left, right },
  ));
}

export function wasmOutputDigest(result: number): string {
  if (!int32(result)) throw new Error('INVALID_VM003_OUTPUT');
  return 'sha256:' + sha256Hex(canonicalizeDomainValue(
    VM003_OUTPUT_DOMAIN, { schema: 'relatte.vm003-output/v0', result },
  ));
}

/** 
 * Execution witness key is distinct from both guest and owner keys.
 * A VM003 receipt is evidence of a host observation, never an R3 disposition.
 */
export async function runWitnessedWasmVm(args: {
  candidate: WasmVmCandidate;
  evidence: VmAdmissionEvidence;
  host_root: string;
  successor: VmIdentity;
  left: number;
  right: number;
  witness_keys: P256KeyMaterial;
  runner_label: string;
  observed_at: string;
}): Promise<Vm003Witness> {
  validateTimestamp(args.observed_at);
  if (!nonempty(args.runner_label)) throw new Error('INVALID_VM003_RUNNER');
  if (!(await verifyWasmVmAdmission(args.candidate, args.evidence))) {
    throw new Error('VM003_ADMISSION_REQUIRED');
  }
  if (publicKeyEquals(args.witness_keys.publicKeyJwk, args.evidence.owner.public_key) ||
      publicKeyEquals(args.witness_keys.publicKeyJwk, args.candidate.wasm_crossing.signing.public_key)) {
    throw new Error('VM003_SEPARATE_WITNESS_KEY_REQUIRED');
  }
  const started = performance.now();
  // 002 independently opens and replays the LIVE owner's journal before launching.
  const run = await runAdmittedWasmVm({
    candidate: args.candidate,
    evidence: args.evidence,
    host_root: args.host_root,
    successor: args.successor,
    left: args.left,
    right: args.right,
  });
  const elapsed = Math.max(0, Math.ceil(performance.now() - started));
  const extension = {
    schema: VM003_CONTRACT,
    execution_nonce: randomUUID(),
    vm_manifest_id: args.candidate.manifest.manifest_id,
    package_id: run.package_id,
    wasm_sha256: args.candidate.package.wasm_sha256,
    parent_crossing_id: run.parent_crossing_id,
    admit_receipt_id: args.evidence.admit_receipt.receipt_id,
    receive_receipt_id: args.evidence.receive_receipt.receipt_id,
    runner_label: args.runner_label,
    successor: run.successor,
    process_id: run.pid,
    input: {left: args.left, right: args.right},
    input_digest: wasmInputDigest(args.left, args.right),
    observed_result: run.result,
    output_digest: wasmOutputDigest(run.result),
    resource: {
      observed_wall_ms: elapsed,
      declared_timeout_ms: args.candidate.package.timeout_ms,
      v8_old_space_flag_mb: 32,
      measurement: 'host-observed-wall-clock-not-remote-attestation',
    },
    authority: {
      inherited_grants: [],
      receipt_is_admission: false,
      owner_admission_required: true,
    },
  };
  const receipt = await sealReceipt({
    schema: 'relatte.receipt/v0',
    crossing_id: run.candidate_crossing_id,
    world_id: args.evidence.owner.world_id,
    receiver_particular: args.evidence.owner.receiver_particular,
    kind: VM003_KIND,
    semantic_effect: 'none',
    contract_ref: VM003_CONTRACT,
    pre_state_ref: args.evidence.admit_receipt.receipt_id,
    post_state_ref: args.evidence.admit_receipt.receipt_id,
    descendant_refs: [],
    residual_refs: ['sha256:' + args.candidate.package.wasm_sha256],
    note: 'host-observed execution; no owner-local state transition implied',
    created_at: args.observed_at,
    extensions: { vm003: extension },
  }, args.witness_keys);
  return { run, receipt };
}

/** Cold verification checks the signed attribution and exact binding.
 * It does NOT cryptographically prove the host actually executed WASM,
 * that wall time is true, or that owner admission is still live.
 */
export async function verifyWasmExecutionWitness(args: Vm003Verification): Promise<boolean> {
  try {
    if (!(await verifyWasmVmCandidate(args.candidate)) ||
        !(await verifyWasmVmAdmission(args.candidate, args.evidence)) ||
        !(await verifyReceipt(args.receipt))) return false;
    const r = args.receipt;
    const c = args.candidate;
    const admission = args.evidence;
    if (r.kind !== VM003_KIND ||
        r.semantic_effect !== 'none' ||
        r.contract_ref !== VM003_CONTRACT ||
        r.crossing_id !== c.wasm_crossing.crossing_id ||
        r.world_id !== admission.owner.world_id ||
        r.receiver_particular !== admission.owner.receiver_particular ||
        r.pre_state_ref !== admission.admit_receipt.receipt_id ||
        r.post_state_ref !== r.pre_state_ref ||
        !Array.isArray(r.descendant_refs) || r.descendant_refs.length !== 0 ||
        canonicalize(r.residual_refs) !== canonicalize(['sha256:' + c.package.wasm_sha256]) ||
        !publicKeyEquals(r.signing.public_key, args.pinned_witness_key) ||
        publicKeyEquals(r.signing.public_key, c.wasm_crossing.signing.public_key) ||
        publicKeyEquals(r.signing.public_key, admission.owner.public_key)) return false;
    if (!hasKeys(r.extensions, ['vm003'])) return false;
    const x = r.extensions.vm003;
    if (!hasKeys(x, [
      'schema', 'execution_nonce', 'vm_manifest_id', 'package_id', 'wasm_sha256',
      'parent_crossing_id', 'admit_receipt_id', 'receive_receipt_id', 'runner_label',
      'successor', 'process_id', 'input', 'input_digest', 'observed_result',
      'output_digest', 'resource', 'authority',
    ])) return false;
    if (x.schema !== VM003_CONTRACT ||
        !nonempty(x.execution_nonce) || !nonempty(x.runner_label) ||
        x.vm_manifest_id !== c.manifest.manifest_id ||
        x.package_id !== c.package.package_id ||
        x.wasm_sha256 !== c.package.wasm_sha256 ||
        x.parent_crossing_id !== c.parent_crossing.crossing_id ||
        x.admit_receipt_id !== admission.admit_receipt.receipt_id ||
        x.receive_receipt_id !== admission.receive_receipt.receipt_id ||
        !hasKeys(x.input, ['left', 'right']) ||
        !int32(x.input.left) || !int32(x.input.right) ||
        x.input_digest !== wasmInputDigest(x.input.left, x.input.right) ||
        !int32(x.observed_result) ||
        x.output_digest !== wasmOutputDigest(x.observed_result) ||
        !Number.isSafeInteger(x.process_id) || x.process_id <= 0 ||
        !hasKeys(x.successor, ['world_id','particular','runtime_id']) ||
        !Object.values(x.successor).every(nonempty) ||
        x.successor.world_id === c.wasm_crossing.source_world ||
        x.successor.particular === c.wasm_crossing.source_particular ||
        x.successor.runtime_id === c.wasm_crossing.extensions.wasm_vm.source_runtime_id ||
        !hasKeys(x.resource, ['observed_wall_ms','declared_timeout_ms','v8_old_space_flag_mb','measurement']) ||
        !Number.isSafeInteger(x.resource.observed_wall_ms) || x.resource.observed_wall_ms < 0 ||
        x.resource.declared_timeout_ms !== c.package.timeout_ms ||
        x.resource.v8_old_space_flag_mb !== 32 ||
        x.resource.measurement !== 'host-observed-wall-clock-not-remote-attestation' ||
        !hasKeys(x.authority, ['inherited_grants','receipt_is_admission','owner_admission_required']) ||
        !Array.isArray(x.authority.inherited_grants) ||
        x.authority.inherited_grants.length !== 0 ||
        x.authority.receipt_is_admission !== false ||
        x.authority.owner_admission_required !== true) return false;
    validateTimestamp(r.created_at);
    return true;
  } catch {
    return false;
  }
}

export async function verifyIndependentWasmWitnessPair(
  candidate: WasmVmCandidate,
  a: Omit<Vm003Verification,'candidate'>,
  b: Omit<Vm003Verification,'candidate'>,
): Promise<boolean> {
  try {
    if (!(await verifyWasmExecutionWitness({...a,candidate})) ||
        !(await verifyWasmExecutionWitness({...b,candidate}))) return false;
    const x = a.receipt.extensions.vm003;
    const y = b.receipt.extensions.vm003;
    return a.evidence.owner.world_id !== b.evidence.owner.world_id &&
      a.evidence.owner.receiver_particular !== b.evidence.owner.receiver_particular &&
      !publicKeyEquals(a.evidence.owner.public_key, b.evidence.owner.public_key) &&
      !publicKeyEquals(a.pinned_witness_key, b.pinned_witness_key) &&
      a.receipt.receipt_id !== b.receipt.receipt_id &&
      x.execution_nonce !== y.execution_nonce &&
      x.runner_label !== y.runner_label &&
      x.successor.world_id !== y.successor.world_id &&
      x.successor.runtime_id !== y.successor.runtime_id &&
      x.input_digest === y.input_digest &&
      x.output_digest === y.output_digest &&
      x.observed_result === y.observed_result;
  } catch {
    return false;
  }
}
