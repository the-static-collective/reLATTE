// Official vanilla Java 26.1.1 operator-driven smoke test.
// This deliberately is NOT an independent Minecraft observer or native reLATTE witness.
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {Rcon} from 'rcon-client';
import {digest} from '../../world-forge-001/src/worldforge.mjs';
const design=JSON.parse(readFileSync(new URL('../../world-forge-001/cartridges/jubilee-garden.v0.json',import.meta.url)));
const WORLD=process.env.WF_WORLD;
const station=process.env.WF_STATION;
const x=Number(process.env.WF_X),z=Number(process.env.WF_Z),y=80;
const base=process.env.WF_BASE;
const expectedHash='a8a7862f462a6927e1983cf299f930368a5745751695e8f4755a2c476f560966';
if(!['alpha','beta'].includes(WORLD)||!['garden','forge'].includes(station)||!Number.isInteger(x)||!Number.isInteger(z)||!/^minecraft:[a-z_]+$/.test(base))throw Error('bad probe fixture');
assert.equal(digest(design),expectedHash);
const meta=JSON.parse(readFileSync('work/minecraft-probe/server-version.json'));
assert.equal(meta.id,'26.1.1');
const rcon=await Rcon.connect({host:'127.0.0.1',port:25575,password:process.env.WF_RCON_PASSWORD});
const events=[];
async function command(text){const out=await rcon.send(text);events.push({role:'OPERATOR_RCON',command:text,response:String(out)});return String(out);}
async function verifyState(stage,material){
  // RCON server console is a privileged read; cannot count as a non-OP independent observer.
  await command(`execute store result score #${stage} wf_probe if block ${x} ${y-1} ${z} ${material}`);
  const response=await command(`scoreboard players get #${stage} wf_probe`);
  if(!response.includes(`#${stage} has 1 [wf_probe]`))throw Error(`engine observed wrong block at ${stage} (${x},${y-1},${z}); ${response}`);
  return {stage,position:[x,y-1,z],expected_block:material,query_response:response,proven_by:'OPERATOR_RCON_QUERY_NOT_INDEPENDENT'};
}
try{
  await command('scoreboard objectives add wf_probe dummy');
  const enabled=await command('datapack list enabled');
  if(!enabled.includes('crater-smash-002'))throw Error('crater-smash-002 datapack not enabled: '+enabled);
  await command(`execute positioned 0 ${y} 0 run function worldforge:build_${WORLD}`);
  const before=await verifyState('built',base);
  await command(`execute positioned 0 ${y} 0 run function crater:impact_${WORLD}`);
  const afterImpact=await verifyState('impact','minecraft:polished_blackstone');
  await command(`execute positioned 0 ${y} 0 run function crater:visual_repair_${WORLD}_${station}`);
  const afterRepair=await verifyState('restored',base);
  const result={
    format:'world-forge/official-minecraft-runtime-probe/v0',
    version:meta.id,server_sha1:meta.server_sha1,
    source_sha256:expectedHash,instance:WORLD,seed:process.env.WF_SEED,station,
    evidence_class:'AUTHOR_OPERATOR_RCON_CI',engine_runtime_executed:true,
    observed:[before,afterImpact,afterRepair],action_trace:events,
    independent_non_op_observer:false,native_relattte_signature_verified:false,
    procedural_transfer_verified:false,receiver:'HOLD',automatic_admission:false,
    does_not_claim:['independent observation','Minecraft Godot parity','physical impact','receiver consent']
  };
  writeFileSync('work/minecraft-probe/runtime-probe.json',JSON.stringify(result,null,2)+'\n');
  console.log('WORLD_FORGE_MINECRAFT_PROBE='+JSON.stringify({world:WORLD,station,stages:result.observed.map(o=>o.stage),version:meta.id,source_sha256:expectedHash,receiver:'HOLD',independent_non_op_observer:false}));
} finally {rcon.end();}
