import { spawn } from 'node:child_process';
import { canonicalize, canonicalizeDomainValue, sha256Hex, validateTimestamp } from './canonical.ts';
import {
  sealCrossingEnvelope, verifyCrossingEnvelope, verifyReceipt,
} from './protocol.ts';
import type { P256KeyMaterial } from './protocol.ts';
import { verifyVmCandidate, verifyVmManifest } from './vm.ts';
import type { VmIdentity, VmManifest, VmAdmissionEvidence } from './vm.ts';

const WASM_PACKAGE_DOMAIN = 'reLATTE-WasmVmPackage-v0|';
const WASM_ENGINE = 'relatte.no-imports-wasm-process/v0';
const PACKAGE_LAWS = [
  'ARTIFACT != AUTHORITY',
  'GUEST BYTES != HOST CODE',
  'PROCESS != WORLD IDENTITY',
  'PROPOSAL != ADMISSION',
  'RECONSTRUCTION != INHERITED GRANT',
] as const;

export interface WasmVmPackage {
  schema: 'relatte.wasm-vm-package/v0';
  package_id: string;
  self_ref: string;
  vm_manifest_id: string;
  engine: typeof WASM_ENGINE;
  wasm_sha256: string;
  export_name: 'step';
  max_wasm_bytes: number;
  timeout_ms: number;
  laws: string[];
}

export interface WasmVmCandidate {
  manifest: VmManifest;
  parent_crossing: Record<string, any>;
  wasm_crossing: Record<string, any>;
  package: WasmVmPackage;
  wasm_bytes: Uint8Array;
}

export interface WasmVmResult {
  package_id: string;
  candidate_crossing_id: string;
  parent_crossing_id: string;
  successor: VmIdentity;
  pid: number;
  result: number;
  inherited_grants: [];
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: unknown, keys: string[]): boolean {
  return isRecord(value) &&
    Object.keys(value).sort().join('|') === [...keys].sort().join('|');
}

function pkgBody(vmManifestId: string, digest: string, timeout: number) {
  return {
    schema: 'relatte.wasm-vm-package/v0' as const,
    vm_manifest_id: vmManifestId,
    engine: WASM_ENGINE as typeof WASM_ENGINE,
    wasm_sha256: digest,
    export_name: 'step' as const,
    max_wasm_bytes: 4096,
    timeout_ms: timeout,
    laws: [...PACKAGE_LAWS],
  };
}

function ensureBytes(bytes: unknown): asserts bytes is Uint8Array {
  if (!(bytes instanceof Uint8Array) ||
      bytes.byteLength < 8 || bytes.byteLength > 4096) {
    throw new Error('WASM_BYTE_BOUND');
  }
}

// Reject Wasm sections capable of creating/importing memory, tables, data,
// or implicit start execution; WASM imports are separately denied by worker.
// A finite WASM binary reader only: not a parser for general-purpose modules.
function readLeb(bytes: Uint8Array, start: number): { value: number; next: number } {
  let value = 0;
  let factor = 1;
  for (let i = 0; i < 5; i++) {
    if (start + i >= bytes.length) throw new Error('WASM_TRUNCATED_LEB');
    const byte = bytes[start + i];
    value += (byte & 0x7f) * factor;
    if (!Number.isSafeInteger(value) || value > 0xffffffff) throw new Error('WASM_INVALID_LEB');
    if ((byte & 0x80) === 0) return { value, next: start + i + 1 };
    factor *= 128;
  }
  throw new Error('WASM_INVALID_LEB');
}

export function validateWasmEnvelope(bytes: Uint8Array): void {
  ensureBytes(bytes);
  if (Buffer.from(bytes.subarray(0, 8)).toString('hex') !== '0061736d01000000') {
    throw new Error('INVALID_WASM_HEADER');
  }
  let p = 8;
  let prevSection = 0;
  const forbidden = new Set([2, 4, 5, 8, 9, 11, 12, 13]); // imports, tables, memory, start, element, data, tags
  while (p < bytes.length) {
    const id = bytes[p++];
    if (id > 13) throw new Error('INVALID_WASM_SECTION');
    const len = readLeb(bytes, p);
    p = len.next;
    if (p + len.value > bytes.length) throw new Error('WASM_TRUNCATED_SECTION');
    if (id !== 0) {
      if (id <= prevSection) throw new Error('WASM_SECTION_ORDER');
      prevSection = id;
    }
    if (forbidden.has(id)) throw new Error('WASM_FORBIDDEN_SECTION');
    p += len.value;
  }
  if (p !== bytes.length) throw new Error('WASM_TRUNCATED_SECTION');
}

export function createWasmVmPackage(
  manifest: VmManifest, bytes: Uint8Array, timeoutMs = 1500,
): WasmVmPackage {
  if (!verifyVmManifest(manifest)) throw new Error('INVALID_VM_MANIFEST');
  validateWasmEnvelope(bytes);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 200 || timeoutMs > 5000) {
    throw new Error('INVALID_WASM_TIME_BUDGET');
  }
  const body = pkgBody(manifest.manifest_id, sha256Hex(bytes), timeoutMs);
  const id = 'relatte-wasm-vm-package-v0:' +
    sha256Hex(canonicalizeDomainValue(WASM_PACKAGE_DOMAIN, body));
  return { ...body, package_id: id, self_ref: id };
}

export function verifyWasmVmPackage(
  pkg: unknown, manifest: VmManifest, bytes: Uint8Array,
): pkg is WasmVmPackage {
  try {
    if (!exactKeys(pkg, [
      'schema', 'package_id', 'self_ref', 'vm_manifest_id', 'engine',
      'wasm_sha256', 'export_name', 'max_wasm_bytes', 'timeout_ms', 'laws',
    ])) return false;
    return canonicalize(pkg) === canonicalize(
      createWasmVmPackage(manifest, bytes, pkg.timeout_ms),
    );
  } catch {
    return false;
  }
}

function wasmPayloadRefs(pkg: WasmVmPackage): Record<string, string>[] {
  return [
    {
      address: 'sha256:' + pkg.wasm_sha256,
      role: 'wasm-module',
      media_type: 'application/wasm',
    },
    {
      address: 'sha256:' + sha256Hex(Buffer.from(canonicalize(pkg), 'utf8')),
      role: 'wasm-package',
      media_type: 'application/json',
    },
  ];
}

export async function proposeWasmVm(args: {
  manifest: VmManifest;
  parent_crossing: Record<string, any>;
  wasm_bytes: Uint8Array;
  package: WasmVmPackage;
  signing_keys: P256KeyMaterial;
  created_at: string;
}): Promise<Record<string, any>> {
  if (!(await verifyVmCandidate(args.manifest, args.parent_crossing)) ||
      !verifyWasmVmPackage(args.package, args.manifest, args.wasm_bytes)) {
    throw new Error('INVALID_WASM_PARENT_OR_PACKAGE');
  }
  validateTimestamp(args.created_at);
  const parent = args.parent_crossing;
  const crossing = await sealCrossingEnvelope({
    schema: 'relatte.crossing-envelope/v0',
    protocol_version: '0',
    source_particular: parent.source_particular,
    source_world: parent.source_world,
    source_history_head: parent.source_history_head,
    parents: [parent.crossing_id],
    declared_kind: 'RELATTE_WASM_VM_CANDIDATE',
    payload_refs: wasmPayloadRefs(args.package),
    requested_effect: { kind: 'candidate-wasm-vm-launch', authority: 'receiver-local' },
    capability_ref: null,
    privacy_policy: null,
    audience_policy: null,
    return_address: null,
    created_at: args.created_at,
    extensions: {
      wasm_vm: {
        package_id: args.package.package_id,
        vm_manifest_id: args.manifest.manifest_id,
        source_runtime_id: parent.extensions.vm.source_runtime_id,
        inherited_authority: false,
        requested_grants: [],
      },
    },
  }, args.signing_keys);
  if (!(await verifyWasmVmCandidate({
    ...args,
    wasm_crossing: crossing,
  }))) throw new Error('WASM_SIGNER_MUST_MATCH_PARENT');
  return crossing;
}

export async function verifyWasmVmCandidate(candidate: WasmVmCandidate): Promise<boolean> {
  try {
    const { manifest, parent_crossing: parent, wasm_crossing: crossing, package: pkg, wasm_bytes: bytes } = candidate;
    if (!verifyWasmVmPackage(pkg, manifest, bytes) ||
        !(await verifyVmCandidate(manifest, parent)) ||
        !(await verifyCrossingEnvelope(crossing))) return false;
    if (crossing.declared_kind !== 'RELATTE_WASM_VM_CANDIDATE' ||
        crossing.capability_ref !== null ||
        crossing.source_particular !== parent.source_particular ||
        crossing.source_world !== parent.source_world ||
        crossing.source_history_head !== parent.source_history_head ||
        canonicalize(crossing.signing.public_key) !== canonicalize(parent.signing.public_key) ||
        canonicalize(crossing.parents) !== canonicalize([parent.crossing_id]) ||
        canonicalize(crossing.payload_refs) !== canonicalize(wasmPayloadRefs(pkg))) return false;
    if (!exactKeys(crossing.requested_effect, ['kind', 'authority']) ||
        crossing.requested_effect.kind !== 'candidate-wasm-vm-launch' ||
        crossing.requested_effect.authority !== 'receiver-local') return false;
    if (!exactKeys(crossing.extensions, ['wasm_vm'])) return false;
    const vm = crossing.extensions.wasm_vm;
    if (!exactKeys(vm, [
      'package_id', 'vm_manifest_id', 'source_runtime_id',
      'inherited_authority', 'requested_grants',
    ]) || vm.package_id !== pkg.package_id ||
        vm.vm_manifest_id !== manifest.manifest_id ||
        vm.source_runtime_id !== parent.extensions.vm.source_runtime_id ||
        vm.inherited_authority !== false ||
        !Array.isArray(vm.requested_grants) || vm.requested_grants.length !== 0) return false;
    return true;
  } catch {
    return false;
  }
}

export async function verifyWasmVmAdmission(
  candidate: WasmVmCandidate, evidence: VmAdmissionEvidence,
): Promise<boolean> {
  try {
    if (!(await verifyWasmVmCandidate(candidate))) return false;
    const crossing = candidate.wasm_crossing;
    if (!exactKeys(evidence.owner, [
      'world_id', 'receiver_particular', 'contract_ref', 'public_key',
    ])) return false;
    const { receive_receipt: receive, admit_receipt: admit, owner } = evidence;
    if (!(await verifyReceipt(receive)) || !(await verifyReceipt(admit))) return false;
    if (receive.crossing_id !== crossing.crossing_id ||
        admit.crossing_id !== crossing.crossing_id ||
        receive.kind !== 'RECEIVED' || receive.semantic_effect !== 'none' ||
        admit.kind !== 'R3_ADMIT' ||
        admit.semantic_effect !== 'relatte-wasm-vm-launch' ||
        receive.world_id !== owner.world_id || admit.world_id !== owner.world_id ||
        receive.receiver_particular !== owner.receiver_particular ||
        admit.receiver_particular !== owner.receiver_particular ||
        receive.contract_ref !== owner.contract_ref ||
        admit.contract_ref !== owner.contract_ref ||
        owner.world_id === crossing.source_world ||
        owner.receiver_particular === crossing.source_particular ||
        canonicalize(receive.signing.public_key) !== canonicalize(owner.public_key) ||
        canonicalize(admit.signing.public_key) !== canonicalize(owner.public_key) ||
        admit.extensions?.local_receiver?.receive_receipt_id !== receive.receipt_id ||
        admit.extensions?.local_receiver?.disposition !== 'ADMIT') return false;
    return true;
  } catch {
    return false;
  }
}

// Trusted *host-authored* worker; guest supplies only WASM bytes, never JS,
// argv switches, filesystem paths, OS commands, imports, or capabilities.
// Child has no WASI. No memory/table/start sections are admitted.
const WORKER_SOURCE = String.raw`
'use strict';
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  input += chunk;
  if (input.length > 8192) process.exit(73);
});
process.stdin.on('end', async () => {
  try {
    const request = JSON.parse(input);
    const bytes = Buffer.from(request.wasm, 'base64');
    const module = await WebAssembly.compile(bytes);
    if (WebAssembly.Module.imports(module).length !== 0) throw new Error('WASM_IMPORTS_DENIED');
    const exports = WebAssembly.Module.exports(module);
    if (exports.length !== 1 || exports[0].name !== 'step' || exports[0].kind !== 'function') {
      throw new Error('WASM_EXPORT_CONTRACT');
    }
    const instance = await WebAssembly.instantiate(module, {});
    const result = instance.exports.step(request.left, request.right);
    if (!Number.isInteger(result)) throw new Error('WASM_RESULT_CONTRACT');
    process.stdout.write(JSON.stringify({pid: process.pid, result}) + '\n');
  } catch (error) {
    process.stderr.write('WASM_EXECUTION_DENIED: ' + String(error.message).slice(0, 120));
    process.exitCode = 72;
  }
});
`;

function int32(value: number): boolean {
  return Number.isSafeInteger(value) && value >= -2147483648 && value <= 2147483647;
}

async function executeInSeparateProcess(
  bytes: Uint8Array, left: number, right: number, timeoutMs: number,
): Promise<{ pid: number; result: number }> {
  const request = JSON.stringify({
    wasm: Buffer.from(bytes).toString('base64'), left, right,
  });
  return new Promise((resolve, reject) => {
    let settled = false;
    let timedOut = false;
    let stdout = '';
    let stderr = '';
    const child = spawn(process.execPath, [
      '--max-old-space-size=32',
      '--disable-proto=throw',
      '--eval', WORKER_SOURCE,
    ], { env: {}, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    const finish = (error?: Error, value?: {pid: number; result: number}) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value!);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
      finish(new Error('WASM_PROCESS_TIMEOUT'));
    }, timeoutMs);
    child.on('error', (error) => finish(error));
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
      if (stdout.length > 4096) {
        child.kill('SIGKILL');
        finish(new Error('WASM_OUTPUT_LIMIT'));
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
      if (stderr.length > 4096) {
        child.kill('SIGKILL');
        finish(new Error('WASM_OUTPUT_LIMIT'));
      }
    });
    child.on('close', (code) => {
      if (settled) return;
      if (timedOut) return finish(new Error('WASM_PROCESS_TIMEOUT'));
      if (code !== 0) return finish(new Error('WASM_WORKER_REJECTED:' + stderr.slice(0, 160)));
      try {
        const result: unknown = JSON.parse(stdout.trim());
        if (!exactKeys(result, ['pid', 'result']) ||
            !Number.isSafeInteger(result.pid) || result.pid <= 0 ||
            !int32(result.result)) throw new Error('INVALID_WASM_WORKER_OUTPUT');
        finish(undefined, { pid: result.pid, result: result.result });
      } catch {
        finish(new Error('INVALID_WASM_WORKER_OUTPUT'));
      }
    });
    child.stdin.on('error', () => {}); // worker may terminate before stdin finishes
    child.stdin.end(request);
  });
}

export async function runAdmittedWasmVm(args: {
  candidate: WasmVmCandidate;
  evidence: VmAdmissionEvidence;
  successor: VmIdentity;
  left: number;
  right: number;
}): Promise<WasmVmResult> {
  if (!(await verifyWasmVmAdmission(args.candidate, args.evidence))) {
    throw new Error('WASM_LAUNCH_NOT_ADMITTED');
  }
  const old = args.candidate.wasm_crossing;
  if (!exactKeys(args.successor, ['world_id', 'particular', 'runtime_id']) ||
      !Object.values(args.successor).every(v => typeof v === 'string' && v.trim() !== '') ||
      args.successor.world_id === old.source_world ||
      args.successor.particular === old.source_particular ||
      args.successor.runtime_id === old.extensions.wasm_vm.source_runtime_id) {
    throw new Error('WASM_SUCCESSOR_IDENTITY_NOT_FRESH');
  }
  if (!int32(args.left) || !int32(args.right)) throw new Error('INVALID_WASM_ARGUMENT');
  const {pid, result} = await executeInSeparateProcess(
    args.candidate.wasm_bytes, args.left, args.right, args.candidate.package.timeout_ms,
  );
  return {
    package_id: args.candidate.package.package_id,
    candidate_crossing_id: old.crossing_id,
    parent_crossing_id: args.candidate.parent_crossing.crossing_id,
    successor: { ...args.successor },
    pid,
    result,
    inherited_grants: [],
  };
}
