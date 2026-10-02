import {
  appendFile,
  mkdir,
  readFile,
  stat,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';

import {
  canonicalizeDomainValue,
  sha256Hex,
  validateTimestamp,
} from './canonical.ts';

export const ROAD_MEMORY_EVENT_DOMAIN = 'reLATTE-RoadMemoryEvent-v0|';
export const ROAD_MEMORY_STATE_DOMAIN = 'reLATTE-RoadMemoryState-v0|';

export type AvailabilityFailureCode =
  | 'TRANSPORT_UNREACHABLE'
  | 'REMOTE_HTTP_UNAVAILABLE';

export interface RoadMemoryConfig {
  schema: 'relatte.road-memory-config/v0';
  failure_threshold: number;
  cooldown_ms: number;
}

export interface RoadMemoryDecision {
  schema: 'relatte.road-memory-decision/v0';
  candidate_id: string;
  endpoint: string;
  observed_at: string;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  action: 'ATTEMPT' | 'SKIP_OPEN' | 'PROBE_HALF_OPEN';
  consecutive_failures: number;
  open_until: string | null;
  semantic_effect: 'none';
  laws: string[];
}

interface RoadMemoryEventBody {
  schema: 'relatte.road-memory-event/v0';
  seq: number;
  previous_hash: string | null;
  event_type: 'AVAILABILITY_FAILURE' | 'SUCCESS';
  candidate_id: string;
  endpoint: string;
  failure_code: AvailabilityFailureCode | null;
  observed_at: string;
}

interface RoadMemoryEvent extends RoadMemoryEventBody {
  event_hash: string;
}

interface CandidateState {
  candidate_id: string;
  endpoint: string;
  consecutive_failures: number;
  circuit: 'CLOSED' | 'OPEN';
  open_until: string | null;
  last_observed_at: string;
  last_failure_code: AvailabilityFailureCode | null;
}

export interface RoadMemorySnapshot {
  schema: 'relatte.road-memory-snapshot/v0';
  history_head: string | null;
  event_count: number;
  candidates: CandidateState[];
  state_ref: string;
}

function nonEmpty(value: unknown, code: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(code);
  return value;
}

function fileExists(path: string): Promise<boolean> {
  return stat(path).then(() => true).catch(() => false);
}

function validateConfig(value: unknown): RoadMemoryConfig {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('INVALID_ROAD_MEMORY_CONFIG');
  }
  const config = value as Record<string, unknown>;
  if (config.schema !== 'relatte.road-memory-config/v0') {
    throw new Error('INVALID_ROAD_MEMORY_CONFIG_SCHEMA');
  }
  if (!Number.isSafeInteger(config.failure_threshold) || Number(config.failure_threshold) < 1) {
    throw new Error('INVALID_ROAD_MEMORY_FAILURE_THRESHOLD');
  }
  if (!Number.isSafeInteger(config.cooldown_ms) || Number(config.cooldown_ms) < 1) {
    throw new Error('INVALID_ROAD_MEMORY_COOLDOWN');
  }
  return {
    schema: 'relatte.road-memory-config/v0',
    failure_threshold: Number(config.failure_threshold),
    cooldown_ms: Number(config.cooldown_ms),
  };
}

function eventHash(body: RoadMemoryEventBody): string {
  return `relatte-road-memory-event-v0:${sha256Hex(
    canonicalizeDomainValue(ROAD_MEMORY_EVENT_DOMAIN, body)
  )}`;
}

function stateRef(
  config: RoadMemoryConfig,
  historyHead: string | null,
  eventCount: number,
  states: Map<string, CandidateState>,
): string {
  const candidates = [...states.values()]
    .sort((a, b) => a.candidate_id.localeCompare(b.candidate_id))
    .map((state) => ({ ...state }));
  return `relatte-road-memory-state-v0:${sha256Hex(
    canonicalizeDomainValue(ROAD_MEMORY_STATE_DOMAIN, {
      config,
      history_head: historyHead,
      event_count: eventCount,
      candidates,
    })
  )}`;
}

function isoAfter(ts: string, milliseconds: number): string {
  validateTimestamp(ts);
  const epoch = Date.parse(ts);
  if (!Number.isFinite(epoch)) throw new Error('INVALID_TIMESTAMP');
  return new Date(epoch + milliseconds).toISOString();
}

function compareIso(a: string, b: string): number {
  validateTimestamp(a);
  validateTimestamp(b);
  return Date.parse(a) - Date.parse(b);
}

function isAvailabilityFailureCode(value: unknown): value is AvailabilityFailureCode {
  return value === 'TRANSPORT_UNREACHABLE' || value === 'REMOTE_HTTP_UNAVAILABLE';
}

export class LocalRoadMemory {
  readonly root: string;
  readonly config: RoadMemoryConfig;

  private readonly states = new Map<string, CandidateState>();
  private historyHead: string | null = null;
  private eventCount = 0;

  private constructor(root: string, config: RoadMemoryConfig) {
    this.root = root;
    this.config = config;
  }

  static async create(
    root: string,
    input: Omit<RoadMemoryConfig, 'schema'>,
  ): Promise<LocalRoadMemory> {
    if (await fileExists(root)) throw new Error('ROAD_MEMORY_ROOT_EXISTS');

    const config = validateConfig({
      schema: 'relatte.road-memory-config/v0',
      failure_threshold: input.failure_threshold,
      cooldown_ms: input.cooldown_ms,
    });

    await mkdir(root, { recursive: true });
    await writeFile(
      join(root, 'road-memory.json'),
      JSON.stringify(config, null, 2) + '\n',
      'utf8',
    );
    await writeFile(join(root, 'journal.jsonl'), '', 'utf8');

    return new LocalRoadMemory(root, config);
  }

  static async open(root: string): Promise<LocalRoadMemory> {
    const config = validateConfig(
      JSON.parse(await readFile(join(root, 'road-memory.json'), 'utf8')),
    );
    const memory = new LocalRoadMemory(root, config);
    await memory.replay();
    return memory;
  }

  private applyEvent(event: RoadMemoryEvent): void {
    const prior = this.states.get(event.candidate_id);
    if (prior && prior.endpoint !== event.endpoint) {
      throw new Error('ROAD_MEMORY_CANDIDATE_ENDPOINT_DRIFT');
    }

    if (event.event_type === 'AVAILABILITY_FAILURE') {
      if (!event.failure_code || !isAvailabilityFailureCode(event.failure_code)) {
        throw new Error('INVALID_ROAD_MEMORY_FAILURE_CODE');
      }

      const consecutiveFailures = (prior?.consecutive_failures ?? 0) + 1;
      const opens = consecutiveFailures >= this.config.failure_threshold;
      this.states.set(event.candidate_id, {
        candidate_id: event.candidate_id,
        endpoint: event.endpoint,
        consecutive_failures: consecutiveFailures,
        circuit: opens ? 'OPEN' : 'CLOSED',
        open_until: opens
          ? isoAfter(event.observed_at, this.config.cooldown_ms)
          : null,
        last_observed_at: event.observed_at,
        last_failure_code: event.failure_code,
      });
      return;
    }

    this.states.set(event.candidate_id, {
      candidate_id: event.candidate_id,
      endpoint: event.endpoint,
      consecutive_failures: 0,
      circuit: 'CLOSED',
      open_until: null,
      last_observed_at: event.observed_at,
      last_failure_code: null,
    });
  }

  private async replay(): Promise<void> {
    this.states.clear();
    this.historyHead = null;
    this.eventCount = 0;

    const text = await readFile(join(this.root, 'journal.jsonl'), 'utf8');
    const lines = text.split('\n').filter((line) => line.trim().length > 0);

    for (let index = 0; index < lines.length; index++) {
      const event = JSON.parse(lines[index]) as RoadMemoryEvent;
      if (event.schema !== 'relatte.road-memory-event/v0') {
        throw new Error('INVALID_ROAD_MEMORY_EVENT_SCHEMA');
      }
      if (event.seq !== index + 1) throw new Error('INVALID_ROAD_MEMORY_EVENT_SEQUENCE');
      if (event.previous_hash !== this.historyHead) {
        throw new Error('INVALID_ROAD_MEMORY_EVENT_CHAIN');
      }
      validateTimestamp(event.observed_at);
      if (event.event_hash !== eventHash({
        schema: event.schema,
        seq: event.seq,
        previous_hash: event.previous_hash,
        event_type: event.event_type,
        candidate_id: event.candidate_id,
        endpoint: event.endpoint,
        failure_code: event.failure_code,
        observed_at: event.observed_at,
      })) {
        throw new Error('INVALID_ROAD_MEMORY_EVENT_HASH');
      }

      nonEmpty(event.candidate_id, 'INVALID_ROAD_MEMORY_CANDIDATE');
      nonEmpty(event.endpoint, 'INVALID_ROAD_MEMORY_ENDPOINT');
      this.applyEvent(event);
      this.historyHead = event.event_hash;
      this.eventCount += 1;
    }
  }

  private async appendEvent(
    body: Omit<RoadMemoryEventBody, 'seq' | 'previous_hash'>,
  ): Promise<RoadMemoryEvent> {
    validateTimestamp(body.observed_at);
    nonEmpty(body.candidate_id, 'INVALID_ROAD_MEMORY_CANDIDATE');
    nonEmpty(body.endpoint, 'INVALID_ROAD_MEMORY_ENDPOINT');

    const prior = this.states.get(body.candidate_id);
    if (prior && compareIso(body.observed_at, prior.last_observed_at) < 0) {
      throw new Error('ROAD_MEMORY_TIME_REGRESSION');
    }

    const eventBody: RoadMemoryEventBody = {
      ...body,
      seq: this.eventCount + 1,
      previous_hash: this.historyHead,
    };
    const event: RoadMemoryEvent = {
      ...eventBody,
      event_hash: eventHash(eventBody),
    };

    await appendFile(
      join(this.root, 'journal.jsonl'),
      JSON.stringify(event) + '\n',
      'utf8',
    );

    this.applyEvent(event);
    this.historyHead = event.event_hash;
    this.eventCount += 1;
    return event;
  }

  async observeAvailabilityFailure(args: {
    candidate_id: string;
    endpoint: string;
    failure_code: string;
    observed_at: string;
  }): Promise<RoadMemoryEvent> {
    if (!isAvailabilityFailureCode(args.failure_code)) {
      throw new Error('NON_AVAILABILITY_FAILURE_NOT_RECORDABLE');
    }

    return this.appendEvent({
      schema: 'relatte.road-memory-event/v0',
      event_type: 'AVAILABILITY_FAILURE',
      candidate_id: args.candidate_id,
      endpoint: args.endpoint,
      failure_code: args.failure_code,
      observed_at: args.observed_at,
    });
  }

  async observeSuccess(args: {
    candidate_id: string;
    endpoint: string;
    observed_at: string;
  }): Promise<RoadMemoryEvent> {
    return this.appendEvent({
      schema: 'relatte.road-memory-event/v0',
      event_type: 'SUCCESS',
      candidate_id: args.candidate_id,
      endpoint: args.endpoint,
      failure_code: null,
      observed_at: args.observed_at,
    });
  }

  decide(args: {
    candidate_id: string;
    endpoint: string;
    observed_at: string;
  }): RoadMemoryDecision {
    const candidateId = nonEmpty(args.candidate_id, 'INVALID_ROAD_MEMORY_CANDIDATE');
    const endpoint = nonEmpty(args.endpoint, 'INVALID_ROAD_MEMORY_ENDPOINT');
    validateTimestamp(args.observed_at);

    const state = this.states.get(candidateId);
    if (state && state.endpoint !== endpoint) {
      throw new Error('ROAD_MEMORY_CANDIDATE_ENDPOINT_DRIFT');
    }

    if (!state || state.circuit === 'CLOSED') {
      return {
        schema: 'relatte.road-memory-decision/v0',
        candidate_id: candidateId,
        endpoint,
        observed_at: args.observed_at,
        state: 'CLOSED',
        action: 'ATTEMPT',
        consecutive_failures: state?.consecutive_failures ?? 0,
        open_until: null,
        semantic_effect: 'none',
        laws: [
          'LOCAL ROAD MEMORY != GLOBAL REPUTATION',
          'ATTEMPT != TRUST',
        ],
      };
    }

    const openUntil = nonEmpty(state.open_until, 'ROAD_MEMORY_OPEN_WITHOUT_DEADLINE');
    if (compareIso(args.observed_at, openUntil) < 0) {
      return {
        schema: 'relatte.road-memory-decision/v0',
        candidate_id: candidateId,
        endpoint,
        observed_at: args.observed_at,
        state: 'OPEN',
        action: 'SKIP_OPEN',
        consecutive_failures: state.consecutive_failures,
        open_until: openUntil,
        semantic_effect: 'none',
        laws: [
          'LOCAL ROAD MEMORY != GLOBAL REPUTATION',
          'SKIP != ERASURE',
          'OPEN != PERMANENTLY DEAD',
        ],
      };
    }

    return {
      schema: 'relatte.road-memory-decision/v0',
      candidate_id: candidateId,
      endpoint,
      observed_at: args.observed_at,
      state: 'HALF_OPEN',
      action: 'PROBE_HALF_OPEN',
      consecutive_failures: state.consecutive_failures,
      open_until: openUntil,
      semantic_effect: 'none',
      laws: [
        'LOCAL ROAD MEMORY != GLOBAL REPUTATION',
        'PROBE != TRUST',
        'HALF_OPEN != HEALTHY',
      ],
    };
  }

  snapshot(): RoadMemorySnapshot {
    const candidates = [...this.states.values()]
      .sort((a, b) => a.candidate_id.localeCompare(b.candidate_id))
      .map((state) => ({ ...state }));

    return {
      schema: 'relatte.road-memory-snapshot/v0',
      history_head: this.historyHead,
      event_count: this.eventCount,
      candidates,
      state_ref: stateRef(
        this.config,
        this.historyHead,
        this.eventCount,
        this.states,
      ),
    };
  }
}
