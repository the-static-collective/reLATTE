/* reLATTE 009 → MOTIF 021: interpretation follows independent native
 * verification in the SAME process. Never accept an unauthenticated
 * client-supplied "verified" boolean as game evidence.
 */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {verifyObservedGameBundle} from './verify.mjs';
import {generateP256KeyPair,verifyCrossingEnvelope,verifyReceipt}
  from '../../src/protocol.ts';
import {makeObservation,makePolyglotHop,verifyHopBinding}
  from '../polyglot-crossing-001/common.ts';

const sha=x=>createHash('sha256').update(x).digest('hex');
const original='fixtures/riff-raft-minecraft-006/signed-005-return.bundle.json';
export async function learnFromSignedGame({
  signedGameBytes,
  archiveBytes,
  motifRoot,
}) {
  if(!motifRoot)throw Error('MOTIF_021_ROOT_REQUIRED');
  const receipt=await verifyObservedGameBundle(signedGameBytes,archiveBytes);
  const file=join(resolve(motifRoot),'experiments/021/learn_from_game.mjs');
  const source=join(resolve(motifRoot),'experiments/020/seeded_minecraft.json');
  const algorithm=await import(pathToFileURL(file).href);
  const seed=JSON.parse(await readFile(source,'utf8'));
  const interpreted=algorithm.interpretVerifiedMinecraftReturn(seed,receipt);
  if(interpreted.game_evidence_claimed_by_verified_relatte_receipt!==receipt.new_game_crossing ||
     interpreted.automatic_world_actions!==0 ||
     interpreted.admitted_authority!==false ||
     interpreted.stored_to_understory!==false)
    throw Error('MOTIF_021_INVALID_INTERPRETATION_AUTHORITY');
  const record={
    schema:'relatte.motif021.research-return/v0',
    independently_verified_game_receipt:receipt,
    interpreter:interpreted,
    original_game_results_preserved:true,
    result_class:'post-observation-research-interpretation-not-game-observation',
    private_memento_memory_written:false,
    descendant_acts_authorized:false,
    physical_effect:false,
    receiver_disposition:'R3_HOLD',
  };
  const raw=Buffer.from(JSON.stringify(record));
  const observation=makeObservation('composition-instance',
    'motif021:interpret:'+sha(raw),raw,
    'application/vnd.relatte.motif021-research-return+json',{
      originating_minecraft_source_verified:true,
      interpretation_is_not_game_evidence:true,
      operator_approval_still_required:true,
    });
  const hop=await makePolyglotHop({
    observation,
    signer:await generateP256KeyPair(),
    receiver:await generateP256KeyPair(),
    parent_crossing_id:receipt.new_game_crossing,
    disposition:'R3_HOLD',hop_index:60,
  });
  verifyHopBinding(hop,raw);
  if(!await verifyCrossingEnvelope(hop.crossing)||
     !await verifyReceipt(hop.receipt)||
     hop.receipt.kind!=='R3_HOLD')throw Error('MOTIF_021_RETURN_NOT_SIGNED');
  return {
    schema:'relatte.motif021.signed-research-return/v0',
    packet_json:raw.toString('utf8'),
    crossing:hop.crossing,receipt:hop.receipt,
    result:{
      observed_fault_lamps:receipt.observed_fault_lit_count,
      status:interpreted.status,
      provisional_best_model:interpreted.best_provisional_model??null,
      next_measurement_status:interpreted.next_measurement?.status??null,
      next_question:interpreted.question_if_hold??interpreted.next_question??null,
      game_observation_source_checked:true,
      auto_continue:false,
      disposition:'R3_HOLD',
    },
  };
}

if(process.argv[1]?.endsWith('/learn.mjs')){
  const [gameFile,output]=process.argv.slice(2);
  const motifRoot=process.env.MOTIF_ROOT;
  if(!gameFile||!output||!motifRoot)
    throw Error('Usage: MOTIF_ROOT=<checkout> node learn.mjs <signed-game-result> <out>');
  const [game,source]=await Promise.all([readFile(gameFile),readFile(original)]);
  const result=await learnFromSignedGame({
    signedGameBytes:game,archiveBytes:source,motifRoot,
  });
  await mkdir(dirname(output),{recursive:true});
  await writeFile(output,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result.result,null,2));
}
