import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {verifyCrossingEnvelope,verifyReceipt} from '../../src/protocol.ts';
import {verifyNewMicroGame} from '../motif-instrument-010/verify.mjs';
import {SPEC_SCHEMA} from './compose.mjs';
import {RESULT_SCHEMA,BUNDLE_SCHEMA,checkHostileTrace} from './trace-verifier.mjs';
const f=(x,w)=>{if(!x)throw Error('MINECRAFT_011_REPLAY_'+w)};
const sha=x=>createHash('sha256').update(x).digest('hex');
export async function verifyHostileGame(bytes011,bytes010,bytes009,archive){
 f([bytes011,bytes010,bytes009,archive].every(Buffer.isBuffer),'EXACT_RAW_SIGNED_SOURCES_REQUIRED');
 const prior=await verifyNewMicroGame(bytes010,bytes009,archive);
 const signed=JSON.parse(bytes011.toString('utf8'));
 f(signed.schema===BUNDLE_SCHEMA&&signed.receiver_disposition==='R3_HOLD'&&
   signed.physical_actuation===false,'UNTRUSTED_011_CARRIER');
 const child=signed.signed_instrument,base=signed.base_010_signed_instrument;
 f(child?.schema==='relatte.minecraft011-signed-proposal/v0'&&
   await verifyCrossingEnvelope(child.crossing)&&await verifyReceipt(child.receipt)&&
   child.receipt.kind==='R3_HOLD'&&
   child.crossing.parents?.length===1&&
   child.crossing.parents[0]===prior.signed_game_crossing&&
   child.crossing.payload_refs?.[0]?.address==='sha256:'+sha(Buffer.from(child.proposal_json)),
   'INVALID_HOSTILE_INSTRUMENT_OR_PARENT');
 f(base?.schema==='relatte.minecraft010-signed-proposal/v0'&&
   await verifyCrossingEnvelope(base.crossing)&&await verifyReceipt(base.receipt)&&
   base.receipt.kind==='R3_HOLD'&&
   base.crossing.payload_refs?.[0]?.address==='sha256:'+sha(Buffer.from(base.proposal_json))&&
   base.crossing.parents?.[0]===prior.source_009_crossing,
   'BASE_010_NOT_REVERIFIED');
 const proposal=JSON.parse(child.proposal_json),baseProposal=JSON.parse(base.proposal_json);
 f(proposal.schema===SPEC_SCHEMA&&
   proposal.source_game010_crossing===prior.signed_game_crossing&&
   proposal.signed_source010_sha256===sha(bytes010)&&
   proposal.source_original009_crossing===prior.source_009_crossing&&
   proposal.disposition==='R3_HOLD'&&proposal.automatic_execution===false&&
   proposal.physical_effect===false,'011_INSTRUMENT_NOT_BOUND');
 f(await verifyCrossingEnvelope(signed.crossing)&&await verifyReceipt(signed.receipt)&&
   signed.receipt.kind==='R3_HOLD'&&
   signed.receipt.crossing_id===signed.crossing.crossing_id &&
   signed.crossing.parents?.length===1&&
   signed.crossing.parents[0]===child.crossing.crossing_id&&
   signed.crossing.payload_refs?.[0]?.address==='sha256:'+sha(Buffer.from(signed.packet_json)),
   'NEW_011_SIGNATURE_OR_GAME_PAYLOAD_INVALID');
 const packet=JSON.parse(signed.packet_json);
 f(packet.schema===RESULT_SCHEMA &&
   packet.original_010_crossing===prior.signed_game_crossing&&
   packet.original_009_crossing===prior.source_009_crossing &&
   packet.source_010_signed_bytes_sha256===sha(bytes010)&&
   packet.instrument_crossing===child.crossing.crossing_id &&
   packet.parent_010_instrument===base.crossing.crossing_id &&
   packet.origin_instrument_sha256===sha(Buffer.from(base.proposal_json)) &&
   packet.game_world==='A'&&packet.game_seed==='381654729'&&
   packet.game_version==='26.1.1' &&
   packet.receiver_disposition==='R3_HOLD'&&
   packet.owner_admission===false&&packet.physical_world_effect===false &&
   packet.auto_next_experiment===false,
   'HOSTILE_RESULT_PROVENANCE_CHANGED');
 const trace=packet.trace;
 f(trace.hostile_proposal_crossing===child.crossing.crossing_id,
   'HOSTILE_TRACE_INSTRUMENT_CHANGED');
 const result=checkHostileTrace(baseProposal,proposal,trace,{
   id:packet.game_version,server_sha1:packet.server_sha1});
 f(result.faultCount===packet.actual_observed_count&&
   result.inferredCount===packet.low_cost_probe_inferred_count &&
   result.status===packet.full_census_audited_status &&
   result.original_micro_method_unsafe_if_nonprefix===packet.original_method_falsified_in_game,
   'HOSTILE_GAME_CONCLUSION_NOT_DERIVED_FROM_RAW');
 return {
  schema:'relatte.minecraft-011-independent-return/v0',
  all_source_signatures_verified:true,
  game_world:'A',fault_x:-28,seed:'381654729',
  source_009_crossing:prior.source_009_crossing,
  source_010_crossing:prior.signed_game_crossing,
  signed_proposal_crossing:child.crossing.crossing_id,
  game_011_crossing:signed.crossing.crossing_id,
  game_011_receipt:signed.receipt.receipt_id,
  current_lit_lamps:result.faultCount,
  old_micro_inferred_lamps:result.inferredCount,
  prefix_is_broken:result.original_micro_method_unsafe_if_nonprefix,
  nonoperator_nine_lamp_agreement:true,
  independent_second_runner_recomputed_all_game_states:true,
  counterexample_conclusion:result.source_conclusion,
  actual_fault_bits:trace.states.fault.server.map(x=>x.lit),
  disposition:'R3_HOLD',owner_admission:false,
  physical_environment_effect:false,
  new_game_automatically_authorized:false,
 };
}
if(process.argv[1]?.endsWith('/verify-hostile.mjs')){
 const [newFile,oldFile,old009File,outFile]=process.argv.slice(2);
 if(!newFile||!oldFile||!old009File||!outFile)throw Error('USAGE: verify-hostile.mjs 011 010 009 output');
 const all=await Promise.all([readFile(newFile),readFile(oldFile),readFile(old009File),
 readFile('fixtures/riff-raft-minecraft-006/signed-005-return.bundle.json')]);
 const result=await verifyHostileGame(...all);
 await mkdir(dirname(outFile),{recursive:true});
 await writeFile(outFile,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({status:'REVERIFIED_HOSTILE_GAME',observed:result.current_lit_lamps,
  micro:result.old_micro_inferred_lamps,prefix_broken:result.prefix_is_broken,
  conclusion:result.counterexample_conclusion,disposition:result.disposition},null,2));
}
