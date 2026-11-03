/**
 * 011 — Actual-world SAVE descendant witness.
 * Boots a byte-checked-out Minecraft world save from an immutable cartridge.
 * Operator may create EMPTY storage/markers; NO operator gives, clears,
 * duplicates, or replenishes game inventory. Only actual player bots may
 * transfer finite inherited wheat and brick stocks.
 */
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import mineflayer from 'mineflayer';
import {Rcon} from 'rcon-client';
import {Vec3} from 'vec3';

const stage=process.env.LANTERN_011_STAGE;
const parentId=process.env.LANTERN_011_PARENT_ID;
const seed=process.env.LANTERN_011_SEED;
const assert=(v,c)=>{if(!v)throw Error('INHERITANCE_011_'+c);};
assert(['steward','silo','silo_heir'].includes(stage),'STAGE');
assert(/^[a-f0-9]{64}$/.test(parentId??''),'PARENT');
assert(seed==='314159265','SEED');
const hash=x=>createHash('sha256').update(x).digest('hex');
const sleep=ms=>new Promise(res=>setTimeout(res,ms));
const until=async(fn,reason,tries=75,interval=200)=>{
 for(let i=0;i<tries;i++){if(await fn())return;await sleep(interval);}
 throw Error('INHERITANCE_011_TIMEOUT_'+reason);
};
const place={
 oldW:new Vec3(104,65,16),oldB:new Vec3(114,65,16),
 bankW:new Vec3(113,65,17),bankB:new Vec3(116,65,17),
 vault:new Vec3(117,65,17),
 marker:new Vec3(115,65,18),heirMarker:new Vec3(117,66,18),
 pond:new Vec3(107,64,8),crop:new Vec3(105,65,6),
 commons:new Vec3(109,65,16),bell:new Vec3(109,66,16),
};
const waitBot=async(name)=>{
 const bot=mineflayer.createBot({host:'127.0.0.1',port:25565,
    username:name,auth:'offline'});
 clients.push(bot);
 await Promise.race([
  new Promise((yes,no)=>{
   bot.once('spawn',yes);
   bot.once('error',no);
   bot.once('kicked',x=>no(Error('KICKED_'+name+':'+JSON.stringify(x))));
  }),
  sleep(45000).then(()=>{throw Error('CLIENT_TIMEOUT_'+name)})
 ]);
 return bot;
};
const clients=[],commands=[];
const rcon=await Rcon.connect({host:'127.0.0.1',port:25575,password:process.env.MC_RCON_PASSWORD});
async function command(c){
 assert(!/\b(?:give|clear|loot|item replace|clone)\b/i.test(c),'RESOURCE_INJECTION_REQUEST');
 const result=await rcon.send(c);
 assert(!/unknown command|unknown function|incorrect argument|not found|error/i.test(result),
  'INVALID_COMMAND_'+c+':'+result);
 commands.push({command:c,result});
 return result;
}
function block(bot,name){
 return bot.blockAt(place[name])?.name??null;
}
async function amount(container,item){
 const where=place[container];
 assert(where,'UNKNOWN_PLACE');
 const kind=item==='wheat'?'minecraft:wheat':'minecraft:stone_bricks';
 const score=container+'_'+item;
 // loc only contains fixed-source enum names, never user supplied coordinates.
 const q=`execute store result score #${score} lc_store if items block ${where.x} ${where.y} ${where.z} container.* ${kind}`;
 await command(q);
 const response=await rcon.send('scoreboard players get #'+score+' lc_store');
 const found=response.match(/(?:has|is)\s+(-?\d+)/)??response.match(/(-?\d+)/);
 assert(!!found,'BAD_CONTAINER_RESPONSE_'+response);
 return Number(found[1]);
}
function snapshot(bot){
 return Object.fromEntries(Object.keys(place)
  .map(name=>[name,block(bot,name)]));
}
async function walkTo(bot,where){
 const p=place[where];
 assert(p,'UNKNOWN_DESTINATION');
 const target=where==='oldW'?'104 65 14':
   where==='oldB'?'114 65 14':
   where==='bankW'?'113 65 15':
   where==='bankB'?'116 65 15':'117 65 15';
 for(let n=0;n<4 && bot.entity.position.distanceTo(p)>=4.5;n++){
  await command('tp '+bot.username+' '+target);
  await sleep(1100);
  await bot.waitForChunksToLoad();
 }
 assert(bot.entity.position.distanceTo(p)<4.5,
  'ACTOR_TOO_FAR_'+where+JSON.stringify(bot.entity.position));
}
function inventory(bot,item){
 const id=bot.registry.itemsByName[item].id;
 return bot.inventory.items().filter(x=>x.type===id).reduce((sum,x)=>sum+x.count,0);
}
const materialActions=[];
async function transfer(bot,source,dest,item){
 await walkTo(bot,source);
 assert(block(bot,source)==='barrel','SOURCE_NOT_BARREL_'+source);
 const kind=bot.registry.itemsByName[item];
 assert(kind,'INVALID_MATERIAL');
 assert(inventory(bot,item)===0,'UNDECLARED_OLD_PLAYER_STOCK');
 const before=await amount(source,item);
 assert(before===2,'NO_INHERITED_SOURCE_MATERIAL_'+source+':'+before);
 const fromWindow=await bot.openContainer(bot.blockAt(place[source]));
 try{await fromWindow.withdraw(kind.id,null,2);}
 finally{fromWindow.close();}
 await until(async()=>await amount(source,item)===0,
  'SOURCE_WITHDRAW_NOT_COMMITTED_'+source);
 await until(async()=>inventory(bot,item)===2,
  'INVENTORY_NOT_OWNED_BY_PLAYER_'+item);
 materialActions.push({actor:bot.username,kind:item,operation:'REAL_WITHDRAW',
    source,amount:2,operator_created_items:0});
 await walkTo(bot,dest);
 assert(block(bot,dest)==='barrel','DEST_NOT_BARREL_'+dest);
 assert(await amount(dest,item)===0,'DESTINATION_CONTAMINATED_'+dest);
 const intoWindow=await bot.openContainer(bot.blockAt(place[dest]));
 try{await intoWindow.deposit(kind.id,null,2);}
 finally{intoWindow.close();}
 await until(async()=>await amount(dest,item)===2,
  'DEST_DEPOSIT_NOT_COMMITTED_'+dest);
 await until(async()=>inventory(bot,item)===0,
  'ACTOR_RETAINS_DUPLICATE_'+item);
 materialActions.push({actor:bot.username,kind:item,operation:'REAL_DEPOSIT',
    destination:dest,amount:2,operator_created_items:0});
}
async function materialSnapshot(witness){
 const oldW=await amount('oldW','wheat');
 const oldB=await amount('oldB','stone_bricks');
 const bankW=block(witness,'bankW')==='barrel'?await amount('bankW','wheat'):0;
 const bankB=block(witness,'bankB')==='barrel'?await amount('bankB','stone_bricks'):0;
 const vault=block(witness,'vault')==='barrel'?await amount('vault','wheat'):0;
 return {oldW,oldB,bankW,bankB,vault,
   wheat_total:oldW+bankW+vault,stone_bricks_total:oldB+bankB};
}
const sourceHashes={};
for(const f of ['steward','prepare_silo','tick','complete_silo','prepare_heir','complete_heir']){
 const data=await readFile('experiments/lantern-commons-011/datapack/data/lantern/function/generations/'+f+'.mcfunction');
 sourceHashes[f]=hash(data);
}
try{
 await sleep(1900);
 await command('forceload add 96 -4 124 22');
 const witness=await waitBot('WC011_Witness');
 await command('tp WC011_Witness 109 68 8');
 await sleep(1800);
 await witness.waitForChunksToLoad();
 const initialBlocks=snapshot(witness),initialStock=await materialSnapshot(witness);
 const fromSilo=stage==='silo_heir';
 const expectedBefore=fromSilo?{oldW:0,oldB:0,bankW:2,bankB:2,vault:0}:
   {oldW:2,oldB:2,bankW:0,bankB:0,vault:0};
 for(const [k,v] of Object.entries(expectedBefore))
  assert(initialStock[k]===v,'PARENT_STOCK_DRIFT_'+k+':'+initialStock[k]);
 assert(initialStock.wheat_total===2 && initialStock.stone_bricks_total===2,
   'PARENT_MATERIAL_BUDGET');
 assert(initialBlocks.pond==='water'&&initialBlocks.crop==='wheat'&&
   initialBlocks.commons==='gold_block'&&initialBlocks.bell==='bell',
   'PARENT_NOT_ORIGINAL_COOPERATIVE_GARDEN');
 assert(initialBlocks.marker===(fromSilo?'gold_block':'air'),'PARENT_MARKER');
 const agents=[];
 if(stage==='steward')await command('function lantern:generations/steward');
 if(stage==='silo'){
  await command('function lantern:generations/prepare_silo');
  const g=await waitBot('AidGrower'),m=await waitBot('AidMason');
  await transfer(g,'oldW','bankW','wheat');
  await transfer(m,'oldB','bankB','stone_bricks');
  agents.push(g.username,m.username);
  await until(async()=>block(witness,'marker')==='gold_block',
    'PUBLIC_SILO_UNBUILT',70,200);
 }
 if(stage==='silo_heir'){
  await command('function lantern:generations/prepare_heir');
  const g=await waitBot('AidGrower');
  await transfer(g,'bankW','vault','wheat');
  agents.push(g.username);
  await until(async()=>block(witness,'heirMarker')==='emerald_block',
    'HEIR_RECEIPT_UNBUILT',70,200);
 }
 await sleep(850);
 const finalBlocks=snapshot(witness),finalStock=await materialSnapshot(witness);
 const expectedAfter=stage==='steward'
  ?{oldW:2,oldB:2,bankW:0,bankB:0,vault:0}
  :stage==='silo'
  ?{oldW:0,oldB:0,bankW:2,bankB:2,vault:0}
  :{oldW:0,oldB:0,bankW:0,bankB:2,vault:2};
 for(const [k,v] of Object.entries(expectedAfter))
  assert(finalStock[k]===v,'END_STOCK_'+k+':'+finalStock[k]);
 assert(finalStock.wheat_total===2&&finalStock.stone_bricks_total===2,
  'RESOURCES_MINTED_OR_LOST');
 assert(finalBlocks.marker===(stage==='steward'?'lapis_block':'gold_block'),
  'STAGE_MARKER');
 assert(finalBlocks.heirMarker===(stage==='silo_heir'?'emerald_block':'air'),
  'HEIR_MARKER');
 assert(finalBlocks.pond==='water'&&finalBlocks.crop==='wheat'&&
  finalBlocks.commons==='gold_block'&&finalBlocks.bell==='bell',
  'INHERITED_PUBLIC_INFRASTRUCTURE_CHANGED');
 const history=await rcon.send('data get storage lantern:generations history');
 assert(history.includes(stage==='steward'?'STEWARD':
   stage==='silo'?'SILO_BUILT':'INHERITED_WHEAT_RELOCATED'),
   'MISSING_INHERITED_GAME_HISTORY');
 assert(commands.every(x=>!/\b(?:give|clear|loot|item replace|clone)\b/i.test(x.command)),
  'OPERATOR_RESOURCE_INJECTION');
 const observation={
  schema:'lantern.inherited-world-material-observation/v0',
  stage,loaded_parent_cartridge_id:parentId,
  game_version:'26.1.1',world_seed:seed,
  source_sha256:sourceHashes,
  initial_blocks:initialBlocks,
  final_blocks:finalBlocks,
  inherited_material_before:initialStock,
  inherited_material_after:finalStock,
  material_transaction_records:materialActions,
  operator_commands:commands,
  game_owned_history:history,
  independently_connected_nonop_witness:witness.username,
  real_game_clients_which_moved_own_inventory:agents,
  operator_reprovisioned_items:false,
  inherited_infrastructure_persisted:true,
  resource_production_established:false,
  world_save_independently_snapshotted_after_stop:true,
  note:'Reallocation/preservation of exactly 2 in-game wheat and 2 stone bricks across copied Minecraft save generations. No game resource creation.',
  nonclaims:['no human participant consent','no closed-loop material production',
   'no emergent economics or subjective value judgment',
   'world SHA records are not signed reLATTE admission receipts',
   'new empty container blocks are created by owner-authorized game source, not from real material conversion']
 };
 await mkdir('work/inheritance',{recursive:true});
 await writeFile('work/inheritance/game-observation.json',
    JSON.stringify(observation,null,2)+'\n');
 console.log(JSON.stringify({result:'PERSISTED_MATERIAL_WORLD_DESCENDANT_CONFIRMED',
   stage,parent:parentId,stocks_before:initialStock,stocks_after:finalStock,
   material_transfers:materialActions.length,public_infrastructure_inherited:true,
   operator_created_items:0},null,2));
}finally{
 for(const bot of clients){try{bot.quit();}catch{}}
 rcon.end();
}
