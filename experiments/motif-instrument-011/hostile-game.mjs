/* Minecraft 010 — execute the MOTIF-selected game instrument on a NEW
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
import {verifyObservedGameBundle} from '../motif-instrument-009/verify.mjs';
import {SPEC_SCHEMA as PROPOSAL_SCHEMA} from '../motif-instrument-010/compose.mjs';
import {checkHostileTrace} from './trace-verifier.mjs';
import {verifyNewMicroGame} from '../motif-instrument-010/verify.mjs';

const require=createRequire(import.meta.url);
const mineflayer=require('mineflayer');
const {Vec3}=require('vec3');
const {Rcon}=require('rcon-client');

export const RESULT_SCHEMA='relatte.minecraft011.real-hostile-game/v0';
export const BUNDLE_SCHEMA='relatte.minecraft011.signed-game-return/v0';
const error=(yes,why)=>{if(!yes)throw Error('MINECRAFT_011_'+why)};
const sha=x=>createHash('sha256').update(x).digest('hex');
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
const root=process.env.MOTIF_011_LIVE_WORK??'work/motif-minecraft-011-live';
const prepDir=process.env.MOTIF_010_PREP_WORK??'work/motif-minecraft-010';
const SOURCE=process.env.MOTIF_009_GAME_SOURCE??'work/seed009/signed-game-result.json';
const ARCHIVE='fixtures/riff-raft-minecraft-006/signed-005-return.bundle.json';
const host=process.env.MC_HOST??'127.0.0.1';
const mcPort=Number(process.env.MC_PORT??25565);
const rconPort=Number(process.env.MC_RCON_PORT??25575);
const password=process.env.MC_RCON_PASSWORD??'relatte-ci';
const SIDE_DIR=process.env.MOTIF_011_PROPOSAL??'work/motif-minecraft-011';
const ORIGINAL_010=process.env.MOTIF_010_GAME_SOURCE??'work/source010/signed-game-result.json';
const observerPos={x:0,y:80,z:46};
const fixedSeed='381654729';

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

export async function loadOriginalProposal(work=prepDir) {
  const [proposalStr,bundleStr,priorGame,archive,versionStr]=await Promise.all([
    readFile(join(work,'proposal.json'),'utf8'),
    readFile(join(work,'signed-proposal.json'),'utf8'),
    readFile(SOURCE),readFile(ARCHIVE),
    readFile(process.env.MC_VERSION_META??join(root,'server-version.json'),'utf8'),
  ]);
  const proposal=JSON.parse(proposalStr);
  const signed=JSON.parse(bundleStr);
  const version=JSON.parse(versionStr);
  const prior=await verifyObservedGameBundle(priorGame,archive);
  error(proposal.schema===PROPOSAL_SCHEMA &&
    proposal.source_game_crossing===prior.new_game_crossing &&
    proposal.world==='A'&&proposal.world_seed===fixedSeed &&
    proposal.fault_x===-28&&proposal.threshold===3 &&
    proposal.stage_indexes?.join(',')==='2,3',
    'MICRO_PROPOSAL_SOURCE_CHANGED');
  error(signed?.schema==='relatte.minecraft010-signed-proposal/v0'&&
    await verifyCrossingEnvelope(signed.crossing)&&
    await verifyReceipt(signed.receipt)&&
    signed.receipt.kind==='R3_HOLD'&&
    signed.receipt.crossing_id===signed.crossing.crossing_id&&
    signed.proposal_json===JSON.stringify(proposal)&&
    signed.crossing.parents?.length===1&&
    signed.crossing.parents[0]===prior.new_game_crossing,
    'SIGNED_MICRO_PROPOSAL_NOT_ORIGIN_AUTHENTIC');
  error(version.id==='26.1.1'&&/^[0-9a-f]{40}$/.test(version.server_sha1),
    'SERVER_VERSION_UNVERIFIED');
  return {proposal,signed,version,prior,priorGameSha256:sha(priorGame)};
}

async function checkSignedSideProposal(){
 const [str,bundleStr,raw010,raw009,archive]=await Promise.all([
  readFile(join(SIDE_DIR,'proposal.json'),'utf8'),
  readFile(join(SIDE_DIR,'signed-proposal.json'),'utf8'),
  readFile(ORIGINAL_010),readFile(SOURCE),readFile(ARCHIVE),
 ]);
 const side=JSON.parse(str),signedSide=JSON.parse(bundleStr);
 const v=await verifyNewMicroGame(raw010,raw009,archive);
 error(side.source_game010_crossing===v.signed_game_crossing &&
   side.signed_source010_sha256===sha(raw010) &&
   side.world==='A'&&side.fault_x===-28 &&
   side.side_power_position?.x===20 &&
   side.side_power_position?.y===65 &&
   side.side_power_position?.z===47 &&
   side.physical_effect===false &&
   side.automatic_execution===false,
   'UNVERIFIED_GAME_011_PARENT');
 error(signedSide.schema==='relatte.minecraft011-signed-proposal/v0' &&
   signedSide.proposal_json===JSON.stringify(side) &&
   await verifyCrossingEnvelope(signedSide.crossing) &&
   await verifyReceipt(signedSide.receipt) &&
   signedSide.receipt.kind==='R3_HOLD' &&
   signedSide.crossing.parents?.length===1 &&
   signedSide.crossing.parents[0]===v.signed_game_crossing,
   'SIDE_PROPOSAL_BAD_SIGNATURE');
 return {side,signedSide,verified010:v};
}

async function sendFunction(rcon,name) {
  const response=String(await rcon.send('function motif022:'+name));
  error(!/unknown|no function|not found|failed to execute/i.test(response),
    'GAME_FUNCTION_DID_NOT_EXIST:'+name+':'+response);
  return {function:'motif022:'+name,server_response:response};
}

export async function conductNativeGame({
  prepared=undefined, output=root,
}={}) {
  const {proposal,signed,version,prior,priorGameSha256}=prepared??await loadOriginalProposal();
  const {side,signedSide,verified010}=await checkSignedSideProposal();
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

    author=mineflayer.createBot({host,port:mcPort,username:'MotifAuthor010',auth:'offline'});
    await waitForSpawn(author);
    await rcon.send('op MotifAuthor010');
    await rcon.send('gamemode creative MotifAuthor010');
    await rcon.send('tp MotifAuthor010 0 80 46');
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
    await sleep(1400);
    commands.push(await rcon.send('function motif023:inject'));
    await sleep(1500);
    await rcon.send('scoreboard players set #side motif_count 0');
    await rcon.send('execute if block 20 65 47 minecraft:redstone_block run scoreboard players set #side motif_count 1');
    const injected=serverScore(await rcon.send('scoreboard players get #side motif_count'));
    error(injected===1,'LATERAL_SOURCE_NOT_IN_GAME');
    // The low-cost probe is performed FIRST, independently of the full nine
    // lamp census. The latter is a falsification audit, not input to the
    // micro-instrument decision.
    commands.push(await sendFunction(rcon,'read_micro'));
    const microDiscriminator=serverScore(
      await rcon.send('scoreboard players get #discriminator motif_micro'));
    const microSentinel=serverScore(
      await rcon.send('scoreboard players get #sentinel motif_micro'));
    error([microDiscriminator,microSentinel].every(x=>x===0||x===1),
      'MICRO_GAME_READOUT_NOT_BOOLEAN');
    const microReadout={
      sampled_before_full_census:true,
      stages:[
        {index:2,position:stagePositions[2].at,lit:microDiscriminator===1},
        {index:3,position:stagePositions[3].at,lit:microSentinel===1},
      ],
      source_game_method:'actual-motif022:read_micro-mcfunction-then-rcon',
      full_nine_lamp_audit_not_input_to_micro_result:true,
    };
    const fault=await inspectServerLamps(rcon,stagePositions,'fault');
    const lit=fault.filter(x=>x.lit).length;

    // Before a fresh observer enters, the author has left the world.
    author.quit('instrument authored');
    author=null;
    await rcon.send('deop MotifAuthor010');
    // Never run restoration without the circuit's chunks loaded. A separate
    // nonoperator protocol client remains in the zone across both trials;
    // neither fresh witness is the chunk keeper or the author.
    chunkKeeper=mineflayer.createBot({
      host,port:mcPort,username:'MotifChunk010',auth:'offline',
    });
    await waitForSpawn(chunkKeeper);
    await rcon.send('deop MotifChunk010');
    await rcon.send('tp MotifChunk010 0 80 46');
    await chunkKeeper.waitForChunksToLoad();
    await sleep(800);
    const observer=await readFreshNonOp(rcon,stagePositions,'MotifWitness010');

    commands.push(await sendFunction(rcon,'reset'));
    commands.push(await rcon.send('function motif023:remove_injection'));
    await rcon.send('scoreboard players set #side_removed motif_count 0');
    await rcon.send('execute if block 20 65 47 minecraft:air run scoreboard players set #side_removed motif_count 1');
    const removed=serverScore(await rcon.send('scoreboard players get #side_removed motif_count'));
    error(removed===1,'LATERAL_SOURCE_NOT_REMOVED');
    await sleep(1600);
    const reset=await inspectServerLamps(rcon,stagePositions,'reset');
    commands.push(await sendFunction(rcon,'repair'));
    commands.push(await sendFunction(rcon,'restored'));
    await sleep(2800);
    const restored=await inspectServerLamps(rcon,stagePositions,'restored');
    const restoredObserver=await readFreshNonOp(rcon,stagePositions,'MotifRestore010');

    const trace={
      schema:'relatte.minecraft-010-game-trace/v0',
      hostile_proposal_crossing:signedSide.crossing.crossing_id,
      hostile_source:side.side_power_position,
      hostile_source_block_verified:injected===1,
      injected_after_fault_before_micro:true,
      intervention_removed_before_restore:removed===1,
      intervention_absent_after_restore:removed===1,
      world:'A',seed:fixedSeed,server_seed_observed:found,
      version:{id:version.id,server_sha1:version.server_sha1},
      instrument_proposal_crossing:signed.crossing.crossing_id,
      source_009_crossing:proposal.source_game_crossing,
      experiment_signed_instrument:signed.crossing.crossing_id,
      fault_x:proposal.fault_x,
      proposed_threshold:proposal.threshold,
      micro_readout:microReadout,
      micro_prediction_gte3:microDiscriminator===1,
      stations:stagePositions,
      states:{
        initial:{server:initial},
        fault:{server:fault,fresh_nonop:observer},
        reset:{server:reset},
        restored:{server:restored,fresh_nonop:restoredObserver},
      },
      observed_fault_count:lit,
      observed_fault_class_gte3:lit>=3,
      commands,
      author_session:'MotifAuthor010',
      author_disconnect_before_fresh_witness:true,
      nonoperator_chunk_keeper:'MotifChunk010',
      nonoperator_chunk_keeper_is_distinct:true,
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
    const outcome=checkHostileTrace(proposal,side,trace,version);
    const packet={
      schema:RESULT_SCHEMA,
      prior_signed_game_sha256:priorGameSha256,
      original_009_crossing:prior.new_game_crossing,
      original_010_crossing:verified010.signed_game_crossing,
      source_010_signed_bytes_sha256:side.signed_source010_sha256,
      hostile_source_position:side.side_power_position,
      original_005_crossing:prior.source_original_005_crossing,
      instrument_crossing:signedSide.crossing.crossing_id,
      parent_010_instrument:signed.crossing.crossing_id,
      origin_instrument_sha256:sha(Buffer.from(signed.proposal_json)),
      game_world:'A',
      game_seed:fixedSeed,
      game_version:version.id,
      server_sha1:version.server_sha1,
      selected_probe:{fault_x:proposal.fault_x,
        threshold:proposal.threshold,
        stage_indexes:proposal.stage_indexes},
      actual_observed_count:outcome.faultCount,
      observed_classification:outcome.provisionalClassification,
      full_census_audited_status:outcome.status,
      low_cost_probe_inferred_count:outcome.inferredCount,
      original_method_falsified_in_game:outcome.original_micro_method_unsafe_if_nonprefix,
      hostile_method_conclusion:outcome.source_conclusion,
      trace,
      receiver_disposition:'R3_HOLD',
      owner_admission:false,
      physical_world_effect:false,
      auto_next_experiment:false,
    };
    const bytes=Buffer.from(JSON.stringify(packet));
    const observation=makeObservation(
      'minecraft-vanilla-server',
      'motif-minecraft-011-game:'+sha(bytes),
      bytes,'application/vnd.relatte.motif-minecraft-game+json',{
        game_observed:true,physical_world_effect:false,
        independent_nonoperator_game_observer:true,
        prediction_is_not_authority:true,
      });
    const hop=await makePolyglotHop({
      observation,signer:await generateP256KeyPair(),
      receiver:await generateP256KeyPair(),
      parent_crossing_id:signedSide.crossing.crossing_id,
      disposition:'R3_HOLD',hop_index:64,
    });
    verifyHopBinding(hop,bytes);
    error(await verifyCrossingEnvelope(hop.crossing)&&
      await verifyReceipt(hop.receipt),'NEW_GAME_SIGNATURE_FAILED');
    const bundle={
      schema:BUNDLE_SCHEMA,
      packet_json:bytes.toString('utf8'),
      crossing:hop.crossing,receipt:hop.receipt,
      signed_instrument:signedSide,
      base_010_signed_instrument:signed,
      game_observation_verified_in_runner:true,
      receiver_disposition:'R3_HOLD',
      physical_actuation:false,
    };
    await mkdir(output,{recursive:true});
    await writeFile(join(output,'game-trace.json'),JSON.stringify(trace,null,2)+'\n');
    await writeFile(join(output,'signed-game-result.json'),JSON.stringify(bundle,null,2)+'\n');
    await writeFile(join(output,'game-outcome.json'),JSON.stringify({
      fault_lit_count:outcome.faultCount,
      classification:outcome.provisionalClassification,
      micro_sensor_status:outcome.status,
      hostile_source:side.side_power_position,
      method_falsification:outcome.source_conclusion,
      micro_discriminator_lit:outcome.microDiscriminatorLit,
      micro_sentinel_lit:outcome.microSentinelLit,
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
if(process.argv[1]?.endsWith('/hostile-game.mjs')){
  conductNativeGame().then(r=>console.log(JSON.stringify({
    outcome:r.outcome,crossing_id:r.bundle.crossing.crossing_id,
    receipt_id:r.bundle.receipt.receipt_id,hold:true,
    physical_effect:false,
  },null,2))).catch(e=>{console.error(e.stack||String(e));process.exitCode=1});
}
