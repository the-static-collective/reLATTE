// Privileged author/controller owns the RCON socket; separate non-OP worker cannot access it.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {FORMAT,HASH,validateEvidence} from '../src/verify.mjs';
import {digest} from '../../world-forge-001/src/worldforge.mjs';
const require=createRequire(import.meta.url);
const {Rcon}=require('rcon-client');
const WORLD=process.env.WF_WORLD;
const CONFIG={
 alpha:{station:'garden',x:-8,z:-7,base:'minecraft:moss_block',seed:'381654729',name:'WFWatchAlpha'},
 beta:{station:'forge',x:12,z:-3,base:'minecraft:cut_copper',seed:'918273645',name:'WFWatchBeta'}
};
if(!Object.hasOwn(CONFIG,WORLD))throw Error('unknown world');
const cfg=CONFIG[WORLD],Y=79;
const data=JSON.parse(readFileSync('experiments/world-forge-001/cartridges/jubilee-garden.v0.json','utf8'));
assert.equal(digest(data),HASH,'authored source fixture changed');
const meta=JSON.parse(readFileSync('work/minecraft-probe/server-version.json','utf8'));
assert.equal(meta.id,'26.1.1');
const workerPath=fileURLToPath(new URL('./observer-worker.mjs',import.meta.url));
const env={PATH:process.env.PATH||'',HOME:process.env.HOME||'',WF_OBSERVER:cfg.name,WF_X:String(cfg.x),WF_Y:String(Y),WF_Z:String(cfg.z)};
const child=spawn(process.execPath,[workerPath],{env,stdio:['pipe','pipe','pipe']});
let pending=null,buffer='',workerErr='';
child.stderr.on('data',x=>{workerErr+=String(x)});
child.stdout.on('data',bytes=>{
  buffer+=String(bytes);
  for(let ix=buffer.indexOf('\n');ix>=0;ix=buffer.indexOf('\n')){
    const line=buffer.slice(0,ix);buffer=buffer.slice(ix+1);
    let event;try{event=JSON.parse(line)}catch{if(pending){pending.reject(Error('invalid observer JSON'));pending=null};continue}
    if(event.type==='fatal'){if(pending){pending.reject(Error(event.error));pending=null};continue}
    if(pending){const p=pending;pending=null;p.resolve(event)}
  }
});
const wait=(body,timeoutMs=60000)=>new Promise((resolve,reject)=>{
  if(pending)return reject(Error('overlapping worker reads'));
  const timer=setTimeout(()=>{pending=null;reject(Error('read-only worker timeout '+workerErr))},timeoutMs);
  pending={resolve:e=>{clearTimeout(timer);resolve(e)},reject:e=>{clearTimeout(timer);reject(e)}};
  if(body)child.stdin.write(JSON.stringify(body)+'\n');
});
let rcon=null;const actions=[],observations=[],digests=[];
const hash=s=>createHash('sha256').update(s).digest('hex');
async function op(cmd){
  const response=String(await rcon.send(cmd));actions.push({role:'OPERATOR_RCON',command:cmd,response});
  if(/unknown function|unknown command|permission denied/i.test(response))throw Error('operator command failed: '+cmd+' / '+response);
}
try{
  const ready=await wait(null);
  if(ready.type!=='ready'||ready.name!==cfg.name)throw Error('bad non-OP client ready');
  rcon=await Rcon.connect({host:'127.0.0.1',port:25575,password:process.env.WF_RCON_PASSWORD});
  const opsPath='work/minecraft-probe/server/ops.json';
  const ops=existsSync(opsPath)?JSON.parse(readFileSync(opsPath,'utf8')):[];
  if(!Array.isArray(ops)||ops.some(o=>o.name===cfg.name))throw Error('fresh observer unexpectedly has operator authority');
  await op('forceload add -32 -32 32 32');
  await op('tp '+cfg.name+' 0 80 0');
  await op('execute positioned 0 80 0 run function worldforge:build_'+WORLD);
  for(const [stage,command] of [
    ['build',null],
    ['impact','execute positioned 0 80 0 run function crater:impact_'+WORLD],
    ['repair','execute positioned 0 80 0 run function crater:visual_repair_'+WORLD+'_'+cfg.station]
  ]){
    if(command)await op(command);
    const message=await wait({type:'sample',stage});
    if(message.type!=='reading'||message.stage!==stage||message.observer!==cfg.name||JSON.stringify(message.position)!==JSON.stringify([cfg.x,Y,cfg.z]))throw Error('invalid independent client reading');
    observations.push({stage,block:message.block});
    digests.push(hash(JSON.stringify({stage,block:message.block,client:message.observer,position:message.position})));
  }
  const result={
    format:FORMAT,source_sha256:HASH,engine:'minecraft-java-26.1.1',instance:WORLD,seed:cfg.seed,
    engine_version:meta.id,observer:cfg.name,observer_class:'NON_OP_SEPARATE_PROCESS_PROTOCOL_CLIENT',
    observer_unprivileged:true,observations,actions:['BUILD','IMPACT','REPAIR'],
    artifact_digests:digests,receiver:'HOLD',signature:null
  };
  validateEvidence(result);
  writeFileSync(join('work/minecraft-probe','minecraft-'+WORLD+'.json'),JSON.stringify(result,null,2)+'\n');
  writeFileSync(join('work/minecraft-probe','author-trace-'+WORLD+'.json'),JSON.stringify({
    operator:'RCON',observer:cfg.name,observer_ops_file_verified:true,server_sha1:meta.server_sha1,
    source_sha256:HASH,commands:actions,worker_stderr:workerErr,receiver:'HOLD'
  },null,2)+'\n');
  console.log('WORLD_FORGE_004_MINECRAFT_NON_OP='+JSON.stringify({world:WORLD,observations,receiver:'HOLD'}));
}finally{
  if(rcon)rcon.end();
  child.kill('SIGTERM');
}
