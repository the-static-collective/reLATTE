import { canonicalBytes, exactKeys, record } from '../job.ts';
import { pairTimes, rawCounter, uuid } from './wire.ts';

export interface NetworkSnapshot {
  observed_at: string; boot_id: string; network_namespace: string; interface_name: string;
  ifindex_raw: string; rx_bytes_raw: string; tx_bytes_raw: string;
}
export function interfaceName(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_.:-]{1,15}$/.test(value) || ['.', '..'].includes(value)) throw new Error('INVALID_RESOURCE_INTERFACE');
}
export function networkProjection(value: unknown) {
  canonicalBytes(value);
  const e = record(value, 'INVALID_NETWORK_EVIDENCE'); exactKeys(e, ['start', 'end'], 'INVALID_NETWORK_EVIDENCE');
  const parse = (value: unknown) => {
    const s = record(value, 'INVALID_NETWORK_SNAPSHOT');
    exactKeys(s, ['observed_at', 'boot_id', 'network_namespace', 'interface_name', 'ifindex_raw', 'rx_bytes_raw', 'tx_bytes_raw'], 'INVALID_NETWORK_SNAPSHOT');
    uuid(s.boot_id); interfaceName(s.interface_name);
    if (typeof s.network_namespace !== 'string' || !/^net:\[[1-9][0-9]{0,19}\]$/.test(s.network_namespace)) throw new Error('INVALID_NETWORK_NAMESPACE');
    const index = rawCounter(s.ifindex_raw); if (index < 1n || index > 2_147_483_647n) throw new Error('INVALID_INTERFACE_INDEX');
    return { snapshot: s as NetworkSnapshot, index, rx: rawCounter(s.rx_bytes_raw), tx: rawCounter(s.tx_bytes_raw) };
  };
  const a = parse(e.start), b = parse(e.end); pairTimes(a.snapshot.observed_at, b.snapshot.observed_at);
  if (a.snapshot.boot_id !== b.snapshot.boot_id || a.snapshot.network_namespace !== b.snapshot.network_namespace ||
      a.snapshot.interface_name !== b.snapshot.interface_name || a.index !== b.index) throw new Error('NETWORK_COUNTER_SUBJECT_CHANGED');
  if (b.rx < a.rx || b.tx < a.tx) throw new Error('NETWORK_COUNTER_RESET_OR_WRAP');
  return { measurement_source: 'linux/sysfs-net/v1', observed: { interface_rx_bytes_observed: (b.rx - a.rx).toString(),
    interface_tx_bytes_observed: (b.tx - a.tx).toString(), unit: 'bytes' },
    claims: { interface_counter_delta_replayed: true, interface_subject_fields_matched: true, reads_are_atomic: false,
      os_counter_authenticity_verified: false, interface_generation_verified: false, network_namespace_binding_verified: false,
      job_bytes_causation_verified: false, service_bytes_verified: false, physical_bandwidth_verified: false,
      network_path_verified: false, host_uptime_verified: false }, started_at: a.snapshot.observed_at, finished_at: b.snapshot.observed_at };
}
