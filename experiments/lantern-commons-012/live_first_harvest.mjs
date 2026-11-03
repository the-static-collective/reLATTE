/**
 * LANTERN 012 — Actual Minecraft production from inherited ripe crops.
 *
 * World parent is a whole verified SILO_HEIR saved world (not a fresh garden).
 * Operator may create EMPTY warehouses and advance natural random ticks.
 * A real non-OP player breaks mature blocks, collects vanilla drops, stores
 * goods, plants one inherited seed, harvests its naturally matured offspring,
 * crafts bread from three wheat and tries to EAT it while hungry.
 *
 * No /give, /clear, /loot, /item replace or setblock wheat; no fake inventory.
 */
import mineflayer from 'mineflayer';
import {Rcon} from 'rcon-client';
import {Vec3} from 'vec3';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const mode=process.env.LANTERN_012_STAGE;
const parentId=process.env.LANTERN_012_PARENT_ID;
const seed=process.env.LANTERN_012_SEED;
const must=(v,s)=>{if(!v)throw Error('LANTERN_012_'+s);};
must(['reserve','harvest','heir'].includes(mode),'MODE');
must(/^[0-9a-f]{64}$/.test(parentId??''),'PARENT');
must(seed==='314159265','SEED');
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
const until=async(check,id,n=80,ms=190)=>{
  for(let i=0;i<n;i++){if(await check())return;await sleep(ms);}
  throw Error('LANTERN_012_TIMEOUT_'+id);
};
const sha=b=>createHash('sha256').update(b).digest('hex');
const positions={
  originalWheat:new Vec3(117,65,17),bricks:new Vec3(116,65,17),
  originalSiloWheat:new Vec3(113,65,17),
  bank:new Vec3(110,65,18),seeds:new Vec3(111,65,18),
  bread:new Vec3(112,65,18),table:new Vec3(112,65,17),
  marker:new Vec3(110,66,19),heirMarker:new Vec3(112,66,19),
  pond:new Vec3(107,64,8),publicBell:new Vec3(109,66,16),
  farmTile:new Vec3(103,64,6),
  replanted:new Vec3(103,65,6)
};
const CLIENTS=[],commandHistory=[],movements=[],growthProof=[];
const rcon=await Rcon.connect({host:'127.0.0.1',port:25575,password:process.env.MC_RCON_PASSWORD});
async function cmd(value){
 const verb=value.trim().split(/\s+/)[0];
 if(['give','clear','loot','clone','item','summon','fill','setblock'].includes(verb))
   throw Error('LANTERN_012_FORBIDDEN_WORLD_OR_ITEM_INJECTION:'+value);
 const x=await rcon.send(value);
 must(!/Unknown command|Unknown function|Incorrect argument|not found|error/i.test(x),
   'RCON_'+value+':'+x);
 commandHistory.push({command:value,result:x});
 return x;
}
async function bot(name){
 const b=mineflayer.createBot({host:'127.0.0.1',port:25565,username:name,auth:'offline'});
 CLIENTS.push(b);
 await Promise.race([
  new Promise((yes,no)=>{
   b.once('spawn',yes);b.once('error',no);
   b.once('kicked',reason=>no(Error('GAME_CLIENT_KICKED:'+JSON.stringify(reason))));
  }),
  sleep(45000).then(()=>{throw Error('CLIENT_SPAWN_TIMEOUT')})
 ]);
 return b;
}
function block(b,name){
 return b.blockAt(positions[name])?.name??null;
}
function countInventory(b,name){
 const id=b.registry?.itemsByName?.[name]?.id;
 must(Number.isInteger(id),'UNKNOWN_GAME_ITEM_'+name);
 return b.inventory.items().filter(x=>x.type===id).reduce((n,x)=>n+x.count,0);
}
async function countBank(name,item){
 if(!['originalWheat','bricks','originalSiloWheat','bank','seeds','bread'].includes(name))
   throw Error('BAD_CONTAINER');
 const pos=positions[name];
 const key='#012'+name+item;
 const itemId='minecraft:'+item;
 await cmd(`execute store result score ${key} lc_store if items block ${pos.x} ${pos.y} ${pos.z} container.* ${itemId}`);
 const reply=await rcon.send('scoreboard players get '+key+' lc_store');
 const m=reply.match(/(?:has|is)\s+(-?\d+)/)??reply.match(/(-?\d+)/);
 must(!!m,'COUNT_PARSE:'+reply);
 return Number(m[1]);
}
async function snapshot(b){
 const state={};
 for(const k of Object.keys(positions))state[k]=block(b,k);
 const stock={
  vault_wheat:await countBank('originalWheat','wheat'),
  silo_bricks:await countBank('bricks','stone_bricks'),
  silo_wheat:await countBank('originalSiloWheat','wheat'),
  harvest_wheat:block(b,'bank')==='barrel'?await countBank('bank','wheat'):0,
  harvested_seeds:block(b,'seeds')==='barrel'?await countBank('seeds','wheat_seeds'):0,
  bread:block(b,'bread')==='barrel'?await countBank('bread','bread'):0,
 };
 return {blocks:state,stock};
}
async function move(b,x,y,z){
 await cmd('tp '+b.username+' '+x+' '+y+' '+z);
 await sleep(700);
 await b.waitForChunksToLoad();
 const p=b.entity.position;
 // On survival servers a player teleported over air lands on the real world
 // floor before its client position update arrives. Check horizontal arrival,
 // and separately enforce that the avatar stayed in the bounded game lab.
 must(Math.hypot(p.x-Number(x),p.z-Number(z))<2.0 &&
   p.y>=63 && p.y<=Number(y)+2,
   'TELEPORT_POSITION_UNKNOWN_'+JSON.stringify(p));
}
async function deposit(b,loc,item,n){
 must(block(b,loc)==='barrel','DEST_NOT_REAL_BARREL_'+loc);
 must(countInventory(b,item)>=n,'NO_OWNER_INVENTORY_FOR_DEPOSIT_'+item);
 const p=positions[loc];
 await move(b,p.x,p.y,p.z+2);
 const win=await b.openContainer(b.blockAt(p));
 try{await win.deposit(b.registry.itemsByName[item].id,null,n);}
 finally{win.close();}
 await until(async()=>await countBank(loc,item)>=n,'NO_SERVER_DEPOSIT_'+loc);
 movements.push({actor:b.username,action:'ACTUAL_GAME_DEPOSIT',item,amount:n,into:loc});
}
async function withdraw(b,loc,item,n){
 const existing=await countBank(loc,item);
 must(existing>=n,'PARENT_STOCK_NOT_PRESENT_'+loc+'_'+item);
 const p=positions[loc];
 await move(b,p.x,p.y,p.z+2);
 const win=await b.openContainer(b.blockAt(p));
 try{await win.withdraw(b.registry.itemsByName[item].id,null,n);}
 finally{win.close();}
 await until(async()=>countInventory(b,item)>=n,'NO_OWNER_WITHDRAW_ACK_'+item);
 await until(async()=>await countBank(loc,item)===existing-n,'SOURCE_BARREL_NOT_DEBITED_'+item);
 movements.push({actor:b.username,action:'ACTUAL_GAME_WITHDRAW',item,amount:n,from:loc});
}
async function harvestCrop(b,z,index){
 const position=new Vec3(103,65,z);
 // Stand outside farm border: no trampling or artificial plant replacement.
 await move(b,102.7,65,z+0.5);
 const target=b.blockAt(position);
 must(target?.name==='wheat','NO_INHERITED_MATURE_CROP_'+z+':'+target?.name);
 const props=target.getProperties?.()??{};
 must(String(props.age)==='7','CROP_NOT_MATURE_'+z+':'+JSON.stringify(props));
 const was=countInventory(b,'wheat');
 await b.dig(target,true);
 await until(async()=>b.blockAt(position)?.name==='air','WORLD_CROP_NOT_BROKEN_'+z);
 await until(async()=>countInventory(b,'wheat')>=was+1,'WORLD_DROP_NOT_PICKED_UP_'+z,110,170);
 growthProof.push({event:'REAL_BLOCK_BREAK_AND_ITEM_PICKUP',position:[103,65,z],
  before:'wheat[age=7]',after:'air',grain_inventory_added:countInventory(b,'wheat')-was,
  crop_origin:index==='regrowth'?'PLAYER_PLANTED_AND_RANDOM_TICK_MATURED':'INHERITED_RIPE_FIELD_FROM_006'});
}
const sourceHashes={};
for(const file of ['prepare','complete','reserve','prepare_heir','complete_heir','tick']){
 const x=await readFile('experiments/lantern-commons-012/datapack/data/lantern/function/harvest/'+file+'.mcfunction');
 sourceHashes[file]=sha(x);
}
try{
 await sleep(2400);
 await cmd('forceload add 96 -4 124 22');
 const witness=await bot('WC012_Witness');
 await move(witness,102.5,65,14.5);
 await sleep(900);
 const first=await snapshot(witness);
 const initialSeed=first.stock.harvested_seeds;
 must(first.stock.vault_wheat===2&&first.stock.silo_bricks===2&&
   first.stock.silo_wheat===0,'INHERITED_CARTRIDGE_STOCKS');
 must(first.blocks.pond==='water'&&first.blocks.publicBell==='bell',
   'INHERITED_PUBLIC_INFRASTRUCTURE');
 must(first.blocks.farmTile==='farmland','INHERITED_FARMLAND_MISSING');
 const expectedSourceHarvest=mode==='heir'?8:0;
 must(first.stock.harvest_wheat===expectedSourceHarvest,
   'FORK_SOURCE_HARVEST_NOT_EXACT');
 if(mode==='heir'){
   must(first.blocks.marker==='gold_block'&&initialSeed>=2&&
     first.blocks.replanted==='air','NO_HARVEST_OR_SEED_STOCK_FROM_PARENT');
 }else{
   must(first.blocks.marker==='air'&&initialSeed===0&&
     first.blocks.replanted==='wheat','MUST_START_FROM_PARENT_RIPE_FIELD');
 }
 const farmerActions=[];
 if(mode==='reserve')await cmd('function lantern:harvest/reserve');
 if(mode==='harvest'){
  await cmd('function lantern:harvest/prepare');
  const farmer=await bot('AidHarvester');
  must(countInventory(farmer,'wheat')===0&&countInventory(farmer,'wheat_seeds')===0,
    'FARMER_STARTED_WITH_UNDECLARED_ITEMS');
  for(let z=4;z<=11;z++)await harvestCrop(farmer,z,'inherited');
  const wheat=countInventory(farmer,'wheat');
  const seeds=countInventory(farmer,'wheat_seeds');
  must(wheat===8&&seeds>=2,'INHERITED_CROP_NOT_ACTUALLY_HARVESTED:'+wheat+':'+seeds);
  await deposit(farmer,'bank','wheat',wheat);
  await deposit(farmer,'seeds','wheat_seeds',seeds);
  await until(async()=>block(witness,'marker')==='gold_block','NO_GAME_HARVEST_GATE');
  farmerActions.push({action:'EIGHT_EXISTING_RIPE_CROPS_HARVESTED',wheat,seeds,
   no_operator_item_grants:true});
 }
 if(mode==='heir'){
  await cmd('function lantern:harvest/prepare_heir');
  const farmer=await bot('AidHarvester');
  must(countInventory(farmer,'wheat')===0&&countInventory(farmer,'wheat_seeds')===0,
    'HEIR_BOT_UNDECLARED_SUPPLY');
  await withdraw(farmer,'seeds','wheat_seeds',1);
  // Real player places a seed on the actual unoccupied farmland tile.
  await move(farmer,102.7,65,6.5);
  must(block(farmer,'farmTile')==='farmland'&&block(farmer,'replanted')==='air',
    'HEIR_PLOT_IS_NOT_FARMLAND');
  await farmer.equip(farmer.registry.itemsByName.wheat_seeds.id,'hand');
  await farmer.placeBlock(farmer.blockAt(positions.farmTile),new Vec3(0,1,0));
  await until(async()=>block(witness,'replanted')==='wheat','SEED_NOT_PLANTED');
  await until(async()=>countInventory(farmer,'wheat_seeds')===0,'SEED_NOT_CONSUMED_BY_PLANT');
  const newCrop=farmer.blockAt(positions.replanted);
  must(Number(newCrop.getProperties?.().age??-1)<7,'SPAWNED_CROP_ALREADY_RIPE');
  growthProof.push({event:'REAL_NON_OP_PLAYER_PLANTED_INHERITED_SEED',
   source:'harvested_seeds barrel from parent world v0.1.4',position:[103,65,6],
   initial_age:newCrop.getProperties?.().age,
   operator_setblock_wheat:false});
  // Increasing RANDOM ticks advances VANILLA crop simulation, not source
  // construction or inventory minting. This is a controlled acceleration.
  await cmd('gamerule random_tick_speed 1800');
  await until(async()=>{
   const b=witness.blockAt(positions.replanted);
   return b?.name==='wheat'&&Number(b.getProperties?.().age??-1)===7;
  },'VANILLA_WHEAT_DID_NOT_GROW',160,190);
  await until(async()=>block(witness,'heirMarker')==='emerald_block',
    'VANILLA_GROWTH_GATE_NOT_WITNESSED');
  growthProof.push({event:'VANILLA_RANDOM_TICKS_MATURED_REAL_PLAYER_SEED',
   position:[103,65,6],after:'wheat[age=7]',operator_setblock_wheat:false,
   random_tick_speed:1800});
  await harvestCrop(farmer,6,'regrowth');
  await cmd('gamerule random_tick_speed 3');
  must(countInventory(farmer,'wheat')>=1,'NO_ACTUAL_SECOND_GENERATION_WHEAT');
  await deposit(farmer,'bank','wheat',1);
  // Three genuine wheat items are physically spent on a vanilla 3-wheat
  // bread recipe. This establishes real Minecraft material transformation.
  await withdraw(farmer,'bank','wheat',3);
  await move(farmer,112,65,16);
  const table=farmer.blockAt(positions.table);
  must(table?.name==='crafting_table','MISSING_REAL_CRAFTING_TABLE');
  const breadId=farmer.registry.itemsByName.bread.id;
  const recipes=farmer.recipesFor(breadId,null,1,table);
  must(recipes.length>0,'VANILLA_BREAD_RECIPE_UNAVAILABLE');
  await farmer.craft(recipes[0],1,table);
  await until(async()=>countInventory(farmer,'bread')===1,'BREAD_NOT_ACTUALLY_CRAFTED');
  await until(async()=>countInventory(farmer,'wheat')===0,'WHEAT_NOT_SPENT_ON_BREAD');
  farmerActions.push({action:'VANILLA_CRAFT_BREAD',wheat_spent:3,bread_created:1,
    recipe_source:'minecraft:bread',raw_wheat_initial_harvest_bank:8,
    planted_and_reharvested_wheat:1});
  // Actual consumption requires the game to lower hunger; don't fabricate a
  // food-eating receipt if the client remains too full to consume the bread.
  await cmd('difficulty normal');
  await cmd('effect give AidHarvester minecraft:hunger 18 20 true');
  await until(async()=>farmer.food<19,'FARMER_NOT_HUNGRY',100,200);
  await cmd('effect clear AidHarvester minecraft:hunger');
  const hungerBefore=farmer.food;
  await farmer.equip(breadId,'hand');
  await farmer.consume();
  await until(async()=>countInventory(farmer,'bread')===0,
    'BREAD_NOT_EATEN_BY_REAL_GAME_PLAYER',70,180);
  farmerActions.push({action:'ACTUAL_VANILLA_GAME_BREAD_EATEN',
    bread_items_consumed:1,hunger_before:hungerBefore,
    hunger_after:farmer.food,
    wheat_equivalent_spent:3});
 }
 await sleep(450);
 const last=await snapshot(witness);
 const farmerOutput=farmerActions;
 must(last.stock.vault_wheat===2&&last.stock.silo_bricks===2&&
   last.stock.silo_wheat===0,'ORIGINAL_GOODS_STOLEN_OR_REPROVISIONED');
 if(mode==='reserve')must(last.stock.harvest_wheat===0&&last.blocks.marker==='lapis_block',
   'RESERVE_CHANGED_HARVEST');
 if(mode==='harvest')must(last.stock.harvest_wheat===8&&
   last.stock.harvested_seeds>=2&&last.blocks.marker==='gold_block',
   'FIRST_HARVEST_INCORRECT');
 if(mode==='heir')must(last.stock.harvest_wheat===6&&
   last.stock.harvested_seeds>=1&&last.blocks.heirMarker==='emerald_block'&&
   last.blocks.replanted==='air',
   'INHERITED_SEED_GROWTH_OR_REAL_FOOD_USE_INCORRECT:'+JSON.stringify(last));
 const gameHistory=await rcon.send('data get storage lantern:harvest history');
 must(gameHistory.includes(mode==='reserve'?'RESERVE_UNHARVESTED':
   mode==='harvest'?'WHEAT_HARVEST_STORED':'NEW_WHEAT_MATURED_NATURALLY'),
   'GAME_OWNED_HARVEST_HISTORY_MISSING');
 const observation={
  schema:'lantern.first-harvest-game-observation/v0',
  mode,loaded_parent_cartridge_id:parentId,
  game_version:'26.1.1',world_seed:seed,
  inherited_parent_state:first,
  finished_world_state:last,
  witnessed_real_crop_actions:growthProof,
  witnessed_real_item_transactions:movements,
  crafted_and_consumed_food:farmerOutput,
  command_history:commandHistory,
  game_owned_history:gameHistory,
  exact_source_sha256:sourceHashes,
  independent_nonop_game_observer:'WC012_Witness',
  operator_item_provisions:0,
  crop_growth_method:mode==='heir'?'random ticks on seed planted by real non-OP client':
    mode==='harvest'?'harvesting inherited preexisting ripe crops':'no harvest',
  boundaries:['full world save child of exact cryptographic parent',
   'mature parent field was originally created by authored 006 game intervention',
   'test fertilizer is time acceleration, not a material grant',
   'food consumption is game simulation, not real hunger relief',
   'no human participants or real food output; no economy proven']
 };
 await mkdir('work/first-harvest',{recursive:true});
 await writeFile('work/first-harvest/game-observation.json',
    JSON.stringify(observation,null,2)+'\n');
 console.log(JSON.stringify({result:'REAL_MINECRAFT_FIRST_HARVEST_GAME_STAGE_WITNESSED',
   mode,parent:parentId,initial:first.stock,ending:last.stock,
   event_types:growthProof.map(x=>x.event),
   food_actions:farmerActions,operator_item_grants:0},null,2));
}finally{
 for(const b of CLIENTS){try{b.quit()}catch{}}
 rcon.end();
}
