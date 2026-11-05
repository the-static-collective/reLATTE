import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {verifyNewMicroGame} from '../motif-instrument-010/verify.mjs';
import {generateP256KeyPair,verifyCrossingEnvelope,verifyReceipt} from '../../src/protocol.ts';
import {makeObservation,makePolyglotHop,verifyHopBinding} from '../polyglot-crossing-001/common.ts';
export const SPEC_SCHEMA='relatte.minecraft011.hostile-method-proposal/v0';
const sha=x=>createHash('sha256').update(x).digest('hex');
const f=(x,w)=>{if(!x)throw Error('MINECRAFT_011_COMPOSE_'+w)};
const ARCHIVE='fixtures/riff-raft-minecraft-006/signed-005-return.bundle.json';
export async function composeHostileExperiment({game010Bytes,game009Bytes,archiveBytes,motifRoot}){
 f(Buffer.isBuffer(game010Bytes)&&Buffer.isBuffer(game009Bytes)&&Buffer.isBuffer(archiveBytes),'SIGNED_SOURCE_REQUIRED');
 f(typeof motifRoot==='string'&&motifRoot.length>0,'MOTIF_ROOT_REQUIRED');
 const evidence=await verifyNewMicroGame(game010Bytes,game009Bytes,archiveBytes);
 const actual=JSON.parse(game010Bytes.toString('utf8'));
 const trace=JSON.parse(actual.packet_json).trace;
 const engine=await import(pathToFileURL(join(resolve(motifRoot),'experiments/023/method_falsifier.mjs')).href);
 const design=engine.proposeFalsification(evidence,trace);
 f(design.status==='PROPOSE_HOSTILE_GAME_FOR_METHOD'&&design.selected.stage_index===6,'NO_EXPECTED_BOUNDED_TEST');
 const side=design.selected.source_block;
 const proposal={
  schema:SPEC_SCHEMA,source_game010_crossing:evidence.signed_game_crossing,
  signed_source010_sha256:sha(game010Bytes),
  source_original009_crossing:evidence.source_009_crossing,
  world:'A',seed:'381654729',fault_x:-28,
  fault_repeater_position:{x:-28,y:66,z:46},
  side_power_position:side,original_micro_indexes:[2,3],
  side_power_inserted_after_fault_before_micro:true,
  independent_full_audit_required:true,independent_fresh_nonop_required:true,
  original_prefix_is_test_hypothesis_not_fact:true,
  observe_even_if_falsification_fails:true,
  predicted_side_island_in_game_unverified:true,
  restoration_must_remove_side_power:true,
  physical_effect:false,game_only:true,automatic_execution:false,
  owner_admission:false,disposition:'R3_HOLD',
 };
 const bytes=Buffer.from(JSON.stringify(proposal));
 const observation=makeObservation('composition-instance','motif011-falsifier:'+sha(bytes),bytes,
  'application/vnd.relatte.minecraft011-proposal+json',
  {falsification_not_forged_observation:true,game_only:true});
 const hop=await makePolyglotHop({
  observation,signer:await generateP256KeyPair(),receiver:await generateP256KeyPair(),
  parent_crossing_id:evidence.signed_game_crossing,disposition:'R3_HOLD',hop_index:63});
 verifyHopBinding(hop,bytes);
 f(await verifyCrossingEnvelope(hop.crossing)&&await verifyReceipt(hop.receipt)&&hop.receipt.kind==='R3_HOLD','PROPOSAL_SIGNATURE_FAILED');
 return {proposal,design,evidence,bundle:{schema:'relatte.minecraft011-signed-proposal/v0',
  proposal_json:bytes.toString('utf8'),crossing:hop.crossing,receipt:hop.receipt,game_executed:false}};
}
export async function makePack({game010Path=process.env.MOTIF_010_SOURCE??'work/source010/signed-game-result.json',
 game009Path=process.env.MOTIF_009_SOURCE??'work/source009/signed-game-result.json',
 motifRoot=process.env.MOTIF_ROOT,previousPack=process.env.MOTIF_010_PACK??'work/source-pack010/datapack',
 out='work/motif-minecraft-011'}={}){
 const [game010Bytes,game009Bytes,archiveBytes]=await Promise.all([
  readFile(game010Path),readFile(game009Path),readFile(ARCHIVE)]);
 const x=await composeHostileExperiment({game010Bytes,game009Bytes,archiveBytes,motifRoot});
 await mkdir(out,{recursive:true});
 await cp(previousPack,join(out,'datapack'),{recursive:true});
 const side=x.proposal.side_power_position;
 for(const [name,command] of Object.entries({
  'inject':'setblock '+side.x+' '+side.y+' '+side.z+' '+side.block,
  'remove_injection':'setblock '+side.x+' '+side.y+' '+side.z+' minecraft:air'
 })){
  const file=join(out,'datapack','data','motif023','function',name+'.mcfunction');
  await mkdir(dirname(file),{recursive:true});await writeFile(file,command+'\n');
 }
 for(const [name,value] of Object.entries({
  'proposal.json':x.proposal,'signed-proposal.json':x.bundle,'motif-design.json':x.design
 }))await writeFile(join(out,name),JSON.stringify(value,null,2)+'\n');
 return {source_010_verified:x.evidence.source_signatures_verified,
  stage:x.design.selected.stage_index,source_block:side,
  source_game:x.evidence.signed_game_crossing,
  signed_proposal:x.bundle.crossing.crossing_id,game_executed:false,disposition:'R3_HOLD'};
}
if(process.argv[1]?.endsWith('/compose.mjs')){
 makePack().then(x=>console.log(JSON.stringify(x,null,2)))
  .catch(e=>{console.error(e.stack||String(e));process.exitCode=1});
}
