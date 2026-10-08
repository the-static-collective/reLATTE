import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { loadRegistry } from "../interface-superspace-001/src/registry.mjs";
import { digest } from "../interface-superspace-001/src/receipts.mjs";
import { verifyHistory, replay } from "../dynamic-interface-field-001/src/history.mjs";
import { verifyProposal } from "../dynamic-interface-field-001/src/field.mjs";
import { verifyDynamic } from "../dynamic-interface-field-001/src/runtime.mjs";
import { independentObserver, verifyInterpretation } from "./lens.mjs";

// Read-only proof reconstruction; never consult live owners or execute the route.
export async function verifyProof(proof) {
  assert.equal(proof.schema, "relatte.perceived-affordance-proof.experimental/v0");
  assert.equal(proof.normative_core_mutations, 0);
  const library = await loadRegistry();
  const complete = new Map();
  assert.equal(new Set(proof.owner_anchors.map((a) => a.world_id)).size, proof.owner_anchors.length);
  for (const events of proof.owner_histories) {
    const anchor = proof.owner_anchors.find((a) => a.world_id === events[0]?.world_id);
    assert.ok(anchor, "owner trust anchor missing");
    assert.ok(!complete.has(anchor.world_id), "duplicate owner");
    verifyHistory(events, anchor);
    complete.set(anchor.world_id, events);
  }
  assert.equal(complete.size, proof.owner_anchors.length);
  const views = new Map();
  for (const saved of proof.views) {
    assert.ok(!views.has(saved.name), "duplicate observer");
    for (const history of saved.histories) {
      const full = complete.get(history[0]?.world_id);
      assert.ok(full, "untrusted historical owner");
      assert.deepEqual(history, full.slice(0, history.length), "historical prefix mismatch");
    }
    const observer = independentObserver(library, proof.owner_anchors);
    const rebuilt = await observer.project(saved.histories, saved.snapshot.observed_at);
    assert.deepEqual(rebuilt.snapshot, saved.snapshot, "observer projection changed");
    views.set(saved.name, rebuilt);
  }
  assert.equal(views.size, 2);
  for (const { view, value } of proof.reports) {
    assert.ok(views.has(view));
    verifyInterpretation(views.get(view), value);
  }
  const closed = proof.reports.find((r) => r.value.observer_id === "P" &&
    r.value.perceived_state === "CLOSED" && r.value.orientation === "PRESSURE_AWARE");
  const reopened = proof.reports.find((r) => r.value.observer_id === "P" &&
    r.value.orientation === "REORIENT_TO_SELECTED_EVIDENCE");
  const open = proof.reports.find((r) => r.value.observer_id === "P" &&
    r.value.perceived_state === "OPEN" && r.value.orientation === "PRESSURE_AWARE");
  assert.ok(closed && reopened && open, "missing opposing perceptions");
  assert.equal(closed.value.owner_observation, "DISCOVERED");
  assert.equal(reopened.value.owner_observation, "DISCOVERED");
  assert.equal(reopened.value.perceived_state, "OPEN");
  assert.equal(open.value.owner_observation, "DISCOVERED");
  assert.equal(proof.declined.status, "DECLINED_BY_OBSERVER");
  assert.deepEqual(proof.declined.plans, []);
  assert.equal(proof.declined.interpretation_digest, closed.value.interpretation_digest);
  const plans = new Map();
  for (const { view, value } of proof.plans) {
    assert.ok(!plans.has(value.field_plan_id), "duplicate plan");
    await verifyProposal(views.get(view), value);
    plans.set(value.field_plan_id, value);
  }
  assert.equal(plans.size, 3);
  const occurrences = new Set();
  for (const { plan_id, record, outcome } of proof.occurrences) {
    assert.ok(plans.has(plan_id));
    assert.ok(!occurrences.has(record.occurrence_id), "duplicate occurrence");
    occurrences.add(record.occurrence_id);
    verifyDynamic(plans.get(plan_id), record, proof.owner_anchors);
    assert.equal(record.field_plan_id, plan_id);
    const expectedResult = outcome === "succeeded" ? "succeeded" : "failed";
    assert.equal(record.result, expectedResult);
    if (outcome === "withdrawn")
      assert.match(record.failures.map((f) => f.reason).join(" "), /DOOR_UNAVAILABLE/);
    if (outcome === "stale_incarnation")
      assert.match(record.failures.map((f) => f.reason).join(" "), /STALE_INCARNATION/);
    for (const ticket of record.operation_tickets) {
      const history = complete.get(ticket.world_id);
      assert.ok(history, "no owner history for ticket");
      const at = history.findIndex((e) => digest(e) === ticket.head);
      assert.ok(at >= 0, "ticket not based on signed history");
      const state = replay(history.slice(0, at + 1), ticket.at_ms);
      const door = state.doors.get(ticket.interface_id);
      const grant = state.grants.get(ticket.grant_id);
      assert.ok(door && grant, "ticket lacks door or grant");
      assert.equal(door.offer_id, ticket.offer_id);
      assert.equal(grant.offer_id, ticket.offer_id);
      assert.equal(grant.subject, record.subject);
      assert.equal(grant.operation, ticket.operation);
      assert.equal(grant.permission, ticket.permission);
      assert.ok(ticket.use <= grant.max_uses);
      assert.ok(grant.expires_at > ticket.at_ms);
      assert.ok(!state.revoked.has(ticket.grant_id));
    }
  }
  assert.equal(proof.occurrences.length, 4);
  assert.equal(proof.occurrences.filter((x) => x.outcome === "succeeded").length, 2);
  assert.equal(proof.occurrences.filter((x) => x.outcome !== "succeeded").length, 2);
  assert.equal(proof.old_ref.interface_id, proof.new_ref.interface_id);
  assert.notEqual(proof.old_ref.offer_id, proof.new_ref.offer_id);
  return {
    verified_occurrences: occurrences.size,
    successful_routes: 2, owner_denials: 2,
    reports: proof.reports.length, normative_core_mutations: 0,
  };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const proof = JSON.parse(await readFile(process.argv[2] || "work/perceived-affordance-field-001/proof.json", "utf8"));
  console.log(JSON.stringify(await verifyProof(proof)));
}
