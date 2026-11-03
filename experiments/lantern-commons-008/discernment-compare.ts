/* Source-native reLATTE transport for bounded evidence-responsive game strategy */
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {LocalReceiver,generateP256KeyPair,sealCrossingEnvelope,
  verifyCrossingEnvelope,verifyReceipt} from '../../src/index.ts';
const sha=b=>createHash('sha256').update(b).digest('hex');
const must=(ok,code)=>{if(!ok)throw Error('DISCERNMENT_008_COMPARE_'+code);};
const parentId='relatte-crossing-v0:ed89e2998b6a313f8374d2d63236fd65d8d3aafbf7796075029c319e3834136c';
const modes=['RECIPROCATE','REOPEN','DECEIVE','SCARCITY'];
const expected={
  RECIPROCATE:{results:[true,true],initial:['OFFER_REVERSIBLY','OFFER_REVERSIBLY']},
  REOPEN:{results:[false,true],initial:['OFFER_REVERSIBLY','WAIT_FOR_MATERIAL_PROOF']},
  DECEIVE:{results:[false,false],initial:['OFFER_REVERSIBLY','WAIT_FOR_MATERIAL_PROOF']},
  SCARCITY:{results:[false,true],initial:['OFFER_REVERSIBLY','WAIT_FOR_MATERIAL_PROOF']}
};
async function main(){
  const parent=JSON.parse(await readFile('work/discernment-parent/signed-held-return.json','utf8'));
  must(parent.schema==='relatte.lantern-cooperation-007-held-return/v0','PARENT_SCHEMA');
  must(parent.crossing?.crossing_id===parentId,'UNPINNED_PARENT');
  must(await verifyCrossingEnvelope(parent.crossing),'PARENT_SIG');
  for(const receipt of [parent.received_receipt,parent.held_receipt,parent.custody_receipt])
    must(await verifyReceipt(receipt),'PARENT_RECEIPT');
  must(parent.held_receipt.kind==='R3_HOLD'&&
    parent.held_receipt.crossing_id===parentId &&
    parent.custody_receipt.kind==='PAYLOAD_BYTES_VERIFIED'&&
    parent.custody_receipt.crossing_id===parentId,'PARENT_NOT_HELD');
  const parentPayload=Buffer.from(JSON.stringify(parent.candidate));
  must(parent.crossing.payload_refs.some(x=>x.address==='sha256:'+sha(parentPayload))&&
    parent.custody_receipt.extensions?.local_receiver?.payload_custody?.sha256===sha(parentPayload),
    'PARENT_PAYLOAD_NOT_VERIFIED');
  const runs=[];
  for(const mode of modes){
    const path='work/discernment-inputs/lantern-discernment-'+mode;
    const dataBytes=await readFile(path+'/discernment/evidence.json');
    const data=JSON.parse(dataBytes.toString('utf8'));
    const metadata=JSON.parse(await readFile(path+'/lantern/world-meta.json','utf8'));
    must(data.schema==='lantern.creature-discernment-game-evidence/v0'&&
      data.scenario===mode&&metadata.scenario===mode,'SCENARIO');
    must(data.seed===metadata.world_seed&&
      data.game_version==='26.1.1'&&
      metadata.minecraft_version==='26.1.1'&&
      /^[a-f0-9]{64}$/.test(metadata.world_level_dat_sha256),'WORLD_ID');
    must(data.actual_actor_inventory_proof===true&&data.non_op_observer===true&&
      data.no_humans_claimed===true,'HONEST_SCOPE');
    must(data.note.includes('creature policy does not receive scenario'),'POLICY_LEAK');
    must(data.independent_clients.join('|')==='AidGrower|AidMason|CoopWitness','CLIENT_CLASSES');
    must(Array.isArray(data.episodes)&&data.episodes.length===2,'ROUND_COUNT');
    const results=[];
    for(let i=0;i<2;i++){
      const episode=data.episodes[i],before=episode.previous_memory,after=episode.updated_memory;
      must(episode.round===i+1&&episode.actor_policy_is_scripted===true&&
        episode.scenario_only_changes_partner_behavior===true,'ACTOR_SCOPE');
      must(before.schema==='lantern.creature-memory/v0'&&
        before.episodes===i&&after.episodes===i+1,'MEMORY_COLD_ROUND');
      if(i===1)must(JSON.stringify(before)===JSON.stringify(data.episodes[0].updated_memory),
        'MEMORY_NOT_REUSED');
      must(episode.initial.self_inventory===2&&
        episode.initial.wheat_barrel===0&&episode.initial.brick_barrel===0&&
        episode.initial.blocks.pond==='air'&&
        episode.initial.blocks.crop==='air'&&
        episode.initial.blocks.marker==='redstone_block'&&
        episode.initial.blocks.bell==='air','ROUND_START_NOT_SAME');
      must(episode.creature_trace[0].decision.action===expected[mode].initial[i],
        'CREATURE_NOT_ADAPTIVE');
      const hasVerifiedAction=episode.creature_trace.some(x=>
        x.step==='followup_decision'&&x.decision.action==='RECIPROCATE_VERIFIED');
      if((mode==='REOPEN'||mode==='SCARCITY')&&i===1)
        must(hasVerifiedAction,'MISSED_SAFE_REOPEN');
      if(mode==='DECEIVE'&&i===1)must(!hasVerifiedAction,'BELIEVED_EMPTY_CLAIM');
      must(episode.restored===expected[mode].results[i],'BENEFIT_MISMATCH');
      const yes=episode.restored,final=episode.final;
      must(final.blocks.pond===(yes?'water':'air')&&
        final.blocks.crop===(yes?'wheat':'air')&&
        final.blocks.marker===(yes?'emerald_block':'redstone_block')&&
        final.blocks.commons===(yes?'gold_block':'stone_bricks')&&
        final.blocks.bell===(yes?'bell':'air'),'REAL_GAME_OBSERVATION');
      must(final.self_inventory===(yes?0:2)&&
        final.wheat_barrel===(yes?2:0)&&
        final.brick_barrel===(episode.partner.moved?2:0)&&
        final.game_history.includes('COMMON_GARDEN_RESTORED')===yes,
        'REAL_GAME_RESOURCE_AND_EVENT_RECEIPT');
      if(mode==='SCARCITY'&&i===0)
        must(episode.partner.statement==='UNABLE'&&before.resource_constraints===0&&
          after.resource_constraints===1&&after.unverified_claims===0,
          'SCARCITY_UNFAIRLY_PENALIZED');
      if(mode==='DECEIVE')must(episode.partner.statement==='CLAIM_GIFT'&&
        !episode.partner.moved&&after.unverified_claims===i+1,
        'SPOOF_UNDETECTED');
      if(mode==='REOPEN'&&i===0)must(episode.partner.statement==='DECLINE'&&
        after.explicit_refusals===1,'REFUSAL_ERASED');
      results.push(yes);
    }
    must(JSON.stringify(data.final_memory)===JSON.stringify(data.episodes[1].updated_memory),
      'FINAL_MEMORY_CHANGED');
    must(data.source_sha256['discernment.mjs']?.match(/^[a-f0-9]{64}$/),'POLICY_DIGEST');
    runs.push({scenario:mode,seed:data.seed,world_save_sha256:metadata.world_level_dat_sha256,
      evidence_sha256:sha(dataBytes),source_sha256:data.source_sha256,
      restored_by_round:results,
      first_creature_action:data.episodes[0].creature_trace[0].decision.action,
      second_creature_action:data.episodes[1].creature_trace[0].decision.action,
      each_game_observed:true,human_behavior_measured:false,
      memory_after:data.final_memory});
  }
  must(new Set(runs.map(x=>x.seed)).size===4&&
    new Set(runs.map(x=>x.world_save_sha256)).size===4,'WORLD_COLLAPSE');
  must(runs.every(x=>JSON.stringify(x.source_sha256)===JSON.stringify(runs[0].source_sha256)),
    'SOURCE_CHANGED_BETWEEN_WORLDS');
  must(JSON.stringify(runs.map(x=>x.restored_by_round))===
    JSON.stringify(modes.map(x=>expected[x].results)),'COUNTERFACTUAL_FAILURE');
  const candidate={
    schema:'relatte.discernment-practice-cartridge-candidate/v0',
    name:'008 — creature revises game contributions based on material history, scarcity and renewed opportunity',
    source_parent_crossing_id:parentId,
    source_parent_hold_receipt:parent.held_receipt.receipt_id,
    source_code_sha256:runs[0].source_sha256,
    official_minecraft_worlds:4,distinct_game_runs:runs,
    observed_behavior:{
      evidence_based_behavior_changed: true,
      material_evidence_outranked_previous_refusal:true,
      dishonest_claim_alone_did_not_trigger_transfer:true,
      actual_scarcity_did_not_become_blame:true,
      withdrawal_when_partner_absent:true,
      restored_garden_on_mutual_game_contribution:true
    },
    disposition:'HOLD',authority:'NONE',
    nonclaims:[
      'scripted partner scenarios and fixed decision rules, not general artificial intelligence',
      'the creature has a simple two-round session memory, not proof of robust social learning',
      'no verified human participants or human ethical dispositions',
      'game resources reset between rounds, not a long-lived real economy',
      'no independent free-willed civilization, general property rights, or economic superiority',
      'no physical aid or real food produced',
      'signed receipt not automatic admission or permission to run commands'
    ]
  };
  const bytes=Buffer.from(JSON.stringify(candidate));
  must(bytes.length<=65536,'CARTRIDGE_SIZE');
  const now=new Date().toISOString(),keys=await generateP256KeyPair();
  const crossing=await sealCrossingEnvelope({
    schema:'relatte.crossing-envelope/v0',protocol_version:'0',
    source_particular:'particular:lantern-008-evidence-receiver-proposer',
    source_world:'world:four-game-adaptive-policy-contexts',source_history_head:null,
    parents:[parentId],declared_kind:'LANTERN_008_DISCERNMENT_PRACTICE_CANDIDATE',
    payload_refs:[{address:'sha256:'+sha(bytes),role:'cartridge-candidate',media_type:'application/json'}],
    requested_effect:null,capability_ref:null,privacy_policy:'scripted-game-only',
    audience_policy:'public-experiment',return_address:'github-actions:lantern-008',
    created_at:now,extensions:{parent_native_hold:parent.held_receipt.receipt_id,
      authority_granted:false,source_only_game:false}
  },keys);
  must(await verifyCrossingEnvelope(crossing),'SOURCE_SIG');
  const receiver=await LocalReceiver.create('work/discernment-receiver',{
    world_id:'world:lantern-008-review',receiver_particular:'particular:lantern-008-review-key',
    contract_ref:'contract:game-learning-proposal-hold/v0'});
  const received=await receiver.receive(crossing,now);
  const held=await receiver.dispose(crossing.crossing_id,'HOLD',now);
  const custody=await receiver.verifyPayloadBytes(crossing.crossing_id,bytes,now);
  for(const receipt of [received,held,custody])must(await verifyReceipt(receipt),'SIGNED_RECEIPT');
  const replay=await LocalReceiver.open('work/discernment-receiver');
  must(replay.snapshot().held.includes(crossing.crossing_id)&&
    replay.snapshot().admitted.length===0,'RECEIVER_ADMITTED');
  await mkdir('work/discernment-return',{recursive:true});
  await writeFile('work/discernment-return/practice-cartridge.json',bytes);
  await writeFile('work/discernment-return/signed-held-return.json',
    JSON.stringify({schema:'relatte.discernment-008-native-held-return/v0',
      candidate,crossing,received_receipt:received,held_receipt:held,custody_receipt:custody,
      proof_claim:'actual four game worlds, constrained rule-based adaptation',
      no_human_authority:true},null,2)+'\n');
  console.log(JSON.stringify({result:'FOUR_GAME_CONTEXTS_DISCERNMENT_PROVED_AND_HELD',
    runs:runs.map(x=>({scenario:x.scenario,restored:x.restored_by_round,
      second_creature_action:x.second_creature_action})),
    source_parent:parentId,
    new_crossing:crossing.crossing_id,
    hold_receipt:held.receipt_id,
    no_human_participants:true},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
