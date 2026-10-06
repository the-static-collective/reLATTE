import { sha256Hex } from '../../canonical.ts';
import { canonicalBytes, exactKeys, record } from '../job.ts';
import { equal } from '../audit_clock/wire.ts';
import type { NativeContext } from '../merkle_native/exchange.ts';
import { inspectArtifact } from '../merkle_native/result.ts';
import { pairTimes, uint } from './wire.ts';

export interface FileStatObservation { dev: string; ino: string; size: string; blocks: string; mode: string; mtime_ns: string; ctime_ns: string }
export interface StorageEvidence {
  started_at: string; finished_at: string; file_path: string; stat_before: FileStatObservation; stat_after: FileStatObservation;
  artifact_base64: string; file_sha256: string;
}
export function storageProjection(value: unknown, native: NativeContext) {
  canonicalBytes(value);
  const e = record(value, 'INVALID_STORAGE_EVIDENCE');
  exactKeys(e, ['started_at', 'finished_at', 'file_path', 'stat_before', 'stat_after', 'artifact_base64', 'file_sha256'], 'INVALID_STORAGE_EVIDENCE');
  pairTimes(e.started_at, e.finished_at);
  if (typeof e.file_path !== 'string' || !e.file_path.startsWith('/') || e.file_path.length > 4096 || e.file_path.includes('\0')) throw new Error('INVALID_STORAGE_PATH');
  for (const stat of [e.stat_before, e.stat_after]) {
    const s = record(stat, 'INVALID_STORAGE_STAT'); exactKeys(s, ['dev', 'ino', 'size', 'blocks', 'mode', 'mtime_ns', 'ctime_ns'], 'INVALID_STORAGE_STAT');
    for (const v of Object.values(s)) uint(v);
    if ((uint(s.mode) & 0o170000n) !== 0o100000n) throw new Error('STORAGE_NOT_REGULAR_FILE');
  }
  if (!equal(e.stat_before, e.stat_after)) throw new Error('STORAGE_FILE_CHANGED_DURING_OBSERVATION');
  if (typeof e.artifact_base64 !== 'string' || e.artifact_base64.length > Math.ceil(16 * 1024 * 1024 / 3) * 4 ||
      Buffer.from(e.artifact_base64, 'base64').toString('base64') !== e.artifact_base64) throw new Error('INVALID_STORAGE_BYTES');
  const bytes = Buffer.from(e.artifact_base64, 'base64');
  if (bytes.length > 16 * 1024 * 1024 || BigInt(bytes.length) !== uint(e.stat_before.size) || sha256Hex(bytes) !== e.file_sha256) throw new Error('STORAGE_BYTES_METADATA_MISMATCH');
  inspectArtifact(bytes, native.job, native.result_id);
  return { measurement_source: 'node/fs-stat/v1', observed: { logical_file_bytes_observed: e.stat_before.size,
    filesystem_allocated_bytes_observed: (uint(e.stat_before.blocks) * 512n).toString(), unit: 'bytes' },
    claims: { file_metadata_fields_matched: true, native_artifact_bytes_identity_verified: true, os_metadata_authenticity_verified: false,
      continuous_storage_verified: false, durable_persistence_verified: false, exclusive_physical_storage_verified: false,
      filesystem_allocation_is_physical_cost: false }, started_at: e.started_at, finished_at: e.finished_at };
}
