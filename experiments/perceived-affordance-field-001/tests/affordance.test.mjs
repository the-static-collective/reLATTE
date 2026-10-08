import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CompositionFieldBridge as Bridge, routeTo } from "../../composition-instance-002/bridge.mjs";
import { LocalWorld } from "../../dynamic-interface-field-001/src/world.mjs";
import { id } from "../../interface-superspace-001/src/proofs.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { specimen } from "../../dynamic-interface-field-001/src/specimen.mjs";
import { clone } from "../../dynamic-interface-field-001/src/history.mjs";
import { authorize, executeDynamic } from "../../dynamic-interface-field-001/src/runtime.mjs";
import { independentObserver, doorRef, pressureIdentity, signPressure, verifyPressure,
  interpret, verifyInterpretation, perceivedProposal, localOwnerObservation } from "../lens.mjs";
import { prove } from "../run.mjs";
import { verifyProof } from "../verify.mjs";

async function setup() {
  const s = await specimen();
  const path = await s.publishPath(s.a, ["filesystem-output"]);
  const anchors = [...s.peers.values()].map((w) => w.anchor);
  const observer = independentObserver(s.library, anchors);
  const view = await observer.project(s.histories(), s.clock());
  const ref = doorRef(path.doors[0]);
  const keys = pressureIdentity();
  const pins = [{ world_id: keys.world_id, public_key: keys.public_key }];
  return { s, path, view, ref, keys, pins };
}
test("opposed observers can disagree without changing owner state", async () => {
  const { s, view, ref, keys, pins } = await setup();
  const other = independentObserver(s.library, [...s.peers.values()].map((w) => w.anchor));
  const otherView = await other.project(s.histories(), s.clock());
  const signedClaim = signPressure(keys, ref, "CLOSED", s.clock());
  const P = interpret(view, "P", ref, [signedClaim], pins);
  const Q = interpret(otherView, "Q", ref);
  assert.equal(P.perceived_state, "CLOSED");
  assert.equal(P.owner_observation, "DISCOVERED");
  assert.equal(Q.perceived_state, "OPEN");
  assert.equal((await perceivedProposal(view, P, s.query())).status, "DECLINED_BY_OBSERVER");
  const proposal = await perceivedProposal(otherView, Q, s.query());
  assert.ok(proposal.plans.length);
  assert.equal(s.a.current().grants.size, 0);
  verifyInterpretation(view, P);
  verifyInterpretation(otherView, Q);
});
test("owner gate is unchanged by an authenticated false opening", async () => {
  const { s, path, view, ref, keys, pins } = await setup();
  const report = interpret(view, "P", ref, [signPressure(keys, ref, "OPEN", s.clock())], pins);
  const plan = (await perceivedProposal(view, report, s.query())).plans[0];
  const tokens = authorize(plan, s.peers, "observer-P");
  s.a.withdraw(ref.interface_id);
  const result = await executeDynamic(view, plan, s.sourceArtifact(),
    { peers: s.peers, subject: "observer-P", grants: tokens });
  assert.equal(result.record.result, "failed");
  assert.match(result.record.failures[0].reason, /DOOR_UNAVAILABLE/);
  assert.equal(result.record.operation_tickets.length, 0);
  assert.deepEqual(report.authority, []);
  assert.deepEqual(report.grants, []);
});
test("untrusted actor, tampering and incarnation laundering fail closed", async () => {
  const { s, ref, view, keys, pins } = await setup();
  const claim = signPressure(keys, ref, "CLOSED", s.clock(), "ordinary pressure");
  assert.throws(() => interpret(view, "P", ref, [claim], []), /UNTRUSTED_PRESSURE_ACTOR/);
  const forged = clone(claim);
  forged.claimed_state = "OPEN";
  assert.throws(() => interpret(view, "P", ref, [forged], pins), /INVALID_SIGNATURE/);
  const changed = clone(claim);
  changed.door_ref.offer_id = "offer:other";
  assert.throws(() => interpret(view, "P", ref, [changed], pins), /INVALID_SIGNATURE|INCARCATION/);
  assert.throws(() => signPressure(keys, ref, "GRANT", s.clock()), /INVALID_PRESSURE/);
  assert.throws(() => signPressure(keys, ref, "CLOSED", s.clock() + 1).at_ms === s.clock() + 1
    ? interpret(view, "P", ref, [signPressure(keys, ref, "CLOSED", s.clock() + 1)], pins)
    : null, /INVALID_PRESSURE/);
  const report = interpret(view, "P", ref, [claim], pins);
  const fake = clone(report);
  fake.grants.push("escalation");
  assert.throws(() => verifyInterpretation(view, fake), /SEAL|DIGEST|INVALID/);
});
test("conflicting signed claims remain contested; reorientation is not a grant", async () => {
  const { s, ref, view, keys, pins } = await setup();
  const a = signPressure(keys, ref, "OPEN", s.clock());
  const b = signPressure(keys, ref, "CLOSED", s.clock());
  const report = interpret(view, "P", ref, [a, b], pins);
  assert.equal(report.perceived_state, "CONTESTED");
  const newReport = interpret(view, "P", ref, [a, b], pins, "REORIENT_TO_SELECTED_EVIDENCE");
  assert.equal(newReport.perceived_state, "OPEN");
  assert.equal((await perceivedProposal(view, report, s.query())).plans.length, 0);
  assert.ok((await perceivedProposal(view, newReport, s.query())).plans.length);
  assert.equal(s.a.current().grants.size, 0);
});
test("missing selected history stays UNEXAMINED, not globally CLOSED", async () => {
  const { s, ref } = await setup();
  const narrowed = independentObserver(s.library, [s.c.anchor]);
  const v = await narrowed.project([s.c.history()], s.clock());
  assert.equal(localOwnerObservation(v, ref), "UNEXAMINED");
  const report = interpret(v, "P", ref);
  assert.equal(report.perceived_state, "UNKNOWN");
});
test("proof survives independent repeated cold verification and rejects alteration", async () => {
  const proof = await prove();
  const before = structuredClone(proof);
  const first = await verifyProof(proof);
  const second = await verifyProof(JSON.parse(JSON.stringify(proof)));
  assert.deepEqual(first, second);
  assert.deepEqual(proof, before, "cold verifier mutated the supplied evidence");
  assert.equal(first.successful_routes, 2);
  assert.equal(first.owner_denials, 2);
  const altered = structuredClone(proof);
  altered.reports[0].value.perceived_state = "OPEN";
  await assert.rejects(verifyProof(altered));
  const cut = structuredClone(proof);
  cut.views[0].histories[0].pop();
  await assert.rejects(verifyProof(cut));
});

test("dead composition incarnation keeps a visible historic door but denies actual route", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "perceived-dead-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bridge = await Bridge.create({ root });
  const control = bridge.ownerControl();
  const sourceOwner = new LocalWorld({ clock: bridge.clock });
  const sourceDoor = sourceOwner.publish(bridge.library.nodes.get(id("payload-bytes")));
  const observer = bridge.observer({ anchors: [sourceOwner.anchor], trust: true });
  const eligible = await bridge.runtimeTransition("open-chest");
  const door = bridge.publish(eligible, control);
  const route = await routeTo(bridge, observer, sourceOwner, sourceDoor, door);
  const grants = bridge.authorize(route.plan, route.peers, "visitor", control);
  const ref = doorRef(door);
  const keys = pressureIdentity();
  const pins = [{ world_id: keys.world_id, public_key: keys.public_key }];
  const report = interpret(route.view, "P", ref, [signPressure(keys, ref, "OPEN", 1000)], pins);
  assert.equal(report.owner_observation, "DISCOVERED");
  assert.equal(report.perceived_state, "OPEN");
  await bridge.terminate(control);
  assert.deepEqual(bridge.doors(), []);
  const denied = await bridge.execute(route.view, route.plan, route.source,
    { ...route, subject: "visitor", grants });
  assert.equal(denied.record.result, "failed");
  assert.match(denied.record.failures.map((f) => f.reason).join(" "), /TERMINAL_INSTANCE_DEATH/);
  assert.equal(report.perceived_state, "OPEN");
  assert.deepEqual(report.authority, []);
});
