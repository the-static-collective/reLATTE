import test from "node:test";
import assert from "node:assert/strict";
import { simulate, verifyProof } from "../src/fabrication.mjs";
import { digest } from "../../interface-superspace-001/src/receipts.mjs";

function source(){
  const nodes=[
    ["example:machine-01","FFF_FDM","HOLD_MACHINE_PROFILE"],
    ["example:machine-02","MSLA","HOLD_PROCESS_ADAPTER"],
    ["virtual:fff-pla-180","FFF_FDM","SOFTWARE_TOOLPATH_ONLY"]
  ].map(([machine_id,technology,published_compatibility])=>({
    machine_id,technology,published_compatibility,reason:"SOURCE_FROZEN_CANDIDATE",
    hardware_authenticated:false,physical_print_permission:false
  }));
  const body={
    schema:"static-os.fabrication-request/v0",
    source_repository:"the-static-collective/static-os",
    original_field_id:"static-os-printer-field-012:sha",
    original_signed_cad_crossing_id:"crossing:simulated-origin-012",
    source_design_candidate_id:"static-os-design-010:source",
    original_print_packet_id:"static-os-print-011:packet",
    operator_ref:"synthetic-operator-013",
    purpose_ref:"fabrication-013-software-only",
    requested_node_count:3,selected_nodes:nodes,
    source_selection_digest:"abc",
    state:"FABRICATION_PROPOSAL_ONLY",
    owner_machine_grants_included:false,
    fabrication_occurred:false,physical_parts:0,new_money:0
  };
  return {...body,request_id:"static-os-fabrication-013:"+digest(body).slice(7)};
}
const copy=v=>structuredClone(v);
const pins=p=>({worldAnchors:p.source_owner_world_anchors,decisionKeys:p.externally_pin_decision_keys});
function repin(p){const {proof_id,...body}=p;p.proof_id="relatte-fabrication-013:"+digest(body);}
test("native LocalWorld Ed25519 lifecycle cold verifies three node decisions",()=>{
  const p=simulate(source());
  assert.equal(verifyProof(p,pins(p)).hold_decisions,3);
  assert.equal(verifyProof(p,pins(p)).software_review_proposals,1);
  assert.equal(p.signed_world_histories.length,4);
  assert.equal(p.decisions.length,4);
  assert.equal(p.claims.physical_parts,0);
  assert.equal(p.claims.grants_for_physical_print,0);
  assert.equal(p.claims.actual_native_013_crossing_to_remote_printer,false);
  assert.notEqual(p.source_owner_world_anchors[2].world_id,
                  p.source_owner_world_anchors[3].world_id);
  assert.notEqual(p.stale_grant.offer_id,p.fresh_grant.offer_id);
});
test("untrusted changed source cannot propose a physical print",()=>{
  for(const key of ["fabrication_occurred","owner_machine_grants_included"]){
    const s=source();s[key]=true;
    const {request_id,...body}=s;s.request_id="static-os-fabrication-013:"+digest(body).slice(7);
    assert.throws(()=>simulate(s),/UNTRUSTED_SOURCE_REQUEST_OR_PHYSICAL_AUTHORITY/);
  }
  const s=source();s.selected_nodes[1].physical_print_permission=true;
  const {request_id,...body}=s;s.request_id="static-os-fabrication-013:"+digest(body).slice(7);
  assert.throws(()=>simulate(s),/UNTRUSTED_SOURCE_REQUEST_OR_PHYSICAL_AUTHORITY/);
});
test("external trust anchor is not self-authorizing",()=>{
  const p=simulate(source());
  const bad=pins(p);bad.worldAnchors=copy(bad.worldAnchors);
  bad.worldAnchors[1].public_key=p.source_owner_world_anchors[0].public_key;
  assert.throws(()=>verifyProof(p,bad),/TRUST_PINS_MISMATCH/);
  assert.throws(()=>verifyProof(p,{}),/EXTERNAL_TRUST_PINS_REQUIRED/);
});
test("tampered signed owner decision is detected even with recomputed proof hash",()=>{
  const p=simulate(source());
  p.decisions[0].reason="FULL_PRODUCTION_APPROVED";
  repin(p);
  assert.throws(()=>verifyProof(p,pins(p)),/INVALID_SIGNATURE/);
});
test("tampered signed withdrawal chain is denied under original anchor",()=>{
  const p=simulate(source());
  p.signed_world_histories[2][2].kind="publish";
  repin(p);
  assert.throws(()=>verifyProof(p,pins(p)));
});
test("stale old grant cannot become the reconstituted world's fresh grant",()=>{
  const p=simulate(source());
  p.fresh_grant=p.stale_grant;
  repin(p);
  assert.throws(()=>verifyProof(p,pins(p)));
});
test("rehashed claim of physical stock is not earned",()=>{
  const p=simulate(source());
  p.claims.physical_parts=4;
  repin(p);
  assert.throws(()=>verifyProof(p,pins(p)),/FABRICATION_AUTHORITY_LAUNDERING/);
});
test("forged selected machine decision and expired identity fail",()=>{
  const p=simulate(source());
  p.decisions[3].target_machine_id="example:machine-02";
  repin(p);
  assert.throws(()=>verifyProof(p,pins(p)),/INVALID_SIGNATURE/);
});
test("reborn world ticket is native signed and exact proposal-only",()=>{
  const p=simulate(source());
  assert.equal(p.fresh_ticket.operation,"propose");
  assert.equal(p.fresh_ticket.permission,"propose");
  assert.equal(p.fresh_ticket.use,1);
  assert.notEqual(p.fresh_ticket.world_id,p.stale_grant.world_id);
  assert.equal(p.decisions[3].decision,"PROPOSAL_ONLY");
});
