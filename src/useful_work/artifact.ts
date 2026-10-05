import { exactKeys, integer, record } from './job.ts';
import type { RenderJob } from './job.ts';

export interface MathematicalResult {
  schema: 'useful-work.result/v1';
  job_spec_hash: string;
  width: number;
  height: number;
  escape_counts: number[];
}
export interface ExecutionMetadata {
  schema: 'useful-work.execution/v1';
  algorithm: 'julia-q24/v1';
  started_at: string;
  finished_at: string;
  elapsed_ms: number;
  runtime: string;
  samples: number;
  orbit_steps: number;
  authority: 'worker-reported; not independently attested';
}

export function parseResult(value: unknown, job: RenderJob): MathematicalResult {
  const result = record(value, 'INVALID_RESULT');
  exactKeys(result, ['schema', 'job_spec_hash', 'width', 'height', 'escape_counts'], 'INVALID_RESULT_FIELDS');
  if (result.schema !== 'useful-work.result/v1') throw new Error('UNSUPPORTED_RESULT_SCHEMA');
  if (typeof result.job_spec_hash !== 'string' || !/^[a-f0-9]{64}$/.test(result.job_spec_hash)) throw new Error('INVALID_RESULT_JOB_HASH');
  if (result.width !== job.width || result.height !== job.height) throw new Error('RESULT_DIMENSIONS_MISMATCH');
  if (!Array.isArray(result.escape_counts) || result.escape_counts.length !== job.width * job.height) throw new Error('INVALID_SAMPLE_COUNT');
  for (const n of result.escape_counts) integer(n, 0, job.iterations, 'INVALID_ESCAPE_COUNT');
  return result as MathematicalResult;
}

function isoTimestamp(value: unknown, code: string): string {
  if (typeof value !== 'string') throw new Error(code);
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) throw new Error(code);
  return value;
}

export function parseExecutionMetadata(value: unknown, job: RenderJob): ExecutionMetadata {
  const metadata = record(value, 'INVALID_METADATA');
  exactKeys(metadata, [
    'schema', 'algorithm', 'started_at', 'finished_at', 'elapsed_ms',
    'runtime', 'samples', 'orbit_steps', 'authority',
  ], 'INVALID_METADATA_FIELDS');
  if (metadata.schema !== 'useful-work.execution/v1') throw new Error('UNSUPPORTED_METADATA_SCHEMA');
  if (metadata.algorithm !== job.algorithm) throw new Error('METADATA_ALGORITHM_MISMATCH');
  isoTimestamp(metadata.started_at, 'INVALID_METADATA_STARTED_AT');
  isoTimestamp(metadata.finished_at, 'INVALID_METADATA_FINISHED_AT');
  integer(metadata.elapsed_ms, 0, Number.MAX_SAFE_INTEGER, 'INVALID_METADATA_ELAPSED');
  if (typeof metadata.runtime !== 'string' || metadata.runtime.length < 1 || metadata.runtime.length > 128) throw new Error('INVALID_METADATA_RUNTIME');
  const expectedSamples = job.width * job.height;
  integer(metadata.samples, 1, expectedSamples, 'INVALID_METADATA_SAMPLES');
  if (metadata.samples !== expectedSamples) throw new Error('METADATA_SAMPLE_MISMATCH');
  integer(metadata.orbit_steps, 0, expectedSamples * job.iterations, 'INVALID_METADATA_ORBIT_STEPS');
  if (metadata.authority !== 'worker-reported; not independently attested') throw new Error('INVALID_METADATA_AUTHORITY');
  return structuredClone(metadata) as ExecutionMetadata;
}

/** Optional portable pixmap; visual bytes are separately hashed, never used as mathematical truth. */
export function renderPpm(result: MathematicalResult, iterations: number): Buffer {
  const pixels = Buffer.alloc(result.escape_counts.length * 3);
  result.escape_counts.forEach((n, i) => {
    if (n === iterations) return;
    pixels[i * 3] = (n * 17) % 256;
    pixels[i * 3 + 1] = (n * 31) % 256;
    pixels[i * 3 + 2] = (n * 47) % 256;
  });
  return Buffer.concat([Buffer.from(`P6\n${result.width} ${result.height}\n255\n`), pixels]);
}
