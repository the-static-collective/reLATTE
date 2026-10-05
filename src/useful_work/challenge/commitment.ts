import { createHash } from 'node:crypto';
import { canonicalBytes, exactKeys, integer, record } from '../job.ts';

export interface SampleCommitment {
  schema: 'useful-work.sample-commitment/v1';
  algorithm: 'sha256-jcs-padded-binary/v1';
  job_spec_hash: string;
  result_hash: string;
  population: number;
  root_hash: string;
}
export function digest(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error('INVALID_DIGEST');
  return value;
}
export function parseCommitment(value: unknown): SampleCommitment {
  const c = record(value, 'MISSING_SAMPLE_COMMITMENT');
  exactKeys(c, ['schema', 'algorithm', 'job_spec_hash', 'result_hash', 'population', 'root_hash'], 'INVALID_COMMITMENT_FIELDS');
  if (c.schema !== 'useful-work.sample-commitment/v1' || c.algorithm !== 'sha256-jcs-padded-binary/v1') throw new Error('UNSUPPORTED_COMMITMENT');
  for (const key of ['job_spec_hash', 'result_hash', 'root_hash']) digest(c[key]);
  integer(c.population, 1, 512 * 512, 'INVALID_POPULATION');
  return structuredClone(c) as SampleCommitment;
}
function hash(domain: string, ...bytes: Buffer[]): string {
  return createHash('sha256').update(domain).update(Buffer.concat(bytes)).digest('hex');
}
function leaf(c: Pick<SampleCommitment, 'job_spec_hash' | 'result_hash'>, index: number, count?: number): string {
  const identity = { job_spec_hash: c.job_spec_hash, result_hash: c.result_hash, index };
  return count === undefined
    ? hash('UsefulWork-SamplePadding-v1|', canonicalBytes(identity))
    : hash('UsefulWork-SampleLeaf-v1|', canonicalBytes({ ...identity, count }));
}
function parent(left: string, right: string): string {
  return hash('UsefulWork-SampleNode-v1|', Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}
export function buildCommitment(jobHash: string, resultHash: string, counts: number[]) {
  digest(jobHash); digest(resultHash);
  if (!Array.isArray(counts)) throw new Error('INVALID_COUNTS');
  integer(counts.length, 1, 512 * 512, 'INVALID_POPULATION');
  for (const n of counts) integer(n, 0, 4096, 'INVALID_ESCAPE_COUNT');
  const identity = { job_spec_hash: jobHash, result_hash: resultHash };
  const size = 2 ** Math.ceil(Math.log2(counts.length));
  const levels = [Array.from({ length: size }, (_, i) => leaf(identity, i, counts[i]))];
  while (levels.at(-1)!.length > 1) {
    const previous = levels.at(-1)!;
    levels.push(Array.from({ length: previous.length / 2 }, (_, i) => parent(previous[2 * i], previous[2 * i + 1])));
  }
  const commitment: SampleCommitment = {
    schema: 'useful-work.sample-commitment/v1', algorithm: 'sha256-jcs-padded-binary/v1',
    ...identity, population: counts.length, root_hash: levels.at(-1)![0],
  };
  return { commitment, proof(index: number): string[] {
    integer(index, 0, counts.length - 1, 'INVALID_SAMPLE_INDEX');
    const siblings: string[] = [];
    for (const level of levels.slice(0, -1)) { siblings.push(level[index ^ 1]); index = Math.floor(index / 2); }
    return siblings;
  } };
}
export function verifyMembership(c: SampleCommitment, index: number, count: number, proof: unknown): boolean {
  try {
    parseCommitment(c);
    integer(index, 0, c.population - 1, 'INVALID_SAMPLE_INDEX');
    integer(count, 0, 4096, 'INVALID_ESCAPE_COUNT');
    if (!Array.isArray(proof) || proof.length !== Math.ceil(Math.log2(c.population))) return false;
    let current = leaf(c, index, count);
    for (const sibling of proof) {
      digest(sibling);
      current = index % 2 ? parent(sibling, current) : parent(current, sibling);
      index = Math.floor(index / 2);
    }
    return current === c.root_hash;
  } catch { return false; }
}

/** SHA-256 stream + rejection sampling + sparse Fisher–Yates, without replacement. */
export function deriveSampleIndices(workId: string, challengeId: string, population: number, sampleCount: number): number[] {
  for (const id of [workId, challengeId]) if (!/^relatte-crossing-v0:[a-f0-9]{64}$/.test(id)) throw new Error('INVALID_CROSSING_ID');
  integer(population, 1, 512 * 512, 'INVALID_POPULATION');
  integer(sampleCount, 1, Math.min(population, 64), 'INVALID_SAMPLE_COUNT');
  const swaps = new Map<number, number>();
  const chosen: number[] = [];
  let counter = 0;
  for (let remaining = population; chosen.length < sampleCount; remaining--) {
    const limit = Math.floor(2 ** 32 / remaining) * remaining;
    let word: number;
    do {
      if (counter >= 100_000) throw new Error('SAMPLE_DERIVATION_LIMIT');
      word = createHash('sha256').update(`UsefulWork-SampleCoordinates-v1|${workId}|${challengeId}|${counter++}`).digest().readUInt32BE(0);
    } while (word >= limit);
    const slot = word % remaining;
    chosen.push(swaps.get(slot) ?? slot);
    swaps.set(slot, swaps.get(remaining - 1) ?? remaining - 1);
  }
  return chosen.sort((a, b) => a - b);
}
