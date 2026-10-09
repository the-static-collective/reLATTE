import { canonicalize, canonicalizeDomainValue, sha256Hex, validateTimestamp } from './canonical.ts';
import { sealReceipt, verifyCrossingEnvelope, verifyReceipt } from './protocol.ts';
import type { P256KeyMaterial } from './protocol.ts';
import { LocalReceiver } from './receiver.ts';

export const CROSSING_FIELD_DOMAIN = 'reLATTE-TransportComposition001-v0|';
export const CROSSING_FIELD_OBSERVATION_KIND = 'TRANSPORT_FRAGMENT_OBSERVED';
export const CROSSING_FIELD_CONTRACT = 'relatte.transport-composition-001/v0';
export type FieldCarrierKind =
  | 'bluetooth' | 'wifi-direct' | 'wifi-mesh'
  | 'telephone-audio' | 'cellular-sms' | 'lora-unlicensed'
  | 'amateur-radio' | 'internet' | 'file-courier';

const LIMIT_BYTES = 256 * 1024;
const LIMIT_FRAGMENTS = 4096;
const CARRIER_MAX_FRAGMENT: Record<FieldCarrierKind, number> = {
  bluetooth: 512,
  'wifi-direct': 8192,
  'wifi-mesh': 8192,
  'telephone-audio': 256,
  'cellular-sms': 120,
  'lora-unlicensed': 96,
  'amateur-radio': 0,
  internet: 8192,
  'file-courier': 8192,
};

const LAWS = [
  'TRANSPORT != CROSSING',
  'DELIVERY != ADMISSION',
  'ROUTE OBSERVATION != PHYSICAL ATTESTATION',
  'DUPLICATE ARRIVAL != DUPLICATE AUTHORITY',
  'MISSING FRAGMENT != COMPLETE DELIVERY',
];

export interface CrossingFieldManifest {
  schema: 'relatte.crossing-field-manifest/v0';
  crossing_id: string;
  canonical_sha256: string;
  byte_length: number;
  chunk_size: number;
  fragment_count: number;
  transfer_id: string;
}

export interface CrossingCarrierFragment {
  schema: 'relatte.carrier-fragment/v0';
  transfer_id: string;
  packet_id: string;
  crossing_id: string;
  carrier: FieldCarrierKind;
  route_id: string;
  index: number;
  fragment_count: number;
  data_base64url: string;
  fragment_sha256: string;
  sent_at: string;
}

export interface CarrierRouteObservation {
  packet_id: string;
  route_id: string;
  carrier: FieldCarrierKind;
  index: number;
  status: 'STORED' | 'DUPLICATE' | 'HOLD';
  reason: string;
  receipt: Record<string, any>;
}

export type CrossingReconstruction =
  | { state: 'INCOMPLETE'; missing: number[]; route_history: CarrierRouteObservation[] }
  | { state: 'HOLD'; reasons: string[]; route_history: CarrierRouteObservation[] }
  | { state: 'RECONSTRUCTED'; crossing: Record<string, any>; route_history: CarrierRouteObservation[] };

function object(v: unknown): v is Record<string, any> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function exact(v: unknown, fields: string[]): v is Record<string, any> {
  return object(v) && Object.keys(v).sort().join('|') === fields.slice().sort().join('|');
}
function str(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= 256;
}
function hex(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
}
function sha(bytes: Uint8Array): string {
  return sha256Hex(bytes);
}
function transferBody(crossingId: string, digest: string, length: number, chunk: number, count: number) {
  return {
    schema: 'relatte.crossing-field-manifest/v0' as const,
    crossing_id: crossingId,
    canonical_sha256: digest,
    byte_length: length,
    chunk_size: chunk,
    fragment_count: count,
  };
}
function transferId(body: ReturnType<typeof transferBody>): string {
  return 'relatte-crossing-field-v0:' + sha256Hex(
    canonicalizeDomainValue(CROSSING_FIELD_DOMAIN, body),
  );
}
function canonicalCrossingBytes(crossing: unknown): Buffer {
  return Buffer.from(canonicalize(crossing), 'utf8');
}

export async function createCrossingFieldManifest(
  crossing: unknown, chunkSize: number,
): Promise<CrossingFieldManifest> {
  if (!(await verifyCrossingEnvelope(crossing)) ||
      !object(crossing) || !str(crossing.crossing_id)) {
    throw new Error('FIELD_INVALID_SIGNED_CROSSING');
  }
  if (!Number.isSafeInteger(chunkSize) || chunkSize < 16 || chunkSize > 8192) {
    throw new Error('FIELD_INVALID_CHUNK_SIZE');
  }
  const bytes = canonicalCrossingBytes(crossing);
  if (bytes.length === 0 || bytes.length > LIMIT_BYTES) throw new Error('FIELD_CROSSING_SIZE_LIMIT');
  const count = Math.ceil(bytes.length / chunkSize);
  if (count > LIMIT_FRAGMENTS) throw new Error('FIELD_FRAGMENT_LIMIT');
  const body = transferBody(crossing.crossing_id,sha(bytes),bytes.length,chunkSize,count);
  return { ...body, transfer_id: transferId(body) };
}

export function verifyCrossingFieldManifest(value: unknown): value is CrossingFieldManifest {
  if (!exact(value,[
    'schema','crossing_id','canonical_sha256','byte_length',
    'chunk_size','fragment_count','transfer_id',
  ]) || value.schema !== 'relatte.crossing-field-manifest/v0' ||
      !str(value.crossing_id) || !hex(value.canonical_sha256) ||
      !Number.isSafeInteger(value.byte_length) ||
      value.byte_length <= 0 || value.byte_length > LIMIT_BYTES ||
      !Number.isSafeInteger(value.chunk_size) ||
      value.chunk_size < 16 || value.chunk_size > 8192 ||
      value.fragment_count !== Math.ceil(value.byte_length/value.chunk_size) ||
      value.fragment_count > LIMIT_FRAGMENTS ||
      !str(value.transfer_id)) return false;
  const body = transferBody(value.crossing_id,value.canonical_sha256,
    value.byte_length,value.chunk_size,value.fragment_count);
  return value.transfer_id === transferId(body);
}

const PACKET_FIELDS = [
  'schema','transfer_id','packet_id','crossing_id','carrier',
  'route_id','index','fragment_count','data_base64url','fragment_sha256','sent_at',
];

function packetId(packet: Omit<CrossingCarrierFragment,'packet_id'>): string {
  return 'relatte-carrier-packet-v0:' + sha256Hex(
    canonicalizeDomainValue('reLATTE-CarrierPacket-v0|',packet),
  );
}

function unpack(raw: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(raw)) throw new Error('FIELD_NONCANONICAL_BASE64');
  const bytes=Buffer.from(raw,'base64url');
  if (bytes.length===0 || bytes.toString('base64url')!==raw) {
    throw new Error('FIELD_NONCANONICAL_BASE64');
  }
  return bytes;
}

export async function makeCarrierFragment(args: {
  manifest: CrossingFieldManifest;
  crossing: Record<string, any>;
  index: number;
  carrier: FieldCarrierKind;
  route_id: string;
  sent_at: string;
}): Promise<CrossingCarrierFragment> {
  const {manifest,crossing,index,carrier,route_id,sent_at}=args;
  if (!verifyCrossingFieldManifest(manifest) ||
      !(await verifyCrossingEnvelope(crossing)) ||
      manifest.crossing_id!==crossing.crossing_id) throw new Error('FIELD_BAD_SOURCE');
  const bytes=canonicalCrossingBytes(crossing);
  if (sha(bytes)!==manifest.canonical_sha256 || bytes.length!==manifest.byte_length) {
    throw new Error('FIELD_SOURCE_BYTES_MISMATCH');
  }
  if (!Number.isSafeInteger(index) || index<0 || index>=manifest.fragment_count) {
    throw new Error('FIELD_INVALID_FRAGMENT_INDEX');
  }
  if (!str(route_id)) throw new Error('FIELD_INVALID_ROUTE_ID');
  validateTimestamp(sent_at);
  const max=CARRIER_MAX_FRAGMENT[carrier];
  if (max===undefined) throw new Error('FIELD_UNKNOWN_CARRIER');
  if (max===0) throw new Error('FIELD_HAM_CROSSING_BYTES_DENIED');
  const part=bytes.subarray(index*manifest.chunk_size,(index+1)*manifest.chunk_size);
  if (part.length>max) throw new Error('FIELD_CARRIER_CAPACITY_EXCEEDED');
  const body: Omit<CrossingCarrierFragment,'packet_id'> = {
    schema:'relatte.carrier-fragment/v0',
    transfer_id:manifest.transfer_id,
    crossing_id:manifest.crossing_id,
    carrier,route_id,index,fragment_count:manifest.fragment_count,
    data_base64url:part.toString('base64url'),
    fragment_sha256:sha(part),
    sent_at,
  };
  return {...body,packet_id:packetId(body)};
}

export function verifyCarrierFragment(
  value: unknown, manifest: CrossingFieldManifest,
): { packet: CrossingCarrierFragment; bytes: Buffer } {
  if (!verifyCrossingFieldManifest(manifest) ||
      !exact(value,PACKET_FIELDS) ||
      value.schema!=='relatte.carrier-fragment/v0' ||
      value.transfer_id!==manifest.transfer_id ||
      value.crossing_id!==manifest.crossing_id ||
      value.fragment_count!==manifest.fragment_count ||
      !Number.isSafeInteger(value.index) || value.index<0 ||
      value.index>=manifest.fragment_count ||
      !str(value.route_id) ||
      !str(value.packet_id) ||
      !hex(value.fragment_sha256)) throw new Error('FIELD_INVALID_PACKET');
  const max=CARRIER_MAX_FRAGMENT[value.carrier as FieldCarrierKind];
  if (max===undefined) throw new Error('FIELD_UNKNOWN_CARRIER');
  if (max===0) throw new Error('FIELD_HAM_CROSSING_BYTES_DENIED');
  validateTimestamp(value.sent_at);
  const bytes=unpack(value.data_base64url);
  const expected=Math.min(manifest.chunk_size,manifest.byte_length-value.index*manifest.chunk_size);
  if (bytes.length!==expected || bytes.length>max) throw new Error('FIELD_PART_SIZE_INVALID');
  if (sha(bytes)!==value.fragment_sha256) throw new Error('FIELD_PART_DIGEST_MISMATCH');
  const {packet_id,...body}=value;
  if (packet_id!==packetId(body as Omit<CrossingCarrierFragment,'packet_id'>)) {
    throw new Error('FIELD_PACKET_ID_MISMATCH');
  }
  return {packet:value as CrossingCarrierFragment,bytes};
}

/** Strict owner-local reassembly. Transport is an untrusted delivery claim.
 * Nothing in this class grants permission to RECEIVE or ADMIT.
 */
export class CrossingFieldReceiver {
  private readonly pieces=new Map<number,Buffer>();
  private readonly observations: CarrierRouteObservation[]=[];
  private readonly holds: string[]=[];
  readonly manifest: CrossingFieldManifest;
  readonly observer: {
    world_id: string;
    particular: string;
    signing_keys: P256KeyMaterial;
    allowed_carriers: FieldCarrierKind[];
  };

  constructor(
    manifest: CrossingFieldManifest,
    observer: {
      world_id: string;
      particular: string;
      signing_keys: P256KeyMaterial;
      allowed_carriers: FieldCarrierKind[];
    },
  ) {
    this.manifest=manifest;
    this.observer=observer;
    if (!verifyCrossingFieldManifest(manifest)) throw new Error('FIELD_INVALID_MANIFEST');
    if (!str(observer.world_id) || !str(observer.particular) ||
        !observer.signing_keys || !Array.isArray(observer.allowed_carriers) ||
        observer.allowed_carriers.length===0 ||
        observer.allowed_carriers.some(c=>!Object.prototype.hasOwnProperty.call(CARRIER_MAX_FRAGMENT,c))) {
      throw new Error('FIELD_INVALID_OBSERVER');
    }
  }

  async ingest(value: unknown, observedAt: string): Promise<CarrierRouteObservation> {
    validateTimestamp(observedAt);
    let reason='none';
    let status: CarrierRouteObservation['status']='STORED';
    let packet: CrossingCarrierFragment | undefined;
    let bytes: Buffer | undefined;
    try {
      const parsed=verifyCarrierFragment(value,this.manifest);
      packet=parsed.packet;
      bytes=parsed.bytes;
      if (!this.observer.allowed_carriers.includes(packet.carrier)) throw new Error('FIELD_ROUTE_NOT_APPROVED');
      if (this.holds.length>0) throw new Error('FIELD_RECEIVER_ALREADY_HELD');
      const existing=this.pieces.get(packet.index);
      if (existing) {
        if (!existing.equals(bytes)) throw new Error('FIELD_CONFLICTING_FRAGMENT');
        status='DUPLICATE';
      } else {
        this.pieces.set(packet.index,bytes);
      }
    } catch(error) {
      status='HOLD';
      reason=error instanceof Error ? error.message : 'FIELD_UNRECOGNIZED_ERROR';
      this.holds.push(reason);
    }
    const p=object(value)?value:{};
    const carrier=(packet?.carrier ?? (typeof p.carrier==='string'?p.carrier:'unknown'));
    const route=(packet?.route_id ?? (typeof p.route_id==='string'?p.route_id:'untrusted'));
    const packetIdValue=packet?.packet_id ?? (typeof p.packet_id==='string'?p.packet_id:'invalid');
    const index=packet?.index ?? (Number.isSafeInteger(p.index)?p.index:-1);
    // A signed local observation records the packet claim and disposition.
    // It does not claim a physically witnessed RF hop or R3 RECEIVE.
    const receipt=await sealReceipt({
      schema:'relatte.receipt/v0',
      crossing_id:this.manifest.crossing_id,
      world_id:this.observer.world_id,
      receiver_particular:this.observer.particular,
      kind:CROSSING_FIELD_OBSERVATION_KIND,
      semantic_effect:'none',
      contract_ref:CROSSING_FIELD_CONTRACT,
      pre_state_ref:null,
      post_state_ref:null,
      descendant_refs:[],
      residual_refs:[],
      note:'simulation-only route observation; no admission implied',
      created_at:observedAt,
      extensions:{crossing_field:{
        schema:CROSSING_FIELD_CONTRACT,
        transfer_id:this.manifest.transfer_id,
        packet_id:packetIdValue,
        carrier,route_id:route,index,status,reason,
        receive_authority:false,admission_authority:false,
      }},
    },this.observer.signing_keys);
    const observed:CarrierRouteObservation={
      packet_id:packetIdValue,carrier:carrier as FieldCarrierKind,
      route_id:route,index,status,reason,receipt,
    };
    this.observations.push(observed);
    return observed;
  }

  private history(): CarrierRouteObservation[] {
    return [...this.observations];
  }

  async reconstruct(): Promise<CrossingReconstruction> {
    if (this.holds.length>0) return {state:'HOLD',reasons:[...this.holds],route_history:this.history()};
    const missing=Array.from({length:this.manifest.fragment_count},(_,i)=>i)
      .filter(i=>!this.pieces.has(i));
    if (missing.length>0) return {state:'INCOMPLETE',missing,route_history:this.history()};
    try {
      const bytes=Buffer.concat(
        Array.from({length:this.manifest.fragment_count},(_,i)=>this.pieces.get(i)!),
      );
      if (bytes.length!==this.manifest.byte_length ||
          sha(bytes)!==this.manifest.canonical_sha256) throw new Error('FIELD_COMPLETE_DIGEST_MISMATCH');
      const crossing: unknown=JSON.parse(bytes.toString('utf8'));
      if (!object(crossing) || canonicalize(crossing)!==bytes.toString('utf8') ||
          crossing.crossing_id!==this.manifest.crossing_id ||
          !(await verifyCrossingEnvelope(crossing))) throw new Error('FIELD_CROSSING_SIGNATURE_MISMATCH');
      return {state:'RECONSTRUCTED',crossing,route_history:this.history()};
    } catch(error) {
      const why=error instanceof Error?error.message:'FIELD_RECONSTRUCTION_FAILED';
      this.holds.push(why);
      return {state:'HOLD',reasons:[...this.holds],route_history:this.history()};
    }
  }

  /** Explicit owner-local RECEIVE only. Caller must separately choose ADMIT/HOLD/etc. */
  async receiveLocally(receiver: LocalReceiver, at: string): Promise<Record<string,any>> {
    const assembled=await this.reconstruct();
    if (assembled.state!=='RECONSTRUCTED') throw new Error('FIELD_NOT_RECONSTRUCTED');
    return receiver.receive(assembled.crossing,at);
  }
}

export async function verifyCarrierObservation(
  observation: CarrierRouteObservation,
  packet: CrossingCarrierFragment,
  manifest: CrossingFieldManifest,
  pinnedObserverKey: JsonWebKey,
): Promise<boolean> {
  try {
    if (!verifyCarrierFragment(packet,manifest) || observation.status==='HOLD' ||
        !(await verifyReceipt(observation.receipt))) return false;
    const receipt=observation.receipt;
    const x=receipt.extensions?.crossing_field;
    const p=observation;
    return receipt.kind===CROSSING_FIELD_OBSERVATION_KIND &&
      receipt.semantic_effect==='none' &&
      receipt.contract_ref===CROSSING_FIELD_CONTRACT &&
      receipt.crossing_id===manifest.crossing_id &&
      canonicalize(receipt.signing.public_key)===canonicalize(pinnedObserverKey) &&
      exact(receipt.extensions,['crossing_field']) &&
      exact(x,[
        'schema','transfer_id','packet_id','carrier','route_id','index',
        'status','reason','receive_authority','admission_authority',
      ]) &&
      x.schema===CROSSING_FIELD_CONTRACT &&
      x.transfer_id===manifest.transfer_id &&
      x.packet_id===packet.packet_id &&
      x.carrier===packet.carrier &&
      x.route_id===packet.route_id &&
      x.index===packet.index &&
      x.status===p.status &&
      x.status!=='HOLD' &&
      x.reason==='none' &&
      x.receive_authority===false && x.admission_authority===false &&
      p.packet_id===packet.packet_id &&
      p.carrier===packet.carrier &&
      p.route_id===packet.route_id &&
      p.index===packet.index &&
      p.reason==='none';
  } catch {return false;}
}
