import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import mineflayer from 'mineflayer';
import { Rcon } from 'rcon-client';
import { Vec3 } from 'vec3';

const sha=(b)=>createHash('sha256').update(b).digest('hex');
const pause=(ms)=>new Promise(r=>setTimeout(r,ms));
const req=(ok,msg)=>{if(!ok)throw Error('LANTERN_005_'+msg)};
const label=process.env.LANTERN_WORLD_ID;
const seed=process.env.LANTERN_SEED;
req(['A','B'].includes(label) && /^\d+$/.test(seed),'MISSING_WORLD');
const mode=label==='A'?'commons':'stewardship';
const budget=mode==='commons'?{wheat:2,bricks:2,paper:1}:{wheat:3,bricks:1,paper:2};
const source={
  kitchen:'8cb40cb03c34ef29146d513ee553ac922a34f29fb334896b5a7945d7c99ad353',
  annex:'60033123ddf1cc63f3f8579230f3c0ac5162e55b3443f75fb44468dfb4803c22',
};
const expectedFiles={
  kitchen:'experiments/lantern-commons-004/native-game-pack/data/lantern/function/build/kitchen.mcfunction',
  annex:'experiments/lantern-commons-004/native-game-pack/data/lantern/function/seed/construct_kitchen.mcfunction',
};
for(const [kind,path] of Object.entries(expectedFiles)){
  req(sha(await readFile(path))===source[kind],'ORIGINAL_SOURCE_DRIFT_'+kind);
}
await mkdir('work/lantern005',{recursive:true});
const rcon=await Rcon.connect({host:'127.0.0.1',port:25575,password:process.env.MC_RCON_PASSWORD});
const bots=[];
const trace=[];
function log(act,who,expected){trace.push({act,who,expected});}
async function cmd(s){
 const out=String(await rcon.send(s));
 if(/unknown function|unknown command|syntax error|incorrect argument|not found/i.test(out))
    throw Error('RCON_FAILED:'+s+':'+out);
 return out;
}
async function score(id,objective){
 const out=await cmd('scoreboard players get '+id+' '+objective);
 const m=out.match(/has (-?\d+)\s*\[/);
 req(m,'BAD_SCORE_OUTPUT:'+id+':'+out);
 return Number(m[1]);
}
async function spawn(username){
 const bot=mineflayer.createBot({host:'127.0.0.1',port:25565,username,auth:'offline'});
 bots.push(bot);
 await Promise.race([new Promise((resolve,reject)=>{
  bot.once('spawn',resolve);bot.once('error',reject);
  bot.once('kicked',reason=>reject(Error('PLAYER_KICKED:'+JSON.stringify(reason))));
 }),pause(40000).then(()=>{throw Error('PLAYER_TIMEOUT:'+username);})]);
 return bot;
}
async function act(bot,n,pos){
 const [x,y,z]=pos;
 await cmd('tp '+bot.username+' '+x+' '+y+' '+z);
 await pause(300);
 bot.chat('/trigger l5_action set '+n);
 log(n,bot.username,[x,y,z]);
 await pause(700);
}
async function donate(bot,item,n,where,count){
 for(let i=0;i<count;i++){
  await cmd('item replace entity '+bot.username+' weapon.mainhand with minecraft:'+item+' 1');
  await act(bot,n,where);
 }
}
const campfire=[0,65,0],giving=[26,65,26],forge=[-26,65,25],press=[26,65,-25],gate=[0,65,-35],tower=[-38,65,0];
try{
 await cmd('function lantern005:init');
 const builder=await spawn('LanternMaker'+label);
 const reviewer=await spawn('LanternReview'+label);
 const observer=await spawn('LanternWitness'+label);
 // Separate game sessions, not independently authenticated humans.
 await act(builder,1,campfire);
 await act(reviewer,1,campfire);
 await act(builder,mode==='commons'?10:11,campfire);
 req(await score('#policy','l5_policy')===(mode==='commons'?1:3),'CHARTER_REJECTED');
 await act(builder,20,campfire);
 req(await score('#project','l5_project')===1,'PROPOSAL_MISSING');
 await act(builder,30,campfire);
 req(await score('#project','l5_project')===1,'SELF_APPROVAL_SHOULD_FAIL');
 await act(reviewer,30,campfire);
 req(await score('#project','l5_project')===2,'SECOND_ACCOUNT_REVIEW_MISSING');
 await act(builder,40,campfire);
 req(await score('#project','l5_project')===2,'UNDERFUNDED_BUILD_SHOULD_FAIL');
 await donate(builder,'wheat',70,giving,budget.wheat);
 await donate(builder,'stone_bricks',71,forge,budget.bricks);
 await donate(builder,'paper',72,press,budget.paper);
 for(const [who,expected] of Object.entries({ '#food':budget.wheat,'#bricks':budget.bricks,'#paper':budget.paper})){
  req(await score(who,'l5_bank')===expected,'MISSING_INVENTORY_TRANSFER_'+who);
 }
 await act(builder,40,campfire);
 req(await score('#project','l5_project')===3,'KITCHEN_NOT_CONSTRUCTED');
 for(const who of ['#food','#bricks','#paper'])req(await score(who,'l5_bank')===0,'BUDGET_NOT_CONSUMED_'+who);
 await act(builder,50,press);
 req(await score('#cartridge','l5_project')===1,'CARTRIDGE_CANDIDATE_NOT_PRESSED');
 await act(builder,60,gate);
 req(await score('#seed','l5_seed')===1,'SECOND_SITE_MISSING');
 await act(builder,61,tower);
 req(await score('#seed','l5_seed')===2,'SECOND_SITE_LOCAL_AUDIT_MISSING');
 const positions=[{name:'kitchen-smoker',x:-20,y:65,z:-10,block:'smoker'},
 {name:'kitchen-roof',x:-20,y:69,z:-10,block:'waxed_copper_block'},
 {name:'annex-smoker',x:66,y:65,z:0,block:'smoker'},
 {name:'annex-roof',x:66,y:69,z:0,block:'waxed_copper_block'}];
 const observations=[];
 for(const o of positions){
   await cmd('tp '+observer.username+' '+o.x+' '+(o.y+3)+' '+o.z);
   await pause(600);
   await observer.waitForChunksToLoad();
   const actual=observer.blockAt(new Vec3(o.x,o.y,o.z))?.name||null;
   observations.push({...o,actual});
   req(actual===o.block,'FRESH_OBSERVER_BLOCK_MISMATCH:'+o.name+':'+actual);
 }
 const report={
   schema:'lantern.society-five-live-v0',label,seed,constitution:mode,budget,
   game_sessions:{builder:builder.username,reviewer:reviewer.username,observer:observer.username},
   governance:{proposer_cannot_self_approve:true,second_game_account_reviewed:true,
     insufficient_budget_did_not_build:true,all_in_game_donations_consumed:true},
   completion:{project_state:await score('#project','l5_project'),
     cartridge_candidate:await score('#cartridge','l5_project'),
     seedling_local_audit:await score('#seed','l5_seed')},
   observations,observed_sha256:sha(JSON.stringify(observations)),
   declared_action_trace:trace,source_function_sha256:source,
   constraints:{supplies_granted_by_ci_operator:true,two_accounts_not_distinct_humans:true,
     representative_society_slice_not_full_003_pack:true,
     protocol_observer_not_separate_institution:true,
     minecraft_only:true,physical_work:false,receiver_admission:false}
 };
 await writeFile('work/lantern005/observation.json',JSON.stringify(report,null,2)+'\n');
 process.stdout.write(JSON.stringify({result:'SOCIAL_SLICE_COMPLETED_IN_OFFICIAL_MINECRAFT',
   world:label,constitution:mode,actions:trace.length,
   observed_source_blocks:observations.length,observed_hash:report.observed_sha256})+'\n');
}finally{
 for(const bot of bots){try{bot.quit();}catch{}}
 try{rcon.end();}catch{}
}
