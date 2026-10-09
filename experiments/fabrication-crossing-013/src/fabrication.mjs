/* FABRICATION-CROSSING-013: native reLATTE local worlds + Ed25519 receipts.
 * Three simulated machine owners; neither a printer controller nor a network.
 * LocalWorld signed publication/grant/withdrawal remain owned by native 078.
 */
import { readFileSync } from "node:fs";
import { digest } from "../../interface-superspace-001/src/receipts.mjs";
import { LocalWorld, verifyTicket } from "../../dynamic-interface-field-001/src/world.mjs";
import { clone, identity, signed, verifySigned, verifyHistory, replay } from "../../dynamic-interface-field-001/src/history.mjs";

const TEMPLATE=JSON.parse(readFileSync(new URL("../../interface-superspace-001/interfaces/relatte-receiver-intake.json",import.meta.url)));
export const REQUEST_SCHEMA="static-os.fabrication-request/v0";
export const PROOF_SCHEMA="relatte.fabrication-crossing-013.experimental/v0";
const ids=["example:machine-01","example:machine-02","virtual:fff-pla-180"];
const reject=(condition,message)=>{if(!condition)throw Error(message);};
function requestCheck(req) {
  reject(req&&typeof req==="object"&&!Array.isArray(req),"REQUEST_REQUIRED");
  const {request_id,...body}=req;
  reject(req.schema===REQUEST_SCHEMA &&
         request_id==="static-os-fabrication-013:"+digest(body) &&
         req.state==="FABRICATION_PROPOSAL_ONLY" &&
         req.owner_machine_grants_included===false &&
         req.fabrication_occurred===false &&
         req.physical_parts===0 && req.new_money===0 &&
         req.requested_node_count===3 &&
         Array.isArray(req.selected_nodes) && req.selected_nodes.length===3 &&
         ids.every((id,i)=>req.selected_nodes[i].machine_id===id &&
           req.selected_nodes[i].physical_print_permission===false &&
           req.selected_nodes[i].hardware_authenticated===false) &&
         req.original_field_id?.startsWith("static-os-printer-field-012:") &&
         req.original_signed_cad_crossing_id?.length>12,
         "UNTRUSTED_SOURCE_REQUEST_OR_PHYSICAL_AUTHORITY");
  return req;
}
function descriptor(machineId) {
  return {...clone(TEMPLATE),interface_id:"interface:fabrication-013:"+machineId,
    participant_ref:"participant:"+machineId,
    operations:["observe","propose"],
    authority:{observe:true,propose:true,authorize:false,mutate:false},
    information:{...clone(TEMPLATE.information),native_dimensions:[
      "simulated-offer-only","no-printer-transport","original-signed-design-reference"]},
    constraints:{required:[],forbidden:["authorize","mutate","physical_start","printer_io"]},
    capabilities:["observe","propose"]};
}
function machine(world,node,keys,status,reason,offerId,grantId=null) {
  return signed({
    schema:"relatte.fabrication-owner-decision-013/v0",
    request_id:node.request_id,
    source_cad_crossing_id:node.original_signed_cad_crossing_id,
    target_machine_id:node.target,
    owner_world_id:world.world_id,
    interface_id:"interface:fabrication-013:"+node.target,
    offer_id:offerId,
    grant_id:grantId,
    decision:status,
    reason,
    physical_print_granted:false,
    transport_granted:false,
    physical_part_count:0,
    local_inventory_delta:0,
  },keys);
}
export function simulate(input) {
  const request=requestCheck(clone(input));
  const time={at:1000};
  const owners=ids.map((id)=>({
    id,
    world:new LocalWorld({clock:()=>time.at}),
    decision:identity(),
  }));
  const all=owners.map(m=>({...m,door:m.world.publish(descriptor(m.id),{ttl:30000})}));
  const [a,b,c]=all;
  const extra={request_id:request.request_id,original_signed_cad_crossing_id:request.original_signed_cad_crossing_id};
  const dA=machine(a.world,{...extra,target:a.id},a.decision,"R3_HOLD","NO_VERIFIED_MATERIAL_STOCK",a.door.offer_id);
  const dB=machine(b.world,{...extra,target:b.id},b.decision,"R3_HOLD","PROCESS_SPECIFIC_SLICER_MISSING",b.door.offer_id);
  const stale=c.world.issueGrant(c.door,{subject:request.request_id,operation:"propose",permission:"propose",max_uses:1,ttl:30000});
  c.world.withdraw(c.door.descriptor.interface_id);
  let blocked=false;
  try{c.world.admitOperation(c.door,stale,request.request_id,"propose","propose");}
  catch(e){blocked=e.message==="DOOR_UNAVAILABLE";}
  reject(blocked,"STALE_GRANT_UNEXPECTEDLY_ADMITTED");
  const dC=machine(c.world,{...extra,target:c.id},c.decision,"R3_HOLD","SOURCE_WORLD_WITHDRAWN",c.door.offer_id,stale.grant_id);
  // Explicit new owner identity on reappearance. A recovered name is NOT a recovered key.
  const reborn=new LocalWorld({clock:()=>time.at});
  const newDoor=reborn.publish(descriptor(c.id),{ttl:30000});
  const fresh=reborn.issueGrant(newDoor,{subject:request.request_id,operation:"propose",permission:"propose",max_uses:1,ttl:30000});
  const ticket=reborn.admitOperation(newDoor,fresh,request.request_id,"propose","propose");
  const candidate=machine(reborn,{...extra,target:c.id},c.decision,"PROPOSAL_ONLY",
          "SIMULATED_OWNER_SELECTED_SOFTWARE_REVIEW_NOT_PRINT",newDoor.offer_id,fresh.grant_id);
  const allWorlds=[a.world,b.world,c.world,reborn];
  const body={
    schema:PROOF_SCHEMA, request,
    signed_world_histories:allWorlds.map((w)=>w.history()),
    source_owner_world_anchors:allWorlds.map((w)=>w.anchor),
    externally_pin_decision_keys:all.map((x)=>({machine_id:x.id,public_key:x.decision.public_key})),
    decisions:[dA,dB,dC,candidate],
    stale_grant:stale,fresh_grant:fresh,fresh_ticket:ticket,
    claims:{
      nodes_contacted_in_local_simulation:3,
      independent_native_worlds:4,
      grants_for_physical_print:0,
      machine_dispatched:false,
      simulated_offline_deny_before_native_effect:true,
      old_grants_restored:0,
      candidate_output:"PROPOSAL_ONLY",
      physical_parts:0,
      jubilee_physical_inventory_delta:0,
      transfer_receipt_created:false,
      actual_native_013_crossing_to_remote_printer:false,
      external_trust_required:true,
    },
  };
  const proof={...body,proof_id:"relatte-fabrication-013:"+digest(body)};
  verifyProof(proof,{worldAnchors:body.source_owner_world_anchors,decisionKeys:body.externally_pin_decision_keys});
  return proof;
}
export function verifyProof(proof,{worldAnchors,decisionKeys}) {
  reject(proof&&typeof proof==="object","PROOF_REQUIRED");
  const {proof_id,...body}=proof;
  reject(proof_id==="relatte-fabrication-013:"+digest(body) && body.schema===PROOF_SCHEMA,"PROOF_CHANGED");
  const req=requestCheck(body.request);
  reject(Array.isArray(worldAnchors) && worldAnchors.length===4
        && Array.isArray(decisionKeys) && decisionKeys.length===3,
        "EXTERNAL_TRUST_PINS_REQUIRED");
  reject(digest(worldAnchors)===digest(body.source_owner_world_anchors) &&
         digest(decisionKeys)===digest(body.externally_pin_decision_keys),
         "EXTERNAL_TRUST_PINS_MISMATCH");
  const histories=body.signed_world_histories;
  reject(Array.isArray(histories)&&histories.length===4,"EXACT_OWNER_HISTORIES_REQUIRED");
  const states=histories.map((history,i)=>{
    const verified=verifyHistory(history,worldAnchors[i]);
    reject(verified.world_id===worldAnchors[i].world_id,"WORLD_ID_TRUST_ANCHOR_MISMATCH");
    return replay(history,1000);
  });
  const [aa,bb,cc,dd]=states;
  const d=ids.map(id=>"interface:fabrication-013:"+id);
  reject(aa.doors.has(d[0]) && bb.doors.has(d[1]) &&
         !cc.doors.has(d[2]) && dd.doors.has(d[2]),
         "SIMULATED_WORLD_LIFECYCLE_NOT_VERIFIED");
  reject(worldAnchors[2].world_id!==worldAnchors[3].world_id,
         "RECONSTITUTION_KEPT_OLD_WORLD_AUTHORITY");
  const old=body.stale_grant, fresh=body.fresh_grant,ticket=body.fresh_ticket;
  verifySigned(old,worldAnchors[2].public_key);
  verifySigned(fresh,worldAnchors[3].public_key);
  verifyTicket(ticket,worldAnchors[3]);
  reject(old.offer_id!==dd.doors.get(d[2]).offer_id &&
         old.world_id===worldAnchors[2].world_id &&
         !dd.grants.has(old.grant_id) &&
         cc.grants.has(old.grant_id) &&
         fresh.world_id===dd.doors.get(d[2]).world_id &&
         fresh.offer_id===dd.doors.get(d[2]).offer_id &&
         dd.grants.has(fresh.grant_id) &&
         ticket.grant_id===fresh.grant_id &&
         ticket.subject===req.request_id &&
         ticket.operation==="propose" &&
         ticket.permission==="propose" && ticket.use===1 &&
         fresh.permission==="propose" &&
         fresh.operation==="propose",
         "STALE_GRANT_REUSED_OR_FRESH_GRANT_SCOPE_WRONG");
  const expected=["R3_HOLD","R3_HOLD","R3_HOLD","PROPOSAL_ONLY"];
  const statuses=["NO_VERIFIED_MATERIAL_STOCK","PROCESS_SPECIFIC_SLICER_MISSING",
       "SOURCE_WORLD_WITHDRAWN","SIMULATED_OWNER_SELECTED_SOFTWARE_REVIEW_NOT_PRINT"];
  reject(body.decisions.length===4,"WRONG_MACHINE_DECISION_COUNT");
  body.decisions.forEach((decision,i)=>{
    const k=decisionKeys[i===3?2:i];
    reject(k.machine_id===ids[i===3?2:i],"DECISION_TRUST_ORDER_CHANGED");
    verifySigned(decision,k.public_key);
    reject(decision.request_id===req.request_id &&
           decision.source_cad_crossing_id===req.original_signed_cad_crossing_id &&
           decision.target_machine_id===ids[i===3?2:i] &&
           decision.owner_world_id===worldAnchors[i].world_id &&
           decision.offer_id===(i===2?old.offer_id:
                    states[i].doors.get(d[i===3?2:i]).offer_id) &&
           decision.decision===expected[i] && decision.reason===statuses[i] &&
           decision.physical_print_granted===false &&
           decision.transport_granted===false &&
           decision.physical_part_count===0 &&
           decision.local_inventory_delta===0 &&
           decision.grant_id===(i===2?old.grant_id:i===3?fresh.grant_id:null),
           "DECISION_DID_NOT_MATCH_SOURCE_OWNER_OR_BOUNDS");
  });
  reject(digest(body.claims)===digest({
    nodes_contacted_in_local_simulation:3,independent_native_worlds:4,
    grants_for_physical_print:0,machine_dispatched:false,
    simulated_offline_deny_before_native_effect:true,old_grants_restored:0,
    candidate_output:"PROPOSAL_ONLY",physical_parts:0,jubilee_physical_inventory_delta:0,
    transfer_receipt_created:false,actual_native_013_crossing_to_remote_printer:false,
    external_trust_required:true,
  }),"FABRICATION_AUTHORITY_LAUNDERING");
  return {status:"SIGNED_SIMULATED_OWNER_HOLD_AND_RECONSTITUTION_VERIFIED",
     request_id:req.request_id,hold_decisions:3,software_review_proposals:1,
     nodes:3,new_worlds:1,stale_grants_restored:0,physical_parts:0,
     physical_prints_started:0,requires_external_trust:true};
}
