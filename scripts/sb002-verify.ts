import { createHash } from 'node:crypto';

import {
  canonicalizeDomainValue,
  sha256Hex,
  verifyCrossingEnvelope,
  verifyReceipt,
} from '../src/index.ts';

export const SB002_PROPOSAL_SHA256 =
  'b9feba52bf6ca98f26d395d0e637d316600a856d379955c4fa47c36da4dfb545';
export const SB002_PINNED_EVIDENCE_SET_ID =
  'sb002-evidence-v0:a44ce387493dec11fbd0902a8ca03f090b3d08ee79db89e53084f84195bbd581';
export const SB002_KEY_DOMAIN = 'SupaBardo-SB002-Key-v0|';
export const SB002_EVIDENCE_DOMAIN = 'SupaBardo-SB002-EvidenceSet-v0|';

type AnyRecord = Record<string, any>;

function asRecord(value: unknown, code: string): AnyRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(code);
  return value as AnyRecord;
}

function requireEqual(actual: unknown, expected: unknown, code: string): void {
  if (actual !== expected) throw new Error(code);
}

function requireJsonEqual(actual: unknown, expected: unknown, code: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(code);
}

function normalizedPublicKey(value: unknown): Record<string, string> {
  const key = asRecord(value, 'SB002_INVALID_PUBLIC_KEY');
  if (
    key.kty !== 'EC' ||
    key.crv !== 'P-256' ||
    typeof key.x !== 'string' ||
    typeof key.y !== 'string' ||
    Object.prototype.hasOwnProperty.call(key, 'd')
  ) throw new Error('SB002_INVALID_PUBLIC_KEY');
  return { kty: 'EC', crv: 'P-256', x: key.x, y: key.y };
}

export function sb002KeyFingerprint(value: unknown): string {
  return sha256Hex(
    canonicalizeDomainValue(SB002_KEY_DOMAIN, normalizedPublicKey(value)),
  );
}

function sameKey(a: unknown, b: unknown): boolean {
  return sb002KeyFingerprint(a) === sb002KeyFingerprint(b);
}

export interface Sb002Bundle {
  proposal_bytes: Uint8Array;
  crossing: unknown;
  release: unknown;
  unresolved: unknown;
  disposition: unknown;
  exit: unknown;
}

export interface Sb002EvidenceSet {
  schema: 'supabardo.sb002-evidence-set/v0';
  specimen: 'SB-002';
  proposal_sha256: string;
  crossing_id: string;
  release_receipt_id: string;
  unresolved_receipt_id: string;
  disposition_receipt_id: string;
  exit_receipt_id: string;
  source_key_sha256: string;
  bardo_key_sha256: string;
  destination_key_sha256: string;
  causal_chain: string[];
  destination_disposition: 'HOLD';
  claim_limit: string;
}

export function buildSb002EvidenceSet(bundle: Sb002Bundle): Sb002EvidenceSet {
  const crossing = asRecord(bundle.crossing, 'SB002_INVALID_CROSSING_OBJECT');
  const release = asRecord(bundle.release, 'SB002_INVALID_RELEASE_OBJECT');
  const unresolved = asRecord(bundle.unresolved, 'SB002_INVALID_UNRESOLVED_OBJECT');
  const disposition = asRecord(bundle.disposition, 'SB002_INVALID_DISPOSITION_OBJECT');
  const exit = asRecord(bundle.exit, 'SB002_INVALID_EXIT_OBJECT');

  return {
    schema: 'supabardo.sb002-evidence-set/v0',
    specimen: 'SB-002',
    proposal_sha256: createHash('sha256').update(bundle.proposal_bytes).digest('hex'),
    crossing_id: crossing.crossing_id,
    release_receipt_id: release.receipt_id,
    unresolved_receipt_id: unresolved.receipt_id,
    disposition_receipt_id: disposition.receipt_id,
    exit_receipt_id: exit.receipt_id,
    source_key_sha256: sb002KeyFingerprint(crossing.signing?.public_key),
    bardo_key_sha256: sb002KeyFingerprint(unresolved.signing?.public_key),
    destination_key_sha256: sb002KeyFingerprint(disposition.signing?.public_key),
    causal_chain: [
      'crossing_id -> release.post_state_ref',
      'release.receipt_id -> unresolved.pre_state_ref',
      'unresolved.receipt_id -> disposition.extensions.local_receiver.supabardo_unresolved_receipt_id',
      'unresolved.receipt_id -> exit.pre_state_ref',
      'disposition.receipt_id -> exit.post_state_ref',
    ],
    destination_disposition: 'HOLD',
    claim_limit:
      'Creative proposal crossing only; no KEEP, REFUSE, render authority, or universal SupaBardo promotion.',
  };
}

export function computeSb002EvidenceSetId(bundle: Sb002Bundle): string {
  return `sb002-evidence-v0:${sha256Hex(
    canonicalizeDomainValue(SB002_EVIDENCE_DOMAIN, buildSb002EvidenceSet(bundle)),
  )}`;
}

export async function verifySb002Bundle(bundle: Sb002Bundle): Promise<true> {
  const proposal = JSON.parse(Buffer.from(bundle.proposal_bytes).toString('utf8'));
  const crossing = asRecord(bundle.crossing, 'SB002_INVALID_CROSSING_OBJECT');
  const release = asRecord(bundle.release, 'SB002_INVALID_RELEASE_OBJECT');
  const unresolved = asRecord(bundle.unresolved, 'SB002_INVALID_UNRESOLVED_OBJECT');
  const disposition = asRecord(bundle.disposition, 'SB002_INVALID_DISPOSITION_OBJECT');
  const exit = asRecord(bundle.exit, 'SB002_INVALID_EXIT_OBJECT');

  if (!(await verifyCrossingEnvelope(crossing))) throw new Error('SB002_INVALID_CROSSING_SIGNATURE');
  for (const [label, receipt] of [
    ['RELEASE', release],
    ['UNRESOLVED', unresolved],
    ['DISPOSITION', disposition],
    ['EXIT', exit],
  ] as const) {
    if (!(await verifyReceipt(receipt))) throw new Error(`SB002_INVALID_${label}_SIGNATURE`);
  }

  const payloadHash = createHash('sha256').update(bundle.proposal_bytes).digest('hex');
  requireEqual(payloadHash, SB002_PROPOSAL_SHA256, 'SB002_PROPOSAL_HASH_MISMATCH');
  requireEqual(proposal.schema, 'toaster.candidate-proposal/v0', 'SB002_PROPOSAL_SCHEMA');
  requireEqual(proposal.specimen, 'SB-002', 'SB002_PROPOSAL_SPECIMEN');
  requireEqual(proposal.proposal_id, 'toaster-proposal:sb002:bardo-six-up-001', 'SB002_PROPOSAL_ID');
  requireEqual(proposal.state?.proposal_only, true, 'SB002_PROPOSAL_ONLY');
  requireEqual(proposal.state?.source_selected_candidate, false, 'SB002_SOURCE_SELECTED');
  requireEqual(proposal.state?.destination_disposition, null, 'SB002_PROPOSAL_PREDECIDED');
  requireEqual(proposal.state?.render_authority, false, 'SB002_PROPOSAL_RENDER_AUTHORITY');
  requireJsonEqual(proposal.destination_choices, ['KEEP', 'HOLD', 'REFUSE'], 'SB002_PROPOSAL_CHOICES');
  requireEqual(proposal.requested_effect?.automatic_keep, false, 'SB002_AUTOMATIC_KEEP');
  requireEqual(proposal.requested_effect?.automatic_render, false, 'SB002_AUTOMATIC_RENDER');

  requireEqual(
    crossing.payload_refs?.[0]?.address,
    `sha256:${SB002_PROPOSAL_SHA256}`,
    'SB002_CROSSING_PAYLOAD_MISMATCH',
  );
  requireEqual(crossing.declared_kind, 'HAUNTED_TOASTER_CREATIVE_PROPOSAL', 'SB002_CROSSING_KIND');
  requireEqual(crossing.source_world, 'toaster:the-haunted-toaster', 'SB002_SOURCE_WORLD');
  requireEqual(crossing.source_history_head, '2c86d684138f3008344b18202b81193db0c947c7', 'SB002_SOURCE_COMMIT');
  requireEqual(crossing.requested_effect?.destination_disposition, 'local', 'SB002_GLOBALIZED_REQUEST');
  requireJsonEqual(crossing.requested_effect?.allowed, ['KEEP', 'HOLD', 'REFUSE'], 'SB002_ALLOWED_DRIFT');
  requireEqual(crossing.privacy_policy?.retention, 'decay-after-export', 'SB002_RETENTION_DRIFT');
  requireEqual(crossing.extensions?.sb002?.source_blob_sha, 'c70db798cbbe19e78d8cbe965d6cbfbac4393de1', 'SB002_SOURCE_BLOB');
  requireEqual(crossing.extensions?.sb002?.keep_law_commit, '4ecfe391171758cbe1d247787d95b7680e31146b', 'SB002_KEEP_LAW_COMMIT');

  for (const receipt of [release, unresolved, disposition, exit]) {
    requireEqual(receipt.crossing_id, crossing.crossing_id, 'SB002_CROSSING_ID_SPLIT');
  }

  requireEqual(release.kind, 'SB002_RELEASE', 'SB002_RELEASE_KIND');
  requireEqual(release.semantic_effect, 'proposal-released', 'SB002_RELEASE_EFFECT');
  requireEqual(release.post_state_ref, crossing.crossing_id, 'SB002_RELEASE_LOST_CROSSING');
  requireEqual(release.extensions?.supabardo?.source_bytes_may_remain, true, 'SB002_RELEASE_ERASURE');

  requireEqual(unresolved.kind, 'SB002_UNRESOLVED_INTERVAL', 'SB002_UNRESOLVED_KIND');
  requireEqual(unresolved.semantic_effect, 'none', 'SB002_BARDO_CREATED_MEANING');
  requireEqual(unresolved.world_id, 'supabardo:sb002', 'SB002_BARDO_WORLD');
  requireEqual(unresolved.pre_state_ref, release.receipt_id, 'SB002_WAIT_BEFORE_RELEASE');
  requireEqual(unresolved.extensions?.supabardo?.state, 'OPEN', 'SB002_WAIT_NOT_OPEN');
  requireEqual(unresolved.extensions?.supabardo?.destination_disposition, null, 'SB002_PREMATURE_DESTINATION_MEANING');
  requireJsonEqual(
    unresolved.extensions?.supabardo?.occurrence_classes,
    ['ENTER', 'FORM', 'WITNESS', 'WAIT'],
    'SB002_OCCURRENCE_DRIFT',
  );

  requireEqual(disposition.kind, 'TOASTER_HOLD', 'SB002_DESTINATION_NOT_HOLD');
  requireEqual(disposition.world_id, 'world:sb002-creative-desk', 'SB002_DESTINATION_WORLD');
  requireEqual(disposition.semantic_effect, 'proposal-held', 'SB002_DESTINATION_EFFECT');
  requireEqual(disposition.extensions?.local_receiver?.disposition, 'HOLD', 'SB002_DESTINATION_DISPOSITION');
  requireEqual(disposition.extensions?.local_receiver?.render_authority, false, 'SB002_HOLD_RENDER_AUTHORITY');
  requireEqual(disposition.extensions?.local_receiver?.human_keep_observed, false, 'SB002_FALSE_KEEP');
  requireEqual(disposition.extensions?.local_receiver?.human_refuse_observed, false, 'SB002_FALSE_REFUSE');
  requireEqual(
    disposition.extensions?.local_receiver?.supabardo_unresolved_receipt_id,
    unresolved.receipt_id,
    'SB002_DESTINATION_LOST_UNRESOLVED_ANCESTRY',
  );

  requireEqual(exit.kind, 'SB002_EXIT', 'SB002_EXIT_KIND');
  requireEqual(exit.semantic_effect, 'none', 'SB002_EXIT_CREATED_MEANING');
  requireEqual(exit.pre_state_ref, unresolved.receipt_id, 'SB002_EXIT_LOST_WAIT');
  requireEqual(exit.post_state_ref, disposition.receipt_id, 'SB002_EXIT_LOST_DESTINATION');
  requireEqual(exit.extensions?.supabardo?.destination_disposition, 'HOLD', 'SB002_EXIT_DISPOSITION_DRIFT');
  requireEqual(
    exit.extensions?.supabardo?.destination_disposition_receipt_id,
    disposition.receipt_id,
    'SB002_EXIT_WRONG_DESTINATION_RECEIPT',
  );

  const sourceKey = crossing.signing?.public_key;
  const releaseKey = release.signing?.public_key;
  const bardoKey = unresolved.signing?.public_key;
  const destinationKey = disposition.signing?.public_key;
  const exitKey = exit.signing?.public_key;
  if (!sameKey(sourceKey, releaseKey)) throw new Error('SB002_RELEASE_IDENTITY_SPLIT');
  if (!sameKey(bardoKey, exitKey)) throw new Error('SB002_BARDO_IDENTITY_SPLIT');
  if (sameKey(sourceKey, bardoKey)) throw new Error('SB002_SOURCE_BARDO_AUTHORITY_COLLAPSE');
  if (sameKey(sourceKey, destinationKey)) throw new Error('SB002_SOURCE_DESTINATION_AUTHORITY_COLLAPSE');
  if (sameKey(bardoKey, destinationKey)) throw new Error('SB002_BARDO_DESTINATION_AUTHORITY_COLLAPSE');

  return true;
}

export async function verifyPinnedSb002EvidenceSet(
  bundle: Sb002Bundle,
  manifestValue: unknown,
): Promise<true> {
  await verifySb002Bundle(bundle);
  const manifest = asRecord(manifestValue, 'SB002_INVALID_EVIDENCE_MANIFEST');
  requireEqual(manifest.schema, 'supabardo.sb002-evidence-manifest/v0', 'SB002_EVIDENCE_MANIFEST_SCHEMA');
  const body = buildSb002EvidenceSet(bundle);
  requireJsonEqual(manifest.body, body, 'SB002_EVIDENCE_BODY_MISMATCH');
  const computed = computeSb002EvidenceSetId(bundle);
  requireEqual(manifest.evidence_set_id, computed, 'SB002_EVIDENCE_SET_ID_MISMATCH');
  requireEqual(computed, SB002_PINNED_EVIDENCE_SET_ID, 'SB002_PINNED_EVIDENCE_SET_MISMATCH');
  return true;
}
