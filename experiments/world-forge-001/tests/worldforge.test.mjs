import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { validateCartridge, digest, project, INSTANCES, minecraftFunction, minecraftQuest, godotScript, reproduction, MATERIALS } from '../src/worldforge.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const original=JSON.parse(await readFile(join(root,'cartridges/jubilee-garden.v0.json'),'utf8'));
const clone=()=>structuredClone(original);
test('valid author-declared fiction, bounded stations and original license',()=>{
  assert.equal(validateCartridge(clone()).stations.length,7);
  assert.equal(original.evidence.admission,'HOLD');
});
test('deterministic content hash despite object key ordering',()=>{
  const c=clone();c.stations[0]={...c.stations[0]};
  assert.equal(digest(c),digest(clone()));
  assert.match(digest(c),/^[a-f0-9]{64}$/);
});
test('mutation of semantic message changes source digest',()=>{
  const c=clone();c.stations[0].message+=' extra';assert.notEqual(digest(c),digest(original));
});
test('unknown fields rejected, no silent authority annex',()=>{
  const c=clone();c.authority='AUTO_ADMIT';assert.throws(()=>validateCartridge(c),/unknown/);
});
test('automatic admission and false external witness rejected',()=>{
  for(const [key,value] of [['admission','ADMIT'],['class','ACTUAL_VERIFIED']]){
    const c=clone();c.evidence[key]=value;assert.throws(()=>validateCartridge(c),/fictional/);
  }
  const c=clone();c.evidence.claimed_external_observation=true;assert.throws(()=>validateCartridge(c),/fictional/);
});
test('operator-authored non-CC0 scene refused as this fixture class',()=>{
  const c=clone();c.evidence.license='unknown';assert.throws(()=>validateCartridge(c),/fictional/);
});
test('unknown source fields, extra station fields rejected',()=>{
  const c=clone();c.evidence.signature='made-up';assert.throws(()=>validateCartridge(c),/unknown/);
  const d=clone();d.stations[0].command='/op @a';assert.throws(()=>validateCartridge(d),/unknown/);
});
test('material cannot inject Minecraft commands',()=>{
  const c=clone();c.stations[0].material='stone; /summon tnt';assert.throws(()=>validateCartridge(c),/unsupported/);
});
test('duplicate ids, overlap, off-grid and wrong quest order rejected',()=>{
  let c=clone();c.stations[1].id=c.stations[0].id;assert.throws(()=>validateCartridge(c),/collision/);
  c=clone();c.stations[1].x=c.stations[0].x;c.stations[1].z=c.stations[0].z;assert.throws(()=>validateCartridge(c),/overlap/);
  c=clone();c.stations[0].x=99;assert.throws(()=>validateCartridge(c),/bounded/);
  c=clone();c.stations[0].verb='ADMIT';assert.throws(()=>validateCartridge(c),/order/);
});
test('no missing step permitted',()=>{
  const c=clone();c.stations.pop();assert.throws(()=>validateCartridge(c),/seven/);
});
test('two distinct demo coordinate systems preserve semantic pattern',()=>{
  const a=project(original,INSTANCES[0]),b=project(original,INSTANCES[1]);
  assert.equal(a.source_sha256,b.source_sha256);
  assert.notDeepEqual(a.stations.map(s=>[s.x,s.z]),b.stations.map(s=>[s.x,s.z]));
  assert.deepEqual(a.stations.map(s=>[s.id,s.verb,s.message]),b.stations.map(s=>[s.id,s.verb,s.message]));
  assert.equal(a.evidence_class,'SYNTHETIC_RENDER');
  assert.throws(()=>project(original,{...INSTANCES[0]}),/unrecognized/);
});
test('Minecraft adapter emits bounded creative platform commands only',()=>{
  const text=minecraftFunction(project(original,INSTANCES[0]));
  const commands=text.split('\n').filter(line=>line && !line.startsWith('#'));
  assert.equal(commands.filter(line=>line.startsWith('fill ')).length,7);
  assert.equal(commands.filter(line=>line.startsWith('setblock ')).length,7);
  assert.equal(commands.filter(line=>line.startsWith('tellraw ')).length,1);
  assert.ok(commands.every(line=>/^(fill|setblock|tellraw) /.test(line)));
  for(const m of Object.values(MATERIALS))assert.ok(m.minecraft.startsWith('minecraft:'));
});
test('Minecraft quest includes ordered, stage-gated actions, default no external effect',()=>{
  const q=minecraftQuest(original);
  assert.equal(Object.keys(q).length,17);
  for(let i=0;i<7;i++){
    const id=`${i+1}_${original.stations[i].id}`;
    assert.match(q[`step/${id}.mcfunction`],new RegExp(`matches ${i} run function`));
    assert.match(q[`effect/${id}.mcfunction`],new RegExp(`wf_stage ${i+1}`));
    assert.doesNotMatch(q[`effect/${id}.mcfunction`],/give|summon|execute as @e/);
  }
});
test('generated Godot script contains walk, proximity, and local quest controls',()=>{
  const script=godotScript(original,project(original,INSTANCES[0]));
  assert.match(script,/extends Node3D/);
  assert.match(script,/avatar.position.distance_to\(target\)/);
  assert.match(script,/KEY_E/);
  assert.match(script,/JSON.parse_string/);
  assert.match(script,/WORLD-FORGE-001/);
  assert.ok(!script.includes(' + "\n" + '),'cannot split a GDScript string with a literal newline');
});
test('model comparison explicitly refuses authority and real-engine claims',()=>{
  const r=reproduction(original);
  assert.equal(r.disposition,'HOLD');
  assert.equal(r.original_verified,false);
  assert.equal(r.preserved_semantics,true);
  assert.equal(r.distinctive_layouts,true);
  assert.ok(r.does_not_claim.includes('Minecraft execution'));
  assert.ok(r.does_not_claim.includes('human consent'));
});
test('a synthetic model report cannot imply imported source signatures',()=>{
  const c=clone();c.evidence.class='SIGNED_MINECRAFT';assert.throws(()=>reproduction(c),/fictional/);
});
