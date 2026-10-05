#!/usr/bin/env python3
"""Independent arithmetic/vector oracle, not a signature or economic authority.

stdin: [{policy, metrics}] -> exact calculation traces.
--golden <fixture>: derive metric values from raw signed inventories (never summaries),
then calculate the three opinions. Authentication belongs to the Node verifier.
Only the stdlib is used; no worker/evaluator imports.
"""
import json
import sys
from datetime import datetime, timedelta
from fractions import Fraction


def read_fraction(value):
    return Fraction(int(value['numerator']), int(value['denominator']))


def encode(value):
    return {'numerator': str(value.numerator), 'denominator': str(value.denominator)}


def calculate(policy, metrics):
    values = {m['metric']: m['value'] for m in metrics}
    subtotal = Fraction(0)
    terms = []
    for term in policy['terms']:
        raw = values[term['metric']]
        if raw is None and term['missing'] == 'reject':
            raise ValueError('missing required metric')
        effective = read_fraction(raw) if raw is not None else Fraction(0)
        if term['cap'] is not None:
            effective = min(effective, read_fraction(term['cap']))
        contribution = effective * read_fraction(term['weight'])
        subtotal += contribution
        terms.append(dict(metric=term['metric'], observed_value=raw, effective_value=encode(effective),
                          missing_applied=raw is None, cap=term['cap'], weight=term['weight'], contribution=encode(contribution)))
    product = Fraction(1)
    discounts = []
    for discount in policy['uncertainty_discounts']:
        raw = values[discount['metric']]
        if raw is None and discount['missing'] == 'reject':
            raise ValueError('missing required uncertainty')
        effective = read_fraction(raw) if raw is not None else Fraction(discount['missing'] == 'max-discount')
        factor = 1 - read_fraction(discount['rate']) * effective
        product *= factor
        discounts.append(dict(metric=discount['metric'], observed_value=raw, effective_uncertainty=encode(effective),
                              missing_applied=raw is None, rate=discount['rate'], factor=encode(factor)))
    floor = max(Fraction(0), subtotal)
    return dict(terms=terms, subtotal=encode(subtotal), nonnegative_subtotal=encode(floor), uncertainty_discounts=discounts,
                combined_discount_factor=encode(product), amount=encode(floor * product))


def donor(crossing):
    return crossing['extensions']['organ_adapter']['donor_claims']


def prediction(p):
    return (p['count'], p['final_real_q'], p['final_imag_q'])


def derive_golden(context):
    """This golden includes history + artifact + claims; no accumulator summaries read."""
    h = context['history']
    receipts = {r['receipt_id']: r for r in h['receipts']}.values()
    reports = [r['extensions']['useful_work_native'] for r in receipts]
    observed, matching, contradictory = set(), set(), set()
    verifier_predictions, worker_predictions = {}, {}
    for report in reports:
        for e in report['evidence']:
            i = e['index']
            observed.add(i)
            if e['matched']:
                matching.add(i)
            verifier_predictions.setdefault(i, set()).add(prediction(e['verifier']))
            worker_predictions.setdefault(i, set()).add(prediction(e['worker']))
            if e['verifier']['count'] != e['committed_count'] or e['worker']['count'] != e['committed_count'] or prediction(e['worker']) != prediction(e['verifier']):
                contradictory.add(i)
    # Worker evidence remains visible even in a proof-only, unavailable-checker receipt.
    responses = {r['crossing_id']: donor(r)['merkle_response'] for r in h['responses']}
    for report in reports:
        if report['claims']['sampled_entries_bound_to_result_identity']:
            for sample in responses[report['scope']['response_id']]['samples']:
                worker_predictions.setdefault(sample['index'], set()).add(prediction(sample))
    for i in verifier_predictions.keys() | worker_predictions.keys():
        if len(verifier_predictions.get(i, set())) > 1 or len(worker_predictions.get(i, set())) > 1:
            contradictory.add(i)
    completed = [r for r in receipts if r['extensions']['useful_work_native']['checked_count'] > 0]
    fingerprints = {(r['extensions']['useful_work_native']['implementation']['id'], r['extensions']['useful_work_native']['implementation']['source_sha256']) for r in completed}
    keys = {tuple(r['signing']['public_key'][f] for f in ('kty', 'crv', 'x', 'y')) for r in completed}
    plan = donor(h['plan'])['audit_clock_plan']['policy']
    schedule = plan['schedule']
    instant = lambda s: datetime.fromisoformat(s.replace('Z', '+00:00'))
    cut = instant(donor(h['cut'])['audit_clock_cut']['observed_at'])
    closed = []
    timely = set()
    observations = [donor(o)['audit_clock_observation'] for o in h['observations']]
    for i in range(schedule['rounds']):
        start = instant(schedule['starts_at']) + timedelta(milliseconds=i * schedule['cadence_ms'])
        deadline = start + timedelta(milliseconds=schedule['issue_window_ms'] + schedule['response_window_ms'])
        if deadline < cut:
            closed.append(i)
            if any(o['kind'] == 'RESPONSE_SEEN' and o['slot_index'] == i and start <= instant(o['observed_at']) <= deadline for o in observations):
                timely.add(i)
    completed_challenges = {r['scope']['challenge_id'] for r in reports if r['checked_count'] > 0}
    completed_slots, issued = set(), set()
    for issue in h['issues']:
        slot = donor(issue['issuance'])['audit_clock_issuance']['slot_index']
        issued.add(slot)
        if issue['challenge']['crossing_id'] in completed_challenges:
            completed_slots.add(slot)
    population = context['job_spec']['width'] * context['job_spec']['height']
    values = dict(result_entries=population, declared_iteration_budget=population * context['job_spec']['iterations'],
                  observed_sample_entries=len(observed), matching_sample_entries=len(matching), observed_sample_coverage=Fraction(len(observed), population),
                  observed_challenge_ids=len({r['scope']['challenge_id'] for r in reports}), mathematical_verifier_keys=len(keys),
                  mathematical_implementation_fingerprints=len(fingerprints), contradictory_sample_entries=len(contradictory),
                  contradictory_observed_fraction=Fraction(len(contradictory & observed), len(observed)) if observed else None,
                  issued_scheduled_slots=len(issued), completed_sample_observation_slots=len(completed_slots),
                  observed_timely_answered_slot_fraction=Fraction(len(timely), len(closed)) if closed else None,
                  incomplete_schedule_fraction=Fraction(schedule['rounds'] - len(completed_slots), schedule['rounds']),
                  artifact_present_at_evaluation=1, artifact_bytes_present=len(context['canonical_artifact'].encode('utf8')),
                  full_computation_verified_result=None, proven_cpu_ms=None)
    claims = {r['crossing_id']: donor(r)['resource_claim'] for r in context['resource_claims']}.values()
    for field in ('cpu_ms', 'energy_millijoules', 'stored_bytes', 'served_bytes', 'mirrored_bytes'):
        amounts = [c['amounts'][field] for c in claims if c['amounts'][field] is not None]
        values['max_claimed_' + field] = max(amounts) if amounts else None
    return [dict(metric=name, value=encode(Fraction(value)) if value is not None else None) for name, value in values.items()]


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == '--golden':
        fixture = json.load(open(sys.argv[2], encoding='utf8'))
        metrics = derive_golden(fixture['context'])
        result = dict(metrics=metrics, calculations=[calculate(v['policy'], metrics) for v in fixture['opinions']])
    elif len(sys.argv) == 1:
        result = [calculate(v['policy'], v['metrics']) for v in json.load(sys.stdin)]
    else:
        raise SystemExit('usage: valuation_vectors.py [--golden <fixture>]')
    json.dump(result, sys.stdout, separators=(',', ':'))
    print()
