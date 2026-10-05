import { sha256Hex } from '../../canonical.ts';
import { canonicalBytes, exactKeys, integer, record } from '../job.ts';
import { compare, one, parseRational, zero } from './rational.ts';
import { METRICS, RESOURCE_METRICS, UNCERTAINTY_METRICS } from './types.ts';
import type { ValuationPolicy } from './types.ts';

export function label(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > 256) throw new Error('INVALID_VALUATION_LABEL');
}
export const domainHash = (domain: string, value: unknown) => sha256Hex(Buffer.concat([Buffer.from(domain), canonicalBytes(value)]));
export const policyId = (policy: ValuationPolicy) => 'useful-work-valuation-policy-v1:' + domainHash('UsefulWork-ValuationPolicy-v1|', policy);
export function parsePolicy(value: unknown): ValuationPolicy {
  if (canonicalBytes(value).length > 100_000) throw new Error('VALUATION_POLICY_SIZE_LIMIT');
  const p = record(value, 'INVALID_VALUATION_POLICY');
  exactKeys(p, ['schema', 'algorithm', 'policy_name', 'policy_version', 'unit', 'allow_self_reported_resources', 'terms', 'uncertainty_discounts'], 'INVALID_VALUATION_POLICY_FIELDS');
  if (p.schema !== 'useful-work.valuation-policy/v1' || p.algorithm !== 'rational-linear-discount/v1') throw new Error('UNSUPPORTED_VALUATION_POLICY');
  label(p.policy_name); label(p.unit); integer(p.policy_version, 1, 1_000_000_000, 'INVALID_VALUATION_POLICY_VERSION');
  if (typeof p.allow_self_reported_resources !== 'boolean' || !Array.isArray(p.terms) || !Array.isArray(p.uncertainty_discounts)) throw new Error('INVALID_VALUATION_POLICY');
  integer(p.terms.length, 1, 32, 'VALUATION_TERM_LIMIT'); integer(p.uncertainty_discounts.length, 0, 2, 'VALUATION_DISCOUNT_LIMIT');
  const seen = new Set<string>();
  for (const value of p.terms) {
    const term = record(value, 'INVALID_VALUATION_TERM'); exactKeys(term, ['metric', 'weight', 'cap', 'missing'], 'INVALID_VALUATION_TERM_FIELDS');
    if (!(METRICS as readonly string[]).includes(term.metric) || seen.has(term.metric)) throw new Error('UNKNOWN_OR_DUPLICATE_VALUATION_METRIC'); seen.add(term.metric);
    parseRational(term.weight);
    if (term.cap !== null && compare(parseRational(term.cap), zero()) < 0) throw new Error('NEGATIVE_METRIC_CAP');
    if (!['zero', 'reject'].includes(term.missing)) throw new Error('INVALID_METRIC_MISSING_RULE');
    if ((RESOURCE_METRICS as readonly string[]).includes(term.metric) && (!p.allow_self_reported_resources || term.cap === null)) throw new Error('RESOURCE_CLAIM_REQUIRES_OPT_IN_AND_CAP');
  }
  seen.clear();
  for (const value of p.uncertainty_discounts) {
    const d = record(value, 'INVALID_UNCERTAINTY_DISCOUNT'); exactKeys(d, ['metric', 'rate', 'missing'], 'INVALID_UNCERTAINTY_DISCOUNT_FIELDS');
    if (!(UNCERTAINTY_METRICS as readonly string[]).includes(d.metric) || seen.has(d.metric)) throw new Error('UNKNOWN_OR_DUPLICATE_DISCOUNT_METRIC'); seen.add(d.metric);
    const rate = parseRational(d.rate);
    if (compare(rate, zero()) < 0 || compare(rate, one()) > 0 || !['max-discount', 'no-discount', 'reject'].includes(d.missing)) throw new Error('INVALID_UNCERTAINTY_DISCOUNT');
  }
  return structuredClone(p) as ValuationPolicy;
}
