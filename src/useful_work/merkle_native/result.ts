import { createHash } from 'node:crypto';
import { canonicalBytes, exactKeys, hashValue, integer, parseJob, record } from '../job.ts';
import type { RenderJob } from '../job.ts';
import { digest } from '../challenge/commitment.ts';

export const RESULT_ID_PREFIX = 'useful-work-merkle-result-v1:';
export interface ResultHeader {
  schema: 'useful-work.merkle-result/v1';
  algorithm: 'sha256-jcs-pixel-tree/v1';
  job_spec_hash: string;
  width: number;
  height: number;
  counts_root: string;
}
export interface MerkleArtifact {
  schema: 'useful-work.merkle-artifact/v1';
  result: ResultHeader;
  escape_counts: number[];
}
function hash(domain: string, ...bytes: Buffer[]): string {
  const h = createHash('sha256').update(domain);
  for (const b of bytes) h.update(b);
  return h.digest('hex');
}
function leaf(index: number, count?: number): string {
  return count === undefined
    ? hash('UsefulWork-NativePadding-v1|', canonicalBytes({ index }))
    : hash('UsefulWork-NativePixel-v1|', canonicalBytes({ index, count }));
}
function parent(left: string, right: string): string {
  return hash('UsefulWork-NativeNode-v1|', Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}
export function parseHeader(value: unknown): ResultHeader {
  canonicalBytes(value);
  const h = record(value, 'INVALID_RESULT_HEADER');
  exactKeys(h, ['schema', 'algorithm', 'job_spec_hash', 'width', 'height', 'counts_root'], 'INVALID_RESULT_HEADER_FIELDS');
  if (h.schema !== 'useful-work.merkle-result/v1' || h.algorithm !== 'sha256-jcs-pixel-tree/v1') throw new Error('UNSUPPORTED_MERKLE_RESULT');
  digest(h.job_spec_hash); digest(h.counts_root);
  integer(h.width, 1, 512, 'INVALID_RESULT_WIDTH'); integer(h.height, 1, 512, 'INVALID_RESULT_HEIGHT');
  return structuredClone(h) as ResultHeader;
}
export function parseResultId(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith(RESULT_ID_PREFIX)) throw new Error('INVALID_RESULT_ID');
  digest(value.slice(RESULT_ID_PREFIX.length));
  return value;
}
/** The top Merkle node binds job + dimensions + ordered count subtree. This is the sole result identity. */
export function resultId(header: ResultHeader): string {
  return RESULT_ID_PREFIX + hash('UsefulWork-MerkleResult-v1|', canonicalBytes(parseHeader(header)));
}
export function headerForJob(value: unknown, jobValue: RenderJob): ResultHeader {
  const job = parseJob(jobValue), header = parseHeader(value);
  if (header.job_spec_hash !== hashValue(job) || header.width !== job.width || header.height !== job.height) throw new Error('RESULT_JOB_MISMATCH');
  return header;
}
export function buildResult(jobValue: RenderJob, counts: number[]) {
  const job = parseJob(jobValue), population = job.width * job.height;
  if (!Array.isArray(counts) || counts.length !== population) throw new Error('INVALID_RESULT_COUNT');
  for (const count of counts) integer(count, 0, job.iterations, 'INVALID_ESCAPE_COUNT');
  const size = 2 ** Math.ceil(Math.log2(population));
  const levels = [Array.from({ length: size }, (_, i) => leaf(i, counts[i]))];
  while (levels.at(-1)!.length > 1) {
    const previous = levels.at(-1)!;
    levels.push(Array.from({ length: previous.length / 2 }, (_, i) => parent(previous[2 * i], previous[2 * i + 1])));
  }
  const header: ResultHeader = {
    schema: 'useful-work.merkle-result/v1', algorithm: 'sha256-jcs-pixel-tree/v1',
    job_spec_hash: hashValue(job), width: job.width, height: job.height, counts_root: levels.at(-1)![0],
  };
  const artifact: MerkleArtifact = { schema: 'useful-work.merkle-artifact/v1', result: header, escape_counts: [...counts] };
  return { header, result_id: resultId(header), artifact, bytes: canonicalBytes(artifact), proof(index: number) {
    integer(index, 0, population - 1, 'INVALID_SAMPLE_INDEX');
    const siblings: string[] = [];
    for (const level of levels.slice(0, -1)) { siblings.push(level[index ^ 1]); index = Math.floor(index / 2); }
    return siblings;
  } };
}
/** Inclusion in the subtree AND derivation of the named artifact identity are one verification. */
export function verifyResultProof(headerValue: unknown, identity: string, index: number, count: number, proof: unknown): boolean {
  try {
    const header = parseHeader(headerValue);
    if (resultId(header) !== parseResultId(identity)) return false;
    const population = header.width * header.height;
    integer(index, 0, population - 1, 'INVALID_SAMPLE_INDEX'); integer(count, 0, 4096, 'INVALID_ESCAPE_COUNT');
    if (!Array.isArray(proof) || proof.length !== Math.ceil(Math.log2(population))) return false;
    let current = leaf(index, count);
    for (const sibling of proof) {
      digest(sibling);
      current = index % 2 ? parent(sibling, current) : parent(current, sibling);
      index = Math.floor(index / 2);
    }
    return current === header.counts_root;
  } catch { return false; }
}
/** Full bytes must be canonical and all leaves must rebuild the SAME identity; no JSON hash identity exists. */
export function inspectArtifact(bytes: Buffer, job: RenderJob, expectedId: string) {
  if (bytes.length > 16 * 1024 * 1024) throw new Error('ARTIFACT_SIZE_LIMIT');
  const a = record(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), 'INVALID_MERKLE_ARTIFACT');
  exactKeys(a, ['schema', 'result', 'escape_counts'], 'INVALID_MERKLE_ARTIFACT_FIELDS');
  if (a.schema !== 'useful-work.merkle-artifact/v1') throw new Error('UNSUPPORTED_MERKLE_ARTIFACT');
  if (!bytes.equals(canonicalBytes(a))) throw new Error('NON_CANONICAL_MERKLE_ARTIFACT');
  const header = headerForJob(a.result, job);
  if (resultId(header) !== parseResultId(expectedId)) throw new Error('RESULT_IDENTITY_MISMATCH');
  const rebuilt = buildResult(job, a.escape_counts);
  if (rebuilt.result_id !== expectedId) throw new Error('RESULT_LEAVES_IDENTITY_MISMATCH');
  return rebuilt;
}
