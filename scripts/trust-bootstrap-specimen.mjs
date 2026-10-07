/** Repeatable bounded bootstrap experiment; not evidence of distinct admins. */
import { mkdir, mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { assessTrustBootstrap, parseEvidenceJson, forbidPrivateEvidence, canonicalize } from '../src/index.ts';
import { journalPin, bootstrapScenario, signDecision, closeEncounter } from '../test/support/bootstrap.ts';
import { independentlyVerifyBootstrap } from './trust-bootstrap-independent.mjs';
import { reproduceOmissionFailure } from './trust-bootstrap-omission-reproduce.mjs';
const participant = new URL('./trust-bootstrap-participant.mjs', import.meta.url).pathname;
const need = (ok, why) => { if (!ok) throw new Error(why); };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export async function generateBootstrapSpecimen(destination) {
  const work = await mkdtemp(join(tmpdir(), 'trust-bootstrap-')), trace = [];
  const dirs = ['A','B','P'].map(s => join(work, s)); let contextSerial = 0;
  async function actor(op, side, input = {}) {
    forbidPrivateEvidence(input); const inputPath = join(work, 'public-' + ++contextSerial + '.json');
    await writeFile(inputPath, JSON.stringify(input));
    const run = spawnSync(process.execPath, ['--experimental-strip-types', participant, op, dirs[side], inputPath], { encoding: 'utf8', timeout: 30000 });
    need(run.status === 0, 'PARTICIPANT_FAILED:' + op + ':' + run.stderr); trace.push({ op, side: ['A','B','P'][side], pid: run.pid, public_input_sha256: sha(JSON.stringify(input)) });
    const output = parseEvidenceJson(run.stdout); forbidPrivateEvidence(output); return output;
  }
  try {
    const journals = [];
    for (let i = 0; i < 2; i++) journals.push(await actor('init', i, { admin_id: crypto.randomUUID() }));
    const genesisPins = journals.map(journalPin);
    // No P private/public key yet exists: both root constitutions precede it.
    const p = await actor('policy-init', 2);
    for (let i = 0; i < 2; i++) journals[i] = await actor('delegate', i, p);
    const delegationIds = journals.map(j => j.records.at(-1).receipt_id);
    const policy_claims = [];
    for (const [i, handoff_rule] of ['SOURCE_MAY_SELF_ADMIT','RECEIVER_MUST_ATTEST'].entries()) policy_claims.push(await actor('policy-sign', 2, {
      schema: 'relatte.bootstrap-policy/v0', slot: p.slot, version: 1, scope: 'ONE_RULE_FOR_BOTH_ADMINS', basis_heads: [delegationIds[i]], terms: { handoff_rule },
    }));
    for (let i = 0; i < 2; i++) journals[i] = await actor('select', i, policy_claims[i]);
    const before = { schema: 'relatte.trust-bootstrap-bundle/v0', journals: structuredClone(journals), policy_claims, proposal: null, decisions: [], closures: [] };
    const beforePins = journals.map(journalPin), beforeBytes = await Promise.all(dirs.slice(0, 2).map(d => readFile(join(d, 'history.ndjson'), 'utf8')));
    const discovery = await Promise.all(beforePins.map(local_root => assessTrustBootstrap({ bundle: before, local_root })));
    discovery.forEach(r => need(r.status === 'HOLD' && r.conflict === 'EQUIVOCATION', 'SILENT_INITIAL_CONVERGENCE'));
    for (let i = 0; i < 2; i++) journals[i] = await actor('observe', i, before);
    const roots = journals.map(journalPin), bundle = { ...structuredClone(before), journals, proposal: null, decisions: [], closures: [] };
    bundle.proposal = await actor('propose', 0, bundle);
    for (let i = 0; i < 2; i++) bundle.decisions.push(await actor('admit-exact', i, bundle));
    for (let i = 0; i < 2; i++) bundle.closures.push(await actor('close', i, bundle));
    const outcomes = [];
    for (let i = 0; i < 2; i++) outcomes.push(await actor('commit', i, bundle));
    for (let i = 0; i < 2; i++) need((await readFile(join(dirs[i], 'history.ndjson'), 'utf8')).startsWith(beforeBytes[i]), 'PAST_WAS_REWRITTEN');
    const historyHashes = await Promise.all(dirs.slice(0, 2).map(async (d, i) => ({ side: ['A','B'][i], before_sha256: sha(beforeBytes[i]), before_byte_count: Buffer.byteLength(beforeBytes[i]), after_sha256: sha(await readFile(join(d, 'history.ndjson'))), before_is_exact_prefix: true })));
    // Original signer processes have exited. Remove every private key, then
    // replay B from its durable public log/state without invoking signing.
    for (const d of dirs) await rm(join(d, 'private.json'));
    const restartedB = await actor('restart', 1);
    need(restartedB.status === 'MUTUALLY_WITNESSED', 'RESTART_FAILED');
    const bDurableState = parseEvidenceJson(await readFile(join(dirs[1], 'local-state.json'), 'utf8'));
    for (const d of dirs) await rm(d, { recursive: true, force: true });
    for (const d of dirs) { let exists = true; try { await access(d); } catch { exists = false; } need(!exists, 'ORIGINAL_RUNTIME_SURVIVED'); }
    // C and D start new verifier processes with only a public bundle and an
    // independently supplied historical local root/head selection.
    const proofPath = join(work, 'bundle.json'); await writeFile(proofPath, JSON.stringify(bundle)); const replacements = [];
    for (let i = 0; i < 2; i++) {
      const rootPath = join(work, 'root-' + i + '.json'); await writeFile(rootPath, JSON.stringify(roots[i]));
      const run = spawnSync(process.execPath, ['--experimental-strip-types', new URL('./trust-bootstrap-independent.mjs', import.meta.url).pathname, proofPath, rootPath], { encoding: 'utf8', timeout: 30000 });
      need(run.status === 0, 'FRESH_NATIVE_VERIFIER_FAILED:' + run.stderr); replacements.push(parseEvidenceJson(run.stdout));
    }
    const noRoot = await assessTrustBootstrap({ bundle }); need(noRoot.reasons.includes('NO_LOCAL_ROOT_SELECTION'), 'BOOTSTRAP_ACCEPTED_ITS_OWN_ROOT');
    const hostile = await bootstrapScenario(); hostile.bundle.decisions.push(await signDecision(hostile, 0, { fields: { decision: 'REFUSE' } })); await closeEncounter(hostile);
    const beforeLoss = await assessTrustBootstrap({ bundle: hostile.bundle, local_root: hostile.roots[0] });
    const withheld = structuredClone(hostile.bundle); withheld.decisions.pop();
    const afterLoss = await assessTrustBootstrap({ bundle: withheld, local_root: hostile.roots[0] });
    need(beforeLoss.reasons.includes('LOCAL_DECISION_EQUIVOCATION_OR_DUPLICATE') && afterLoss.reasons.includes('FROZEN_ENCOUNTER_EVIDENCE_CHANGED'), 'OMISSION_SPECIMEN_FAILED');
    const omission = { schema: 'relatte.bootstrap-omission-specimen/v0', bundle: hostile.bundle, local_root: hostile.roots[0], removed_id: hostile.bundle.decisions.at(-1).receipt_id,
      preliminary_model: await reproduceOmissionFailure(hostile.bundle, hostile.roots[0]),
      pre_hardening_failure: 'REMOVING_A_CONTRADICTORY_DECISION_ALLOWED_MUTUALLY_WITNESSED', repaired_before: beforeLoss, repaired_after: afterLoss };
    const report = { schema: 'relatte.bootstrap-specimen-report/v0', trace, genesis_pins: genesisPins, root_pins: roots,
      discovery, outcomes, history_hashes: historyHashes, restarted_B: restartedB, durable_B_state: bDurableState,
      replacement_verifiers: replacements, fresh_without_root: noRoot,
      original_private_keys_deleted: 'OBSERVED_IN_LOCAL_CAMPAIGN', original_runtime_directories_deleted: 'OBSERVED_IN_LOCAL_CAMPAIGN',
      evidence_ceiling: 'E3 CORROBORATED-KEYS', administrative_independence: 'UNOBSERVED', human_independence: 'UNOBSERVED', non_collusion: 'UNOBSERVED',
      local_root_selection: 'ASSUMED_EXTERNALLY', signed_decisions_are_scripted: true };
    assert.equal(outcomes[0].joint_edge_id, outcomes[1].joint_edge_id); assert.equal(replacements[0].joint_edge_id, outcomes[0].joint_edge_id);
    if (destination) {
      await mkdir(destination, { recursive: true });
      const files = { 'bundle.json': bundle, 'root-A.json': roots[0], 'root-B.json': roots[1], 'before-meeting.json': before,
        'before-root-A.json': beforePins[0], 'before-root-B.json': beforePins[1], 'report.json': report, 'omission-failure.json': omission };
      for (const [name, value] of Object.entries(files)) { forbidPrivateEvidence(value); await writeFile(join(destination, name), JSON.stringify(value, null, 2) + '\n'); }
    }
    return { bundle, roots, before, beforePins, omission, report };
  } finally { await rm(work, { recursive: true, force: true }); }
}
export async function replayBootstrap(dir = new URL('../fixtures/trust-bootstrap-equivocation-001/', import.meta.url).pathname) {
  const load = async name => parseEvidenceJson(await readFile(join(dir, name), 'utf8'));
  const bundle = await load('bundle.json'), roots = await Promise.all(['root-A.json','root-B.json'].map(load));
  const results = [];
  for (const root of roots) {
    const primary = await assessTrustBootstrap({ bundle, local_root: root }), secondary = independentlyVerifyBootstrap(bundle, root);
    need(primary.status === 'MUTUALLY_WITNESSED' && secondary.status === primary.status && secondary.joint_edge_id === primary.joint_edge_id, 'FROZEN_BOOTSTRAP_VERIFIER_DISAGREEMENT'); results.push({ primary, secondary });
  }
  const failure = await load('omission-failure.json'), withheld = structuredClone(failure.bundle); withheld.decisions.pop();
  const failed = await assessTrustBootstrap({ bundle: failure.bundle, local_root: failure.local_root }), loss = await assessTrustBootstrap({ bundle: withheld, local_root: failure.local_root });
  need(failed.reasons.includes('LOCAL_DECISION_EQUIVOCATION_OR_DUPLICATE') && loss.reasons.includes('FROZEN_ENCOUNTER_EVIDENCE_CHANGED') && independentlyVerifyBootstrap(withheld, failure.local_root).status === 'HOLD', 'OMISSION_FAILURE_REGRESSED');
  return { status: 'REPLAYED', results, omission_confidence_before: failed.confidence, omission_confidence_after: loss.confidence, administrative_independence: 'UNOBSERVED' };
}
if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const result = process.argv[2] === '--generate' ? await generateBootstrapSpecimen(process.argv[3]) : await replayBootstrap(process.argv[2]);
  process.stdout.write(JSON.stringify({ status: 'PASSED', evidence_ceiling: 'E3 CORROBORATED-KEYS', administrative_independence: 'UNOBSERVED', same_edge: result.report ? result.report.outcomes[0].joint_edge_id : result.results[0].primary.joint_edge_id }, null, 2) + '\n');
}
