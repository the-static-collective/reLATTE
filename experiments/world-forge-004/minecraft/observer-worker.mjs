// Child process: intentionally receives NO RCON password, no operator command socket,
// no write capability. Observes the official server through a separate non-OP client.
import {createRequire} from 'node:module';
import {createInterface} from 'node:readline';
const require=createRequire(import.meta.url);
const mineflayer=require('mineflayer');
const {Vec3}=require('vec3');
const username=process.env.WF_OBSERVER;
const x=Number(process.env.WF_X),y=Number(process.env.WF_Y),z=Number(process.env.WF_Z);
if(!/^[A-Za-z0-9_]{4,16}$/.test(username)||![x,y,z].every(Number.isInteger))throw Error('invalid observer geometry');
if(process.env.WF_RCON_PASSWORD||process.env.MC_RCON_PASSWORD)throw Error('observer may not possess operator password');
const bot=mineflayer.createBot({host:'127.0.0.1',port:25565,username,auth:'offline'});
const emit=x=>process.stdout.write(JSON.stringify(x)+'\n');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let ready=false, busy=false;
const timeout=setTimeout(()=>{emit({type:'fatal',error:'spawn timeout'});process.exit(2)},60000);
bot.once('spawn',async ()=>{
  try {await bot.waitForChunksToLoad(); ready=true;clearTimeout(timeout);emit({type:'ready',name:username,position:bot.entity.position.toString(),version:bot.version})}
  catch(e){emit({type:'fatal',error:String(e)});process.exit(3)}
});
bot.on('error',e=>{emit({type:'fatal',error:String(e)});process.exit(4)});
bot.on('kicked',reason=>{emit({type:'fatal',error:String(reason)});process.exit(5)});
const rl=createInterface({input:process.stdin,crlfDelay:Infinity});
rl.on('line',async line=>{
  if(!ready||busy)return emit({type:'fatal',error:'observer not ready'});
  busy=true;
  try{
    const req=JSON.parse(line);
    if(Object.keys(req).sort().join(',')!=='stage,type'||req.type!=='sample'||!['build','impact','repair'].includes(req.stage))throw Error('invalid read-only sample request');
    await sleep(650);
    let block=null;
    for(let i=0;i<30;i++){
      block=bot.blockAt(new Vec3(x,y,z));
      if(block)break;
      await sleep(200);
    }
    if(!block)throw Error('observer chunk missing');
    emit({type:'reading',stage:req.stage,block:'minecraft:'+block.name,position:[x,y,z],observer:username});
  }catch(e){emit({type:'fatal',error:String(e)});process.exitCode=6}
  finally{busy=false}
});
process.on('SIGTERM',()=>{try{bot.quit('read-only witness complete')}catch{}process.exit(0)});
