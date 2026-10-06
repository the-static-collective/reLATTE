import { canonicalBytes, exactKeys, integer, record } from '../job.ts';
import { domainHash } from '../audit_clock/policy.ts';
import { nonempty } from '../audit_clock/wire.ts';
import { compare, parseRational, zero } from '../valuation/rational.ts';
import type { Rational } from '../valuation/rational.ts';
import { identity } from './wire.ts';
import type { Identity } from './wire.ts';

export const RESOURCE_METRICS = {
  cpu_time_observed: 'cpu', energy_watt_hours_observed: 'energy', logical_file_bytes_observed: 'storage',
  filesystem_allocated_bytes_observed: 'storage', interface_rx_bytes_observed: 'network', interface_tx_bytes_observed: 'network',
} as const;
export const ORIGINS = ['provider-record/v1', 'operator-import/v1', 'simulation/v1'] as const;
export type Origin = typeof ORIGINS[number];
export type Clause =
  | { kind: 'audit'; verifiers: Identity[]; minimum_matching_entries: number; reject_contradictions: boolean }
  | { kind: 'audit-history'; observer: Identity; minimum_completed_slots: number }
  | { kind: 'service'; observer: Identity; host: Identity; minimum_in_window_verified_slots: number }
  | { kind: 'resource'; collector: Identity; replayer: Identity; metric: keyof typeof RESOURCE_METRICS;
      minimum: Rational; maximum: Rational | null; allowed_capture_modes: string[]; allowed_reading_origins: string[] }
  | { kind: 'valuation'; evaluator: Identity; policy_id: string; unit: string; minimum_amount: Rational };
export interface AcceptancePolicy { schema: 'useful-work.acceptance-policy/v1'; algorithm: 'typed-evidence-all/v1'; name: string; clauses: Clause[] }
export function enumeration(value: unknown, allowed: readonly string[]): string[] {
  if (!Array.isArray(value) || value.length > allowed.length || value.some(v => !allowed.includes(v)) || new Set(value).size !== value.length) throw new Error('INVALID_POLICY_ENUMERATION');
  return [...value];
}
function positive(value: unknown) { const r = parseRational(value); if (compare(r, zero()) < 0) throw new Error('NEGATIVE_POLICY_THRESHOLD'); return r; }
export function parseAcceptancePolicy(value: unknown): AcceptancePolicy {
  if (canonicalBytes(value).length > 64_000) throw new Error('ACCEPTANCE_POLICY_SIZE_LIMIT');
  const p = record(value, 'INVALID_ACCEPTANCE_POLICY'); exactKeys(p, ['schema', 'algorithm', 'name', 'clauses'], 'INVALID_ACCEPTANCE_POLICY');
  if (p.schema !== 'useful-work.acceptance-policy/v1' || p.algorithm !== 'typed-evidence-all/v1') throw new Error('UNSUPPORTED_ACCEPTANCE_POLICY');
  nonempty(p.name); if (!Array.isArray(p.clauses)) throw new Error('INVALID_POLICY_CLAUSES'); integer(p.clauses.length, 1, 32, 'POLICY_CLAUSE_LIMIT');
  const clauses: Clause[] = p.clauses.map((value: unknown) => {
    const c = record(value, 'INVALID_ACCEPTANCE_CLAUSE');
    switch (c.kind) {
      case 'audit': {
        exactKeys(c, ['kind', 'verifiers', 'minimum_matching_entries', 'reject_contradictions'], 'INVALID_AUDIT_CLAUSE');
        if (!Array.isArray(c.verifiers)) throw new Error('INVALID_AUDIT_VERIFIERS'); integer(c.verifiers.length, 1, 32, 'POLICY_VERIFIER_LIMIT');
        if (typeof c.reject_contradictions !== 'boolean') throw new Error('INVALID_AUDIT_CLAUSE');
        const verifiers = c.verifiers.map(identity); if (new Set(verifiers.map(v => canonicalBytes(v).toString())).size !== verifiers.length) throw new Error('DUPLICATE_POLICY_VERIFIER');
        return { ...c, verifiers, minimum_matching_entries: integer(c.minimum_matching_entries, 1, 262144, 'INVALID_AUDIT_THRESHOLD') } as Clause;
      }
      case 'audit-history':
        exactKeys(c, ['kind', 'observer', 'minimum_completed_slots'], 'INVALID_HISTORY_CLAUSE');
        return { ...c, observer: identity(c.observer), minimum_completed_slots: integer(c.minimum_completed_slots, 1, 1024, 'INVALID_HISTORY_THRESHOLD') } as Clause;
      case 'service':
        exactKeys(c, ['kind', 'observer', 'host', 'minimum_in_window_verified_slots'], 'INVALID_SERVICE_CLAUSE');
        return { ...c, observer: identity(c.observer), host: identity(c.host), minimum_in_window_verified_slots: integer(c.minimum_in_window_verified_slots, 1, 1024, 'INVALID_SERVICE_THRESHOLD') } as Clause;
      case 'resource': {
        exactKeys(c, ['kind', 'collector', 'replayer', 'metric', 'minimum', 'maximum', 'allowed_capture_modes', 'allowed_reading_origins'], 'INVALID_RESOURCE_CLAUSE');
        if (!Object.hasOwn(RESOURCE_METRICS, c.metric)) throw new Error('UNSUPPORTED_ACCEPTANCE_RESOURCE_METRIC');
        const minimum = positive(c.minimum), maximum = c.maximum === null ? null : positive(c.maximum);
        if (maximum && compare(minimum, maximum) > 0) throw new Error('INVALID_RESOURCE_RANGE');
        const energy = c.metric === 'energy_watt_hours_observed';
        const modes = enumeration(c.allowed_capture_modes, energy ? ['signed-meter-ingest/v1'] : ['live-local/v1', 'imported-records/v1']);
        const origins = enumeration(c.allowed_reading_origins, energy ? ['device-telemetry/v1', 'operator-import/v1', 'simulation/v1'] : []);
        if (!modes.length || (energy && !origins.length)) throw new Error('EMPTY_RESOURCE_PROVENANCE_POLICY');
        return { ...c, collector: identity(c.collector), replayer: identity(c.replayer), minimum, maximum, allowed_capture_modes: modes, allowed_reading_origins: origins } as Clause;
      }
      case 'valuation':
        exactKeys(c, ['kind', 'evaluator', 'policy_id', 'unit', 'minimum_amount'], 'INVALID_VALUATION_CLAUSE');
        if (typeof c.policy_id !== 'string' || !/^useful-work-valuation-policy-v1:[a-f0-9]{64}$/.test(c.policy_id)) throw new Error('INVALID_VALUATION_POLICY_ID');
        nonempty(c.unit); return { ...c, evaluator: identity(c.evaluator), minimum_amount: positive(c.minimum_amount) } as Clause;
      default: throw new Error('UNSUPPORTED_ACCEPTANCE_CLAUSE');
    }
  });
  return { schema: p.schema, algorithm: p.algorithm, name: p.name, clauses };
}
export const acceptancePolicyId = (value: unknown) => 'useful-work-acceptance-policy-v1:' + domainHash('UsefulWork-AcceptancePolicy-v1|', parseAcceptancePolicy(value));
export interface Transfer { kind: 'payment' | 'credit-ledger' | 'resource'; system_ref: string; asset_ref: string; unit: string; amount: Rational; from_ref: string; to_ref: string }
export function parseTransfer(value: unknown): Transfer {
  const t = record(value, 'INVALID_TRANSFER_TERMS'); exactKeys(t, ['kind', 'system_ref', 'asset_ref', 'unit', 'amount', 'from_ref', 'to_ref'], 'INVALID_TRANSFER_TERMS');
  if (!['payment', 'credit-ledger', 'resource'].includes(t.kind)) throw new Error('UNSUPPORTED_SETTLEMENT_ADAPTER');
  for (const field of ['system_ref', 'asset_ref', 'unit', 'from_ref', 'to_ref']) nonempty(t[field]);
  if (t.from_ref === t.to_ref) throw new Error('TRANSFER_PARTIES_MUST_DIFFER');
  const amount = parseRational(t.amount); if (compare(amount, zero()) <= 0) throw new Error('NONPOSITIVE_TRANSFER_AMOUNT');
  return { ...structuredClone(t), amount } as Transfer;
}
