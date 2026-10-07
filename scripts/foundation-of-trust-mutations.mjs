/** Mutate real code in disposable copies, require assertion failures (not parse
 * or dependency failures), preserve a report naming the invariant's killer.
 */
import { mkdtemp, cp, symlink, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = new URL('..', import.meta.url).pathname;
const mutants = [
  { id: 'COUNT_SAME_KEY_TWICE', file: 'src/two-witness.ts', before: 'if (sourceKey === receiverKey)', after: 'if (false)', test: 'frozen baseline same-key metadata' },
  { id: 'POINTER_IMPLIES_CONTINUITY', file: 'src/foundation-of-trust.ts', before: 'const adjacency = new Map<string, string[]>();', after: "return { status: 'VERIFIED', same_particular: true, reasons: ['MUTANT'], authority: 'UNOBSERVED' };\n  const adjacency = new Map<string, string[]>();", test: 'pointer forgery has no consequential path' },
  { id: 'ANCESTOR_DONATES_AUTHORITY', file: 'src/particularity.ts', before: 'return grant.subject.id === args.particular_id;', after: 'return true;', test: 'byte-identical cloned seeds' },
  { id: 'IGNORE_MISSING_SIGNED_EDGE', file: 'src/foundation-of-trust.ts', before: 'if (!result.historically_verified) continue;', after: 'if (false) continue;', test: 'A to B to C survives every surface' },
  { id: 'IGNORE_REPLAY_CROSSING', file: 'src/two-witness.ts', before: 'if (receipt.crossing_id !== crossing.crossing_id)', after: 'if (false)', test: 'receipt replay changes only causal crossing' },
  { id: 'IGNORE_PAYLOAD_BINDING', file: 'src/two-witness.ts', before: 'receiptBinding?.thing_ref !== binding.thing_ref', after: 'false', test: 'only payload substitution HOLD' },
  { id: 'TRUST_VERIFIER_OUTPUT', file: 'src/foundation-of-trust.ts', before: 'const { bundle, roots } = args;', after: "const { bundle, roots } = args;\n    if ((bundle as any).assessment) return { ...out, status: 'VERIFIED' };", test: 'lying verifier output is rejected' },
  { id: 'IGNORE_SOURCE_EQUIVOCATION', file: 'src/foundation-of-trust.ts', before: 'if (new Set(sourceClaims.map(account)).size > 1)', after: 'if (false)', test: 'SOURCE equivocation remains reconstructible' },
  { id: 'IGNORE_RECEIVER_EQUIVOCATION', file: 'src/foundation-of-trust.ts', before: 'if (new Set(sameKey.map(receiptAccount)).size > 1)', after: 'if (false)', test: 'RECEIVER equivocation remains reconstructible' },
  { id: 'WITHHOLD_EVIDENCE_UPGRADES_TRUST', file: 'src/foundation-of-trust.ts', before: 'if (inventory.record_ids.some((id: string) => !ids.includes(id)))', after: 'if (false)', test: 'every deletion subset of a frozen scope' },
  { id: 'IGNORE_EVENT_POLICY_VERSION', file: 'src/foundation-of-trust.ts', before: "if (foundation.policy_id !== roots.policy_id) return reject('EVENT_POLICY_MISMATCH');", after: '// MUTANT: ignore pinned event policy', test: 'threshold cannot retroactively change' },
  { id: 'IGNORE_ROLE_MEMBERSHIP', file: 'src/foundation-of-trust.ts', before: "if (!member(target, 'SOURCE')) return reject('UNAUTHORIZED_SOURCE_ROLE');", after: '// MUTANT: allow arbitrary source key', test: 'unauthorized key stays HOLD' },
  { id: 'COUNT_DUPLICATE_SIGNER', file: 'src/foundation-of-trust.ts', before: "if (keys.has(signingKeyIdentity(receipt))) return reject('DUPLICATE_SIGNER');", after: "keys.add('mutant-count:' + receipt.receipt_id);", test: 'one key cannot count twice' },
  { id: 'ACCEPT_RETIRED_KEYS', file: 'src/foundation-of-trust.ts', before: '&& !retired;', after: ';', test: 'historical replay after revocation' },
  { id: 'IGNORE_SELECTED_POLICY_PIN', file: 'src/foundation-of-trust.ts', before: 'bundle.policy.receipt_id !== roots.policy_id', after: 'false', test: 'policy signer compromise cannot change' },
  { id: 'ERASE_DUPLICATE_JSON_NAMES', file: 'src/evidence-json.ts', before: "fail(!keys.has(key), 'DUPLICATE_JSON_KEY');", after: '// MUTANT: silently erase duplicate names\n        ', test: 'duplicate JSON keys fail at parser boundary' },
  { id: 'ALLOW_SIGNED_ACCESSORS', file: 'src/canonical.ts', before: "if (descriptor.get || descriptor.set) throw new Error('ACCESSOR_PROPERTY');", after: '// MUTANT: allow dynamic accessors', test: 'accessor changes identity or fails verification' },
  { id: 'TRUST_UNSIGNED_RUNNER_METADATA', file: 'scripts/two-witness-custody-002.mjs', before: "validate(canonicalize(receiver.receiver_job) === canonicalize(receiver.receipt.extensions?.custody_002?.job ?? null), 'UNSIGNED_RECEIVER_JOB_METADATA');", after: '// MUTANT: trust unsigned wrapper job', test: 'unsigned-metadata fails loudly', test_file: 'test/fatherhand-hostile.test.ts' },
  { id: 'PROMOTE_KEYS_TO_MACHINES', file: 'src/foundation-of-trust.ts', before: "distinct_machine: 'UNOBSERVED'", after: "distinct_machine: 'OBSERVED'", test: 'two genuine keys under one custodian' },
  { id: 'INFER_MISSING_NAME_PATH', file: 'src/particularity.ts', before: 'if (args.from_surface_id === args.to_surface_id) return true;', after: 'return true;', test: 'provisional name surfaces mutate independently' },
  { id: 'ACCEPT_CIRCULAR_TRUST', file: 'src/foundation-of-trust.ts', before: "fail(!visiting.has(id), 'CIRCULAR_TRUST_JUSTIFICATION');", after: 'if (visiting.has(id)) return;', test: 'root graph must terminate' },
  { id: 'BOOTSTRAP_AUTO_SELECT_ROOT', file: 'src/trust-bootstrap.ts', before: "if (!args.local_root) { out.reasons.push('NO_LOCAL_ROOT_SELECTION'); return out; }", after: "if (!args.local_root) { args.local_root = { admin_id: bundle.journals[0].admin_id, key: rootKey(bundle.journals[0]), genesis_id: bundle.journals[0].records[0].receipt_id, head_id: head(bundle.journals[0]) }; }", test: 'compatible double signatures never select', test_file: 'test/trust-bootstrap.test.ts' },
  { id: 'BOOTSTRAP_IGNORE_ROOT_DISTINCTNESS', file: 'src/trust-bootstrap.ts', before: "requireThat(new Set(bundle.journals.map(rootKey)).size === 2, 'ROOT_KEYS_NOT_DISTINCT');", after: '// MUTANT: two root labels count as independent roots', test: 'same underlying root with different labels', test_file: 'test/trust-bootstrap.test.ts' },
  { id: 'BOOTSTRAP_IGNORE_PINNED_PAST', file: 'src/trust-bootstrap.ts', before: "requireThat(head(local!) === args.local_root.head_id, 'PINNED_LOCAL_HISTORY_CHANGED');", after: '// MUTANT: accept re-signed replacement past', test: 'fully re-signed replacement past', test_file: 'test/trust-bootstrap.test.ts' },
  { id: 'BOOTSTRAP_IGNORE_EXPLICIT_PEER_SELECTION', file: 'src/trust-bootstrap.ts', before: "choice.peer_key === peer.key && choice.peer_genesis === peer.genesis_id && choice.scope === 'THIS_FUTURE_POLICY_EDGE_ONLY' && choice.selection_basis === 'EXPLICIT_LOCAL_ROOT_DECISION'", after: 'true', test: 'valid signature with altered peer_key', test_file: 'test/trust-bootstrap.test.ts' },
  { id: 'BOOTSTRAP_SILENT_ROOT_IMPORT', file: 'src/trust-bootstrap.ts', before: 'proposal.terms.root_import === false && proposal.terms.history_rewrite === false', after: 'true', test: 'signed proposal root_import', test_file: 'test/trust-bootstrap.test.ts' },
  { id: 'BOOTSTRAP_REWRITE_OLD_SELECTION', file: 'src/trust-bootstrap.ts', before: "requireThat(participant.prior_policy_id === journalBody(journal.records.find(r => journalBody(r).kind === 'SELECT_POLICY')!).data.claim_id, 'HISTORICAL_SELECTION_REWRITE');", after: '// MUTANT: rewrite the historical policy', test: 'signed proposal prior_policy_id', test_file: 'test/trust-bootstrap.test.ts' },
  { id: 'BOOTSTRAP_IGNORE_SIGNED_SCOPE', file: 'src/trust-bootstrap.ts', before: "requireThat(body.core_digest === bootstrapCoreDigest(bundle) && Array.isArray(body.record_ids) && sorted(body.record_ids) === sorted(bootstrapRecordIds(bundle)), 'FROZEN_ENCOUNTER_EVIDENCE_CHANGED');", after: '// MUTANT: broker can erase a contradictory admission', test: 'withholding a committed conflicting decision', test_file: 'test/trust-bootstrap.test.ts' },
  { id: 'BOOTSTRAP_IGNORE_RECEIPT_REPLAY', file: 'src/trust-bootstrap.ts', before: 'choice.proposal_id === bundle.proposal.receipt_id && decision.crossing_id === bundle.proposal.receipt_id', after: 'true', test: 'replaying local admissions against a fresh proposal', test_file: 'test/trust-bootstrap.test.ts' },
  { id: 'BOOTSTRAP_IGNORE_ACTIVATION_FORK', file: 'src/trust-bootstrap.ts', before: "requireThat(!args.local_root.active_edge_id || args.local_root.active_edge_id === edgeId, 'KNOWN_ACTIVE_POLICY_FORK');", after: '// MUTANT: overwrite a retained active edge', test: 'second valid joint edge cannot overwrite', test_file: 'test/trust-bootstrap.test.ts' },
  { id: 'BOOTSTRAP_POLICY_KEY_IS_ROOT', file: 'src/trust-bootstrap.ts', before: "requireThat(!bundle.journals.some(j => rootKey(j) === slot.policy_key), 'POLICY_KEY_IS_ADMIN_ROOT');", after: '// MUTANT: P can also use a root key', test: 'sharing a policy key with an admin root', test_file: 'test/trust-bootstrap.test.ts' },
  { id: 'BOOTSTRAP_IGNORE_PROPOSER_ROLE', file: 'src/trust-bootstrap.ts', before: 'proposer && bundle.proposal.world_id === proposer.admin_id && bundle.proposal.receiver_particular === proposer.admin_id', after: 'proposer', test: 'valid proposer signature with another admin role', test_file: 'test/trust-bootstrap.test.ts' },
  { id: 'SOVEREIGN_IGNORE_ACTIVE_B_FORK', file: 'src/sovereign-bootstrap-external.ts', before: 'const id = canonicalize({ kind, key, context });', after: "if (kind === 'ROOT_ACTIVATION_EQUIVOCATION') return;\n    const id = canonicalize({ kind, key, context });", test: 'hostile P and actively equivocating B', test_file: 'test/sovereign-bootstrap-external.test.ts' },
  { id: 'SOVEREIGN_IGNORE_KNOWLEDGE_PIN', file: 'src/sovereign-bootstrap-external.ts', before: "need(parent === selection.observation_head, 'PINNED_OBSERVATION_HEAD_CHANGED');", after: '// MUTANT: allow a forgotten observation log', test: 'replacing signed observation history', test_file: 'test/sovereign-bootstrap-external.test.ts' },
  { id: 'SOVEREIGN_TRUST_INCOMING_OWN_VIEW', file: 'src/sovereign-bootstrap-external.ts', before: "if (args.local_view) need(sovereignViewDigest(own!) === sovereignViewDigest(args.local_view), 'RETAINED_LOCAL_VIEW_REPLACEMENT');", after: '// MUTANT: let peer replace retained local knowledge', test: 'B cannot replace A local retained view', test_file: 'test/sovereign-bootstrap-external.test.ts' },
  { id: 'SOVEREIGN_IGNORE_LOCAL_ACK', file: 'src/sovereign-bootstrap-external.ts', before: "need(Array.isArray(d.acknowledged_conflicts) && sorted(d.acknowledged_conflicts) === sorted(expected.conflict_ids), 'LOCAL_CONTRADICTION_NOT_ACKNOWLEDGED');", after: '// MUTANT: allow unacknowledged known conflict', test: 'new local decision cannot fail to acknowledge', test_file: 'test/sovereign-bootstrap-external.test.ts' },
  { id: 'SOVEREIGN_IGNORE_FROZEN_EDGE', file: 'src/sovereign-bootstrap-external.ts', before: "need(c.core_digest === sovereignEdgeCoreDigest(bundle), 'FROZEN_SOVEREIGN_EDGE_EVIDENCE_CHANGED');", after: '// MUTANT: closure does not bind decisions', test: 'replacing a correctly signed fresh decision', test_file: 'test/sovereign-bootstrap-external.test.ts' },
  { id: 'SOVEREIGN_TRUST_P_AS_ROOT', file: 'src/sovereign-bootstrap-external.ts', before: 'participant && peer && participant.key === signingKeyIdentity(r)', after: 'participant && peer', test: 'hostile P cannot sign B sovereign decision', test_file: 'test/sovereign-bootstrap-external.test.ts' },
  { id: 'SOVEREIGN_INVENT_SIGNED_CONFLICT', file: 'src/sovereign-bootstrap-external.ts', before: "need(sorted(then.map(c => c.id)) === sorted(e.conflict_ids), 'LOCAL_CONFLICT_RECORD_NOT_REPRODUCIBLE');", after: '// MUTANT: trust local conflict label without receipts', test: 'local observation claims must reproduce', test_file: 'test/sovereign-bootstrap-external.test.ts' },
];

export async function runMutations(reportPath) {
  const work = await mkdtemp(join(tmpdir(), 'foundation-mutants-')); const results = [];
  try {
    for (const path of ['src', 'test', 'scripts', 'fixtures', 'package.json', 'tsconfig.json']) await cp(join(root, path), join(work, path), { recursive: true });
    await symlink(join(root, 'node_modules'), join(work, 'node_modules'), 'dir');
    for (const mutant of mutants) {
      const path = join(work, mutant.file), original = await readFile(path, 'utf8');
      if (original.split(mutant.before).length !== 2) throw new Error('AMBIGUOUS_MUTATION:' + mutant.id);
      await writeFile(path, original.replace(mutant.before, mutant.after));
      const result = spawnSync(process.execPath, ['--test', '--experimental-strip-types', '--test-name-pattern', mutant.test, mutant.test_file ?? 'test/foundation-of-trust.test.ts'], { cwd: work, encoding: 'utf8', timeout: 60000 });
      const output = result.stdout + result.stderr;
      const killed = result.status !== 0 && output.includes('AssertionError') && !output.includes('SyntaxError');
      results.push({ ...mutant, original_file_sha256: createHash('sha256').update(original).digest('hex'), killed, exit_status: result.status, failure_kind: killed ? 'ASSERTION' : 'NOT_PROVEN' });
      await writeFile(path, original);
      process.stdout.write(`${mutant.id}: ${killed ? 'KILLED' : 'SURVIVED_OR_INVALID'} by ${mutant.test}\n`);
      if (!killed) process.stderr.write(output.slice(-6000));
    }
  } finally { await rm(work, { recursive: true, force: true }); }
  const report = { schema: 'relatte.foundation-mutation-report/v0', total: results.length, killed: results.filter(r => r.killed).length, results };
  if (reportPath) await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  if (report.killed !== report.total) throw new Error('SURVIVING_OR_INVALID_MUTANT');
  return report;
}
if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  runMutations(process.argv[2] ?? process.env.RELATTE_MUTATION_REPORT).catch(e => { process.stderr.write(e.message + '\n'); process.exitCode = 1; });
}
