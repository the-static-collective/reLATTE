import { createHash } from 'node:crypto';

import { verifyCrossingEnvelope, verifyReceipt } from '../src/index.ts';

export const SB001_PAYLOAD_SHA256 =
  '56376cad6f1c5f9b3bc671876dddeaf8ad63c90b2f162a11383b68561f51a82f';

type AnyRecord = Record<string, any>;

function asRecord(value: unknown, code: string): AnyRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(code);
  }
  return value as AnyRecord;
}

function sameKey(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
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

function time(value: unknown, code: string): number {
  if (typeof value !== 'string') throw new Error(code);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(code);
  return parsed;
}

export interface Sb001Bundle {
  particular_bytes: Uint8Array;
  crossing: unknown;
  release: unknown;
  unresolved: unknown;
  disposition: unknown;
  exit: unknown;
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

  for (const receipt of [release, unresolved, disposition, exit]) {
    requireEqual(receipt.crossing_id, crossing.crossing_id, 'SB001_CROSSING_ID_SPLIT');
  }

  requireEqual(release.kind, 'SB001_RELEASE', 'SB001_RELEASE_KIND');
  requireEqual(release.semantic_effect, 'crossing-released', 'SB001_RELEASE_EFFECT');
  requireEqual(release.world_id, crossing.source_world, 'SB001_RELEASE_WRONG_WORLD');
  requireEqual(release.receiver_particular, crossing.source_particular, 'SB001_RELEASE_WRONG_PARTICULAR');
  requireEqual(release.extensions?.supabardo?.source_bytes_may_remain, true, 'SB001_RELEASE_ERASURE_CONFUSION');
  requireArrayIncludes(
    release.extensions?.supabardo?.laws,
    'RELEASE != ERASURE',
    'SB001_RELEASE_LAW_MISSING',
  );
  requireArrayIncludes(
    release.residual_refs,
    `sha256:${SB001_PAYLOAD_SHA256}`,
    'SB001_RELEASE_LOST_PAYLOAD_REF',
  );

  requireEqual(unresolved.kind, 'SB001_UNRESOLVED_INTERVAL', 'SB001_UNRESOLVED_KIND');
  requireEqual(unresolved.semantic_effect, 'none', 'SB001_BARDO_CREATED_MEANING');
  requireEqual(unresolved.world_id, 'supabardo:sb001', 'SB001_BARDO_WORLD');
  requireEqual(unresolved.receiver_particular, 'crossing-field:sb001', 'SB001_BARDO_PARTICULAR');
  requireEqual(unresolved.pre_state_ref, release.receipt_id, 'SB001_WAIT_BEFORE_RELEASE');
  requireEqual(unresolved.extensions?.supabardo?.state, 'OPEN', 'SB001_WAIT_NOT_OPEN');
  requireEqual(
    unresolved.extensions?.supabardo?.destination_disposition,
    null,
    'SB001_PREMATURE_DESTINATION_MEANING',
  );
  for (const occurrence of ['ENTER', 'FORM', 'WITNESS', 'WAIT']) {
    requireArrayIncludes(
      unresolved.extensions?.supabardo?.occurrence_classes,
      occurrence,
      `SB001_MISSING_${occurrence}`,
    );
  }
  requireArrayExcludes(
    unresolved.extensions?.supabardo?.occurrence_classes,
    'EXIT',
    'SB001_EXIT_BEFORE_DESTINATION',
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

  const crossingAt = time(crossing.created_at, 'SB001_CROSSING_TIME');
  const releaseAt = time(release.created_at, 'SB001_RELEASE_TIME');
  const waitAt = time(unresolved.created_at, 'SB001_WAIT_TIME');
  const dispositionAt = time(disposition.created_at, 'SB001_DISPOSITION_TIME');
  const exitAt = time(exit.created_at, 'SB001_EXIT_TIME');

  if (!(crossingAt < releaseAt && releaseAt < waitAt && waitAt < dispositionAt && dispositionAt < exitAt)) {
    throw new Error('SB001_CAUSAL_ORDER_VIOLATION');
  }

  return true;
}
