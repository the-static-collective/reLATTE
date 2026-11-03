// Only observer-process stdout may form the observations; raw scene snapshot hashes added independently.
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {FORMAT,HASH,validateEvidence} from './verify.mjs';
const [world,logFile,snapshotRoot,output]=process.argv.slice(2);
if(!['alpha','beta'].includes(world)||!logFile||!snapshotRoot||!output)throw Error('usage: parse-godot WORLD OBSERVER_LOG SNAPSHOT_DIR OUTPUT');
const log=readFileSync(logFile,'utf8');
if(/SCRIPT ERROR|Parser Error|Parse Error|WF004 OBSERVER:/.test(log))throw Error('Godot observer error');
const lines=log.split(/\r?\n/).filter(line=>line.startsWith('WF004_GODOT_OBSERVER='));
if(lines.length!==1)throw Error('exactly one fresh Godot observer report required');
const obs=JSON.parse(lines[0].slice('WF004_GODOT_OBSERVER='.length));
if(obs.world!==world||obs.observer!=='GodotSnapshotReader'||obs.observer_class!=='FRESH_PROCESS_SERIALIZED_SCENE_READ'||obs.receiver!=='HOLD')throw Error('unapproved Godot observer identity');
const snapshots=['build','impact','repair'].map(stage=>readFileSync(join(snapshotRoot,world+'-'+stage+'.tscn')));
const evidence={
  format:FORMAT,source_sha256:HASH,engine:'godot-4.4.1',instance:world,seed:world==='alpha'?'381654729':'918273645',
  engine_version:'4.4.1',observer:obs.observer,observer_class:obs.observer_class,
  observer_unprivileged:true,observations:obs.observations,actions:['BUILD','IMPACT','REPAIR'],
  artifact_digests:snapshots.map(data=>createHash('sha256').update(data).digest('hex')),receiver:'HOLD',signature:null
};
validateEvidence(evidence);
writeFileSync(output,JSON.stringify(evidence,null,2)+'\n');
console.log('WORLD_FORGE_004_GODOT_SCENE_OBSERVED='+JSON.stringify({world,blocks:evidence.observations.map(o=>o.block),snapshot_digests:evidence.artifact_digests,receiver:'HOLD'}));
