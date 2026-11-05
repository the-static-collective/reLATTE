/* Minecraft 009 — execute the MOTIF-selected game instrument on a NEW
 * isolated official vanilla server, with a real fresh non-OP Mineflayer
 * protocol observer. All effects confined to a localhost game world.
 * Signed result is R3_HOLD, never an assertion about physical ecology.
 */
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {makeObservation,makePolyglotHop,verifyHopBinding}
  from '../polyglot-crossing-001/common.ts';
import {generateP256KeyPair,verifyCrossingEnvelope,verifyReceipt}
  from '../../src/protocol.ts';
import {verifyExistingCustodyBytes,SOURCE_SHA256}
  from '../riff-raft-minecraft-007/custody-audit.mjs';
import {SCHEMA as PROPOSAL_SCHEMA}
  from '../motif-instrument-008/compose.mjs';

const require=createRequire(import.meta.url);
const mineflayer=require('mineflayer');
const {Vec3}=require('vec3');
const {Rcon}=require('rcon-client');

export const RESULT_SCHEMA='relatte.motif-minecraft-009-live-observation/v0';
export const BUNDLE_SCHEMA='relatte.motif-minecraft-009-signed-result/v0';
const error=(yes,why)=>{if(!yes)throw Error('MOTIF_MC009_'+why)};
const sha=x=>createHash('sha256').update(x).digest('hex');
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
const root=process.env.MOTIF_009_WORK??'work/motif-minecraft-009';
const prepDir=process.env.MOTIF_008_WORK??'work/motif-minecraft-instrument-008';
const SOURCE='fixtures/riff-raft-minecraft-006/signed-005-return.bundle.json';
const host=process.env.MC_HOST??'127.0.0.1';
const mcPort=Number(process.env.MC_PORT??25565);
const rconPort=Number(process.env.MC_RCON_PORT??25575);
const password=process.env.MC_RCON_PASSWORD??'relatte-ci';
const observerPos={x:0,y:80,z:46};
const fixedSeed='918273645';

function serverScore(response) {
  // Vanilla response is "xxx has N [objective]"; extraction of the final
  // integer prevents accidental substring matches for player/coordinate IDs.
  const nums=String(response).match(/-?\d+/g)??[];
  const score=Number(nums.at(-1));
  error(nums.length>0&&Number.isSafeInteger(score),'SCOREBOARD_READ_FAILED');
  return score;
}
export async function inspectServerLamps(rcon,stations,label) {
  const observations=[];
  for(let i=0;i<stations.length;i++) {
    const station=stations[i],p=station.at,who='#m9_'+label+'_'+i;
    await rcon.send('scoreboard players set '+who+' motif_count 0');
    await rcon.send('execute if block '+p.x+' '+p.y+' '+p.z+
      ' minecraft:redstone_lamp[lit=true] run scoreboard players set '+
      who+' motif_count 1');
    const response=String(await rcon.send('scoreboard players get '+who+' motif_count'));
    const value=serverScore(response);
    error(value===0||value===1,'NON_BOOLEAN_BLOCKSTATE');
    observations.push({
      cue:station.cue,at:p,lit:value===1,
      server_predicate:'minecraft:redstone_lamp[lit=true]',
      server_response:response,
    });
  }
  return observations;
}

function waitForSpawn(bot) {
  return new Promise((ok,fail)=>{
    const timer=setTimeout(()=>fail(Error('OBSERVER_SPAWN_TIMEOUT')),60000);
    bot.once('spawn',()=>{clearTimeout(timer);ok()});
    bot.once('error',e=>{clearTimeout(timer);fail(e)});
    bot.once('kicked',e=>{clearTimeout(timer);fail(Error(String(e)))});
  });
}
async function readFreshNonOp(rcon,stations,name) {
  let observer;
  try {
    observer=mineflayer.createBot({host,port:mcPort,username:name,auth:'offline'});
    await waitForSpawn(observer);
    await rcon.send('deop '+name);
    await rcon.send('tp '+name+' '+observerPos.x+' '+observerPos.y+' '+observerPos.z);
    await observer.waitForChunksToLoad();
    await sleep(1200);
    const playerList=String(await rcon.send('list'));
    error(playerList.includes(name),'OBSERVER_NOT_IN_SERVER');
    const rows=stations.map(s=>{
      const block=observer.blockAt(new Vec3(s.at.x,s.at.y,s.at.z));
      const props=block?.getProperties?.()??{};
      error(block?.name==='redstone_lamp'&&typeof props.lit==='boolean',
        'FRESH_NONOP_CLIENT_MISSING_LAMP:'+s.cue);
      return {cue:s.cue,at:s.at,name:block.name,lit:props.lit};
    });
    return {username:name,operator:false,auth:'offline-test-fixture',
      game_protocol:observer.version, independent_new_connection:true, rows};
  } finally {try{observer?.quit('readout done')}catch{}}
}

export function checkGameTrace(state,trace,meta) {
  error(state?.schema===PROPOSAL_SCHEMA &&
    state.target_world==='B' && state.target_world_seed===fixedSeed &&
    state.new_fault_repeater?.x===-13 &&
    state.new_fault_repeater.y===66 &&
    state.new_fault_repeater.z===46,'UNKNOWN_INSTRUMENT');
  error(trace?.schema==='relatte.minecraft-009-game-trace/v0'&&
    trace.world==='B'&&trace.seed===fixedSeed&&trace.fault_x===-13,
    'WRONG_GAME_WORLD_OR_FAULT');
  error(trace?.server_seed_observed===fixedSeed&&
    meta?.id==='26.1.1'&&/^[0-9a-f]{40}$/.test(meta.server_sha1??''),
    'GAME_VERSION_OR_SEED_NOT_VERIFIED');
  const ids=['initial','fault','reset','restored'];
  for(const kind of ids){
    const states=trace?.states?.[kind]?.server;
    error(Array.isArray(states)&&states.length===9 &&
      states.every((row,i)=>row.cue===trace.stations[i].cue &&
        row.at.x===trace.stations[i].at.x &&
        typeof row.lit==='boolean'),
      'BAD_OR_MISSING_SERVER_STATE:'+kind);
  }
  for(const label of ['initial','reset'])
    error(trace.states[label].server.every(x=>!x.lit),
      'CIRCUIT_NOT_OFF:'+label);
  error(trace.states.restored.server.every(x=>x.lit),
    'CIRCUIT_NOT_RESTORED');
  const witness=trace.states.fault.fresh_nonop;
  error(witness?.operator===false && witness.independent_new_connection===true &&
    Array.isArray(witness.rows)&&witness.rows.length===9 &&
    trace.states.fault.server.every((s,i)=>{
      const o=witness.rows[i];
      return o.cue===s.cue&&o.at.x===s.at.x&&
        o.name==='redstone_lamp'&&o.lit===s.lit;
    }),'INDEPENDENT_FAULT_OBSERVER_DISAGREES');
  const repair=trace.states.restored.fresh_nonop;
  error(repair?.operator===false && repair.independent_new_connection===true &&
    repair.username!==witness.username &&
    repair.rows?.length===9&&repair.rows.every(x=>x.name==='redstone_lamp'&&x.lit),
    'INDEPENDENT_RESTORED_OBSERVER_DISAGREES');
  const faultCount=trace.states.fault.server.filter(x=>x.lit).length;
  error(trace.observed_fault_count===faultCount &&
    trace.observed_fault_class_gte4===(faultCount>=4),
    'FALSIFIED_FAULT_COUNT_OR_CLASS');
  error(trace.author_disconnect_before_fresh_witness===true &&
    trace.proposed_threshold===4&&
    trace.actual_game_execution===true&&
    trace.real_physical_environment_effect===false,
    'AUTHORITY_OR_ACTION_CLAIM');
  return {faultCount,classification:faultCount>=4?'GE_4':'LT_4'};
}

export async function loadOriginalProposal(work=prepDir) {
  const [proposalStr,bundleStr,rawSource,versionStr]=await Promise.all([
    readFile(join(work,'proposal.json'),'utf8'),
    readFile(join(work,'signed-held-proposal.json'),'utf8'),
    readFile(SOURCE),
    readFile(process.env.MC_VERSION_META??join(root,'server-version.json'),'utf8'),
  ]);
  const proposal=JSON.parse(proposalStr);
  const signed=JSON.parse(bundleStr);
  const version=JSON.parse(versionStr);
  error(await verifyCrossingEnvelope(signed.crossing)&&
    await verifyReceipt(signed.receipt),'INVALID_SIGNED_INSTRUMENT');
  error(signed.receipt.kind==='R3_HOLD'&&
    signed.receipt.crossing_id===signed.crossing.crossing_id&&
    signed.proposal_json===JSON.stringify(proposal),
    'ORIGINAL_INSTRUMENT_BYTES_CHANGED');
  const audit=await verifyExistingCustodyBytes(rawSource);
  error(audit.source_sha256===SOURCE_SHA256&&
    audit.original_signed_005_crossing===proposal.original_005_crossing &&
    signed.crossing.parents.includes(proposal.original_005_crossing),
    'ORIGINAL_SIGNED_ANCESTRY_CHANGED');
  error(version.id==='26.1.1'&&/^[0-9a-f]{40}$/.test(version.server_sha1),
    'SERVER_VERSION_UNVERIFIED');
  return {proposal,signed,version,audit};
}

async function sendFunction(rcon,name) {
  const response=String(await rcon.send('function motif020:'+name));
  error(!/unknown|no function|not found|failed to execute/i.test(response),
    'GAME_FUNCTION_DID_NOT_EXIST:'+name+':'+response);
  return {function:'motif020:'+name,server_response:response};
}

export async function conductNativeGame({
  prepared=undefined, output=root,
}={}) {
  const {proposal,signed,version,audit}=prepared??await loadOriginalProposal();
  error(host==='127.0.0.1'||host==='localhost','GAME_NOT_LOCALHOST');
  const rcon=await Rcon.connect({host,port:rconPort,password});
  let author;
  let chunkKeeper;
  const stagePositions=Array.from({length:9},(_,i)=>({
    cue:['READ_FIELD','LAY_BONES','CATCH_WATER','MAKE_SHADE','MAKE_GROUND',
      'SEED_NUCLEUS','FEED_FIELD','WITNESS_DELTA','ONE_METER_OUTWARD'][i],
    at:{x:-40+i*10,y:65,z:46},
  }));
  try {
    const seedResponse=String(await rcon.send('seed'));
    const found=(seedResponse.match(/-?\d{6,}/)||[])[0];
    error(found===fixedSeed,'LIVE_WORLD_SEED_DIFFERENT:'+found);
    await rcon.send('gamerule doDaylightCycle false');
    await rcon.send('gamerule doWeatherCycle false');
    await rcon.send('gamerule doMobSpawning false');
    await rcon.send('difficulty peaceful');
    await rcon.send('time set day');

    author=mineflayer.createBot({host,port:mcPort,username:'MotifAuthor',auth:'offline'});
    await waitForSpawn(author);
    await rcon.send('op MotifAuthor');
    await rcon.send('gamemode creative MotifAuthor');
    await rcon.send('tp MotifAuthor 0 80 46');
    await author.waitForChunksToLoad();
    const functionList=String(await rcon.send('datapack list enabled'));
    error(functionList.includes('motif')||functionList.includes('file'),
      'DATAPACK_NOT_ENABLED:'+functionList);

    const commands=[];
    commands.push(await sendFunction(rcon,'setup'));
    await sleep(1800);
    const initial=await inspectServerLamps(rcon,stagePositions,'before');
    error(initial.every(x=>!x.lit),'SETUP_WAS_NOT_UNPOWERED');

    commands.push(await sendFunction(rcon,'fault'));
    commands.push(await sendFunction(rcon,'trigger'));
    await sleep(2400);
    const fault=await inspectServerLamps(rcon,stagePositions,'fault');
    const lit=fault.filter(x=>x.lit).length;

    // Before a fresh observer enters, the author has left the world.
    author.quit('instrument authored');
    author=null;
    await rcon.send('deop MotifAuthor');
    // Never run restoration without the circuit's chunks loaded. A separate
    // nonoperator protocol client remains in the zone across both trials;
    // neither fresh witness is the chunk keeper or the author.
    chunkKeeper=mineflayer.createBot({
      host,port:mcPort,username:'MotifChunkKeeper',auth:'offline',
    });
    await waitForSpawn(chunkKeeper);
    await rcon.send('deop MotifChunkKeeper');
    await rcon.send('tp MotifChunkKeeper 0 80 46');
    await chunkKeeper.waitForChunksToLoad();
    await sleep(800);
    const observer=await readFreshNonOp(rcon,stagePositions,'MotifWitness009');

    commands.push(await sendFunction(rcon,'reset'));
    await sleep(1600);
    const reset=await inspectServerLamps(rcon,stagePositions,'reset');
    commands.push(await sendFunction(rcon,'repair'));
    commands.push(await sendFunction(rcon,'restored'));
    await sleep(2800);
    const restored=await inspectServerLamps(rcon,stagePositions,'restored');
    const restoredObserver=await readFreshNonOp(rcon,stagePositions,'MotifRestore009');

    const trace={
      schema:'relatte.minecraft-009-game-trace/v0',
      world:'B',seed:fixedSeed,server_seed_observed:found,
      version:{id:version.id,server_sha1:version.server_sha1},
      instrument_proposal_crossing:signed.crossing.crossing_id,
      source_005_crossing:proposal.original_005_crossing,
      fault_x:proposal.new_fault_repeater.x,
      proposed_threshold:proposal.classify_lit_count_at_least,
      stations:stagePositions,
      states:{
        initial:{server:initial},
        fault:{server:fault,fresh_nonop:observer},
        reset:{server:reset},
        restored:{server:restored,fresh_nonop:restoredObserver},
      },
      observed_fault_count:lit,
      observed_fault_class_gte4:lit>=4,
      commands,
      author_session:'MotifAuthor',
      author_disconnect_before_fresh_witness:true,
      nonoperator_chunk_keeper:'MotifChunkKeeper',
      chunk_keeper_is_not_author_or_observer:true,
      actual_game_execution:true,
      real_physical_environment_effect:false,
      source_owner_admission:false,
      receiver_disposition:'R3_HOLD',
    };
    // Preserve raw attempted observations *before* any verdict. A failed
    // restoration must remain visible as failure evidence, not disappear.
    await mkdir(output,{recursive:true});
    await writeFile(join(output,'raw-trial-before-adjudication.json'),
      JSON.stringify(trace,null,2)+'\n');
    const outcome=checkGameTrace(proposal,trace,version);
    const packet={
      schema:RESULT_SCHEMA,
      original_source_sha256:audit.source_sha256,
      original_004_crossing:proposal.original_004_crossing,
      original_005_crossing:proposal.original_005_crossing,
      instrument_crossing:signed.crossing.crossing_id,
      origin_instrument_sha256:sha(Buffer.from(signed.proposal_json)),
      game_world:'B',
      game_seed:fixedSeed,
      game_version:version.id,
      server_sha1:version.server_sha1,
      selected_probe:{fault_x:proposal.new_fault_repeater.x,
        threshold:proposal.classify_lit_count_at_least},
      actual_observed_count:outcome.faultCount,
      observed_classification:outcome.classification,
      trace,
      receiver_disposition:'R3_HOLD',
      owner_admission:false,
      physical_world_effect:false,
      auto_next_experiment:false,
    };
    const bytes=Buffer.from(JSON.stringify(packet));
    const observation=makeObservation(
      'minecraft-vanilla-server',
      'motif-minecraft-009-game:'+sha(bytes),
      bytes,'application/vnd.relatte.motif-minecraft-game+json',{
        game_observed:true,physical_world_effect:false,
        independent_nonoperator_game_observer:true,
        prediction_is_not_authority:true,
      });
    const hop=await makePolyglotHop({
      observation,signer:await generateP256KeyPair(),
      receiver:await generateP256KeyPair(),
      parent_crossing_id:signed.crossing.crossing_id,
      disposition:'R3_HOLD',hop_index:59,
    });
    verifyHopBinding(hop,bytes);
    error(await verifyCrossingEnvelope(hop.crossing)&&
      await verifyReceipt(hop.receipt),'NEW_GAME_SIGNATURE_FAILED');
    const bundle={
      schema:BUNDLE_SCHEMA,
      packet_json:bytes.toString('utf8'),
      crossing:hop.crossing,receipt:hop.receipt,
      signed_instrument:signed,
      game_observation_verified_in_runner:true,
      receiver_disposition:'R3_HOLD',
      physical_actuation:false,
    };
    await mkdir(output,{recursive:true});
    await writeFile(join(output,'game-trace.json'),JSON.stringify(trace,null,2)+'\n');
    await writeFile(join(output,'signed-game-result.json'),JSON.stringify(bundle,null,2)+'\n');
    await writeFile(join(output,'game-outcome.json'),JSON.stringify({
      fault_lit_count:outcome.faultCount,
      classification:outcome.classification,
      evidence:'actual-official-vanilla-server-with-protocol-nonop-observer',
      pending_independent_replay:true,
      crossing_id:hop.crossing.crossing_id,
      receipt_id:hop.receipt.receipt_id,
      disposition:'R3_HOLD',
    },null,2)+'\n');
    return {outcome,bundle,trace};
  }finally {
    try{author?.quit('stop')}catch{}
    try{chunkKeeper?.quit('experiment concluded')}catch{}
    try{await rcon.send('stop')}catch{}
    try{rcon.end()}catch{}
  }
}
if(process.argv[1]?.endsWith('/execute.mjs')){
  conductNativeGame().then(r=>console.log(JSON.stringify({
    outcome:r.outcome,crossing_id:r.bundle.crossing.crossing_id,
    receipt_id:r.bundle.receipt.receipt_id,hold:true,
    physical_effect:false,
  },null,2))).catch(e=>{console.error(e.stack||String(e));process.exitCode=1});
}
