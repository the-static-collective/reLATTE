import { mkdir,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { prove } from './src/proofs.mjs';
const outputDir=resolve(process.env.SUPERSPACE_OUT??'work/interface-superspace-001');
await mkdir(outputDir,{recursive:true});
const result=await prove({ donorRoot:resolve(process.env.TRANCHNOSE_ROOT??'../tranchNOSE'),discoveryRoot:resolve(process.env.GHOT_ROOT??'../GHoT'),outputDir,minecraft:process.argv.includes('--minecraft') });
await writeFile(resolve(outputDir,'proofs.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({registry:result.registry_digest,executions:result.records.map(r=>({route:r.route_id,result:r.result,interfaces:r.actual_interfaces_traversed.length})),vanilla:result.vanilla_observed,unprompted_route:result.unprompted_route,evidence:resolve(outputDir,'proofs.json')},null,2));
