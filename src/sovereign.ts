import { canonicalizeDomainValue, sha256Hex } from './canonical.ts';
import { LocalReceiver } from './receiver.ts';
import { verifyReceipt } from './protocol.ts';

export const SOVEREIGN_RESPONSE_BUNDLE_DOMAIN = 'reLATTE-SovereignResponseBundle-v0|';

export interface SovereignResponseBundle {
  schema: 'relatte.sovereign-response-bundle/v0';
  bundle_id?: string;
  crossing_id: string;
  world_id: string;
  receiver_particular: string;
  receive_receipt: Record<string, unknown>;
  disposition_receipt: Record<string, unknown>;
  laws: string[];
}

function asRecord(value: unknown, code: string): Record<string, any> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(code);
  return value as Record<string, any>;
}

function nonEmpty(value: unknown, code: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(code);
  return value;
}

function identityBody(bundle: Omit<SovereignResponseBundle, 'bundle_id'>): Omit<SovereignResponseBundle, 'bundle_id'> {
  return {
    schema: 'relatte.sovereign-response-bundle/v0',
    crossing_id: bundle.crossing_id,
    world_id: bundle.world_id,
    receiver_particular: bundle.receiver_particular,
    receive_receipt: bundle.receive_receipt,
    disposition_receipt: bundle.disposition_receipt,
    laws: [...bundle.laws],
  };
}

export function computeSovereignResponseBundleId(
  bundle: Omit<SovereignResponseBundle, 'bundle_id'>,
): string {
  return `relatte-sovereign-response-v0:${sha256Hex(
    canonicalizeDomainValue(SOVEREIGN_RESPONSE_BUNDLE_DOMAIN, identityBody(bundle)),
  )}`;
}

export function buildSovereignResponseBundle(
  receiver: LocalReceiver,
  crossingId: string,
): SovereignResponseBundle {
  const receiveReceipt = receiver.getReceiveReceipt(crossingId);
  const dispositionReceipt = receiver.getDispositionReceipt(crossingId);

  if (!receiveReceipt) throw new Error('SOVEREIGN_RESPONSE_MISSING_RECEIVE');
  if (!dispositionReceipt) throw new Error('SOVEREIGN_RESPONSE_MISSING_DISPOSITION');

  const body: Omit<SovereignResponseBundle, 'bundle_id'> = {
    schema: 'relatte.sovereign-response-bundle/v0',
    crossing_id: nonEmpty(crossingId, 'INVALID_SOVEREIGN_CROSSING_ID'),
    world_id: receiver.config.world_id,
    receiver_particular: receiver.config.receiver_particular,
    receive_receipt: receiveReceipt,
    disposition_receipt: dispositionReceipt,
    laws: [
      'BUNDLE != RECEIPT',
      'RESPONSE != SHARED DATABASE',
      'VERIFICATION != AGREEMENT',
    ],
  };

  return {
    ...body,
    bundle_id: computeSovereignResponseBundleId(body),
  };
}

export async function verifySovereignResponseBundle(
  value: unknown,
  expectedCrossingId?: string,
): Promise<boolean> {
  try {
    const bundle = asRecord(value, 'INVALID_SOVEREIGN_RESPONSE_BUNDLE');
    if (bundle.schema !== 'relatte.sovereign-response-bundle/v0') return false;

    const crossingId = nonEmpty(bundle.crossing_id, 'INVALID_SOVEREIGN_CROSSING_ID');
    const worldId = nonEmpty(bundle.world_id, 'INVALID_SOVEREIGN_WORLD_ID');
    const receiverParticular = nonEmpty(bundle.receiver_particular, 'INVALID_SOVEREIGN_RECEIVER');
    if (expectedCrossingId && crossingId !== expectedCrossingId) return false;

    const receiveReceipt = asRecord(bundle.receive_receipt, 'INVALID_SOVEREIGN_RECEIVE_RECEIPT');
    const dispositionReceipt = asRecord(bundle.disposition_receipt, 'INVALID_SOVEREIGN_DISPOSITION_RECEIPT');

    if (!(await verifyReceipt(receiveReceipt))) return false;
    if (!(await verifyReceipt(dispositionReceipt))) return false;

    if (receiveReceipt.crossing_id !== crossingId || dispositionReceipt.crossing_id !== crossingId) return false;
    if (receiveReceipt.world_id !== worldId || dispositionReceipt.world_id !== worldId) return false;
    if (
      receiveReceipt.receiver_particular !== receiverParticular ||
      dispositionReceipt.receiver_particular !== receiverParticular
    ) return false;
    if (receiveReceipt.kind !== 'RECEIVED') return false;
    if (typeof dispositionReceipt.kind !== 'string' || !dispositionReceipt.kind.startsWith('R3_')) return false;

    const dispositionExtensions = asRecord(
      dispositionReceipt.extensions,
      'INVALID_SOVEREIGN_DISPOSITION_EXTENSIONS',
    );
    const localReceiver = asRecord(
      dispositionExtensions.local_receiver,
      'INVALID_SOVEREIGN_LOCAL_RECEIVER_EXTENSION',
    );
    if (localReceiver.receive_receipt_id !== receiveReceipt.receipt_id) return false;

    const body: Omit<SovereignResponseBundle, 'bundle_id'> = {
      schema: 'relatte.sovereign-response-bundle/v0',
      crossing_id: crossingId,
      world_id: worldId,
      receiver_particular: receiverParticular,
      receive_receipt: receiveReceipt,
      disposition_receipt: dispositionReceipt,
      laws: Array.isArray(bundle.laws) ? [...bundle.laws] : [],
    };
    if (
      typeof bundle.bundle_id !== 'string' ||
      bundle.bundle_id !== computeSovereignResponseBundleId(body)
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

export function summarizeSovereignResponse(value: unknown): {
  crossing_id: string;
  world_id: string;
  disposition: string;
  semantic_effect: string;
  receipt_id: string;
} {
  const bundle = asRecord(value, 'INVALID_SOVEREIGN_RESPONSE_BUNDLE');
  const disposition = asRecord(bundle.disposition_receipt, 'INVALID_SOVEREIGN_DISPOSITION_RECEIPT');

  return {
    crossing_id: nonEmpty(bundle.crossing_id, 'INVALID_SOVEREIGN_CROSSING_ID'),
    world_id: nonEmpty(bundle.world_id, 'INVALID_SOVEREIGN_WORLD_ID'),
    disposition: nonEmpty(disposition.kind, 'INVALID_SOVEREIGN_DISPOSITION_KIND'),
    semantic_effect: nonEmpty(disposition.semantic_effect, 'INVALID_SOVEREIGN_SEMANTIC_EFFECT'),
    receipt_id: nonEmpty(disposition.receipt_id, 'INVALID_SOVEREIGN_RECEIPT_ID'),
  };
}
