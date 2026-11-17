/**
 * HUMKIN-GH-RELATTE-002: cold independent public verification of Workbench's
 * actual GHoT system.hash return, reLATTE signed HOLD and original catalog.
 *
 * Verifies cryptographic receipts and bytes, not the honesty of the executor.
 * GHoT native v0 task receipts are deliberately labeled unsigned.
 */
import { readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { verifyOpaqueOrganCrossing, verifyReceipt, sha256Hex } from '../src/index.ts';
import { verifyPublic } from './humkin-gh-relatte-001.mjs';

const required = (yes, message) => { if (!yes) throw new Error(message); };
const bounded = async path => {
  const info = await stat(path);
  required(info.isFile() && info.size > 0 && info.size <= 110000, 'UNSAFE_RETURN_FILE');
  return readFile(path);
};
const parse = bytes => JSON.parse(bytes.toString('utf8'));
const exactKeys = (obj, keys) => obj !== null && typeof obj === 'object' && !Array.isArray(obj) &&
  JSON.stringify(Object.keys(obj).sort()) === JSON.stringify([...keys].sort());

const EXECUTION_KEYS = [
  'schema', 'source_repository', 'source_revision', 'source_crossing_id',
  'source_hold_receipt_id', 'source_catalog_sha256', 'input', 'capability',
  'ghot_task_id', 'ghot_receipt_id', 'ghot_output_sha256',
  'ghot_node_selected_locally', 'ghot_receipt_signed', 'execution_host',
  'approval', 'radio_gameplay_reward', 'external_effect',
];

export async function verifyReturn(originRoot, returnRoot) {
  const first = await verifyPublic(originRoot);
  const manifest = parse(await bounded(join(originRoot,'source-manifest.json')));
  const executionBytes = await bounded(join(returnRoot,'ghot-execution.json'));
  const execution = parse(executionBytes);
  const signed = parse(await bounded(join(returnRoot,'relatte-return.json')));
  required(exactKeys(execution, EXECUTION_KEYS), 'UNRECOGNIZED_EXECUTION_FIELDS');
  required(
    execution.schema === 'workbench.humkin-verified-catalog-hash/v0' &&
    execution.source_repository === 'the-static-collective/HUMKIN' &&
    execution.source_revision === first.source_revision &&
    execution.source_crossing_id === first.crossing_id &&
    execution.source_hold_receipt_id === first.hold_receipt_id &&
    execution.source_catalog_sha256 === manifest.files['tracks.json'],
    'RETURN_ORIGIN_NOT_BOUND',
  );
  const input = 'humkin-catalog-ghot-v0|' + first.source_revision + '|' +
    first.crossing_id + '|' + manifest.files['tracks.json'];
  required(execution.input === input, 'RETURN_HASH_INPUT_NOT_BOUND');
  required(execution.capability === 'system.hash' &&
    execution.ghot_output_sha256 === createHash('sha256').update(input,'utf8').digest('hex') &&
    typeof execution.ghot_task_id === 'string' &&
    /^task-[a-f0-9-]{36}$/.test(execution.ghot_task_id) &&
    typeof execution.ghot_receipt_id === 'string' &&
    /^receipt-[a-f0-9-]{36}$/.test(execution.ghot_receipt_id) &&
    execution.ghot_node_selected_locally === true &&
    execution.ghot_receipt_signed === false &&
    execution.execution_host === 'ephemeral-github-runner' &&
    execution.approval === 'HASH_PUBLIC_CATALOG' &&
    execution.radio_gameplay_reward === false &&
    execution.external_effect === false,
    'RETURN_CLAIMS_INVALID',
  );
  const crossing = signed.crossing;
  required(signed.schema === 'relatte.opaque-roundtrip-result/v0' &&
    crossing && await verifyOpaqueOrganCrossing(crossing) &&
    await verifyReceipt(signed.receive_receipt) &&
    await verifyReceipt(signed.disposition_receipt),
    'RETURN_SIGNATURE_INVALID');
  required(signed.receive_receipt.kind === 'RECEIVED' &&
    signed.disposition_receipt.kind === 'R3_HOLD' &&
    signed.receive_receipt.semantic_effect === 'none' &&
    signed.disposition_receipt.semantic_effect === 'none' &&
    signed.receive_receipt.crossing_id === crossing.crossing_id &&
    signed.disposition_receipt.crossing_id === crossing.crossing_id &&
    signed.receiver_snapshot?.held?.includes(crossing.crossing_id) === true,
    'RETURN_NOT_HELD',
  );
  const eventHash = sha256Hex(executionBytes);
  required(
    crossing.source_world === 'world:static-workbench:humkin-integration' &&
    crossing.source_particular === 'particular:workbench:ghot-execution:sha256:' + eventHash &&
    crossing.source_history_head === 'sha256:' + manifest.files['tracks.json'] &&
    crossing.payload_refs?.length === 1 &&
    crossing.payload_refs[0].address === 'sha256:' + eventHash &&
    crossing.declared_kind === 'OPAQUE_ORGAN_ARTIFACT' &&
    crossing.requested_effect?.kind === 'candidate-gameplay-discovery' &&
    crossing.requested_effect?.authority === 'humkin-owner-local',
    'RETURN_EVENT_NOT_BOUND',
  );
  const claims = crossing.extensions?.organ_adapter?.donor_claims;
  required(
    claims?.source_crossing_id === first.crossing_id &&
    claims?.source_hold_receipt_id === first.hold_receipt_id &&
    claims?.source_revision === first.source_revision &&
    claims?.ghot_receipt_id === execution.ghot_receipt_id &&
    claims?.ghot_task_id === execution.ghot_task_id &&
    claims?.ghot_execution_output_sha256 === execution.ghot_output_sha256 &&
    claims?.ghot_receipt_signed === false &&
    claims?.human_identity_verified === false &&
    claims?.operator_approved === true &&
    claims?.gameplay_reward_issued === false &&
    claims?.no_external_effect === true,
    'RETURN_DONOR_CLAIMS_MISMATCH',
  );
  return {
    schema: 'relatte.humkin-ghot-independent-witness/v0',
    catalog_revision: first.source_revision,
    original_catalog_hold_receipt_id: first.hold_receipt_id,
    native_ghot_receipt_id: execution.ghot_receipt_id,
    native_ghot_result_sha256: execution.ghot_output_sha256,
    signed_return_crossing_id: crossing.crossing_id,
    signed_return_hold_receipt_id: signed.disposition_receipt.receipt_id,
    native_ghot_receipt_was_unsigned: true,
    cryptographic_return_verified: true,
    physical_action: false,
    gameplay_reward_issued: false,
    status: 'VERIFIED_CANDIDATE_ONLY',
  };
}

async function main() {
  if (process.argv.length !== 5 || process.argv[2] !== 'verify')
    throw new Error('USAGE: verify ORIGINAL_PUBLIC_HOLD WORKBENCH_RETURN');
  const verified = await verifyReturn(process.argv[3], process.argv[4]);
  process.stdout.write(JSON.stringify(verified, null, 2)+'\n');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(e => { process.stderr.write((e?.message || String(e))+'\n'); process.exitCode = 1; });
}
