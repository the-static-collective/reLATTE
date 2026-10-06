import type { P256KeyMaterial } from '../../protocol.ts';
import { canonicalBytes, exactKeys, record } from '../job.ts';
import { assertSigner, equal, instant, nonempty, publicKey } from '../audit_clock/wire.ts';
import { rational } from '../valuation/rational.ts';
import { inspectResourceMessage, sealResourceMessage, pairTimes, uint } from './wire.ts';

export interface MeterIdentity { world_id: string; public_key: JsonWebKey; meter_id: string; channel_id: string; counter_epoch: string }
export interface MeterReading {
  schema: 'useful-work.energy-meter-reading/v1'; measurement_source: 'external/power-meter/v1'; meter_id: string; channel_id: string;
  counter_epoch: string; sequence: string; cumulative_reading: string; unit: 'milliwatt-hours' | 'millijoules'; observed_at: string;
  provenance: { reading_origin: 'device-telemetry/v1' | 'operator-import/v1' | 'simulation/v1'; device_ref: string; calibration_ref: string | null; telemetry_ref: string | null };
}
function readingAt(value: unknown): MeterReading {
  canonicalBytes(value);
  const r = record(value, 'INVALID_METER_READING');
  exactKeys(r, ['schema', 'measurement_source', 'meter_id', 'channel_id', 'counter_epoch', 'sequence', 'cumulative_reading', 'unit', 'observed_at', 'provenance'], 'INVALID_METER_READING');
  if (r.schema !== 'useful-work.energy-meter-reading/v1' || r.measurement_source !== 'external/power-meter/v1' || !['milliwatt-hours', 'millijoules'].includes(r.unit)) throw new Error('UNSUPPORTED_ENERGY_METER');
  for (const k of ['meter_id', 'channel_id', 'counter_epoch']) nonempty(r[k]); uint(r.sequence); uint(r.cumulative_reading); instant(r.observed_at);
  const p = record(r.provenance, 'INVALID_METER_PROVENANCE'); exactKeys(p, ['reading_origin', 'device_ref', 'calibration_ref', 'telemetry_ref'], 'INVALID_METER_PROVENANCE');
  if (!['device-telemetry/v1', 'operator-import/v1', 'simulation/v1'].includes(p.reading_origin)) throw new Error('UNSUPPORTED_METER_READING_ORIGIN');
  nonempty(p.device_ref); for (const k of ['calibration_ref', 'telemetry_ref']) if (p[k] !== null) nonempty(p[k]);
  return structuredClone(r) as MeterReading;
}
export async function signMeterReading(value: unknown, keys: P256KeyMaterial, world: string) {
  const reading = readingAt(value); return sealResourceMessage('energy-meter-reading', reading, keys, world, reading.observed_at);
}
export async function inspectMeterReading(value: unknown, identity: MeterIdentity) {
  const i = record(identity, 'INVALID_METER_IDENTITY'); exactKeys(i, ['world_id', 'public_key', 'meter_id', 'channel_id', 'counter_epoch'], 'INVALID_METER_IDENTITY');
  publicKey(i.public_key); for (const k of ['world_id', 'meter_id', 'channel_id', 'counter_epoch']) nonempty(i[k]);
  const { crossing, payload } = await inspectResourceMessage(value, 'energy-meter-reading'), reading = readingAt(payload);
  assertSigner(crossing, identity.public_key, identity.world_id);
  if (crossing.created_at !== reading.observed_at || ['meter_id', 'channel_id', 'counter_epoch'].some(k => payload[k] !== i[k])) throw new Error('ENERGY_METER_SUBJECT_MISMATCH');
  return { crossing, reading };
}
export async function energyProjection(value: unknown) {
  canonicalBytes(value);
  const e = record(value, 'INVALID_ENERGY_EVIDENCE'); exactKeys(e, ['meter', 'start', 'end'], 'INVALID_ENERGY_EVIDENCE');
  const a = await inspectMeterReading(e.start, e.meter), b = await inspectMeterReading(e.end, e.meter);
  pairTimes(a.reading.observed_at, b.reading.observed_at);
  if (uint(b.reading.sequence) <= uint(a.reading.sequence)) throw new Error('ENERGY_METER_SEQUENCE_NOT_ADVANCED');
  if (a.reading.unit !== b.reading.unit || !equal(a.reading.provenance, b.reading.provenance)) throw new Error('ENERGY_METER_PROVENANCE_CHANGED');
  const delta = uint(b.reading.cumulative_reading) - uint(a.reading.cumulative_reading);
  if (delta < 0n) throw new Error('ENERGY_COUNTER_RESET_OR_WRAP');
  return { measurement_source: 'external/power-meter/v1', observed: { energy_watt_hours_observed: rational(delta, a.reading.unit === 'milliwatt-hours' ? 1000n : 3_600_000n),
    unit: 'watt-hours', meter_counter_delta: delta.toString(), meter_counter_unit: a.reading.unit, reading_origin: a.reading.provenance.reading_origin },
    claims: { signed_meter_readings_verified: true, meter_counter_delta_replayed: true, physical_meter_verified: false,
      meter_calibration_verified: false, provider_honesty_verified: false, job_energy_causation_verified: false,
      exclusive_job_energy_verified: false, energy_cpu_time_inferred: false }, started_at: a.reading.observed_at, finished_at: b.reading.observed_at };
}
