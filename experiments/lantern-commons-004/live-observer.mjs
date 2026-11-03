import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {Rcon} from 'rcon-client';
import mineflayer from 'mineflayer';
import {Vec3} from 'vec3';

const root='experiments/lantern-commons-004/native-game-pack/data/lantern/function/';
const exact={
  'build/kitchen.mcfunction':'8cb40cb03c34ef29146d513ee553ac922a34f29fb334896b5a7945d7c99ad353',
  'seed/construct_kitchen.mcfunction':'60033123ddf1cc63f3f8579230f3c0ac5162e55b3443f75fb44468dfb4803c22'
};
const sha=b=>createHash('sha256').update(b).digest('hex');
const fail=(ok,msg)=>{if(!ok)throw Error('LANTERN_NATIVE_'+msg);};
const sleep=t=>new Promise(r=>setTimeout(r,t));
const relative=s=>s==='~'?0:(s.startsWith('~')?Number(s.slice(1)):NaN);
function expectedBlocks(text){
  const map=new Map();
  const set=(x,y,z,block)=>map.set([x,y,z].join(','),block.replace(/^minecraft:/,'').split('[')[0]);
  for(const line of text.split('\n')){
    const a=line.trim().split(/\s+/);
    if(a[0]==='fill'){
      const pos=a.slice(1,7).map(relative);
      fail(pos.every(Number.isInteger),'BAD_FILL_POS');
      const [x1,y1,z1,x2,y2,z2]=pos;
      const volume=(Math.abs(x2-x1)+1)*(Math.abs(y2-y1)+1)*(Math.abs(z2-z1)+1);
      fail(volume<=32768,'OVERBOUND_FILL');
      for(let x=Math.min(x1,x2);x<=Math.max(x1,x2);x++)
        for(let y=Math.min(y1,y2);y<=Math.max(y1,y2);y++)
          for(let z=Math.min(z1,z2);z<=Math.max(z1,z2);z++)set(x,y,z,a[7]);
    }else if(a[0]==='setblock'){
      const p=a.slice(1,4).map(relative);
      fail(p.every(Number.isInteger),'BAD_SETBLOCK_POS');
      set(...p,a[4]);
    }else if(a[0] && !a[0].startsWith('#'))throw Error('UNKNOWN_SOURCE_COMMAND');
  }
  return map;
}
async function main(){
  const world=process.env.LANTERN_WORLD_ID;
  const seed=process.env.LANTERN_SEED;
  fail(['A','B'].includes(world)&&/^\d+$/.test(seed),'WORLD_PARAMS');
  const texts={};
  for(const [file,digest] of Object.entries(exact)){
    const body=await readFile(root+file);
    fail(sha(body)===digest,'SOURCE_DRIFT:'+file);
    texts[file]=body.toString('utf8');
  }
  const expected=expectedBlocks(texts['seed/construct_kitchen.mcfunction']);
  fail(expected.size===466,'EXPECTED_466');
  const rcon=await Rcon.connect({host:'127.0.0.1',port:25575,password:process.env.MC_RCON_PASSWORD});
  const commandTrace=[
    'forceload add -40 -20 80 20',
    'execute positioned 0 64 0 run function lantern:build/kitchen',
    'execute positioned 0 64 0 run function lantern:seed/construct_kitchen'
  ];
  for(const command of commandTrace){
    const answer=await rcon.send(command);
    fail(!/unknown|not found|error|failed|incorrect/i.test(answer),'COMMAND_REJECTED:'+command+':'+answer);
  }
  const game=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'LanternObserver'+world,auth:'offline'});
  let ready=false;
  try{
    await Promise.race([new Promise((resolve,reject)=>{
      game.once('spawn',()=>{ready=true;resolve();});
      game.once('error',reject);
      game.once('kicked',reason=>reject(Error('OBSERVER_KICKED:'+JSON.stringify(reason))));
    }),sleep(45000).then(()=>{throw Error('OBSERVER_TIMEOUT');})]);
    fail(ready,'NO_SPAWN');
    const answer=await rcon.send('tp '+game.username+' 66 66 0');
    fail(!/unknown|not found|error/i.test(answer),'OBSERVER_TELEPORT_FAILED');
    await sleep(3500);
    await game.waitForChunksToLoad();
    const observations=[],mismatches=[];
    for(const [offset,block] of expected.entries()){
      const [x,y,z]=offset.split(',').map(Number);
      const pos=new Vec3(x,y+64,z);
      const actual=game.blockAt(pos);
      const found=actual?.name||null;
      if(found!==block)mismatches.push({offset,expected:block,found});
      observations.push({offset,expected:block,found});
    }
    const server=await rcon.send('execute if block 66 65 0 minecraft:smoker');
    fail(!/failed|false|not found/i.test(server),'SERVER_ANCHOR_MISSING');
    const report={
      schema:'lantern.native-official-minecraft-observation/v0',
      source:'source-pinned Lantern Commons 003 subset; NOT full 003 society',
      world_label:world,declared_seed:seed,
      source_function_sha256:exact,command_trace:commandTrace,
      command_actor:'localhost RCON operator',observer_username:game.username,
      observer_role:'fresh vanilla protocol non-OP client, game account NOT human identity',
      expected_count:expected.size,observed_count:observations.length,mismatches,
      observed_sha256:sha(JSON.stringify(observations)),
      result:mismatches.length===0?'OBSERVED_MATCH':'OBSERVED_MISMATCH',
      minecraft_only:true,real_society:false,full_game_pack_installed:false,
      artifact_status:'live observation; receiver approval withheld'
    };
    await writeFile('work/lantern/observation.json',JSON.stringify(report,null,2)+'\n');
    fail(mismatches.length===0,'BLOCK_MISMATCH:'+JSON.stringify(mismatches.slice(0,8)));
    console.log(JSON.stringify({world,result:report.result,positions:observations.length,observation_sha256:report.observed_sha256}));
  }finally{
    game.quit();
    rcon.end();
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
