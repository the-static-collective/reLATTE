import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import mineflayer from 'mineflayer';
import {Rcon} from 'rcon-client';
import {Vec3} from 'vec3';

const hash=x=>createHash('sha256').update(x).digest('hex');
const insist=(yes,reason)=>{if(!yes)throw Error('WORLD_EVENTS_006_'+reason)};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const scenario=process.env.LANTERN_EVENT_SCENARIO;
const seed=process.env.LANTERN_EVENT_SEED;
insist(['MERCY','ABSTAIN'].includes(scenario),'SCENARIO');
insist(/^\d+$/.test(seed||''),'SEED');
const dir='experiments/lantern-commons-006/datapack/data/lantern/function/events/';
const names=['prepare','drought','mercy','abstain','tempest','flood','show'];
const sources={};
for(const name of names){
  const bytes=await readFile(dir+name+'.mcfunction');
  const lines=bytes.toString('utf8').split(/\r?\n/);
  for(const line of lines){
    const code=line.trim();
    if(!code||code.startsWith('#'))continue;
    insist(/^(?:fill|setblock|weather|scoreboard|data|summon) /.test(code),'UNDECLARED_DIRECTOR_COMMAND:'+name);
    insist(!/\b(?:@a|@p|@e|kill|op|deop|gamemode|execute|function|schedule|setworldspawn)\b/i.test(code),'UNSAFE_DIRECTOR_COMMAND:'+name);
  }
  sources[name]=hash(bytes);
}
const sample=[
  {name:'irrigation',pos:[107,64,8]},
  {name:'pond',pos:[114,64,8]},
  {name:'crop_west',pos:[105,65,6]},
  {name:'crop_east',pos:[110,65,10]},
  {name:'phase_marker',pos:[109,65,13]},
  {name:'lightning_rod',pos:[114,65,2]}
];
const expected={
  PREPARE:{irrigation:'water',pond:'water',crop_west:'wheat',crop_east:'wheat',phase_marker:'lapis_block',lightning_rod:'lightning_rod'},
  DROUGHT:{irrigation:'air',pond:'air',crop_west:'air',crop_east:'air',phase_marker:'redstone_block',lightning_rod:'lightning_rod'},
  MERCY:{irrigation:'water',pond:'water',crop_west:'wheat',crop_east:'wheat',phase_marker:'emerald_block',lightning_rod:'lightning_rod'},
  ABSTAIN:{irrigation:'air',pond:'air',crop_west:'air',crop_east:'air',phase_marker:'redstone_block',lightning_rod:'lightning_rod'}
};
const rcon=await Rcon.connect({host:'127.0.0.1',port:25575,password:process.env.MC_RCON_PASSWORD});
const game=mineflayer.createBot({host:'127.0.0.1',port:25565,username:'WorldWitness'+scenario,auth:'offline'});
const stages=[];
const operatorTrace=[];
try{
  await Promise.race([
    new Promise((resolve,reject)=>{
      game.once('spawn',resolve);
      game.once('error',reject);
      game.once('kicked',reason=>reject(Error('OBSERVER_KICKED:'+JSON.stringify(reason))));
    }),
    sleep(45000).then(()=>{throw Error('OBSERVER_TIMEOUT')})
  ]);
  const tp=await rcon.send('tp '+game.username+' 109 68 8');
  insist(!/unknown|error|failed|not found/i.test(tp),'OBSERVER_TELEPORT');
  await sleep(3500);
  await game.waitForChunksToLoad();
  async function act(name){
    const command='function lantern:events/'+name;
    const result=await rcon.send(command);
    operatorTrace.push({command,result});
    insist(!/unknown|error|not found|incorrect/i.test(result),'FUNCTION_ERROR:'+name+':'+result);
  }
  async function observe(label){
    await sleep(1600);
    await game.waitForChunksToLoad();
    const blocks={};const properties={};
    for(const p of sample){
      const b=game.blockAt(new Vec3(...p.pos));
      blocks[p.name]=b?.name??null;
      properties[p.name]=b?.getProperties?.()??{};
    }
    const problems=Object.entries(expected[label]).filter(([k,v])=>blocks[k]!==v)
      .map(([k,v])=>({site:k,expected:v,actual:blocks[k]}));
    const history=await rcon.send('data get storage lantern:world_events history');
    insist(history.includes(label),'MISSING_GAME_HISTORY:'+label+':'+history.slice(0,130));
    const result={label,blocks,properties,
      observation_sha256:hash(JSON.stringify(blocks)),
      observed_positions:sample.length,problems,
      in_game_history_echo:history};
    stages.push(result);
    insist(problems.length===0,'FAILED_BLOCK_OBSERVATION:'+JSON.stringify(problems));
  }
  await act('prepare');await observe('PREPARE');
  await act('drought');await observe('DROUGHT');
  await act(scenario==='MERCY'?'mercy':'abstain');await observe(scenario);
  const body={
    schema:'lantern.world-events-native-observation/v0',
    scenario,world_seed:seed,game_version:'26.1.1',
    author:'localhost RCON command source',
    observer_username:game.username,
    observer_authority:'non-OP fresh Minecraft protocol client',
    source_sha256:sources,
    operator_trace:operatorTrace,
    stages,checked_sample_positions:sample,
    proof_scope:'actual game blocks and operator script only',
    social_governance_observed:false,
    simulated_human_choice:false,
    real_world_effect:false,
    source_project:'Lantern 006 fictional weather-island director',
    game_independent_observer:true,
    no_automatic_admission:true
  };
  await mkdir('work/world-events',{recursive:true});
  await writeFile('work/world-events/event-record.json',JSON.stringify(body,null,2)+'\n');
  console.log(JSON.stringify({scenario,stages:stages.map(x=>x.label),
    observations:sample.length*stages.length,
    result:'ALL_GAME_BLOCK_STAGES_MATCHED',
    source_functions:names.length},null,2));
}finally{game.quit();rcon.end();}
