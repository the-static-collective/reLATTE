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
  runMutations(process.argv[2]).catch(e => { process.stderr.write(e.message + '\n'); process.exitCode = 1; });
}
