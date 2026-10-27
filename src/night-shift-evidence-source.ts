import { canonicalizeDomainValue, sha256Hex, validateTimestamp } from './canonical.ts';
import type { EvidenceObservation, EvidenceSource } from './evidence-transit.ts';

export const NIGHT_SHIFT_SOURCE_DOMAIN = 'reLATTE-NightShiftGitHubSource-v0|';
export const NIGHT_SHIFT_PUBLIC_FEED = 'https://kbhqacsdvjsstzyplqij.supabase.co/functions/v1/night-shift?op=public';

type FeedEntry = {
  source_ref: string;
  source_url: string;
  title: string;
  state: 'MERGED';
  commit_sha: string;
  observed_at: string;
  source_happened_at: string;
};

const REF = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)#([1-9][0-9]*)$/;
const SHA = /^[a-f0-9]{40}$/;
function asEntry(v: unknown): FeedEntry {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('INVALID_NIGHT_SOURCE_ROW');
  const e = v as Record<string, unknown>;
  if (typeof e.source_ref !== 'string' || !REF.test(e.source_ref)) throw new Error('INVALID_NIGHT_SOURCE_REF');
  const match = REF.exec(e.source_ref)!;
  if (typeof e.source_url !== 'string' ||
      e.source_url !== `https://github.com/${match[1]}/${match[2]}/pull/${match[3]}`) {
    throw new Error('INVALID_NIGHT_SOURCE_URL');
  }
  if (e.state !== 'MERGED' || typeof e.commit_sha !== 'string' || !SHA.test(e.commit_sha)) {
    throw new Error('UNSUPPORTED_NIGHT_SOURCE_STATE');
  }
  if (typeof e.title !== 'string' || e.title.length === 0 || e.title.length > 350) {
    throw new Error('INVALID_NIGHT_SOURCE_TITLE');
  }
  validateTimestamp(e.observed_at);
  validateTimestamp(e.source_happened_at);
  return e as FeedEntry;
}
/** No authentication, contacts, task IDs, or local reviewer identities cross. */
export function nightShiftEvidenceObservation(sourceValue: unknown): EvidenceObservation {
  const source = asEntry(sourceValue);
  const origin = {
    source_ref: source.source_ref,
    source_url: source.source_url,
    title: source.title,
    state: source.state,
    commit_sha: source.commit_sha,
    observed_at: source.observed_at,
    source_happened_at: source.source_happened_at,
  };
  const digest = sha256Hex(canonicalizeDomainValue(NIGHT_SHIFT_SOURCE_DOMAIN, origin));
  const repo = source.source_ref.split('#')[0]!;
  return {
    schema: 'relatte.evidence-observation/v0',
    source_system: 'night-shift:github-rest',
    source_world: 'world:night-shift-public-source-feed',
    source_particular: 'source:night-shift-github-pr-state',
    source_event_id: 'night-source-v0:' + digest,
    subject_ref: 'repo:' + repo,
    assertion_kind: 'github.pull_request.state',
    payload_ref: 'sha256:' + digest,
    evidence_level: 'source_observed',
    occurred_at: new Date(source.source_happened_at).toISOString(),
    observed_at: new Date(source.observed_at).toISOString(),
  };
}

function cursorFor(e: FeedEntry): string {
  return e.observed_at + '|' + e.source_ref + '|' + e.commit_sha;
}
/**
 * Read-only public feed. Current Night Shift production feed is intentionally
 * capped at five recent merged PR observations. Fail rather than silently
 * advance when a known cursor has fallen out of this bounded aperture.
 * A production outbox should eventually replace this polling aperture.
 */
export class NightShiftPublicEvidenceSource implements EvidenceSource {
  private readonly fetcher: typeof fetch;
  private readonly endpoint: string;
  constructor(fetcher: typeof fetch = fetch, endpoint: string = NIGHT_SHIFT_PUBLIC_FEED) {
    this.fetcher = fetcher;
    this.endpoint = endpoint;
  }

  async poll(cursor: string | null): Promise<{ observations: EvidenceObservation[]; next_cursor: string | null }> {
    if (cursor !== null && (typeof cursor !== 'string' || cursor.length > 350)) {
      throw new Error('INVALID_NIGHT_SOURCE_CURSOR');
    }
    const res = await this.fetcher(this.endpoint, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error('NIGHT_SOURCE_HTTP_' + res.status);
    const body: unknown = await res.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('INVALID_NIGHT_SOURCE_BODY');
    const raw = (body as Record<string, unknown>).external;
    if (!Array.isArray(raw) || raw.length > 5) throw new Error('INVALID_NIGHT_SOURCE_FEED');
    const items = raw.map(asEntry).sort((a, b) => cursorFor(a).localeCompare(cursorFor(b)));
    if (cursor !== null && items.length >= 5 && !items.some(e => cursorFor(e) === cursor)) {
      throw new Error('NIGHT_SOURCE_CURSOR_OUTSIDE_FEED_WINDOW');
    }
    const after = items.filter(e => cursor === null || cursorFor(e) > cursor);
    const nextCursor = after.length > 0 ? cursorFor(after[after.length - 1]!) : cursor;
    return { observations: after.map(nightShiftEvidenceObservation), next_cursor: nextCursor };
  }
}
