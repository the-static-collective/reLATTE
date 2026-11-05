import {readFile,writeFile,cp,mkdir} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {verifyHostileGame} from '../motif-instrument-011/verify-hostile.mjs';
import {verifyCrossingEnvelope,verifyReceipt,generateP256KeyPair} from '../../src/protocol.ts';
import {makeObservation,makePolyglotHop,verifyHopBinding} from '../polyglot-crossing-001/common.ts';
export const SPEC_SCHEMA='relatte.minecraft012.revised-method-proposal/v0';
const sha=x=>createHash('sha256').update(x).digest('hex');
const f=(x,w)=>{if(!x)throw Error('MINECRAFT_012_PREP_'+w)};
export async function composeRevised({game011,game010,game009,archive,method011}){
 const v=await verifyHostileGame(game011,game010,game009,archive);
 const signed=JSON.parse(method011.toString('utf8'));
 f(signed.schema==='relatte.minecraft011-signed-method-revision/v0'&&
   await verifyCrossingEnvelope(signed.crossing)&&await verifyReceipt(signed.receipt)&&
   signed.receipt.kind==='R3_HOLD'&&
   signed.crossing.parents?.[0]===v.game_011_crossing&&
   signed.crossing.payload_refs?.[0]?.address==='sha256:'+sha(Buffer.from(signed.packet_json)),
   'METHOD_REVISION_NOT_GENUINELY_SIGNED');
 const prior=JSON.parse(signed.packet_json);
 const decision=prior.method_decision;
 f(prior.source_game_crossing===v.game_011_crossing&&
   decision.status==='PROPOSE_REVISED_THREE_STAGE_GAME_PROBE'&&
   decision.source_crossing===v.game_011_crossing&&
   decision.new_probe_indexes?.join(',')==='2,3,6'&&
   decision.prefix_falsified===true&&
   decision.external_actions===0&&
   prior.next_game_execution===false&&
   v.prefix_is_broken===true,
   'NO_REVIEWABLE_REAL_GAME_METHOD_REVISION');
 const coords=decision.new_probe_indexes.map(i=>({index:i,
   x:-40+i*10,y:65,z:46}));
 const proposal={
   schema:SPEC_SCHEMA,source_signed_method_crossing:signed.crossing.crossing_id,
   source_signed_game011_crossing:v.game_011_crossing,
   source_game011_sha256:sha(game011),
   source_signed_revision_sha256:sha(method011),
   world:'A',seed:'381654729',fault_x:-28,
   lateral_source:{x:20,y:65,z:47,block:'minecraft:redstone_block'},
   new_probe:coords,old_probe_indexes:[2,3],
   new_game_instance_required:true,
   revised_read_first_full_nine_lamp_audit_later:true,
   no_pretend_generalization:true,
   isolated_game_only:true,
   automatically_execute:false,physical_world_effect:false,
   disposition:'R3_HOLD',owner_admission:false,
 };
 const bytes=Buffer.from(JSON.stringify(proposal));
 const ob=makeObservation('composition-instance','motif012-new-method:'+sha(bytes),
 bytes,'application/vnd.relatte.minecraft012-proposal+json',
 {revised_method_not_empirical_result:true,game_only:true});
 const hop=await makePolyglotHop({observation:ob,signer:await generateP256KeyPair(),
  receiver:await generateP256KeyPair(),parent_crossing_id:signed.crossing.crossing_id,
  disposition:'R3_HOLD',hop_index:66});
 verifyHopBinding(hop,bytes);
 f(await verifyCrossingEnvelope(hop.crossing)&&await verifyReceipt(hop.receipt),
   'NEW_INSTRUMENT_NOT_SIGNED');
 return {proposal,source_verified:v,
  signed:{schema:'relatte.minecraft012.signed-proposal/v0',
   proposal_json:bytes.toString('utf8'),
   crossing:hop.crossing,receipt:hop.receipt,prior_signed_method:signed}};
}
export async function createInstrument({
  game011='work/source011/signed-game-result.json',
  game010='work/source010/signed-game-result.json',
  game009='work/source009/signed-game-result.json',
  method011='work/source011/signed-method-revision-011.json',
  pack010='work/motif-minecraft-010/datapack',
  out='work/motif-minecraft-012',
}={}){
 const [a,b,c,d,e]=await Promise.all([
  readFile(game011),readFile(game010),readFile(game009),
  readFile('fixtures/riff-raft-minecraft-006/signed-005-return.bundle.json'),readFile(method011)]);
 const candidate=await composeRevised({game011:a,game010:b,game009:c,archive:d,method011:e});
 await mkdir(out,{recursive:true});
 await cp(pack010,join(out,'datapack'),{recursive:true});
 const src=candidate.proposal.lateral_source;
 const extra={
  'data/motif023/function/inject.mcfunction':`setblock ${src.x} ${src.y} ${src.z} minecraft:redstone_block\n`,
  'data/motif023/function/remove_injection.mcfunction':`setblock ${src.x} ${src.y} ${src.z} minecraft:air\n`,
  'data/motif024/function/read_revised.mcfunction':[
    'scoreboard objectives add motif_rev dummy',
    ...candidate.proposal.new_probe.flatMap(p=>[
      `scoreboard players set #rev_${p.index} motif_rev 0`,
      `execute if block ${p.x} ${p.y} ${p.z} minecraft:redstone_lamp[lit=true] run scoreboard players set #rev_${p.index} motif_rev 1`,
    ]),
  ].join('\n')+'\n',
 };
 for(const [key,body] of Object.entries(extra)){
  const path=join(out,'datapack',key);await mkdir(dirname(path),{recursive:true});
  await writeFile(path,body);
 }
 for(const [key,value] of Object.entries({
  'proposal.json':candidate.proposal,'signed-proposal.json':candidate.signed,
 }))await writeFile(join(out,key),JSON.stringify(value,null,2)+'\n');
 return {signed_proposal:candidate.signed.crossing.crossing_id,
  new_probe_stages:candidate.proposal.new_probe.map(p=>p.index),
  actual_new_game_executed:false,disposition:'R3_HOLD'};
}
