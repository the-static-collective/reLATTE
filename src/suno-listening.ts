import { canonicalizeDomainValue, sha256Hex, validateTimestamp } from './canonical.ts';
import { sealCrossingEnvelope } from './protocol.ts';
import type { P256KeyMaterial } from './protocol.ts';
import type { LocalReceiver } from './receiver.ts';

/**
 * SUNO LISTENING 001: an owner-supplied, bounded extract of two different
 * model outputs. "Measured" and "heard" are not interchangeable evidence.
 * No Suno login, secret, lyrics, audio bytes, play counts or token is imported.
 *
 * This module can create a SIGNED REVIEW crossing but cannot ADMIT a finding,
 * publish a HUMKIN feed, alter a schedule or assert a real listener heard audio.
 */

export interface SunoListeningCapture {
  schema: 'humkin.suno-listening-capture/v1';
  recording_id: string;
  suno_audio_id: string;
  visibility: 'private' | 'link_only' | 'public';
  captured_at: string;
  measured: {
    source: 'suno.audio_analysis';
    bpm: number | null;
    key: string | null;
    time_signature: number | null;
    section_labels: string[];
  };
  heard: {
    source: 'suno.audio_listen';
    audible_evidence: string;
    interpretation: string;
    uncertainties: string[];
  };
  approval: {
    public_release: false;
    broadcast_control: false;
  };
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('HOLD_INVALID_LISTENING_CAPTURE');
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: string[]): void {
  if (Object.keys(value).sort().join('|') !== [...keys].sort().join('|')) {
    throw new Error('HOLD_UNEXPECTED_LISTENING_FIELD');
  }
}

function boundedString(value: unknown, max = 3000): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

function boundedStrings(value: unknown, maxItems = 30): value is string[] {
  return Array.isArray(value) && value.length <= maxItems &&
    value.every((entry: unknown) => boundedString(entry, 120));
}

function nullableFiniteNumber(value: unknown, min: number, max: number): boolean {
  return value === null || (typeof value === 'number' && Number.isFinite(value) &&
    value >= min && value <= max);
}

/**
 * Refuse unsupported fields rather than unintentionally carrying private
 * Suno fields, credentials, raw lyrics, or fabricated audience statistics.
 */
export function inspectSunoListeningCapture(value: unknown): SunoListeningCapture {
  const p = record(value);
  exactKeys(p, [
    'schema', 'recording_id', 'suno_audio_id', 'visibility', 'captured_at',
    'measured', 'heard', 'approval',
  ]);
  if (p.schema !== 'humkin.suno-listening-capture/v1' ||
      !boundedString(p.recording_id, 200) ||
      typeof p.suno_audio_id !== 'string' ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(p.suno_audio_id) ||
      !['private', 'link_only', 'public'].includes(String(p.visibility))) {
    throw new Error('HOLD_INVALID_LISTENING_IDENTITY');
  }
  validateTimestamp(p.captured_at);
  const m = record(p.measured);
  exactKeys(m, ['source', 'bpm', 'key', 'time_signature', 'section_labels']);
  if (m.source !== 'suno.audio_analysis' ||
      !nullableFiniteNumber(m.bpm, 1, 300) ||
      (m.key !== null && !boundedString(m.key, 80)) ||
      !nullableFiniteNumber(m.time_signature, 1, 16) ||
      !boundedStrings(m.section_labels, 150)) {
    throw new Error('HOLD_INVALID_SUNO_MEASUREMENT');
  }
  const h = record(p.heard);
  exactKeys(h, ['source', 'audible_evidence', 'interpretation', 'uncertainties']);
  if (h.source !== 'suno.audio_listen' ||
      !boundedString(h.audible_evidence) ||
      !boundedString(h.interpretation) ||
      !boundedStrings(h.uncertainties)) {
    throw new Error('HOLD_INVALID_SUNO_LISTENING');
  }
  const a = record(p.approval);
  exactKeys(a, ['public_release', 'broadcast_control']);
  if (a.public_release !== false || a.broadcast_control !== false) {
    throw new Error('HOLD_SUNO_CAPABILITY_ESCALATION');
  }
  return value as SunoListeningCapture;
}

export function sunoListeningDigest(value: unknown): string {
  const capture = inspectSunoListeningCapture(value);
  return sha256Hex(canonicalizeDomainValue('HUMKIN-SunoListeningCapture-v1|', capture));
}

export interface SunoListeningReviewRoute {
  receiver: LocalReceiver;
  sourceKeys: P256KeyMaterial;
  sourceWorld: string;
  sourceParticular: string;
  recordedAt: string;
  ownerApprovedReview: boolean;
  receiverDecision: 'HOLD' | 'REFUSE';
}

/**
 * The crossing carries only a content digest and classification, not the
 * Suno-derived payload. Any later public export needs a DIFFERENT explicit
 * rights/metadata review by HUMKIN's source-of-truth catalog authority.
 */
export async function deliverSunoListeningForReview(value: unknown, route: SunoListeningReviewRoute) {
  const capture = inspectSunoListeningCapture(value);
  if (route.ownerApprovedReview !== true) throw new Error('HOLD_OWNER_REVIEW_NOT_APPROVED');
  if (route.receiverDecision !== 'HOLD' && route.receiverDecision !== 'REFUSE') {
    throw new Error('HOLD_INVALID_RECEIVER_DECISION');
  }
  if (!boundedString(route.sourceWorld, 200) || !boundedString(route.sourceParticular, 200)) {
    throw new Error('HOLD_INVALID_SOURCE_WORLD');
  }
  validateTimestamp(route.recordedAt);
  const digest = sunoListeningDigest(capture);
  const crossing = await sealCrossingEnvelope({
    schema: 'relatte.crossing-envelope/v0',
    protocol_version: '0',
    source_particular: route.sourceParticular,
    source_world: route.sourceWorld,
    source_history_head: null,
    parents: [],
    declared_kind: 'HUMKIN_SUNO_LISTENING_REVIEW',
    payload_refs: [{
      address: 'sha256:' + digest,
      role: 'owner-held-listening-evidence-digest',
      media_type: 'application/json',
    }],
    requested_effect: null,
    capability_ref: null,
    privacy_policy: 'owner-held; no Suno source content copied into crossing',
    audience_policy: 'review-only; no automatic public robot feed or broadcast',
    return_address: null,
    created_at: route.recordedAt,
    extensions: {
      humkin_suno_listening: {
        schema: 'relatte.humkin-suno-listening-review/v1',
        capture_digest: digest,
        release_authorized: false,
        broadcast_authorized: false,
        actual_playback_verified: false,
        audience_stats_imported: false,
      },
    },
  }, route.sourceKeys);
  const received = await route.receiver.receive(crossing, route.recordedAt);
  const disposition = await route.receiver.dispose(
    crossing.crossing_id, route.receiverDecision, route.recordedAt,
    { note: 'Suno model output received for owner-local review only.' },
  );
  return {
    schema: 'relatte.humkin-suno-listening-review-result/v1' as const,
    recordingId: capture.recording_id,
    captureDigest: digest,
    crossingId: crossing.crossing_id,
    receiveReceipt: received,
    dispositionReceipt: disposition,
    disposition: route.receiverDecision,
    publicReleaseAllowed: false,
    broadcastControlAllowed: false,
    actualPlaybackVerified: false,
    sunoAudienceStatsImported: false,
  };
}
