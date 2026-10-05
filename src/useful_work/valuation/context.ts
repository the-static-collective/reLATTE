import { canonicalBytes, exactKeys, integer, parseJob, record } from '../job.ts';
import { inspectNativeWork } from '../merkle_native/exchange.ts';
import { inspectArtifact, parseResultId } from '../merkle_native/result.ts';
import { verifyAudit } from '../audit/accumulator.ts';
import { verifyHistory } from '../audit_clock/history.ts';
import { domainHash } from './policy.ts';
import { equal } from './wire.ts';
import { inspectResourceClaim } from './resource.ts';
import type { ValuationContext, ValuationInput } from './types.ts';

export const MAX_VALUATION_CONTEXT_BYTES = 64 * 1024 * 1024;
export const MAX_VALUATION_BUNDLE_BYTES = MAX_VALUATION_CONTEXT_BYTES + 2_000_000;
export const contextId = (body: Omit<ValuationContext, 'context_id'>) => 'useful-work-valuation-context-v1:' + domainHash('UsefulWork-ValuationContext-v1|', body);
async function reconstruct(value: unknown) {
  if (canonicalBytes(value).length > MAX_VALUATION_CONTEXT_BYTES) throw new Error('VALUATION_CONTEXT_SIZE_LIMIT');
  const input = record(structuredClone(value), 'INVALID_VALUATION_INPUT');
  exactKeys(input, ['result_id', 'job_spec', 'work', 'audit', 'history', 'resource_claims', 'canonical_artifact'], 'INVALID_VALUATION_INPUT_FIELDS');
  const job = parseJob(input.job_spec); parseResultId(input.result_id);
  const work = await inspectNativeWork(input.work, canonicalBytes(job));
  if (work.result_id !== input.result_id) throw new Error('VALUATION_RESULT_MISMATCH');
  const history = input.history === null ? null : await verifyHistory(input.history);
  const suppliedAudit = input.audit === null ? null : await verifyAudit(input.audit), audit = suppliedAudit ?? history?.audit ?? null;
  if (history && (history.history.summary.result_id !== work.result_id || history.history.work.crossing_id !== work.crossing.crossing_id || !equal(history.history.job_spec, job))) throw new Error('VALUATION_HISTORY_MISMATCH');
  if (suppliedAudit && history && suppliedAudit.audit_id !== history.audit?.audit_id) throw new Error('VALUATION_AUDIT_HISTORY_MISMATCH');
  if (audit && (audit.result_id !== work.result_id || !equal(audit.job_spec, job))) throw new Error('VALUATION_AUDIT_MISMATCH');
  if (!Array.isArray(input.resource_claims)) throw new Error('INVALID_RESOURCE_CLAIMS'); integer(input.resource_claims.length, 0, 128, 'RESOURCE_CLAIM_COUNT_LIMIT');
  const resources = [];
  for (const value of input.resource_claims) {
    const resource = await inspectResourceClaim(value), c = resource.claim;
    if (c.result_id !== work.result_id || (c.audit_id !== null && c.audit_id !== audit?.audit_id) ||
        (c.history_id !== null && c.history_id !== history?.history.history_id)) throw new Error('RESOURCE_CLAIM_SCOPE_MISMATCH');
    resources.push(resource);
  }
  let artifactBytes: number | null = null;
  if (input.canonical_artifact !== null) {
    if (typeof input.canonical_artifact !== 'string' || Buffer.byteLength(input.canonical_artifact) > 16 * 1024 * 1024) throw new Error('INVALID_CANONICAL_ARTIFACT_INPUT');
    const bytes = Buffer.from(input.canonical_artifact); inspectArtifact(bytes, job, work.result_id); artifactBytes = bytes.length;
  }
  const body: Omit<ValuationContext, 'context_id'> = { schema: 'useful-work.valuation-context/v1', result_id: work.result_id, job_spec: job, work: work.crossing,
    audit: suppliedAudit, history: history?.history ?? null, resource_claims: resources.map(r => r.crossing), canonical_artifact: input.canonical_artifact };
  if (canonicalBytes(body).length > MAX_VALUATION_CONTEXT_BYTES - 128) throw new Error('VALUATION_CONTEXT_SIZE_LIMIT');
  return { context: { ...body, context_id: contextId(body) }, native: work, audit, history: history?.history ?? null, resources, artifactBytes };
}
export async function createContext(input: ValuationInput) { return (await reconstruct(input)).context; }
export async function verifyContext(value: unknown) {
  if (canonicalBytes(value).length > MAX_VALUATION_CONTEXT_BYTES) throw new Error('VALUATION_CONTEXT_SIZE_LIMIT');
  const c = record(value, 'INVALID_VALUATION_CONTEXT');
  exactKeys(c, ['schema', 'context_id', 'result_id', 'job_spec', 'work', 'audit', 'history', 'resource_claims', 'canonical_artifact'], 'INVALID_VALUATION_CONTEXT_FIELDS');
  const { schema, context_id, ...input } = c;
  if (schema !== 'useful-work.valuation-context/v1') throw new Error('UNSUPPORTED_VALUATION_CONTEXT');
  if (context_id !== contextId({ schema, ...input } as Omit<ValuationContext, 'context_id'>)) throw new Error('VALUATION_CONTEXT_ID_MISMATCH');
  const verified = await reconstruct(input);
  if (context_id !== verified.context.context_id) throw new Error('VALUATION_CONTEXT_ID_MISMATCH');
  return verified;
}
export type VerifiedContext = Awaited<ReturnType<typeof verifyContext>>;
