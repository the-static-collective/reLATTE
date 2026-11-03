import { createHash } from 'node:crypto';

export const FORMAT = 'world-forge/scene-cartridge/v0';
export const MATERIALS = Object.freeze({
  moss: { minecraft: 'minecraft:moss_block', color: '#63b884', godot: [0.29, 0.61, 0.39] },
  copper: { minecraft: 'minecraft:cut_copper', color: '#d6875a', godot: [0.72, 0.34, 0.19] },
  birch: { minecraft: 'minecraft:birch_planks', color: '#f1dcae', godot: [0.88, 0.78, 0.56] },
  leaves: { minecraft: 'minecraft:oak_leaves', color: '#5b9c4c', godot: [0.25, 0.50, 0.19] },
  brick: { minecraft: 'minecraft:bricks', color: '#b56d6e', godot: [0.65, 0.29, 0.28] },
  amethyst: { minecraft: 'minecraft:amethyst_block', color: '#be90d3', godot: [0.61, 0.35, 0.79] },
  gold: { minecraft: 'minecraft:gold_block', color: '#f5cb63', godot: [0.87, 0.65, 0.19] }
});
export const VERBS = Object.freeze(['OFFER','BUILD','PRINT','GIVE','ASK','WITNESS','RECEIVE']);
const KEYS = Object.freeze(['format','id','title','evidence','quest','stations']);
const EV_KEYS = Object.freeze(['class','claimed_external_observation','author','source','license','admission']);
const ST_KEYS = Object.freeze(['id','label','x','z','material','verb','message']);
const allowed = (o, keys, label) => {
  if (!o || typeof o !== 'object' || Array.isArray(o) || Object.keys(o).some(k => !keys.includes(k)))
    throw Error(`${label}: invalid or unknown fields`);
};
const str = (s, max, label) => {
  if (typeof s !== 'string' || !s.trim() || s.length > max || /[\u0000-\u001f]/.test(s)) throw Error(`${label}: invalid text`);
};
export function validateCartridge(c) {
  allowed(c, KEYS, 'cartridge');
  if (c.format !== FORMAT) throw Error('unknown cartridge format');
  str(c.id, 60, 'id'); if (!/^[a-z0-9][a-z0-9-]*$/.test(c.id)) throw Error('invalid id');
  str(c.title, 120, 'title'); str(c.quest, 300, 'quest');
  allowed(c.evidence, EV_KEYS, 'evidence');
  if (c.evidence.class !== 'FICTIONAL_DESIGN' || c.evidence.claimed_external_observation !== false ||
    c.evidence.admission !== 'HOLD' || c.evidence.license !== 'CC0-1.0')
    throw Error('this demo only accepts original fictional, held, CC0 designs');
  for (const k of ['author','source']) str(c.evidence[k], 300, k);
  if (!Array.isArray(c.stations) || c.stations.length !== 7) throw Error('exactly seven stations required');
  const seen = new Set();
  c.stations.forEach((s, i) => {
    allowed(s, ST_KEYS, 'station');
    str(s.id, 35, 'station id'); str(s.label, 75, 'station label'); str(s.message, 280, 'station message');
    if (!/^[a-z0-9-]+$/.test(s.id) || seen.has(s.id)) throw Error('station id collision');
    seen.add(s.id);
    if (!Number.isInteger(s.x) || !Number.isInteger(s.z) || Math.abs(s.x)>12 || Math.abs(s.z)>12) throw Error('station outside bounded grid');
    if (!Object.hasOwn(MATERIALS, s.material) || s.verb !== VERBS[i]) throw Error('unsupported material or quest order');
  });
  for (let i=0;i<c.stations.length;i++) for (let j=i+1;j<c.stations.length;j++) {
    const a=c.stations[i],b=c.stations[j];
    if (Math.abs(a.x-b.x)<4 && Math.abs(a.z-b.z)<4) throw Error('station platforms overlap');
  }
  return c;
}
function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, normalize(value[k])]));
  return value;
}
export function digest(c) { validateCartridge(c); return createHash('sha256').update(JSON.stringify(normalize(c))).digest('hex'); }
export const INSTANCES = Object.freeze([
  { id: 'alpha', rot: 0, xShift: 0, zShift: 0, demo_seed: 'STATION-ALPHA-FICTION' },
  { id: 'beta', rot: 1, xShift: 3, zShift: -3, demo_seed: 'STATION-BETA-FICTION' }
]);
export function project(c, instance) {
  validateCartridge(c);
  if (!INSTANCES.includes(instance)) throw Error('unrecognized local demo instance');
  return { format:'world-forge/projected-scene/v0', cartridge_id:c.id, source_sha256:digest(c),
    world_instance:instance.id, claimed_external_observation:false, evidence_class:'SYNTHETIC_RENDER',
    stations:c.stations.map(s => ({...s, x: (instance.rot===0?s.x:-s.z)+instance.xShift,
                                      z: (instance.rot===0?s.z:s.x)+instance.zShift })) };
}
function coord(n) { return `~${n===0?'':n}`; }
export function minecraftFunction(scene) {
  const out = [`# WORLD-FORGE-001 / ${scene.world_instance}; AUTHOR-GENERATED DESIGN, NOT OBSERVATION`,
    `# Anchor = function executor's location. Use only in a NEW FLAT CREATIVE WORLD.`,
    '# Bounded platform generation; overwrites a 3x3 pad at each station.'];
  for (const s of scene.stations) {
    const block = MATERIALS[s.material].minecraft;
    out.push(`# ${s.id}: ${s.label}`);
    out.push(`fill ${coord(s.x-1)} ~-1 ${coord(s.z-1)} ${coord(s.x+1)} ~-1 ${coord(s.z+1)} ${block}`);
    out.push(`setblock ${coord(s.x)} ~ ${coord(s.z)} minecraft:sea_lantern`);
  }
  out.push('tellraw @s {"text":"WORLD-FORGE demo pads placed. Run /function worldforge:start, then the step functions in order.","color":"aqua"}');
  return out.join('\n')+'\n';
}
export function minecraftQuest(c) {
  validateCartridge(c);
  const f = {};
  f['install.mcfunction'] = 'scoreboard objectives add wf_stage dummy\ntellraw @s {"text":"World Forge installed. /function worldforge:start to begin.","color":"gold"}\n';
  f['start.mcfunction'] = 'scoreboard players set @s wf_stage 0\ntellraw @s {"text":"Jubilee Garden: 7 stations. Start at The Garden; no real-world effects.","color":"green"}\n';
  c.stations.forEach((s,i)=>{
    const id = `${i+1}_${s.id}`;
    const msg=JSON.stringify({text:`${i+1}/7 ${s.label}: ${s.message}`,color:'aqua'});
    f[`step/${id}.mcfunction`] = `execute if score @s wf_stage matches ${i} run function worldforge:effect/${id}\nexecute unless score @s wf_stage matches ${i+1} run tellraw @s {"text":"Step not applied: finish stations in order (or already completed).","color":"red"}\n`;
    f[`effect/${id}.mcfunction`] = `scoreboard players set @s wf_stage ${i+1}\ntellraw @s ${msg}\n`;
  });
  f['status.mcfunction'] = 'scoreboard players get @s wf_stage\n';
  return f;
}
export function reproduction(c) {
  const a=project(c,INSTANCES[0]),b=project(c,INSTANCES[1]);
  const structural = s => s.stations.map(({id,label,material,verb,message})=>({id,label,material,verb,message}));
  const same = JSON.stringify(structural(a)) === JSON.stringify(structural(b));
  return {format:'world-forge/model-reproduction/v0',source_sha256:digest(c),
    evidence_class:'SYNTHETIC_MODEL_CHECK', original_verified:false,
    source_worlds:['alpha','beta'], distinctive_layouts:JSON.stringify(a.stations.map(s=>[s.x,s.z]))!==JSON.stringify(b.stations.map(s=>[s.x,s.z])),
    preserved_semantics:same, disposition:same?'HOLD':'REFUSE',
    does_not_claim:['Minecraft execution','Godot execution','independent external witness','human consent','portable skill','receiver admission']};
}
export function godotScript(c,scene) {
  validateCartridge(c);
  const compact=JSON.stringify(scene.stations.map(s=>({id:s.id,label:s.label,x:s.x,z:s.z,verb:s.verb,message:s.message,rgb:MATERIALS[s.material].godot})));
  const literal=JSON.stringify(compact); // quoted GDScript string containing JSON
  return `extends Node3D\n# WORLD-FORGE-001: automatically generated from a fictional cartridge.\n# A local playable 3D model, NOT an external witness or proof of Minecraft replay.\n\nconst STATIONS_JSON = ${literal}\nvar stations = []\nvar stage = 0\nvar avatar: MeshInstance3D\nvar hud: Label\n\nfunc _ready():\n    stations = JSON.parse_string(STATIONS_JSON)\n    var floor_mesh = BoxMesh.new()\n    floor_mesh.size = Vector3(64, 0.25, 64)\n    var floor_node = MeshInstance3D.new()\n    floor_node.mesh = floor_mesh\n    floor_node.position.y = -0.28\n    var ground = StandardMaterial3D.new()\n    ground.albedo_color = Color(0.10, 0.18, 0.16)\n    floor_node.material_override = ground\n    add_child(floor_node)\n    for i in range(stations.size()):\n        var s = stations[i]\n        var cube = MeshInstance3D.new()\n        var box = BoxMesh.new()\n        box.size = Vector3(3, 1.2, 3)\n        cube.mesh = box\n        cube.position = Vector3(float(s["x"]) * 2.0, 0.6, float(s["z"]) * 2.0)\n        var material = StandardMaterial3D.new()\n        var rgb = s["rgb"]\n        material.albedo_color = Color(float(rgb[0]),float(rgb[1]),float(rgb[2]))\n        cube.material_override = material\n        add_child(cube)\n    avatar = MeshInstance3D.new()\n    avatar.mesh = SphereMesh.new()\n    avatar.position = Vector3(float(stations[0]["x"])*2.0,1.0,float(stations[0]["z"])*2.0)\n    var avatar_material = StandardMaterial3D.new()\n    avatar_material.albedo_color = Color(0.9,0.96,0.98)\n    avatar.material_override = avatar_material\n    add_child(avatar)\n    var cam = Camera3D.new()\n    cam.position = Vector3(0, 43, 42)\n    cam.projection = Camera3D.PROJECTION_ORTHOGONAL\n    cam.size = 78.0\n    add_child(cam)\n    cam.look_at(Vector3.ZERO)\n    cam.current = true\n    var light = DirectionalLight3D.new()\n    light.rotation_degrees = Vector3(-55, -15, -20)\n    add_child(light)\n    var layer = CanvasLayer.new()\n    add_child(layer)\n    hud = Label.new()\n    hud.position = Vector2(20,20)\n    hud.add_theme_font_size_override("font_size",20)\n    layer.add_child(hud)\n    update_hud("MODEL ONLY. Move WASD or arrows; E visits the next station.")\n\nfunc _process(delta):\n    var movement = Vector3.ZERO\n    if Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP): movement.z -= 1\n    if Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN): movement.z += 1\n    if Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT): movement.x -= 1\n    if Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT): movement.x += 1\n    if movement.length() > 0:\n        avatar.position += movement.normalized() * 10.0 * delta\n        avatar.position.x = clamp(avatar.position.x, -28.0, 28.0)\n        avatar.position.z = clamp(avatar.position.z, -28.0, 28.0)\n\nfunc _unhandled_key_input(event):\n    if event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_E:\n        if stage >= stations.size():\n            update_hud("All 7 stations complete. Final disposition: HOLD. Press R to restart.")\n            return\n        var s = stations[stage]\n        var target = Vector3(float(s["x"])*2.0, 1.0, float(s["z"])*2.0)\n        if avatar.position.distance_to(target) > 5.3:\n            update_hud("Find the next station: " + String(s["label"]))\n            return\n        stage += 1\n        update_hud(String(s["verb"]) + " · " + String(s["message"]))\n    elif event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_R:\n        stage = 0\n        avatar.position = Vector3(float(stations[0]["x"])*2.0, 1.0, float(stations[0]["z"])*2.0)\n        update_hud("Restarted. Fictional game state only.")\n\nfunc update_hud(message: String):\n    hud.text = "WORLD-FORGE-001 / " + ${JSON.stringify(scene.world_instance)} + "\\n" + "Progress " + str(stage) + "/7 · " + message\n`;
}
