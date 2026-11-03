import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {choose,learn,newMemory} from './commons-policy.mjs';
import {LocalReceiver,generateP256KeyPair,sealCrossingEnvelope,
  verifyCrossingEnvelope,verifyReceipt} from '../../src/index.ts';

const sha=x=>createHash('sha256').update(x).digest('hex');
const must=(ok,code)=>{if(!ok)throw Error('LONGITUDINAL_009_COMPARE_'+code);};
const parentId='relatte-crossing-v0:41d7b885153195d2d7b802baaa641c15c7f635a7149f23b07406535bf27b9968';
const modes=['STABLE','ALTERNATING','COMPETING','RUMOR'];
const roles=['grower','mason'];
const jsonEq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

async function main(){
  const parent=JSON.parse(await readFile('work/pressure-parent/signed-held-return.json','utf8'));
  must(parent.schema==='relatte.discernment-008-native-held-return/v0'&&
    parent.crossing.crossing_id===parentId,'PARENT_ID');
  must(await verifyCrossingEnvelope(parent.crossing),'PARENT_CROSSING_SIGNATURE');
  for(const r of [parent.received_receipt,parent.held_receipt,parent.custody_receipt])
    must(await verifyReceipt(r),'PARENT_RECEIPT_SIGNATURE');
  must(parent.held_receipt.kind==='R3_HOLD'&&
    parent.held_receipt.crossing_id===parentId&&
    parent.custody_receipt.kind==='PAYLOAD_BYTES_VERIFIED'&&
    parent.custody_receipt.crossing_id===parentId,'PARENT_NOT_HELD');
  const parentPayload=Buffer.from(JSON.stringify(parent.candidate));
  const parentHash=sha(parentPayload);
  must(parent.crossing.payload_refs.some(x=>x.address==='sha256:'+parentHash)&&
    parent.custody_receipt.extensions?.local_receiver?.payload_custody?.sha256===parentHash,
    'PARENT_PAYLOAD_CUSTODY');

  const runs=[];
  for(const mode of modes){
    const folder='work/pressure-worlds/lantern-pressure-'+mode;
    const raw=await readFile(folder+'/pressure/evidence.json');
    const x=JSON.parse(raw.toString('utf8'));
    const meta=JSON.parse(await readFile(folder+'/lantern/world-meta.json','utf8'));
    must(x.schema==='lantern.longitudinal-cooperation-game-evidence/v0'&&
      x.scenario===mode&&meta.scenario===mode&&
      x.world_seed===meta.world_seed&&
      x.game_version==='26.1.1'&&meta.minecraft_version==='26.1.1'&&
      /^[a-f0-9]{40}$/.test(meta.official_jar_sha1)&&
      /^[a-f0-9]{64}$/.test(meta.world_level_dat_sha256),'METADATA');
    must(x.world_experiment_rounds===6&&
      Array.isArray(x.episodes)&&x.episodes.length===6&&
      x.agents_use_same_independent_policy===true&&
      x.no_agent_is_given_scenario_label===true&&
      x.resources_replenished_exogenously_each_round===true&&
      x.adaptive_memories_saved_cold_between_rounds===true,'EXPERIMENT_SCOPE');
    must(Object.values(x.source_sha256).every(v=>/^[a-f0-9]{64}$/.test(v))&&
      x.source_sha256['commons-policy.mjs']&&
      x.source_sha256['cooperation/try_restore'],'SOURCE_DIGEST');

    let previous={grower:newMemory('grower'),mason:newMemory('mason')};
    let shared=0,protectedRounds=0,rumorEvents=0;
    const episodic=[];
    for(let i=0;i<6;i++){
      const e=x.episodes[i];
      must(e.round===i+1&&e.game_work_proof===true&&
        e.human_cooperation_proof===false&&e.independent_non_op_clients.join('|')===
        'AidGrower|AidMason|CoopWitness','IN_GAME_ROLE_SCOPE');
      must(e.starting_block_observation.pond==='air'&&
        e.starting_block_observation.crop==='air'&&
        e.starting_block_observation.marker==='redstone_block'&&
        e.starting_block_observation.bell==='air','STARTING_DROUGHT');
      const initial=e.exogenous_public_conditions?.endowment;
      must(initial?.grower?.inventory>=2&&initial?.mason?.inventory>=2&&
        Number.isSafeInteger(initial.grower.reserve)&&
        Number.isSafeInteger(initial.mason.reserve)&&
        initial.grower.reserve>=0&&initial.mason.reserve>=0,
        'RESOURCE_AND_PROTECTED_NEED');
      const offered={grower:false,mason:false};
      const trace=e.actor_decisions;
      must(Array.isArray(trace.followup)&&Array.isArray(trace.transfers),'ACTION_TRACE');
      for(const role of roles){
        const before=e.memory_before[role];
        must(jsonEq(before,previous[role]),'NOT_COLD_REPLAYED_'+role);
        const original=trace.first[role];
        const input=original.input;
        must(input.inventory===initial[role].inventory&&
          input.protected_reserve===initial[role].reserve&&
          input.partner_deposit===0&&
          input.episode===e.round&&input.garden_dry===true&&
          !('scenario' in input)&&!('rumor' in input),
          'PRIVATE_OBSERVATIONS_INVALID_'+role);
        const expected=choose(before,input);
        must(jsonEq(expected,original.decision),'SCRIPTED_ACTION_SUBSTITUTED_'+role);
      }
      // The two initial decisions were made before either material transfer.
      const firstMovers=roles.filter(role=>trace.first[role].decision.may_move_own_items);
      for(const role of firstMovers){
        must(trace.transfers.some(t=>t.role===role&&t.stage==='first'&&
          t.action===trace.first[role].decision.act),'MISSING_FIRST_GIFT_'+role);
        offered[role]=true;
      }
      for(const answer of trace.followup){
        const role=answer.role,other=role==='grower'?'mason':'grower';
        must(roles.includes(role)&&!firstMovers.includes(role),
          'ILLEGAL_FOLLOWUP');
        const partner=answer.observed_partner_barrel;
        must(partner===(offered[other]?2:0),'FOLLOWUP_PROOF_NOT_MATERIAL');
        const revised=choose(previous[role],{
          inventory:initial[role].inventory,
          protected_reserve:initial[role].reserve,
          partner_deposit:partner,episode:e.round,garden_dry:true
        });
        must(jsonEq(revised,answer.decision),'FOLLOWUP_NOT_FROM_AGENT_POLICY');
        if(revised.may_move_own_items){
          must(trace.transfers.some(t=>t.role===role&&
            t.stage==='followup'&&t.action===revised.act),'MISSING_SECOND_GIFT');
          offered[role]=true;
        }
      }
      const donations=e.actual_deposits_before_exit;
      must(donations.grower===(offered.grower?2:0)&&
        donations.mason===(offered.mason?2:0),'PHYSICAL_GAME_ITEM_DEPOSIT');
      const restored=offered.grower&&offered.mason;
      must(e.world_restored===restored,'BENEFIT_NOT_CAUSED_BY_BOTH');
      const b=e.final_observed_blocks;
      must(b.pond===(restored?'water':'air')&&
        b.crop===(restored?'wheat':'air')&&
        b.marker===(restored?'emerald_block':'redstone_block')&&
        b.commons===(restored?'gold_block':'stone_bricks')&&
        b.bell===(restored?'bell':'air')&&
        e.game_history.includes('COMMON_GARDEN_RESTORED')===restored,
        'INDEPENDENT_PUBLIC_GAME_BLOCK_EFFECT');
      for(const role of roles){
        const items=e.item_custody[role];
        const initialCount=initial[role].inventory;
        must(items.inventory+items.barrel===initialCount&&
          items.barrel===(restored?2:0),'INVENTORY_LOST_OR_SEIZED_'+role);
        if(!restored&&offered[role]){
          must(trace.transfers.some(t=>t.role===role&&
            t.action==='RECLAIM_UNCONSUMED_GIFT'&&t.stage==='exit'),
            'DID_NOT_RESPECT_EXIT_'+role);
        }
        const expectedMemory=learn(previous[role],{
          episode:e.round,
          own_gift:offered[role],
          partner_gift:offered[role==='grower'?'mason':'grower'],
          garden_restored:restored,
          protected_need:trace.first[role].decision.act==='PROTECT_OWN_NEED'
        });
        must(jsonEq(expectedMemory,e.memory_after[role]),
          'AGENT_MEMORY_NOT_EVIDENCE_DERIVED_'+role);
        previous[role]=expectedMemory;
      }
      if(e.untrusted_rumor){
        rumorEvents++;
        must(e.untrusted_rumor.acceptance==='NONE'&&
          e.untrusted_rumor.actual_mason_material_before===0,
          'RUMOR_ACCEPTED_AS_RECEIPT');
      }
      if(roles.some(role=>trace.first[role].decision.act==='PROTECT_OWN_NEED'))protectedRounds++;
      if(restored)shared++;
      episodic.push({round:e.round,restored,
        grower_first:trace.first.grower.decision.act,
        mason_first:trace.first.mason.decision.act,
        protected_need:roles.some(role=>trace.first[role].decision.act==='PROTECT_OWN_NEED'),
        actual_gifts:donations});
    }
    must(jsonEq(previous,x.final_memory),'MEMORY_MISMATCH_END');
    must(shared===x.outcome.successful_public_garden_repairs&&
      protectedRounds===x.outcome.episodes_with_protected_personal_need,
      'SUMMARY_NOT_MATCHED_BY_EPISODES');
    must(shared>=1,'NO_PUBLIC_BENEFIT');
    if(mode==='STABLE')must(shared===6,'ABUNDANCE_FAILED');
    if(mode==='ALTERNATING')must(protectedRounds>=2&&shared>=2,
      'FAILED_ALTERNATING_RECOVERY');
    if(mode==='COMPETING')must(protectedRounds>=2&&shared>=2,
      'FAILED_PERSONAL_NEED_RECOVERY');
    if(mode==='RUMOR')must(rumorEvents>0&&protectedRounds>=2&&shared>=2,
      'FAILED_FALSE_SIGNAL_RESISTANCE');
    runs.push({
      scenario:mode,world_seed:x.world_seed,
      official_game_server_sha1:meta.official_jar_sha1,
      observed_world_save_sha256:meta.world_level_dat_sha256,
      source_sha256:x.source_sha256,
      evidence_sha256:sha(raw),
      episodes:6,public_repairs:shared,protected_need_episodes:protectedRounds,
      untrusted_rumors:rumorEvents,
      observed_actual_items_and_world_blocks:true,
      independent_game_accounts:true,verified_human_actors:false,
      timeline:episodic
    });
  }
  must(new Set(runs.map(r=>r.world_seed)).size===4&&
    new Set(runs.map(r=>r.observed_world_save_sha256)).size===4,
    'WORLD_SEEDS_OR_SAVES_REUSED');
  must(runs.every(x=>jsonEq(x.source_sha256,runs[0].source_sha256)&&
    x.official_game_server_sha1===runs[0].official_game_server_sha1),
    'RUNTIME_OR_SOURCE_DRIFT');
  const candidate={
    schema:'relatte.longitudinal-cooperation-candidate/v0',
    title:'009 — voluntary cooperation under changing personal needs and finite material access',
    signed_parent_crossing_id:parentId,
    signed_parent_hold_receipt:parent.held_receipt.receipt_id,
    evidence:runs,
    observed_game_rounds:24,
    agents_per_world:2,
    additional_independent_game_observer_per_world:1,
    adaptive_evidence_based_policies:true,
    decision_policies_are_explicit_and_bounded:true,
    trust_basis:'real material deposit, no unverified claims',
    reversibility:'one-sided offers actually reclaimed before the next episode',
    human_value_or_moral_score:'NONE',permanent_coercive_penalties:'NONE',
    requested_disposition:'HOLD',authority:'NONE',
    nonclaims:[
      'no verified human participants and no free-form independent machine minds',
      'each episode operator-provisions finite fresh resources to both independent agent clients',
      'private protected reserves are declared in test scenario, not measured physiological need',
      'scenario conditions intentionally authored rather than randomly sampled',
      'the public game restoration mechanism is authored, not socially discovered',
      '24 in-game trials are not proof of a real-world economy or sociology',
      'signed native reLATTE candidate cannot grant permission to act in another community'
    ]
  };
  const bytes=Buffer.from(JSON.stringify(candidate),'utf8');
  must(bytes.length<=65536,'PAYLOAD_TOO_BIG');
  const now=new Date().toISOString();
  const keys=await generateP256KeyPair();
  const crossing=await sealCrossingEnvelope({
    schema:'relatte.crossing-envelope/v0',protocol_version:'0',
    source_particular:'particular:lantern-009-experimental-gamemaster',
    source_world:'world:lantern-009-cooperation-stress-laboratory',
    source_history_head:null,parents:[parentId],
    declared_kind:'LANTERN_009_LONGITUDINAL_COMMONS_PRACTICE_CANDIDATE',
    payload_refs:[{address:'sha256:'+sha(bytes),role:'candidate',media_type:'application/json'}],
    requested_effect:null,capability_ref:null,
    privacy_policy:'synthetic-game-artifacts-only',audience_policy:'public-aggregate',
    return_address:'github-actions:lantern-009',
    created_at:now,extensions:{source_parent_hold_receipt:parent.held_receipt.receipt_id,
      protects_refusal:true,source_owned_no_execution_grant:true}
  },keys);
  must(await verifyCrossingEnvelope(crossing),'NEW_SIGNATURE_INVALID');
  const receiver=await LocalReceiver.create('work/pressure-receiver',{
    world_id:'world:lantern-009-review',
    receiver_particular:'particular:lantern-009-distinct-receiver-key',
    contract_ref:'contract:longitudinal-game-practice-hold/v0'
  });
  const received=await receiver.receive(crossing,now);
  const held=await receiver.dispose(crossing.crossing_id,'HOLD',now);
  const custody=await receiver.verifyPayloadBytes(crossing.crossing_id,bytes,now);
  for(const r of [received,held,custody])must(await verifyReceipt(r),'RECEIPT_SIG');
  const replay=await LocalReceiver.open('work/pressure-receiver');
  must(replay.snapshot().held.includes(crossing.crossing_id)&&
    replay.snapshot().admitted.length===0,'RECEIVER_NO_AUTHORITY');
  await mkdir('work/pressure-return',{recursive:true});
  await writeFile('work/pressure-return/cartridge-candidate.json',bytes);
  await writeFile('work/pressure-return/signed-held-return.json',
    JSON.stringify({schema:'relatte.longitudinal-cooperation-held-return/v0',
      candidate,crossing,received_receipt:received,held_receipt:held,
      custody_receipt:custody,no_human_authority:true},null,2)+'\n');
  console.log(JSON.stringify({result:'FOUR_WORLD_LONGITUDINAL_COOPERATION_CHECKED_AND_HELD',
    count:runs.length,total_game_episodes:24,
    worlds:runs.map(x=>({scenario:x.scenario,repairs:x.public_repairs,
      protected_need_episodes:x.protected_need_episodes})),
    parent_crossing:parentId,
    new_crossing:crossing.crossing_id,
    new_hold_receipt:held.receipt_id,
    no_human_social_science_proof:true},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
