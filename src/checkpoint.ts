import { execFile } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

import {
  canonicalize,
  canonicalizeDomainValue,
  sha256Hex,
  validateTimestamp,
} from './canonical.ts';
import { verifyReceipt } from './protocol.ts';

const execFileAsync = promisify(execFile);

export const RECEIPT_SET_ROOT_DOMAIN = 'reLATTE-ReceiptSetRoot-v0|';
export const FOREIGN_CHECKPOINT_ID_DOMAIN = 'reLATTE-ForeignCheckpoint-v0|';

export interface ReceiptSetCommitment {
  schema: 'relatte.receipt-set-commitment/v0';
  commitment_id?: string;
  world_id: string;
  local_history_head: string | null;
  receipt_ids: string[];
  receipt_count: number;
  receipt_set_root: string;
  created_at: string;
  laws: string[];
}

export interface GitCheckpointWitness {
  schema: 'relatte.git-checkpoint-witness/v0';
  checkpoint_id?: string;
  witness_kind: 'git';
  receipt_set_root: string;
  commitment_id: string;
  commit_sha: string;
  object_path: string;
  object_sha256: string;
  witnessed_at: string;
  semantic_effect: 'none';
  authority: null;
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

function commitmentIdentityBody(
  value: Omit<ReceiptSetCommitment, 'commitment_id'>,
): Omit<ReceiptSetCommitment, 'commitment_id'> {
  return {
    schema: 'relatte.receipt-set-commitment/v0',
    world_id: value.world_id,
    local_history_head: value.local_history_head,
    receipt_ids: [...value.receipt_ids],
    receipt_count: value.receipt_count,
    receipt_set_root: value.receipt_set_root,
    created_at: value.created_at,
    laws: [...value.laws],
  };
}

function computeReceiptSetRoot(
  worldId: string,
  localHistoryHead: string | null,
  receiptIds: string[],
): string {
  return `relatte-receipt-set-v0:${sha256Hex(
    canonicalizeDomainValue(RECEIPT_SET_ROOT_DOMAIN, {
      world_id: worldId,
      local_history_head: localHistoryHead,
      receipt_ids: receiptIds,
    }),
  )}`;
}

export async function createReceiptSetCommitment(args: {
  world_id: string;
  local_history_head: string | null;
  receipts: unknown[];
  created_at: string;
}): Promise<ReceiptSetCommitment> {
  const worldId = nonEmpty(args.world_id, 'INVALID_CHECKPOINT_WORLD');
  validateTimestamp(args.created_at);

  const receiptIds: string[] = [];
  const seen = new Set<string>();

  for (const value of args.receipts) {
    if (!(await verifyReceipt(value))) throw new Error('INVALID_CHECKPOINT_RECEIPT');
    const receipt = asRecord(value, 'INVALID_CHECKPOINT_RECEIPT');
    if (receipt.world_id !== worldId) {
      throw new Error('CHECKPOINT_RECEIPT_WORLD_MISMATCH');
    }
    const receiptId = nonEmpty(
      receipt.receipt_id,
      'INVALID_CHECKPOINT_RECEIPT_ID',
    );
    if (seen.has(receiptId)) throw new Error('DUPLICATE_CHECKPOINT_RECEIPT');
    seen.add(receiptId);
    receiptIds.push(receiptId);
  }

  receiptIds.sort();

  const root = computeReceiptSetRoot(
    worldId,
    args.local_history_head,
    receiptIds,
  );

  const body: Omit<ReceiptSetCommitment, 'commitment_id'> = {
    schema: 'relatte.receipt-set-commitment/v0',
    world_id: worldId,
    local_history_head: args.local_history_head,
    receipt_ids: receiptIds,
    receipt_count: receiptIds.length,
    receipt_set_root: root,
    created_at: args.created_at,
    laws: [
      'COMMITMENT != HISTORY',
      'ROOT != RECEIPT',
      'CHECKPOINT != AUTHORITY',
      'FOREIGN WITNESS != GLOBAL CANON',
    ],
  };

  return {
    ...body,
    commitment_id: `relatte-receipt-set-commitment-v0:${sha256Hex(
      canonicalizeDomainValue(
        RECEIPT_SET_ROOT_DOMAIN,
        commitmentIdentityBody(body),
      ),
    )}`,
  };
}

export function verifyReceiptSetCommitmentShape(value: unknown): boolean {
  try {
    const commitment = asRecord(value, 'INVALID_RECEIPT_SET_COMMITMENT');
    if (commitment.schema !== 'relatte.receipt-set-commitment/v0') return false;
    validateTimestamp(commitment.created_at);

    const receiptIds = stringArray(
      commitment.receipt_ids,
      'INVALID_CHECKPOINT_RECEIPT_IDS',
    );
    if (
      new Set(receiptIds).size !== receiptIds.length ||
      [...receiptIds].sort().join('\n') !== receiptIds.join('\n')
    ) {
      return false;
    }

    if (commitment.receipt_count !== receiptIds.length) return false;

    const worldId = nonEmpty(
      commitment.world_id,
      'INVALID_CHECKPOINT_WORLD',
    );
    const historyHead =
      commitment.local_history_head === null
        ? null
        : nonEmpty(
            commitment.local_history_head,
            'INVALID_CHECKPOINT_HISTORY_HEAD',
          );

    const expectedRoot = computeReceiptSetRoot(
      worldId,
      historyHead,
      receiptIds,
    );
    if (commitment.receipt_set_root !== expectedRoot) return false;

    const body: Omit<ReceiptSetCommitment, 'commitment_id'> = {
      schema: 'relatte.receipt-set-commitment/v0',
      world_id: worldId,
      local_history_head: historyHead,
      receipt_ids: receiptIds,
      receipt_count: receiptIds.length,
      receipt_set_root: expectedRoot,
      created_at: commitment.created_at,
      laws: stringArray(commitment.laws, 'INVALID_CHECKPOINT_LAWS'),
    };

    return (
      typeof commitment.commitment_id === 'string' &&
      commitment.commitment_id ===
        `relatte-receipt-set-commitment-v0:${sha256Hex(
          canonicalizeDomainValue(
            RECEIPT_SET_ROOT_DOMAIN,
            commitmentIdentityBody(body),
          ),
        )}`
    );
  } catch {
    return false;
  }
}

export async function verifyReceiptSetAgainstReceipts(
  commitmentValue: unknown,
  receipts: unknown[],
): Promise<boolean> {
  try {
    if (!verifyReceiptSetCommitmentShape(commitmentValue)) return false;
    const commitment = asRecord(
      commitmentValue,
      'INVALID_RECEIPT_SET_COMMITMENT',
    );

    const rebuilt = await createReceiptSetCommitment({
      world_id: commitment.world_id,
      local_history_head: commitment.local_history_head,
      receipts,
      created_at: commitment.created_at,
    });

    return (
      rebuilt.receipt_set_root === commitment.receipt_set_root &&
      rebuilt.commitment_id === commitment.commitment_id
    );
  } catch {
    return false;
  }
}

function witnessIdentityBody(
  value: Omit<GitCheckpointWitness, 'checkpoint_id'>,
): Omit<GitCheckpointWitness, 'checkpoint_id'> {
  return {
    schema: 'relatte.git-checkpoint-witness/v0',
    witness_kind: 'git',
    receipt_set_root: value.receipt_set_root,
    commitment_id: value.commitment_id,
    commit_sha: value.commit_sha,
    object_path: value.object_path,
    object_sha256: value.object_sha256,
    witnessed_at: value.witnessed_at,
    semantic_effect: 'none',
    authority: null,
    laws: [...value.laws],
  };
}

function checkpointObjectPath(receiptSetRoot: string): string {
  return join(
    'checkpoints',
    `${sha256Hex(Buffer.from(receiptSetRoot, 'utf8'))}.json`,
  ).replaceAll('\\', '/');
}

async function git(
  repoPath: string,
  args: string[],
  env?: Record<string, string>,
): Promise<string> {
  const result = await execFileAsync('git', ['-C', repoPath, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      ...env,
    },
  });
  return result.stdout.trim();
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function initializeGitCheckpointWitness(repoPath: string): Promise<void> {
  if (await pathExists(repoPath)) throw new Error('CHECKPOINT_WITNESS_ROOT_EXISTS');
  await mkdir(repoPath, { recursive: true });
  await execFileAsync('git', ['init', '--quiet', repoPath], {
    encoding: 'utf8',
  });
  await git(repoPath, ['config', 'user.name', 'reLATTE Foreign Witness']);
  await git(repoPath, ['config', 'user.email', 'foreign-witness@relatte.invalid']);
}

export async function commitReceiptSetToGit(args: {
  repo_path: string;
  commitment: unknown;
  witnessed_at: string;
}): Promise<GitCheckpointWitness> {
  if (!verifyReceiptSetCommitmentShape(args.commitment)) {
    throw new Error('INVALID_CHECKPOINT_COMMITMENT');
  }
  validateTimestamp(args.witnessed_at);

  const commitment = asRecord(
    args.commitment,
    'INVALID_CHECKPOINT_COMMITMENT',
  );
  const objectPath = checkpointObjectPath(commitment.receipt_set_root);
  const absolutePath = join(args.repo_path, objectPath);
  await mkdir(dirname(absolutePath), { recursive: true });

  const canonicalObject = canonicalize(commitment);
  await writeFile(absolutePath, canonicalObject + '\n', 'utf8');

  await git(args.repo_path, ['add', '--', objectPath]);
  await git(
    args.repo_path,
    [
      'commit',
      '--quiet',
      '--no-gpg-sign',
      '-m',
      `checkpoint ${commitment.receipt_set_root}`,
      '--',
      objectPath,
    ],
    {
      GIT_AUTHOR_DATE: args.witnessed_at,
      GIT_COMMITTER_DATE: args.witnessed_at,
    },
  );

  const commitSha = await git(args.repo_path, ['rev-parse', 'HEAD']);
  const objectSha256 = sha256Hex(Buffer.from(canonicalObject, 'utf8'));

  const body: Omit<GitCheckpointWitness, 'checkpoint_id'> = {
    schema: 'relatte.git-checkpoint-witness/v0',
    witness_kind: 'git',
    receipt_set_root: commitment.receipt_set_root,
    commitment_id: commitment.commitment_id,
    commit_sha: commitSha,
    object_path: objectPath,
    object_sha256: objectSha256,
    witnessed_at: args.witnessed_at,
    semantic_effect: 'none',
    authority: null,
    laws: [
      'CHECKPOINT != HISTORY',
      'GIT COMMIT != GLOBAL CANON',
      'FOREIGN WITNESS != LOCAL AUTHORITY',
      'CHECKPOINT AVAILABILITY != LOCAL LIVENESS',
    ],
  };

  return {
    ...body,
    checkpoint_id: `relatte-foreign-checkpoint-v0:${sha256Hex(
      canonicalizeDomainValue(
        FOREIGN_CHECKPOINT_ID_DOMAIN,
        witnessIdentityBody(body),
      ),
    )}`,
  };
}

export async function verifyGitCheckpointWitness(args: {
  repo_path: string;
  commitment: unknown;
  witness: unknown;
}): Promise<boolean> {
  try {
    if (!verifyReceiptSetCommitmentShape(args.commitment)) return false;

    const commitment = asRecord(
      args.commitment,
      'INVALID_CHECKPOINT_COMMITMENT',
    );
    const witness = asRecord(args.witness, 'INVALID_GIT_CHECKPOINT_WITNESS');

    if (
      witness.schema !== 'relatte.git-checkpoint-witness/v0' ||
      witness.witness_kind !== 'git' ||
      witness.semantic_effect !== 'none' ||
      witness.authority !== null ||
      witness.receipt_set_root !== commitment.receipt_set_root ||
      witness.commitment_id !== commitment.commitment_id
    ) {
      return false;
    }

    validateTimestamp(witness.witnessed_at);
    const commitSha = nonEmpty(
      witness.commit_sha,
      'INVALID_GIT_CHECKPOINT_SHA',
    );
    const objectPath = nonEmpty(
      witness.object_path,
      'INVALID_GIT_CHECKPOINT_PATH',
    );

    const shown = await git(
      args.repo_path,
      ['show', `${commitSha}:${objectPath}`],
    );
    const canonicalObject = canonicalize(
      JSON.parse(shown),
    );
    if (canonicalObject !== canonicalize(commitment)) return false;
    if (
      witness.object_sha256 !==
      sha256Hex(Buffer.from(canonicalObject, 'utf8'))
    ) {
      return false;
    }

    const body: Omit<GitCheckpointWitness, 'checkpoint_id'> = {
      schema: 'relatte.git-checkpoint-witness/v0',
      witness_kind: 'git',
      receipt_set_root: witness.receipt_set_root,
      commitment_id: witness.commitment_id,
      commit_sha: commitSha,
      object_path: objectPath,
      object_sha256: witness.object_sha256,
      witnessed_at: witness.witnessed_at,
      semantic_effect: 'none',
      authority: null,
      laws: stringArray(witness.laws, 'INVALID_GIT_CHECKPOINT_LAWS'),
    };

    return (
      typeof witness.checkpoint_id === 'string' &&
      witness.checkpoint_id ===
        `relatte-foreign-checkpoint-v0:${sha256Hex(
          canonicalizeDomainValue(
            FOREIGN_CHECKPOINT_ID_DOMAIN,
            witnessIdentityBody(body),
          ),
        )}`
    );
  } catch {
    return false;
  }
}

export async function readCommittedCheckpointObject(args: {
  repo_path: string;
  witness: unknown;
}): Promise<Record<string, any>> {
  const witness = asRecord(args.witness, 'INVALID_GIT_CHECKPOINT_WITNESS');
  const shown = await git(
    args.repo_path,
    [
      'show',
      `${nonEmpty(witness.commit_sha, 'INVALID_GIT_CHECKPOINT_SHA')}:${nonEmpty(
        witness.object_path,
        'INVALID_GIT_CHECKPOINT_PATH',
      )}`,
    ],
  );
  return asRecord(JSON.parse(shown), 'INVALID_GIT_CHECKPOINT_OBJECT');
}
