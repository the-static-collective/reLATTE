import { canonicalize, canonicalizeDomainValue, sha256Hex } from './canonical.ts';
import { sealCrossingEnvelope, verifyCrossingEnvelope, verifyReceipt } from './protocol.ts';
import type { P256KeyMaterial } from './protocol.ts';

export const VM_MANIFEST_DOMAIN = 'reLATTE-VM-Manifest-v0|';
export const VM_EVENT_DOMAIN = 'reLATTE-VM-Event-v0|';
export const VM_ENGINE = 'relatte.vm-bounded-interpreter/v0';

const VM_LAWS = [
  'DESCRIPTION != EXECUTION',
  'REPRODUCTION != ADMISSION',
  'CHILD != PARENT AUTHORITY',
  'HISTORY != CURRENT GRANT',
  'HOST ADMISSION != GUEST PROPOSAL',
] as const;

export interface VmManifest {
  schema: 'relatte.vm-manifest/v0';
  manifest_id: string;
  self_ref: string;
  engine: typeof VM_ENGINE;
  max_steps: number;
  max_depth: number;
  laws: string[];
}

export interface VmIdentity {
  world_id: string;
  particular: string;
  runtime_id: string;
}

export interface VmEvent {
  seq: number;
  op: 'INCREMENT' | 'SPAWN_GUEST';
  argument: number | string;
  previous_hash: string | null;
  event_hash: string;
}

export interface VmPredecessorEvidence {
  identity: VmIdentity;
  trace: VmEvent[];
  history_head: string | null;
  crossing_id: string;
}

function assertName(value: unknown, code: string): asserts value is string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(code);
}

function manifestBody(maxSteps: number, maxDepth: number) {
  return {
    schema: 'relatte.vm-manifest/v0' as const,
    engine: VM_ENGINE,
    max_steps: maxSteps,
    max_depth: maxDepth,
    laws: [...VM_LAWS],
  };
}

export function createVmManifest(maxSteps = 8, maxDepth = 2): VmManifest {
  if (!Number.isSafeInteger(maxSteps) || maxSteps < 1 || maxSteps > 128 ||
      !Number.isSafeInteger(maxDepth) || maxDepth < 0 || maxDepth > 4) {
    throw new Error('INVALID_VM_BOUNDS');
  }
  const body = manifestBody(maxSteps, maxDepth);
  const id = 'relatte-vm-manifest-v0:' + sha256Hex(
    canonicalizeDomainValue(VM_MANIFEST_DOMAIN, body),
  );
  // Content-addressed self-reference avoids impossible infinitely nested JSON.
  return { ...body, manifest_id: id, self_ref: id };
}

export function verifyVmManifest(value: unknown): value is VmManifest {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const v = value as VmManifest;
    return canonicalize(v) === canonicalize(createVmManifest(v.max_steps, v.max_depth));
  } catch {
    return false;
  }
}

function assertIdentity(identity: VmIdentity): void {
  if (!identity || typeof identity !== 'object') throw new Error('INVALID_VM_IDENTITY');
  assertName(identity.world_id, 'INVALID_VM_WORLD');
  assertName(identity.particular, 'INVALID_VM_PARTICULAR');
  assertName(identity.runtime_id, 'INVALID_VM_RUNTIME');
  if (Object.keys(identity).sort().join(',') !== 'particular,runtime_id,world_id') {
    throw new Error('INVALID_VM_IDENTITY_FIELDS');
  }
}

function eventHash(event: Omit<VmEvent, 'event_hash'>): string {
  return 'relatte-vm-event-v0:' + sha256Hex(canonicalizeDomainValue(VM_EVENT_DOMAIN, event));
}

export function verifyVmTrace(trace: unknown, maxSteps: number, expectedHead: unknown): trace is VmEvent[] {
  try {
    if (!Array.isArray(trace) || trace.length > maxSteps) return false;
    let previous: string | null = null;
    for (let i = 0; i < trace.length; i++) {
      const event = trace[i] as VmEvent;
      if (!event || typeof event !== 'object' || Array.isArray(event)) return false;
      if (Object.keys(event).sort().join(',') !==
          'argument,event_hash,op,previous_hash,seq') return false;
      if (event.seq !== i + 1 || event.previous_hash !== previous) return false;
      if (event.op === 'INCREMENT') {
        if (event.argument !== 1) return false;
      } else if (event.op === 'SPAWN_GUEST') {
        assertName(event.argument, 'INVALID_VM_GUEST_NAME');
      } else {
        return false;
      }
      const body = {
        seq: event.seq,
        op: event.op,
        argument: event.argument,
        previous_hash: event.previous_hash,
      };
      if (event.event_hash !== eventHash(body)) return false;
      previous = event.event_hash;
    }
    return expectedHead === previous;
  } catch {
    return false;
  }
}

function copy<T>(value: T): T {
  return JSON.parse(canonicalize(value)) as T;
}

/**
 * This is a bounded interpreter specimen, NOT a hardware VM, process sandbox,
 * general-purpose arbitrary-code executor, or a reLATTE authority root.
 */
export class RelatteVm {
  readonly manifest: VmManifest;
  readonly identity: VmIdentity;
  readonly depth: number;
  readonly predecessor: VmPredecessorEvidence | null;
  private events: VmEvent[] = [];
  private dead = false;

  constructor(
    manifest: VmManifest,
    identity: VmIdentity,
    depth = 0,
    predecessor: VmPredecessorEvidence | null = null,
  ) {
    if (!verifyVmManifest(manifest)) throw new Error('INVALID_VM_MANIFEST');
    assertIdentity(identity);
    if (!Number.isSafeInteger(depth) || depth < 0 || depth > manifest.max_depth) {
      throw new Error('VM_DEPTH_EXCEEDED');
    }
    this.manifest = copy(manifest);
    this.identity = copy(identity);
    this.depth = depth;
    this.predecessor = predecessor ? copy(predecessor) : null;
  }

  get historyHead(): string | null {
    return this.events.length ? this.events[this.events.length - 1].event_hash : null;
  }

  get trace(): VmEvent[] {
    return copy(this.events);
  }

  get counter(): number {
    return this.events.filter((event) => event.op === 'INCREMENT').length;
  }

  get active(): boolean {
    return !this.dead;
  }

  private append(op: VmEvent['op'], argument: number | string): void {
    if (this.dead) throw new Error('VM_IS_DEAD');
    if (this.events.length >= this.manifest.max_steps) throw new Error('VM_STEP_BUDGET_EXHAUSTED');
    const body = {
      seq: this.events.length + 1,
      op,
      argument,
      previous_hash: this.historyHead,
    };
    this.events.push({ ...body, event_hash: eventHash(body) });
  }

  increment(): number {
    this.append('INCREMENT', 1);
    return this.counter;
  }

  describeSelf(): VmManifest {
    if (this.dead) throw new Error('VM_IS_DEAD');
    return copy(this.manifest);
  }

  spawnGuest(identity: VmIdentity): RelatteVm {
    if (this.dead) throw new Error('VM_IS_DEAD');
    assertIdentity(identity);
    if (this.depth >= this.manifest.max_depth) throw new Error('VM_DEPTH_EXCEEDED');
    if (identity.world_id === this.identity.world_id ||
        identity.particular === this.identity.particular ||
        identity.runtime_id === this.identity.runtime_id) {
      throw new Error('VM_CHILD_IDENTITY_NOT_FRESH');
    }
    this.append('SPAWN_GUEST', identity.runtime_id);
    return new RelatteVm(this.manifest, identity, this.depth + 1);
  }

  async proposeSelf(keys: P256KeyMaterial, createdAt: string): Promise<Record<string, any>> {
    if (this.dead) throw new Error('VM_IS_DEAD');
    const manifest = this.describeSelf();
    const payloadHash = sha256Hex(Buffer.from(canonicalize(manifest), 'utf8'));
    return sealCrossingEnvelope({
      schema: 'relatte.crossing-envelope/v0',
      protocol_version: '0',
      source_particular: this.identity.particular,
      source_world: this.identity.world_id,
      source_history_head: this.historyHead,
      parents: [],
      declared_kind: 'RELATTE_VM_BOOT_CANDIDATE',
      payload_refs: [{
        address: 'sha256:' + payloadHash,
        role: 'vm-manifest',
        media_type: 'application/json',
      }],
      requested_effect: { kind: 'candidate-vm-boot', authority: 'receiver-local' },
      capability_ref: null,
      privacy_policy: null,
      audience_policy: null,
      return_address: null,
      created_at: createdAt,
      extensions: {
        vm: {
          manifest_id: manifest.manifest_id,
          source_runtime_id: this.identity.runtime_id,
          source_depth: this.depth,
          trace: this.trace,
          inherited_authority: false,
          requested_grants: [],
        },
      },
    }, keys);
  }

  terminate(): void {
    this.dead = true;
  }
}

export async function verifyVmCandidate(
  manifestValue: unknown,
  crossingValue: unknown,
): Promise<boolean> {
  try {
    if (!verifyVmManifest(manifestValue)) return false;
    if (!(await verifyCrossingEnvelope(crossingValue))) return false;
    const manifest = manifestValue as VmManifest;
    const crossing = crossingValue as Record<string, any>;
    if (crossing.declared_kind !== 'RELATTE_VM_BOOT_CANDIDATE' ||
        crossing.capability_ref !== null ||
        crossing.requested_effect?.kind !== 'candidate-vm-boot' ||
        crossing.requested_effect?.authority !== 'receiver-local' ||
        Object.keys(crossing.requested_effect).sort().join(',') !== 'authority,kind') return false;
    if (!Array.isArray(crossing.payload_refs) || crossing.payload_refs.length !== 1) return false;
    const ref = crossing.payload_refs[0];
    if (Object.keys(ref).sort().join(',') !== 'address,media_type,role' ||
        ref.role !== 'vm-manifest' || ref.media_type !== 'application/json' ||
        ref.address !== 'sha256:' + sha256Hex(Buffer.from(canonicalize(manifest), 'utf8'))) return false;
    if (Object.keys(crossing.extensions ?? {}).join(',') !== 'vm') return false;
    const vm = crossing.extensions.vm;
    if (!vm || typeof vm !== 'object' ||
        Object.keys(vm).sort().join(',') !==
          'inherited_authority,manifest_id,requested_grants,source_depth,source_runtime_id,trace') return false;
    assertName(crossing.source_world, 'INVALID_VM_SOURCE_WORLD');
    assertName(crossing.source_particular, 'INVALID_VM_SOURCE_PARTICULAR');
    assertName(vm.source_runtime_id, 'INVALID_VM_SOURCE_RUNTIME');
    if (vm.manifest_id !== manifest.manifest_id ||
        vm.inherited_authority !== false ||
        !Array.isArray(vm.requested_grants) || vm.requested_grants.length !== 0 ||
        !Number.isSafeInteger(vm.source_depth) ||
        vm.source_depth < 0 || vm.source_depth > manifest.max_depth) return false;
    return verifyVmTrace(vm.trace, manifest.max_steps, crossing.source_history_head);
  } catch {
    return false;
  }
}

export interface VmAdmissionEvidence {
  receive_receipt: Record<string, any>;
  admit_receipt: Record<string, any>;
  owner: {
    world_id: string;
    receiver_particular: string;
    contract_ref: string;
    public_key: JsonWebKey;
  };
}

export async function verifyVmAdmission(
  manifest: unknown,
  crossing: unknown,
  evidence: VmAdmissionEvidence,
): Promise<boolean> {
  try {
    if (!(await verifyVmCandidate(manifest, crossing))) return false;
    const c = crossing as Record<string, any>;
    const { receive_receipt: received, admit_receipt: admitted, owner } = evidence;
    if (!(await verifyReceipt(received)) || !(await verifyReceipt(admitted))) return false;
    if (received.crossing_id !== c.crossing_id || admitted.crossing_id !== c.crossing_id ||
        received.kind !== 'RECEIVED' || received.semantic_effect !== 'none' ||
        admitted.kind !== 'R3_ADMIT' || admitted.semantic_effect !== 'relatte-vm-boot') return false;
    if (received.world_id !== owner.world_id || admitted.world_id !== owner.world_id ||
        received.receiver_particular !== owner.receiver_particular ||
        admitted.receiver_particular !== owner.receiver_particular ||
        received.contract_ref !== owner.contract_ref ||
        admitted.contract_ref !== owner.contract_ref) return false;
    if (owner.world_id === c.source_world ||
        owner.receiver_particular === c.source_particular) return false;
    if (canonicalize(received.signing.public_key) !== canonicalize(owner.public_key) ||
        canonicalize(admitted.signing.public_key) !== canonicalize(owner.public_key)) return false;
    if (admitted.extensions?.local_receiver?.receive_receipt_id !== received.receipt_id ||
        admitted.extensions?.local_receiver?.disposition !== 'ADMIT') return false;
    return true;
  } catch {
    return false;
  }
}

export async function bootAdmittedVm(args: {
  manifest: VmManifest;
  crossing: Record<string, any>;
  evidence: VmAdmissionEvidence;
  successor_identity: VmIdentity;
}): Promise<RelatteVm> {
  if (!(await verifyVmAdmission(args.manifest, args.crossing, args.evidence))) {
    throw new Error('VM_ADMISSION_NOT_VERIFIED');
  }
  assertIdentity(args.successor_identity);
  const crossing = args.crossing;
  if (args.successor_identity.world_id === crossing.source_world ||
      args.successor_identity.particular === crossing.source_particular ||
      args.successor_identity.runtime_id === crossing.extensions.vm.source_runtime_id) {
    throw new Error('VM_SUCCESSOR_IDENTITY_NOT_FRESH');
  }
  const predecessor: VmPredecessorEvidence = {
    identity: {
      world_id: crossing.source_world,
      particular: crossing.source_particular,
      runtime_id: crossing.extensions.vm.source_runtime_id,
    },
    trace: crossing.extensions.vm.trace,
    history_head: crossing.source_history_head,
    crossing_id: crossing.crossing_id,
  };
  // Fresh counter/step budget, no inherited grants, no predecessor private key.
  return new RelatteVm(args.manifest, args.successor_identity, 0, predecessor);
}
