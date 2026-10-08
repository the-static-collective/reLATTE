import { createHash } from 'node:crypto';

import {
  canonicalizeDomainValue,
  sha256Hex,
  verifyCrossingEnvelope,
  verifyReceipt,
} from '../src/index.ts';

export const SB001_PAYLOAD_SHA256 =
  '56376cad6f1c5f9b3bc671876dddeaf8ad63c90b2f162a11383b68561f51a82f';

export const SB001_PINNED_EVIDENCE_SET_ID =
  'sb001-evidence-v0:cbb5e16c8209e1978d1cc1910c4b5128fa58bdab1bb9bbd7d4112ebd0f6c5174';

export const SB001_KEY_DOMAIN = 'SupaBardo-SB001-Key-v0|';
export const SB001_EVIDENCE_DOMAIN = 'SupaBardo-SB001-EvidenceSet-v0|';

type AnyRecord = Record<string, any>;

function asRecord(value: unknown, code: string): AnyRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(code);
  }
  return value as AnyRecord;
}

function requireEqual(actual: unknown, expected: unknown, code: string): void {
  if (actual !== expected) throw new Error(code);
}

function requireArrayIncludes(value: unknown, expected: string, code: string): void {
  if (!Array.isArray(value) || !value.includes(expected)) throw new Error(code);
}

function requireArrayExcludes(value: unknown, excluded: string, code: string): void {
  if (!Array.isArray(value) || value.includes(excluded)) throw new Error(code);
}

function requireExactArray(value: unknown, expected: readonly string[], code: string): void {
  if (!Array.isArray(value) || value.length !== expected.length) throw new Error(code);
  for (let i = 0; i < expected.length; i++) {
    if (value[i] !== expected[i]) throw new Error(code);
  }
}

function requireOnlyKeys(value: unknown, allowed: readonly string[], code: string): AnyRecord {
  const record = asRecord(value, code);
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(record)) {
    if (!allowedSet.has(key)) throw new Error(code);
  }
  return record;
}

function normalizedPublicKey(value: unknown): Record<string, string> {
  const key = asRecord(value, 'SB001_INVALID_PUBLIC_KEY');
  if (
    key.kty !== 'EC' ||
    key.crv !== 'P-256' ||
    typeof key.x !== 'string' ||
    typeof key.y !== 'string' ||
    Object.prototype.hasOwnProperty.call(key, 'd')
  ) {
    throw new Error('SB001_INVALID_PUBLIC_KEY');
  }
  return {
    kty: 'EC',
    crv: 'P-256',
    x: key.x,
    y: key.y,
  };
}

export function sb001KeyFingerprint(value: unknown): string {
  return sha256Hex(
    canonicalizeDomainValue(SB001_KEY_DOMAIN, normalizedPublicKey(value)),
  );
}

function sameKey(a: unknown, b: unknown): boolean {
  return sb001KeyFingerprint(a) === sb001KeyFingerprint(b);
}

export interface Sb001Bundle {
  particular_bytes: Uint8Array;
  crossing: unknown;
  release: unknown;
  unresolved: unknown;
  disposition: unknown;
  exit: unknown;
}

export interface Sb001EvidenceSet {
  schema: 'supabardo.sb001-evidence-set/v0';
  specimen: 'SB-001';
  particular_sha256: string;
  crossing_id: string;
  release_receipt_id: string;
  unresolved_receipt_id: string;
  disposition_receipt_id: string;
  exit_receipt_id: string;
  source_key_sha256: string;
  bardo_key_sha256: string;
  destination_key_sha256: string;
  causal_chain: string[];
  claim_limit: string;
}

export function buildSb001EvidenceSet(bundle: Sb001Bundle): Sb001EvidenceSet {
  const crossing = asRecord(bundle.crossing, 'SB001_INVALID_CROSSING_OBJECT');
  const release = asRecord(bundle.release, 'SB001_INVALID_RELEASE_OBJECT');
  const unresolved = asRecord(bundle.unresolved, 'SB001_INVALID_UNRESOLVED_OBJECT');
  const disposition = asRecord(bundle.disposition, 'SB001_INVALID_DISPOSITION_OBJECT');
  const exit = asRecord(bundle.exit, 'SB001_INVALID_EXIT_OBJECT');

  return {
    schema: 'supabardo.sb001-evidence-set/v0',
    specimen: 'SB-001',
    particular_sha256: createHash('sha256').update(bundle.particular_bytes).digest('hex'),
    crossing_id: crossing.crossing_id,
    release_receipt_id: release.receipt_id,
    unresolved_receipt_id: unresolved.receipt_id,
    disposition_receipt_id: disposition.receipt_id,
    exit_receipt_id: exit.receipt_id,
    source_key_sha256: sb001KeyFingerprint(crossing.signing?.public_key),
    bardo_key_sha256: sb001KeyFingerprint(unresolved.signing?.public_key),
    destination_key_sha256: sb001KeyFingerprint(disposition.signing?.public_key),
    causal_chain: [
      'crossing_id -> release.post_state_ref',
      'release.receipt_id -> unresolved.pre_state_ref',
      'unresolved.receipt_id -> disposition.extensions.local_receiver.supabardo_unresolved_receipt_id',
      'unresolved.receipt_id -> exit.pre_state_ref',
      'disposition.receipt_id -> exit.post_state_ref',
    ],
    claim_limit:
      'Integrity commitment only; does not elevate any signer, receipt, or timestamp into universal authority.',
  };
}

export function computeSb001EvidenceSetId(bundle: Sb001Bundle): string {
  const body = buildSb001EvidenceSet(bundle);
  return `sb001-evidence-v0:${sha256Hex(
    canonicalizeDomainValue(SB001_EVIDENCE_DOMAIN, body),
  )}`;
}

export async function verifySb001Bundle(bundle: Sb001Bundle): Promise<true> {
  const crossing = asRecord(bundle.crossing, 'SB001_INVALID_CROSSING_OBJECT');
  const release = asRecord(bundle.release, 'SB001_INVALID_RELEASE_OBJECT');
  const unresolved = asRecord(bundle.unresolved, 'SB001_INVALID_UNRESOLVED_OBJECT');
  const disposition = asRecord(bundle.disposition, 'SB001_INVALID_DISPOSITION_OBJECT');
  const exit = asRecord(bundle.exit, 'SB001_INVALID_EXIT_OBJECT');

  if (!(await verifyCrossingEnvelope(crossing))) throw new Error('SB001_INVALID_CROSSING_SIGNATURE');
  for (const [label, receipt] of [
    ['RELEASE', release],
    ['UNRESOLVED', unresolved],
    ['DISPOSITION', disposition],
    ['EXIT', exit],
  ] as const) {
    if (!(await verifyReceipt(receipt))) throw new Error(`SB001_INVALID_${label}_SIGNATURE`);
  }

  const payloadHash = createHash('sha256').update(bundle.particular_bytes).digest('hex');
  requireEqual(payloadHash, SB001_PAYLOAD_SHA256, 'SB001_PARTICULAR_HASH_MISMATCH');
  requireEqual(
    crossing.payload_refs?.[0]?.address,
    `sha256:${SB001_PAYLOAD_SHA256}`,
    'SB001_CROSSING_PAYLOAD_MISMATCH',
  );
  requireEqual(crossing.declared_kind, 'STATIC_OS_WHOLE_BODY_PARTICULAR', 'SB001_CROSSING_KIND');
  requireEqual(crossing.requested_effect?.destination_disposition, 'local', 'SB001_GLOBALIZED_REQUEST');
  requireEqual(crossing.privacy_policy?.retention, 'decay-after-export', 'SB001_RETENTION_DRIFT');
  requireEqual(crossing.audience_policy?.destination, 'world:sb001-b', 'SB001_DESTINATION_SUBSTITUTION');
  requireEqual(crossing.return_address, 'supabardo:return:sb001', 'SB001_RETURN_ROUTE_SUBSTITUTION');
  requireEqual(
    crossing.source_history_head,
    'c1f3024e267ecf033e03f7707bcb07e784e1f095',
    'SB001_SOURCE_COMMIT_SUBSTITUTION',
  );
  requireEqual(
    crossing.extensions?.sb001?.source_repository,
    'the-static-collective/static-os',
    'SB001_SOURCE_REPOSITORY_SUBSTITUTION',
  );
  requireEqual(
    crossing.extensions?.sb001?.source_ref,
    'experiment/witness-to-world-crossing-001',
    'SB001_SOURCE_REF_SUBSTITUTION',
  );
  requireEqual(
    crossing.extensions?.sb001?.source_commit,
    crossing.source_history_head,
    'SB001_SOURCE_COMMIT_SPLIT',
  );
  requireEqual(
    crossing.extensions?.sb001?.source_path,
    'examples/world-receipt.independent-contradiction.json',
    'SB001_SOURCE_PATH_SUBSTITUTION',
  );
  requireEqual(
    crossing.extensions?.sb001?.source_blob_sha,
    '2b317402c4769319220cd6bc3e5d20c3978dbfbf',
    'SB001_SOURCE_BLOB_SUBSTITUTION',
  );
  requireEqual(
    crossing.extensions?.sb001?.claim_limit,
    'Executable STATIC-OS software occurrence; not a physical boot witness.',
    'SB001_CLAIM_LIMIT_ESCALATION',
  );
  requireOnlyKeys(
    crossing.extensions?.sb001,
    ['source_repository', 'source_ref', 'source_commit', 'source_path', 'source_blob_sha', 'claim_limit'],
    'SB001_CROSSING_EXTENSION_SMUGGLING',
  );

  for (const receipt of [release, unresolved, disposition, exit]) {
    requireEqual(receipt.crossing_id, crossing.crossing_id, 'SB001_CROSSING_ID_SPLIT');
  }

  requireEqual(release.kind, 'SB001_RELEASE', 'SB001_RELEASE_KIND');
  requireEqual(release.semantic_effect, 'crossing-released', 'SB001_RELEASE_EFFECT');
  requireEqual(release.world_id, crossing.source_world, 'SB001_RELEASE_WRONG_WORLD');
  requireEqual(release.receiver_particular, crossing.source_particular, 'SB001_RELEASE_WRONG_PARTICULAR');
  requireEqual(release.post_state_ref, crossing.crossing_id, 'SB001_RELEASE_LOST_CROSSING');
  requireEqual(release.extensions?.supabardo?.source_bytes_may_remain, true, 'SB001_RELEASE_ERASURE_CONFUSION');
  requireExactArray(
    release.extensions?.supabardo?.laws,
    ['RELEASE != ERASURE', 'COPY != SECOND AUTHORITY'],
    'SB001_RELEASE_LAW_DRIFT',
  );
  requireExactArray(
    release.residual_refs,
    [`sha256:${SB001_PAYLOAD_SHA256}`],
    'SB001_RELEASE_RESIDUAL_DRIFT',
  );
  requireOnlyKeys(
    release.extensions?.supabardo,
    ['laws', 'source_bytes_may_remain'],
    'SB001_RELEASE_EXTENSION_SMUGGLING',
  );

  requireEqual(unresolved.kind, 'SB001_UNRESOLVED_INTERVAL', 'SB001_UNRESOLVED_KIND');
  requireEqual(unresolved.semantic_effect, 'none', 'SB001_BARDO_CREATED_MEANING');
  requireEqual(unresolved.world_id, 'supabardo:sb001', 'SB001_BARDO_WORLD');
  requireEqual(unresolved.receiver_particular, 'crossing-field:sb001', 'SB001_BARDO_PARTICULAR');
  requireEqual(unresolved.pre_state_ref, release.receipt_id, 'SB001_WAIT_BEFORE_RELEASE');
  requireEqual(unresolved.post_state_ref, crossing.crossing_id, 'SB001_WAIT_LOST_CROSSING');
  requireEqual(unresolved.extensions?.supabardo?.state, 'OPEN', 'SB001_WAIT_NOT_OPEN');
  requireEqual(
    unresolved.extensions?.supabardo?.destination_disposition,
    null,
    'SB001_PREMATURE_DESTINATION_MEANING',
  );
  requireExactArray(
    unresolved.extensions?.supabardo?.occurrence_classes,
    ['ENTER', 'FORM', 'WITNESS', 'WAIT'],
    'SB001_OCCURRENCE_DRIFT',
  );
  requireExactArray(
    unresolved.extensions?.supabardo?.laws,
    ['OPEN != ADMITTED', 'WITNESS != AUTHORITY', 'PRESENCE != ASSENT'],
    'SB001_WAIT_LAW_DRIFT',
  );
  requireExactArray(
    unresolved.residual_refs,
    [`sha256:${SB001_PAYLOAD_SHA256}`],
    'SB001_WAIT_RESIDUAL_DRIFT',
  );
  requireOnlyKeys(
    unresolved.extensions?.supabardo,
    ['state', 'occurrence_classes', 'destination_disposition', 'laws'],
    'SB001_WAIT_EXTENSION_SMUGGLING',
  );

  requireEqual(disposition.kind, 'R3_ADMIT', 'SB001_DESTINATION_NOT_ADMIT');
  requireEqual(disposition.world_id, 'world:sb001-b', 'SB001_DESTINATION_WORLD');
  requireEqual(disposition.receiver_particular, 'particular:sb001-b', 'SB001_DESTINATION_PARTICULAR');
  requireEqual(
    disposition.semantic_effect,
    'sb001-local-constitution',
    'SB001_DESTINATION_EFFECT',
  );
  requireEqual(
    disposition.extensions?.local_receiver?.disposition,
    'ADMIT',
    'SB001_DESTINATION_DISPOSITION',
  );
  requireEqual(
    disposition.extensions?.local_receiver?.supabardo_unresolved_receipt_id,
    unresolved.receipt_id,
    'SB001_DESTINATION_LOST_UNRESOLVED_ANCESTRY',
  );
  requireExactArray(
    disposition.extensions?.local_receiver?.laws,
    ['RECEIPT != ADMISSION', 'HOLD != ADMIT', 'AUTHORITY IS LOCAL'],
    'SB001_DESTINATION_LAW_DRIFT',
  );
  requireExactArray(
    disposition.descendant_refs,
    ['particular:sb001-b:constituted-world-001'],
    'SB001_DESTINATION_DESCENDANT_DRIFT',
  );
  requireExactArray(
    disposition.residual_refs,
    [],
    'SB001_DESTINATION_RESIDUAL_DRIFT',
  );
  requireOnlyKeys(
    disposition.extensions?.local_receiver,
    ['disposition', 'laws', 'supabardo_unresolved_receipt_id'],
    'SB001_DESTINATION_EXTENSION_SMUGGLING',
  );

  requireEqual(exit.kind, 'SB001_EXIT', 'SB001_EXIT_KIND');
  requireEqual(exit.semantic_effect, 'none', 'SB001_EXIT_CREATED_MEANING');
  requireEqual(exit.world_id, 'supabardo:sb001', 'SB001_EXIT_WRONG_WORLD');
  requireEqual(exit.receiver_particular, 'crossing-field:sb001', 'SB001_EXIT_WRONG_PARTICULAR');
  requireEqual(exit.pre_state_ref, unresolved.receipt_id, 'SB001_EXIT_LOST_WAIT');
  requireEqual(exit.post_state_ref, disposition.receipt_id, 'SB001_EXIT_LOST_DESTINATION');
  requireEqual(exit.extensions?.supabardo?.state_before_exit, 'OPEN', 'SB001_EXIT_RETCON_STATE');
  requireEqual(exit.extensions?.supabardo?.terminal_occurrence, 'EXIT', 'SB001_EXIT_NOT_TERMINAL');
  requireEqual(
    exit.extensions?.supabardo?.destination_disposition_receipt_id,
    disposition.receipt_id,
    'SB001_EXIT_WRONG_DESTINATION_RECEIPT',
  );
  requireExactArray(
    exit.extensions?.supabardo?.laws,
    ['EXIT != ADMISSION', 'DESTINATION MEANING REMAINS LOCAL'],
    'SB001_EXIT_LAW_DRIFT',
  );
  requireExactArray(exit.descendant_refs, [], 'SB001_EXIT_DESCENDANT_DRIFT');
  requireExactArray(exit.residual_refs, [], 'SB001_EXIT_RESIDUAL_DRIFT');
  requireOnlyKeys(
    exit.extensions?.supabardo,
    ['state_before_exit', 'terminal_occurrence', 'destination_disposition_receipt_id', 'laws'],
    'SB001_EXIT_EXTENSION_SMUGGLING',
  );

  const sourceKey = crossing.signing?.public_key;
  const releaseKey = release.signing?.public_key;
  const bardoKey = unresolved.signing?.public_key;
  const destinationKey = disposition.signing?.public_key;
  const exitKey = exit.signing?.public_key;

  if (!sameKey(sourceKey, releaseKey)) throw new Error('SB001_RELEASE_IDENTITY_SPLIT');
  if (!sameKey(bardoKey, exitKey)) throw new Error('SB001_BARDO_IDENTITY_SPLIT');
  if (sameKey(sourceKey, bardoKey)) throw new Error('SB001_SOURCE_BARDO_AUTHORITY_COLLAPSE');
  if (sameKey(sourceKey, destinationKey)) throw new Error('SB001_SOURCE_DESTINATION_AUTHORITY_COLLAPSE');
  if (sameKey(bardoKey, destinationKey)) throw new Error('SB001_BARDO_DESTINATION_AUTHORITY_COLLAPSE');

  // Causality is established by signed hash/receipt references above.
  // created_at is signed observation metadata, not an ordering oracle.
  return true;
}

export async function verifyPinnedSb001EvidenceSet(
  bundle: Sb001Bundle,
  manifestValue: unknown,
): Promise<true> {
  await verifySb001Bundle(bundle);
  const manifest = asRecord(manifestValue, 'SB001_INVALID_EVIDENCE_MANIFEST');
  requireEqual(manifest.schema, 'supabardo.sb001-evidence-manifest/v0', 'SB001_EVIDENCE_MANIFEST_SCHEMA');

  const body = buildSb001EvidenceSet(bundle);
  requireEqual(
    JSON.stringify(manifest.body),
    JSON.stringify(body),
    'SB001_EVIDENCE_BODY_MISMATCH',
  );

  const computed = computeSb001EvidenceSetId(bundle);
  requireEqual(manifest.evidence_set_id, computed, 'SB001_EVIDENCE_SET_ID_MISMATCH');
  requireEqual(computed, SB001_PINNED_EVIDENCE_SET_ID, 'SB001_PINNED_EVIDENCE_SET_MISMATCH');
  return true;
}
