import { canonicalize, sha256Hex } from '../canonical.ts';

export const SCALE = 16_777_216; // Q24, part of julia-q24/v1's contract.
export const MAX_WORK = 5_000_000;
export interface RenderJob {
  schema: 'useful-work.render-job/v1';
  algorithm: 'julia-q24/v1';
  seed: number;
  width: number;
  height: number;
  iterations: number;
  bounds: { min_real_q: number; max_real_q: number; min_imag_q: number; max_imag_q: number };
  parameters: { c_real_q: number; c_imag_q: number };
}

export function record(value: unknown, code: string): Record<string, any> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
  return value as Record<string, any>;
}
export function exactKeys(value: Record<string, any>, keys: string[], code: string): void {
  if (Object.keys(value).sort().join('|') !== [...keys].sort().join('|')) throw new Error(code);
}
export function integer(value: unknown, min: number, max: number, code: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) throw new Error(code);
  return value;
}
export function canonicalBytes(value: unknown): Buffer { return Buffer.from(canonicalize(value), 'utf8'); }
export function hashValue(value: unknown): string { return sha256Hex(canonicalBytes(value)); }

export function parseJob(value: unknown): RenderJob {
  // Validate before reading properties, including getters, prototypes and unsafe numbers.
  canonicalize(value);
  const job = record(value, 'INVALID_JOB');
  exactKeys(job, ['schema', 'algorithm', 'seed', 'width', 'height', 'iterations', 'bounds', 'parameters'], 'INVALID_JOB_FIELDS');
  if (job.schema !== 'useful-work.render-job/v1') throw new Error('UNSUPPORTED_JOB_SCHEMA');
  if (job.algorithm !== 'julia-q24/v1') throw new Error('UNSUPPORTED_ALGORITHM');
  integer(job.seed, 0, 0xffffffff, 'INVALID_SEED');
  integer(job.width, 1, 512, 'INVALID_WIDTH');
  integer(job.height, 1, 512, 'INVALID_HEIGHT');
  integer(job.iterations, 1, 4096, 'INVALID_ITERATIONS');
  if (job.width * job.height * job.iterations > MAX_WORK) throw new Error('WORK_LIMIT_EXCEEDED');
  const bounds = record(job.bounds, 'INVALID_BOUNDS');
  exactKeys(bounds, ['min_real_q', 'max_real_q', 'min_imag_q', 'max_imag_q'], 'INVALID_BOUNDS_FIELDS');
  for (const n of Object.values(bounds)) integer(n, -4 * SCALE, 4 * SCALE, 'INVALID_BOUND');
  if (bounds.min_real_q >= bounds.max_real_q || bounds.min_imag_q >= bounds.max_imag_q) throw new Error('EMPTY_BOUNDS');
  const parameters = record(job.parameters, 'INVALID_PARAMETERS');
  exactKeys(parameters, ['c_real_q', 'c_imag_q'], 'INVALID_PARAMETER_FIELDS');
  for (const n of Object.values(parameters)) integer(n, -2 * SCALE, 2 * SCALE, 'INVALID_PARAMETER');
  return structuredClone(job) as RenderJob;
}
