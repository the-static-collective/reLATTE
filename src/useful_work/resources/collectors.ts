import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { open, readFile, readlink } from 'node:fs/promises';
import type { BigIntStats } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256Hex } from '../../canonical.ts';
import { integer } from '../job.ts';
import { rawCounter, uuid } from './wire.ts';
import { interfaceName, networkProjection } from './network.ts';
import type { NetworkSnapshot } from './network.ts';
import { parseProcStat } from './cpu.ts';
import type { CpuSnapshot } from './cpu.ts';
import type { StorageEvidence, FileStatObservation } from './storage.ts';
import type { CollectorProvenance } from './observation.ts';

const now = () => new Date().toISOString();
function linux() { if (process.platform !== 'linux') throw new Error('RESOURCE_COLLECTOR_REQUIRES_LINUX'); }
async function small(path: string, limit: number) {
  const file = await open(path, constants.O_RDONLY);
  try {
    const chunks: Buffer[] = []; let length = 0;
    while (true) {
      const buffer = Buffer.alloc(Math.min(65_536, limit + 1 - length));
      const { bytesRead } = await file.read(buffer, 0, buffer.length, null);
      if (!bytesRead) break; length += bytesRead; if (length > limit) throw new Error('RESOURCE_INPUT_SIZE_LIMIT'); chunks.push(buffer.subarray(0, bytesRead));
    }
    return Buffer.concat(chunks);
  } finally { await file.close(); }
}
async function bootId() { const id = (await small('/proc/sys/kernel/random/boot_id', 64)).toString('utf8').trim(); uuid(id); return id; }
export async function collectorProvenance(hostRef: string, captureMode: CollectorProvenance['capture_mode'] = 'live-local/v1'): Promise<CollectorProvenance> {
  return { host_ref: hostRef, runtime: process.version, capture_mode: captureMode,
    collector_source_sha256: sha256Hex(await readFile(fileURLToPath(import.meta.url))) };
}
export async function captureCpu(pid: number): Promise<CpuSnapshot> {
  linux(); integer(pid, 1, 2_147_483_647, 'INVALID_RESOURCE_PID');
  const boot_id = await bootId(), proc_stat = (await small(`/proc/${pid}/stat`, 16_384)).toString('utf8'); parseProcStat(proc_stat, pid);
  const clock_ticks_per_second = await new Promise<string>((yes, no) => {
    execFile('getconf', ['CLK_TCK'], { encoding: 'utf8', maxBuffer: 128, timeout: 5000 }, (error, stdout) => error ? no(error) : yes(stdout.trim()));
  });
  rawCounter(clock_ticks_per_second);
  return { observed_at: now(), boot_id, pid, clock_ticks_per_second, proc_stat };
}
export async function captureNetwork(name: string): Promise<NetworkSnapshot> {
  linux(); interfaceName(name); const root = `/sys/class/net/${name}`, boot_id = await bootId();
  const snapshot: NetworkSnapshot = { observed_at: now(), boot_id, network_namespace: await readlink('/proc/self/ns/net'), interface_name: name,
    ifindex_raw: (await small(root + '/ifindex', 32)).toString('utf8'), rx_bytes_raw: (await small(root + '/statistics/rx_bytes', 32)).toString('utf8'),
    tx_bytes_raw: (await small(root + '/statistics/tx_bytes', 32)).toString('utf8') };
  snapshot.observed_at = now(); networkProjection({ start: snapshot, end: snapshot }); return snapshot;
}
function statObservation(stat: BigIntStats): FileStatObservation {
  return { dev: stat.dev.toString(), ino: stat.ino.toString(), size: stat.size.toString(), blocks: stat.blocks.toString(),
    mode: stat.mode.toString(), mtime_ns: stat.mtimeNs.toString(), ctime_ns: stat.ctimeNs.toString() };
}
export async function captureStorage(path: string): Promise<StorageEvidence> {
  linux(); const started_at = now(), file_path = resolve(path), fd = await open(file_path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await fd.stat({ bigint: true });
    if (!before.isFile() || before.size > 16n * 1024n * 1024n) throw new Error('RESOURCE_STORAGE_FILE_LIMIT');
    const chunks: Buffer[] = []; let size = 0;
    while (true) {
      const chunk = Buffer.alloc(65_536), { bytesRead } = await fd.read(chunk, 0, chunk.length, null);
      if (!bytesRead) break; size += bytesRead; if (size > 16 * 1024 * 1024) throw new Error('RESOURCE_STORAGE_FILE_LIMIT'); chunks.push(chunk.subarray(0, bytesRead));
    }
    const bytes = Buffer.concat(chunks), after = await fd.stat({ bigint: true });
    return { started_at, finished_at: now(), file_path, stat_before: statObservation(before), stat_after: statObservation(after),
      artifact_base64: bytes.toString('base64'), file_sha256: sha256Hex(bytes) };
  } finally { await fd.close(); }
}
