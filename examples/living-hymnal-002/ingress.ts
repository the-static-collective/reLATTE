/**
 * Living Hymnal 002: OPTIONAL DONOR-SPECIFIC EDGE ADAPTER.
 * This does not belong in reLATTE's core membrane. It accepts an explicit,
 * human-cleared text-only release bundle from Static Live's Living Hymnal lab,
 * checks the exact bytes, and asks the generic reLATTE organ adapter to sign it.
 *
 * Cryptography binds a self-asserted donor claim to a key. It cannot prove
 * authorship, pastoral authority, identity, or redistribution rights.
 */
import { createHash } from 'node:crypto';
import { sealOpaqueOrganCrossing, verifyOpaqueOrganCrossing } from '../../src/organ.ts';
import type { OpaqueOrganSpec } from '../../src/organ.ts';
import type { P256KeyMaterial } from '../../src/protocol.ts';

const publishedKeys = ['id', 'title', 'lyrics', 'scriptureRef', 'bpm', 'meter'] as const;

export interface LivingHymnalBundle {
  schema: 'living-hymnal.relatte-export/v0.1';
  payload_text: string;
  spec: OpaqueOrganSpec;
}

function record(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_HYMNAL_OBJECT');
  return value as Record<string, any>;
}

function assertKeys(value: Record<string, any>, keys: readonly string[], code: string): void {
  if (Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) throw new Error(code);
}

function hexBytes(text: string): string {
  return createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
}

export function verifyLivingHymnalBundle(bundleInput: unknown): {
  bundle: LivingHymnalBundle;
  publishedSong: { id: string; title: string; lyrics: string; scriptureRef: string; bpm: number; meter: string };
} {
  const bundle = record(bundleInput);
  assertKeys(bundle, ['schema', 'payload_text', 'spec'], 'INVALID_HYMNAL_BUNDLE_FIELDS');
  if (bundle.schema !== 'living-hymnal.relatte-export/v0.1')
    throw new Error('INVALID_HYMNAL_BUNDLE_SCHEMA');
  if (typeof bundle.payload_text !== 'string' || Buffer.byteLength(bundle.payload_text, 'utf8') > 65_536)
    throw new Error('INVALID_HYMNAL_PAYLOAD_SIZE');

  const spec = record(bundle.spec);
  if (spec.schema !== 'relatte.opaque-organ-spec/v0' ||
      spec.family_ref !== 'living-hymnal/v0.1' ||
      spec.donor_contract_ref !== 'living-hymnal.published-song/v0.1' ||
      spec.artifact_kind !== 'PUBLISHED_CONGREGATIONAL_SONG' ||
      typeof spec.source_world !== 'string' ||
      !/^church:[a-z0-9-]{1,40}$/.test(spec.source_world) ||
      spec.source_history_head !== null ||
      spec.return_address !== null) {
    throw new Error('UNRECOGNIZED_HYMNAL_SOURCE');
  }
  const claims = record(spec.donor_claims);
  if (claims.status !== 'PUBLISHED' || claims.rights_review_affirmed !== true ||
      claims.pastoral_review_affirmed !== true ||
      claims.interchurch_sharing_approved !== true ||
      claims.share_scope !== 'PUBLIC_LYRICS_ONLY' ||
      typeof claims.terms !== 'string' || claims.terms.length < 12) {
    throw new Error('NO_CLAIMED_INTERCHURCH_PERMISSION');
  }
  const effect = record(spec.requested_effect);
  if (effect.type !== 'CANDIDATE_IMPORT' || effect.target !== 'recipient-local-review')
    throw new Error('INVALID_HYMNAL_REQUESTED_EFFECT');
  if (!Array.isArray(spec.payload_refs) || spec.payload_refs.length !== 1 ||
      spec.payload_refs[0].role !== 'song-projection' ||
      spec.payload_refs[0].media_type !== 'application/json' ||
      spec.payload_refs[0].address !== 'sha256:' + hexBytes(bundle.payload_text))
    throw new Error('HYMNAL_PAYLOAD_HASH_MISMATCH');

  const parsed = record(JSON.parse(bundle.payload_text));
  assertKeys(parsed, publishedKeys, 'PRIVATE_OR_UNKNOWN_HYMNAL_FIELDS');
  if (typeof parsed.id !== 'string' || !/^[a-f0-9-]{20,50}$/i.test(parsed.id) ||
      spec.source_particular !== 'song:' + parsed.id ||
      typeof parsed.title !== 'string' || !parsed.title.length || parsed.title.length > 120 ||
      typeof parsed.lyrics !== 'string' || !parsed.lyrics.length || parsed.lyrics.length > 12000 ||
      typeof parsed.scriptureRef !== 'string' ||
      typeof parsed.bpm !== 'number' || !Number.isInteger(parsed.bpm) ||
      parsed.bpm < 40 || parsed.bpm > 240 ||
      !['4/4', '3/4', '6/8', '12/8', '2/4'].includes(parsed.meter)) {
    throw new Error('INVALID_PUBLISHED_HYMNAL_SONG');
  }
  return { bundle: bundle as unknown as LivingHymnalBundle,
    publishedSong: parsed as { id: string; title: string; lyrics: string; scriptureRef: string; bpm: number; meter: string } };
}

export async function sealLivingHymnalBundle(
  input: unknown,
  sourceKeys: P256KeyMaterial,
): Promise<{ crossing: Record<string, any>; publishedSong: ReturnType<typeof verifyLivingHymnalBundle>['publishedSong'] }> {
  const checked = verifyLivingHymnalBundle(input);
  const crossing = await sealOpaqueOrganCrossing(checked.bundle.spec, sourceKeys);
  if (!(await verifyOpaqueOrganCrossing(crossing))) throw new Error('INVALID_SEALED_HYMNAL_CROSSING');
  return { crossing, publishedSong: checked.publishedSong };
}
