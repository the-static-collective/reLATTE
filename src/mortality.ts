import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  canonicalize,
  canonicalizeDomainValue,
  sha256Hex,
  validateTimestamp,
} from './canonical.ts';
import {
  verifyReceiptSetAgainstReceipts,
  verifyReceiptSetCommitmentShape,
} from './checkpoint.ts';
import { MirrorStore, verifyMirrorServeBundle } from './mirror.ts';
import { verifyReceipt } from './protocol.ts';
import { LocalReceiver } from './receiver.ts';

export const SUCCESSION_CAPSULE_ID_DOMAIN = 'reLATTE-SuccessionCapsule-v0|';

export interface SuccessionCapsule {
  schema: 'relatte.succession-capsule/v0';
  capsule_id?: string;
  predecessor_world_id: string;
  predecessor_receiver_particular: string;
  mortality_seed_receipt: Record<string, any>;
  historical_receipts: Record<string, any>[];
  checkpoint_commitment: Record<string, any>;
  recoverable_crossing_ids: string[];
  created_at: string;
  laws: string[];
}

function asRecord(value: unknown, code: string): Record<string, any> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(code);
  }
  return value as Record<string, any>;
}

function nonEmpty(value: unknown, code: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(code);
  return value;
}

function stringArray(value: unknown, code: string): string[] {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== 'string' || entry.trim() === '')
  ) {
    throw new Error(code);
  }
  return [...value];
}

function publicKeyIdentity(value: unknown): string {
  const record = asRecord(value, 'INVALID_PUBLIC_KEY');
  return canonicalize({
    kty: record.kty,
    crv: record.crv,
    x: record.x,
    y: record.y,
  });
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function capsuleIdentityBody(
  value: Omit<SuccessionCapsule, 'capsule_id'>,
): Omit<SuccessionCapsule, 'capsule_id'> {
  return {
    schema: 'relatte.succession-capsule/v0',
    predecessor_world_id: value.predecessor_world_id,
    predecessor_receiver_particular: value.predecessor_receiver_particular,
    mortality_seed_receipt: value.mortality_seed_receipt,
    historical_receipts: value.historical_receipts,
    checkpoint_commitment: value.checkpoint_commitment,
    recoverable_crossing_ids: [...value.recoverable_crossing_ids],
    created_at: value.created_at,
    laws: [...value.laws],
  };
}

export async function createSuccessionCapsule(args: {
  mortality_seed_receipt: unknown;
  historical_receipts: unknown[];
  checkpoint_commitment: unknown;
  created_at: string;
}): Promise<SuccessionCapsule> {
  if (!(await verifyReceipt(args.mortality_seed_receipt))) {
    throw new Error('INVALID_MORTALITY_SEED_RECEIPT');
  }
  if (!verifyReceiptSetCommitmentShape(args.checkpoint_commitment)) {
    throw new Error('INVALID_MORTALITY_CHECKPOINT');
  }
  validateTimestamp(args.created_at);

  const seed = asRecord(
    args.mortality_seed_receipt,
    'INVALID_MORTALITY_SEED_RECEIPT',
  );
  if (seed.kind !== 'R12_MORTALITY_SEED' || seed.semantic_effect !== 'none') {
    throw new Error('INVALID_MORTALITY_SEED_KIND');
  }

  const extensions = asRecord(
    seed.extensions,
    'INVALID_MORTALITY_SEED_EXTENSIONS',
  );
  const mortality = asRecord(
    extensions.mortality,
    'INVALID_MORTALITY_SEED_EXTENSIONS',
  );
  if (
    mortality.successor_policy !== 'fresh-identity-required' ||
    mortality.predecessor_world_id !== seed.world_id ||
    mortality.predecessor_receiver_particular !== seed.receiver_particular
  ) {
    throw new Error('INVALID_MORTALITY_SEED_POLICY');
  }

  const commitment = asRecord(
    args.checkpoint_commitment,
    'INVALID_MORTALITY_CHECKPOINT',
  );
  if (
    mortality.checkpoint_commitment_id !== commitment.commitment_id ||
    mortality.checkpoint_receipt_set_root !== commitment.receipt_set_root ||
    commitment.world_id !== seed.world_id ||
    commitment.local_history_head !== mortality.predecessor_history_head
  ) {
    throw new Error('MORTALITY_CHECKPOINT_MISMATCH');
  }

  if (
    !(await verifyReceiptSetAgainstReceipts(
      commitment,
      args.historical_receipts,
    ))
  ) {
    throw new Error('INVALID_MORTALITY_HISTORICAL_RECEIPTS');
  }

  const historicalReceipts = args.historical_receipts.map((value) =>
    asRecord(value, 'INVALID_MORTALITY_HISTORICAL_RECEIPT')
  );
  const predecessorKey = publicKeyIdentity(seed.signing.public_key);
  for (const receipt of historicalReceipts) {
    if (
      receipt.world_id !== seed.world_id ||
      receipt.receiver_particular !== seed.receiver_particular
    ) {
      throw new Error('MORTALITY_HISTORY_PREDECESSOR_MISMATCH');
    }
    if (publicKeyIdentity(receipt.signing.public_key) !== predecessorKey) {
      throw new Error('MORTALITY_HISTORY_KEY_MISMATCH');
    }
  }

  const recoverable = stringArray(
    mortality.recoverable_crossing_ids,
    'INVALID_MORTALITY_RECOVERABLE_CROSSINGS',
  ).sort();
  if (recoverable.length === 0 || new Set(recoverable).size !== recoverable.length) {
    throw new Error('INVALID_MORTALITY_RECOVERABLE_CROSSINGS');
  }
  for (const crossingId of recoverable) {
    const hasReceive = historicalReceipts.some(
      (receipt) => receipt.kind === 'RECEIVED' && receipt.crossing_id === crossingId,
    );
    if (!hasReceive) throw new Error('MORTALITY_RECOVERABLE_CROSSING_NOT_RECEIVED');
  }

  const body: Omit<SuccessionCapsule, 'capsule_id'> = {
    schema: 'relatte.succession-capsule/v0',
    predecessor_world_id: nonEmpty(
      seed.world_id,
      'INVALID_MORTALITY_PREDECESSOR_WORLD',
    ),
    predecessor_receiver_particular: nonEmpty(
      seed.receiver_particular,
      'INVALID_MORTALITY_PREDECESSOR_PARTICULAR',
    ),
    mortality_seed_receipt: seed,
    historical_receipts: historicalReceipts,
    checkpoint_commitment: commitment,
    recoverable_crossing_ids: recoverable,
    created_at: args.created_at,
    laws: [
      'SUCCESSOR != PREDECESSOR',
      'RECONSTITUTION != RESURRECTION',
      'HISTORICAL RECEIPT != SUCCESSOR RECEIPT',
      'SURVIVING ARTIFACT != INHERITED AUTHORITY',
    ],
  };

  return {
    ...body,
    capsule_id: `relatte-succession-capsule-v0:${sha256Hex(
      canonicalizeDomainValue(
        SUCCESSION_CAPSULE_ID_DOMAIN,
        capsuleIdentityBody(body),
      ),
    )}`,
  };
}

export async function verifySuccessionCapsule(value: unknown): Promise<boolean> {
  try {
    const capsule = asRecord(value, 'INVALID_SUCCESSION_CAPSULE');
    if (capsule.schema !== 'relatte.succession-capsule/v0') return false;
    validateTimestamp(capsule.created_at);

    const rebuilt = await createSuccessionCapsule({
      mortality_seed_receipt: capsule.mortality_seed_receipt,
      historical_receipts: capsule.historical_receipts,
      checkpoint_commitment: capsule.checkpoint_commitment,
      created_at: capsule.created_at,
    });

    return (
      capsule.predecessor_world_id === rebuilt.predecessor_world_id &&
      capsule.predecessor_receiver_particular ===
        rebuilt.predecessor_receiver_particular &&
      Array.isArray(capsule.recoverable_crossing_ids) &&
      capsule.recoverable_crossing_ids.join('\n') ===
        rebuilt.recoverable_crossing_ids.join('\n') &&
      typeof capsule.capsule_id === 'string' &&
      capsule.capsule_id === rebuilt.capsule_id
    );
  } catch {
    return false;
  }
}

export async function storeSuccessionCapsule(
  root: string,
  capsuleValue: unknown,
): Promise<void> {
  if (!(await verifySuccessionCapsule(capsuleValue))) {
    throw new Error('INVALID_SUCCESSION_CAPSULE');
  }
  if (await pathExists(root)) throw new Error('SUCCESSION_ARCHIVE_ROOT_EXISTS');
  await mkdir(root, { recursive: true });
  await writeFile(
    join(root, 'succession-capsule.json'),
    JSON.stringify(capsuleValue, null, 2) + '\n',
    'utf8',
  );
}

export async function readSuccessionCapsule(
  root: string,
): Promise<SuccessionCapsule> {
  const capsule = JSON.parse(
    await readFile(join(root, 'succession-capsule.json'), 'utf8'),
  );
  if (!(await verifySuccessionCapsule(capsule))) {
    throw new Error('INVALID_SUCCESSION_CAPSULE');
  }
  return capsule as SuccessionCapsule;
}

export async function reconstituteSuccessor(args: {
  successor_root: string;
  successor_world_id: string;
  successor_receiver_particular: string;
  successor_contract_ref: string;
  capsule: unknown;
  mirror: MirrorStore;
  served_at: string;
  received_at: string;
  accepted_at: string;
}): Promise<{
  receiver: LocalReceiver;
  acceptance_receipt: Record<string, any>;
  receive_receipts: Record<string, any>[];
  served_bundles: Record<string, any>[];
}> {
  if (!(await verifySuccessionCapsule(args.capsule))) {
    throw new Error('INVALID_SUCCESSION_CAPSULE');
  }

  const capsule = args.capsule as SuccessionCapsule;
  if (
    args.successor_world_id === capsule.predecessor_world_id ||
    args.successor_receiver_particular ===
      capsule.predecessor_receiver_particular
  ) {
    throw new Error('SUCCESSOR_IDENTITY_MUST_BE_FRESH');
  }

  const successor = await LocalReceiver.create(args.successor_root, {
    world_id: nonEmpty(args.successor_world_id, 'INVALID_SUCCESSOR_WORLD'),
    receiver_particular: nonEmpty(
      args.successor_receiver_particular,
      'INVALID_SUCCESSOR_PARTICULAR',
    ),
    contract_ref: nonEmpty(
      args.successor_contract_ref,
      'INVALID_SUCCESSOR_CONTRACT',
    ),
  });

  const receiveReceipts: Record<string, any>[] = [];
  const servedBundles: Record<string, any>[] = [];

  for (const crossingId of capsule.recoverable_crossing_ids) {
    const served = await args.mirror.serve(crossingId, args.served_at);
    if (!(await verifyMirrorServeBundle(served, crossingId))) {
      throw new Error('INVALID_SUCCESSOR_MIRROR_SERVE');
    }
    servedBundles.push(served as unknown as Record<string, any>);
    receiveReceipts.push(
      await successor.receive(served.crossing, args.received_at),
    );
  }

  if (receiveReceipts.length === 0) {
    throw new Error('SUCCESSOR_HAS_NO_RECOVERABLE_ARTIFACTS');
  }

  const seed = asRecord(
    capsule.mortality_seed_receipt,
    'INVALID_MORTALITY_SEED_RECEIPT',
  );
  const acceptance = await successor.acceptSuccession({
    anchor_crossing_id: capsule.recoverable_crossing_ids[0],
    predecessor_seed_receipt: seed,
    created_at: args.accepted_at,
  });

  if (
    publicKeyIdentity(acceptance.signing.public_key) ===
    publicKeyIdentity(seed.signing.public_key)
  ) {
    throw new Error('SUCCESSOR_REUSED_PREDECESSOR_KEY');
  }

  return {
    receiver: successor,
    acceptance_receipt: acceptance,
    receive_receipts: receiveReceipts,
    served_bundles: servedBundles,
  };
}
