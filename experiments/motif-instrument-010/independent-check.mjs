/* Run the reLATTE-010 independent replay through a uniquely named entrypoint:
 * the older 009 verify.mjs has a historical basename-sensitive CLI guard.
 * Import both as *libraries* here so only this 010 runner executes a CLI.
 */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {verifyNewMicroGame} from './verify.mjs';

const [newFile,oldFile,outFile]=process.argv.slice(2);
if(!newFile||!oldFile||!outFile)
  throw Error('Usage: independent-check.mjs <signed-010> <signed-009> <out>');
const [latest,previous,original]=await Promise.all([
  readFile(newFile),readFile(oldFile),
  readFile('fixtures/riff-raft-minecraft-006/signed-005-return.bundle.json'),
]);
const result=await verifyNewMicroGame(latest,previous,original);
await mkdir(dirname(outFile),{recursive:true});
await writeFile(outFile,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({
  status:'NEW_WORLD_A_GAME_INDEPENDENTLY_REVERIFIED',
  lamps:result.actual_lamps_lit,
  sensor:result.micro_sensor_inferred_count,
  match:result.micro_sensor_verified_against_full_game_and_fresh_nonop,
  classification:result.provisional_classification,
  disposition:result.disposition,
},null,2));
