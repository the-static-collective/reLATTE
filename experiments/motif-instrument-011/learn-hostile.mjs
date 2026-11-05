/* reLATTE-011 → MOTIF-023. Native re-verification is performed *before*
 * any method revision, and a signed research packet is not a new game run.
 */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {verifyHostileGame} from './verify-hostile.mjs';
import {generateP256KeyPair,verifyCrossingEnvelope,verifyReceipt} from '../../src/protocol.ts';
import {makeObservation,makePolyglotHop,verifyHopBinding} from '../polyglot-crossing-001/common.ts';
const hash=x=>createHash('sha256').update(x).digest('hex');
const f=(ok,s)=>{if(!ok)throw Error('MINECRAFT_011_METHOD_'+s)};
export async function learnFromHostileGame({bytes011,bytes010,bytes009,archive,motifRoot}){
 f([bytes011,bytes010,bytes009,archive].every(Buffer.isBuffer)&&
  typeof motifRoot==='string'&&motifRoot.length>0,'VERIFIED_INPUT_REQUIRED');
 const verified=await verifyHostileGame(bytes011,bytes010,bytes009,archive);
 const raw=JSON.parse(bytes011.toString('utf8'));
 const trace=JSON.parse(raw.packet_json).trace;
 const engine=await import(pathToFileURL(join(resolve(motifRoot),
  'experiments/023/method_falsifier.mjs')).href);
 const revision=engine.diagnoseMethod(verified,trace);
 const record={
  schema:'relatte.minecraft011.method-revision/v0',
  native_verified_source:verified,
  method_decision:revision,
  source_game_crossing:verified.game_011_crossing,
  observer:'ci-record-reader-not-a-human',
  original_two_lamp_method_not_silently_replaced:true,
  next_game_execution:false,
  role_or_canon_admission:false,
  preservation:'UNRESOLVED_R3_HOLD',
 };
 const bytes=Buffer.from(JSON.stringify(record));
 const observation=makeObservation('composition-instance',
  'motif023-new-method:'+hash(bytes),bytes,
  'application/vnd.relatte.minecraft011-method-revision+json',
  {research_not_fresh_game_observation:true,game_only:true});
 const hop=await makePolyglotHop({observation,
  signer:await generateP256KeyPair(),receiver:await generateP256KeyPair(),
  parent_crossing_id:verified.game_011_crossing,disposition:'R3_HOLD',
  hop_index:65});
 verifyHopBinding(hop,bytes);
 f(await verifyCrossingEnvelope(hop.crossing)&&
  await verifyReceipt(hop.receipt)&&hop.receipt.kind==='R3_HOLD' &&
  hop.crossing.parents?.[0]===verified.game_011_crossing,
  'RESEARCH_RETURN_NOT_BOUND');
 return {
  schema:'relatte.minecraft011-signed-method-revision/v0',
  packet_json:bytes.toString('utf8'),
  crossing:hop.crossing,receipt:hop.receipt,
  disposition:'R3_HOLD',
  real_game_actuation:false,
  model_history_rewritten:false,
  method_status:revision.status,
  proposed_stage_indexes:revision.new_probe_indexes??null,
 };
}
if(process.argv[1]?.endsWith('/learn-hostile.mjs')){
 const [newPath,oldPath,priorPath,motifRoot,out]=process.argv.slice(2);
 if(!newPath||!oldPath||!priorPath||!motifRoot||!out)
  throw Error('Usage: learn-hostile.mjs signed011 signed010 signed009 motif-checkout out');
 const raw=await Promise.all([readFile(newPath),readFile(oldPath),readFile(priorPath),
  readFile('fixtures/riff-raft-minecraft-006/signed-005-return.bundle.json')]);
 const result=await learnFromHostileGame({
  bytes011:raw[0],bytes010:raw[1],bytes009:raw[2],archive:raw[3],motifRoot});
 await mkdir(dirname(out),{recursive:true});
 await writeFile(out,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({method_status:result.method_status,
  revised_probe:result.proposed_stage_indexes,disposition:result.disposition,
  next_game_actuation:false},null,2));
}
