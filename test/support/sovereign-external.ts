import {
  assessSovereignEncounter, sovereignSelection, sovereignProposalDraft, sovereignEdgeCoreDigest,
  type SovereignView, type SovereignSelection, type SovereignEdgeBundle, type P256KeyMaterial, type PublicRecord,
} from '../../src/index.ts';
import { bootstrapScenario, bootstrapReceipt, signDecision, signProposal } from './bootstrap.ts';

export async function recordKnowledge(view: SovereignView, selection: SovereignSelection, incoming: PublicRecord[], keys: P256KeyMaterial) {
  const result = await assessSovereignEncounter({ view, selection, incoming });
  if (!result.observation_draft) throw new Error('NOT_READY_TO_RECORD:' + result.reasons.join(','));
  const receipt = await bootstrapReceipt('sovereign_observation', result.observation_draft, keys, selection.root.admin_id, result.observation_draft.parent ?? selection.root.head_id);
  const next: SovereignView = { ...structuredClone(view), archive: result.archive, observations: [...view.observations, receipt] };
  return { view: next, selection: { ...selection, observation_head: receipt.receipt_id }, result };
}
export async function signSovereignProposal(views: SovereignView[], key: P256KeyMaterial, index = 0, changes: any = {}) {
  const draft = { ...await sovereignProposalDraft(views), ...changes };
  return bootstrapReceipt('sovereign_reconciliation', draft, key, views[index].history.admin_id,
    'sovereign:reconcile:' + JSON.stringify(views.map(v => v.observations.at(-1)!.receipt_id).sort()));
}
export async function signSovereignDecision(bundle: SovereignEdgeBundle, keys: P256KeyMaterial, index: number, changes: any = {}) {
  const p = bundle.proposal.extensions.sovereign_reconciliation, own = p.participants[index], peer = p.participants[1 - index];
  return bootstrapReceipt('sovereign_edge_decision', { schema: 'relatte.sovereign-edge-decision/v0', admin_id: own.admin_id,
    proposal_id: bundle.proposal.receipt_id, slot: p.slot, version: p.version, own_genesis: own.genesis_id,
    own_history_head: own.head_id, own_observation_head: own.observation_head, peer_key: peer.key, peer_genesis: peer.genesis_id,
    acknowledged_conflicts: p.conflict_ids, decision: 'ADMIT', scope: 'THIS_NEW_EDGE_ONLY', sovereignty_import: false,
    ...changes }, keys, own.admin_id, bundle.proposal.receipt_id);
}
export async function closeSovereignEdge(bundle: SovereignEdgeBundle, keys: P256KeyMaterial[]) {
  bundle.closures = await Promise.all(keys.map((key, i) => bootstrapReceipt('sovereign_edge_closure', {
    schema: 'relatte.sovereign-edge-closure/v0', admin_id: bundle.views[i].history.admin_id,
    proposal_id: bundle.proposal.receipt_id, core_digest: sovereignEdgeCoreDigest(bundle), scope: 'THIS_FROZEN_EDGE_ONLY',
  }, key, bundle.views[i].history.admin_id, bundle.proposal.receipt_id)));
}

/** This helper is an explicitly local adversarial simulation. Roots/admin
 * independence and absence of shared orchestration are NOT observed here. */
export async function sovereignExternalScenario() {
  const s = await bootstrapScenario();
  const views: SovereignView[] = s.beforeMeeting.journals.map((history, i) => ({ schema: 'relatte.sovereign-view/v0', history,
    archive: [...history.records, s.beforeMeeting.policy_claims[i]], observations: [] }));
  const initial = structuredClone(views), initialSelections = views.map(sovereignSelection);
  const proposal1 = await signProposal(s, s.bundle.proposal!.extensions.bootstrap_proposal, s.keys[1]);
  // B signs in its own role, rather than relying on a role/parser failure.
  const bBody = proposal1.extensions.bootstrap_proposal;
  const first = await bootstrapReceipt('bootstrap_proposal', bBody, s.keys[1], s.bundle.journals[1].admin_id, proposal1.crossing_id);
  const second = await bootstrapReceipt('bootstrap_proposal', { ...bBody, proposal_nonce: crypto.randomUUID() }, s.keys[1], s.bundle.journals[1].admin_id, proposal1.crossing_id);
  const b1 = await signDecision(s, 1, { proposal: first }), b2 = await signDecision(s, 1, { proposal: second });
  const hostileClaims = [first, second, b1, b2];
  const incoming = [...s.bundle.journals.flatMap(j => j.records), ...s.bundle.policy_claims, ...hostileClaims];
  const learned = await Promise.all(views.map((view, i) => recordKnowledge(view, initialSelections[i], incoming, s.keys[i])));
  const witnessedViews = learned.map(x => x.view), selections = learned.map(x => x.selection);
  const proposal = await signSovereignProposal(witnessedViews, s.keys[0]);
  const bundle: SovereignEdgeBundle = { schema: 'relatte.sovereign-edge-bundle/v0', views: witnessedViews, proposal, decisions: [], closures: [] };
  bundle.decisions = await Promise.all(s.keys.map((k, i) => signSovereignDecision(bundle, k, i)));
  await closeSovereignEdge(bundle, s.keys);
  return { s, initial, initialSelections, views: witnessedViews, selections, hostileClaims, incoming, bundle };
}
