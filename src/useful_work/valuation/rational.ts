import { exactKeys, record } from '../job.ts';

export interface Rational { numerator: string; denominator: string }
export const MAX_RATIONAL_DIGITS = 256;
const gcd = (a: bigint, b: bigint): bigint => { a = a < 0n ? -a : a; while (b) [a, b] = [b, a % b]; return a; };
export function rational(n: bigint | number, d: bigint | number = 1): Rational {
  for (const value of [n, d]) if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new Error('INVALID_RATIONAL_INTEGER');
  let a = BigInt(n), b = BigInt(d); if (!b) throw new Error('ZERO_RATIONAL_DENOMINATOR');
  if (b < 0n) { a = -a; b = -b; } const common = gcd(a, b); a /= common; b /= common;
  const numerator = a.toString(), denominator = b.toString();
  if (numerator.replace('-', '').length > MAX_RATIONAL_DIGITS || denominator.length > MAX_RATIONAL_DIGITS) throw new Error('VALUATION_ARITHMETIC_LIMIT');
  return { numerator, denominator };
}
export function parseRational(value: unknown): Rational {
  const r = record(value, 'INVALID_RATIONAL'); exactKeys(r, ['numerator', 'denominator'], 'INVALID_RATIONAL_FIELDS');
  if (typeof r.numerator !== 'string' || typeof r.denominator !== 'string' ||
      r.numerator.length > MAX_RATIONAL_DIGITS + 1 || r.denominator.length > MAX_RATIONAL_DIGITS ||
      !/^(0|-[1-9][0-9]*|[1-9][0-9]*)$/.test(r.numerator) || !/^[1-9][0-9]*$/.test(r.denominator)) throw new Error('INVALID_RATIONAL');
  const reduced = rational(BigInt(r.numerator), BigInt(r.denominator));
  if (r.numerator !== reduced.numerator || r.denominator !== reduced.denominator) throw new Error('NON_CANONICAL_RATIONAL');
  return reduced;
}
export const zero = () => rational(0);
export const one = () => rational(1);
export const add = (a: Rational, b: Rational) => rational(BigInt(a.numerator) * BigInt(b.denominator) + BigInt(b.numerator) * BigInt(a.denominator), BigInt(a.denominator) * BigInt(b.denominator));
export const multiply = (a: Rational, b: Rational) => rational(BigInt(a.numerator) * BigInt(b.numerator), BigInt(a.denominator) * BigInt(b.denominator));
export const subtract = (a: Rational, b: Rational) => add(a, { ...b, numerator: (-BigInt(b.numerator)).toString() });
export const compare = (a: Rational, b: Rational) => { const d = BigInt(a.numerator) * BigInt(b.denominator) - BigInt(b.numerator) * BigInt(a.denominator); return d < 0n ? -1 : d > 0n ? 1 : 0; };
export const minimum = (a: Rational, b: Rational) => compare(a, b) < 0 ? a : b;
