/*
 * LANTERN 008: two-round, opt-in Minecraft creature discernment experiment.
 * The creature chooses from ACTUAL game observations plus its own prior round's
 * evidence. Scenarios direct the OTHER game bot only. This is bounded adaptive
 * state updating, not freeform AGI, real-person ethics, or a global social score.
 */
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {Rcon} from 'rcon-client';
import mineflayer from 'mineflayer';
import {Vec3} from 'vec3';
import {freshMemory,decide,remember} from './discernment.mjs';

const scenario=process.env.LANTERN_DISCERNMENT_SCENARIO;
const seed=process.env.LANTERN_DISCERNMENT_SEED;
const assert=(v,c)=>{if(!v)throw Error('LANTERN_008_'+c);};
assert(['RECIPROCATE','REOPEN','DECEIVE','SCARCITY'].includes(scenario),'SCENARIO');
assert(/^\d+$/.test(seed||''),'SEED');
const hash=b=>createHash('sha256').update(b).digest('hex');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const until=async(fn,what,tries=55,interval=240)=>{
  for(let i=0;i<tries;i++){if(await fn())return;await sleep(interval);}
  throw Error('TIMEOUT_'+what);
};
const sites={
  wheat:new Vec3(104,65,16),brick:new Vec3(114,65,16),
  pond:new Vec3(107,64,8),crop:new Vec3(105,65,6),marker:new Vec3(109,65,13),
  commons:new Vec3(109,65,16),bell:new Vec3(109,66,16)
};
const sourceSha={};
for(const f of ['discernment.mjs','live-discernment.mjs']){
  const bytes=await readFile('experiments/lantern-commons-008/'+f);
  sourceSha[f]=hash(bytes);
}
for(const f of ['setup','try_restore','restore']){
  const bytes=await readFile('experiments/lantern-commons-007/datapack/data/lantern/function/cooperation/'+f+'.mcfunction');
  sourceSha['cooperation/'+f]=hash(bytes);
}
const rcon=await Rcon.connect({host:'127.0.0.1',port:25575,password:process.env.MC_RCON_PASSWORD});
const bots=[];
const trace=[];
const command=async(cmd)=>{
  const out=await rcon.send(cmd);
  trace.push({cmd,response:out});
  assert(!/unknown command|not found|error|incorrect argument|unknown function/i.test(out),
    'COMMAND_'+cmd+':'+out);
  return out;
};
async function join(name){
  const bot=mineflayer.createBot({host:'127.0.0.1',port:25565,username:name,auth:'offline'});
  bots.push(bot);
  await Promise.race([
    new Promise((ok,fail)=>{
      bot.once('spawn',ok);bot.once('error',fail);
      bot.once('kicked',reason=>fail(Error('KICKED_'+name+':'+JSON.stringify(reason))));
    }),
    sleep(45000).then(()=>{throw Error('SPAWN_TIMEOUT_'+name)})
  ]);
  return bot;
}
const inventory=(bot,name)=>{
  const id=bot.registry.itemsByName[name]?.id;
  assert(Number.isInteger(id),'BAD_ITEM_'+name);
  return bot.inventory.items().filter(x=>x.type===id).reduce((a,b)=>a+b.count,0);
};
async function barrel(side){
  const [coords,item,key]=side==='wheat'
    ?['104 65 16','minecraft:wheat','#wheat']
    :['114 65 16','minecraft:stone_bricks','#bricks'];
  await command('execute store result score '+key+' lc_store if items block '+coords+' container.* '+item);
  const txt=await rcon.send('scoreboard players get '+key+' lc_store');
  const number=txt.match(/(?:has|is)\s+(-?\d+)/)??txt.match(/(-?\d+)/);
  assert(!!number,'BARREL_PARSE_'+txt);
  return Number(number[1]);
}
async function move(bot,name,side,withdraw=false,count=2){
  const kind=bot.registry.itemsByName[name];
  assert(!!kind,'ITEM_TYPE_'+name);
  const place=bot.blockAt(sites[side]);
  assert(place?.name==='barrel','MISSING_BARREL_'+side+':'+place?.name);
  const window=await bot.openContainer(place);
  try{
    if(withdraw)await window.withdraw(kind.id,null,count);
    else await window.deposit(kind.id,null,count);
  }finally{window.close();}
}
function blocks(bot){
  return Object.fromEntries(Object.entries(sites).map(([k,p])=>[k,bot.blockAt(p)?.name??null]));
}
// Test-world policy for the mason is deliberately independent from the creature.
// World SCENARIO selects the partner's environmental constraints, not its creature actions.
async function independentPartnerPolicy({round,creatureGift,brickInventory,mason}){
  if(scenario==='RECIPROCATE'){
    if(creatureGift){await move(mason,'stone_bricks','brick');return {statement:'GIFT',moved:true,reason:'Observed actual wheat gift'};}
    return {statement:'DECLINE',moved:false,reason:'No reciprocal invitation observed'};
  }
  if(scenario==='REOPEN'){
    if(round===1)return {statement:'DECLINE',moved:false,reason:'First round choice: decline without penalty'};
    await move(mason,'stone_bricks','brick');
    return {statement:'GIFT',moved:true,reason:'Next round independently offers actual materials'};
  }
  if(scenario==='DECEIVE')return {
    statement:'CLAIM_GIFT',moved:false,
    reason:'Adversarial unverified claim, zero physical game inventory transfer'};
  if(scenario==='SCARCITY'){
    if(brickInventory<2)return {statement:'UNABLE',moved:false,
      reason:'Truthful inability: only one stone brick available'};
    await move(mason,'stone_bricks','brick');
    return {statement:'GIFT',moved:true,reason:'Capacity changed; actual resources now available'};
  }
  throw Error('BAD_PARTNER_POLICY');
}
await mkdir('work/discernment',{recursive:true});
const records=[];
try{
  const grower=await join('AidGrower');
  const mason=await join('AidMason');
  const witness=await join('CoopWitness');
  for(const c of ['forceload add 96 -4 124 22',
    'tp AidGrower 104 65 14','tp AidMason 114 65 14',
    'tp CoopWitness 109 68 8'])await command(c);
  await sleep(1500);
  for(const b of bots)await b.waitForChunksToLoad();
  let memory=freshMemory();
  await writeFile('work/discernment/creature-memory.json',JSON.stringify(memory,null,2)+'\n');

  for(const round of [1,2]){
    // Each round is a NEW EPISODE, not conservation across rounds.
    // In particular, the operator provisions the same fresh two wheat units
    // every episode. In SCARCITY, changed partner capacity is explicit.
    const brickSupply=scenario==='SCARCITY'&&round===1?1:2;
    for(const c of [
      'setblock 104 65 16 minecraft:air',
      'setblock 114 65 16 minecraft:air',
      'setblock 109 66 16 minecraft:air',
      'function lantern:events/prepare',
      'function lantern:events/drought',
      'function lantern:cooperation/setup',
      'clear AidGrower','clear AidMason',
      'give AidGrower minecraft:wheat 2',
      'give AidMason minecraft:stone_bricks '+brickSupply,
    ])await command(c);
    await until(async()=>inventory(grower,'wheat')===2,'SELF_INVENTORY_ROUND_'+round);
    await until(async()=>inventory(mason,'stone_bricks')===brickSupply,'PARTNER_INVENTORY_ROUND_'+round);
    await sleep(500);
    const initial={blocks:blocks(witness),self_inventory:inventory(grower,'wheat'),
      partner_inventory:inventory(mason,'stone_bricks'),
      wheat_barrel:await barrel('wheat'),brick_barrel:await barrel('brick')};
    assert(initial.blocks.marker==='redstone_block' &&
      initial.blocks.pond==='air'&&initial.blocks.crop==='air' &&
      initial.blocks.commons==='stone_bricks' &&
      initial.blocks.bell==='air' &&
      initial.wheat_barrel===0&&initial.brick_barrel===0,
      'STARTING_ENVIRONMENT_'+round+':'+JSON.stringify(initial));

    // Disk read is the actual state carried between episodes; no scenario hints.
    const onDisk=JSON.parse(await readFile('work/discernment/creature-memory.json','utf8'));
    assert(JSON.stringify(onDisk)===JSON.stringify(memory),'MEMORY_RESTART_MISMATCH');
    const first=decide(onDisk,{self_items:inventory(grower,'wheat'),
      partner_barrel_items:initial.brick_barrel,garden_dry:true});
    let offeredFirst=false;
    const creatureTrace=[{step:'first_decision',actual_input:{
      self_items:initial.self_inventory,partner_barrel_items:initial.brick_barrel,
      garden_dry:true,prior_memory:onDisk},decision:first}];
    if(first.action==='OFFER_REVERSIBLY'){
      await move(grower,'wheat','wheat');
      await until(async()=>await barrel('wheat')===2,'GROWER_ACTUAL_OFFER_'+round);
      offeredFirst=true;
      creatureTrace.push({step:'actual_wheat_offer',barrel_items:await barrel('wheat')});
    }else assert(first.action==='WAIT_FOR_MATERIAL_PROOF','UNEXPECTED_CREATURE_FIRST_ACTION');

    const partner=await independentPartnerPolicy({round,creatureGift:offeredFirst,
      brickInventory:inventory(mason,'stone_bricks'),mason});
    const actualPartnerItems=await barrel('brick');
    assert(actualPartnerItems===(partner.moved?2:0),
      'PARTNER_PHYSICAL_CONTRADICTION_'+round);
    creatureTrace.push({step:'partner_separate_game_policy',statement:partner.statement,
      claim_only:partner.statement==='CLAIM_GIFT',observed_game_bricks:actualPartnerItems,
      game_remarks_do_not_have_authority:true});

    let offeredAfter=false;
    if(!offeredFirst){
      const followup=decide(onDisk,{self_items:inventory(grower,'wheat'),
        partner_barrel_items:actualPartnerItems,garden_dry:true});
      creatureTrace.push({step:'followup_decision',decision:followup,
        observed_partner_material:actualPartnerItems});
      if(followup.action==='RECIPROCATE_VERIFIED'){
        await move(grower,'wheat','wheat');
        await until(async()=>await barrel('wheat')===2,'SECONDARY_OFFER_'+round);
        offeredAfter=true;
      }else assert(followup.action==='WAIT_FOR_MATERIAL_PROOF','UNSAFE_FOLLOWUP');
    }

    const gaveActual=offeredFirst||offeredAfter;
    const restored=gaveActual&&partner.moved;
    if(restored)await until(async()=>witness.blockAt(sites.bell)?.name==='bell',
      'PUBLIC_EFFECT_'+round,70,250);
    else await sleep(1000);
    const witnessed=blocks(witness);
    assert(witnessed.pond===(restored?'water':'air')&&
      witnessed.crop===(restored?'wheat':'air')&&
      witnessed.marker===(restored?'emerald_block':'redstone_block')&&
      witnessed.commons===(restored?'gold_block':'stone_bricks')&&
      witnessed.bell===(restored?'bell':'air'),'WORLD_EFFECT_'+round+':'+JSON.stringify(witnessed));
    if(gaveActual&&!restored){
      await move(grower,'wheat','wheat',true);
      await until(async()=>await barrel('wheat')===0,'GROWER_RETRIEVAL_'+round);
      creatureTrace.push({step:'own_unconsumed_items_retrieved',count:2});
    }
    const final={
      blocks:blocks(witness),
      self_inventory:inventory(grower,'wheat'),
      partner_inventory:inventory(mason,'stone_bricks'),
      wheat_barrel:await barrel('wheat'),
      brick_barrel:await barrel('brick'),
      event_history:await rcon.send('data get storage lantern:world_events history'),
      game_history:await rcon.send('data get storage lantern:cooperation history')
    };
    assert(final.self_inventory===(restored?0:2)&&
      final.wheat_barrel===(restored?2:0)&&
      final.partner_inventory===brickSupply-(partner.moved?2:0)&&
      final.brick_barrel===(partner.moved?2:0) &&
      final.game_history.includes('COMMON_GARDEN_RESTORED')===restored,
      'ROUND_RESOURCE_ACCOUNTING_'+round+':'+JSON.stringify(final));
    const updated=remember(onDisk,{
      partner_statement:partner.statement,
      partner_barrel_items:final.brick_barrel,
      garden_restored:restored,
      grower_material_moved:gaveActual
    });
    await writeFile('work/discernment/creature-memory.json',JSON.stringify(updated,null,2)+'\n');
    const record={round,actor_policy_is_scripted:true,game_world_really_ran:true,
      scenario_only_changes_partner_behavior:true,
      previous_memory:onDisk,
      creature_trace:creatureTrace,initial,partner,
      restored,final,updated_memory:updated,
      evidence_origin:'separate bot inventories, actual barrel contents, fresh non-OP observer'};
    records.push(record);
    memory=updated;
  }
  assert(memory.episodes===2,'NOT_TWO_EPISODES');
  const results=records.map(r=>r.restored);
  const expectedByScenario={
    RECIPROCATE:[true,true],REOPEN:[false,true],
    DECEIVE:[false,false],SCARCITY:[false,true]
  };
  assert(JSON.stringify(results)===JSON.stringify(expectedByScenario[scenario]),
    'LEARNING_COUNTERFACTUAL_MISMATCH');
  if(scenario==='REOPEN'||scenario==='SCARCITY'){
    assert(records[1].creature_trace[0].decision.action==='WAIT_FOR_MATERIAL_PROOF'&&
      records[1].creature_trace.some(x=>x.step==='followup_decision'&&
        x.decision.action==='RECIPROCATE_VERIFIED'),
      'FAILED_REOPENING');
  }
  if(scenario==='DECEIVE')assert(records[1].creature_trace.every(x=>
    x.step!=='actual_wheat_offer'&&
    (x.step!=='followup_decision'||x.decision.action==='WAIT_FOR_MATERIAL_PROOF')),
    'DECEPTION_OVERRIDE');
  if(scenario==='RECIPROCATE')assert(records[1].creature_trace[0].decision.action===
    'OFFER_REVERSIBLY','SUCCESS_NOT_REUSED');

  const evidence={schema:'lantern.creature-discernment-game-evidence/v0',
    scenario,game_version:'26.1.1',seed,episodes:records,final_memory:memory,
    source_sha256:sourceSha,command_trace:trace,
    independent_clients:['AidGrower','AidMason','CoopWitness'],
    actual_actor_inventory_proof:true,non_op_observer:true,
    no_humans_claimed:true,
    creature_strategy:'bounded online policy chosen from observed game resources and prior evidence; not autonomous AGI',
    note:'Scenario chosen for independent counterpart behavior; creature policy does not receive scenario',
    scope:'two rounds within one disposable official Java Minecraft world, per run',
    limitations:['predefined action vocabulary and small memory not generalized intelligence',
      'no human desire, rights or intrinsic moral score',
      'new operator endowment per round, not conservation across episodes',
      'game-world weather and objects only',
      'no authority to force partner transfers or grant execution',
      'no emergence of novel skills outside authored world rules']
  };
  await writeFile('work/discernment/evidence.json',JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify({scenario,round_results:results,
    first_creature_action:records[0].creature_trace[0].decision.action,
    second_creature_action:records[1].creature_trace[0].decision.action,
    memory_after:memory,
    actual_official_game:true,distinct_real_humans:0},null,2));
}finally{for(const bot of bots){try{bot.quit()}catch{}}rcon.end();}
