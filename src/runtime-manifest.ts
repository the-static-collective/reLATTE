import { readFile, writeFile } from 'node:fs/promises';

import {
  canonicalizeDomainValue,
  sha256Hex,
} from './canonical.ts';

export const WORLD_MANIFEST_ID_DOMAIN = 'reLATTE-WorldManifest-v0|';

export interface WorldManifest {
  schema: 'relatte.world-manifest/v0';
  manifest_id: string;
  world_id: string;
  receiver_particular: string;
  receiver_contract_ref: string;
  organs: {
    local_receiver: true;
    road_memory: true;
    receipt_bus: true;
    inbox: true;
    outbox: true;
    capability_kernel: true;
    encryption: true;
  };
  road_memory: {
    failure_threshold: number;
    cooldown_ms: number;
  };
  runtime: {
    pulse_interval_ms: number;
    automatic_disposition: null;
  };
  laws: string[];
}

function nonEmpty(value: unknown, code: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(code);
  return value;
}

function positiveInteger(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw new Error(code);
  return Number(value);
}

function identityBody(value: Omit<WorldManifest, 'manifest_id'>): Record<string, unknown> {
  return {
    schema: value.schema,
    world_id: value.world_id,
    receiver_particular: value.receiver_particular,
    receiver_contract_ref: value.receiver_contract_ref,
    organs: { ...value.organs },
    road_memory: { ...value.road_memory },
    runtime: { ...value.runtime },
    laws: [...value.laws],
  };
}

export function createWorldManifest(args: {
  world_id: string;
  receiver_particular: string;
  receiver_contract_ref: string;
  road_memory_failure_threshold?: number;
  road_memory_cooldown_ms?: number;
  pulse_interval_ms?: number;
}): WorldManifest {
  const body: Omit<WorldManifest, 'manifest_id'> = {
    schema: 'relatte.world-manifest/v0',
    world_id: nonEmpty(args.world_id, 'INVALID_RUNTIME_WORLD_ID'),
    receiver_particular: nonEmpty(
      args.receiver_particular,
      'INVALID_RUNTIME_RECEIVER_PARTICULAR',
    ),
    receiver_contract_ref: nonEmpty(
      args.receiver_contract_ref,
      'INVALID_RUNTIME_RECEIVER_CONTRACT',
    ),
    organs: {
      local_receiver: true,
      road_memory: true,
      receipt_bus: true,
      inbox: true,
      outbox: true,
      capability_kernel: true,
      encryption: true,
    },
    road_memory: {
      failure_threshold: positiveInteger(
        args.road_memory_failure_threshold ?? 1,
        'INVALID_RUNTIME_ROAD_MEMORY_THRESHOLD',
      ),
      cooldown_ms: positiveInteger(
        args.road_memory_cooldown_ms ?? 60_000,
        'INVALID_RUNTIME_ROAD_MEMORY_COOLDOWN',
      ),
    },
    runtime: {
      pulse_interval_ms: positiveInteger(
        args.pulse_interval_ms ?? 1_000,
        'INVALID_RUNTIME_PULSE_INTERVAL',
      ),
      automatic_disposition: null,
    },
    laws: [
      'MANIFEST != WORLD',
      'BOOT != NEW HISTORY',
      'RUNTIME != RECEIVER AUTHORITY',
      'QUEUE != AUTHORITY',
      'OBSERVABILITY != COMMAND',
      'RECEIVE != ADMIT',
    ],
  };

  return {
    ...body,
    manifest_id: `relatte-world-manifest-v0:${sha256Hex(
      canonicalizeDomainValue(WORLD_MANIFEST_ID_DOMAIN, identityBody(body))
    )}`,
  };
}

export function parseWorldManifest(value: unknown): WorldManifest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('INVALID_WORLD_MANIFEST');
  }
  const source = value as Record<string, any>;
  if (source.schema !== 'relatte.world-manifest/v0') {
    throw new Error('INVALID_WORLD_MANIFEST_SCHEMA');
  }

  const parsed = createWorldManifest({
    world_id: source.world_id,
    receiver_particular: source.receiver_particular,
    receiver_contract_ref: source.receiver_contract_ref,
    road_memory_failure_threshold: source.road_memory?.failure_threshold,
    road_memory_cooldown_ms: source.road_memory?.cooldown_ms,
    pulse_interval_ms: source.runtime?.pulse_interval_ms,
  });

  if (source.manifest_id !== parsed.manifest_id) {
    throw new Error('WORLD_MANIFEST_ID_MISMATCH');
  }
  if (source.runtime?.automatic_disposition !== null) {
    throw new Error('RUNTIME_AUTOMATIC_DISPOSITION_FORBIDDEN');
  }

  return parsed;
}

export async function writeWorldManifest(
  path: string,
  manifest: WorldManifest,
): Promise<void> {
  const verified = parseWorldManifest(manifest);
  await writeFile(path, JSON.stringify(verified, null, 2) + '\n', 'utf8');
}

export async function readWorldManifest(path: string): Promise<WorldManifest> {
  return parseWorldManifest(JSON.parse(await readFile(path, 'utf8')));
}
