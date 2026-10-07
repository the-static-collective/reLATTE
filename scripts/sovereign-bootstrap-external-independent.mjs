/** Native independent policy/knowledge verifier. No primary assessment imports.
 * Shares native receipt primitives, strict JSON ingress and protocol specs.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { canon, signedRecord, fingerprint, publicOnly } from './foundation-of-trust-independent.mjs';
import { parseEvidenceJson } from '../src/evidence-json.ts';
const need = (ok, code) => { if (!ok) throw new Error(code); };
const exact = (v, fields, code) => need(v && typeof v === 'object' && !Array.isArray(v) && canon(Object.keys(v).sort()) === canon([...fields].sort()), code);
const sorted = ids => canon([...ids].sort());
const hash = (domain, v) => createHash('sha256').update(domain + canon(v)).digest('hex');
const ext = (r, n) => r?.extensions?.[n];
const key = v => fingerprint(v.history.records[0]);
const top = v => v.history.records.at(-1).receipt_id;
const logTop = v => v.observations.at(-1)?.receipt_id ?? null;
const role = v => ext(v.history.records.find(r => ext(r,'bootstrap_journal').kind === 'DELEGATE_POLICY'),'bootstrap_journal').data;
const policyId = v => ext(v.history.records.find(r => ext(r,'bootstrap_journal').kind === 'SELECT_POLICY'),'bootstrap_journal').data.claim_id;
const pin = v => ({ root: { admin_id:v.history.admin_id,key:key(v),genesis_id:v.history.records[0].receipt_id,head_id:top(v) }, observation_head:logTop(v) });
function signed(r) { signedRecord(r); need(r.kind === 'RECEIVED' && r.semantic_effect === 'none', 'SOVEREIGN_RECEIPT_ROLE_MISMATCH'); }
function conflicts(view, records) {
  const rmap = new Map(records.map(r => [r.receipt_id,r])), claims = [], delegated = role(view);
  for (const r of records) {
    const k = fingerprint(r), p = ext(r,'bootstrap_policy'), j = ext(r,'bootstrap_journal'), d = ext(r,'bootstrap_decision');
    if (p && k === delegated.policy_key && p.slot === delegated.slot && p.version === delegated.version) {
      exact(r.extensions,['bootstrap_policy'],'INVALID_SIGNED_POLICY_ACCOUNT'); exact(p,['schema','slot','version','scope','basis_heads','terms'],'INVALID_SIGNED_POLICY_ACCOUNT'); exact(p.terms,['handoff_rule'],'INVALID_SIGNED_POLICY_ACCOUNT');
      need(p.schema === 'relatte.bootstrap-policy/v0' && p.scope === 'ONE_RULE_FOR_BOTH_ADMINS' && r.crossing_id === 'bootstrap:policy:' + p.slot && ['SOURCE_MAY_SELF_ADMIT','RECEIVER_MUST_ATTEST'].includes(p.terms.handoff_rule),'INVALID_SIGNED_POLICY_ACCOUNT');
      claims.push({r,kind:'POLICY_EQUIVOCATION',key:k,ctx:{slot:p.slot,version:p.version,scope:p.scope},account:p.terms});
    }
    if (j && j.parent !== null) {
      exact(r.extensions,['bootstrap_journal'],'INVALID_SIGNED_HISTORY_ACCOUNT'); exact(j,['schema','admin_id','kind','parent','data'],'INVALID_SIGNED_HISTORY_ACCOUNT');
      need(j.schema === 'relatte.bootstrap-journal/v0' && r.world_id === j.admin_id && r.receiver_particular === j.admin_id && r.crossing_id === j.parent,'INVALID_SIGNED_HISTORY_ACCOUNT');
      claims.push({r,kind:'ROOT_HISTORY_EQUIVOCATION',key:k,ctx:{admin_id:j.admin_id,parent:j.parent},account:{kind:j.kind,data:j.data}});
    }
    if (d) {
      exact(r.extensions,['bootstrap_decision'],'INVALID_SIGNED_ACTIVATION_ACCOUNT'); exact(d,['schema','admin_id','proposal_id','base_head','local_genesis','peer_key','peer_genesis','decision','scope','selection_basis','decision_nonce'],'INVALID_SIGNED_ACTIVATION_ACCOUNT');
      const pr = rmap.get(d.proposal_id), pb = ext(pr,'bootstrap_proposal'); need(pb,'ACTIVATION_PROPOSAL_UNAVAILABLE');
      exact(pr.extensions,['bootstrap_proposal'],'INVALID_SIGNED_ACTIVATION_ACCOUNT'); exact(pb,['schema','proposal_nonce','slot','version','participants','conflict_ids','terms','activation','history_mode'],'INVALID_SIGNED_ACTIVATION_ACCOUNT');
      need(pb.schema === 'relatte.bootstrap-proposal/v0' && typeof pb.slot === 'string' && Number.isSafeInteger(pb.version) && Array.isArray(pb.participants),'INVALID_SIGNED_ACTIVATION_ACCOUNT');
      const own=pb.participants.find(p=>p.admin_id===d.admin_id && p.key===k), peer=pb.participants.find(p=>p.admin_id!==d.admin_id), proposer=pb.participants.find(p=>p.key===fingerprint(pr));
      need(own && proposer && pr.world_id===proposer.admin_id && pr.receiver_particular===proposer.admin_id && d.schema==='relatte.bootstrap-local-decision/v0' && r.world_id===d.admin_id && r.receiver_particular===d.admin_id && r.crossing_id===d.proposal_id && own.head_id===d.base_head && own.genesis_id===d.local_genesis && ['ADMIT','REFUSE'].includes(d.decision),'SIGNED_ACTIVATION_ROLE_MISMATCH');
      need(peer&&d.peer_key===peer.key&&d.peer_genesis===peer.genesis_id&&d.scope==='THIS_FUTURE_POLICY_EDGE_ONLY'&&d.selection_basis==='EXPLICIT_LOCAL_ROOT_DECISION','SIGNED_ACTIVATION_SCOPE_MISMATCH');
      claims.push({r,kind:'ROOT_ACTIVATION_EQUIVOCATION',key:k,ctx:{admin_id:d.admin_id,slot:pb.slot,version:pb.version,base_head:d.base_head,genesis:d.local_genesis},account:{proposal_id:d.proposal_id,decision:d.decision}});
    }
    const f=ext(r,'sovereign_edge_decision');
    if(f) {
      exact(r.extensions,['sovereign_edge_decision'],'INVALID_SIGNED_ACTIVATION_ACCOUNT'); exact(f,['schema','admin_id','proposal_id','slot','version','own_genesis','own_history_head','own_observation_head','peer_key','peer_genesis','acknowledged_conflicts','decision','scope','sovereignty_import'],'INVALID_SIGNED_ACTIVATION_ACCOUNT');
      const pr=rmap.get(f.proposal_id),pb=ext(pr,'sovereign_reconciliation');need(pb,'ACTIVATION_PROPOSAL_UNAVAILABLE');exact(pr.extensions,['sovereign_reconciliation'],'INVALID_SIGNED_ACTIVATION_ACCOUNT');exact(pb,['schema','nonce','slot','version','participants','conflict_ids','archive_ids','scope','history_rewrite','sovereignty_import','conflict_erasure','activation'],'INVALID_SIGNED_ACTIVATION_ACCOUNT');need(pb.schema==='relatte.sovereign-reconciliation/v0'&&Array.isArray(pb.participants)&&Number.isSafeInteger(pb.version),'INVALID_SIGNED_ACTIVATION_ACCOUNT');
      const own=pb.participants.find(p=>p.admin_id===f.admin_id&&p.key===k),peer=pb.participants.find(p=>p.admin_id!==f.admin_id),proposer=pb.participants.find(p=>p.key===fingerprint(pr));
      need(own&&peer&&proposer&&pr.world_id===proposer.admin_id&&pr.receiver_particular===proposer.admin_id&&f.schema==='relatte.sovereign-edge-decision/v0'&&r.world_id===f.admin_id&&r.receiver_particular===f.admin_id&&r.crossing_id===f.proposal_id&&f.slot===pb.slot&&f.version===pb.version&&f.own_genesis===own.genesis_id&&f.own_history_head===own.head_id&&f.own_observation_head===own.observation_head&&['ADMIT','REFUSE'].includes(f.decision),'SIGNED_ACTIVATION_ROLE_MISMATCH');
      need(f.peer_key===peer.key&&f.peer_genesis===peer.genesis_id&&f.scope==='THIS_NEW_EDGE_ONLY'&&f.sovereignty_import===false&&Array.isArray(f.acknowledged_conflicts)&&sorted(f.acknowledged_conflicts)===sorted(pb.conflict_ids),'SIGNED_ACTIVATION_SCOPE_MISMATCH');
      claims.push({r,kind:'ROOT_ACTIVATION_EQUIVOCATION',key:k,ctx:{admin_id:f.admin_id,slot:pb.slot,version:pb.version,base_head:f.own_history_head,genesis:f.own_genesis},account:{proposal_id:f.proposal_id,decision:f.decision}});
    }
  }
  const result=new Map();
  for(let i=0;i<claims.length;i++) for(let j=i+1;j<claims.length;j++) {
    const a=claims[i],b=claims[j]; if(a.kind!==b.kind || a.key!==b.key || canon(a.ctx)!==canon(b.ctx) || canon(a.account)===canon(b.account)) continue;
    const context=canon({kind:a.kind,key:a.key,context:a.ctx}), claim_ids=[a.r.receipt_id,b.r.receipt_id].sort();
    const id='relatte-signed-conflict-v0:'+hash('reLATTE-SignedConflict-v0|',{context,claim_ids}); result.set(id,{id,kind:a.kind,key:a.key,claim_ids,evidence_level:'E2 SIGNED',authority:'UNOBSERVED'});
  }
  return [...result.values()].sort((a,b)=>a.id.localeCompare(b.id));
}
export function independentlyEncounter(selection, view, incoming=[]) {
  const out={status:'HOLD',known_conflict_ids:[],reconstructed_conflicts:[],conflict_evidence_level:'E0 UNOBSERVED',peer_authority:'UNOBSERVED',administrative_independence:'UNOBSERVED',ready:false,reasons:[]};
  try {
    need(selection,'NO_LOCAL_SOVEREIGN_SELECTION');
    exact(view,['schema','history','archive','observations'],'INVALID_SOVEREIGN_VIEW'); need(view.schema==='relatte.sovereign-view/v0' && Array.isArray(view.archive) && Array.isArray(view.observations),'INVALID_SOVEREIGN_VIEW');
    canon(view.observations);publicOnly(view.observations);
    let parent=null; let ids=[],cids=[];
    for(const r of view.observations) {
      signed(r); exact(r.extensions,['sovereign_observation'],'INVALID_LOCAL_OBSERVATION'); const e=ext(r,'sovereign_observation'); exact(e,['schema','admin_id','parent','history_head','archive_ids','conflict_ids','authority_import','scope'],'INVALID_LOCAL_OBSERVATION');
      need(e.schema==='relatte.sovereign-observation/v0'&&fingerprint(r)===selection.root.key&&r.world_id===selection.root.admin_id&&r.receiver_particular===selection.root.admin_id&&e.admin_id===selection.root.admin_id&&e.history_head===selection.root.head_id&&e.parent===parent&&r.crossing_id===(parent??selection.root.head_id)&&e.authority_import===false&&e.scope==='KNOWN_SIGNED_CLAIMS_ONLY','LOCAL_OBSERVATION_BINDING_MISMATCH');
      need(Array.isArray(e.archive_ids)&&Array.isArray(e.conflict_ids)&&new Set(e.archive_ids).size===e.archive_ids.length&&new Set(e.conflict_ids).size===e.conflict_ids.length&&ids.every(id=>e.archive_ids.includes(id))&&cids.every(id=>e.conflict_ids.includes(id)),'LOCAL_KNOWLEDGE_ROLLBACK');
      ids=e.archive_ids;cids=e.conflict_ids;parent=r.receipt_id;
    }
    need(parent===selection.observation_head,'PINNED_OBSERVATION_HEAD_CHANGED'); out.known_conflict_ids=[...cids].sort();
    canon(view);publicOnly(view);
    const j=view.history; exact(j,['admin_id','records'],'INVALID_LOCAL_HISTORY'); need(Array.isArray(j.records)&&j.records.length>=3&&j.admin_id===selection.root.admin_id&&key(view)===selection.root.key&&j.records[0].receipt_id===selection.root.genesis_id,'LOCAL_SOVEREIGN_SELECTION_MISMATCH');
    parent=null;let delegated=false,selected=false;
    for(const [i,r] of j.records.entries()) {
      signed(r); exact(r.extensions,['bootstrap_journal'],'INVALID_LOCAL_HISTORY'); const e=ext(r,'bootstrap_journal'); exact(e,['schema','admin_id','kind','parent','data'],'INVALID_LOCAL_HISTORY');
      need(fingerprint(r)===selection.root.key&&r.world_id===j.admin_id&&r.receiver_particular===j.admin_id&&e.schema==='relatte.bootstrap-journal/v0'&&e.admin_id===j.admin_id&&e.parent===parent&&r.crossing_id===(parent??'bootstrap:genesis'),'LOCAL_HISTORY_BINDING_MISMATCH');
      if(!i) need(e.kind==='GENESIS'&&e.data.scope==='SOVEREIGN_LOCAL_ROOT','LOCAL_GENESIS_REQUIRED');
      else if(e.kind==='DELEGATE_POLICY') { need(!delegated&&!selected&&e.data.scope==='ONE_DECLARED_POLICY_SLOT'&&e.data.policy_key!==selection.root.key&&typeof e.data.slot==='string'&&Number.isSafeInteger(e.data.version),'INVALID_LOCAL_DELEGATION'); delegated=true; }
      else if(e.kind==='SELECT_POLICY') { need(delegated&&!selected&&typeof e.data.claim_id==='string','INVALID_LOCAL_POLICY_SELECTION'); selected=true; }
      else need(e.kind==='OBSERVE_CONFLICT'&&selected,'UNSUPPORTED_LOCAL_HISTORY_EVENT'); parent=r.receipt_id;
    }
    need(delegated&&selected&&top(view)===selection.root.head_id,'PINNED_SOVEREIGN_HISTORY_CHANGED');
    const map=new Map(); for(const r of view.archive) { signed(r);need(!map.has(r.receipt_id),'DUPLICATE_LOCAL_ARCHIVE_ID');map.set(r.receipt_id,r); }
    need(j.records.every(r=>map.has(r.receipt_id))&&map.has(policyId(view)),'LOCAL_INITIAL_RECORD_UNAVAILABLE');
    const p=ext(map.get(policyId(view)),'bootstrap_policy'),d=role(view);
    need(p&&fingerprint(map.get(policyId(view)))===d.policy_key&&p.slot===d.slot&&p.version===d.version&&p.basis_heads.includes(j.records.find(r=>ext(r,'bootstrap_journal').kind==='DELEGATE_POLICY').receipt_id),'LOCAL_SELECTED_POLICY_BINDING_MISMATCH');
    if(parent) need(sorted(ids)===sorted([...map.keys()]),'KNOWN_ARCHIVE_EVIDENCE_MISSING_OR_CHANGED');
    for(const r of view.observations) { const e=ext(r,'sovereign_observation'); need(sorted(conflicts(view,e.archive_ids.map(id=>map.get(id))).map(c=>c.id))===sorted(e.conflict_ids),'LOCAL_CONFLICT_RECORD_NOT_REPRODUCIBLE'); }
    let cs=conflicts(view,[...map.values()]); out.reconstructed_conflicts=cs;out.known_conflict_ids=[...new Set([...out.known_conflict_ids,...cs.map(c=>c.id)])].sort(); if(cs.length)out.conflict_evidence_level='E2 SIGNED';
    canon(incoming);publicOnly(incoming);need(Array.isArray(incoming),'INVALID_ENCOUNTER_INPUT'); for(const r of incoming) {signed(r);if(!map.has(r.receipt_id))map.set(r.receipt_id,r);}
    cs=conflicts(view,[...map.values()]);need(out.known_conflict_ids.every(id=>cs.some(c=>c.id===id)),'KNOWN_CONFLICT_DISAPPEARED');out.reconstructed_conflicts=cs;out.known_conflict_ids=cs.map(c=>c.id);if(cs.length)out.conflict_evidence_level='E2 SIGNED';out.ready=true;out.reasons.push(...new Set(cs.map(c=>c.kind)),'PEER_AUTHORITY_NOT_IMPORTED','FRESH_BILATERAL_ACT_REQUIRED');
  } catch(e){out.reasons.push(e.message);} return out;
}
export function independentlySovereignEdge(selection,bundle,localView) {
  const out={status:'HOLD',evidence_level:'E0 UNOBSERVED',joint_edge_id:null,known_conflict_ids:[],foreign_sovereignty_imported:false,administrative_independence:'UNOBSERVED',reasons:[]};
  try {
    need(selection,'NO_LOCAL_SOVEREIGN_SELECTION');
    if(localView) {const prior=independentlyEncounter(selection,localView);out.known_conflict_ids=prior.known_conflict_ids;need(prior.ready,prior.reasons.at(-1));}
    need(Array.isArray(bundle.views),'INVALID_SOVEREIGN_EDGE');const own=bundle.views.find(v=>v.history.admin_id===selection.root.admin_id);need(own,'LOCAL_VIEW_UNAVAILABLE');
    if(localView)need(canon(own)===canon(localView),'RETAINED_LOCAL_VIEW_REPLACEMENT');
    const local=independentlyEncounter(selection,own);out.known_conflict_ids=local.known_conflict_ids;need(local.ready,local.reasons.at(-1));
    canon(bundle);publicOnly(bundle);exact(bundle,['schema','views','proposal','decisions','closures'],'INVALID_SOVEREIGN_EDGE');need(bundle.schema==='relatte.sovereign-edge-bundle/v0'&&Array.isArray(bundle.decisions)&&Array.isArray(bundle.closures),'INVALID_SOVEREIGN_EDGE');
    need(bundle.views.length===2&&new Set(bundle.views.map(key)).size===2&&new Set(bundle.views.map(v=>v.history.admin_id)).size===2,'SOVEREIGN_ROOT_KEYS_OR_LABELS_NOT_DISTINCT');
    const role0=role(own);for(const v of bundle.views){need(independentlyEncounter(pin(v),v).ready,'PRIOR_KNOWLEDGE_NOT_RECONSTRUCTIBLE');need(logTop(v),'BOTH_LOCAL_OBSERVATIONS_REQUIRED');need(canon(role(v))===canon(role0),'NO_COMMON_DECLARED_POLICY_SLOT');}
    const archive=[...new Map(bundle.views.flatMap(v=>v.archive).map(r=>[r.receipt_id,r])).values()], cs=conflicts(own,archive);need(cs.some(c=>c.kind==='POLICY_EQUIVOCATION'),'POLICY_EQUIVOCATION_UNOBSERVED');const cids=cs.map(c=>c.id);
    const keys=new Set(bundle.views.map(key)),cited=new Set(archive.filter(r=>keys.has(fingerprint(r))&&(ext(r,'bootstrap_decision')||ext(r,'sovereign_edge_decision'))).map(r=>(ext(r,'bootstrap_decision')??ext(r,'sovereign_edge_decision')).proposal_id));let priorVersion=role0.version;
    for(const r of archive){const p=ext(r,'bootstrap_proposal')??ext(r,'sovereign_reconciliation');if(cited.has(r.receipt_id)&&p?.slot===role0.slot&&Number.isSafeInteger(p.version))priorVersion=Math.max(priorVersion,p.version);}need(Number.isSafeInteger(priorVersion+1),'POLICY_VERSION_OVERFLOW');
    signed(bundle.proposal);exact(bundle.proposal.extensions,['sovereign_reconciliation'],'INVALID_RECONCILIATION_PROPOSAL');const p=ext(bundle.proposal,'sovereign_reconciliation');
    exact(p,['schema','nonce','slot','version','participants','conflict_ids','archive_ids','scope','history_rewrite','sovereignty_import','conflict_erasure','activation'],'INVALID_RECONCILIATION_PROPOSAL');
    need(typeof p.nonce==='string'&&p.nonce.length,'INVALID_RECONCILIATION_NONCE');need(p.history_rewrite===false&&p.sovereignty_import===false&&p.conflict_erasure===false&&p.scope==='THIS_NEW_EDGE_ONLY','SOVEREIGNTY_IMPORT_OR_PAST_REWRITE_FORBIDDEN');need(sorted(p.conflict_ids)===sorted(cids),'KNOWN_CONTRADICTION_NOT_ACKNOWLEDGED');need(p.slot===role0.slot&&p.version===priorVersion+1,'FRESH_POLICY_VERSION_REQUIRED');
    const participants=bundle.views.map(v=>({...pin(v).root,observation_head:logTop(v),original_policy_id:policyId(v),view_digest:hash('reLATTE-SovereignView-v0|',v)}));
    need(p.schema==='relatte.sovereign-reconciliation/v0'&&canon(p.participants)===canon(participants)&&sorted(p.archive_ids)===sorted(archive.map(r=>r.receipt_id))&&p.activation==='AFTER_BOTH_LOCAL_DECISIONS_AND_CLOSURES','RECONCILIATION_PAST_OR_SCOPE_MISMATCH');
    const proposer=participants.find(p=>p.key===fingerprint(bundle.proposal));need(proposer&&bundle.proposal.world_id===proposer.admin_id&&bundle.proposal.receiver_particular===proposer.admin_id&&bundle.proposal.crossing_id==='sovereign:reconcile:'+sorted(bundle.views.map(logTop)),'RECONCILIATION_PROPOSER_OR_PARENT_MISMATCH');out.known_conflict_ids=cids;
    const seen=new Set();for(const r of bundle.decisions){signed(r);exact(r.extensions,['sovereign_edge_decision'],'INVALID_SOVEREIGN_EDGE_DECISION');const d=ext(r,'sovereign_edge_decision');exact(d,['schema','admin_id','proposal_id','slot','version','own_genesis','own_history_head','own_observation_head','peer_key','peer_genesis','acknowledged_conflicts','decision','scope','sovereignty_import'],'INVALID_SOVEREIGN_EDGE_DECISION');
      const member=participants.find(p=>p.admin_id===d.admin_id),peer=participants.find(p=>p.admin_id!==d.admin_id);need(member&&peer&&member.key===fingerprint(r)&&r.world_id===d.admin_id&&r.receiver_particular===d.admin_id,'SOVEREIGN_EDGE_DECISION_SIGNER_OR_ROLE_MISMATCH');need(d.schema==='relatte.sovereign-edge-decision/v0'&&d.proposal_id===bundle.proposal.receipt_id&&r.crossing_id===d.proposal_id&&d.slot===p.slot&&d.version===p.version&&d.own_genesis===member.genesis_id&&d.own_history_head===member.head_id&&d.own_observation_head===member.observation_head,'SOVEREIGN_EDGE_DECISION_PARENT_MISMATCH');need(d.peer_key===peer.key&&d.peer_genesis===peer.genesis_id&&d.scope==='THIS_NEW_EDGE_ONLY'&&d.sovereignty_import===false,'EXPLICIT_SCOPED_PEER_CHOICE_REQUIRED');need(Array.isArray(d.acknowledged_conflicts)&&sorted(d.acknowledged_conflicts)===sorted(cids),'LOCAL_CONTRADICTION_NOT_ACKNOWLEDGED');need(!seen.has(d.admin_id),'SOVEREIGN_EDGE_DECISION_EQUIVOCATION_OR_DUPLICATE');seen.add(d.admin_id);need(d.decision==='ADMIT','SOVEREIGN_EDGE_LOCALLY_REFUSED');}
    need(seen.size===2,'BOTH_FRESH_SOVEREIGN_DECISIONS_REQUIRED');const closed=new Set(),{closures:_,...core}=bundle;
    for(const r of bundle.closures){signed(r);exact(r.extensions,['sovereign_edge_closure'],'INVALID_SOVEREIGN_EDGE_CLOSURE');const c=ext(r,'sovereign_edge_closure');exact(c,['schema','admin_id','proposal_id','core_digest','scope'],'INVALID_SOVEREIGN_EDGE_CLOSURE');const member=participants.find(p=>p.admin_id===c.admin_id);need(member&&member.key===fingerprint(r)&&r.world_id===c.admin_id&&r.receiver_particular===c.admin_id,'SOVEREIGN_EDGE_CLOSURE_SIGNER_MISMATCH');need(c.schema==='relatte.sovereign-edge-closure/v0'&&c.proposal_id===bundle.proposal.receipt_id&&r.crossing_id===c.proposal_id&&c.scope==='THIS_FROZEN_EDGE_ONLY','SOVEREIGN_EDGE_CLOSURE_BINDING_MISMATCH');need(c.core_digest===hash('reLATTE-SovereignEdgeCore-v0|',core),'FROZEN_SOVEREIGN_EDGE_EVIDENCE_CHANGED');need(!closed.has(c.admin_id),'DUPLICATE_SOVEREIGN_EDGE_CLOSURE');closed.add(c.admin_id);}
    need(closed.size===2,'BOTH_SOVEREIGN_EDGE_CLOSURES_REQUIRED');out.status='MUTUALLY_WITNESSED';out.evidence_level='E3 CORROBORATED-KEYS';out.joint_edge_id='relatte-sovereign-edge-v0:'+hash('reLATTE-SovereignEdge-v0|',{proposal_id:bundle.proposal.receipt_id,decisions:bundle.decisions.map(r=>r.receipt_id).sort()});
  }catch(e){out.reasons.push(e.message);}return out;
}
if(process.argv[1]&&resolve(process.argv[1])===new URL(import.meta.url).pathname){const [selectionPath,bundlePath,localViewPath]=process.argv.slice(2),load=async path=>parseEvidenceJson(await readFile(path,'utf8'));const result=independentlySovereignEdge(await load(selectionPath),await load(bundlePath),localViewPath?await load(localViewPath):undefined);process.stdout.write(JSON.stringify(result,null,2)+'\n');process.exitCode=result.status==='MUTUALLY_WITNESSED'?0:1;}
