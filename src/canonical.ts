import { createHash } from 'node:crypto';
import { canonicalize as canonicalizeJcs } from 'json-canonicalize';

export const MAX_CANONICALIZATION_DEPTH = 100;
const TIMESTAMP_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export function validateTimestamp(ts: unknown): asserts ts is string {
  if (typeof ts !== 'string') throw new Error('INVALID_TYPE');
  if (!TIMESTAMP_REGEX.test(ts)) throw new Error('INVALID_TIMESTAMP');
}

function validateAtDepth(value: unknown, seen: WeakSet<object>, depth: number): void {
  if (depth > MAX_CANONICALIZATION_DEPTH) throw new Error('DEPTH_LIMIT_EXCEEDED');
  if (value === undefined) throw new Error('UNDEFINED_VALUE');

  if (typeof value === 'number') {
    if (Number.isNaN(value) || !Number.isFinite(value)) throw new Error('NON_FINITE_NUMBER');
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) throw new Error('UNSAFE_INTEGER');
  }

  if (typeof value === 'bigint' || typeof value === 'symbol' || typeof value === 'function') {
    throw new Error('UNSUPPORTED_TYPE');
  }

  if (typeof value === 'string') {
    for (let i = 0; i < value.length; i++) {
      const code = value.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdfff) {
        if (code <= 0xdbff) {
          if (i === value.length - 1) throw new Error('LONE_SURROGATE');
          const next = value.charCodeAt(i + 1);
          if (next < 0xdc00 || next > 0xdfff) throw new Error('LONE_SURROGATE');
          i++;
        } else {
          throw new Error('LONE_SURROGATE');
        }
      }
    }
  }

  if (typeof value === 'object' && value !== null) {
    const object = value as object;
    const proto = Object.getPrototypeOf(object);
    if (proto !== Object.prototype && proto !== Array.prototype && proto !== null) {
      throw new Error('CUSTOM_PROTOTYPE');
    }
    if (Object.getOwnPropertySymbols(object).length > 0) throw new Error('SYMBOL_KEYED_PROPERTY');

    const descriptors = Object.getOwnPropertyDescriptors(object);
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (descriptor.get || descriptor.set) throw new Error('ACCESSOR_PROPERTY');
      if (!descriptor.enumerable && !(Array.isArray(object) && key === 'length')) {
        throw new Error('NON_ENUMERABLE_PROPERTY');
      }
    }

    if (seen.has(object)) throw new Error('CYCLIC_VALUE');
    seen.add(object);

    if (Array.isArray(object)) {
      if (Object.keys(object).length !== object.length) throw new Error('SPARSE_ARRAY');
      for (let i = 0; i < object.length; i++) {
        if (!Object.prototype.hasOwnProperty.call(object, i)) throw new Error('SPARSE_ARRAY');
        validateAtDepth(object[i], seen, depth + 1);
      }
    } else {
      for (const key of Object.keys(object)) {
        const child = (object as Record<string, unknown>)[key];
        if (child === undefined) throw new Error('UNDEFINED_VALUE');
        validateAtDepth(child, seen, depth + 1);
      }
    }
    seen.delete(object);
  }
}

export function validateForCanonicalization(value: unknown): void {
  validateAtDepth(value, new WeakSet<object>(), 0);
}

export function canonicalize(value: unknown): string {
  validateForCanonicalization(value);
  const encoded = canonicalizeJcs(value);
  if (encoded === undefined) throw new Error('CANONICALIZATION_FAILED');
  return encoded;
}

export function canonicalizeDomainValue(domainPrefix: string, value: unknown): Buffer {
  if (typeof domainPrefix !== 'string' || domainPrefix.length === 0) throw new Error('INVALID_DOMAIN');
  return Buffer.concat([
    Buffer.from(domainPrefix, 'utf8'),
    Buffer.from(canonicalize(value), 'utf8'),
  ]);
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
