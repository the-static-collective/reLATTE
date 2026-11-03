/**
 * LANTERN-007 / two deliberately distinct Minecraft game agents with the ability to REFUSE.
 * Scripted policies, NOT humans and NOT evidence of emergent self-improvement.
 */
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {Rcon} from 'rcon-client';
import mineflayer from 'mineflayer';
import {Vec3} from 'vec3';

const scenario=process.env.LANTERN_COOP_SCENARIO;
const seed=process.env.LANTERN_COOP_SEED;
const base='experiments/lantern-commons-007/datapack/data/lantern/function/cooperation/';
const invariant=(ok,code)=>{if(!ok)throw Error('COOP_007_'+code);};
invariant(['GIFT','REFUSE','SPOOF'].includes(scenario),'BAD_SCENARIO');
invariant(/^\d+$/.test(seed||''),'BAD_SEED');
const sha=b=>createHash('sha256').update(b).digest('hex');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(fn,reason,tries=50,interval=250)=>{
  for(let i=0;i<tries;i++){if(await fn())return;await sleep(interval);}
  throw Error('TIMEOUT_'+reason);
};
const locations={grower:new Vec3(104,65,16),mason:new Vec3(114,65,16),
  dry:new Vec3(107,64,8),crop:new Vec3(105,65,6),
  marker:new Vec3(109,65,13),commons:new Vec3(109,65,16),
  bell:new Vec3(109,66,16)};
const sourceHashes={};
for(const name of ['setup','try_restore','restore','show']){
  const content=await readFile(base+name+'.mcfunction');
  sourceHashes[name]=sha(content);
  invariant(content.length<6000,'SOURCE_SIZE');
}
const rcon=await Rcon.connect({host:'127.0.0.1',port:25575,password:process.env.MC_RCON_PASSWORD});
const bots=[];
async function spawn(name){
  const bot=mineflayer.createBot({host:'127.0.0.1',port:25565,username:name,auth:'offline'});
  bots.push(bot);
  await Promise.race([
    new Promise((res,rej)=>{
      bot.once('spawn',res);
      bot.once('error',rej);
      bot.once('kicked',r=>rej(Error('KICKED_'+name+':'+JSON.stringify(r))));
    }),
    sleep(45000).then(()=>{throw Error('SPAWN_TIMEOUT_'+name);})
  ]);
  return bot;
}
async function command(cmd){
  const result=await rcon.send(cmd);
  invariant(!/unknown command|not found|error|incorrect argument|unknown function/i.test(result),'RCON_'+cmd+':'+result);
  return {command:cmd,result};
}
async function inventoryCount(bot,itemName){
  const id=bot.registry?.itemsByName?.[itemName]?.id;
  invariant(Number.isInteger(id),'ITEM_ID_'+itemName);
  return bot.inventory.items().filter(x=>x.type===id).reduce((sum,x)=>sum+x.count,0);
}
async function countBarrel(name){
  const [pos,item,target]=name==='grower'
    ?['104 65 16','minecraft:wheat','#wheat']
    :['114 65 16','minecraft:stone_bricks','#bricks'];
  await command('execute store result score '+target+' lc_store if items block '+pos+' container.* '+item);
  const raw=await rcon.send('scoreboard players get '+target+' lc_store');
  const match=raw.match(/(?:has|is)\s+(-?\d+)/)??raw.match(/(-?\d+)/);
  invariant(!!match,'CANNOT_PARSE_ITEM_COUNT:'+raw);
  return Number(match[1]);
}
function inspect(observer){
  const result={};
  for(const [k,v] of Object.entries(locations))result[k]=observer.blockAt(v)?.name??null;
  return result;
}
async function gifts(bot,item,at,count=2,withdraw=false){
  const kind=bot.registry.itemsByName[item];
  invariant(!!kind,'UNKNOWN_GIFT');
  const block=bot.blockAt(at);
  invariant(block?.name==='barrel','NO_BARREL_'+bot.username+':'+block?.name);
  const container=await bot.openContainer(block);
  try{
    if(withdraw)await container.withdraw(kind.id,null,count);
    else await container.deposit(kind.id,null,count);
  }finally{container.close();}
}
const commandTrace=[];
const actorReceipts=[];
try{
  // Distinct clients whose game inventory acts carry the evidence.
  const grower=await spawn('AidGrower');
  const mason=await spawn('AidMason');
  const observer=await spawn('CoopWitness');
  for(const cmd of [
    'forceload add 96 -4 124 22',
    'function lantern:events/prepare',
    'function lantern:events/drought',
    'function lantern:cooperation/setup',
    'tp AidGrower 104 65 14',
    'tp AidMason 114 65 14',
    'tp CoopWitness 109 68 8',
    'clear AidGrower',
    'clear AidMason',
    'give AidGrower minecraft:wheat 2',
    'give AidMason minecraft:stone_bricks 2',
  ])commandTrace.push(await command(cmd));
  await sleep(2200);
  for(const b of [grower,mason,observer])await b.waitForChunksToLoad();
  await until(async()=>await inventoryCount(grower,'wheat')===2,'GROWER_NOT_PROVISIONED');
  await until(async()=>await inventoryCount(mason,'stone_bricks')===2,'MASON_NOT_PROVISIONED');
  const initial={
    blocks:inspect(observer),
    grower_items:await inventoryCount(grower,'wheat'),
    mason_items:await inventoryCount(mason,'stone_bricks'),
    grower_barrel:await countBarrel('grower'),
    mason_barrel:await countBarrel('mason')
  };
  invariant(initial.blocks.dry==='air'&&initial.blocks.crop==='air'&&
    initial.blocks.marker==='redstone_block'&&
    initial.blocks.commons==='stone_bricks'&&
    initial.grower_items===2&&initial.mason_items===2&&
    initial.grower_barrel===0&&initial.mason_barrel===0,'BAD_INITIAL_STATE:'+JSON.stringify(initial));
  // Each game agent reads the actual game drought; its scenario-local policy is explicit.
  const seenDrought=initial.blocks.dry==='air'&&initial.blocks.crop==='air';
  const decisions=[
    {actor:'AidGrower',role:'grower',offer:'two wheat',consent:seenDrought,
      choice_source:'independent local scripted policy; no real human authorization',
      receipt_kind:'POLICY_CHOICE_ONLY'},
    {actor:'AidMason',role:'mason',offer:'two stone bricks',
      consent:scenario==='GIFT'&&seenDrought,
      claimed_consent:scenario!=='REFUSE'&&seenDrought,
      choice_source:scenario==='REFUSE'?'scripted refusal policy':'scripted gifting policy',
      receipt_kind:scenario==='SPOOF'?'UNTRUSTED_FALSE_GIFT_CLAIM':'POLICY_CHOICE_ONLY'}
  ];
  invariant(decisions[0].consent,'MISSING_GROWER_CONSENT');
  actorReceipts.push({step:'observe_drought',decisions});
  await gifts(grower,'wheat',locations.grower);
  await until(async()=>await countBarrel('grower')===2,'GROWER_BARREL_NO_GIFT');
  const afterGrower={blocks:inspect(observer),
    grower_items:await inventoryCount(grower,'wheat'),
    mason_items:await inventoryCount(mason,'stone_bricks'),
    grower_barrel:await countBarrel('grower'),
    mason_barrel:await countBarrel('mason')};
  invariant(afterGrower.blocks.marker==='redstone_block'&&
    afterGrower.grower_barrel===2&&afterGrower.mason_barrel===0,'UNILATERAL_GIFT_TRIGGERED_EFFECT');
  actorReceipts.push({step:'grower_gift',actual_material_transfer:true,afterGrower});
  if(scenario==='GIFT'){
    await gifts(mason,'stone_bricks',locations.mason);
    actorReceipts.push({step:'mason_gift',actual_material_transfer:true});
  }else{
    actorReceipts.push({step:'mason_decision',actual_material_transfer:false,
      claimed_transfer:scenario==='SPOOF',consent:false,
      message:'A refusal or false declaration cannot complete the material precondition.'});
  }
  // The datapack tick function, not this observer/operator, creates the shared benefit.
  await until(async()=>{
    const marker=observer.blockAt(locations.marker)?.name;
    return marker===(scenario==='GIFT'?'emerald_block':'redstone_block');
  },'WORLD_GATE_DID_NOT_SETTLE',scenario==='GIFT'?60:5,300);
  if(scenario==='GIFT'){
    await until(async()=>observer.blockAt(locations.bell)?.name==='bell','COMMON_BELL_NOT_BUILT');
  }else{
    // Explicitly return the unused gift on refusal or false claim; no confiscation.
    await gifts(grower,'wheat',locations.grower,2,true);
    await until(async()=>await countBarrel('grower')===0,'GROWER_WITHDRAWAL_NOT_RECORDED');
    actorReceipts.push({step:'return_unused_gift',actual_material_withdrawal:true,
      note:'No cooperation effect without both gifts; actor retrieved owned game items.'});
  }
  await sleep(1200);
  const final={
    blocks:inspect(observer),
    grower_items:await inventoryCount(grower,'wheat'),
    mason_items:await inventoryCount(mason,'stone_bricks'),
    grower_barrel:await countBarrel('grower'),
    mason_barrel:await countBarrel('mason'),
    in_game_history:await rcon.send('data get storage lantern:cooperation history'),
    world_event_history:await rcon.send('data get storage lantern:world_events history')
  };
  const restored=scenario==='GIFT';
  invariant(final.blocks.dry===(restored?'water':'air')&&
    final.blocks.crop===(restored?'wheat':'air')&&
    final.blocks.marker===(restored?'emerald_block':'redstone_block')&&
    final.blocks.commons===(restored?'gold_block':'stone_bricks')&&
    final.blocks.bell===(restored?'bell':'air'),
    'GAME_WORLD_OUTCOME_MISMATCH:'+JSON.stringify(final.blocks));
  invariant(final.grower_items===(restored?0:2)&&
    final.mason_items===(restored?0:2)&&
    final.grower_barrel===(restored?2:0)&&
    final.mason_barrel===(restored?2:0),'ITEM_ACCOUNTING_FAILURE:'+JSON.stringify(final));
  invariant(final.in_game_history.includes('COMMON_GARDEN_RESTORED')===restored,
    'GAME_GIFT_LEDGER_MISMATCH');
  const creatureProposal=restored
    ?{kind:'PROPOSE_CARTRIDGE',text:'A shared capability was produced; offer its procedure for independent testing.',authority:'NONE'}
    :{kind:'PROPOSE_INVITATION',text:'The missing gift remains optional. Do not override refusal or a missing deposit.',authority:'NONE'};
  const output={
    schema:'lantern.radical-cooperation-game-observation/v0',
    scenario,game_server_version:'26.1.1',world_seed:seed,
    agent_policy_kind:'declared, deterministic scripted; NOT human or self-learning AI',
    independent_clients:['AidGrower','AidMason','CoopWitness'],
    game_actor_origin:'operator-provisioned finite two-item inventory each',
    no_real_people_claimed:true,source_sha256:sourceHashes,
    initial,afterGrower,final,
    actor_receipts:actorReceipts,
    source_command_history:commandTrace,
    creature_proposal:creatureProposal,
    outcome:restored?'COOPERATIVE_COMMONS_RESTORED':'REFUSAL_OR_FALSE_CLAIM_HELD_NO_EFFECT',
    result_divergence:{
      public_garden_restored:restored,non_coerced_material_transfer:restored,
      independent_client_observation:true,
      donor_option_to_withdraw:!restored,
      human_social_proof:false
    },
    limits:['no autonomous machine learning','not a real legal or financial exchange',
      'no real human consent','simulated scripts cannot establish moral or economic superiority',
      'RCON operator provisions inventories; it does not deposit gifts after decisions',
      'game identity does not authenticate human identity',
      'server/world context isolated, not public shared realm']
  };
  await mkdir('work/cooperation',{recursive:true});
  await writeFile('work/cooperation/game-evidence.json',JSON.stringify(output,null,2)+'\n');
  console.log(JSON.stringify({scenario,outcome:output.outcome,physical_gifts:{
    grower:final.grower_barrel,mason:final.mason_barrel},
    shared_garden_restored:restored,donor_retained_items:!restored,
    independent_observer:'CoopWitness',real_players:0},null,2));
}finally{for(const b of bots){try{b.quit();}catch{}}rcon.end();}
