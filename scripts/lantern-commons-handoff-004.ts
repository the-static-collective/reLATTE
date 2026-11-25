/** LANTERN 004: native reLATTE candidate review only. No Minecraft action or independent live witness. */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { LocalReceiver, generateP256KeyPair, sealCrossingEnvelope, verifyCrossingEnvelope, verifyReceipt } from '../src/index.ts';

const PACK_SHA='0fbce0b83dd510bdba7a8865406270a703fc376e5dc51ef9fb7d5fd31fd780cf';
const HASH=/^[a-f0-9]{64}$/;
const must=(ok:boolean,code:string)=>{if(!ok)throw Error('LANTERN_004_'+code);};

export function validateLanternEvidence(input:any):void{
  must(input?.schema==='relatte.skill-cartridge-candidate-004/v0','SCHEMA');
  must(input.source_datapack_sha256===PACK_SHA,'SOURCE_BYTES');
  must(input.receiver_disposition==='HOLD' && input.authority==='NONE','AUTHORITY');
  must(input.source_derived_same_shape_observed===true,'BLOCK_MATCH_NOT_PROVEN');
  must(input.eligibility_for_later_native_relatte_review==='CANDIDATE_ONLY','NO_REVIEW_GATE');
  must(input.actual_operator_command_history===null &&
    input.independent_live_client_observer===null &&
    input.cryptographic_source_signatures===null,'FALSE_WITNESS_CLAIM');
  must(input.worlds_have_different_seeds===true,'WORLD_SEED_COLLAPSE');
  const worlds=input.worlds;
  must(Array.isArray(worlds)&&worlds.length===2&&worlds[0].label==='A'&&worlds[1].label==='B','WORLDS');
  const skill=worlds[0].observed_built_kind;
  must(['kitchen','library'].includes(skill)&&worlds[1].observed_built_kind===skill,'SKILL_DIVERGENCE');
  must(worlds[0].world_seed!==worlds[1].world_seed,'SAME_SEED');
  must(typeof input.source_function_sha256?.[skill]==='string' &&
    HASH.test(input.source_function_sha256[skill]),'SOURCE_FUNCTION_HASH');
  for(const w of worlds){
    must(w.observation_source==='offline-local-save-NBT' &&
      w.game_client_session_proof===false && w.identity_claim==='none','OBSERVATION_CLASS');
    must(HASH.test(w.world_level_dat_sha256),'SAVE_HASH');
    must(w.checks?.[skill]?.build_shape_matches===true &&
      w.checks[skill].total_mismatch_count===0 &&
      w.checks[skill].source_structure_checks?.[skill]===true &&
      w.checks[skill].touched_block_positions===466,'SHAPE_CHECK');
  }
  must(worlds[0].world_level_dat_sha256!==worlds[1].world_level_dat_sha256,'SAME_SAVE');
}

export async function submitLanternHOLD(raw:Buffer,receiverRoot:string,timestamp=new Date().toISOString()){
  must(raw.length>0&&raw.length<=65536,'PAYLOAD_BOUND');
  const candidate=JSON.parse(raw.toString('utf8'));
  validateLanternEvidence(candidate);
  const hash=createHash('sha256').update(raw).digest('hex');
  const keys=await generateP256KeyPair();
  const crossing=await sealCrossingEnvelope({
    schema:'relatte.crossing-envelope/v0',protocol_version:'0',
    source_particular:'particular:lantern-world-save-submitter',
    source_world:'world:lantern-local-offline-inspection',
    source_history_head:null,parents:[],
    declared_kind:'LANTERN_004_SAVE_SHAPE_CANDIDATE',
    payload_refs:[{address:'sha256:'+hash,role:'candidate',media_type:'application/json'}],
    requested_effect:null,capability_ref:null,privacy_policy:'receiver-local-only',
    audience_policy:'private',return_address:'local:lantern-004',
    created_at:timestamp,
    extensions:{lantern_004:{source_pack_sha256:PACK_SHA,observation_source:'offline-local-save-NBT',
      claim:'candidate only; no live observer or action trace',verified_hardware:false}},
  },keys);
  must(await verifyCrossingEnvelope(crossing),'SIGNED_CROSSING_INVALID');
  let receiver:LocalReceiver;
  try{receiver=await LocalReceiver.open(receiverRoot);}
  catch(e:any){
    if(e?.code!=='ENOENT')throw e;
    receiver=await LocalReceiver.create(receiverRoot,{
      world_id:'world:lantern-reviewer-local',receiver_particular:'particular:lantern-reviewer-local',
      contract_ref:'contract:lantern-candidate-review/v0'});
  }
  const received=await receiver.receive(crossing,timestamp);
  const held=await receiver.dispose(crossing.crossing_id,'HOLD',timestamp,{
    note:'Local save shape only: live Minecraft, human and command witnesses are unverified.'});
  const custody=await receiver.verifyPayloadBytes(crossing.crossing_id,raw,timestamp);
  must(await verifyReceipt(received)&&await verifyReceipt(held)&&await verifyReceipt(custody),'RECEIPT_SIG');
  const reopened=await LocalReceiver.open(receiverRoot);
  must(reopened.snapshot().held.includes(crossing.crossing_id),'RESTART_HOLD_LOST');
  return {schema:'relatte.lantern-candidate-native-handoff/v0',
    source_candidate_sha256:hash,receiver_world:reopened.config.world_id,
    crossing,received_receipt:received,held_receipt:held,custody_receipt:custody,
    result:'NATIVE_SIGNED_RECEIVED_AND_HELD_WITH_EXACT_BYTES',
    minecraft_execution_verified:false,independent_live_witness_verified:false};
}
if(process.argv[1]?.endsWith('lantern-commons-handoff-004.ts')){
  const [, ,candidatePath,receiverRoot,outputPath]=process.argv;
  if(!candidatePath||!receiverRoot||!outputPath){
    process.stderr.write('Usage: node --experimental-strip-types scripts/lantern-commons-handoff-004.ts candidate.json receiver-root handoff.json\n');
    process.exitCode=2;
  }else{
    try{
      const packet=await submitLanternHOLD(await readFile(resolve(candidatePath)),resolve(receiverRoot));
      await writeFile(resolve(outputPath),JSON.stringify(packet,null,2)+'\n');
      process.stdout.write(JSON.stringify({result:packet.result,crossing:packet.crossing.crossing_id,held:packet.held_receipt.receipt_id})+'\n');
    }catch(e){process.stderr.write(String(e)+'\n');process.exitCode=1;}
  }
}
