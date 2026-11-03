import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname,join} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const ancestor=resolve(root,'../world-forge-001');
const run=folder=>execFileSync(process.execPath,['src/build.mjs'],{cwd:folder,stdio:'pipe'});
let built=false;
function buildOnce(){if(!built){run(ancestor);run(root);built=true;}}

test('Minecraft repair restores the original 3x3 garden pad beneath impact (model-only)',()=>{
  buildOnce();
  const path=join(root,'dist/minecraft/data/crater/function/visual_repair_alpha_garden.mcfunction');
  const contents=readFileSync(path,'utf8');
  assert.match(contents,/^fill ~-9 ~-1 ~-8 ~-7 ~-1 ~-6 minecraft:moss_block$/m);
  assert.match(contents,/^setblock ~-8 ~ ~-7 minecraft:sea_lantern$/m);
  assert.match(contents,/no witnessed salvage or real repair/);
});

test('Godot generator keeps HUD newlines escaped in both runnable script variants',()=>{
  buildOnce();
  for(const instance of ['alpha','beta']){
    const gd=readFileSync(join(root,`dist/godot-${instance}/main.gd`),'utf8');
    assert.ok(gd.includes(`hud.text = "CRATER-SMASH-002 · ${instance}\\nWASD move`));
    assert.ok(gd.includes('\\nFICTIONAL - NOT A VERIFIED CROSS-ENGINE REPLAY"'));
    assert.ok(gd.includes('"\\nNot proof of materials, actions, or source witness."'));
  }
});
