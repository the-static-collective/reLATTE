/** Offline, one-sovereign operator adapter. Takes existing locally selected
 * root/history and ONE existing private key. No init/root creation, network
 * coordination, peer-key loading or administrative-independence promotion.
 */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  parseEvidenceJson, forbidPrivateEvidence, signingKeyIdentity, sealReceipt,
  assessSovereignEncounter, assessSovereignEdge, sovereignProposalDraft, sovereignSelection, sovereignEdgeCoreDigest, sovereignViewDigest,
} from '../src/index.ts';
const [op, selectionPath, localViewPath, publicInputPath, ...rest] = process.argv.slice(2);
const load = async path => parseEvidenceJson(await readFile(path, 'utf8'));
const need = (ok, code) => { if (!ok) throw new Error(code); };
const selection = await load(selectionPath), local_view = await load(localViewPath), input = await load(publicInputPath);
forbidPrivateEvidence(selection);forbidPrivateEvidence(local_view);forbidPrivateEvidence(input);
const local = await assessSovereignEncounter({ selection, view:local_view });
if(!['inspect','verify'].includes(op))need(local.observation_draft,local.reasons.at(-1));
async function keys(path) {
  const jwk = await load(path); need(jwk.d,'EXISTING_PRIVATE_KEY_REQUIRED'); const {d:_,...publicKeyJwk}=jwk;
  need(signingKeyIdentity({signing:{public_key:publicKeyJwk}})===selection.root.key,'LOCAL_KEY_DOES_NOT_MATCH_PRESELECTED_ROOT');
  const privateKey = await crypto.subtle.importKey('jwk',jwk,{name:'ECDSA',namedCurve:'P-256'},false,['sign']); return {privateKey,publicKeyJwk};
}
async function receipt(extension,data,keyPath,crossing) {
  return sealReceipt({schema:'relatte.receipt/v0',crossing_id:crossing,world_id:selection.root.admin_id,receiver_particular:selection.root.admin_id,
    kind:'RECEIVED',semantic_effect:'none',created_at:new Date().toISOString(),extensions:{[extension]:data}},await keys(keyPath));
}
async function save(dir,name,value) {forbidPrivateEvidence(value);await mkdir(dir,{recursive:true});await writeFile(join(dir,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});}
let result;
if(op==='inspect') result=await assessSovereignEncounter({selection,view:local_view,incoming:input});
else if(op==='checkpoint') {
  const [keyPath,outDir]=rest,r=await assessSovereignEncounter({selection,view:local_view,incoming:input});need(r.observation_draft,r.reasons.at(-1));
  const observed=await receipt('sovereign_observation',r.observation_draft,keyPath,r.observation_draft.parent??selection.root.head_id);
  const view={...local_view,archive:r.archive,observations:[...local_view.observations,observed]}, next={...selection,observation_head:observed.receipt_id};
  await save(outDir,'view.json',view);await save(outDir,'selection.json',next);result={status:'SIGNED_LOCAL_KNOWLEDGE',evidence_level:'E2 SIGNED',known_conflict_ids:r.known_conflict_ids,administrative_independence:'UNOBSERVED'};
} else if(op==='propose') {
  const [keyPath,outDir]=rest;need(Array.isArray(input.views),'PUBLIC_VIEWS_REQUIRED');const own=input.views.find(v=>v.history.admin_id===selection.root.admin_id);
  need(own&&sovereignViewDigest(own)===sovereignViewDigest(local_view),'RETAINED_LOCAL_VIEW_REPLACEMENT');
  const draft=await sovereignProposalDraft(input.views),proposal=await receipt('sovereign_reconciliation',draft,keyPath,'sovereign:reconcile:'+JSON.stringify(input.views.map(v=>sovereignSelection(v).observation_head).sort()));
  const bundle={schema:'relatte.sovereign-edge-bundle/v0',views:input.views,proposal,decisions:[],closures:[]};await save(outDir,'proposal-bundle.json',bundle);result={status:'SIGNED_PROPOSAL_ONLY',evidence_level:'E2 SIGNED',proposal_id:proposal.receipt_id,authority_scope:'NONE',administrative_independence:'UNOBSERVED'};
} else if(op==='decide') {
  const [keyPath,exactProposalId,choice,outDir]=rest;need(['ADMIT','REFUSE'].includes(choice),'EXPLICIT_LOCAL_CHOICE_REQUIRED');need(exactProposalId===input.proposal.receipt_id,'EXACT_PROPOSAL_ID_REQUIRED');
  const verified=await assessSovereignEdge({selection,bundle:input,local_view});need(verified.ready_for_decision,verified.reasons.at(-1));
  const p=input.proposal.extensions.sovereign_reconciliation,own=p.participants.find(p=>p.admin_id===selection.root.admin_id),peer=p.participants.find(p=>p.admin_id!==selection.root.admin_id);
  const d={schema:'relatte.sovereign-edge-decision/v0',admin_id:own.admin_id,proposal_id:input.proposal.receipt_id,slot:p.slot,version:p.version,
    own_genesis:own.genesis_id,own_history_head:own.head_id,own_observation_head:own.observation_head,peer_key:peer.key,peer_genesis:peer.genesis_id,
    acknowledged_conflicts:p.conflict_ids,decision:choice,scope:'THIS_NEW_EDGE_ONLY',sovereignty_import:false};
  const record=await receipt('sovereign_edge_decision',d,keyPath,input.proposal.receipt_id);await save(outDir,'local-decision.json',record);result={status:'SIGNED_SCOPED_LOCAL_DECISION',evidence_level:'E2 SIGNED',decision:choice,proposal_id:input.proposal.receipt_id,administrative_independence:'UNOBSERVED'};
} else if(op==='close') {
  const [keyPath,outDir]=rest;const verified=await assessSovereignEdge({selection,bundle:input,local_view});need(verified.ready_for_closure,verified.reasons.at(-1));
  const c={schema:'relatte.sovereign-edge-closure/v0',admin_id:selection.root.admin_id,proposal_id:input.proposal.receipt_id,core_digest:sovereignEdgeCoreDigest(input),scope:'THIS_FROZEN_EDGE_ONLY'};
  await save(outDir,'local-closure.json',await receipt('sovereign_edge_closure',c,keyPath,input.proposal.receipt_id));result={status:'SIGNED_FROZEN_EDGE_CLOSURE',evidence_level:'E2 SIGNED',administrative_independence:'UNOBSERVED'};
} else if(op==='verify') result=await assessSovereignEdge({selection,bundle:input,local_view});
else throw new Error('USAGE: inspect|checkpoint|propose|decide|close|verify <existing-selection> <retained-local-view> <public-input> [one-existing-private-key] [exact-proposal-id ADMIT|REFUSE] [new-output-directory]');
forbidPrivateEvidence(result);process.stdout.write(JSON.stringify(result,null,2)+'\n');
if(op==='verify'&&result.status!=='MUTUALLY_WITNESSED')process.exitCode=1;
