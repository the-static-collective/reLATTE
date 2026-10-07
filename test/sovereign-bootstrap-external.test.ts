import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  assessSovereignEncounter, assessSovereignEdge, verifyReceipt, canonicalize, sovereignSelection, parseEvidenceJson,
  type SovereignEdgeBundle,
} from '../src/index.ts';
import { sovereignExternalScenario, recordKnowledge, signSovereignDecision, signSovereignProposal, closeSovereignEdge } from './support/sovereign-external.ts';
import { bootstrapReceipt, journalEvent } from './support/bootstrap.ts';
// @ts-ignore Independent native JS verifier; no primary assessment imports.
import { independentlyEncounter, independentlySovereignEdge } from '../scripts/sovereign-bootstrap-external-independent.mjs';
// @ts-ignore Frozen local replay explicitly leaves external execution NOT_EXECUTED.
import { replaySovereignFixtures } from '../scripts/sovereign-bootstrap-external-replay.mjs';
const hold = (r: any, reason: string) => { assert.equal(r.status, 'HOLD'); assert.ok(r.reasons.includes(reason), JSON.stringify(r)); };
const edge = (s: any, side = 0, bundle: SovereignEdgeBundle = s.bundle) => assessSovereignEdge({ selection: s.selections[side], bundle, local_view: s.views[side] });

test('EXTERNAL: hostile P and actively equivocating B are discovered before peer authority', async () => {
  const s = await sovereignExternalScenario();
  for (let i = 0; i < 2; i++) {
    const result = await assessSovereignEncounter({ selection: s.selections[i], view: s.views[i] });
    hold(result, 'POLICY_EQUIVOCATION'); assert.ok(result.reasons.includes('ROOT_ACTIVATION_EQUIVOCATION'));
    assert.equal(result.peer_authority, 'UNOBSERVED'); assert.equal(result.foreign_sovereignty_imported, false);
    assert.equal(result.conflict_evidence_level, 'E2 SIGNED');
  }
  for (const r of s.hostileClaims) assert.equal(await verifyReceipt(r), true);
  const native = independentlyEncounter(s.selections[0], s.views[0]);
  assert.deepEqual(native.known_conflict_ids, (await assessSovereignEncounter({ selection: s.selections[0], view: s.views[0] })).known_conflict_ids);
});

test('EXTERNAL: B selective history cannot erase A independently retained contradiction', async () => {
  const s = await sovereignExternalScenario(), before = canonicalize(s.views[0]);
  const result = await assessSovereignEncounter({ selection: s.selections[0], view: s.views[0], incoming: s.hostileClaims.slice(0, 1) });
  assert.ok(result.reconstructed_conflicts.some(c => c.kind === 'ROOT_ACTIVATION_EQUIVOCATION'));
  assert.equal(result.known_conflict_ids.length, (await assessSovereignEncounter({ selection: s.selections[0], view: s.views[0] })).known_conflict_ids.length);
  assert.equal(canonicalize(s.views[0]), before);
});

test('EXTERNAL: separate observers exchange B branches and reconstruct the contradiction', async () => {
  const s = await sovereignExternalScenario(), basic = [...s.s.bundle.policy_claims];
  const a = await recordKnowledge(s.initial[0], s.initialSelections[0], [...basic, s.hostileClaims[0], s.hostileClaims[2]], s.s.keys[0]);
  const b = await recordKnowledge(s.initial[1], s.initialSelections[1], [...basic, s.hostileClaims[1], s.hostileClaims[3]], s.s.keys[1]);
  assert.equal(a.result.reconstructed_conflicts.some(c => c.kind === 'ROOT_ACTIVATION_EQUIVOCATION'), false);
  const united = await recordKnowledge(a.view, a.selection, b.view.archive, s.s.keys[0]);
  assert.equal(united.result.reconstructed_conflicts.some(c => c.kind === 'ROOT_ACTIVATION_EQUIVOCATION'), true);
  assert.ok(a.result.known_conflict_ids.every(id => united.result.known_conflict_ids.includes(id)));
});

test('EXTERNAL: incomplete never-observed B history cannot prove a hidden fork', async () => {
  const s = await sovereignExternalScenario();
  const r = await assessSovereignEncounter({ selection: s.initialSelections[0], view: s.initial[0], incoming: [s.s.bundle.policy_claims[1], s.hostileClaims[0], s.hostileClaims[2]] });
  hold(r, 'FRESH_BILATERAL_ACT_REQUIRED'); assert.equal(r.reconstructed_conflicts.some(c => c.kind === 'ROOT_ACTIVATION_EQUIVOCATION'), false);
  assert.equal(r.global_completeness, 'UNOBSERVED');
});

test('EXTERNAL: fresh bilateral version acknowledges known P/B contradictions without changing old choices', async () => {
  const s = await sovereignExternalScenario(), past = canonicalize(s.views);
  const [a, b] = await Promise.all([edge(s, 0), edge(s, 1)]);
  assert.equal(a.status, 'MUTUALLY_WITNESSED'); assert.equal(b.joint_edge_id, a.joint_edge_id);
  assert.equal(a.evidence_level, 'E3 CORROBORATED-KEYS'); assert.equal(a.foreign_sovereignty_imported, false);
  assert.equal(a.administrative_independence, 'UNOBSERVED'); assert.equal(a.historical_truth, 'UNOBSERVED');
  assert.equal(s.bundle.proposal.extensions.sovereign_reconciliation.version, 3);
  assert.equal(canonicalize(s.views), past); assert.ok(a.known_conflict_ids.length >= 2);
  const chosen = s.views.map(v => v.history.records.find(r => r.extensions.bootstrap_journal.kind === 'SELECT_POLICY')!.extensions.bootstrap_journal.data.claim_id);
  assert.notEqual(chosen[0], chosen[1]);
  const native = independentlySovereignEdge(s.selections[0], s.bundle, s.views[0]);
  assert.equal(native.status, 'MUTUALLY_WITNESSED'); assert.equal(native.joint_edge_id, a.joint_edge_id);
});

test('EXTERNAL: B can equivocate again after reconciliation; encounter preserves the new fork too', async () => {
  const s = await sovereignExternalScenario();
  const alternate = await signSovereignProposal(s.views, s.s.keys[1], 1);
  const changed = { ...s.bundle, proposal: alternate };
  const second = await signSovereignDecision(changed, s.s.keys[1], 1);
  const incoming = [s.bundle.proposal, s.bundle.decisions[1], alternate, second];
  for (const r of incoming) assert.equal(await verifyReceipt(r), true);
  const first = await assessSovereignEncounter({ selection: s.selections[0], view: s.views[0] });
  const after = await assessSovereignEncounter({ selection: s.selections[0], view: s.views[0], incoming });
  assert.ok(after.known_conflict_ids.length > first.known_conflict_ids.length);
  assert.ok(first.known_conflict_ids.every(id => after.known_conflict_ids.includes(id)));
  assert.deepEqual(independentlyEncounter(s.selections[0], s.views[0], incoming).known_conflict_ids, after.known_conflict_ids);
});

for (const field of ['history_rewrite','sovereignty_import','conflict_erasure']) test(`EXTERNAL: malicious valid new policy ${field} cannot import or rewrite sovereignty`, async () => {
  const s = await sovereignExternalScenario(); s.bundle.proposal = await signSovereignProposal(s.views, s.s.keys[0], 0, { [field]: true });
  s.bundle.decisions = await Promise.all(s.s.keys.map((k, i) => signSovereignDecision(s.bundle, k, i))); await closeSovereignEdge(s.bundle, s.s.keys);
  assert.equal(await verifyReceipt(s.bundle.proposal), true); hold(await edge(s), 'SOVEREIGNTY_IMPORT_OR_PAST_REWRITE_FORBIDDEN');
});

test('EXTERNAL: new proposal cannot omit a known contradiction even with all signatures', async () => {
  const s = await sovereignExternalScenario(); s.bundle.proposal = await signSovereignProposal(s.views, s.s.keys[0], 0, { conflict_ids: [] });
  s.bundle.decisions = await Promise.all(s.s.keys.map((k, i) => signSovereignDecision(s.bundle, k, i))); await closeSovereignEdge(s.bundle, s.s.keys);
  hold(await edge(s), 'KNOWN_CONTRADICTION_NOT_ACKNOWLEDGED');
});

test('EXTERNAL: new local decision cannot fail to acknowledge B fork', async () => {
  const s = await sovereignExternalScenario(); s.bundle.decisions[0] = await signSovereignDecision(s.bundle, s.s.keys[0], 0, { acknowledged_conflicts: [] }); await closeSovereignEdge(s.bundle, s.s.keys);
  assert.equal(await verifyReceipt(s.bundle.decisions[0]), true); hold(await edge(s), 'LOCAL_CONTRADICTION_NOT_ACKNOWLEDGED');
});

test('EXTERNAL: replayed old bilateral decision cannot authorize reconciliation', async () => {
  const s = await sovereignExternalScenario(); s.bundle.decisions[0] = s.s.bundle.decisions[0]; await closeSovereignEdge(s.bundle, s.s.keys);
  assert.equal(await verifyReceipt(s.bundle.decisions[0]), true); hold(await edge(s), 'INVALID_SOVEREIGN_EDGE_DECISION');
});

for (const side of [0, 1]) test(`EXTERNAL: ${side} withholds or refuses fresh scoped consent`, async () => {
  const s = await sovereignExternalScenario(); s.bundle.decisions[side] = await signSovereignDecision(s.bundle, s.s.keys[side], side, { decision: 'REFUSE' }); await closeSovereignEdge(s.bundle, s.s.keys);
  hold(await edge(s), 'SOVEREIGN_EDGE_LOCALLY_REFUSED');
  s.bundle.decisions.splice(side, 1); s.bundle.closures = []; hold(await edge(s), 'BOTH_FRESH_SOVEREIGN_DECISIONS_REQUIRED');
});

test('EXTERNAL: hostile P cannot sign B sovereign decision', async () => {
  const s = await sovereignExternalScenario(); s.bundle.decisions[1] = await signSovereignDecision(s.bundle, s.s.policyKey, 1); await closeSovereignEdge(s.bundle, s.s.keys);
  assert.equal(await verifyReceipt(s.bundle.decisions[1]), true); hold(await edge(s), 'SOVEREIGN_EDGE_DECISION_SIGNER_OR_ROLE_MISMATCH');
});

test('EXTERNAL: no root, owner archive or operator identity is selected from a public bundle', async () => {
  const s = await sovereignExternalScenario(); hold(await assessSovereignEdge({ bundle: s.bundle }), 'NO_LOCAL_SOVEREIGN_SELECTION');
  hold(await assessSovereignEncounter({ view: s.views[0] }), 'NO_LOCAL_SOVEREIGN_SELECTION');
});

test('EXTERNAL: local archive loss keeps remembered conflict IDs while reconstruction degrades', async () => {
  const s = await sovereignExternalScenario(), view = structuredClone(s.views[0]); view.archive = view.archive.filter(r => r.receipt_id !== s.hostileClaims[3].receipt_id);
  const result = await assessSovereignEncounter({ selection: s.selections[0], view });
  hold(result, 'KNOWN_ARCHIVE_EVIDENCE_MISSING_OR_CHANGED'); assert.ok(result.known_conflict_ids.length >= 2);
  assert.equal(result.conflict_evidence_level, 'E0 UNOBSERVED'); assert.equal(result.observation_draft, null);
  const native = independentlyEncounter(s.selections[0], view); assert.deepEqual(native.known_conflict_ids, result.known_conflict_ids); assert.equal(native.ready, false);
});

test('EXTERNAL: original history loss cannot erase a separately pinned signed conflict memory', async () => {
  const s = await sovereignExternalScenario(), view = structuredClone(s.views[0]); view.history.records = [];
  const r = await assessSovereignEncounter({ selection: s.selections[0], view });
  hold(r, 'LOCAL_SOVEREIGN_SELECTION_MISMATCH'); assert.ok(r.known_conflict_ids.length >= 2);
  assert.equal(r.conflict_evidence_level, 'E0 UNOBSERVED'); assert.equal(r.observation_draft, null);
  assert.deepEqual(independentlyEncounter(s.selections[0], view).known_conflict_ids, r.known_conflict_ids);
  const work=await mkdtemp(join(tmpdir(),'sovereign-lost-history-'));
  try {
    for(const [name,value] of Object.entries({'pin.json':s.selections[0],'view.json':view,'incoming.json':[]}))await writeFile(join(work,name),JSON.stringify(value));
    const run=spawnSync(process.execPath,['--experimental-strip-types',new URL('../scripts/sovereign-bootstrap-external.mjs',import.meta.url).pathname,'inspect',join(work,'pin.json'),join(work,'view.json'),join(work,'incoming.json')],{encoding:'utf8',timeout:30000});
    assert.equal(run.status,0,run.stderr);assert.deepEqual((parseEvidenceJson(run.stdout)as any).known_conflict_ids,r.known_conflict_ids);
  } finally {await rm(work,{recursive:true,force:true});}
});

test('EXTERNAL: replacing signed observation history cannot silently reset local knowledge', async () => {
  const s = await sovereignExternalScenario(), view = structuredClone(s.views[0]); view.observations = [];
  hold(await assessSovereignEncounter({ selection: s.selections[0], view }), 'PINNED_OBSERVATION_HEAD_CHANGED');
});

test('EXTERNAL: B cannot replace A local retained view with a cleaner public candidate', async () => {
  const s = await sovereignExternalScenario(), bundle = structuredClone(s.bundle); bundle.views[0] = s.initial[0];
  const r = await edge(s, 0, bundle); hold(r, 'RETAINED_LOCAL_VIEW_REPLACEMENT'); assert.ok(r.known_conflict_ids.length >= 2);
});

test('EXTERNAL: invalid incoming signature cannot erase prior reconstructed contradiction', async () => {
  const s = await sovereignExternalScenario(), tampered = structuredClone(s.hostileClaims[0]); tampered.created_at = '2999-01-01T00:00:00.000Z';
  const r = await assessSovereignEncounter({ selection: s.selections[0], view: s.views[0], incoming: [tampered] });
  hold(r, 'INVALID_SOVEREIGN_SIGNATURE'); assert.ok(r.known_conflict_ids.length >= 2); assert.equal(r.conflict_evidence_level, 'E2 SIGNED');
});

test('EXTERNAL: signed archive deletion cannot raise edge evidence', async () => {
  const s = await sovereignExternalScenario(), full = await edge(s);
  for (const i of [0, 1]) for (const record of s.views[i].archive) {
    const bundle = structuredClone(s.bundle); bundle.views[i].archive = bundle.views[i].archive.filter(r => r.receipt_id !== record.receipt_id);
    const r = await edge(s, i, bundle); assert.equal(r.status, 'HOLD'); assert.ok(r.confidence <= full.confidence);
    assert.equal(independentlySovereignEdge(s.selections[i], bundle, s.views[i]).status, 'HOLD');
  }
});

test('EXTERNAL: duplicate key metadata does not hide active B equivocation', async () => {
  const s = await sovereignExternalScenario(); for (const r of s.views[0].archive) if (r.receipt_id === s.hostileClaims[3].receipt_id) r.signing.public_key.kid = 'different-admin-looking-label';
  const r = await assessSovereignEncounter({ selection: s.selections[0], view: s.views[0] });
  assert.ok(r.reconstructed_conflicts.some(c => c.kind === 'ROOT_ACTIVATION_EQUIVOCATION')); assert.equal(r.peer_authority, 'UNOBSERVED');
});

test('EXTERNAL: B signs a competing journal branch; source signatures remain contestable', async () => {
  const s = await sovereignExternalScenario(), j = s.initial[1].history;
  const alternate = await journalEvent(s.s.keys[1], j.admin_id, j.records.slice(0, 2), 'SELECT_POLICY', { claim_id: s.s.bundle.policy_claims[0].receipt_id });
  assert.equal(await verifyReceipt(alternate), true);
  const r = await assessSovereignEncounter({ selection: s.selections[0], view: s.views[0], incoming: [alternate] });
  hold(r, 'ROOT_HISTORY_EQUIVOCATION'); assert.equal(r.peer_authority, 'UNOBSERVED');
});

test('EXTERNAL: replacing a correctly signed fresh decision breaks frozen closure identity', async () => {
  const s = await sovereignExternalScenario(), old = s.bundle.decisions[0];
  s.bundle.decisions[0] = await bootstrapReceipt('sovereign_edge_decision', old.extensions.sovereign_edge_decision, s.s.keys[0], old.world_id, old.crossing_id, '2999-01-01T00:00:00.000Z');
  assert.equal(await verifyReceipt(s.bundle.decisions[0]), true); hold(await edge(s), 'FROZEN_SOVEREIGN_EDGE_EVIDENCE_CHANGED');
  assert.equal(independentlySovereignEdge(s.selections[0], s.bundle, s.views[0]).status, 'HOLD');
});

test('EXTERNAL: local observation claims must reproduce from signed records', async () => {
  const s = await sovereignExternalScenario(), view = structuredClone(s.views[0]), old = view.observations[0], e = { ...old.extensions.sovereign_observation, conflict_ids: ['fabricated-conflict'] };
  view.observations[0] = await bootstrapReceipt('sovereign_observation', e, s.s.keys[0], old.world_id, old.crossing_id);
  const selection = { ...s.selections[0], observation_head: view.observations[0].receipt_id };
  hold(await assessSovereignEncounter({ selection, view }), 'LOCAL_CONFLICT_RECORD_NOT_REPRODUCIBLE');
});

test('EXTERNAL: signed proposal cannot retroactively re-use old activation version', async () => {
  const s = await sovereignExternalScenario(); s.bundle.proposal = await signSovereignProposal(s.views, s.s.keys[0], 0, { version: 2 });
  s.bundle.decisions = await Promise.all(s.s.keys.map((k, i) => signSovereignDecision(s.bundle, k, i))); await closeSovereignEdge(s.bundle, s.s.keys);
  hold(await edge(s), 'FRESH_POLICY_VERSION_REQUIRED');
});

test('EXTERNAL: seeded selective-history encounters never erase local contradictions', async () => {
  const s = await sovereignExternalScenario(), original = (await assessSovereignEncounter({ selection: s.selections[0], view: s.views[0] })).known_conflict_ids;
  let seed = 0x5e001;
  for (let i = 0; i < 128; i++) {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    const incoming = s.incoming.filter((_, j) => (seed >>> (j % 32)) & 1);
    const r = await assessSovereignEncounter({ selection: s.selections[0], view: s.views[0], incoming });
    assert.deepEqual(r.known_conflict_ids, original); assert.equal(r.status, 'HOLD');
  }
});

test('EXTERNAL: frozen proof replays but does not promote external experiment completion', async () => {
  const r = await replaySovereignFixtures(); assert.equal(r.status, 'LOCAL_REPLAY_PASSED'); assert.equal(r.external_execution, 'NOT_EXECUTED');
  const manifest = parseEvidenceJson(await readFile(new URL('../fixtures/sovereign-bootstrap-external-001/external-inputs.json', import.meta.url), 'utf8')) as any;
  assert.equal(manifest.status, 'BLOCKED_EXTERNAL_INPUTS'); assert.equal(manifest.independent_administration, 'UNOBSERVED');
});

test('EXTERNAL: one-sovereign CLI checkpoints existing selected root without generating a root', async () => {
  const s = await sovereignExternalScenario(), work = await mkdtemp(join(tmpdir(), 'sovereign-one-operator-'));
  try {
    const files: any = { 'selection.json': s.initialSelections[0], 'view.json': s.initial[0], 'incoming.json': s.incoming,
      'own-private.json': await crypto.subtle.exportKey('jwk', s.s.keys[0].privateKey), 'other-private.json': await crypto.subtle.exportKey('jwk', s.s.keys[1].privateKey) };
    for (const [name, value] of Object.entries(files)) await writeFile(join(work, name), JSON.stringify(value));
    const command = new URL('../scripts/sovereign-bootstrap-external.mjs', import.meta.url).pathname;
    const run = (key: string, out: string) => spawnSync(process.execPath, ['--experimental-strip-types', command, 'checkpoint', join(work,'selection.json'), join(work,'view.json'), join(work,'incoming.json'), join(work,key), join(work,out)], { encoding:'utf8', timeout:30000 });
    const wrong = run('other-private.json','wrong'); assert.notEqual(wrong.status, 0); assert.match(wrong.stderr, /LOCAL_KEY_DOES_NOT_MATCH_PRESELECTED_ROOT/);
    const right = run('own-private.json','signed'); assert.equal(right.status,0,right.stderr);
    const view = parseEvidenceJson(await readFile(join(work,'signed/view.json'),'utf8')) as any, selection = parseEvidenceJson(await readFile(join(work,'signed/selection.json'),'utf8')) as any;
    assert.deepEqual(view.history,s.initial[0].history); assert.deepEqual(selection.root,s.initialSelections[0].root);
    assert.equal((await assessSovereignEncounter({selection,view})).conflict_evidence_level,'E2 SIGNED');
    // Drive the same offline adapter from both local perspectives. The test
    // driver owns both stores; actual independent administration is UNOBSERVED.
    for (const [name, value] of Object.entries({ 'A-pin.json':s.selections[0], 'B-pin.json':s.selections[1], 'A-view.json':s.views[0], 'B-view.json':s.views[1], 'views.json':{views:s.views} })) await writeFile(join(work,name),JSON.stringify(value));
    const invoke = (op:string, side:string, input:string, extra:string[]) => {
      const r=spawnSync(process.execPath,['--experimental-strip-types',command,op,join(work,side+'-pin.json'),join(work,side+'-view.json'),join(work,input),...extra],{encoding:'utf8',timeout:30000});
      assert.equal(r.status,0,r.stderr); return parseEvidenceJson(r.stdout) as any;
    };
    invoke('propose','A','views.json',[join(work,'own-private.json'),join(work,'proposal')]);
    const draft=parseEvidenceJson(await readFile(join(work,'proposal/proposal-bundle.json'),'utf8')) as any; await writeFile(join(work,'draft.json'),JSON.stringify(draft));
    for(const [side,key] of [['A','own-private.json'],['B','other-private.json']]) {
      invoke('decide',side,'draft.json',[join(work,key),draft.proposal.receipt_id,'ADMIT',join(work,side+'-choice')]);
      draft.decisions.push(parseEvidenceJson(await readFile(join(work,side+'-choice/local-decision.json'),'utf8')));
    }
    await writeFile(join(work,'chosen.json'),JSON.stringify(draft));
    const incomplete = spawnSync(process.execPath,['--experimental-strip-types',command,'verify',join(work,'A-pin.json'),join(work,'A-view.json'),join(work,'chosen.json')],{encoding:'utf8',timeout:30000});
    assert.equal(incomplete.status,1); hold(parseEvidenceJson(incomplete.stdout),'BOTH_SOVEREIGN_EDGE_CLOSURES_REQUIRED');
    for(const [side,key] of [['A','own-private.json'],['B','other-private.json']]) {
      invoke('close',side,'chosen.json',[join(work,key),join(work,side+'-close')]);
      draft.closures.push(parseEvidenceJson(await readFile(join(work,side+'-close/local-closure.json'),'utf8')));
    }
    await writeFile(join(work,'complete.json'),JSON.stringify(draft));
    const a=invoke('verify','A','complete.json',[]), b=invoke('verify','B','complete.json',[]);
    assert.equal(a.status,'MUTUALLY_WITNESSED'); assert.equal(b.joint_edge_id,a.joint_edge_id); assert.equal(a.administrative_independence,'UNOBSERVED');
  } finally { await rm(work,{recursive:true,force:true}); }
});
