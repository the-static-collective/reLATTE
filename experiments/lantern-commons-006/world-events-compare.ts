import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {LocalReceiver,generateP256KeyPair,sealCrossingEnvelope,verifyCrossingEnvelope,verifyReceipt} from '../../src/index.ts';

const sha=x=>createHash('sha256').update(x).digest('hex');
const insist=(ok,code)=>{if(!ok)throw Error('WORLD_EVENTS_COMPARE_'+code)};
const parentId='relatte-crossing-v0:596c1fa076a8e85f287449e13e48707c75fd2c5fdf77f862c9228df80247d630';
const root='work/world-events-inputs';
async function main(){
  const prior=JSON.parse(await readFile('work/prior-cartridge/transfer-signed-hold.json','utf8'));
  insist(prior.schema==='lantern.cartridge-transfer-native-receipt/v0','PARENT_SCHEMA');
  insist(prior.crossing?.crossing_id===parentId,'PARENT_ID');
  insist(await verifyCrossingEnvelope(prior.crossing),'PARENT_SIG');
  for(const r of [prior.received_receipt,prior.held_receipt,prior.custody_receipt])
    insist(await verifyReceipt(r),'PARENT_RECEIPT_SIG');
  insist(prior.held_receipt.kind==='R3_HOLD'&&
    prior.held_receipt.crossing_id===parentId &&
    prior.custody_receipt.crossing_id===parentId &&
    prior.custody_receipt.kind==='PAYLOAD_BYTES_VERIFIED','PARENT_NOT_HELD');
  const parentPayload=Buffer.from(JSON.stringify(prior.candidate));
  const digest=sha(parentPayload);
  insist(prior.crossing.payload_refs.some(r=>r.address==='sha256:'+digest) &&
    prior.custody_receipt.extensions?.local_receiver?.payload_custody?.sha256===digest,
    'PARENT_PAYLOAD');
  const modes=['MERCY','ABSTAIN'];
  const reports=[];
  for(const mode of modes){
    const folder=root+'/lantern-event-world-'+mode;
    const raw=await readFile(folder+'/event-record.json');
    const report=JSON.parse(raw.toString('utf8'));
    const meta=JSON.parse(await readFile(folder+'/world-meta.json','utf8'));
    insist(report.schema==='lantern.world-events-native-observation/v0' &&
      report.scenario===mode && meta.scenario===mode,'SCENARIO');
    insist(report.game_version==='26.1.1'&&meta.minecraft_version==='26.1.1'&&
      /^[a-f0-9]{40}$/.test(meta.official_jar_sha1),'GAME_VERSION');
    insist(report.world_seed===meta.world_seed&&/^[a-f0-9]{64}$/.test(meta.world_level_dat_sha256),
      'WORLD_SEED_AND_BYTES');
    insist(report.stages?.length===3 &&
      report.stages[0].label==='PREPARE' &&
      report.stages[1].label==='DROUGHT' &&
      report.stages[2].label===mode,'STAGE_SEQUENCE');
    insist(report.stages.every(s=>s.observed_positions===6&&s.problems.length===0),'BLOCK_EVIDENCE');
    insist(report.operator_trace?.length===3 &&
      report.operator_trace[0].command==='function lantern:events/prepare' &&
      report.operator_trace[1].command==='function lantern:events/drought' &&
      report.operator_trace[2].command==='function lantern:events/'+mode.toLowerCase(),
      'OPERATOR_ACTION_TRACE');
    insist(report.observer_authority.includes('non-OP') && report.game_independent_observer===true &&
      report.social_governance_observed===false &&
      report.real_world_effect===false &&
      report.no_automatic_admission===true,'CLAIMS');
    const ph=report.stages.map(x=>x.blocks.phase_marker);
    insist(ph[0]==='lapis_block'&&ph[1]==='redstone_block'&&
      ph[2]===(mode==='MERCY'?'emerald_block':'redstone_block'),'PHASE_MARKER');
    reports.push({mode,world_seed:report.world_seed,observer:report.observer_username,
      world_level_dat_sha256:meta.world_level_dat_sha256,source_sha256:report.source_sha256,
      detailed_observation_sha256:sha(raw),
      stages:report.stages.map(s=>({label:s.label,blocks:s.blocks,
        observation_sha256:s.observation_sha256})),official_jar_sha1:meta.official_jar_sha1});
  }
  const [mercy,abstain]=reports;
  insist(mercy.world_seed!==abstain.world_seed&&
    mercy.world_level_dat_sha256!==abstain.world_level_dat_sha256&&
    mercy.observer!==abstain.observer,'SEPARATE_WORLDS');
  insist(mercy.official_jar_sha1===abstain.official_jar_sha1,'SERVER_JAR_DRIFT');
  insist(JSON.stringify(mercy.source_sha256)===JSON.stringify(abstain.source_sha256),
    'WORLD_EVENT_SOURCE_DRIFT');
  insist(Object.keys(mercy.source_sha256).length===7,'SEVEN_EVENT_FUNCTIONS');
  for(let i=0;i<2;i++) insist(mercy.stages[i].observation_sha256===
    abstain.stages[i].observation_sha256,'BASELINE_OR_DROUGHT_CHANGED');
  insist(abstain.stages[1].observation_sha256===abstain.stages[2].observation_sha256,
    'ABSTAIN_CAUSED_CHANGE');
  insist(mercy.stages[2].observation_sha256!==mercy.stages[1].observation_sha256,
    'MERCY_NO_EFFECT');
  const candidate={
    schema:'relatte.world-event-response-cartridge-candidate/v0',
    title:'World Events 006 — Drought, mercy, and restraint',
    source_parent_crossing_id:parentId,
    source_parent_hold_receipt_id:prior.held_receipt.receipt_id,
    source_sha256:mercy.source_sha256,
    actual_game_worlds:2,
    comparison:reports,
    hypothesis:'Same world-event setup can yield diverging game environments after operator-selected response.',
    result:'MERCY_RESTORES_CROPS_AND_WATER__ABSTAIN_LEAVES_DROUGHT',
    authority:'NONE',
    disposition:'HOLD',
    nonclaims:['game event weather acts globally inside disposable test server',
      'two server runs are not two distinct human communities',
      'no player or villager free will measured',
      'not a full Lantern Commons 003 constitution/economy execution',
      'no universal good/bad morality score',
      'no real world environmental or physical effects',
      'not autonomous agent self-improvement',
      'signed receipt does not itself prove organizational identity']
  };
  const bytes=Buffer.from(JSON.stringify(candidate),'utf8');
  insist(bytes.length<=65536,'CANDIDATE_TOO_LARGE');
  const keys=await generateP256KeyPair(),now=new Date().toISOString();
  const crossing=await sealCrossingEnvelope({
    schema:'relatte.crossing-envelope/v0',protocol_version:'0',
    source_particular:'particular:lantern-world-event-operator',
    source_world:'world:lantern-scripted-world-events',
    source_history_head:null,parents:[parentId],
    declared_kind:'LANTERN_WORLD_EVENTS_SCRIPTED_RESPONSE_CANDIDATE',
    payload_refs:[{address:'sha256:'+sha(bytes),role:'game-event-candidate',media_type:'application/json'}],
    requested_effect:null,capability_ref:null,
    privacy_policy:'fictional-game-only',audience_policy:'public-test-evidence',
    return_address:'github-actions:lantern-006',
    created_at:now,extensions:{event_study:'MERCY_V_ABSTAIN',
      prior_source_cartridge_parent:parentId,
      non_authority:true},},keys);
  insist(await verifyCrossingEnvelope(crossing),'CROSSING_SIGNATURE');
  const recv=await LocalReceiver.create('work/world-events-receiver',{
    world_id:'world:lantern-006-receiver',
    receiver_particular:'particular:lantern-006-independent-receiver',
    contract_ref:'contract:lantern-world-events-hold/v0'
  });
  const received=await recv.receive(crossing,now);
  const held=await recv.dispose(crossing.crossing_id,'HOLD',now);
  const custody=await recv.verifyPayloadBytes(crossing.crossing_id,bytes,now);
  for(const receipt of [received,held,custody])
    insist(await verifyReceipt(receipt),'RECEIPT_SIGNATURE');
  const replay=await LocalReceiver.open('work/world-events-receiver');
  insist(replay.snapshot().held.includes(crossing.crossing_id)&&
    replay.snapshot().admitted.length===0,'HOLD_REPLAY');
  await mkdir('work/world-events-result',{recursive:true});
  await writeFile('work/world-events-result/world-event-cartridge.json',bytes);
  await writeFile('work/world-events-result/signed-world-event-hold.json',
    JSON.stringify({schema:'relatte.world-events-signed-hold/v0',candidate,
      crossing,received_receipt:received,held_receipt:held,custody_receipt:custody,
      signer_status:'ephemeral CI key',native_game_server_verified:true,
      human_civilization_derived:false,receiver_admitted:false},null,2)+'\n');
  console.log(JSON.stringify({result:'WORLD_EVENTS_NATIVE_CROSSING_HELD',
    parent_crossing:parentId,child_crossing:crossing.crossing_id,
    hold_receipt:held.receipt_id,modes,real_minecraft_worlds:2,
    stage_observations_per_world:18,
    full_society_tested:false},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
