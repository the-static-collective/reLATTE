import { mkdir, readFile, writeFile, appendFile, stat, lstat, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { canonicalizeDomainValue, sha256Hex, validateTimestamp } from './canonical.ts';
import {
  generateP256KeyPair,
  sealReceipt,
  verifyCrossingEnvelope,
  verifyReceipt,
} from './protocol.ts';
import type { P256KeyMaterial } from './protocol.ts';

export const LOCAL_RECEIVER_EVENT_DOMAIN = 'reLATTE-LocalReceiverEvent-v0|';
export const LOCAL_RECEIVER_STATE_DOMAIN = 'reLATTE-LocalReceiverState-v0|';

export type LocalDisposition = 'HOLD' | 'ADMIT' | 'REFUSE' | 'RETURN';

export interface LocalReceiverConfig {
  schema: 'relatte.local-receiver-config/v0';
  world_id: string;
  receiver_particular: string;
  contract_ref: string;
}

export interface ReceiverSnapshot {
  schema: 'relatte.local-receiver-snapshot/v0';
  world_id: string;
  receiver_particular: string;
  history_head: string | null;
  received: string[];
  held: string[];
  admitted: string[];
  refused: string[];
  returned: string[];
  state_ref: string;
}

interface StoredKeyMaterial {
  schema: 'relatte.local-receiver-key/v0';
  private_jwk: JsonWebKey;
  public_jwk: JsonWebKey;
}

interface JournalEventBody {
  schema: 'relatte.local-receiver-event/v0';
  seq: number;
  previous_hash: string | null;
  event_type: 'RECEIVE' | 'DISPOSITION' | 'CUSTODY';
  crossing_id: string;
  crossing: Record<string, unknown> | null;
  receipt: Record<string, unknown>;
  created_at: string;
}

interface JournalEvent extends JournalEventBody {
  event_hash: string;
}

interface ReceivedEntry {
  crossing: Record<string, any>;
  receipt: Record<string, any>;
}

interface DispositionEntry {
  disposition: LocalDisposition;
  receipt: Record<string, any>;
}

function nonEmpty(value: unknown, code: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(code);
  return value;
}

function asRecord(value: unknown, code: string): Record<string, any> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(code);
  return value as Record<string, any>;
}

function eventHash(body: JournalEventBody): string {
  return `relatte-local-event-v0:${sha256Hex(canonicalizeDomainValue(LOCAL_RECEIVER_EVENT_DOMAIN, body))}`;
}

function stateRef(
  config: LocalReceiverConfig,
  received: Map<string, ReceivedEntry>,
  dispositions: Map<string, DispositionEntry>,
): string {
  const status = [...received.keys()].sort().map((crossingId) => ({
    crossing_id: crossingId,
    disposition: dispositions.get(crossingId)?.disposition ?? 'RECEIVED',
  }));
  return `relatte-local-state-v0:${sha256Hex(canonicalizeDomainValue(LOCAL_RECEIVER_STATE_DOMAIN, {
    world_id: config.world_id,
    receiver_particular: config.receiver_particular,
    status,
  }))}`;
}

function payloadAddresses(crossing: Record<string, any>): string[] {
  if (!Array.isArray(crossing.payload_refs)) return [];
  return crossing.payload_refs
    .map((entry: unknown) => {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return null;
      const address = (entry as Record<string, unknown>).address;
      return typeof address === 'string' && address.length > 0 ? address : null;
    })
    .filter((value: string | null): value is string => value !== null);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function exportStoredKeys(keys: P256KeyMaterial): Promise<StoredKeyMaterial> {
  const privateJwk = await crypto.subtle.exportKey('jwk', keys.privateKey);
  const publicJwk = await crypto.subtle.exportKey('jwk', keys.publicKey);
  return {
    schema: 'relatte.local-receiver-key/v0',
    private_jwk: privateJwk,
    public_jwk: publicJwk,
  };
}

async function importStoredKeys(value: unknown): Promise<P256KeyMaterial> {
  const stored = asRecord(value, 'INVALID_RECEIVER_KEY_FILE');
  if (stored.schema !== 'relatte.local-receiver-key/v0') throw new Error('INVALID_RECEIVER_KEY_SCHEMA');

  const privateJwk = asRecord(stored.private_jwk, 'INVALID_RECEIVER_PRIVATE_KEY') as JsonWebKey;
  const publicJwk = asRecord(stored.public_jwk, 'INVALID_RECEIVER_PUBLIC_KEY') as JsonWebKey;
  if (privateJwk.kty !== 'EC' || privateJwk.crv !== 'P-256' || typeof privateJwk.d !== 'string') {
    throw new Error('INVALID_RECEIVER_PRIVATE_KEY');
  }
  if (publicJwk.kty !== 'EC' || publicJwk.crv !== 'P-256' || Object.prototype.hasOwnProperty.call(publicJwk, 'd')) {
    throw new Error('INVALID_RECEIVER_PUBLIC_KEY');
  }

  const privateKey = await crypto.subtle.importKey(
    'jwk',
    privateJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign'],
  );
  const publicKey = await crypto.subtle.importKey(
    'jwk',
    publicJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['verify'],
  );
  return { privateKey, publicKey, publicKeyJwk: publicJwk };
}

function parseConfig(value: unknown): LocalReceiverConfig {
  const config = asRecord(value, 'INVALID_RECEIVER_CONFIG');
  if (config.schema !== 'relatte.local-receiver-config/v0') throw new Error('INVALID_RECEIVER_CONFIG_SCHEMA');
  return {
    schema: 'relatte.local-receiver-config/v0',
    world_id: nonEmpty(config.world_id, 'INVALID_RECEIVER_WORLD'),
    receiver_particular: nonEmpty(config.receiver_particular, 'INVALID_RECEIVER_PARTICULAR'),
    contract_ref: nonEmpty(config.contract_ref, 'INVALID_RECEIVER_CONTRACT'),
  };
}

export class LocalReceiver {
  readonly root: string;
  readonly config: LocalReceiverConfig;
  private readonly keys: P256KeyMaterial;
  private readonly received = new Map<string, ReceivedEntry>();
  private readonly dispositions = new Map<string, DispositionEntry>();
  private readonly custodyReceipts = new Map<string, Record<string, any>>();
  private historyHead: string | null = null;
  private eventCount = 0;

  private constructor(
    root: string,
    config: LocalReceiverConfig,
    keys: P256KeyMaterial,
  ) {
    this.root = root;
    this.config = config;
    this.keys = keys;
  }

  static async create(
    root: string,
    input: Omit<LocalReceiverConfig, 'schema'>,
  ): Promise<LocalReceiver> {
    if (await fileExists(root)) throw new Error('RECEIVER_ROOT_EXISTS');
    await mkdir(root, { recursive: true });

    const config: LocalReceiverConfig = {
      schema: 'relatte.local-receiver-config/v0',
      world_id: nonEmpty(input.world_id, 'INVALID_RECEIVER_WORLD'),
      receiver_particular: nonEmpty(input.receiver_particular, 'INVALID_RECEIVER_PARTICULAR'),
      contract_ref: nonEmpty(input.contract_ref, 'INVALID_RECEIVER_CONTRACT'),
    };
    const keys = await generateP256KeyPair();
    const storedKeys = await exportStoredKeys(keys);

    await writeFile(join(root, 'receiver.json'), JSON.stringify(config, null, 2) + '\n', { encoding: 'utf8' });
    await writeFile(join(root, 'receiver-key.json'), JSON.stringify(storedKeys, null, 2) + '\n', {
      encoding: 'utf8',
      mode: 0o600,
    });
    await writeFile(join(root, 'journal.jsonl'), '', { encoding: 'utf8' });

    return new LocalReceiver(root, config, keys);
  }

  static async open(root: string): Promise<LocalReceiver> {
    const config = parseConfig(JSON.parse(await readFile(join(root, 'receiver.json'), 'utf8')));
    const keys = await importStoredKeys(JSON.parse(await readFile(join(root, 'receiver-key.json'), 'utf8')));
    const receiver = new LocalReceiver(root, config, keys);
    await receiver.replay();
    return receiver;
  }

  private async replay(): Promise<void> {
    this.received.clear();
    this.dispositions.clear();
    this.custodyReceipts.clear();
    this.historyHead = null;
    this.eventCount = 0;

    const text = await readFile(join(this.root, 'journal.jsonl'), 'utf8');
    const lines = text.split('\n').filter((line) => line.trim().length > 0);

    for (let index = 0; index < lines.length; index++) {
      const event = asRecord(JSON.parse(lines[index]), 'INVALID_RECEIVER_EVENT') as unknown as JournalEvent;
      if (event.schema !== 'relatte.local-receiver-event/v0') throw new Error('INVALID_RECEIVER_EVENT_SCHEMA');
      if (event.seq !== index + 1) throw new Error('INVALID_RECEIVER_EVENT_SEQUENCE');
      if (event.previous_hash !== this.historyHead) throw new Error('INVALID_RECEIVER_EVENT_CHAIN');

      const body: JournalEventBody = {
        schema: event.schema,
        seq: event.seq,
        previous_hash: event.previous_hash,
        event_type: event.event_type,
        crossing_id: event.crossing_id,
        crossing: event.crossing,
        receipt: event.receipt,
        created_at: event.created_at,
      };
      if (event.event_hash !== eventHash(body)) throw new Error('INVALID_RECEIVER_EVENT_HASH');
      validateTimestamp(event.created_at);
      if (!(await verifyReceipt(event.receipt))) throw new Error('INVALID_RECEIVER_RECEIPT');

      if (event.event_type === 'RECEIVE') {
        if (!event.crossing) throw new Error('RECEIVE_EVENT_MISSING_CROSSING');
        if (!(await verifyCrossingEnvelope(event.crossing))) throw new Error('INVALID_RECEIVER_CROSSING');
        if (event.crossing.crossing_id !== event.crossing_id) throw new Error('RECEIVER_EVENT_CROSSING_MISMATCH');
        if (event.receipt.crossing_id !== event.crossing_id || event.receipt.kind !== 'RECEIVED') {
          throw new Error('INVALID_RECEIVE_RECEIPT');
        }
        if (this.received.has(event.crossing_id)) throw new Error('DUPLICATE_RECEIVE_EVENT');
        this.received.set(event.crossing_id, {
          crossing: event.crossing as Record<string, any>,
          receipt: event.receipt as Record<string, any>,
        });
      } else if (event.event_type === 'DISPOSITION') {
        if (!this.received.has(event.crossing_id)) throw new Error('DISPOSITION_BEFORE_RECEIVE');
        if (this.dispositions.has(event.crossing_id)) throw new Error('DUPLICATE_DISPOSITION_EVENT');
        if (event.receipt.crossing_id !== event.crossing_id) throw new Error('INVALID_DISPOSITION_RECEIPT');
        const expectedPrefix = 'R3_';
        if (typeof event.receipt.kind !== 'string' || !event.receipt.kind.startsWith(expectedPrefix)) {
          throw new Error('INVALID_DISPOSITION_RECEIPT');
        }
        const disposition = event.receipt.kind.slice(expectedPrefix.length) as LocalDisposition;
        if (!['HOLD', 'ADMIT', 'REFUSE', 'RETURN'].includes(disposition)) {
          throw new Error('INVALID_DISPOSITION');
        }
        if (disposition === 'REFUSE' && event.receipt.semantic_effect !== 'none') {
          throw new Error('REFUSE_HAS_SEMANTIC_EFFECT');
        }
        this.dispositions.set(event.crossing_id, {
          disposition,
          receipt: event.receipt as Record<string, any>,
        });
      } else if (event.event_type === 'CUSTODY') {
        if (event.crossing !== null) throw new Error('CUSTODY_EVENT_CANNOT_REDECLARE_CROSSING');
        const received = this.received.get(event.crossing_id);
        const disposed = this.dispositions.get(event.crossing_id);
        const receipt = event.receipt as Record<string, any>;
        if (!received || !disposed) throw new Error('CUSTODY_BEFORE_DISPOSITION');
        if (this.custodyReceipts.has(event.crossing_id)) throw new Error('DUPLICATE_CUSTODY_EVENT');
        if (receipt.kind !== 'PAYLOAD_BYTES_VERIFIED'
            || receipt.semantic_effect !== 'none'
            || receipt.crossing_id !== event.crossing_id
            || receipt.world_id !== this.config.world_id
            || receipt.receiver_particular !== this.config.receiver_particular
            || receipt.created_at !== event.created_at
            || receipt.pre_state_ref !== stateRef(this.config, this.received, this.dispositions)
            || receipt.post_state_ref !== receipt.pre_state_ref
            || receipt.signing?.public_key?.x !== disposed.receipt.signing?.public_key?.x
            || receipt.signing?.public_key?.y !== disposed.receipt.signing?.public_key?.y) {
          throw new Error('INVALID_CUSTODY_RECEIPT');
        }
        const material = receipt.extensions?.local_receiver?.payload_custody;
        if (typeof material !== 'object' || material === null || Array.isArray(material)) {
          throw new Error('INVALID_CUSTODY_METADATA');
        }
        const digest = material.sha256;
        const byteLength = material.byte_length;
        const retained = material.retained;
        if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)
            || !Number.isSafeInteger(byteLength) || byteLength < 1 || byteLength > 65536
            || !['HOLD','REFUSE'].includes(disposed.disposition)
            || material.disposition !== disposed.disposition
            || retained !== (disposed.disposition === 'HOLD')
            || material.receive_receipt_id !== received.receipt.receipt_id
            || material.disposition_receipt_id !== disposed.receipt.receipt_id
            || !payloadAddresses(received.crossing).includes('sha256:' + digest)
            || !Array.isArray(receipt.residual_refs)
            || !receipt.residual_refs.includes('sha256:' + digest)) {
          throw new Error('INVALID_CUSTODY_METADATA');
        }
        const file = join(this.root, 'payloads', event.crossing_id + '.bin');
        if (retained) {
          const bytes = await readFile(file);
          if (bytes.length !== byteLength || sha256Hex(bytes) !== digest) {
            throw new Error('INVALID_CUSTODY_BYTES');
          }
        } else if (await fileExists(file)) {
          throw new Error('REFUSED_PAYLOAD_WAS_RETAINED');
        }
        this.custodyReceipts.set(event.crossing_id, receipt);
      } else {
        throw new Error('INVALID_RECEIVER_EVENT_TYPE');
      }

      this.historyHead = event.event_hash;
      this.eventCount += 1;
    }
  }

  private async appendEvent(
    eventType: 'RECEIVE' | 'DISPOSITION' | 'CUSTODY',
    crossingId: string,
    crossing: Record<string, unknown> | null,
    receipt: Record<string, unknown>,
    createdAt: string,
  ): Promise<void> {
    validateTimestamp(createdAt);
    const body: JournalEventBody = {
      schema: 'relatte.local-receiver-event/v0',
      seq: this.eventCount + 1,
      previous_hash: this.historyHead,
      event_type: eventType,
      crossing_id: crossingId,
      crossing,
      receipt,
      created_at: createdAt,
    };
    const event: JournalEvent = { ...body, event_hash: eventHash(body) };
    await appendFile(join(this.root, 'journal.jsonl'), JSON.stringify(event) + '\n', 'utf8');
    this.historyHead = event.event_hash;
    this.eventCount += 1;
  }

  async receive(crossingValue: unknown, createdAt: string): Promise<Record<string, any>> {
    if (!(await verifyCrossingEnvelope(crossingValue))) throw new Error('INVALID_CROSSING');
    const crossing = asRecord(crossingValue, 'INVALID_CROSSING');
    const crossingId = nonEmpty(crossing.crossing_id, 'INVALID_CROSSING_ID');

    const existing = this.received.get(crossingId);
    if (existing) return existing.receipt;

    const before = stateRef(this.config, this.received, this.dispositions);
    const draft = {
      schema: 'relatte.receipt/v0',
      crossing_id: crossingId,
      world_id: this.config.world_id,
      receiver_particular: this.config.receiver_particular,
      kind: 'RECEIVED',
      semantic_effect: 'none',
      contract_ref: this.config.contract_ref,
      pre_state_ref: before,
      post_state_ref: before,
      descendant_refs: [],
      residual_refs: payloadAddresses(crossing),
      note: 'crossing verified and received; no admission implied',
      created_at: createdAt,
      extensions: {
        local_receiver: {
          law: 'RECEIVED != ADMITTED',
          history_head_before: this.historyHead,
        },
      },
    };
    const receipt = await sealReceipt(draft, this.keys);
    await this.appendEvent('RECEIVE', crossingId, crossing, receipt, createdAt);
    this.received.set(crossingId, { crossing, receipt });
    return receipt;
  }

  async dispose(
    crossingId: string,
    disposition: LocalDisposition,
    createdAt: string,
    options: {
      note?: string;
      admit_effect?: string;
      descendant_refs?: string[];
    } = {},
  ): Promise<Record<string, any>> {
    const received = this.received.get(crossingId);
    if (!received) throw new Error('CROSSING_NOT_RECEIVED');

    const prior = this.dispositions.get(crossingId);
    if (prior) {
      if (prior.disposition === disposition) return prior.receipt;
      throw new Error('CROSSING_ALREADY_DISPOSED');
    }

    validateTimestamp(createdAt);
    const pre = stateRef(this.config, this.received, this.dispositions);
    const provisional = new Map(this.dispositions);
    provisional.set(crossingId, { disposition, receipt: {} });
    const post = stateRef(this.config, this.received, provisional);

    const semanticEffect =
      disposition === 'ADMIT'
        ? nonEmpty(options.admit_effect ?? 'local-state-change', 'INVALID_ADMIT_EFFECT')
        : disposition === 'RETURN'
          ? 'return-created'
          : 'none';

    const draft = {
      schema: 'relatte.receipt/v0',
      crossing_id: crossingId,
      world_id: this.config.world_id,
      receiver_particular: this.config.receiver_particular,
      kind: `R3_${disposition}`,
      semantic_effect: semanticEffect,
      contract_ref: this.config.contract_ref,
      pre_state_ref: pre,
      post_state_ref: post,
      descendant_refs: disposition === 'ADMIT'
        ? requireArray(options.descendant_refs ?? [])
        : [],
      residual_refs: disposition === 'ADMIT' ? [] : payloadAddresses(received.crossing),
      note: options.note ?? disposition.toLowerCase(),
      created_at: createdAt,
      extensions: {
        local_receiver: {
          disposition,
          receive_receipt_id: received.receipt.receipt_id,
          protected_payload_effect: disposition === 'ADMIT',
          history_head_before: this.historyHead,
          laws: [
            'RECEIPT != ADMISSION',
            'REFUSE != DELETE',
            'HOLD != ADMIT',
            'RETURN != TRANSFER OF AUTHORITY',
          ],
        },
      },
    };
    const receipt = await sealReceipt(draft, this.keys);
    await this.appendEvent('DISPOSITION', crossingId, null, receipt, createdAt);
    this.dispositions.set(crossingId, { disposition, receipt });
    return receipt;
  }

  /**
   * Record actual payload-byte verification under the receiver's own signing
   * key. The crossing must already be signed, RECEIVED, and locally disposed.
   * HOLD keeps verified bytes in receiver-local quarantine; REFUSE verifies
   * and discards them without admitting any world object.
   *
   * This is an additive R3 receipt, not a replacement for RECEIVE/HOLD/REFUSE.
   */
  async verifyPayloadBytes(
    crossingId: string,
    value: Uint8Array,
    createdAt: string,
  ): Promise<Record<string, any>> {
    const received = this.received.get(crossingId);
    if (!received) throw new Error('CROSSING_NOT_RECEIVED');
    const disposed = this.dispositions.get(crossingId);
    if (!disposed) throw new Error('DISPOSITION_REQUIRED');
    if (disposed.disposition !== 'HOLD' && disposed.disposition !== 'REFUSE') {
      throw new Error('CUSTODY_DISPOSITION_NOT_SUPPORTED');
    }
    if (!(value instanceof Uint8Array) || value.byteLength === 0) {
      throw new Error('INVALID_PAYLOAD_BYTES');
    }
    if (value.byteLength > 65536) throw new Error('PAYLOAD_TOO_LARGE');
    validateTimestamp(createdAt);
    const bytes = Buffer.from(value);
    const digest = sha256Hex(bytes);
    if (!payloadAddresses(received.crossing).includes('sha256:' + digest)) {
      throw new Error('PAYLOAD_SHA_MISMATCH');
    }
    const earlier = this.custodyReceipts.get(crossingId);
    if (earlier) {
      const claimed = earlier.extensions?.local_receiver?.payload_custody;
      if (claimed?.sha256 !== digest || claimed?.byte_length !== bytes.length) {
        throw new Error('CUSTODY_ALREADY_RECORDED');
      }
      if (claimed.retained) {
        const kept = await readFile(join(this.root, 'payloads', crossingId + '.bin'));
        if (!kept.equals(bytes)) throw new Error('INVALID_CUSTODY_BYTES');
      }
      return earlier;
    }
    const retain = disposed.disposition === 'HOLD';
    if (retain) {
      const folder = join(this.root,'payloads');
      await mkdir(folder,{recursive:true});
      const destination = join(folder,crossingId + '.bin');
      const temporary = join(folder,crossingId + '.' + process.pid + '.pending');
      let finalSymlink = false;
      try {
        const existing = await lstat(destination);
        finalSymlink = existing.isSymbolicLink();
      } catch (error: any) {
        if (error?.code !== 'ENOENT') throw error;
      }
      if (finalSymlink) throw new Error('UNSAFE_CUSTODY_DESTINATION');
      try {
        await writeFile(temporary,bytes,{flag:'wx',mode:0o600});
        await rename(temporary,destination);
      } finally {
        await rm(temporary,{force:true});
      }
      const persisted = await readFile(destination);
      if (!persisted.equals(bytes)) throw new Error('INVALID_CUSTODY_BYTES');
    }
    const before = stateRef(this.config,this.received,this.dispositions);
    const draft = {
      schema:'relatte.receipt/v0',
      crossing_id:crossingId,
      world_id:this.config.world_id,
      receiver_particular:this.config.receiver_particular,
      kind:'PAYLOAD_BYTES_VERIFIED',
      semantic_effect:'none',
      contract_ref:this.config.contract_ref,
      pre_state_ref:before,
      post_state_ref:before,
      descendant_refs:[],
      residual_refs:['sha256:' + digest],
      note:retain
        ? 'receiver independently verified and retained exact payload bytes in quarantine; no admission'
        : 'receiver independently verified exact payload bytes and refused retention; no admission',
      created_at:createdAt,
      extensions:{
        local_receiver:{
          payload_custody:{
            sha256:digest,
            byte_length:bytes.length,
            retained:retain,
            disposition:disposed.disposition,
            receive_receipt_id:received.receipt.receipt_id,
            disposition_receipt_id:disposed.receipt.receipt_id,
          },
          laws:[
            'BYTES VERIFIED != ADMITTED',
            'HOLD != ADMIT',
            'REFUSE != RETAIN',
            'RECEIPT SIGNATURE != HUMAN IDENTITY',
          ],
        },
      },
    };
    const receipt = await sealReceipt(draft,this.keys);
    await this.appendEvent('CUSTODY',crossingId,null,receipt,createdAt);
    this.custodyReceipts.set(crossingId,receipt);
    return receipt;
  }

  async createMortalitySeed(args: {
    anchor_crossing_id: string;
    recoverable_crossing_ids: string[];
    checkpoint_commitment_id: string;
    checkpoint_receipt_set_root: string;
    created_at: string;
  }): Promise<Record<string, any>> {
    const anchor = this.received.get(args.anchor_crossing_id);
    if (!anchor) throw new Error('MORTALITY_ANCHOR_NOT_RECEIVED');
    if (
      !Array.isArray(args.recoverable_crossing_ids) ||
      args.recoverable_crossing_ids.length === 0 ||
      args.recoverable_crossing_ids.some(
        (id) => typeof id !== 'string' || id.trim() === '',
      )
    ) {
      throw new Error('INVALID_MORTALITY_RECOVERABLE_CROSSINGS');
    }
    validateTimestamp(args.created_at);

    const snapshot = this.snapshot();
    return sealReceipt({
      schema: 'relatte.receipt/v0',
      crossing_id: args.anchor_crossing_id,
      world_id: this.config.world_id,
      receiver_particular: this.config.receiver_particular,
      kind: 'R12_MORTALITY_SEED',
      semantic_effect: 'none',
      contract_ref: 'relatte:r12-mortality/v0',
      pre_state_ref: snapshot.state_ref,
      post_state_ref: snapshot.state_ref,
      descendant_refs: [],
      residual_refs: [...args.recoverable_crossing_ids],
      note: 'predecessor leaves attributable material for a future successor with fresh authority',
      created_at: args.created_at,
      extensions: {
        mortality: {
          predecessor_world_id: this.config.world_id,
          predecessor_receiver_particular: this.config.receiver_particular,
          predecessor_history_head: snapshot.history_head,
          predecessor_state_ref: snapshot.state_ref,
          recoverable_crossing_ids: [...args.recoverable_crossing_ids].sort(),
          checkpoint_commitment_id: nonEmpty(
            args.checkpoint_commitment_id,
            'INVALID_MORTALITY_CHECKPOINT_COMMITMENT',
          ),
          checkpoint_receipt_set_root: nonEmpty(
            args.checkpoint_receipt_set_root,
            'INVALID_MORTALITY_CHECKPOINT_ROOT',
          ),
          successor_policy: 'fresh-identity-required',
          laws: [
            'SUCCESSOR != PREDECESSOR',
            'RECONSTITUTION != RESURRECTION',
            'HISTORY != AUTHORITY TRANSFER',
            'DEAD KEY != SUCCESSOR KEY',
          ],
        },
      },
    }, this.keys);
  }

  async acceptSuccession(args: {
    anchor_crossing_id: string;
    predecessor_seed_receipt: unknown;
    created_at: string;
  }): Promise<Record<string, any>> {
    const anchor = this.received.get(args.anchor_crossing_id);
    if (!anchor) throw new Error('SUCCESSOR_ANCHOR_NOT_RECEIVED');
    if (!(await verifyReceipt(args.predecessor_seed_receipt))) {
      throw new Error('INVALID_SUCCESSOR_PREDECESSOR_SEED');
    }
    const predecessorSeed = asRecord(
      args.predecessor_seed_receipt,
      'INVALID_SUCCESSOR_PREDECESSOR_SEED',
    );
    if (
      predecessorSeed.kind !== 'R12_MORTALITY_SEED' ||
      predecessorSeed.semantic_effect !== 'none'
    ) {
      throw new Error('INVALID_SUCCESSOR_PREDECESSOR_SEED');
    }
    validateTimestamp(args.created_at);

    const snapshot = this.snapshot();
    return sealReceipt({
      schema: 'relatte.receipt/v0',
      crossing_id: args.anchor_crossing_id,
      world_id: this.config.world_id,
      receiver_particular: this.config.receiver_particular,
      kind: 'R12_SUCCESSOR_ACCEPTANCE',
      semantic_effect: 'none',
      contract_ref: 'relatte:r12-mortality/v0',
      pre_state_ref: snapshot.state_ref,
      post_state_ref: snapshot.state_ref,
      descendant_refs: [],
      residual_refs: [],
      note: 'successor accepts continuity reference under fresh local identity and authority',
      created_at: args.created_at,
      extensions: {
        succession: {
          predecessor_seed_receipt_id: nonEmpty(
            predecessorSeed.receipt_id,
            'INVALID_SUCCESSOR_SEED_RECEIPT_ID',
          ),
          predecessor_world_id: nonEmpty(
            predecessorSeed.world_id,
            'INVALID_SUCCESSOR_PREDECESSOR_WORLD',
          ),
          predecessor_receiver_particular: nonEmpty(
            predecessorSeed.receiver_particular,
            'INVALID_SUCCESSOR_PREDECESSOR_PARTICULAR',
          ),
          successor_world_id: this.config.world_id,
          successor_receiver_particular: this.config.receiver_particular,
          authority: 'fresh-local',
          inherited_private_key: false,
          inherited_admission: false,
          laws: [
            'SUCCESSOR != PREDECESSOR',
            'CONTINUITY != IDENTITY',
            'ANCESTRY != AUTHORITY',
            'SUCCESSION CLAIM != INHERITED ADMISSION',
          ],
        },
      },
    }, this.keys);
  }

  /** Public signing identity for explicit local-pinning; never exports private material. */
  receiptSignerPublicJwk(): JsonWebKey {
    // Created keys are normalized; reopened stored exported JWKs may include
    // ext/key_ops. Keep the stable, four-field identity across restarts.
    const { kty, crv, x, y } = this.keys.publicKeyJwk;
    return { kty, crv, x, y };
  }

  snapshot(): ReceiverSnapshot {
    const ids = [...this.received.keys()].sort();
    const by = (kind: LocalDisposition) => ids.filter((id) => this.dispositions.get(id)?.disposition === kind);
    return {
      schema: 'relatte.local-receiver-snapshot/v0',
      world_id: this.config.world_id,
      receiver_particular: this.config.receiver_particular,
      history_head: this.historyHead,
      received: ids,
      held: by('HOLD'),
      admitted: by('ADMIT'),
      refused: by('REFUSE'),
      returned: by('RETURN'),
      state_ref: stateRef(this.config, this.received, this.dispositions),
    };
  }

  journalLength(): number {
    return this.eventCount;
  }

  getReceiveReceipt(crossingId: string): Record<string, any> | null {
    return this.received.get(crossingId)?.receipt ?? null;
  }

  getPayloadCustodyReceipt(crossingId: string): Record<string, any> | null {
    return this.custodyReceipts.get(crossingId) ?? null;
  }

  getDispositionReceipt(crossingId: string): Record<string, any> | null {
    return this.dispositions.get(crossingId)?.receipt ?? null;
  }
}

function requireArray(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.length === 0)) {
    throw new Error('INVALID_DESCENDANT_REFS');
  }
  return [...value];
}
