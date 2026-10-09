import { randomUUID } from 'node:crypto';
import { mkdir, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { LocalReceiver } from './receiver.ts';

import { canonicalize, canonicalizeDomainValue, sha256Hex, validateTimestamp } from './canonical.ts';
import { sealCrossingEnvelope, sealReceipt, verifyCrossingEnvelope, verifyReceipt } from './protocol.ts';
import type { P256KeyMaterial } from './protocol.ts';
import { verifyWasmVmCandidate, verifyWasmVmAdmission } from './wasm-vm.ts';
import type { WasmVmCandidate } from './wasm-vm.ts';
import { runWitnessedWasmVm, verifyWasmExecutionWitness, wasmInputDigest } from './wasm-witness.ts';
import type { Vm003Verification, Vm003Witness } from './wasm-witness.ts';
import type { VmAdmissionEvidence, VmIdentity } from './vm.ts';

export const VM004_OFFER_KIND = 'RELATTE_VM004_PEER_OFFER';
export const VM004_ACK_KIND = 'R16_VM004_PEER_ACK';
export const VM004_GRANT_KIND = 'R16_VM004_RUN_GRANT';
export const VM004_USAGE_KIND = 'R16_VM004_USAGE_WITNESS';
export const VM004_CONTRACT = 'relatte.vm004-host-lease/v0';
const MAX_OFFER_MS = 60 * 60 * 1000;
const MAX_LEASE_MS = 5 * 60 * 1000;

export interface Vm004Pins {
  sender_public_key: JsonWebKey;
  receiver_public_key: JsonWebKey;
  receiver_world_id: string;
  receiver_particular: string;
}

export interface Vm004Handshake {
  candidate: WasmVmCandidate;
  offer: Record<string, any>;
  ack: Record<string, any>;
  pins: Vm004Pins;
}
export interface Vm004AuthorizedLease extends Vm004Handshake {
  evidence: VmAdmissionEvidence;
  grant: Record<string, any>;
}
export interface Vm004RunResult {
  observed: Vm003Witness;
  usage_receipt: Record<string, any>;
  claim_id: string;
}

function record(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function keys(value: unknown, expected: string[]): value is Record<string, any> {
  return record(value) && Object.keys(value).sort().join(',') === [...expected].sort().join(',');
}
function nonEmpty(x: unknown): x is string {
  return typeof x === 'string' && x.length > 0 && x.length <= 192;
}
function int32(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) &&
    value >= -2147483648 && value <= 2147483647;
}
function same(a: unknown, b: unknown): boolean {
  return canonicalize(a) === canonicalize(b);
}
function time(value: unknown): number {
  validateTimestamp(value);
  const millis = Date.parse(value);
  if (!Number.isSafeInteger(millis) || new Date(millis).toISOString() !== new Date(value).toISOString()) {
    throw new Error('VM004_INVALID_TIME');
  }
  return millis;
}
function requireInterval(start: unknown, end: unknown, max: number): void {
  const a = time(start), b = time(end);
  if (b <= a || b - a > max) throw new Error('VM004_INVALID_INTERVAL');
}
function reqPins(pins: Vm004Pins): void {
  if (!pins || !nonEmpty(pins.receiver_world_id) || !nonEmpty(pins.receiver_particular) ||
      !record(pins.sender_public_key) || !record(pins.receiver_public_key) ||
      same(pins.sender_public_key, pins.receiver_public_key)) throw new Error('VM004_INVALID_PINS');
}
function packageRef(candidate: WasmVmCandidate): string {
  return 'sha256:' + sha256Hex(Buffer.from(canonicalize(candidate.package), 'utf8'));
}
function offerBody(candidate: WasmVmCandidate, pins: Vm004Pins, left: number, right: number,
    nonce: string, expires: string) {
  return {
    schema: VM004_CONTRACT,
    candidate_crossing_id: candidate.wasm_crossing.crossing_id,
    package_id: candidate.package.package_id,
    wasm_sha256: candidate.package.wasm_sha256,
    target_world_id: pins.receiver_world_id,
    target_particular: pins.receiver_particular,
    target_key: pins.receiver_public_key,
    nonce,
    input: { left, right },
    input_digest: wasmInputDigest(left, right),
    expires_at: expires,
    inherited_authority: false,
    requested_grants: [],
  };
}

export async function createVm004Offer(args: {
  candidate: WasmVmCandidate;
  sender_keys: P256KeyMaterial;
  sender_world_id: string;
  sender_particular: string;
  pins: Vm004Pins;
  left: number;
  right: number;
  created_at: string;
  expires_at: string;
}): Promise<Record<string, any>> {
  reqPins(args.pins);
  if (!(await verifyWasmVmCandidate(args.candidate))) throw new Error('VM004_INVALID_CANDIDATE');
  if (!nonEmpty(args.sender_world_id) || !nonEmpty(args.sender_particular) ||
      args.sender_world_id === args.pins.receiver_world_id ||
      args.sender_particular === args.pins.receiver_particular ||
      !int32(args.left) || !int32(args.right) ||
      !same(args.sender_keys.publicKeyJwk, args.pins.sender_public_key)) {
    throw new Error('VM004_INVALID_OFFER_ISSUER');
  }
  requireInterval(args.created_at, args.expires_at, MAX_OFFER_MS);
  const nonce = randomUUID();
  const crossing = await sealCrossingEnvelope({
    schema: 'relatte.crossing-envelope/v0',
    protocol_version: '0',
    source_world: args.sender_world_id,
    source_particular: args.sender_particular,
    source_history_head: null,
    parents: [args.candidate.wasm_crossing.crossing_id],
    declared_kind: VM004_OFFER_KIND,
    payload_refs: [{
      address: packageRef(args.candidate),
      media_type: 'application/json',
      role: 'wasm-package',
    }],
    requested_effect: { kind: 'propose-remote-execution', authority: 'receiver-local' },
    capability_ref: null,
    privacy_policy: null,
    audience_policy: null,
    return_address: null,
    created_at: args.created_at,
    extensions: { vm004: offerBody(args.candidate, args.pins, args.left, args.right, nonce, args.expires_at) },
  }, args.sender_keys);
  if (!(await verifyVm004Offer(args.candidate, crossing, args.pins))) {
    throw new Error('VM004_OFFER_FAILED_VERIFICATION');
  }
  return crossing;
}

export async function verifyVm004Offer(
  candidate: WasmVmCandidate, offer: unknown, pins: Vm004Pins,
): Promise<boolean> {
  try {
    reqPins(pins);
    if (!(await verifyWasmVmCandidate(candidate)) || !(await verifyCrossingEnvelope(offer))) return false;
    if (!record(offer) || !keys(offer.extensions, ['vm004']) ||
        !keys(offer.requested_effect, ['kind', 'authority']) ||
        offer.declared_kind !== VM004_OFFER_KIND ||
        offer.requested_effect.kind !== 'propose-remote-execution' ||
        offer.requested_effect.authority !== 'receiver-local' ||
        offer.capability_ref !== null || offer.source_history_head !== null ||
        !nonEmpty(offer.source_world) || !nonEmpty(offer.source_particular) ||
        offer.source_world === pins.receiver_world_id ||
        offer.source_particular === pins.receiver_particular ||
        !same(offer.signing.public_key, pins.sender_public_key) ||
        !same(offer.parents, [candidate.wasm_crossing.crossing_id]) ||
        !same(offer.payload_refs, [{
          address: packageRef(candidate), role: 'wasm-package', media_type: 'application/json',
        }])) return false;
    const x = offer.extensions.vm004;
    if (!keys(x, [
      'schema','candidate_crossing_id','package_id','wasm_sha256',
      'target_world_id','target_particular','target_key','nonce','input',
      'input_digest','expires_at','inherited_authority','requested_grants',
    ]) || !keys(x.input, ['left','right']) ||
        !int32(x.input.left) || !int32(x.input.right) ||
        !nonEmpty(x.nonce) || !/^[0-9a-f-]{36}$/.test(x.nonce) ||
        !same(x, offerBody(candidate,pins,x.input.left,x.input.right,x.nonce,x.expires_at))) return false;
    requireInterval(offer.created_at,x.expires_at,MAX_OFFER_MS);
    return true;
  } catch {
    return false;
  }
}

export async function createVm004Ack(args: {
  candidate: WasmVmCandidate;
  offer: Record<string, any>;
  pins: Vm004Pins;
  receiver_keys: P256KeyMaterial;
  created_at: string;
}): Promise<Record<string, any>> {
  if (!(await verifyVm004Offer(args.candidate,args.offer,args.pins)) ||
      !same(args.receiver_keys.publicKeyJwk,args.pins.receiver_public_key)) {
    throw new Error('VM004_OFFER_OR_RECIPIENT_INVALID');
  }
  if (time(args.created_at) >= time(args.offer.extensions.vm004.expires_at)) {
    throw new Error('VM004_OFFER_EXPIRED');
  }
  const ack = await sealReceipt({
    schema: 'relatte.receipt/v0',
    crossing_id: args.offer.crossing_id,
    world_id: args.pins.receiver_world_id,
    receiver_particular: args.pins.receiver_particular,
    kind: VM004_ACK_KIND,
    semantic_effect: 'none',
    contract_ref: VM004_CONTRACT,
    pre_state_ref: args.offer.crossing_id,
    post_state_ref: args.offer.crossing_id,
    descendant_refs: [],
    residual_refs: [],
    note: 'signed peer acknowledgment is not R3 admission or execution permission',
    created_at: args.created_at,
    extensions: { vm004: {
      schema: VM004_CONTRACT,
      offer_id: args.offer.crossing_id,
      nonce: args.offer.extensions.vm004.nonce,
      executable: args.candidate.package.package_id,
      admission: false,
    }},
  },args.receiver_keys);
  if (!(await verifyVm004Ack(args.candidate,args.offer,ack,args.pins))) {
    throw new Error('VM004_ACK_FAILED_VERIFICATION');
  }
  return ack;
}

export async function verifyVm004Ack(
  candidate: WasmVmCandidate, offer: unknown, ack: unknown, pins: Vm004Pins,
): Promise<boolean> {
  try {
    if (!(await verifyVm004Offer(candidate,offer,pins)) ||
        !(await verifyReceipt(ack)) || !record(ack) || !record(offer)) return false;
    const x = ack.extensions?.vm004;
    return ack.kind === VM004_ACK_KIND && ack.semantic_effect === 'none' &&
      ack.contract_ref === VM004_CONTRACT &&
      ack.crossing_id === offer.crossing_id &&
      ack.world_id === pins.receiver_world_id &&
      ack.receiver_particular === pins.receiver_particular &&
      ack.pre_state_ref === offer.crossing_id &&
      ack.post_state_ref === ack.pre_state_ref &&
      same(ack.signing.public_key,pins.receiver_public_key) &&
      same(ack.descendant_refs,[]) && same(ack.residual_refs,[]) &&
      keys(ack.extensions,['vm004']) &&
      same(x, {
        schema: VM004_CONTRACT,offer_id:offer.crossing_id,
        nonce:offer.extensions.vm004.nonce,
        executable:candidate.package.package_id,admission:false,
      }) &&
      time(ack.created_at) < time(offer.extensions.vm004.expires_at) &&
      time(ack.created_at) >= time(offer.created_at);
  } catch {
    return false;
  }
}

export async function createVm004Grant(args: {
  handshake: Vm004Handshake;
  evidence: VmAdmissionEvidence;
  receiver_keys: P256KeyMaterial;
  created_at: string;
  expires_at: string;
}): Promise<Record<string, any>> {
  const { candidate,offer,ack,pins } = args.handshake;
  if (!(await verifyVm004Ack(candidate,offer,ack,pins)) ||
      !(await verifyWasmVmAdmission(candidate,args.evidence)) ||
      !same(args.receiver_keys.publicKeyJwk,pins.receiver_public_key) ||
      args.evidence.owner.world_id !== pins.receiver_world_id ||
      args.evidence.owner.receiver_particular !== pins.receiver_particular) {
    throw new Error('VM004_GRANT_REQUIRES_OWNER_ADMISSION');
  }
  requireInterval(args.created_at,args.expires_at,MAX_LEASE_MS);
  if (time(args.created_at) < time(ack.created_at) ||
      time(args.expires_at) > time(offer.extensions.vm004.expires_at)) {
    throw new Error('VM004_GRANT_OUTSIDE_OFFER');
  }
  const grant = await sealReceipt({
    schema: 'relatte.receipt/v0',
    crossing_id: candidate.wasm_crossing.crossing_id,
    world_id: pins.receiver_world_id,
    receiver_particular: pins.receiver_particular,
    kind: VM004_GRANT_KIND,
    semantic_effect: 'none',
    contract_ref: VM004_CONTRACT,
    pre_state_ref: args.evidence.admit_receipt.receipt_id,
    post_state_ref: args.evidence.admit_receipt.receipt_id,
    descendant_refs: [],
    residual_refs: [],
    note: 'bounded local run token; no transferable host capability',
    created_at: args.created_at,
    extensions: {vm004: {
      schema: VM004_CONTRACT,
      offer_id: offer.crossing_id,
      ack_receipt_id: ack.receipt_id,
      admit_receipt_id: args.evidence.admit_receipt.receipt_id,
      nonce: offer.extensions.vm004.nonce,
      input_digest: offer.extensions.vm004.input_digest,
      not_before: args.created_at,
      expires_at: args.expires_at,
      max_uses: 1,
      inherited_grants: [],
    }},
  },args.receiver_keys);
  if (!(await verifyVm004Grant({...args.handshake,evidence:args.evidence,grant}))) {
    throw new Error('VM004_GRANT_FAILED_VERIFICATION');
  }
  return grant;
}

export async function verifyVm004Grant(lease: Vm004AuthorizedLease): Promise<boolean> {
  try {
    const {candidate,offer,ack,pins,evidence,grant} = lease;
    if (!(await verifyVm004Ack(candidate,offer,ack,pins)) ||
        !(await verifyWasmVmAdmission(candidate,evidence)) ||
        !(await verifyReceipt(grant)) ||
        evidence.owner.world_id !== pins.receiver_world_id ||
        evidence.owner.receiver_particular !== pins.receiver_particular) return false;
    const x = grant.extensions?.vm004;
    if (!keys(grant.extensions,['vm004']) ||
        !keys(x, [
          'schema','offer_id','ack_receipt_id','admit_receipt_id','nonce',
          'input_digest','not_before','expires_at','max_uses','inherited_grants',
        ]) ||
        grant.kind !== VM004_GRANT_KIND || grant.semantic_effect !== 'none' ||
        grant.contract_ref !== VM004_CONTRACT ||
        grant.crossing_id !== candidate.wasm_crossing.crossing_id ||
        grant.world_id !== pins.receiver_world_id ||
        grant.receiver_particular !== pins.receiver_particular ||
        grant.pre_state_ref !== evidence.admit_receipt.receipt_id ||
        grant.post_state_ref !== grant.pre_state_ref ||
        !same(grant.signing.public_key,pins.receiver_public_key) ||
        !same(grant.descendant_refs,[]) || !same(grant.residual_refs,[]) ||
        !same(x,{
          schema: VM004_CONTRACT,offer_id:offer.crossing_id,
          ack_receipt_id:ack.receipt_id,
          admit_receipt_id:evidence.admit_receipt.receipt_id,
          nonce:offer.extensions.vm004.nonce,
          input_digest:offer.extensions.vm004.input_digest,
          not_before:grant.created_at,expires_at:x.expires_at,
          max_uses:1,inherited_grants:[],
        })) return false;
    requireInterval(x.not_before,x.expires_at,MAX_LEASE_MS);
    return time(x.not_before) >= time(ack.created_at) &&
      time(x.expires_at) <= time(offer.extensions.vm004.expires_at);
  } catch {
    return false;
  }
}

/** Owner-local atomic claim. Spent before execution; errors/crashes burn lease.
 * Local filesystem is the trust boundary; not a cluster-wide spent ledger.
 */
async function claimOnce(hostRoot: string, nonce: string, grantId: string): Promise<string> {
  const root = await realpath(hostRoot);
  const folder = join(root,'vm004-spent');
  await mkdir(folder,{recursive:true,mode:0o700});
  const claimId = sha256Hex(Buffer.from(nonce,'utf8'));
  try {
    await writeFile(join(folder,claimId+'.json'),
      JSON.stringify({nonce,grant_id:grantId})+'\n',
      {flag:'wx',mode:0o600});
  } catch (error: any) {
    if (error?.code === 'EEXIST') throw new Error('VM004_LEASE_ALREADY_SPENT');
    throw error;
  }
  return 'sha256:'+claimId;
}

export async function runVm004Lease(args: {
  lease: Vm004AuthorizedLease;
  host_root: string;
  successor: VmIdentity;
  witness_keys: P256KeyMaterial;
  receiver_keys: P256KeyMaterial;
  pinned_witness_key: JsonWebKey;
  runner_label: string;
  observed_at: string;
}): Promise<Vm004RunResult> {
  const {candidate,offer,pins,evidence,grant} = args.lease;
  if (!(await verifyVm004Grant(args.lease))) throw new Error('VM004_INVALID_GRANT');
  if (!same(args.receiver_keys.publicKeyJwk,pins.receiver_public_key)) {
    throw new Error('VM004_RECIPIENT_SIGNER_MISMATCH');
  }
  const now=Date.now();
  const x=grant.extensions.vm004;
  if (now < time(x.not_before) || now >= time(x.expires_at)) throw new Error('VM004_LEASE_EXPIRED_OR_EARLY');
  const input = offer.extensions.vm004.input;
  if (!same(args.witness_keys.publicKeyJwk,args.pinned_witness_key) ||
      same(args.witness_keys.publicKeyJwk,pins.receiver_public_key) ||
      same(args.witness_keys.publicKeyJwk,pins.sender_public_key)) {
    throw new Error('VM004_WITNESS_KEY_MISMATCH');
  }
  // Prevent revoked/deleted receiver from burning a lease without execution.
  let receiver: LocalReceiver;
  try {receiver = await LocalReceiver.open(args.host_root);}
  catch {throw new Error('VM004_HOST_NOT_LIVE');}
  const snapshot=receiver.snapshot();
  if (snapshot.world_id !== pins.receiver_world_id ||
      snapshot.receiver_particular !== pins.receiver_particular ||
      receiver.config.contract_ref !== evidence.owner.contract_ref ||
      !snapshot.admitted.includes(candidate.wasm_crossing.crossing_id) ||
      receiver.getDispositionReceipt(candidate.wasm_crossing.crossing_id)?.receipt_id !==
        evidence.admit_receipt.receipt_id) throw new Error('VM004_HOST_NOT_ADMITTED');
  const claimId=await claimOnce(args.host_root,x.nonce,grant.receipt_id);
  const observed=await runWitnessedWasmVm({
    candidate,evidence,host_root:args.host_root,
    successor:args.successor,left:input.left,right:input.right,
    witness_keys:args.witness_keys,runner_label:args.runner_label,
    observed_at:args.observed_at,
  });
  if (!(await verifyWasmExecutionWitness({
    candidate,evidence,receipt:observed.receipt,
    pinned_witness_key:args.pinned_witness_key,
  }))) throw new Error('VM004_OBSERVATION_INVALID');
  const v=observed.receipt.extensions.vm003;
  const usage = await sealReceipt({
    schema:'relatte.receipt/v0',
    crossing_id:candidate.wasm_crossing.crossing_id,
    world_id:pins.receiver_world_id,
    receiver_particular:pins.receiver_particular,
    kind:VM004_USAGE_KIND,
    semantic_effect:'none',
    contract_ref:VM004_CONTRACT,
    pre_state_ref:grant.receipt_id,
    post_state_ref:grant.receipt_id,
    descendant_refs:[],
    residual_refs:[observed.receipt.receipt_id],
    note:'receiver reports execution witness; measurements are host-observed',
    created_at:args.observed_at,
    extensions:{vm004:{
      schema:VM004_CONTRACT,
      grant_id:grant.receipt_id,
      execution_nonce:x.nonce,
      claim_id:claimId,
      witness_receipt_id:observed.receipt.receipt_id,
      input_digest:x.input_digest,
      output_digest:v.output_digest,
      observed_wall_ms:v.resource.observed_wall_ms,
      report_source:'host-observed-not-independent-hardware-metering',
      inherited_grants:[],
    }},
  },args.receiver_keys);
  return {observed,usage_receipt:usage,claim_id:claimId};
}

export async function verifyVm004Usage(args: {
  lease: Vm004AuthorizedLease;
  receipt: Record<string,any>;
  witness_receipt: Record<string,any>;
  pinned_witness_key: JsonWebKey;
}): Promise<boolean> {
  try {
    if (!(await verifyVm004Grant(args.lease)) ||
        !(await verifyWasmExecutionWitness({
          candidate:args.lease.candidate,evidence:args.lease.evidence,
          receipt:args.witness_receipt,pinned_witness_key:args.pinned_witness_key,
        })) || !(await verifyReceipt(args.receipt))) return false;
    const {lease,receipt:r,witness_receipt:w} = args;
    const grant=lease.grant, ext=r.extensions?.vm004;
    const wx=w.extensions.vm003;
    return r.kind===VM004_USAGE_KIND &&
      r.semantic_effect==='none' && r.contract_ref===VM004_CONTRACT &&
      r.crossing_id===lease.candidate.wasm_crossing.crossing_id &&
      r.world_id===lease.pins.receiver_world_id &&
      r.receiver_particular===lease.pins.receiver_particular &&
      r.pre_state_ref===grant.receipt_id &&
      r.post_state_ref===grant.receipt_id &&
      same(r.signing.public_key,lease.pins.receiver_public_key) &&
      same(r.descendant_refs,[]) &&
      same(r.residual_refs,[w.receipt_id]) &&
      keys(r.extensions,['vm004']) &&
      same(ext,{
        schema:VM004_CONTRACT,
        grant_id:grant.receipt_id,
        execution_nonce:grant.extensions.vm004.nonce,
        claim_id:'sha256:'+sha256Hex(Buffer.from(grant.extensions.vm004.nonce,'utf8')),
        witness_receipt_id:w.receipt_id,
        input_digest:grant.extensions.vm004.input_digest,
        output_digest:wx.output_digest,
        observed_wall_ms:wx.resource.observed_wall_ms,
        report_source:'host-observed-not-independent-hardware-metering',
        inherited_grants:[],
      }) &&
      wx.input_digest===grant.extensions.vm004.input_digest;
  } catch {
    return false;
  }
}
