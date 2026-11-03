// Bounded cross-engine scene-state comparison. No receipt from this module confers admission.
import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
export const FORMAT='world-forge/independent-visual-observation/v0';
export const HASH='a8a7862f462a6927e1983cf299f930368a5745751695e8f4755a2c476f560966';
const FIELDS=['format','source_sha256','engine','instance','seed','engine_version','observer','observer_class','observer_unprivileged','observations','actions','artifact_digests','receiver','signature'];
const ALLOWED_ENGINES={'minecraft-java-26.1.1':'NON_OP_SEPARATE_PROCESS_PROTOCOL_CLIENT','godot-4.4.1':'FRESH_PROCESS_SERIALIZED_SCENE_READ'};
const BASE={alpha:'minecraft:moss_block',beta:'minecraft:cut_copper'};
const PHASES=['build','impact','repair'];
const ACTIONS=['BUILD','IMPACT','REPAIR'];
const isObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const exact=(x,keys)=>isObject(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const sha=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
export function validateEvidence(e){
  if(!exact(e,FIELDS))throw Error('unknown or missing evidence fields');
  if(e.format!==FORMAT||e.source_sha256!==HASH)throw Error('source fixture mismatch');
  if(!Object.hasOwn(ALLOWED_ENGINES,e.engine)||e.observer_class!==ALLOWED_ENGINES[e.engine])throw Error('observer class unsupported');
  if(!['alpha','beta'].includes(e.instance))throw Error('unknown instance');
  if(e.seed!==(e.instance==='alpha'?'381654729':'918273645'))throw Error('incorrect instance seed');
  if(e.engine_version!==(e.engine==='godot-4.4.1'?'4.4.1':'26.1.1'))throw Error('runtime version mismatch');
  if(typeof e.observer!=='string'||e.observer.length<4||e.observer_unprivileged!==true)throw Error('observer privilege/identity unverified');
  if(e.receiver!=='HOLD'||e.signature!==null)throw Error('authority escalation');
  if(JSON.stringify(e.actions)!==JSON.stringify(ACTIONS))throw Error('action/phase sequence mismatch');
  if(!Array.isArray(e.observations)||e.observations.length!==3)throw Error('must observe all phases');
  if(!Array.isArray(e.artifact_digests)||e.artifact_digests.length!==3||!e.artifact_digests.every(sha))throw Error('missing raw observation digests');
  const expected=[BASE[e.instance],'minecraft:polished_blackstone',BASE[e.instance]];
  for(let i=0;i<3;i++){
    const o=e.observations[i];
    if(!exact(o,['stage','block'])||o.stage!==PHASES[i]||o.block!==expected[i])throw Error('wrong engine-observed intermediate state: '+PHASES[i]);
  }
  return true;
}
export function compareEvidence(items){
  if(!Array.isArray(items)||items.length!==4)throw Error('need 4 engine/world receipts');
  const keys=new Set();
  for(const e of items){
    validateEvidence(e);
    const key=e.engine+'/'+e.instance;
    if(keys.has(key))throw Error('duplicate engine/world observation');
    keys.add(key);
  }
  for(const engine of Object.keys(ALLOWED_ENGINES))for(const instance of ['alpha','beta']){
    if(!keys.has(engine+'/'+instance))throw Error('missing engine/world pairing');
  }
  return {
    format:'world-forge/bounded-cross-engine-visual-parity/v0',
    source_sha256:HASH,
    observed_worlds:4,
    minecraft_non_op_protocol_observer:true,
    godot_fresh_process_scene_observer:true,
    bounded_three_stage_visual_state_parity:true,
    independent_human_witness_verified:false,
    source_native_signatures_verified:false,
    live_godot_scene_observer:false,
    inventory_cost_parity_verified:false,
    portable_skill_reproduction_verified:false,
    receiver:'HOLD',
    automatic_admission:false,
    note:'Distinct engine readers compared real Minecraft block states with Godot serialized mesh materials. Visual-state parity is NOT full procedural, source-native, social or economic authority.'
  };
}
if(process.argv[1]&&import.meta.url.endsWith(process.argv[1].replaceAll('\\','/'))&&process.argv.length===4){
  const dir=process.argv[2],out=process.argv[3],inputs=[];
  for(const engine of ['minecraft','godot'])for(const world of ['alpha','beta']){
    const root=join(dir,'world-forge-004-'+engine+'-'+world);
    const filename=engine+'-'+world+'.json';
    // upload-artifact preserves root-relative work/ paths when mixed with
    // snapshot folders outside work/. Use a fixed allowlist, never glob/guess.
    const candidates=[join(root,filename),join(root,'work',engine==='godot'?'world-forge-004':'minecraft-probe',filename)];
    const present=candidates.filter(p=>existsSync(p));
    if(present.length!==1)throw Error('expected one unambiguous engine evidence file for '+engine+'/'+world);
    inputs.push(JSON.parse(readFileSync(present[0],'utf8')));
  }
  const comparison=compareEvidence(inputs);
  writeFileSync(out,JSON.stringify(comparison,null,2)+'\n');
  console.log('WORLD_FORGE_004_COMPARE='+JSON.stringify(comparison));
}
