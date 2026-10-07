import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  assessFoundationBundle, assessTwoWitnessHandoff, parseEvidenceJson,
  validateTrustRootGraph, forbidPrivateEvidence,
} from '../src/index.ts';
import { independentlyVerify } from './foundation-of-trust-independent.mjs';

const dir = new URL('../fixtures/foundation-of-trust-001/', import.meta.url).pathname;
const json = async path => parseEvidenceJson(await readFile(path, 'utf8'));
const requireThat = (ok, reason) => { if (!ok) throw new Error(reason); };
export async function replayCampaign(reportPath) {
  const results = [];
  for (const label of ['AB', 'BC2']) {
    const bundle = await json(join(dir, label, 'bundle.json')), roots = await json(join(dir, label + '-roots.json'));
    forbidPrivateEvidence(bundle); const crossing_id = bundle.records[0].crossing_id;
    const primary = await assessFoundationBundle({ bundle, roots, crossing_id });
    const secondary = independentlyVerify(bundle, roots, crossing_id);
    requireThat(primary.status === 'VERIFIED' && secondary.status === 'VERIFIED', 'FROZEN_VERIFIER_DISAGREEMENT');
    results.push({ specimen: label, primary, secondary });
  }
  for (const role of ['source', 'receiver']) {
    const fixture = await json(join(dir, 'equivocation-' + role + '.json'));
    const result = await assessFoundationBundle(fixture); requireThat(result.status === 'HOLD' && result.reasons.includes('EQUIVOCATION'), 'CONFLICT_DISAPPEARED');
    requireThat(independentlyVerify(fixture.bundle, fixture.roots, fixture.crossing_id).status === 'HOLD', 'SECOND_VERIFIER_LOST_CONFLICT');
    results.push({ specimen: 'equivocation-' + role, result });
  }
  const failure = await json(join(dir, 'same-key-metadata-failure.json'));
  const repaired = await assessTwoWitnessHandoff({ crossing: failure.crossing, receiver_receipt: failure.receipt });
  requireThat(repaired.status === 'HOLD' && repaired.reasons.includes('WITNESS_KEYS_NOT_DISTINCT'), 'SAME_KEY_FRAUD_RETURNED');
  const ceiling = await json(join(dir, 'withholding-ceiling.json'));
  requireThat((await assessFoundationBundle(ceiling.full_scope)).reasons.includes('EQUIVOCATION'), 'FULL_SCOPE_CONFLICT_LOST');
  requireThat((await assessFoundationBundle(ceiling.withheld_scope)).status === 'VERIFIED', 'WITHHOLDING_CEILING_SPECIMEN_CHANGED');
  validateTrustRootGraph(await json(join(dir, 'trust-root-graph.json')));
  const base = { bundle: await json(join(dir, 'AB/bundle.json')), roots: await json(join(dir, 'AB-roots.json')) };
  const crossing_id = base.bundle.records[0].crossing_id, loss = [];
  const full = await assessFoundationBundle({ ...base, crossing_id });
  for (let mask = 0; mask < 16; mask++) {
    const bundle = structuredClone(base.bundle);
    const deleted = [];
    if (mask & 1) { bundle.policy = null; deleted.push('policy'); }
    if (mask & 2) { bundle.inventory = null; deleted.push('inventory'); }
    bundle.records = bundle.records.filter((r, i) => { if (mask & (4 << i)) { deleted.push(i ? 'receiver' : 'source'); return false; } return true; });
    const result = await assessFoundationBundle({ bundle, roots: base.roots, crossing_id });
    requireThat(result.confidence <= full.confidence && (!mask || result.status === 'HOLD'), 'LOSS_UPGRADED_TRUST');
    loss.push({ deleted, status: result.status, evidence_level: result.evidence_level, confidence: result.confidence, reasons: result.reasons });
  }
  const report = { schema: 'relatte.foundation-replay-report/v0', frozen_specimens: results, repaired_same_key: repaired, loss_matrix: loss,
    root_selection: 'ASSUMED_EXTERNALLY_FOR_REPLAY', global_absence_of_withheld_conflict: 'UNOBSERVED', stronger_machine_domain_human_claims: 'UNOBSERVED' };
  if (reportPath) await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(JSON.stringify({ replayed_edges: results.filter(r => r.primary).length, reconstructed_conflicts: 2, deletion_sets: loss.length, all_checks_passed: true, evidence_ceiling: 'E3 CORROBORATED-KEYS' }, null, 2) + '\n');
  return report;
}
if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) replayCampaign(process.argv[2]).catch(e => { process.stderr.write(e.message + '\n'); process.exitCode = 1; });
