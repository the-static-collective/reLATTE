// Verify real Godot process readbacks against the *re-derived* procedural
// candidate from pinned real Minecraft donor evidence + actual RCON author trace.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {forgeFromArtifacts,validateCandidate} from './forge.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const isObj=x=>x&&typeof x==='object'&&!Array.isArray(x);
const exact=(x,fields)=>isObj(x)&&Object.keys(x).length===fields.length&&fields.every(f=>Object.hasOwn(x,f));
const PHASES=['build','impact','repair'];
const MARK_AUTHOR='WF005_ACTUAL_GODOT_STEP=',MARK_READER='WF005_GODOT_REPLAY_OBSERVED=';
const readLog=(s,tag)=>s.split(/\r?\n/).filter(x=>x.startsWith(tag)).map(x=>JSON.parse(x.slice(tag.length)));
export function verifyReplay(candidate,donorSource,authorLog,readerLog,snapshots){
  validateCandidate(candidate);
  assert.deepEqual(candidate,forgeFromArtifacts(donorSource),'candidate must exactly re-derive from source receipts');
  if(/SCRIPT ERROR|Parse Error|WF005 REHEARSAL REFUSED:/.test(authorLog))throw Error('operator engine error');
  if(/SCRIPT ERROR|Parse Error|WF005 READER FAILED:/.test(readerLog))throw Error('independent reader error');
  const authored=readLog(authorLog,MARK_AUTHOR);
  const readings=readLog(readerLog,MARK_READER);
  if(authored.length!==3||readings.length!==1)throw Error('missing real engine stages/readback');
  const reader=readings[0];
  if(!exact(reader,['instance','reader','observation_class','position','observations','receiver'])
    ||reader.instance!=='gamma'||reader.reader!=='GammaReadbackProcess'
    ||reader.observation_class!=='FRESH_PROCESS_PACKEDSCENE_READ'
    ||reader.receiver!=='HOLD'||JSON.stringify(reader.position)!==JSON.stringify(candidate.replay_env.position))
    throw Error('unapproved independent scene reader');
  if(!Array.isArray(reader.observations)||reader.observations.length!==3)throw Error('missing intermediate readbacks');
  const desired=[candidate.replay_env.base_material,candidate.grammar.impact_material,candidate.replay_env.base_material];
  const verbs=['SET_INITIAL_BASE',...candidate.grammar.operations.map(x=>x.verb)];
  for(let i=0;i<3;i++){
    const a=authored[i],o=reader.observations[i];
    if(!exact(a,['stage','verb','material','sandbox_position'])||!exact(o,['stage','block'])
      ||a.stage!==PHASES[i]||o.stage!==PHASES[i]
      ||a.verb!==verbs[i]||a.material!==desired[i]||o.block!==desired[i]
      ||JSON.stringify(a.sandbox_position)!==JSON.stringify(candidate.replay_env.position))
      throw Error('learned step diverged at '+PHASES[i]);
  }
  if(!Array.isArray(snapshots)||snapshots.length!==3||snapshots.some(x=>!(x instanceof Uint8Array)||x.length<200))
    throw Error('missing actual serialized Godot snapshots');
  const hashes=snapshots.map(sha);
  if(new Set(hashes).size!==3)throw Error('scene snapshots not distinct');
  return {
    format:'world-forge/recovery-rehearsal-report/v0',
    source_sha256:candidate.source_sha256,
    candidate_sha256:sha(Buffer.from(JSON.stringify(candidate),'utf8')),
    godot_engine:'4.4.1',
    authored_phases:authored.map(x=>x.stage),
    independently_read_states:reader.observations,
    serialized_scene_hashes:hashes,
    donor_minecraft_worlds:Object.keys(candidate.donors),
    source_action_trace_parsed:true,
    donor_observer_separate_process:true,
    fresh_sandbox_material:true,
    fresh_sandbox_coordinates:true,
    bounded_declarative_procedure_reproduced:true,
    independent_human_observer:false,
    native_relattte_signatures_verified:false,
    general_skill_learning_or_ml:false,
    inventory_or_survival_parity_verified:false,
    physical_external_execution:false,
    owner_admitted:false,
    receiver:'HOLD'
  };
}
export function verifyFromPaths(candidatePath,sourceRoot,authorPath,readerPath,snapshotRoot,out){
  const candidate=JSON.parse(readFileSync(candidatePath,'utf8'));
  const snapshots=PHASES.map(stage=>readFileSync(join(snapshotRoot,'gamma-'+stage+'.tscn')));
  const report=verifyReplay(candidate,sourceRoot,readFileSync(authorPath,'utf8'),readFileSync(readerPath,'utf8'),snapshots);
  writeFileSync(out,JSON.stringify(report,null,2)+'\n');
  console.log('WORLD_FORGE_005_BOUNDED_REPRODUCTION='+JSON.stringify(report));
  return report;
}
if(process.argv[1]&&process.argv[1].endsWith('/verify-replay.mjs')){
  if(process.argv.length!==8)throw Error('usage verify-replay.mjs CANDIDATE DONORROOT AUTHORLOG READERLOG SNAPSHOTS REPORT');
  verifyFromPaths(...process.argv.slice(2));
}
