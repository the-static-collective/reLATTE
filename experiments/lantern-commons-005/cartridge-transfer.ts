import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {LocalReceiver,generateP256KeyPair,sealCrossingEnvelope,verifyCrossingEnvelope,verifyReceipt} from '../../src/index.ts';
const sha=x=>createHash('sha256').update(x).digest('hex');
const must=(ok,code)=>{if(!ok)throw Error('LANTERN_005_'+code)};
const source={
'build/kitchen.mcfunction':'8cb40cb03c34ef29146d513ee553ac922a34f29fb334896b5a7945d7c99ad353',
'seed/construct_kitchen.mcfunction':'60033123ddf1cc63f3f8579230f3c0ac5162e55b3443f75fb44468dfb4803c22'
};
async function main(){
  const parent=JSON.parse(await readFile('work/lantern-parent/signed-held-return.json','utf8'));
  must(parent.schema==='lantern.native-cross-world-held-candidate/v0','PARENT_SCHEMA');
  must(parent.crossing?.crossing_id==='relatte-crossing-v0:6bd956845b0608528671915446b6a68d81bff339bbeac646b4240f03ffa2b914','UNTRUSTED_PARENT');
  must(await verifyCrossingEnvelope(parent.crossing),'PARENT_CROSSING_SIG');
  for(const r of [parent.received_receipt,parent.held_receipt,parent.custody_receipt])
    must(await verifyReceipt(r),'PARENT_RECEIPT_SIG');
  must(parent.held_receipt.kind==='R3_HOLD'&&parent.held_receipt.semantic_effect==='none','PARENT_NOT_HELD');
  must(parent.custody_receipt.kind==='PAYLOAD_BYTES_VERIFIED'&&
    parent.custody_receipt.semantic_effect==='none','PARENT_NO_CUSTODY');
  must(parent.custody_receipt.crossing_id===parent.crossing.crossing_id &&
    parent.held_receipt.crossing_id===parent.crossing.crossing_id,'PARENT_ID_BIND');
  const expectedParent=Buffer.from(JSON.stringify(parent.candidate));
  const parentPayloadDigest=sha(expectedParent);
  must(parent.crossing.payload_refs?.some(p=>p.address==='sha256:'+parentPayloadDigest) &&
    parent.custody_receipt.extensions?.local_receiver?.payload_custody?.sha256===parentPayloadDigest,
    'PARENT_PAYLOAD_HASH');
  const sourceWorlds=parent.candidate?.worlds;
  must(Array.isArray(sourceWorlds)&&sourceWorlds.length===2 &&
    sourceWorlds.every(w=>w.matched_block_count===466) &&
    parent.candidate.full_lantern_commons_003_executed===false &&
    parent.candidate.required_disposition==='HOLD','PARENT_SCOPE');
  must(JSON.stringify(sourceWorlds[0].source_function_sha256)===JSON.stringify(source) &&
    JSON.stringify(sourceWorlds[1].source_function_sha256)===JSON.stringify(source),'PARENT_SOURCE');
  const [a,b]=sourceWorlds;
  must(a.world_label==='A'&&b.world_label==='B'&&a.declared_seed!==b.declared_seed &&
    a.shape_hash===b.shape_hash,'PARENT_REPRODUCIBILITY');
  const observation=JSON.parse(await readFile('work/lantern/transfer-observation.json','utf8'));
  const metadata=JSON.parse(await readFile('work/lantern/world-meta.json','utf8'));
  must(observation.schema==='lantern.native-official-minecraft-cartridge-transfer/v0','RECEIVER_SCHEMA');
  must(observation.world_label==='C'&&metadata.world_label==='C' &&
    observation.declared_seed===metadata.declared_seed &&
    observation.declared_seed!==a.declared_seed&&observation.declared_seed!==b.declared_seed,'THIRD_WORLD');
  must(metadata.minecraft_version==='26.1.1'&&metadata.official_jar_sha1===a.official_jar_sha1 &&
    metadata.official_jar_sha1===b.official_jar_sha1,'VERSION');
  must(metadata.world_level_dat_sha256!==a.world_level_dat_sha256 &&
    metadata.world_level_dat_sha256!==b.world_level_dat_sha256,'FRESH_WORLD_ID');
  must(observation.selected_new_origin?.x===24&&observation.selected_new_origin?.y===64&&
    observation.selected_new_origin?.z===24,'NOT_TRANSLATED');
  must(observation.command_trace?.[1]==='execute positioned 24 64 24 run function lantern:build/kitchen'&&
    observation.command_trace?.[2]==='execute positioned 24 64 24 run function lantern:seed/construct_kitchen','NO_REPLAY_ACTION');
  must(observation.result==='OBSERVED_MATCH'&&observation.expected_count===466&&
    observation.observed_count===466&&observation.mismatches?.length===0,'THIRD_WORLD_MISMATCH');
  must(observation.observed_sha256===a.shape_hash,'THIRD_WORLD_DIVERGED');
  must(JSON.stringify(observation.source_function_sha256)===JSON.stringify(source),'SOURCE_CHANGED');
  must(observation.observer_role?.includes('non-OP')&&
    observation.observer_username!==a.observer_name&&
    observation.observer_username!==b.observer_name,'NO_FRESH_OBSERVER');
  const candidate={
    schema:'relatte.skill-cartridge-candidate/v0',
    goal:'REPRODUCE_SOURCE_WITNESSED_KITCHEN_AND_SEEDLING_ANNEX',
    source_crossing_id:parent.crossing.crossing_id,
    source_receipt_id:parent.held_receipt.receipt_id,
    source_payload_sha256:parentPayloadDigest,
    exact_source_functions:source,
    reproduction:{worlds:3,third_origin:observation.selected_new_origin,
      third_seed:observation.declared_seed,
      source_seed_A:a.declared_seed,source_seed_B:b.declared_seed,
      shape_hash:observation.observed_sha256,
      observed_positions_each:466,
      third_level_dat_sha256:metadata.world_level_dat_sha256,
      result:'MATCHED_SOURCE_SHAPE_AT_TRANSLATED_ORIGIN'},
    limits:['Minecraft game-only','source-fixed scripted commands; not automatically inferred skill',
      'no verified human identity or operator authority','partial 003 pack only',
      'no proof social charter or governance operated','no arbitrary execution rights'],
    requested_disposition:'HOLD',permission:'NONE',
    future_practice_tests:'human-approved candidate import and safe new-world adaptation'};
  const bytes=Buffer.from(JSON.stringify(candidate),'utf8');
  must(bytes.length<=65536,'CARTRIDGE_PAYLOAD_LARGE');
  const keys=await generateP256KeyPair();
  const now=new Date().toISOString();
  const crossing=await sealCrossingEnvelope({
    schema:'relatte.crossing-envelope/v0',protocol_version:'0',
    source_particular:'particular:lantern-005-cartridge-proposer',
    source_world:'world:lantern-005-third-game-world',
    source_history_head:null,
    parents:[parent.crossing.crossing_id],
    declared_kind:'LANTERN_005_PORTABLE_SKILL_CARTRIDGE_CANDIDATE',
    payload_refs:[{address:'sha256:'+sha(bytes),role:'cartridge-candidate',media_type:'application/json'}],
    requested_effect:null,capability_ref:null,
    privacy_policy:'synthetic-game-only',audience_policy:'experimental-public',
    return_address:'github-actions:lantern-005',
    created_at:now,
    extensions:{parent_hold_receipt:parent.held_receipt.receipt_id,
      third_origin:observation.selected_new_origin,execution_granted:false},
  },keys);
  must(await verifyCrossingEnvelope(crossing),'CHILD_CROSSING_SIG');
  const receiver=await LocalReceiver.create('work/lantern-005-receiver',{
    world_id:'world:lantern-005-review-only',
    receiver_particular:'particular:lantern-005-independent-receiver-key',
    contract_ref:'contract:lantern-005-cartridge-hold/v0'});
  const received=await receiver.receive(crossing,now);
  const held=await receiver.dispose(crossing.crossing_id,'HOLD',now);
  const custody=await receiver.verifyPayloadBytes(crossing.crossing_id,bytes,now);
  for(const r of [received,held,custody])must(await verifyReceipt(r),'CHILD_RECEIPT');
  const reopened=await LocalReceiver.open('work/lantern-005-receiver');
  must(reopened.snapshot().held.includes(crossing.crossing_id)&&
    reopened.snapshot().admitted.length===0,'INVALID_ADMISSION');
  await mkdir('work/lantern-005-return',{recursive:true});
  await writeFile('work/lantern-005-return/cartridge-candidate.json',bytes);
  await writeFile('work/lantern-005-return/transfer-signed-hold.json',
    JSON.stringify({schema:'lantern.cartridge-transfer-native-receipt/v0',candidate,
      parent_crossing:parent.crossing,original_parent_hold_receipt:parent.held_receipt,
      crossing,received_receipt:received,held_receipt:held,custody_receipt:custody,
      native_game_worlds:3,receiver_admitted:false,physical_effect:false},null,2)+'\n');
  console.log(JSON.stringify({result:'THREE_WORLD_TRANSFER_NATIVE_HOLD',
    parent_crossing:parent.crossing.crossing_id,
    child_crossing:crossing.crossing_id,child_hold_receipt:held.receipt_id,
    observed_positions_each:466,third_origin:observation.selected_new_origin,
    actual_mojang_worlds:3,full_society_tested:false},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1});
