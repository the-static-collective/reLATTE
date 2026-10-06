import { canonicalBytes, exactKeys, integer, record } from '../job.ts';
import { rational } from '../valuation/rational.ts';
import { pairTimes, uint, uuid } from './wire.ts';

export interface CpuSnapshot {
  observed_at: string; boot_id: string; pid: number; clock_ticks_per_second: string; proc_stat: string;
}
export function parseProcStat(text: unknown, expectedPid: number) {
  integer(expectedPid, 1, 2_147_483_647, 'INVALID_RESOURCE_PID');
  if (typeof text !== 'string' || text.length > 16_384 || text.includes('\0')) throw new Error('INVALID_PROC_STAT');
  const open = text.indexOf(' ('), close = text.lastIndexOf(') ');
  if (open < 1 || close <= open || text.slice(0, open) !== String(expectedPid)) throw new Error('PROC_STAT_PID_MISMATCH');
  const fields = text.slice(close + 2).trim().split(/\s+/);
  if (fields.length < 20 || fields.length > 128 || !/^[A-Za-z]$/.test(fields[0])) throw new Error('INVALID_PROC_STAT');
  // Linux fields 14, 15 and 22; fields start at state (field 3), after the entire parenthesized comm.
  return { user_ticks: uint(fields[11]), system_ticks: uint(fields[12]), start_ticks: uint(fields[19]) };
}
export function cpuProjection(value: unknown) {
  canonicalBytes(value);
  const e = record(value, 'INVALID_CPU_EVIDENCE'); exactKeys(e, ['start', 'end'], 'INVALID_CPU_EVIDENCE');
  const parse = (value: unknown) => {
    const s = record(value, 'INVALID_CPU_SNAPSHOT');
    exactKeys(s, ['observed_at', 'boot_id', 'pid', 'clock_ticks_per_second', 'proc_stat'], 'INVALID_CPU_SNAPSHOT'); uuid(s.boot_id);
    const hz = uint(s.clock_ticks_per_second); if (hz < 1n || hz > 1_000_000n) throw new Error('INVALID_CPU_TICK_RATE');
    return { snapshot: s as CpuSnapshot, hz, ...parseProcStat(s.proc_stat, s.pid) };
  };
  const a = parse(e.start), b = parse(e.end); pairTimes(a.snapshot.observed_at, b.snapshot.observed_at);
  if (a.snapshot.boot_id !== b.snapshot.boot_id || a.snapshot.pid !== b.snapshot.pid || a.start_ticks !== b.start_ticks || a.hz !== b.hz) throw new Error('CPU_PROCESS_INSTANCE_CHANGED');
  if (b.user_ticks < a.user_ticks || b.system_ticks < a.system_ticks) throw new Error('CPU_COUNTER_RESET_OR_WRAP');
  return { measurement_source: 'linux/proc/v1', observed: { cpu_time_observed: rational((b.user_ticks - a.user_ticks + b.system_ticks - a.system_ticks) * 1000n, a.hz),
    unit: 'milliseconds', user_ticks_observed: (b.user_ticks - a.user_ticks).toString(), system_ticks_observed: (b.system_ticks - a.system_ticks).toString(),
    clock_ticks_per_second: a.hz.toString() },
    claims: { process_instance_fields_matched: true, cpu_counter_delta_replayed: true, os_counter_authenticity_verified: false,
      process_exclusive_work_verified: false, descendant_process_time_included: false, cpu_energy_inferred: false },
    started_at: a.snapshot.observed_at, finished_at: b.snapshot.observed_at };
}
