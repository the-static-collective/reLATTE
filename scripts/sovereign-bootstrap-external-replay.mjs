/** Replay local malicious-admin evidence. External execution is separately
 * and explicitly NOT_EXECUTED until real operators supply retained inputs. */
import { readFile, mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { parseEvidenceJson, forbidPrivateEvidence, assessSovereignEncounter, assessSovereignEdge, assessTrustBootstrap, canonicalize, validateTrustRootGraph } from '../src/index.ts';
import { sovereignExternalScenario } from '../test/support/sovereign-external.ts';
import { independentlyEncounter, independentlySovereignEdge } from './sovereign-bootstrap-external-independent.mjs';
const defaultDir=new URL('../fixtures/sovereign-bootstrap-external-001/',import.meta.url).pathname;
const need=(ok,code)=>{if(!ok)throw new Error(code);};
export async function generateSovereignFixtures(dir) {
  const s=await sovereignExternalScenario(),report={schema:'relatte.sovereign-local-campaign/v0',external_execution:'NOT_EXECUTED',administrative_independence:'UNOBSERVED',shared_orchestration_absence:'UNOBSERVED',local_observers:[],local_edges:[]};
  for(let i=0;i<2;i++) {
    const primary=await assessSovereignEncounter({selection:s.selections[i],view:s.views[i]}),secondary=independentlyEncounter(s.selections[i],s.views[i]);
    need(primary.known_conflict_ids.length>=2&&canonicalize(primary.known_conflict_ids)===canonicalize(secondary.known_conflict_ids),'KNOWLEDGE_IMPLEMENTATION_DISAGREEMENT');
    const p=await assessSovereignEdge({selection:s.selections[i],bundle:s.bundle,local_view:s.views[i]}),d=independentlySovereignEdge(s.selections[i],s.bundle,s.views[i]);need(p.status==='MUTUALLY_WITNESSED'&&d.joint_edge_id===p.joint_edge_id,'EDGE_IMPLEMENTATION_DISAGREEMENT');
    report.local_observers.push({side:['A','B'][i],primary,secondary});report.local_edges.push({side:['A','B'][i],primary:p,secondary:d});
  }
  const lost=structuredClone(s.views[0]);lost.archive=lost.archive.filter(r=>r.receipt_id!==s.hostileClaims[3].receipt_id);
  const loss=await assessSovereignEncounter({selection:s.selections[0],view:lost});need(loss.known_conflict_ids.length>=2&&!loss.observation_draft,'KNOWN_CONTRADICTION_ERASED');
  const oldFull=await assessTrustBootstrap({bundle:s.s.bundle,local_root:s.s.roots[0]}),oldTruncated=structuredClone(s.s.bundle);oldTruncated.policy_claims.pop();
  const oldLoss=await assessTrustBootstrap({bundle:oldTruncated,local_root:s.s.roots[0]});
  need(oldFull.conflict==='EQUIVOCATION'&&oldLoss.status==='HOLD'&&oldLoss.conflict==='UNOBSERVED','PRIOR_STATELESS_LOSS_SPECIMEN_CHANGED');
  const files={'bundle.json':s.bundle,'selection-A.json':s.selections[0],'selection-B.json':s.selections[1],'view-A.json':s.views[0],'view-B.json':s.views[1],
    'initial-A.json':s.initial[0],'initial-B.json':s.initial[1],'initial-selection-A.json':s.initialSelections[0],'initial-selection-B.json':s.initialSelections[1],
    'hostile-incoming.json':s.incoming,'report.json':report,'known-loss.json':{selection:s.selections[0],view:lost,assessment:loss},
    'prior-stateless-loss.json':{schema:'relatte.sovereign-prior-loss-specimen/v0',baseline_sha:'a8f975b027b850f90f306622663b4fbfc82177fa',bundle:s.s.bundle,local_root:s.s.roots[0],before:oldFull,after:oldLoss,
      limitation:'OLD_ASSESSOR_FAILS_CLOSED_BUT_HAS_NO_SEPARATE_REMEMBERED_CONFLICT_FACET',new_loss:loss},
    'external-inputs.json':{schema:'relatte.sovereign-external-inputs/v0',experiment:'SOVEREIGN-BOOTSTRAP-EXTERNAL-001',status:'BLOCKED_EXTERNAL_INPUTS',external_execution:'NOT_EXECUTED',
      selected_external_A:null,selected_external_B:null,root_preexistence:'UNOBSERVED',independent_administration:'UNOBSERVED',independent_pin_retention:'UNOBSERVED',shared_orchestration_absence:'UNOBSERVED',
      missing:['A_EXISTING_PUBLIC_ROOT_AND_INDEPENDENTLY_RETAINED_PIN','B_EXISTING_PUBLIC_ROOT_AND_INDEPENDENTLY_RETAINED_PIN','EXTERNAL_CONTROL_AND_PREEXISTENCE_EVIDENCE','INDEPENDENT_OPERATOR_SIGNED_ACTS']}};
  await mkdir(dir,{recursive:true});for(const [name,v]of Object.entries(files)){forbidPrivateEvidence(v);await writeFile(join(dir,name),JSON.stringify(v,null,2)+'\n');}
  return report;
}
export async function replaySovereignFixtures(dir=defaultDir) {
  const load=async name=>parseEvidenceJson(await readFile(join(dir,name),'utf8')),bundle=await load('bundle.json'),statuses=[];
  for(const label of ['A','B']) {
    const selection=await load('selection-'+label+'.json'),view=await load('view-'+label+'.json');
    const primary=await assessSovereignEdge({selection,bundle,local_view:view}),secondary=independentlySovereignEdge(selection,bundle,view);
    need(primary.status==='MUTUALLY_WITNESSED'&&secondary.joint_edge_id===primary.joint_edge_id,'FROZEN_EDGE_REPLAY_FAILED');statuses.push({side:label,evidence_level:primary.evidence_level,joint_edge_id:primary.joint_edge_id});
  }
  const lost=await load('known-loss.json'),r=await assessSovereignEncounter(lost),n=independentlyEncounter(lost.selection,lost.view);need(!r.observation_draft&&r.known_conflict_ids.length>=2&&canonicalize(n.known_conflict_ids)===canonicalize(r.known_conflict_ids),'FROZEN_KNOWLEDGE_LOSS_FAILED');
  const external=await load('external-inputs.json');need(external.external_execution==='NOT_EXECUTED'&&external.independent_administration==='UNOBSERVED','LOCAL_FIXTURES_PROMOTED_TO_EXTERNAL');
  validateTrustRootGraph(await load('trust-root-graph.json'));
  // Replacement verifier gets public evidence/pins only. No private directory
  // exists in this replay path and no original root factory is invoked.
  const work=await mkdtemp(join(tmpdir(),'sovereign-cold-verifier-'));
  try {
    await writeFile(join(work,'case.json'),JSON.stringify(bundle));await writeFile(join(work,'pin.json'),JSON.stringify(await load('selection-A.json')));
    const run=spawnSync(process.execPath,['--experimental-strip-types',new URL('./sovereign-bootstrap-external-independent.mjs',import.meta.url).pathname,join(work,'pin.json'),join(work,'case.json')],{encoding:'utf8',timeout:30000});
    need(run.status===0,'COLD_REPLACEMENT_VERIFIER_FAILED:'+run.stderr);need(parseEvidenceJson(run.stdout).joint_edge_id===statuses[0].joint_edge_id,'COLD_EDGE_CHANGED');
  } finally {await rm(work,{recursive:true,force:true});}
  return {status:'LOCAL_REPLAY_PASSED',external_execution:'NOT_EXECUTED',administrative_independence:'UNOBSERVED',observers:statuses,remembered_conflicts_after_loss:r.known_conflict_ids.length};
}
if(process.argv[1]&&resolve(process.argv[1])===new URL(import.meta.url).pathname) {
  const result=process.argv[2]==='--generate'?await generateSovereignFixtures(process.argv[3]??defaultDir):await replaySovereignFixtures(process.argv[2]);
  process.stdout.write(JSON.stringify({status:result.status??'LOCAL_FIXTURES_GENERATED',external_execution:'NOT_EXECUTED',administrative_independence:'UNOBSERVED'},null,2)+'\n');
}
