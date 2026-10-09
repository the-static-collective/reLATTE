import { createHash } from 'node:crypto';
import {
  buildRiffRaftMinecraftPlan, RIFF_RAFT_STAGES,
} from '../riff-raft-minecraft-001/terraform-grammar.mjs';
import {
  operationToCommand, validateWorldPlan, WORLD_BOUNDS,
} from '../vanilla-worldbuilder-006/world-grammar.mjs';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail = (ok, what) => { if (!ok) throw Error('RIFF_RAFT_REDSTONE_' + what); };

// The actual vanilla apparatus is a physically updated REDSTONE circuit IN GAME,
// not a symbolic representation of environmental transformation.
// The existing nine station *symbols* at z=44 remain exactly as before.
// The live chain occupies the immediately adjacent isolated northern lane,
// with nine redstone lamps under dust and repeater-renewed signal over 80 blocks.
export const REDSTONE_CIRCUIT = Object.freeze({
  schema: 'relatte.riff-raft-redstone-002/v0',
  trigger: Object.freeze({x:-43,y:66,z:46}),
  break_repeater: Object.freeze({x:-13,y:66,z:46}),
  repeaters: Object.freeze([-28,-13,2,17,32]),
  stages: Object.freeze(RIFF_RAFT_STAGES.map((cue, index) =>
    Object.freeze({cue,sequence:index+1, at:Object.freeze({x:-40+index*10,y:65,z:46})}))),
  status: 'plan-only',
  allowed_trigger: '/setblock -43 66 46 minecraft:redstone_block',
  physical_field_evidence: false,
  ghot_organ_executed: false,
  auto_authorization: false,
});

const fill=(from,to,block)=>({kind:'fill',from,to,block});
const set=(x,y,z,block)=>({kind:'setblock',at:{x,y,z},block});

export function buildRiffRaftRedstonePlan({goal,serverSeed,provenance}){
  const parent=buildRiffRaftMinecraftPlan({goal,serverSeed,provenance});
  validateWorldPlan(parent);
  const additions=[];
  // Precisely one isolated northern lane, within previously declared bounds.
  additions.push(fill({x:-44,y:65,z:46},{x:44,y:65,z:46},'minecraft:stone_bricks'));
  // Lamps MUST go below redstone wire, leaving all signals unpowered at origin.
  for(const station of REDSTONE_CIRCUIT.stages){
    additions.push(set(station.at.x,65,46,'minecraft:redstone_lamp'));
  }
  const segments=[[-42,-29],[-27,-14],[-12,1],[3,16],[18,31],[33,42]];
  for(const [a,b] of segments){
    additions.push(fill({x:a,y:66,z:46},{x:b,y:66,z:46},'minecraft:redstone_wire'));
  }
  for(const x of REDSTONE_CIRCUIT.repeaters){
    additions.push(set(x,66,46,'minecraft:repeater[facing=east,delay=4]'));
  }
  const body={
    ...parent,
    operations:[...parent.operations,...additions],
    riff_raft_redstone:{
      ...REDSTONE_CIRCUIT,
      repeaters:[...REDSTONE_CIRCUIT.repeaters],
      stages:REDSTONE_CIRCUIT.stages.map(s=>({...s,at:{...s.at}})),
      trigger:{...REDSTONE_CIRCUIT.trigger},
      break_repeater:{...REDSTONE_CIRCUIT.break_repeater},
      parent_plan_sha256:parent.plan_sha256,
    },
  };
  delete body.plan_sha256;
  const plan={...body,plan_sha256:hash(body)};
  validateWorldPlan(plan);
  fail(plan.operations.length-parent.operations.length===1+9+6+5,
    'OPERATION_COUNT');
  fail(additions.every(op=>/^\/(?:setblock|fill) /.test(operationToCommand(op))),
    'OUT_OF_COMMAND_SURFACE');
  fail(REDSTONE_CIRCUIT.stages.every(({at})=>
    at.x>=WORLD_BOUNDS.minX&&at.x<=WORLD_BOUNDS.maxX&&
    at.y>=WORLD_BOUNDS.minY&&at.y<=WORLD_BOUNDS.maxY&&
    at.z>=WORLD_BOUNDS.minZ&&at.z<=WORLD_BOUNDS.maxZ),'BOUNDS');
  fail(!additions.some(x=>x.block==='minecraft:redstone_block'),
    'TRIGGER_PREPLACED');
  fail(!parent.riff_raft_redstone,'PARENT_ALREADY_POWERED');
  return plan;
}
