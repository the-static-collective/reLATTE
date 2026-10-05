import { exactKeys, integer, record } from '../job.ts';

export interface RandomnessModel {
  schema: 'useful-work.audit-randomness-model/v1';
  assumption: 'honest-independent-fresh-uniform-challenges-against-a-fixed-error-set';
  bad_entry_count: number;
}
export const MODEL_ASSUMPTIONS = [
  'The result identity and a bad-entry set of the stated cardinality are fixed before all challenges.',
  'Every eligible challenge identity is generated honestly with independent fresh cryptographic randomness and no grinding of nonces, keys, timestamps or other fields.',
  'SHA-256 coordinate derivation behaves as an unbiased pseudorandom sampler; selection is without replacement within each challenge and independent across challenges.',
  'The recorded challenge history is complete and unselected; eligibility, completion and observation availability are independent of sampled coordinates and error locations.',
  'This is an ex-ante probability computed from sample sizes, before conditioning on the observed coordinates or mathematical predictions.',
  'The assumptions are stipulated, not established by signatures, unique identities, key counts, world labels or source fingerprints.',
];
export function parseModel(value: unknown, population: number): RandomnessModel | null {
  if (value === null) return null;
  const m = record(value, 'INVALID_AUDIT_MODEL');
  exactKeys(m, ['schema', 'assumption', 'bad_entry_count'], 'INVALID_AUDIT_MODEL_FIELDS');
  if (m.schema !== 'useful-work.audit-randomness-model/v1' ||
      m.assumption !== 'honest-independent-fresh-uniform-challenges-against-a-fixed-error-set') throw new Error('UNSUPPORTED_AUDIT_MODEL');
  integer(m.bad_entry_count, 0, population, 'INVALID_BAD_ENTRY_COUNT');
  return structuredClone(m) as RandomnessModel;
}

/** Sampling-design probability only; never a posterior probability that an artifact is correct. */
export function conditionalMissProbability(population: number, badEntries: number, sampleSizes: number[]) {
  integer(population, 1, 512 * 512, 'INVALID_POPULATION');
  integer(badEntries, 0, population, 'INVALID_BAD_ENTRY_COUNT');
  if (!Array.isArray(sampleSizes) || sampleSizes.length > 1024) throw new Error('INVALID_MODEL_SAMPLE_SIZES');
  for (const k of sampleSizes) integer(k, 1, Math.min(64, population), 'INVALID_SAMPLE_COUNT');
  const exactZero = sampleSizes.some(k => k > population - badEntries);
  if (exactZero) return { exact_zero: true, scientific_notation: '0', log_probability: null, numeric_approximation: 0 };
  // Independent draws across challenges; without replacement within each challenge.
  const terms = sampleSizes.flatMap(k => Array.from({ length: k }, (_, i) => Math.log1p(-badEntries / (population - i))));
  // Compensated summation avoids losing tiny contributions over repeated audits.
  let log = 0, correction = 0;
  for (const term of terms) { const adjusted = term - correction, next = log + adjusted; correction = (next - log) - adjusted; log = next; }
  const exponent = Math.floor(log / Math.LN10);
  let mantissa = Number(Math.exp(log - exponent * Math.LN10).toPrecision(15)), power = exponent;
  if (mantissa >= 10) { mantissa /= 10; power++; }
  const numeric = Math.exp(log);
  return { exact_zero: false, scientific_notation: `${mantissa}e${power}`, log_probability: log,
    numeric_approximation: numeric === 0 ? null : numeric };
}
