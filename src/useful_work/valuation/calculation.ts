import { add, compare, minimum, multiply, one, parseRational, subtract, zero } from './rational.ts';
import { parsePolicy } from './policy.ts';
import type { Metric, ValuationCalculation, ValuationPolicy } from './types.ts';

/** Replay the declared local formula. This says nothing about whether its weights are appropriate. */
export function calculate(policyValue: ValuationPolicy, metrics: Metric[]): ValuationCalculation {
  const policy = parsePolicy(policyValue), values = new Map(metrics.map(m => [m.metric, m.value]));
  if (values.size !== metrics.length) throw new Error('DUPLICATE_PROJECTED_METRIC');
  const terms: ValuationCalculation['terms'] = []; let subtotal = zero();
  for (const term of policy.terms) {
    if (!values.has(term.metric)) throw new Error('MISSING_PROJECTED_METRIC');
    const raw = values.get(term.metric)!, observed = raw === null ? null : parseRational(raw);
    if (observed !== null && compare(observed, zero()) < 0) throw new Error('NEGATIVE_PROJECTED_METRIC');
    if (observed === null && term.missing === 'reject') throw new Error(`MISSING_VALUATION_METRIC:${term.metric}`);
    const effective = term.cap === null ? observed ?? zero() : minimum(observed ?? zero(), term.cap);
    const contribution = multiply(effective, term.weight); subtotal = add(subtotal, contribution);
    terms.push({ metric: term.metric, observed_value: observed, effective_value: effective, missing_applied: observed === null, cap: term.cap, weight: term.weight, contribution });
  }
  const discounts: ValuationCalculation['uncertainty_discounts'] = []; let factor = one();
  for (const discount of policy.uncertainty_discounts) {
    if (!values.has(discount.metric)) throw new Error('MISSING_PROJECTED_METRIC');
    const raw = values.get(discount.metric)!, observed = raw === null ? null : parseRational(raw);
    if (observed !== null && (compare(observed, zero()) < 0 || compare(observed, one()) > 0)) throw new Error('INVALID_PROJECTED_UNCERTAINTY');
    if (observed === null && discount.missing === 'reject') throw new Error(`MISSING_VALUATION_METRIC:${discount.metric}`);
    const effective = observed ?? (discount.missing === 'max-discount' ? one() : zero()), multiplier = subtract(one(), multiply(discount.rate, effective));
    factor = multiply(factor, multiplier);
    discounts.push({ metric: discount.metric, observed_value: observed, effective_uncertainty: effective, missing_applied: observed === null, rate: discount.rate, factor: multiplier });
  }
  const nonnegative = compare(subtotal, zero()) < 0 ? zero() : subtotal;
  return { terms, subtotal, nonnegative_subtotal: nonnegative, uncertainty_discounts: discounts, combined_discount_factor: factor, amount: multiply(nonnegative, factor) };
}
