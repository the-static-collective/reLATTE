import { createHash } from 'node:crypto';
import { SCALE } from './job.ts';
import type { RenderJob } from './job.ts';

/** Integer-only reference algorithm. BigInt division truncates toward zero. */
function seedConstant(job: RenderJob): [bigint, bigint] {
  const seed = createHash('sha256').update(`UsefulWork-JuliaSeed-v1|${job.seed}`).digest();
  const offset = (word: number) => BigInt(word % 524289 - 262144);
  const cr = BigInt(job.parameters.c_real_q) + offset(seed.readUInt32BE(0));
  const ci = BigInt(job.parameters.c_imag_q) + offset(seed.readUInt32BE(4));
  return [cr, ci];
}

/** Single-coordinate computation; no other pixel orbit is evaluated. */
export function sampleOrbit(job: RenderJob, index: number, constant = seedConstant(job)) {
  if (!Number.isSafeInteger(index) || index < 0 || index >= job.width * job.height) throw new Error('INVALID_SAMPLE_INDEX');
  const q = BigInt(SCALE), [cr, ci] = constant;
  const x = index % job.width, y = Math.floor(index / job.width);
  // Pixel centers. Lower imaginary bound is row zero.
  let zr = BigInt(job.bounds.min_real_q) +
    BigInt(2 * x + 1) * BigInt(job.bounds.max_real_q - job.bounds.min_real_q) / BigInt(2 * job.width);
  let zi = BigInt(job.bounds.min_imag_q) +
    BigInt(2 * y + 1) * BigInt(job.bounds.max_imag_q - job.bounds.min_imag_q) / BigInt(2 * job.height);
  let n = 0;
  while (n < job.iterations && zr * zr + zi * zi <= 4n * q * q) {
    const nextReal = (zr * zr - zi * zi) / q + cr;
    zi = (2n * zr * zi) / q + ci;
    zr = nextReal;
    n++;
  }
  return { index, count: n, final_real_q: zr.toString(), final_imag_q: zi.toString() };
}

export function renderCounts(job: RenderJob): number[] {
  const constant = seedConstant(job);
  return Array.from({ length: job.width * job.height }, (_, index) => sampleOrbit(job, index, constant).count);
}
