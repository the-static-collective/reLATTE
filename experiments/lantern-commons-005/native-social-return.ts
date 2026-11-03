import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { LocalReceiver, generateP256KeyPair, sealCrossingEnvelope, verifyCrossingEnvelope, verifyReceipt } from '../../src/index.ts';

const hash=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
const requireIt=(b:boolean,x:string)=>{if(!b)throw Error('LANTERN_005_'+x)};
const originals={
 kitchen:'8cb40cb03c34ef29146d513ee553ac922a34f29fb334896b5a7945d7c99ad353',
 annex:'60033123ddf1cc63f3f8579230f3c0ac5162e55b3443f75fb44468dfb4803c22'
};
const need=[{label:'A',seed:'381654729',constitution:'commons',budget:{wheat:2,bricks:2,paper:1}},
 {label:'B',seed:'918273645',constitution:'stewardship',budget:{wheat:3,bricks:1,paper:2}}];
const verified=[];
for(const spec of need){
 const root='work/lantern005-inputs/lantern-005-'+spec.label;
 const bytes=await readFile(root+'/observation.json');
 const report=JSON.parse(bytes.toString('utf8'));
 const meta=JSON.parse(await readFile(root+'/world-meta.json','utf8'));
 requireIt(report.schema==='lantern.society-five-live-v0','BAD_SOURCE_SCHEMA');
 requireIt(report.label===spec.label&&report.seed===spec.seed,'WRONG_WORLD');
 requireIt(report.constitution===spec.constitution&&JSON.stringify(report.budget)===JSON.stringify(spec.budget),'BUDGET_OR_CONSTITUTION');
 requireIt(report.source_function_sha256.kitchen===originals.kitchen && report.source_function_sha256.annex===originals.annex,'SOURCE_DRIFT');
 requireIt(meta.world_label===spec.label&&meta.minecraft_version==='26.1.1'&&/^[a-f0-9]{40}$/.test(meta.official_jar_sha1),'OFFICIAL_WORLD_META');
 requireIt(/^[a-f0-9]{64}$/.test(meta.world_level_dat_sha256),'MISSING_REAL_SAVE');
 requireIt(report.game_sessions.builder!==report.game_sessions.reviewer &&
  report.game_sessions.observer!==report.game_sessions.builder &&
  report.game_sessions.observer!==report.game_sessions.reviewer,'SESSION_COLLAPSE');
 const gov=report.governance;
 requireIt(gov.proposer_cannot_self_approve===true&&gov.second_game_account_reviewed===true &&
  gov.insufficient_budget_did_not_build===true&&gov.all_in_game_donations_consumed===true,'GOVERNANCE_UNPROVEN');
 requireIt(report.completion.project_state===3 && report.completion.cartridge_candidate===1 &&
  report.completion.seedling_local_audit===2,'INCOMPLETE_CYCLE');
 requireIt(report.observations.length===4&&report.observations.every((o:any)=>o.block===o.actual)&&
  report.observed_sha256===hash(JSON.stringify(report.observations)),'INDEPENDENT_BLOCK_MISMATCH');
 const trace=report.declared_action_trace;
 requireIt(trace.some((e:any)=>e.act===30&&e.who===report.game_sessions.builder) &&
  trace.some((e:any)=>e.act===30&&e.who===report.game_sessions.reviewer),'NO_REVIEW_ATTEMPTS');
 for(const [action,count] of [[70,spec.budget.wheat],[71,spec.budget.bricks],[72,spec.budget.paper]]){
   requireIt(trace.filter((e:any)=>e.act===action).length===count,'DONATION_TRACE_MISSING');
 }
 requireIt(report.constraints.two_accounts_not_distinct_humans===true &&
  report.constraints.representative_society_slice_not_full_003_pack===true &&
  report.constraints.physical_work===false&&report.constraints.receiver_admission===false,'FALSE_REAL_WORLD_CLAIM');
 verified.push({world:spec.label,seed:spec.seed,constitution:spec.constitution,budget:spec.budget,
  save_sha256:meta.world_level_dat_sha256,source_evidence_sha256:hash(bytes),
  player_sessions:report.game_sessions,observed_blocks:report.observations,
  game_action_count:trace.length});
}
requireIt(verified[0].save_sha256!==verified[1].save_sha256,'CLONED_SAVES');
requireIt(verified[0].source_evidence_sha256!==verified[1].source_evidence_sha256,'CLONED_EVIDENCE');
const candidate={
 schema:'lantern.society-005-cartridge-candidate/v0',
 category:'VOLUNTARY_KITCHEN_SOCIAL_REHEARSAL',
 history:['found','join','charter','propose','self-review-refused','second-account-review','underfunded-build-refused',
  'actual-game-items-consumed','build','press','new-site-rehearsal','local-audit','fresh-protocol-observation'],
 worlds:verified,
 provenance:{original_lantern_003_slices:originals,implementation:'narrow source-pinned modeled governance, not complete 003 pack',
  reproduction_scope:'same kitchen and seedling subskill; different constitutions, material budgets and separate world seeds'},
 limitations:{two_bot_accounts_are_not_two_verified_people:true,signer_is_ephemeral_CI_key:true,
  actual_server_gameplay:true,full_003_society_executed:false,physical_community_help:false,
  cartridge_is_candidate_only:true,real_legal_or_financial_authority:false},
 owner_local_decision:'HOLD'
};
const payload=Buffer.from(JSON.stringify(candidate),'utf8');
requireIt(payload.length<=65536,'PAYLOAD_TOO_LARGE');
const now=new Date().toISOString();
const source=await generateP256KeyPair();
const crossing=await sealCrossingEnvelope({
 schema:'relatte.crossing-envelope/v0',protocol_version:'0',
 source_particular:'particular:lantern-005-ci-operator',source_world:'world:official-minecraft-society-005',
 source_history_head:null,parents:[],
 declared_kind:'LANTERN_SOCIETY_005_CANDIDATE',
 payload_refs:[{address:'sha256:'+hash(payload),role:'evidence',media_type:'application/json'}],
 requested_effect:null,capability_ref:null,privacy_policy:'synthetic bot names and game-only evidence',
 audience_policy:'public-source-CI',return_address:'github-actions:lantern005',created_at:now,
 extensions:{no_automatic_execution:true,scope:'candidate, two-world game-only'}},source);
assert.equal(await verifyCrossingEnvelope(crossing),true);
const receiver=await LocalReceiver.create('work/lantern005-receiver',{
 world_id:'world:lantern005-reviewer-local',receiver_particular:'particular:lantern005-reviewer-local',
 contract_ref:'contract:lantern005-cartridge-candidate/v0'});
const received=await receiver.receive(crossing,now);
const hold=await receiver.dispose(crossing.crossing_id,'HOLD',now);
const custody=await receiver.verifyPayloadBytes(crossing.crossing_id,payload,now);
for(const receipt of [received,hold,custody])assert.equal(await verifyReceipt(receipt),true);
const reopened=await LocalReceiver.open('work/lantern005-receiver');
requireIt(reopened.snapshot().held.includes(crossing.crossing_id),'COLD_REPLAY_HOLD_MISSING');
const returnObject={schema:'lantern.society-005-native-return/v0',candidate,crossing,received_receipt:received,
 held_receipt:hold,custody_receipt:custody,disposition:'HOLD',cryptographic_claim:'source-native P256 ephemeral lab keys',
 human_identity_verified:false,production_readiness:false};
await mkdir('work/lantern005-return',{recursive:true});
await writeFile('work/lantern005-return/candidate.json',payload);
await writeFile('work/lantern005-return/native-return.json',JSON.stringify(returnObject,null,2)+'\n');
process.stdout.write(JSON.stringify({result:'TWO_REAL_GAME_SOCIAL_SLICE_WORLDS_REPRODUCED_AND_HELD',
 crossing_id:crossing.crossing_id,held_receipt_id:hold.receipt_id,number_of_worlds:verified.length,
 governance:'synthetic game accounts, not two humans'},null,2)+'\n');
