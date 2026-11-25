import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {LocalReceiver,generateP256KeyPair,sealCrossingEnvelope,verifyCrossingEnvelope,verifyReceipt} from '../../src/index.ts';

const sha=x=>createHash('sha256').update(x).digest('hex');
const req=(ok,c)=>{if(!ok)throw Error('LANTERN_NATIVE_COMPARE_'+c)};
const SRC={
'build/kitchen.mcfunction':'8cb40cb03c34ef29146d513ee553ac922a34f29fb334896b5a7945d7c99ad353',
'seed/construct_kitchen.mcfunction':'60033123ddf1cc63f3f8579230f3c0ac5162e55b3443f75fb44468dfb4803c22'
};
async function main(){
  const base='work/lantern-inputs';
  const worlds=[];
  for(const label of ['A','B']){
    const root=join(base,'lantern-native-world-'+label);
    const bytes=await readFile(join(root,'observation.json'));
    const x=JSON.parse(bytes.toString('utf8'));
    const meta=JSON.parse(await readFile(join(root,'world-meta.json'),'utf8'));
    req(x.schema==='lantern.native-official-minecraft-observation/v0','SCHEMA');
    req(x.world_label===label&&meta.world_label===label,'WORLD_ID');
    req(x.declared_seed===meta.declared_seed,'SEED');
    req(x.expected_count===466&&x.observed_count===466&&x.result==='OBSERVED_MATCH','MEASUREMENTS');
    req(Array.isArray(x.mismatches)&&x.mismatches.length===0,'MISMATCH');
    req(JSON.stringify(x.source_function_sha256)===JSON.stringify(SRC),'SOURCE_HASH');
    req(x.observer_role.includes('non-OP')&&x.command_actor.includes('RCON')&&x.full_game_pack_installed===false,'ROLE_OR_SCOPE');
    req(x.command_trace.length===3&&x.command_trace[1].endsWith('lantern:build/kitchen')
      &&x.command_trace[2].endsWith('lantern:seed/construct_kitchen'),'ACTION_TRACE');
    req(meta.minecraft_version==='26.1.1'&&/^[a-f0-9]{40}$/.test(meta.official_jar_sha1),'OFFICIAL_SERVER');
    req(/^[a-f0-9]{64}$/.test(meta.world_level_dat_sha256),'LEVEL_HASH');
    worlds.push({world_label:label,declared_seed:x.declared_seed,observation_sha256:sha(bytes),
      observer_name:x.observer_username,
      matched_block_count:x.observed_count,shape_hash:x.observed_sha256,
      world_level_dat_sha256:meta.world_level_dat_sha256,
      minecraft_version:meta.minecraft_version,official_jar_sha1:meta.official_jar_sha1,
      source_function_sha256:SRC});
  }
  const [a,b]=worlds;
  req(a.declared_seed!==b.declared_seed,'SAME_SEED');
  req(a.world_level_dat_sha256!==b.world_level_dat_sha256,'IDENTICAL_WORLD_BYTES');
  req(a.observer_name!==b.observer_name,'ONE_OBSERVER');
  req(a.shape_hash===b.shape_hash,'SKILL_NOT_REPRODUCED');
  req(a.official_jar_sha1===b.official_jar_sha1,'DIFFERENT_MOJANG_VERSIONS');
  const candidate={schema:'lantern.world-practice-replay-candidate/v0',worlds,
    source:'Lantern Commons 003 subset from original exact source functions',
    world_count:2,observed_shape:'kitchen-annex',identical_causal_script:true,
    in_game_reproduction:true,community_participation_observed:false,
    full_lantern_commons_003_executed:false,independent_organization_approval:false,
    human_identity_proven:false,claimed_physical_effect:false,
    operator:'reLATTE GitHub Actions experiment',
    required_disposition:'HOLD'};
  const payload=Buffer.from(JSON.stringify(candidate),'utf8');
  req(payload.length<65536,'PAYLOAD_TOO_LARGE');
  const timestamp=new Date().toISOString();
  const keys=await generateP256KeyPair();
  const crossing=await sealCrossingEnvelope({
    schema:'relatte.crossing-envelope/v0',protocol_version:'0',
    source_particular:'particular:lantern-minecraft-ci-operator',
    source_world:'world:lantern-two-world-ci',
    source_history_head:null,parents:[],
    declared_kind:'LANTERN_MINECRAFT_NATIVE_SUBSKILL_REPLAY_CANDIDATE',
    payload_refs:[{address:'sha256:'+sha(payload),role:'source-bound-game-evidence',media_type:'application/json'}],
    requested_effect:null,capability_ref:null,privacy_policy:'no-players-or-private-worlds',
    audience_policy:'public synthetic worlds only',return_address:'github-actions:lantern-004',
    created_at:timestamp,extensions:{experimental_scope:'kitchen+annex only; no social governances or physical acts',
      source_function_sha256:SRC},
  },keys);
  req(await verifyCrossingEnvelope(crossing),'CROSSING_SIGNATURE');
  const receiver=await LocalReceiver.create('work/lantern-receiver',{
    world_id:'world:lantern-local-reviewer',
    receiver_particular:'particular:lantern-independent-key',
    contract_ref:'contract:lantern-game-only-hold/v0'});
  const received=await receiver.receive(crossing,timestamp);
  const held=await receiver.dispose(crossing.crossing_id,'HOLD',timestamp);
  const custody=await receiver.verifyPayloadBytes(crossing.crossing_id,payload,timestamp);
  for(const r of [received,held,custody])req(await verifyReceipt(r),'RECEIPT_SIGNATURE');
  const reopened=await LocalReceiver.open('work/lantern-receiver');
  req(reopened.snapshot().held.includes(crossing.crossing_id),'RESTART_LOST_HOLD');
  const result={schema:'lantern.native-cross-world-held-candidate/v0',
    candidate,crossing,received_receipt:received,held_receipt:held,custody_receipt:custody,
    gate:'HOLD',true_mojang_server_used:true,full_society_world_tested:false,
    fresh_non_op_protocol_client_per_world:true,source_material:'partial original function source',
    signer_identity:'ephemeral local CI keys; not verified human or institution'};
  await mkdir('work/lantern-return',{recursive:true});
  await writeFile('work/lantern-return/candidate.json',payload);
  await writeFile('work/lantern-return/signed-held-return.json',JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({result:'SIGNED_RECEIVED_AND_R3_HOLD',crossing_id:crossing.crossing_id,
    receipt_id:held.receipt_id,worlds:2,positions_per_world:466,source_claim:'partial 003 pack only'},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1});
