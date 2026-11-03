import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {LocalReceiver,generateP256KeyPair,sealCrossingEnvelope,
  verifyCrossingEnvelope,verifyReceipt} from '../../src/index.ts';
const sha=x=>createHash('sha256').update(x).digest('hex');
const must=(test,code)=>{if(!test)throw Error('COOP_COMPARE_'+code);};
const parentCrossing='relatte-crossing-v0:e78a804d1e25430d4775970b99b63c7c31c3e2f1ce31cf12f87c80246a1ea154';
const modes=['GIFT','REFUSE','SPOOF'];
async function main(){
  const parent=JSON.parse(await readFile('work/parent-world-event/signed-world-event-hold.json','utf8'));
  must(parent.schema==='relatte.world-events-signed-hold/v0'&&
    parent.crossing.crossing_id===parentCrossing,'PARENT_ID');
  must(await verifyCrossingEnvelope(parent.crossing),'PARENT_SIGN');
  for(const receipt of [parent.received_receipt,parent.held_receipt,parent.custody_receipt])
    must(await verifyReceipt(receipt),'PARENT_RECEIPT_SIG');
  must(parent.held_receipt.kind==='R3_HOLD'&&
    parent.held_receipt.semantic_effect==='none'&&
    parent.custody_receipt.kind==='PAYLOAD_BYTES_VERIFIED','PARENT_NOT_HELD');
  const parentBytes=Buffer.from(JSON.stringify(parent.candidate));
  const parentHash=sha(parentBytes);
  must(parent.crossing.payload_refs.some(p=>p.address==='sha256:'+parentHash)&&
    parent.custody_receipt.extensions?.local_receiver?.payload_custody?.sha256===parentHash,
    'PARENT_PAYLOAD_UNBOUND');
  const runs=[];
  for(const mode of modes){
    const folder='work/cooperation-worlds/lantern-cooperation-'+mode;
    const raw=await readFile(folder+'/cooperation/game-evidence.json');
    const data=JSON.parse(raw.toString('utf8'));
    const meta=JSON.parse(await readFile(folder+'/lantern/world-meta.json','utf8'));
    must(data.schema==='lantern.radical-cooperation-game-observation/v0'&&
      data.scenario===mode&&meta.scenario===mode,'SCENARIO');
    must(data.world_seed===meta.world_seed&&
      data.game_server_version==='26.1.1'&&meta.minecraft_version==='26.1.1'&&
      /^[a-f0-9]{40}$/.test(meta.official_jar_sha1)&&
      /^[a-f0-9]{64}$/.test(meta.world_level_dat_sha256),'METADATA');
    must(data.independent_clients.join(',')==='AidGrower,AidMason,CoopWitness' &&
      data.no_real_people_claimed===true && data.result_divergence.human_social_proof===false &&
      data.agent_policy_kind.includes('NOT human'),'NO_HUMAN_OWNERSHIP');
    must(data.initial?.grower_items===2&&data.initial?.mason_items===2&&
      data.initial.grower_barrel===0&&data.initial.mason_barrel===0&&
      data.initial.blocks.dry==='air'&&data.initial.blocks.crop==='air'&&
      data.initial.blocks.marker==='redstone_block','INITIAL_FAIRNESS');
    must(data.afterGrower?.grower_items===0&&
      data.afterGrower?.grower_barrel===2&&
      data.afterGrower?.mason_barrel===0&&
      data.afterGrower?.blocks?.marker==='redstone_block','ONE_GIFT_NOT_ENOUGH');
    must(data.actor_receipts?.[0]?.decisions?.length===2 &&
      data.actor_receipts[0].decisions[0].consent===true&&
      data.actor_receipts[0].decisions[1].consent===(mode==='GIFT'),
      'CONSENT_NOT_ATTRIBUTABLE');
    const joint=mode==='GIFT';
    must(data.final?.grower_barrel===(joint?2:0)&&
      data.final.mason_barrel===(joint?2:0)&&
      data.final.grower_items===(joint?0:2)&&
      data.final.mason_items===(joint?0:2),'MATERIAL_PRESERVATION');
    must(data.final.blocks.dry===(joint?'water':'air')&&
      data.final.blocks.crop===(joint?'wheat':'air')&&
      data.final.blocks.marker===(joint?'emerald_block':'redstone_block')&&
      data.final.blocks.commons===(joint?'gold_block':'stone_bricks')&&
      data.final.blocks.bell===(joint?'bell':'air'),'REAL_WORLD_DIFFERENCE');
    must(data.final.in_game_history.includes('COMMON_GARDEN_RESTORED')===joint &&
      data.result_divergence.public_garden_restored===joint,'EFFECT_ACCOUNTING');
    if(mode==='SPOOF')must(data.actor_receipts.some(x=>x.claimed_transfer===true&&
      x.actual_material_transfer===false),'MISSING_ADVERSARIAL_CASE');
    if(!joint)must(data.actor_receipts.some(x=>x.actual_material_withdrawal===true),
      'REFUSAL_MUST_ALLOW_GIFT_RETURN');
    must(data.creature_proposal?.authority==='NONE'&&
      data.limits.some(x=>x.includes('no autonomous machine learning')),'CREATURE_OVERCLAIM');
    runs.push({scenario:mode,seed:data.world_seed,world_save_sha256:meta.world_level_dat_sha256,
      original_game_evidence_sha256:sha(raw),source_sha256:data.source_sha256,
      starting_items:{grower:2,mason:2},
      outcome:data.outcome,
      final:{grower_barrel:data.final.grower_barrel,mason_barrel:data.final.mason_barrel,
        grower_items:data.final.grower_items,mason_items:data.final.mason_items,
        drought_marker:data.final.blocks.marker,
        irrigation:data.final.blocks.dry,crops:data.final.blocks.crop,
        shared_bell:data.final.blocks.bell},
      game_policy:mode,individual_choice_supported:true,
      world_native_test:true,real_people_observed:false});
  }
  const [gift,refuse,spoof]=runs;
  must(new Set(runs.map(x=>x.seed)).size===3&&
    new Set(runs.map(x=>x.world_save_sha256)).size===3,'WORLD_INDEPENDENCE');
  must(runs.every(x=>JSON.stringify(x.source_sha256)===JSON.stringify(gift.source_sha256)),
    'POLICY_SOURCE_DRIFT');
  must(gift.final.shared_bell==='bell'&&
    refuse.final.shared_bell==='air'&&spoof.final.shared_bell==='air',
    'FAKE_AID_ADMITTED_OR_GIFT_REJECTED');
  const candidate={
    schema:'relatte.cooperative-practice-candidate/v0',
    title:'Radical Cooperation 007: material gifts, reversible refusal, and shared repair',
    source_world_event_parent_crossing_id:parentCrossing,
    source_world_event_parent_hold_receipt:parent.held_receipt.receipt_id,
    source_code_sha256:gift.source_sha256,
    game_runs:runs,
    evidence:{
      official_game_worlds:3,
      physically_in_game_provisioned_resources_each:{wheat:2,stone_bricks:2},
      no_reward_or_compulsory_payment:true,
      freely_selected_scripted_gifts:true,
      two_gifts_required_for_game_owned_public_effect:true,
      no_effect_without_actual_gifts:true,
      refused_in_game_gift_retrieved:true,
      false_gift_claim_did_not_authorize_any_effect:true,
      shared_garden_restored_only_in_gift_world:true,
      provenance: 'actual logged game commands, actual player-bot inventory movement, in-game block changes and save hashes'
    },
    creature_suggestion_only:'Offer voluntary help to restore irrigated public gardens; never force player inventory',
    authority:'NONE',
    requested_disposition:'HOLD',
    nonclaims:['not evidence of human moral virtue or cooperation by natural people',
      'agents used explicit preselected scripted behavior, not newly learned minds',
      'game operator provisioned resources equally',
      'one game-world cooperation mechanic is not a rigorous real-world socioeconomic trial',
      'manual human organizations and identity not authenticated',
      'no currency, wages, token obligations or delegated powers',
      'no execution rights transmitted by cartridge',
      'Minecraft success != real community benefit']
  };
  const payload=Buffer.from(JSON.stringify(candidate));
  must(payload.length<=65536,'TOO_LARGE');
  const now=new Date().toISOString(),keys=await generateP256KeyPair();
  const crossing=await sealCrossingEnvelope({
    schema:'relatte.crossing-envelope/v0',protocol_version:'0',
    source_particular:'particular:lantern-cooperation-007-proposer',
    source_world:'world:three-game-mechanic-cooperation-modes',
    source_history_head:null,parents:[parentCrossing],
    declared_kind:'LANTERN_COOPERATION_WITH_REFUSAL_EVIDENCE_CANDIDATE',
    payload_refs:[{address:'sha256:'+sha(payload),role:'candidate',media_type:'application/json'}],
    requested_effect:null,capability_ref:null,
    privacy_policy:'synthetic-game-test-only',audience_policy:'public-anonymized-game-test',
    return_address:'github-actions:lantern-007',created_at:now,
    extensions:{parent_signed_holding:parent.held_receipt.receipt_id,
      recipient_must_choose:true,permission:'NONE',human_social_proof:false}
  },keys);
  must(await verifyCrossingEnvelope(crossing),'CROSSING_SIGN');
  const receiver=await LocalReceiver.create('work/cooperation-receiver',{
    world_id:'world:lantern-007-review',
    receiver_particular:'particular:lantern-007-local-held',
    contract_ref:'contract:cooperation-candidate-review/v0'
  });
  const received=await receiver.receive(crossing,now);
  const held=await receiver.dispose(crossing.crossing_id,'HOLD',now);
  const custody=await receiver.verifyPayloadBytes(crossing.crossing_id,payload,now);
  for(const receipt of [received,held,custody])must(await verifyReceipt(receipt),'RECEIPT_SIGN');
  const cold=await LocalReceiver.open('work/cooperation-receiver');
  must(cold.snapshot().held.includes(crossing.crossing_id)&&
    cold.snapshot().admitted.length===0,'COLD_REPLAY');
  await mkdir('work/cooperation-return',{recursive:true});
  await writeFile('work/cooperation-return/cartridge-candidate.json',payload);
  await writeFile('work/cooperation-return/signed-held-return.json',JSON.stringify({
    schema:'relatte.lantern-cooperation-007-held-return/v0',
    candidate,source_parent_crossing:parent.crossing,
    crossing,received_receipt:received,held_receipt:held,custody_receipt:custody,
    received_not_admitted:true,signed_by:'ephemeral CI key; no human ID verification'
  },null,2)+'\n');
  console.log(JSON.stringify({result:'COOPERATION_GIFT_REFUSAL_SPOOF_CHECKED_SIGNED_HOLD',
    game_worlds:3,verified_gift_construction:true,verified_refusal:true,
    verified_false_claim_refusal:true,parent_crossing:parentCrossing,
    child_crossing:crossing.crossing_id,child_hold_receipt:held.receipt_id,
    native_game_human_social_proof:false},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
