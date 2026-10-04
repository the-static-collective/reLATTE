import { exactKeys, integer, record } from './job.ts';
import type { RenderJob } from './job.ts';

export interface MathematicalResult {
  schema: 'useful-work.result/v1';
  job_spec_hash: string;
  width: number;
  height: number;
  escape_counts: number[];
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
