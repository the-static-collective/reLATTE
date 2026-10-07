import { validateForCanonicalization } from './canonical.ts';
const fail = (ok: unknown, code: string): void => { if (!ok) throw new Error(code); };
/** Reject duplicate names before JSON.parse erases them. No normalization of
 * Unicode; JSON whitespace/escapes and object order have their JSON meanings.
 */
export function parseEvidenceJson(raw: string): any {
  fail(Buffer.byteLength(raw) <= 2_000_000, 'OVERSIZED_ARTIFACT');
  let i = 0;
  const ws = () => { while (/[ \t\r\n]/.test(raw[i] ?? '') && i < raw.length) i++; };
  const string = (): string => {
    const start = i++;
    while (i < raw.length) {
      if (raw[i] === '\\') { i += 2; continue; }
      if (raw[i++] === '"') return JSON.parse(raw.slice(start, i));
    }
    throw new Error('MALFORMED_ARTIFACT');
  };
  const value = (depth: number): void => {
    fail(depth <= 100, 'DEPTH_LIMIT_EXCEEDED'); ws();
    if (raw[i] === '"') { string(); return; }
    if (raw[i] === '{') {
      i++; ws(); const keys = new Set<string>();
      if (raw[i] === '}') { i++; return; }
      while (i < raw.length) {
        fail(raw[i] === '"', 'MALFORMED_ARTIFACT');
        const key = string(); fail(!keys.has(key), 'DUPLICATE_JSON_KEY'); keys.add(key);
        ws(); fail(raw[i++] === ':', 'MALFORMED_ARTIFACT'); value(depth + 1); ws();
        if (raw[i] === '}') { i++; return; }
        fail(raw[i++] === ',', 'MALFORMED_ARTIFACT'); ws();
      }
      throw new Error('MALFORMED_ARTIFACT');
    }
    if (raw[i] === '[') {
      i++; ws(); if (raw[i] === ']') { i++; return; }
      while (i < raw.length) {
        value(depth + 1); ws(); if (raw[i] === ']') { i++; return; }
        fail(raw[i++] === ',', 'MALFORMED_ARTIFACT'); ws();
      }
      throw new Error('MALFORMED_ARTIFACT');
    }
    const match = /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(raw.slice(i));
    fail(match, 'MALFORMED_ARTIFACT'); i += match![0].length;
  };
  try { value(0); ws(); fail(i === raw.length, 'MALFORMED_ARTIFACT'); }
  catch (e) { if (e instanceof SyntaxError) throw new Error('MALFORMED_ARTIFACT'); throw e; }
  const parsed = JSON.parse(raw); validateForCanonicalization(parsed); return parsed;
}
