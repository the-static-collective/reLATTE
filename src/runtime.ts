import {
  appendFile,
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  writeFile,
} from 'node:fs/promises';
import { basename, join } from 'node:path';

import {
  canonicalize,
  canonicalizeDomainValue,
  sha256Hex,
  validateTimestamp,
} from './canonical.ts';
import {
  LocalRoadMemory,
} from './road-memory.ts';
import {
  LocalReceiver,
} from './receiver.ts';
import {
  verifyCrossingEnvelope,
} from './protocol.ts';
import {
  type WorldManifest,
  parseWorldManifest,
  readWorldManifest,
  writeWorldManifest,
} from './runtime-manifest.ts';

export const RUNTIME_EVENT_DOMAIN = 'reLATTE-RuntimeEvent-v0|';
export const INBOX_ITEM_ID_DOMAIN = 'reLATTE-InboxItem-v0|';

export type RuntimeEventType =
  | 'BOOT'
  | 'INBOX_ENQUEUED'
  | 'WORK_CLAIMED'
  | 'RECEIPT_REF_PUBLISHED'
  | 'WORK_COMMITTED';

export interface RuntimeEvent {
  schema: 'relatte.runtime-event/v0';
  event_id: string;
  seq: number;
  previous_hash: string | null;
  event_type: RuntimeEventType;
  world_id: string;
  crossing_id: string | null;
  queue_item_id: string | null;
  receipt_id: string | null;
  created_at: string;
  semantic_effect: 'none';
  laws: string[];
}

export interface InboxItem {
  schema: 'relatte.inbox-item/v0';
  queue_item_id: string;
  crossing_id: string;
  crossing: Record<string, any>;
  enqueued_at: string;
  source: string;
  laws: string[];
}

export interface RuntimeSnapshot {
  schema: 'relatte.runtime-snapshot/v0';
  manifest_id: string;
  world_id: string;
  runtime_history_head: string | null;
  runtime_event_count: number;
  pending_inbox: string[];
  processed_inbox: string[];
  published_receipt_ids: string[];
  receiver: ReturnType<LocalReceiver['snapshot']>;
  road_memory: ReturnType<LocalRoadMemory['snapshot']>;
}

export interface RuntimePulseResult {
  schema: 'relatte.runtime-pulse/v0';
  status: 'idle' | 'processed';
  queue_item_id: string | null;
  crossing_id: string | null;
  receive_receipt_id: string | null;
  semantic_effect: 'none';
  laws: string[];
}

interface RuntimeEventBody {
  schema: 'relatte.runtime-event/v0';
  seq: number;
  previous_hash: string | null;
  event_type: RuntimeEventType;
  world_id: string;
  crossing_id: string | null;
  queue_item_id: string | null;
  receipt_id: string | null;
  created_at: string;
  semantic_effect: 'none';
  laws: string[];
}

interface RuntimePaths {
  manifest: string;
  receiver: string;
  roadMemory: string;
  runtimeJournal: string;
  inboxPending: string;
  inboxProcessed: string;
  outboxPending: string;
}

function fileExists(path: string): Promise<boolean> {
  return stat(path).then(() => true).catch(() => false);
}

function nonEmpty(value: unknown, code: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(code);
  return value;
}

function paths(root: string): RuntimePaths {
  return {
    manifest: join(root, 'world.rel.json'),
    receiver: join(root, 'receiver'),
    roadMemory: join(root, 'road-memory'),
    runtimeJournal: join(root, 'runtime-receipt-bus.jsonl'),
    inboxPending: join(root, 'inbox', 'pending'),
    inboxProcessed: join(root, 'inbox', 'processed'),
    outboxPending: join(root, 'outbox', 'pending'),
  };
}

function eventId(body: RuntimeEventBody): string {
  return `relatte-runtime-event-v0:${sha256Hex(
    canonicalizeDomainValue(RUNTIME_EVENT_DOMAIN, body)
  )}`;
}

function queueItemIdentityBody(
  value: Omit<InboxItem, 'queue_item_id' | 'crossing'>,
): Record<string, unknown> {
  return {
    schema: value.schema,
    crossing_id: value.crossing_id,
    enqueued_at: value.enqueued_at,
    source: value.source,
    laws: [...value.laws],
  };
}

function queueItemFilename(item: Pick<InboxItem, 'queue_item_id'>): string {
  return `${sha256Hex(Buffer.from(item.queue_item_id, 'utf8'))}.json`;
}

function parseRuntimeEvent(value: unknown): RuntimeEvent {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('INVALID_RUNTIME_EVENT');
  }
  const event = value as Record<string, any>;
  if (event.schema !== 'relatte.runtime-event/v0') {
    throw new Error('INVALID_RUNTIME_EVENT_SCHEMA');
  }
  validateTimestamp(event.created_at);
  if (!Number.isSafeInteger(event.seq) || event.seq < 1) {
    throw new Error('INVALID_RUNTIME_EVENT_SEQUENCE');
  }

  const body: RuntimeEventBody = {
    schema: 'relatte.runtime-event/v0',
    seq: event.seq,
    previous_hash: event.previous_hash ?? null,
    event_type: event.event_type,
    world_id: nonEmpty(event.world_id, 'INVALID_RUNTIME_EVENT_WORLD'),
    crossing_id: event.crossing_id ?? null,
    queue_item_id: event.queue_item_id ?? null,
    receipt_id: event.receipt_id ?? null,
    created_at: event.created_at,
    semantic_effect: 'none',
    laws: Array.isArray(event.laws) ? [...event.laws] : [],
  };

  const expected = eventId(body);
  if (event.event_id !== expected) throw new Error('INVALID_RUNTIME_EVENT_ID');
  return {
    ...body,
    event_id: expected,
  };
}

function parseInboxItem(value: unknown): InboxItem {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('INVALID_INBOX_ITEM');
  }
  const item = value as Record<string, any>;
  if (item.schema !== 'relatte.inbox-item/v0') throw new Error('INVALID_INBOX_ITEM_SCHEMA');
  validateTimestamp(item.enqueued_at);
  const crossingId = nonEmpty(item.crossing_id, 'INVALID_INBOX_CROSSING_ID');
  const source = nonEmpty(item.source, 'INVALID_INBOX_SOURCE');
  if (typeof item.crossing !== 'object' || item.crossing === null || Array.isArray(item.crossing)) {
    throw new Error('INVALID_INBOX_CROSSING');
  }
  const body = {
    schema: 'relatte.inbox-item/v0' as const,
    crossing_id: crossingId,
    enqueued_at: item.enqueued_at,
    source,
    laws: Array.isArray(item.laws) ? [...item.laws] : [],
  };
  const expected = `relatte-inbox-item-v0:${sha256Hex(
    canonicalizeDomainValue(INBOX_ITEM_ID_DOMAIN, queueItemIdentityBody(body))
  )}`;
  if (item.queue_item_id !== expected) throw new Error('INBOX_ITEM_ID_MISMATCH');
  if (item.crossing.crossing_id !== crossingId) throw new Error('INBOX_CROSSING_ID_MISMATCH');

  return {
    ...body,
    queue_item_id: expected,
    crossing: item.crossing,
  };
}

export class ReLatteRuntime {
  readonly root: string;
  readonly manifest: WorldManifest;
  readonly receiver: LocalReceiver;
  readonly roadMemory: LocalRoadMemory;

  private readonly runtimePaths: RuntimePaths;
  private runtimeHistoryHead: string | null = null;
  private runtimeEventCount = 0;
  private readonly publishedReceiptIds = new Set<string>();

  private constructor(args: {
    root: string;
    manifest: WorldManifest;
    receiver: LocalReceiver;
    roadMemory: LocalRoadMemory;
  }) {
    this.root = args.root;
    this.manifest = args.manifest;
    this.receiver = args.receiver;
    this.roadMemory = args.roadMemory;
    this.runtimePaths = paths(args.root);
  }

  static async create(args: {
    root: string;
    manifest: WorldManifest;
    created_at: string;
  }): Promise<ReLatteRuntime> {
    if (await fileExists(args.root)) throw new Error('RUNTIME_ROOT_EXISTS');
    validateTimestamp(args.created_at);
    const manifest = parseWorldManifest(args.manifest);
    const runtimePaths = paths(args.root);

    await mkdir(args.root, { recursive: true });
    await mkdir(runtimePaths.inboxPending, { recursive: true });
    await mkdir(runtimePaths.inboxProcessed, { recursive: true });
    await mkdir(runtimePaths.outboxPending, { recursive: true });
    await writeWorldManifest(runtimePaths.manifest, manifest);
    await writeFile(runtimePaths.runtimeJournal, '', 'utf8');

    const receiver = await LocalReceiver.create(runtimePaths.receiver, {
      world_id: manifest.world_id,
      receiver_particular: manifest.receiver_particular,
      contract_ref: manifest.receiver_contract_ref,
    });
    const roadMemory = await LocalRoadMemory.create(runtimePaths.roadMemory, {
      failure_threshold: manifest.road_memory.failure_threshold,
      cooldown_ms: manifest.road_memory.cooldown_ms,
    });

    const runtime = new ReLatteRuntime({
      root: args.root,
      manifest,
      receiver,
      roadMemory,
    });
    await runtime.appendEvent({
      event_type: 'BOOT',
      crossing_id: null,
      queue_item_id: null,
      receipt_id: null,
      created_at: args.created_at,
      laws: [
        'BOOT != NEW HISTORY',
        'MANIFEST != WORLD',
      ],
    });
    return runtime;
  }

  static async open(args: {
    root: string;
    created_at: string;
  }): Promise<ReLatteRuntime> {
    validateTimestamp(args.created_at);
    const runtimePaths = paths(args.root);
    const manifest = await readWorldManifest(runtimePaths.manifest);
    const receiver = await LocalReceiver.open(runtimePaths.receiver);
    const roadMemory = await LocalRoadMemory.open(runtimePaths.roadMemory);

    const runtime = new ReLatteRuntime({
      root: args.root,
      manifest,
      receiver,
      roadMemory,
    });
    await runtime.replayBus();
    await runtime.appendEvent({
      event_type: 'BOOT',
      crossing_id: null,
      queue_item_id: null,
      receipt_id: null,
      created_at: args.created_at,
      laws: [
        'RESTART != NEW HISTORY',
        'BOOT != NEW HISTORY',
      ],
    });
    return runtime;
  }

  private async replayBus(): Promise<void> {
    this.runtimeHistoryHead = null;
    this.runtimeEventCount = 0;
    this.publishedReceiptIds.clear();

    const text = await readFile(this.runtimePaths.runtimeJournal, 'utf8');
    const lines = text.split('\n').filter((line) => line.trim().length > 0);

    for (let index = 0; index < lines.length; index++) {
      const event = parseRuntimeEvent(JSON.parse(lines[index]));
      if (event.seq !== index + 1) throw new Error('INVALID_RUNTIME_EVENT_SEQUENCE');
      if (event.previous_hash !== this.runtimeHistoryHead) {
        throw new Error('INVALID_RUNTIME_EVENT_CHAIN');
      }
      if (event.world_id !== this.manifest.world_id) {
        throw new Error('RUNTIME_EVENT_WORLD_MISMATCH');
      }
      if (event.event_type === 'RECEIPT_REF_PUBLISHED' && event.receipt_id) {
        this.publishedReceiptIds.add(event.receipt_id);
      }
      this.runtimeHistoryHead = event.event_id;
      this.runtimeEventCount += 1;
    }
  }

  private async appendEvent(args: {
    event_type: RuntimeEventType;
    crossing_id: string | null;
    queue_item_id: string | null;
    receipt_id: string | null;
    created_at: string;
    laws: string[];
  }): Promise<RuntimeEvent> {
    validateTimestamp(args.created_at);
    const body: RuntimeEventBody = {
      schema: 'relatte.runtime-event/v0',
      seq: this.runtimeEventCount + 1,
      previous_hash: this.runtimeHistoryHead,
      event_type: args.event_type,
      world_id: this.manifest.world_id,
      crossing_id: args.crossing_id,
      queue_item_id: args.queue_item_id,
      receipt_id: args.receipt_id,
      created_at: args.created_at,
      semantic_effect: 'none',
      laws: [...args.laws],
    };
    const event: RuntimeEvent = {
      ...body,
      event_id: eventId(body),
    };
    await appendFile(
      this.runtimePaths.runtimeJournal,
      JSON.stringify(event) + '\n',
      'utf8',
    );
    this.runtimeHistoryHead = event.event_id;
    this.runtimeEventCount += 1;
    if (event.event_type === 'RECEIPT_REF_PUBLISHED' && event.receipt_id) {
      this.publishedReceiptIds.add(event.receipt_id);
    }
    return event;
  }

  async enqueueCrossing(args: {
    crossing: unknown;
    enqueued_at: string;
    source: string;
  }): Promise<InboxItem> {
    validateTimestamp(args.enqueued_at);
    const source = nonEmpty(args.source, 'INVALID_INBOX_SOURCE');
    if (!(await verifyCrossingEnvelope(args.crossing))) throw new Error('INVALID_INBOX_CROSSING');

    const crossing = args.crossing as Record<string, any>;
    const crossingId = nonEmpty(crossing.crossing_id, 'INVALID_INBOX_CROSSING_ID');
    const body = {
      schema: 'relatte.inbox-item/v0' as const,
      crossing_id: crossingId,
      enqueued_at: args.enqueued_at,
      source,
      laws: [
        'QUEUE != AUTHORITY',
        'ENQUEUED != RECEIVED',
        'ENQUEUED != ADMITTED',
      ],
    };
    const item: InboxItem = {
      ...body,
      queue_item_id: `relatte-inbox-item-v0:${sha256Hex(
        canonicalizeDomainValue(INBOX_ITEM_ID_DOMAIN, queueItemIdentityBody(body))
      )}`,
      crossing,
    };
    const filename = queueItemFilename(item);
    const pendingPath = join(this.runtimePaths.inboxPending, filename);
    const processedPath = join(this.runtimePaths.inboxProcessed, filename);

    if (!(await fileExists(pendingPath)) && !(await fileExists(processedPath))) {
      await writeFile(pendingPath, canonicalize(item), 'utf8');
      await this.appendEvent({
        event_type: 'INBOX_ENQUEUED',
        crossing_id: crossingId,
        queue_item_id: item.queue_item_id,
        receipt_id: null,
        created_at: args.enqueued_at,
        laws: [
          'QUEUE != AUTHORITY',
          'ENQUEUED != RECEIVED',
        ],
      });
    }

    return item;
  }

  private async pendingFiles(): Promise<string[]> {
    const entries = await readdir(this.runtimePaths.inboxPending, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => entry.name)
      .sort();
  }

  async pulseOne(args: {
    claimed_at: string;
    received_at: string;
    committed_at: string;
    after_receive?: (args: {
      queue_item: InboxItem;
      receive_receipt: Record<string, any>;
    }) => Promise<void> | void;
  }): Promise<RuntimePulseResult> {
    validateTimestamp(args.claimed_at);
    validateTimestamp(args.received_at);
    validateTimestamp(args.committed_at);

    const files = await this.pendingFiles();
    if (files.length === 0) {
      return {
        schema: 'relatte.runtime-pulse/v0',
        status: 'idle',
        queue_item_id: null,
        crossing_id: null,
        receive_receipt_id: null,
        semantic_effect: 'none',
        laws: [
          'NO WORK != FAILURE',
          'PULSE != GLOBAL TICK',
        ],
      };
    }

    const filename = files[0];
    const pendingPath = join(this.runtimePaths.inboxPending, filename);
    const processedPath = join(this.runtimePaths.inboxProcessed, filename);
    const item = parseInboxItem(JSON.parse(await readFile(pendingPath, 'utf8')));

    if (!(await verifyCrossingEnvelope(item.crossing))) {
      throw new Error('INVALID_PENDING_CROSSING');
    }

    await this.appendEvent({
      event_type: 'WORK_CLAIMED',
      crossing_id: item.crossing_id,
      queue_item_id: item.queue_item_id,
      receipt_id: null,
      created_at: args.claimed_at,
      laws: [
        'CLAIMED != RECEIVED',
        'CLAIMED != ADMITTED',
      ],
    });

    const receiveReceipt = await this.receiver.receive(
      item.crossing,
      args.received_at,
    );
    const receiptId = nonEmpty(
      receiveReceipt.receipt_id,
      'RUNTIME_RECEIVE_RECEIPT_ID_MISSING',
    );

    if (!this.publishedReceiptIds.has(receiptId)) {
      await this.appendEvent({
        event_type: 'RECEIPT_REF_PUBLISHED',
        crossing_id: item.crossing_id,
        queue_item_id: item.queue_item_id,
        receipt_id: receiptId,
        created_at: args.received_at,
        laws: [
          'OBSERVABILITY != COMMAND',
          'RECEIPT != ADMISSION',
        ],
      });
    }

    await args.after_receive?.({
      queue_item: item,
      receive_receipt: receiveReceipt,
    });

    await rename(pendingPath, processedPath);

    await this.appendEvent({
      event_type: 'WORK_COMMITTED',
      crossing_id: item.crossing_id,
      queue_item_id: item.queue_item_id,
      receipt_id: receiptId,
      created_at: args.committed_at,
      laws: [
        'COMMITTED QUEUE WORK != ADMITTED',
        'QUEUE COMPLETION != SEMANTIC CONSEQUENCE',
      ],
    });

    return {
      schema: 'relatte.runtime-pulse/v0',
      status: 'processed',
      queue_item_id: item.queue_item_id,
      crossing_id: item.crossing_id,
      receive_receipt_id: receiptId,
      semantic_effect: 'none',
      laws: [
        'QUEUE != AUTHORITY',
        'RECEIVE != ADMIT',
        'RESTART != DUPLICATE CONSEQUENCE',
      ],
    };
  }

  async snapshot(): Promise<RuntimeSnapshot> {
    const pending = (await readdir(this.runtimePaths.inboxPending))
      .filter((name) => name.endsWith('.json'))
      .sort();
    const processed = (await readdir(this.runtimePaths.inboxProcessed))
      .filter((name) => name.endsWith('.json'))
      .sort();

    return {
      schema: 'relatte.runtime-snapshot/v0',
      manifest_id: this.manifest.manifest_id,
      world_id: this.manifest.world_id,
      runtime_history_head: this.runtimeHistoryHead,
      runtime_event_count: this.runtimeEventCount,
      pending_inbox: pending,
      processed_inbox: processed,
      published_receipt_ids: [...this.publishedReceiptIds].sort(),
      receiver: this.receiver.snapshot(),
      road_memory: this.roadMemory.snapshot(),
    };
  }

  async readReceiptBus(): Promise<RuntimeEvent[]> {
    const text = await readFile(this.runtimePaths.runtimeJournal, 'utf8');
    return text
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => parseRuntimeEvent(JSON.parse(line)));
  }
}

export function runtimeRootName(path: string): string {
  return basename(path);
}
