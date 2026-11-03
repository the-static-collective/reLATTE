/**
 * LANTERN-009 — Six-episode actual Minecraft stress lab.
 * Both non-OP actors run the SAME evidence-responsive policy, each with its
 * own cold-loaded memory, inventory and personally declared protected reserve.
 * Scenarios alter EXOGENOUS material access, never the actors' decision code.
 */
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {Rcon} from 'rcon-client';
import mineflayer from 'mineflayer';
import {Vec3} from 'vec3';
import {newMemory,choose,learn} from './commons-policy.mjs';

const scenario=process.env.LANTERN_PRESSURE_SCENARIO;
const seed=process.env.LANTERN_PRESSURE_SEED;
const assert=(yes,code)=>{if(!yes)throw Error('COMMONS_009_LIVE_'+code);};
assert(['STABLE','ALTERNATING','COMPETING','RUMOR'].includes(scenario),'SCENARIO');
assert(/^\d+$/.test(seed||''),'SEED');
const hash=x=>createHash('sha256').update(x).digest('hex');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const until=async(fn,label,tries=60,delay=200)=>{
  for(let k=0;k<tries;k++){if(await fn())return;await sleep(delay);}
  throw Error('COMMONS_009_TIMEOUT_'+label);
};
const position={
  grower:new Vec3(104,65,16),mason:new Vec3(114,65,16),
  pond:new Vec3(107,64,8),crop:new Vec3(105,65,6),
  marker:new Vec3(109,65,13),commons:new Vec3(109,65,16),bell:new Vec3(109,66,16)
};
const sourceSha={};
for(const file of ['commons-policy.mjs','live-pressure.mjs']){
  const bytes=await readFile('experiments/lantern-commons-009/'+file);
  sourceSha[file]=hash(bytes);
}
for(const file of ['setup','try_restore','restore']){
  const bytes=await readFile('experiments/lantern-commons-007/datapack/data/lantern/function/cooperation/'+file+'.mcfunction');
  sourceSha['cooperation/'+file]=hash(bytes);
}
const root='work/pressure';
await mkdir(root,{recursive:true});
const bots=[];
const actorLog=[];
const commandLog=[];
const rcon=await Rcon.connect({host:'127.0.0.1',port:25575,password:process.env.MC_RCON_PASSWORD});
async function command(cmd){
  const reply=await rcon.send(cmd);
  commandLog.push({command:cmd,reply});
  assert(!/unknown command|unknown function|not found|incorrect argument|error/i.test(reply),
    'RCON_'+cmd+':'+reply);
  return reply;
}
async function spawn(name){
  const bot=mineflayer.createBot({host:'127.0.0.1',port:25565,auth:'offline',username:name});
  bots.push(bot);
  await Promise.race([
    new Promise((ok,bad)=>{
      bot.once('spawn',ok);
      bot.once('error',bad);
      bot.once('kicked',message=>bad(Error('KICKED_'+name+':'+JSON.stringify(message))));
    }),
    sleep(45000).then(()=>{throw Error('SPAWN_TIMEOUT_'+name);})
  ]);
  return bot;
}
function itemCount(bot,item){
  const id=bot.registry.itemsByName[item]?.id;
  assert(Number.isInteger(id),'UNKNOWN_ITEM_'+item);
  return bot.inventory.items().filter(x=>x.type===id).reduce((s,x)=>s+x.count,0);
}
async function inBarrel(side){
  const coords=side==='grower'?'104 65 16':'114 65 16';
  const item=side==='grower'?'minecraft:wheat':'minecraft:stone_bricks';
  const score=side==='grower'?'#wheat':'#bricks';
  await command('execute store result score '+score+' lc_store if items block '+coords+' container.* '+item);
  const reply=await rcon.send('scoreboard players get '+score+' lc_store');
  const number=reply.match(/(?:has|is)\s+(-?\d+)/)??reply.match(/(-?\d+)/);
  assert(!!number,'BAD_BARREL_COUNT_'+side+':'+reply);
  return Number(number[1]);
}
function blocks(observer){
  const state={};
  for(const [name,pos] of Object.entries(position)){
    if(['grower','mason'].includes(name))continue;
    state[name]=observer.blockAt(pos)?.name??null;
  }
  return state;
}
async function materialMove(bot,role,withdraw=false,round=0){
  const pos=position[role],spot=role==='grower'?'104 65 14':'114 65 14';
  const item=role==='grower'?'wheat':'stone_bricks';
  for(let k=0;k<4&&bot.entity.position.distanceTo(pos)>=4.5;k++){
    await command('tp '+bot.username+' '+spot);
    await sleep(900);
    await bot.waitForChunksToLoad();
  }
  assert(bot.entity.position.distanceTo(pos)<4.5,
    'ACTOR_NOT_NEAR_OWN_BARREL_'+bot.username+':'+JSON.stringify(bot.entity.position));
  const block=bot.blockAt(pos);
  assert(block?.name==='barrel','NO_GAME_BARREL_'+role+':'+block?.name);
  const window=await bot.openContainer(block);
  try{
    const id=bot.registry.itemsByName[item].id;
    if(withdraw)await window.withdraw(id,null,2);
    else await window.deposit(id,null,2);
  }finally{window.close();}
  await until(async()=>await inBarrel(role)===(withdraw?0:2),
    'REAL_TRANSFER_'+role+'_'+round+'_'+withdraw,60,160);
  actorLog.push({round,actor:role,movement:withdraw?'WITHDRAW':'DEPOSIT',
    actual_barrel_items:await inBarrel(role),
    inventory_after:itemCount(bot,item),
    authority:'actor-owned game inventory only; no forced partner transfer'});
}
function shockCard(round){
  // External environment policy. NEITHER actor's choose() receives this label.
  // All conditions are declared up front and affect only finite resources/needs.
  const card={grower:{inventory:4,reserve:1},mason:{inventory:4,reserve:1},rumor:false};
  if(scenario==='ALTERNATING'){
    if(round===2)card.grower.inventory=2;
    if(round===4)card.mason.inventory=2;
  }else if(scenario==='COMPETING'){
    if(round===2 || round===3){card.grower.reserve=3;card.mason.reserve=3;}
    if(round===5)card.grower.reserve=3;
  }else if(scenario==='RUMOR'){
    if(round===2){card.mason.inventory=2;card.rumor=true;}
    if(round===4)card.grower.inventory=2;
  }
  return card;
}
function decisionInput(role,card,memory,actor,partnerDeposit,observer,round){
  return {inventory:itemCount(actor,role==='grower'?'wheat':'stone_bricks'),
    protected_reserve:card[role].reserve,partner_deposit:partnerDeposit,
    episode:round,garden_dry:observer.blockAt(position.pond)?.name==='air'};
}
const records=[],names=['grower','mason'],clients={};
try{
  clients.grower=await spawn('AidGrower');
  clients.mason=await spawn('AidMason');
  clients.witness=await spawn('CoopWitness');
  await command('forceload add 96 -4 124 22');
  await command('tp CoopWitness 109 68 8');
  for(const bot of bots)await bot.waitForChunksToLoad();
  for(const role of names){
    await writeFile(root+'/'+role+'-memory.json',JSON.stringify(newMemory(role),null,2)+'\n');
  }
  for(let round=1;round<=6;round++){
    const card=shockCard(round),endowment=card;
    // Reset the SOURCE GAME island and original 007 reusable mechanism.
    // This is exogenous material flow, not a self-sustaining economy.
    for(const cmd of [
      'setblock 104 65 16 minecraft:air',
      'setblock 114 65 16 minecraft:air',
      'setblock 109 66 16 minecraft:air',
      'function lantern:events/prepare',
      'function lantern:events/drought',
      'function lantern:cooperation/setup',
      'clear AidGrower','clear AidMason'
    ])await command(cmd);
    await sleep(1150); // clear packet settles before give packet
    await command('give AidGrower minecraft:wheat '+card.grower.inventory);
    await command('give AidMason minecraft:stone_bricks '+card.mason.inventory);
    await sleep(1000);
    for(const role of names){
      await until(async()=>itemCount(clients[role],role==='grower'?'wheat':'stone_bricks')===
        card[role].inventory,'ENDOWMENT_'+role+'_'+round);
    }
    await clients.witness.waitForChunksToLoad();
    const initial=blocks(clients.witness);
    assert(initial.pond==='air'&&initial.crop==='air'&&
      initial.marker==='redstone_block'&&initial.commons==='stone_bricks'&&
      initial.bell==='air','INITIAL_WORLD_'+round+':'+JSON.stringify(initial));
    assert(await inBarrel('grower')===0&&await inBarrel('mason')===0,
      'OLD_GIFTS_LEAKED_ROUND_'+round);

    const memories={};
    const first={};
    // Both actors make decisions from separate cold files before either is
    // allowed to act. No actor reads the other's private reserve.
    for(const role of names){
      memories[role]=JSON.parse(await readFile(root+'/'+role+'-memory.json','utf8'));
      const other=role==='grower'?'mason':'grower';
      const own=clients[role],input=decisionInput(role,card,memories[role],own,0,clients.witness,round);
      first[role]={input,decision:choose(memories[role],input)};
    }
    const actionLog={first,followup:[],transfers:[]};
    const offered={grower:false,mason:false};
    const order=round%2===0?['mason','grower']:['grower','mason'];
    for(const role of order){
      const answer=first[role].decision;
      if(answer.may_move_own_items){
        await materialMove(clients[role],role,false,round);
        offered[role]=true;
        actionLog.transfers.push({role,action:answer.act,stage:'first'});
      }
    }
    // Partners each re-evaluate after seeing the ACTUAL separate barrel.
    for(const role of order){
      if(offered[role])continue;
      const other=role==='grower'?'mason':'grower';
      const verified=await inBarrel(other);
      const obs=decisionInput(role,card,memories[role],clients[role],
        verified,clients.witness,round);
      const answer=choose(memories[role],obs);
      actionLog.followup.push({role,observed_partner_barrel:verified,decision:answer});
      if(answer.may_move_own_items){
        await materialMove(clients[role],role,false,round);
        offered[role]=true;
        actionLog.transfers.push({role,action:answer.act,stage:'followup'});
      }
    }
    const realItems={grower:await inBarrel('grower'),mason:await inBarrel('mason')};
    assert(realItems.grower===(offered.grower?2:0) &&
      realItems.mason===(offered.mason?2:0),'FAKE_OR_LOST_GIFT_'+round);
    const restored=realItems.grower===2&&realItems.mason===2;
    if(restored)await until(async()=>clients.witness.blockAt(position.bell)?.name==='bell',
      'JOINT_PUBLIC_REPAIR_'+round,60,180);
    else await sleep(500);
    const mid=blocks(clients.witness);
    assert(mid.pond===(restored?'water':'air')&&
      mid.crop===(restored?'wheat':'air')&&
      mid.marker===(restored?'emerald_block':'redstone_block')&&
      mid.commons===(restored?'gold_block':'stone_bricks')&&
      mid.bell===(restored?'bell':'air'),'PUBLIC_EFFECT_CONTRADICTS_MATERIAL_'+round);

    if(!restored){
      // Refusal/constraint is not penalized: both actual gifts are recoverable.
      for(const role of names){
        if(offered[role]){
          await materialMove(clients[role],role,true,round);
          actionLog.transfers.push({role,action:'RECLAIM_UNCONSUMED_GIFT',stage:'exit'});
        }
      }
    }
    const final=blocks(clients.witness);
    const physical={
      grower:{inventory:itemCount(clients.grower,'wheat'),barrel:await inBarrel('grower')},
      mason:{inventory:itemCount(clients.mason,'stone_bricks'),barrel:await inBarrel('mason')}
    };
    for(const role of names){
      assert(physical[role].inventory+physical[role].barrel===endowment[role].inventory,
        'ITEM_CONSERVATION_'+role+'_'+round);
      assert(physical[role].barrel===(restored?2:0),
        'UNCLAIMED_GIFT_LOCKED_'+role+'_'+round);
    }
    const gameHistory=await rcon.send('data get storage lantern:cooperation history');
    assert(gameHistory.includes('COMMON_GARDEN_RESTORED')===restored,
      'RECEIPT_CONTRADICTS_PUBLIC_WORLD_'+round);
    const updated={};
    for(const role of names){
      const other=role==='grower'?'mason':'grower';
      updated[role]=learn(memories[role],{
        episode:round,own_gift:offered[role],partner_gift:offered[other],
        garden_restored:restored,
        protected_need:first[role].decision.act==='PROTECT_OWN_NEED'
      });
      await writeFile(root+'/'+role+'-memory.json',JSON.stringify(updated[role],null,2)+'\n');
    }
    const episode={round,
      exogenous_public_conditions:{endowment:card,rumor_material_claim_only:card.rumor},
      // A rumor is recorded as UNTRUSTED. Neither policy receives it as a
      // contribution credential; no RCON/material operation arises from it.
      untrusted_rumor:card.rumor?{speaker:'fictional-world-rumor',
        claim:'mason has supposedly already contributed',
        actual_mason_material_before:0,
        acceptance:'NONE'}:null,
      starting_block_observation:initial,actor_decisions:actionLog,
      actual_deposits_before_exit:realItems,world_restored:restored,
      final_observed_blocks:final,item_custody:physical,
      game_history:gameHistory,
      memory_before:memories,memory_after:updated,
      independent_non_op_clients:['AidGrower','AidMason','CoopWitness'],
      game_work_proof:true,human_cooperation_proof:false};
    records.push(episode);
    console.log(JSON.stringify({round,scenario,restored,
      policy_grower:first.grower.decision.act,policy_mason:first.mason.decision.act,
      initial_material:card,real_gifts:realItems,
      consented_player_actions:actionLog.transfers.length},null,0));
  }
  const successes=records.filter(r=>r.world_restored).length;
  const constrained=records.filter(r=>Object.values(r.actor_decisions.first)
    .some(x=>x.decision.act==='PROTECT_OWN_NEED')).length;
  assert(successes>=1,'NO_SUCCESSFUL_MUTUAL_AID');
  if(scenario==='STABLE')assert(successes===6,'ABUNDANCE_FAILED');
  if(scenario==='ALTERNATING')assert(constrained>=2&&successes>=2,
    'RECOVERY_AFTER_ALTERNATING_SHOCK_MISSING');
  if(scenario==='COMPETING')assert(constrained>=2&&successes>=2,
    'RECOVERY_AFTER_PRIVATE_NEED_MISSING');
  if(scenario==='RUMOR')assert(constrained>=2&&
    records.some(r=>r.untrusted_rumor!==null&&
      !r.world_restored)&&successes>=2,
    'FALSE_RUMOR_OR_SHOCK_BYPASSED');
  const evidence={schema:'lantern.longitudinal-cooperation-game-evidence/v0',
    scenario,world_seed:seed,game_version:'26.1.1',
    world_experiment_rounds:6,source_sha256:sourceSha,
    agents_use_same_independent_policy:true,
    no_agent_is_given_scenario_label:true,
    resources_replenished_exogenously_each_round:true,
    adaptive_memories_saved_cold_between_rounds:true,
    episodes:records,
    final_memory:{
      grower:JSON.parse(await readFile(root+'/grower-memory.json','utf8')),
      mason:JSON.parse(await readFile(root+'/mason-memory.json','utf8'))
    },source_command_trace:commandLog,game_item_movements:actorLog,
    outcome:{successful_public_garden_repairs:successes,
      episodes_with_protected_personal_need:constrained,
      failed_or_partial_offers_recovered:true,
      fake_material_claims_have_no_action_authority:true,
      never_forced_partner_inventory:true},
    note:'Real 26.1.1 vanilla Minecraft world and independently observed finite game item transfers; two scripted bounded agents using identical decision code, NOT free humans or general intelligence',
    nonclaims:['world scenario changes exogenous materials and non-binding private reserve cards',
      'episode resources generated by operator; not closed-loop emergent economy',
      'agent policy authored by developer, not invented by freeform AI',
      'no human participation or general social-science causal proof',
      'the soundness of game receipt cannot confer human permission']
  };
  await writeFile(root+'/evidence.json',JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify({result:'LONGITUDINAL_TWO_AGENT_GAME_STRESS_PROVEN',
    scenario,episodes:records.length,public_repairs:successes,protected_need_episodes:constrained,
    max_single_agent_write_access:'own two in-game items',real_people:0},null,2));
}finally{for(const bot of bots){try{bot.quit()}catch{}}rcon.end();}
