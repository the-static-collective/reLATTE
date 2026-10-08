import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { loadRegistry } from "../interface-superspace-001/src/registry.mjs";
import {
  digest,
  verifySeal,
} from "../interface-superspace-001/src/receipts.mjs";
import { verifyCrossingEnvelope, verifyReceipt } from "../../src/protocol.ts";
import { FieldObserver, verifyProposal } from "./src/field.mjs";
import { verifyHistory, replay } from "./src/history.mjs";
import { verifyDynamic } from "./src/runtime.mjs";
import { validateDynamic } from "./src/schemas.mjs";
export async function verifyProof(proof, { checkFreeze = true } = {}) {
  assert.equal(proof.schema, "relatte.dynamic-field-proof.experimental/v0");
  assert.equal(proof.normative_core_mutations, 0);
  if (checkFreeze)
    assert.equal(
      execFileSync(
        "git",
        [
          "diff",
          "f5cb7488bebc1a6e27fd458ad40af9b9b6f9e858",
          "--",
          "src",
          "spec",
          "schemas",
        ],
        { encoding: "utf8" },
      ),
      "",
    );
  const library = await loadRegistry(),
    histories = new Map();
  assert.equal(
    new Set(proof.anchors.map((a) => a.world_id)).size,
    proof.anchors.length,
  );
  for (const events of proof.histories) {
    const id = events[0].world_id,
      anchor = proof.anchors.find((a) => a.world_id === id);
    assert.ok(anchor);
    assert.ok(!histories.has(id));
    verifyHistory(events, anchor);
    replay(events, events.at(-1).at_ms);
    histories.set(id, events);
  }
  const views = new Map();
  for (const saved of proof.views) {
    const observer = new FieldObserver({
      anchors: proof.anchors,
      surfaces: library.surfaces,
      contracts: library.contracts,
    });
    observer.extendAttestations(proof.extra_attestations);
    for (const events of saved.histories) {
      const complete = histories.get(events[0].world_id);
      assert.ok(complete);
      assert.ok(events.length <= complete.length);
      assert.deepEqual(events, complete.slice(0, events.length));
    }
    const view = await observer.project(
      saved.histories,
      saved.snapshot.observed_at,
    );
    assert.deepEqual(view.snapshot, saved.snapshot);
    views.set(view.snapshot.view_digest, view);
  }
  assert.equal(
    new Set(proof.plans.map((p) => p.field_plan_id)).size,
    proof.plans.length,
  );
  for (const p of proof.plans) {
    assert.ok(views.has(p.view_digest));
    await verifyProposal(views.get(p.view_digest), p);
  }
  const seenOccurrences = new Set(),
    seenTickets = new Set();
  async function occurrence(plan, record) {
    assert.ok(!seenOccurrences.has(record.occurrence_id));
    seenOccurrences.add(record.occurrence_id);
    await verifyProposal(views.get(plan.view_digest), plan);
    verifyDynamic(plan, record, proof.anchors);
    for (const t of record.operation_tickets) {
      assert.ok(!seenTickets.has(t.ticket_id));
      seenTickets.add(t.ticket_id);
      const history = histories.get(t.world_id),
        position = history.findIndex((e) => digest(e) === t.head);
      assert.ok(position >= 0);
      assert.ok(history[position].at_ms <= t.at_ms);
      const state = replay(history.slice(0, position + 1), t.at_ms),
        grant = state.grants.get(t.grant_id),
        door = state.doors.get(t.interface_id);
      assert.ok(grant && door);
      assert.equal(door.offer_id, t.offer_id);
      assert.equal(grant.offer_id, t.offer_id);
      assert.equal(grant.subject, t.subject);
      assert.equal(grant.operation, t.operation);
      assert.equal(grant.permission, t.permission);
      assert.ok(t.use <= grant.max_uses);
      assert.ok(grant.expires_at > t.at_ms);
      assert.ok(!state.revoked.has(t.grant_id));
    }
    for (const n of record.nested) {
      assert.equal(n.composition_id, proof.composition_manifest.composition_id);
      assert.equal(
        n.member_plan.field_plan_digest,
        proof.composition_manifest.member_plan_digest,
      );
      assert.ok(
        n.occurrence.operation_tickets.every(
          (t) => t.subject === n.composition_id,
        ),
      );
      await occurrence(n.member_plan, n.occurrence);
      const bridge = record.execution.actual_relation_receipts.find(
        (r) =>
          r.evidence.native.composition_id === n.composition_id &&
          r.evidence.native.member_occurrence_id === n.occurrence.occurrence_id,
      );
      assert.ok(bridge);
      assert.equal(
        bridge.source_particular,
        bridge.evidence.native.input_parent_particular,
      );
      assert.equal(
        bridge.input_digest,
        n.occurrence.execution.source.content_digest,
      );
      assert.equal(
        bridge.output_digest,
        n.occurrence.execution.particulars.at(-1).content_digest,
      );
      assert.equal(
        bridge.evidence.native.nested_source_particular,
        n.occurrence.execution.source.particular_id,
      );
      assert.notEqual(
        bridge.source_particular,
        n.occurrence.execution.source.particular_id,
      );
    }
  }
  for (const record of proof.records) {
    const plan = proof.plans.find(
      (p) => p.field_plan_id === record.field_plan_id,
    );
    assert.ok(plan);
    await occurrence(plan, record);
  }
  const successful = proof.records.filter((r) => r.result === "succeeded");
  assert.equal(successful.length, 5);
  assert.equal(proof.records.length - successful.length, 3);
  assert.equal(proof.crossings.length, successful.length);
  for (const pair of proof.crossings) {
    const record = successful.find(
      (r) => r.occurrence_id === pair.occurrence_id,
    );
    assert.ok(record);
    assert.ok(await verifyCrossingEnvelope(pair.crossing));
    assert.ok(await verifyReceipt(pair.receipt));
    assert.equal(pair.receipt.kind, "R3_HOLD");
    assert.equal(pair.receipt.crossing_id, pair.crossing.crossing_id);
    assert.ok(
      record.execution.crossing_refs.includes(pair.crossing.crossing_id),
    );
    const ext = pair.crossing.extensions.interface_superspace_001;
    assert.equal(ext.execution_id, record.execution.execution_id);
    assert.equal(ext.plan_digest, record.execution.plan_digest);
    assert.equal(
      pair.crossing.payload_refs[0].address,
      record.execution.particulars.at(-1).content_digest,
    );
  }
  validateDynamic("composition-instance-v0", proof.composition_manifest);
  assert.deepEqual(
    proof.milestones.map((m) => m.kind),
    [
      "no-door",
      "X-open",
      "X-withdrawn",
      "Y-open",
      "composition-new-door",
      "composition-retired",
      "reconstituted",
      "fork",
    ],
  );
  const compHistory = histories.get(proof.composition_manifest.world_id);
  assert.ok(
    compHistory.some(
      (e) =>
        e.kind === "composition-created" &&
        digest(e.payload) === digest(proof.composition_manifest),
    ),
  );
  assert.equal(proof.composition_receipts.length, 1);
  const nested = proof.records.flatMap((r) => r.nested);
  assert.equal(nested.length, 1);
  assert.deepEqual(
    proof.composition_receipts[0].occurrence,
    nested[0].occurrence,
  );
  const reconstituted = proof.milestones.find(
    (m) => m.kind === "reconstituted",
  );
  assert.notEqual(reconstituted.previous_offer, reconstituted.new_offer);
  const fork = proof.milestones.find((m) => m.kind === "fork");
  assert.deepEqual(fork.inherited_grants, []);
  const forkHistory = histories.get(fork.child_world);
  assert.equal(forkHistory[0].payload.parent.offer_id, fork.parent_offer);
  assert.ok(
    proof.histories.some((events) =>
      events.some(
        (e) =>
          e.kind === "fork" && e.payload.child.world_id === fork.child_world,
      ),
    ),
  );
  return {
    verified_occurrences: seenOccurrences.size,
    successful_routes: successful.length,
    stale_denials: 3,
    signed_owner_tickets: seenTickets.size,
    normative_core_mutations: 0,
  };
}
if (
  process.argv[1] &&
  new URL(import.meta.url).pathname === resolve(process.argv[1])
)
  console.log(
    JSON.stringify(
      await verifyProof(JSON.parse(await readFile(process.argv[2], "utf8"))),
    ),
  );
