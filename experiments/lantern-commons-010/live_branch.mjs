/**
 * LANTERN 010: actually boot official Minecraft Java save, witness a world
 * state, and optionally change only a CHECKED-OUT child world.
 * Never touches a priceless player save. No remote or human authority.
 */
import {writeFile,mkdir,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import mineflayer from 'mineflayer';
import {Rcon} from 'rcon-client';
import {Vec3} from 'vec3';
const mode=process.env.WORLD_CARTRIDGE_MODE;
const parentID=process.env.WORLD_CARTRIDGE_PARENT_ID??null;
const must=(v,code)=>{if(!v)throw Error('WORLD_CARTRIDGE_010_LIVE_'+code);};
must(['root','mercy','abstain','mutual_aid'].includes(mode),'MODE');
const sha=b=>createHash('sha256').update(b).digest('hex');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const until=async(fn,reason,tries=75,interval=180)=>{
  for(let i=0;i<tries;i++){if(await fn())return;await sleep(interval);}
  throw Error('WORLD_CARTRIDGE_010_TIMEOUT_'+reason);
};
const sites={
 pond:new Vec3(107,64,8),
 crop:new Vec3(105,65,6),
 marker:new Vec3(109,65,13),
 commons:new Vec3(109,65,16),
 bell:new Vec3(109,66,16),
 grower:new Vec3(104,65,16),
 mason:new Vec3(114,65,16),
};
const bots=[],commands=[];
const rcon=await Rcon.connect({host:'127.0.0.1',port:25575,password:process.env.MC_RCON_PASSWORD});
async function send(cmd){
  const response=await rcon.send(cmd);
  must(!/unknown command|unknown function|not found|incorrect argument|error/i.test(response),
    'COMMAND_'+cmd+':'+response);
  commands.push({command:cmd,response});
  return response;
}
async function spawn(name){
  const bot=mineflayer.createBot({host:'127.0.0.1',port:25565,username:name,auth:'offline'});
  bots.push(bot);
  await Promise.race([
    new Promise((resolve,reject)=>{
      bot.once('spawn',resolve);
      bot.once('error',reject);
      bot.once('kicked',x=>reject(Error('OBSERVER_KICKED:'+JSON.stringify(x))));
    }),
    sleep(45000).then(()=>{throw Error('CLIENT_TIMEOUT_'+name);})
  ]);
  return bot;
}
function observe(bot){
  return Object.fromEntries(Object.entries(sites)
    .map(([name,loc])=>[name,bot.blockAt(loc)?.name??null]));
}
function check(blocks,stage){
  const dry=stage==='root'||stage==='abstain';
  for(const [name,expected] of Object.entries({
    pond:dry?'air':'water',
    crop:dry?'air':'wheat',
    marker:dry?'redstone_block':'emerald_block',
    commons:stage==='mutual_aid'?'gold_block':'stone_bricks',
    bell:stage==='mutual_aid'?'bell':'air',
    grower:'barrel',
    mason:'barrel'
  }))must(blocks[name]===expected,'BAD_BLOCK_'+stage+'_'+name+':'+blocks[name]);
}
async function itemInBarrel(side){
  const [loc,id,score]=side==='grower'
    ?['104 65 16','minecraft:wheat','#wc010wheat']
    :['114 65 16','minecraft:stone_bricks','#wc010bricks'];
  await send('execute store result score '+score+' lc_store if items block '+loc+' container.* '+id);
  const result=await rcon.send('scoreboard players get '+score+' lc_store');
  const match=result.match(/(?:has|is)\s+(-?\d+)/)??result.match(/(-?\d+)/);
  must(!!match,'ITEM_COUNT_'+result);
  return Number(match[1]);
}
async function giveFromActor(bot,side,item){
  const coords=side==='grower'?'104 65 14':'114 65 14';
  const loc=sites[side];
  await send('tp '+bot.username+' '+coords);
  await sleep(950);
  await bot.waitForChunksToLoad();
  must(bot.entity.position.distanceTo(loc)<4.5,'PLAYER_FAR_FROM_GIFT');
  const block=bot.blockAt(loc);
  must(block?.name==='barrel','REAL_BARREL_NOT_PRESENT');
  const kind=bot.registry.itemsByName[item];
  must(!!kind,'UNKNOWN_MATERIAL');
  await until(async()=>bot.inventory.items()
    .some(x=>x.type===kind.id&&x.count>=2),'ITEM_NOT_ACTUALLY_IN_PLAYER_INVENTORY');
  const window=await bot.openContainer(block);
  try{await window.deposit(kind.id,null,2);}
  finally{window.close();}
  await until(async()=>await itemInBarrel(side)===2,'NO_PHYSICAL_DEPOSIT_'+side);
}
try{
  await sleep(2400);
  // A freshly checked out save must not be mutated by a root initialization.
  if(mode==='root'){
    for(const c of ['forceload add 96 -4 124 22','function lantern:events/prepare',
      'function lantern:events/drought','function lantern:cooperation/setup'])await send(c);
  }else{
    must(/^[0-9a-f]{64}$/.test(parentID??''),'MISSING_PARENT_ID');
    await send('forceload add 96 -4 124 22');
  }
  const witness=await spawn('WC010_Witness');
  await send('tp WC010_Witness 109 68 8');
  await sleep(2000);
  await witness.waitForChunksToLoad();
  const initial=observe(witness);
  check(initial,'root');
  must(await itemInBarrel('grower')===0&&await itemInBarrel('mason')===0,
    'PARENT_CONTAMINATED_WITH_DONATIONS');
  if(mode==='mercy')await send('function lantern:events/mercy');
  if(mode==='abstain')await send('function lantern:events/abstain');
  const gifted=[];
  if(mode==='mutual_aid'){
    const grower=await spawn('AidGrower'),mason=await spawn('AidMason');
    await send('give AidGrower minecraft:wheat 2');
    await send('give AidMason minecraft:stone_bricks 2');
    await giveFromActor(grower,'grower','wheat');
    gifted.push({actor:'AidGrower',item:'wheat',amount:2});
    must(observe(witness).marker==='redstone_block','ONE_GIFT_ILLEGALLY_REPAIRED');
    await giveFromActor(mason,'mason','stone_bricks');
    gifted.push({actor:'AidMason',item:'stone_bricks',amount:2});
    await until(async()=>witness.blockAt(sites.bell)?.name==='bell',
      'COMMON_GARDEN_NOT_RESTORED');
  }
  await sleep(1100);
  const final=observe(witness);
  check(final,mode);
  const inventory={grower:await itemInBarrel('grower'),mason:await itemInBarrel('mason')};
  must(inventory.grower===(mode==='mutual_aid'?2:0)&&
    inventory.mason===(mode==='mutual_aid'?2:0),'GIFT_COUNTS');
  const journal=await rcon.send('data get storage lantern:world_events history');
  must(journal.includes('DROUGHT'),'MISSING_ORIGINAL_DROUGHT_EVENT');
  if(mode==='mercy'||mode==='mutual_aid')must(journal.includes('MERCY'),
    'MISSING_RESTORATION_EVENT');
  if(mode==='abstain')must(journal.includes('ABSTAIN'),'MISSING_NONINTERVENTION');
  const cooperation=await rcon.send('data get storage lantern:cooperation history');
  must(cooperation.includes('COMMON_GARDEN_RESTORED')===
    (mode==='mutual_aid'),'BAD_COOPERATION_HISTORY');
  await send('save-all flush');
  await mkdir('work/world-cartridge',{recursive:true});
  const result={
    schema:'lantern.world-cartridge-native-game-observation/v1',
    mode,
    parent_cartridge_id:parentID,
    minecraft_java_version:'26.1.1',
    observer:'fresh non-OP Minecraft protocol player',
    observer_username:witness.username,
    root_world_seed:process.env.WORLD_CARTRIDGE_SEED,
    before:initial,after:final,
    material_gifts:gifted,
    material_barrels_after:inventory,
    operator_command_history:commands,
    game_event_history:journal,
    game_cooperation_history:cooperation,
    effect:mode==='root'?'DROUGHT_BASELINE':mode==='mercy'?'DIRECT_OPERATOR_RESTORATION':
      mode==='abstain'?'DECLARED_NONINTERVENTION':'ACTUAL_TWO_AGENT_GAME_CONTRIBUTION',
    limits:['one synthetic disposable Java save copied by bytes',
      'not real independent founding worlds or human social evidence',
      'no native reLATTE signature from this stage',
      'no private player identity or external assets in cartridge']
  };
  await writeFile('work/world-cartridge/game-observation.json',JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({result:'REAL_GAME_WORLD_STATE_WITNESSED',mode,
    distinct_parent:parentID??'ROOT',
    before:initial.marker,after:final.marker,
    garden_recovered:final.pond==='water',physical_gifts:gifted.length,
    observation_sha256:sha(JSON.stringify(result))}));
}finally{
  for(const bot of bots){try{bot.quit();}catch{}}
  rcon.end();
}
