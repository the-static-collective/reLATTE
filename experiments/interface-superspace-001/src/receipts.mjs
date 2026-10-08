import { createHash, randomUUID } from 'node:crypto';
export function canonical(value) {
  if (value instanceof Uint8Array) return JSON.stringify({ base64: Buffer.from(value).toString('base64') });
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).filter(k => value[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
export const digest = value => 'sha256:' + createHash('sha256').update(canonical(value)).digest('hex');
export const byteDigest = value => 'sha256:' + createHash('sha256').update(Buffer.from(value)).digest('hex');
export const occurrence = prefix => prefix + ':' + randomUUID();
export function seal(value, field) { return { ...value, [field]: digest(value) }; }
export function verifySeal(value, field) {
  const { [field]: claimed, ...body } = value;
  if (digest(body) !== claimed) throw new Error('DIGEST_MISMATCH:' + field);
}
