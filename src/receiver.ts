import { mkdir, readFile, writeFile, appendFile, stat } from 'node:fs/promises';
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
  event_type: 'RECEIVE' | 'DISPOSITION';
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
      } else {
        throw new Error('INVALID_RECEIVER_EVENT_TYPE');
      }

      this.historyHead = event.event_hash;
      this.eventCount += 1;
    }
  }

  private async appendEvent(
    eventType: 'RECEIVE' | 'DISPOSITION',
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
