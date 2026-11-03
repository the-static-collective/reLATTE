// WORLD-FORGE-005: extract a bounded procedure *only* from two actual witness
// records AND their separate operator action traces. The output is data, not code.
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {validateEvidence,HASH} from '../../world-forge-004/src/verify.mjs';

const sha256=value=>createHash('sha256').update(value).digest('hex');
const isObj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const exact=(x,fields)=>isObj(x)&&Object.keys(x).length===fields.length&&fields.every(k=>Object.hasOwn(x,k));
const digest=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const EXPECTED={
  alpha:{station:'garden',seed:'381654729',base:'minecraft:moss_block',observer:'WFWatchAlpha'},
  beta:{station:'forge',seed:'918273645',base:'minecraft:cut_copper',observer:'WFWatchBeta'}
};
const CANDIDATE_FIELDS=['format','source_sha256','donors','grammar','replay_env','disposition','execution_permission','signature','scope'];
const MATERIALS=['minecraft:moss_block','minecraft:cut_copper','minecraft:polished_blackstone','minecraft:gold_block'];
const OPS=[
  {verb:'REPLACE',expected:'$BASE',produce:'$IMPACT'},
  {verb:'RESTORE',expected:'$IMPACT',produce:'$BASE'}
];
const expectedCommands=world=>{
  const c=EXPECTED[world];
  return [
    'forceload add -32 -32 32 32',
    'tp '+c.observer+' 0 80 0',
    'execute positioned 0 80 0 run function worldforge:build_'+world,
    'execute positioned 0 80 0 run function crater:impact_'+world,
    'execute positioned 0 80 0 run function crater:visual_repair_'+world+'_'+c.station
  ];
};
export function validateDonor(world,readout,trace){
  if(!Object.hasOwn(EXPECTED,world))throw Error('unknown donor world');
  const cfg=EXPECTED[world];
  validateEvidence(readout); // WORLD-FORGE-004 validated source fixture / ordered observations
  if(readout.engine!=='minecraft-java-26.1.1'||readout.instance!==world
    ||readout.seed!==cfg.seed||readout.observer!==cfg.observer)throw Error('incorrect Minecraft witness provenance');
  if(!exact(trace,['operator','observer','observer_ops_file_verified','server_sha1','source_sha256','commands','worker_stderr','receiver']))
    throw Error('tampered author trace structure');
  if(trace.operator!=='RCON'||trace.observer!==readout.observer
    ||trace.observer_ops_file_verified!==true||trace.source_sha256!==HASH
    ||trace.receiver!=='HOLD'||!/^[0-9a-f]{40}$/.test(trace.server_sha1))throw Error('author/observer separation unverifiable');
  if(!Array.isArray(trace.commands)||trace.commands.length!==5)throw Error('wrong action count');
  const commandTexts=expectedCommands(world);
  for(let i=0;i<5;i++){
    const action=trace.commands[i];
    if(!exact(action,['role','command','response'])||action.role!=='OPERATOR_RCON'
      ||action.command!==commandTexts[i]||typeof action.response!=='string')throw Error('unverified action at '+i);
    if(/unknown function|unknown command|permission denied|failed to execute/i.test(action.response))
      throw Error('operator command failed at '+i);
  }
  const observed=readout.observations.map(o=>o.block);
  if(observed[0]!==cfg.base||observed[2]!==cfg.base||observed[1]!=='minecraft:polished_blackstone')
    throw Error('wrong observed causal sequence');
  if(new Set(readout.artifact_digests).size!==3)throw Error('replayed or duplicate observation artifacts');
  return true;
}
export function forgeCandidate(donors){
  if(!exact(donors,['alpha','beta']))throw Error('need exact independent donor pair');
  const lineage={};
  for(const world of ['alpha','beta']){
    const d=donors[world];
    if(!exact(d,['evidence','trace','evidence_bytes','trace_bytes']))throw Error('donor records missing');
    if(typeof d.evidence_bytes!=='string'||typeof d.trace_bytes!=='string')throw Error('source bytes missing');
    // No free-floating JSON claims: exact raw files must parse as supplied objects.
    if(JSON.stringify(JSON.parse(d.evidence_bytes))!==JSON.stringify(d.evidence)
      ||JSON.stringify(JSON.parse(d.trace_bytes))!==JSON.stringify(d.trace))
      throw Error('parsed source drift');
    validateDonor(world,d.evidence,d.trace);
    lineage[world]={
      engine:d.evidence.engine,instance:world,seed:d.evidence.seed,
      observer:d.evidence.observer,base:d.evidence.observations[0].block,
      impact:d.evidence.observations[1].block,
      evidence_sha256:sha256(Buffer.from(d.evidence_bytes,'utf8')),
      action_trace_sha256:sha256(Buffer.from(d.trace_bytes,'utf8'))
    };
  }
  if(lineage.alpha.observer===lineage.beta.observer)throw Error('observer identity reused');
  if(lineage.alpha.seed===lineage.beta.seed||lineage.alpha.base===lineage.beta.base)throw Error('donor scenarios not materially different');
  if(lineage.alpha.impact!==lineage.beta.impact)throw Error('incompatible impact');
  const candidate={
    format:'world-forge/recovery-candidate/v0',source_sha256:HASH,
    donors:lineage,
    grammar:{
      family:'bounded-restore-original-surface/v0',
      inference:'two witnessed donor causal sequences + strict matching operator traces',
      parameters:['BASE','IMPACT'],
      impact_material:lineage.alpha.impact,
      operations:OPS.map(x=>({...x}))
    },
    // Pre-agreed sandbox test target: *not* copied donor coordinates or material.
    replay_env:{instance:'gamma',position:[37,90,22],base_material:'minecraft:gold_block',engine:'godot-4.4.1'},
    disposition:'HOLD',execution_permission:false,signature:null,
    scope:'ALLOWED_SANDBOX_REHEARSAL_ONLY_NOT_HOST_ADMISSION'
  };
  validateCandidate(candidate);
  return candidate;
}
export function validateCandidate(c){
  if(!exact(c,CANDIDATE_FIELDS)||c.format!=='world-forge/recovery-candidate/v0'||c.source_sha256!==HASH)
    throw Error('candidate/schema/source mismatch');
  if(c.disposition!=='HOLD'||c.execution_permission!==false||c.signature!==null
    ||c.scope!=='ALLOWED_SANDBOX_REHEARSAL_ONLY_NOT_HOST_ADMISSION')throw Error('authority escalation');
  if(!exact(c.donors,['alpha','beta']))throw Error('missing donor');
  for(const world of ['alpha','beta']){
    const x=c.donors[world],cfg=EXPECTED[world];
    if(!exact(x,['engine','instance','seed','observer','base','impact','evidence_sha256','action_trace_sha256'])
      ||x.engine!=='minecraft-java-26.1.1'||x.instance!==world
      ||x.seed!==cfg.seed||x.observer!==cfg.observer||x.base!==cfg.base||x.impact!=='minecraft:polished_blackstone'
      ||!digest(x.evidence_sha256)||!digest(x.action_trace_sha256))throw Error('donor lineage mismatch');
  }
  if(!exact(c.grammar,['family','inference','parameters','impact_material','operations'])
    ||c.grammar.family!=='bounded-restore-original-surface/v0'
    ||c.grammar.inference!=='two witnessed donor causal sequences + strict matching operator traces'
    ||JSON.stringify(c.grammar.parameters)!==JSON.stringify(['BASE','IMPACT'])
    ||c.grammar.impact_material!=='minecraft:polished_blackstone'
    ||JSON.stringify(c.grammar.operations)!==JSON.stringify(OPS))throw Error('unapproved candidate grammar');
  const env=c.replay_env;
  if(!exact(env,['instance','position','base_material','engine'])
    ||env.instance!=='gamma'||env.engine!=='godot-4.4.1'
    ||JSON.stringify(env.position)!=='[37,90,22]'
    ||env.base_material!=='minecraft:gold_block'
    ||!MATERIALS.includes(env.base_material)||env.base_material===c.donors.alpha.base||env.base_material===c.donors.beta.base)
    throw Error('target not a fresh bounded material/coordinate experiment');
  return true;
}
function pathFor(inputRoot,world,file){
  // Original 004 action archives include work/minecraft-probe/* because multiple paths
  // are uploaded. Exact lookup routes; fail if a second ambiguous location appears.
  const choices=[
    join(inputRoot,'world-forge-004-minecraft-'+world,file),
    join(inputRoot,'world-forge-004-minecraft-'+world,'work','minecraft-probe',file)
  ];
  const found=choices.filter(p=>{try{readFileSync(p)}catch{return false}return true});
  if(found.length!==1)throw Error('one source path required: '+file);
  return found[0];
}
export function forgeFromArtifacts(root){
  const donors={};
  for(const world of ['alpha','beta']){
    const evidence_bytes=readFileSync(pathFor(root,world,'minecraft-'+world+'.json'),'utf8');
    const trace_bytes=readFileSync(pathFor(root,world,'author-trace-'+world+'.json'),'utf8');
    donors[world]={evidence_bytes,trace_bytes,evidence:JSON.parse(evidence_bytes),trace:JSON.parse(trace_bytes)};
  }
  return forgeCandidate(donors);
}
const isMain=process.argv[1]&&new URL('file://'+process.argv[1]).pathname===new URL(import.meta.url).pathname;
if(isMain){
  const [root,out]=process.argv.slice(2);
  if(!root||!out)throw Error('usage: forge.mjs INPUT_ARTIFACT_DIR OUTPUT_JSON');
  const candidate=forgeFromArtifacts(root);
  writeFileSync(out,JSON.stringify(candidate,null,2)+'\n');
  console.log('WORLD_FORGE_005_FORGED='+JSON.stringify({
    donor_worlds:Object.keys(candidate.donors), donor_materials:Object.values(candidate.donors).map(x=>x.base),
    inferred_verbs:candidate.grammar.operations.map(x=>x.verb),replay_material:candidate.replay_env.base_material,
    source_sha256:candidate.source_sha256,disposition:candidate.disposition
  }));
}
