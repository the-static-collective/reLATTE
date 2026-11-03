// CRATER-SMASH-002 · pure, deterministic fictional simulation model.
// No network, eval, arbitrary code, physical-world effects or external authority.
export const CRATER_FORMAT = 'world-forge/crater-event/v0';
export const RECOVERY_FORMAT = 'world-forge/recovery-candidate/v0';
export const WORLD_LABELS = Object.freeze({alpha:'THE FIRST FALL', beta:'THE SECOND SKY'});
export const IMPACTS = Object.freeze({
  alpha: {x:-7,z:-6,radius:12,signature:'CRATER-ALPHA-2026',story:'The seed garden takes the direct hit.'},
  beta: {x:10,z:-3,radius:11,signature:'CRATER-BETA-2026',story:'The forge takes the direct hit.'}
});
export const RESOURCES = Object.freeze(['wood','stone','metal','seeds','fiber']);
export const SALVAGE = Object.freeze({
  garden:{seeds:3,wood:1}, forge:{metal:4,stone:2}, press:{wood:3,fiber:2},
  tree:{wood:3,seeds:2}, council:{stone:4,wood:1}, gate:{stone:4,metal:1},
  arcade:{metal:4,wood:1}
});
export const COSTS = Object.freeze({
  garden:{seeds:1,wood:1}, forge:{metal:2,stone:1}, press:{wood:2,fiber:1},
  tree:{seeds:1,wood:1}, council:{stone:2,wood:1}, gate:{stone:2,metal:1},
  arcade:{metal:2,wood:1}
});
const clone = obj => JSON.parse(JSON.stringify(obj));
const event = (s,type,data={})=>s.events.push({n:s.events.length+1,type,...data,evidence_class:'LOCAL_MODEL_SIMULATION'});
export function damageAt(x,z,impact){
  const distance = Math.hypot(x-impact.x,z-impact.z);
  const condition = distance<=impact.radius*0.65?'BREACHED':distance<=impact.radius*1.25?'DAMAGED':'INTACT';
  return {condition, distance:Math.round(distance*100)/100};
}
export function freshWorld(scene){
  if (!scene || !Object.hasOwn(IMPACTS,scene.world_instance)) throw Error('unknown scene instance');
  if (!Array.isArray(scene.stations)||scene.stations.length!==7) throw Error('scene stations invalid');
  const ids=new Set();
  for(const s of scene.stations){
    if(!Object.hasOwn(COSTS,s.id)||ids.has(s.id)||!Number.isFinite(s.x)||!Number.isFinite(s.z)) throw Error('station identity invalid');
    ids.add(s.id);
  }
  const inventory=Object.fromEntries(RESOURCES.map(r=>[r,0]));
  return {format:'world-forge/crater-local-world/v0',world_instance:scene.world_instance,source_sha256:scene.source_sha256,
    struck:false,receiver:'HOLD',impact:null,inventory,stations:scene.stations.map(s=>({id:s.id,label:s.label,x:s.x,z:s.z,condition:'UNSURVEYED',distance:null,salvaged:false})),events:[]};
}
export function strike(world){
  if(world.struck) return {ok:false,reason:'This world has already been struck. Reset to start a new fictional scenario.',state:world};
  const s=clone(world),i=IMPACTS[s.world_instance];if(!i) throw Error('world not supported');
  s.struck=true;s.impact={...i,format:CRATER_FORMAT,evidence_class:'FICTIONAL_DESIGN',claimed_external_observation:false};
  for(const station of s.stations){const d=damageAt(station.x,station.z,i);station.condition=d.condition;station.distance=d.distance;}
  event(s,'IMPACT_SIMULATED',{impact_signature:i.signature,crater:{x:i.x,z:i.z,radius:i.radius},affected:s.stations.filter(x=>x.condition!=='INTACT').map(x=>x.id)});
  return {ok:true,state:s};
}
export function collect(world,id){
  if(!world.struck) return {ok:false,reason:'Survey the impact first.',state:world};
  const s=clone(world),station=s.stations.find(x=>x.id===id);
  if(!station) return {ok:false,reason:'Unknown station.',state:world};
  if(station.salvaged) return {ok:false,reason:'This fictional salvage cache has already been collected.',state:world};
  station.salvaged=true;
  for(const [key,n] of Object.entries(SALVAGE[id]))s.inventory[key]+=n;
  event(s,'SALVAGE',{station_id:id,items:clone(SALVAGE[id]),inventory_after:clone(s.inventory)});
  return {ok:true,state:s};
}
export function repairCost(station){
  const base=COSTS[station.id];if(!base)throw Error('unknown repair station');
  if(station.condition==='INTACT'||station.condition==='RESTORED')return {};
  const factor=station.condition==='BREACHED'?2:1;
  return Object.fromEntries(Object.entries(base).map(([k,v])=>[k,v*factor]));
}
export function repair(world,id){
  if(!world.struck)return {ok:false,reason:'Survey the impact first.',state:world};
  const s=clone(world),station=s.stations.find(x=>x.id===id);
  if(!station)return {ok:false,reason:'Unknown station.',state:world};
  if(station.condition==='INTACT'||station.condition==='RESTORED')return {ok:false,reason:'That station does not require repair.',state:world};
  const cost=repairCost(station);
  const lacks=Object.entries(cost).filter(([k,v])=>s.inventory[k]<v).map(([k,v])=>`${k}: ${v-s.inventory[k]} short`);
  if(lacks.length)return {ok:false,reason:'Not enough materials ('+lacks.join(', ')+'). Salvage other stations.',state:world};
  for(const [k,v] of Object.entries(cost))s.inventory[k]-=v;
  const old=station.condition;station.condition='RESTORED';
  event(s,'REPAIR',{station_id:id,condition_before:old,repair_cost:cost,inventory_after:clone(s.inventory)});
  return {ok:true,state:s};
}
export function summary(world){
  return {struck:world.struck,breached:world.stations.filter(s=>s.condition==='BREACHED').length,
    damaged:world.stations.filter(s=>s.condition==='DAMAGED').length,
    intact:world.stations.filter(s=>s.condition==='INTACT').length,
    restored:world.stations.filter(s=>s.condition==='RESTORED').length,
    repairs:world.events.filter(e=>e.type==='REPAIR').length,
    fully_recovered:world.struck&&world.stations.every(s=>['INTACT','RESTORED'].includes(s.condition))};
}
export function makeCandidate(world){
  if(!world.struck)throw Error('no source impact');
  const repairs=world.events.filter(e=>e.type==='REPAIR');
  if(!repairs.length)throw Error('no demonstrated local repairs to offer');
  return {format:RECOVERY_FORMAT,origin_world:world.world_instance,source_sha256:world.source_sha256,
    origin_impact_signature:world.impact.signature,evidence_class:'LOCAL_MODEL_SIMULATION',signature:null,
    independent_observer:null,receiver_disposition:'HOLD',external_effect:false,
    steps:repairs.map(e=>({verb:'REPAIR',station_id:e.station_id,condition_before:e.condition_before,repair_cost:e.repair_cost})),
    does_not_claim:['independent Minecraft witness','independent Godot witness','actual cross-engine reproduction',
      'human/community consent','automatic execution','receiver admission','financial value']};
}
export function validateCandidate(candidate,scene){
  const candidateKeys=['format','origin_world','source_sha256','origin_impact_signature','evidence_class','signature','independent_observer','receiver_disposition','external_effect','steps','does_not_claim'];
  if (!candidate||typeof candidate!=='object'||Array.isArray(candidate)||Object.keys(candidate).some(k=>!candidateKeys.includes(k)))throw Error('candidate contains unknown fields');
  if(candidate.origin_impact_signature!==IMPACTS[candidate.origin_world]?.signature)throw Error('origin impact signature mismatch');
  if(!Array.isArray(candidate.does_not_claim)||candidate.does_not_claim.length!==7)throw Error('candidate nonclaims absent');
  if(!candidate||candidate.format!==RECOVERY_FORMAT||candidate.source_sha256!==scene.source_sha256)throw Error('candidate source or format mismatch');
  if(candidate.signature!==null||candidate.independent_observer!==null||candidate.receiver_disposition!=='HOLD'||candidate.external_effect!==false||candidate.evidence_class!=='LOCAL_MODEL_SIMULATION')throw Error('candidate cannot claim authority');
  if(!['alpha','beta'].includes(candidate.origin_world)||!Array.isArray(candidate.steps)||candidate.steps.length===0||candidate.steps.length>7)throw Error('candidate steps invalid');
  const seen=new Set();
  for(const step of candidate.steps){
    if(!step||typeof step!=='object'||Object.keys(step).some(k=>!['verb','station_id','condition_before','repair_cost'].includes(k))||step.verb!=='REPAIR'||!Object.hasOwn(COSTS,step.station_id)||seen.has(step.station_id)||!['BREACHED','DAMAGED'].includes(step.condition_before))throw Error('candidate contains non-allowlisted repair step');
    seen.add(step.station_id);
    const expected=Object.fromEntries(Object.entries(COSTS[step.station_id]).map(([k,v])=>[k,v*(step.condition_before==='BREACHED'?2:1)]));
    if(!step.repair_cost||typeof step.repair_cost!=='object'||Object.keys(step.repair_cost).some(k=>!RESOURCES.includes(k))||JSON.stringify(step.repair_cost)!==JSON.stringify(expected))throw Error('candidate repair costs manipulated');
  }
  return true;
}
export function rehearse(candidate,target){
  validateCandidate(candidate,target);
  if(!target.struck)throw Error('receiver must first survey its own fictional impact');
  if(target.receiver==='REFUSE')throw Error('receiver refused rehearsal');
  if(candidate.origin_world===target.world_instance)throw Error('the receiving world must be different');
  // NOTE: read-only, simulated interpretation. No mutation, execution, permission or admission.
  const observations=candidate.steps.map(step=>{
    const station=target.stations.find(s=>s.id===step.station_id);
    if(station.condition==='INTACT'||station.condition==='RESTORED')return {station_id:step.station_id,assessment:'DIVERGENT',reason:'Target station is not damaged; source repair is unnecessary.'};
    if(station.condition!==step.condition_before)return {station_id:step.station_id,assessment:'DIVERGENT',reason:`Target severity ${station.condition} differs from source ${step.condition_before}.`};
    return {station_id:step.station_id,assessment:'COMPATIBLE_IN_MODEL',reason:'Same repair precondition in fictional model; no physical execution observed.'};
  });
  return {format:'world-forge/crater-rehearsal-report/v0',evidence_class:'SYNTHETIC_MODEL_CHECK',source_sha256:target.source_sha256,
    origin_world:candidate.origin_world,target_world:target.world_instance,observations,
    compatible:observations.filter(x=>x.assessment==='COMPATIBLE_IN_MODEL').length,
    divergent:observations.filter(x=>x.assessment==='DIVERGENT').length,
    receiver_disposition:target.receiver,mutated_target:false,executed_in_target:false,
    disposition:'HOLD',does_not_claim:['external observation','verified skill transfer','permission','execution','trust identity']};
}
export function decide(world,decision){
  if(!['HOLD','REFUSE'].includes(decision))throw Error('receiver cannot auto-admit');
  const s=clone(world);s.receiver=decision;event(s,'RECEIVER_DECISION',{decision,side_effect:false});return s;
}
export function exportReceipt(world){
  return {format:'world-forge/crater-local-receipt/v0',source_sha256:world.source_sha256,
    world_instance:world.world_instance,evidence_class:'LOCAL_UI_SIMULATION',signature:null,independent_observer:null,
    world_state:clone(world),summary:summary(world),receiver_disposition:world.receiver,external_effect:false,
    does_not_claim:['real meteor impact','real materials','Minecraft gameplay','Godot gameplay','receiver admission']};
}
