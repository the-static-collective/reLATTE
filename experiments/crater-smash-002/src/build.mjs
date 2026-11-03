import {readFile, writeFile, mkdir, cp} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateCartridge,digest,project,INSTANCES,minecraftFunction,MATERIALS} from '../../world-forge-001/src/worldforge.mjs';
import {IMPACTS,damageAt,CRATER_FORMAT,freshWorld,strike,summary} from './crater-core.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const original=resolve(root,'../world-forge-001');
const output=join(root,'dist');
const design=JSON.parse(await readFile(join(original,'cartridges/jubilee-garden.v0.json'),'utf8'));
validateCartridge(design);const sha=digest(design);
const scenes=Object.fromEntries(INSTANCES.map(i=>[i.id,project(design,i)]));
const write=async(path,txt)=>{const full=join(output,path);await mkdir(dirname(full),{recursive:true});await writeFile(full,txt,'utf8');};
const bundle={source_sha256:sha,scenes,impacts:IMPACTS,format:CRATER_FORMAT};
const core=(await readFile(join(root,'src/crater-core.mjs'),'utf8')).replace(/^export /gm,'');
const template=await readFile(join(root,'src/viewer-template.html'),'utf8');
const html=template.replace('__BUNDLE__',JSON.stringify(bundle).replace(/</g,'\\u003c')).replace('__CRATER_CORE__',core);
await write('CRATER-SMASH-002-PLAY.html',html);
await write('crater-event-manifest.json',JSON.stringify({format:CRATER_FORMAT,design_source_sha256:sha,
  evidence_class:'FICTIONAL_DESIGN',source:'WORLD-FORGE-001 (original, not external source native witness)',
  impact_instances:IMPACTS,default_receiver_disposition:'HOLD',automatic_admission:false,
  target_execution_verified:false,minecraft_execution_verified:false,godot_execution_verified:false},null,2)+'\n');
await write('simulation-compare.json',JSON.stringify({format:'world-forge/crater-model-comparison/v0',source_sha256:sha,
  scenarios:Object.fromEntries(Object.entries(scenes).map(([id,scene])=>[id,summary(strike(freshWorld(scene)).state)])),
  evidence_class:'SYNTHETIC_MODEL_CHECK',disposition:'HOLD',
  claims:['two deterministic impacts on the same source design','different damage patterns'],
  does_not_claim:['two independently witnessed real Minecraft worlds','Minecraft/Godot behavior parity','receiver permission']},null,2)+'\n');
await mkdir(join(output,'minecraft'),{recursive:true});
await cp(join(original,'dist/minecraft'),join(output,'minecraft'),{recursive:true,force:true});
await write('minecraft/pack.mcmeta',JSON.stringify({pack:{description:'CRATER-SMASH-002 + World Forge 001 · generated scene only · Java 26.1.1 specific',min_format:[101,1],max_format:[101,1]}},null,2)+'\n');
const mcoord=n=>n<0?'~'+n:n===0?'~':'~'+n;
function makeCraterFunc(scene){const imp=IMPACTS[scene.world_instance],out=[
  '# CRATER-SMASH-002: stylized impact SCAR, NOT a terrain-deleting crater.',
  '# Use ONLY in a fresh disposable flat creative world; all relative to SAME anchor.',
  '# Explicit operator command; no observation or salvage is verified.',
  'tellraw @s {"text":"CRATER-SMASH MODEL IMPACT: fictional damage visualization only.","color":"gold"}' ];
  const r=Math.ceil(imp.radius);
  for(let z=-r-2;z<=r+2;z++)for(let x=-r-2;x<=r+2;x++){
    const d=Math.hypot(x,z),i=imp;
    if(d>i.radius*1.15)continue;
    // Sparse deterministic dots at outer ring, solid stylized scar inside.
    if(d>i.radius&&((x*19+z*11+97)%3!==0))continue;
    const block=d<i.radius*.38?'minecraft:polished_blackstone':d<i.radius*.78?'minecraft:basalt':d<=i.radius?'minecraft:tuff':'minecraft:magma_block';
    out.push(`setblock ${mcoord(x+i.x)} ~-1 ${mcoord(z+i.z)} ${block}`);
  }
  out.push(`tellraw @s {"text":"Simulated impact for ${scene.world_instance.toUpperCase()}: origin (${imp.x}, ${imp.z}), radius ${imp.radius}. Rebuild pads with /function worldforge:build_${scene.world_instance}. No witnessed game execution.","color":"yellow"}`);
  return out.join('\n')+'\n';
}
for(const [id,scene] of Object.entries(scenes)){
  await write(`minecraft/data/crater/function/impact_${id}.mcfunction`,makeCraterFunc(scene));
  const statuses=scene.stations.map(s=>({id:s.id,status:damageAt(s.x,s.z,IMPACTS[id]).condition}));
  for(const s of statuses){
    const station=scene.stations.find(x=>x.id===s.id);
    const block=MATERIALS[station.material].minecraft;
    await write(`minecraft/data/crater/function/visual_repair_${id}_${s.id}.mcfunction`,
      `# Stage-only visual repair; restores a bounded 3x3 station pad, NOT crater terrain.\n# No inventory, consent, or provenance validation. Use the SAME world anchor for all commands.\nfill ${mcoord(station.x-1)} ~-1 ${mcoord(station.z-1)} ${mcoord(station.x+1)} ~-1 ${mcoord(station.z+1)} ${block}\nsetblock ${mcoord(station.x)} ~ ${mcoord(station.z)} minecraft:sea_lantern\ntellraw @s {"text":"${s.id} station pad visually restored (${id}); no witnessed salvage or real repair.","color":"aqua"}\n`);
  }
  await write(`godot-${id}/project.godot`,`config_version=5\n\n[application]\nconfig/name="CRATER SMASH 002 · ${id}"\nrun/main_scene="res://main.tscn"\n\n[rendering]\nrenderer/rendering_method="gl_compatibility"\nrenderer/rendering_method.mobile="gl_compatibility"\n`);
  await write(`godot-${id}/main.tscn`,`[gd_scene load_steps=2 format=3]\n\n[ext_resource type="Script" path="res://main.gd" id="1"]\n\n[node name="Crater" type="Node3D"]\nscript = ExtResource("1")\n`);
  await write(`godot-${id}/main.gd`,godotScript(scene));
}
await write('README.txt',`CRATER-SMASH-002 | WORLD-FORGE companion\n\nMODEL SOURCE SHA-256 ${sha}\n\nDouble-click CRATER-SMASH-002-PLAY.html for the full offline browser game.\n\nFictional game: click CRATER SMASH; scavenge supplies from stations; repair damage; FORGE candidate from one world; switch to the other world; strike it; test candidate READ-ONLY. Export receipts and divergence report. REFUSE blocks rehearsal. No human permission or automatic admission is inferred.\n\nMinecraft Java 26.1.1 generated demo: install contents of minecraft/ into a NEW disposable flat Creative world datapacks/crater-smash-002/. Run /reload, /function worldforge:build_alpha followed by /function crater:impact_alpha from ONE ANCHOR position. These functions OVERWRITE blocks at and around your chosen stage. They are only stylized physical pads/scars, not actual terrain deformation or executed-salvage logic. Same for beta (new world). Engine test not yet performed.\n\nGodot 4.x generated view: open godot-alpha or godot-beta in the editor and Play. Move with WASD/arrows; I applies modeled impact, E inspects/restores a nearby station in a visual-only rehearsal. The browser game is the only source here for bounded resource costs and crossing comparison. Godot runtime has not yet been exercised.\n\nNOT supplied: independent signatures, source-native Minecraft evidence import, cross-engine replay proof, receiver admission, or real-world receipts.\n`);
console.log(JSON.stringify({built:true,sha,impact_stats:Object.fromEntries(Object.entries(scenes).map(([id,sc])=>[id,summary(strike(freshWorld(sc)).state)]))}));

function godotScript(scene){
  const stations=scene.stations.map(s=>({...s,condition:damageAt(s.x,s.z,IMPACTS[scene.world_instance]).condition}));
  const data=JSON.stringify({impact:IMPACTS[scene.world_instance],stations});
  const escaped=JSON.stringify(data);
  return `extends Node3D\n# CRATER-SMASH-002: FICTIONAL visualization only. Does not execute browser resource or crossing rules.\nconst CONFIG_JSON = ${escaped}\nvar config = {}\nvar struck = false\nvar avatar: MeshInstance3D\nvar hud: Label\nvar stations = []\nvar pads = []\nvar healed = {}\n\nfunc _ready():\n    config = JSON.parse_string(CONFIG_JSON)\n    stations = config["stations"]\n    var floor_node = MeshInstance3D.new()\n    var floor_mesh = BoxMesh.new()\n    floor_mesh.size = Vector3(92, 0.5, 92)\n    floor_node.mesh = floor_mesh\n    floor_node.position.y = -2.1\n    var ground = StandardMaterial3D.new()\n    ground.albedo_color = Color(0.08,0.13,0.16)\n    floor_node.material_override = ground\n    add_child(floor_node)\n    for s in stations:\n        var box = BoxMesh.new()\n        box.size = Vector3(3.4,1.0,3.4)\n        var pad = MeshInstance3D.new()\n        pad.mesh = box\n        pad.position = Vector3(float(s["x"])*2.0,0.5,float(s["z"])*2.0)\n        pad.material_override = make_material(Color(0.3,0.7,0.53))\n        add_child(pad)\n        pads.append(pad)\n    avatar = MeshInstance3D.new()\n    avatar.mesh = SphereMesh.new()\n    avatar.position = Vector3(float(stations[0]["x"])*2.0,1.5,float(stations[0]["z"])*2.0)\n    avatar.material_override = make_material(Color(0.96,0.94,0.88))\n    add_child(avatar)\n    var camera = Camera3D.new()\n    camera.position = Vector3(0,49,53)\n    camera.projection = Camera3D.PROJECTION_ORTHOGONAL\n    camera.size = 86.0\n    add_child(camera)\n    camera.look_at(Vector3.ZERO)\n    camera.current = true\n    var sun = DirectionalLight3D.new()\n    sun.rotation_degrees = Vector3(-55,-20,0)\n    add_child(sun)\n    var overlay = CanvasLayer.new()\n    add_child(overlay)\n    hud = Label.new()\n    hud.position = Vector2(20,20)\n    hud.add_theme_font_size_override("font_size",19)\n    overlay.add_child(hud)\n    hud.text = "CRATER-SMASH-002 · ${scene.world_instance}\\nWASD move · I impact · E visual repair near station\\nFICTIONAL - NOT A VERIFIED CROSS-ENGINE REPLAY"\n\nfunc make_material(color: Color) -> StandardMaterial3D:\n    var m = StandardMaterial3D.new()\n    m.albedo_color = color\n    return m\n\nfunc _process(delta):\n    var direction = Vector3.ZERO\n    if Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP): direction.z -= 1\n    if Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN): direction.z += 1\n    if Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT): direction.x -= 1\n    if Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT): direction.x += 1\n    if direction.length()>0:\n        avatar.position += direction.normalized()*12.0*delta\n        avatar.position.x = clamp(avatar.position.x,-40.0,40.0)\n        avatar.position.z = clamp(avatar.position.z,-40.0,40.0)\n\nfunc _unhandled_key_input(event):\n    if not (event is InputEventKey and event.pressed and not event.echo): return\n    if event.keycode == KEY_I and not struck:\n        struck = true\n        create_crater()\n        for i in range(stations.size()):\n            var damage = String(stations[i]["condition"])\n            if damage == "BREACHED": pads[i].material_override = make_material(Color(0.86,0.28,0.17))\n            elif damage == "DAMAGED": pads[i].material_override = make_material(Color(0.95,0.65,0.26))\n        hud.text = "IMPACT VISUALIZED · ${scene.world_instance}\\nE: visually restore a nearby station · NO resources accounted"\n    elif event.keycode == KEY_E and struck:\n        var chosen = -1\n        var closest = 5.3\n        for i in range(stations.size()):\n            var s = stations[i]\n            var dist = avatar.position.distance_to(Vector3(float(s["x"])*2.0,1.5,float(s["z"])*2.0))\n            if dist < closest:\n                closest = dist\n                chosen = i\n        if chosen<0:\n            hud.text = "Move near a station first. This is a visual-only repair model."\n            return\n        pads[chosen].material_override = make_material(Color(0.39,0.65,0.97))\n        healed[stations[chosen]["id"]] = true\n        hud.text = "VISUALLY RESTORED: " + String(stations[chosen]["label"]) + "\\nNot proof of materials, actions, or source witness."\n\nfunc create_crater():\n    var impact = config["impact"]\n    var center = Vector3(float(impact["x"])*2.0,0,float(impact["z"])*2.0)\n    var radius = float(impact["radius"])*2.0\n    var distances = [0.0,0.22,0.48,0.78,1.0,1.15]\n    var heights = [-1.85,-1.72,-1.23,-0.55,0.4,-1.5]\n    var colors = [Color(0.08,0.07,0.10), Color(0.21,0.13,0.16), Color(0.38,0.20,0.17),Color(0.55,0.29,0.2),Color(0.92,0.48,0.25),Color(0.27,0.22,0.21)]\n    var tool = SurfaceTool.new()\n    tool.begin(Mesh.PRIMITIVE_TRIANGLES)\n    var steps = 40\n    for band in range(distances.size()-1):\n        for step in range(steps):\n            var a = TAU*float(step)/float(steps)\n            var b = TAU*float(step+1)/float(steps)\n            var ra = radius*distances[band]\n            var rb = radius*distances[band+1]\n            var p1 = Vector3(center.x+cos(a)*ra,heights[band],center.z+sin(a)*ra)\n            var p2 = Vector3(center.x+cos(b)*ra,heights[band],center.z+sin(b)*ra)\n            var p3 = Vector3(center.x+cos(a)*rb,heights[band+1],center.z+sin(a)*rb)\n            var p4 = Vector3(center.x+cos(b)*rb,heights[band+1],center.z+sin(b)*rb)\n            tool.set_color(colors[band])\n            tool.add_vertex(p1)\n            tool.add_vertex(p3)\n            tool.add_vertex(p2)\n            tool.set_color(colors[band+1])\n            tool.add_vertex(p2)\n            tool.add_vertex(p3)\n            tool.add_vertex(p4)\n    tool.generate_normals()\n    var mesh = tool.commit()\n    var model = MeshInstance3D.new()\n    model.mesh = mesh\n    var material = StandardMaterial3D.new()\n    material.vertex_color_use_as_albedo = true\n    material.cull_mode = BaseMaterial3D.CULL_DISABLED\n    model.material_override = material\n    add_child(model)\n`;
}
