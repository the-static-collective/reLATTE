import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCartridge, digest, project, INSTANCES, minecraftFunction, minecraftQuest, godotScript, reproduction } from './worldforge.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=resolve(root,'dist');
const c=JSON.parse(await readFile(join(root,'cartridges/jubilee-garden.v0.json'),'utf8'));
validateCartridge(c);
const sha=digest(c), scenes=Object.fromEntries(INSTANCES.map(i=>[i.id,project(c,i)]));
const report=reproduction(c);
const write=async(path,data)=>{const full=join(output,path);await mkdir(dirname(full),{recursive:true});await writeFile(full,data,'utf8');};
const blob={cartridge:c,scenes,report,sha256:sha};
const html=(await readFile(join(root,'src/viewer-template.html'),'utf8')).replace('/*__BUNDLE__*/',JSON.stringify(blob).replace(/</g,'\\u003c'));
await write('index.html',html);
await write('portable-scene-cartridge.json',JSON.stringify(c,null,2)+'\n');
await write('model-reproduction-report.json',JSON.stringify(report,null,2)+'\n');
await write('minecraft/pack.mcmeta',JSON.stringify({pack:{description:'World Forge 001 / Minecraft Java 26.1.1 ONLY',min_format:[101,1],max_format:[101,1]}},null,2)+'\n');
for(const i of INSTANCES){await write(`minecraft/data/worldforge/function/build_${i.id}.mcfunction`,minecraftFunction(scenes[i.id]));}
for(const [fn,commands] of Object.entries(minecraftQuest(c)))await write(`minecraft/data/worldforge/function/${fn}`,commands);
for(const i of INSTANCES){
  await write(`godot-${i.id}/project.godot`,`config_version=5\n\n[application]\nconfig/name="World Forge 001 · ${i.id}"\nrun/main_scene="res://main.tscn"\n\n[rendering]\nrenderer/rendering_method="gl_compatibility"\nrenderer/rendering_method.mobile="gl_compatibility"\n`);
  await write(`godot-${i.id}/main.tscn`,`[gd_scene load_steps=2 format=3]\n\n[ext_resource type="Script" path="res://main.gd" id="1"]\n\n[node name="WorldForge" type="Node3D"]\nscript = ExtResource("1")\n`);
  await write(`godot-${i.id}/main.gd`,godotScript(c,scenes[i.id]));
}
await write('README.txt',`WORLD-FORGE-001 / source SHA-256 ${sha}\n\n1. DOUBLE-CLICK dist/index.html — local browser, playable 7-station simulation. No server required.\n2. Minecraft Java 26.1.1: copy dist/minecraft folder to YOUR_NEW_WORLD/datapacks/world-forge-001/ (pack.mcmeta must be at its root). Load fresh flat Creative world with cheats, /reload, /function worldforge:install, /function worldforge:build_alpha (or build_beta), /function worldforge:start, then /function worldforge:step/1_garden, /function worldforge:step/2_forge etc. All commands are operator-issued. BUILD OVERWRITES 3x3 PADS. Use new disposable world.\n3. Godot 4.x: open dist/godot-alpha or dist/godot-beta in Godot Editor and Play. WASD/arrows move, E visits next station near its pedestal, R restarts. Godot runtime has not been independently exercised here.\n4. model-reproduction-report.json checks the two *models*, not two real game worlds. Zero real-world authority or external witness.\n`);
console.log(`Built World Forge 001: ${sha}, ${c.stations.length} stations, 2 instances, 3 surfaces`);
