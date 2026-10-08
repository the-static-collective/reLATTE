import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { specimen } from "../dynamic-interface-field-001/src/specimen.mjs";
import { authorize, executeDynamic } from "../dynamic-interface-field-001/src/runtime.mjs";
import { independentObserver, doorRef, pressureIdentity, signPressure, interpret, perceivedProposal } from "./lens.mjs";
import { clone } from "../dynamic-interface-field-001/src/history.mjs";
import { verifyProof } from "./verify.mjs";

export async function prove() {
  const s = await specimen();
  const path = await s.publishPath(s.a, ["filesystem-output"]);
  const ref = doorRef(path.doors[0]);
  const initial = s.histories();
  const owner_anchors = [...s.peers.values()].map((w) => w.anchor);
  const p = independentObserver(s.library, owner_anchors);
  const q = independentObserver(s.library, owner_anchors);
  const viewP = await p.project(initial, s.clock());
  const viewQ = await q.project(clone(initial), s.clock());
  const actor = pressureIdentity();
  const pressureAnchors = [{ world_id: actor.world_id, public_key: actor.public_key }];
  const closed = signPressure(actor, ref, "CLOSED", s.clock(), "External actor asserts closure");
  const reportP = interpret(viewP, "P", ref, [closed], pressureAnchors);
  const reportQ = interpret(viewQ, "Q", ref);
  const declined = await perceivedProposal(viewP, reportP, s.query());
  if (declined.status !== "DECLINED_BY_OBSERVER" || declined.plans.length)
    throw new Error("FALSE_CLOSURE_NOT_PRESERVED");
  const qChoice = await perceivedProposal(viewQ, reportQ, s.query());
  const qPlan = qChoice.plans[0];
  if (!qPlan) throw new Error("MISSING_Q_ROUTE");
  const subjectQ = "observer-Q";
  const grantsQ = authorize(qPlan, s.peers, subjectQ);
  const success = (await executeDynamic(viewQ, qPlan, s.sourceArtifact(),
    { peers: s.peers, subject: subjectQ, grants: grantsQ })).record;
  if (success.result !== "succeeded") throw new Error("Q_EXECUTION_FAILED");

  const reoriented = interpret(viewP, "P", ref, [closed], pressureAnchors,
    "REORIENT_TO_SELECTED_EVIDENCE");
  const pChoice = await perceivedProposal(viewP, reoriented, s.query());
  const pPlan = pChoice.plans[0];
  if (!pPlan) throw new Error("REORIENTATION_DID_NOT_PROPOSE");
  const subjectP = "observer-P";
  const grantsP = authorize(pPlan, s.peers, subjectP);
  const recovered = (await executeDynamic(viewP, pPlan, s.sourceArtifact(),
    { peers: s.peers, subject: subjectP, grants: grantsP })).record;
  if (recovered.result !== "succeeded") throw new Error("P_EXECUTION_FAILED");

  // An outdated P may perceive an opening even after owner withdrawal.
  const open = signPressure(actor, ref, "OPEN", s.clock(), "External actor asserts opening");
  const falseOpen = interpret(viewP, "P", ref, [open], pressureAnchors);
  const oldChoice = await perceivedProposal(viewP, falseOpen, s.query());
  const oldPlan = oldChoice.plans[0];
  if (!oldPlan) throw new Error("MISSING_HISTORICAL_ROUTE");
  const oldGrants = authorize(oldPlan, s.peers, "visitor-old");
  s.a.withdraw(ref.interface_id);
  const withdrawn = (await executeDynamic(viewP, oldPlan, s.sourceArtifact(),
    { peers: s.peers, subject: "visitor-old", grants: oldGrants })).record;
  if (withdrawn.result !== "failed" ||
      !withdrawn.failures.some((f) => /DOOR_UNAVAILABLE/.test(f.reason)))
    throw new Error("WITHDRAWAL_GATE_FAILED");

  const reborn = s.a.publish(path.doors[0].descriptor, {
    kind: "reconstitute",
    parents: [{ world_id: s.a.world_id, offer_id: ref.offer_id }],
  });
  if (reborn.offer_id === ref.offer_id) throw new Error("INCARNATION_REUSED");
  const stale = (await executeDynamic(viewP, oldPlan, s.sourceArtifact(),
    { peers: s.peers, subject: "visitor-old", grants: oldGrants })).record;
  if (stale.result !== "failed" ||
      !stale.failures.some((f) => /STALE_INCARNATION/.test(f.reason)))
    throw new Error("RECONSTITUTION_GATE_FAILED");
  return {
    schema: "relatte.perceived-affordance-proof.experimental/v0",
    normative_core_mutations: 0, owner_anchors,
    owner_histories: s.histories(),
    views: [
      { name: "P", histories: initial, snapshot: viewP.snapshot },
      { name: "Q", histories: initial, snapshot: viewQ.snapshot },
    ],
    reports: [
      { view: "P", value: reportP }, { view: "Q", value: reportQ },
      { view: "P", value: reoriented }, { view: "P", value: falseOpen },
    ],
    declined: { view: "P", interpretation_digest: reportP.interpretation_digest,
      status: declined.status, plans: declined.plans },
    plans: [
      { view: "Q", value: qPlan }, { view: "P", value: pPlan },
      { view: "P", value: oldPlan },
    ],
    occurrences: [
      { plan_id: qPlan.field_plan_id, record: success, outcome: "succeeded" },
      { plan_id: pPlan.field_plan_id, record: recovered, outcome: "succeeded" },
      { plan_id: oldPlan.field_plan_id, record: withdrawn, outcome: "withdrawn" },
      { plan_id: oldPlan.field_plan_id, record: stale, outcome: "stale_incarnation" },
    ],
    old_ref: ref, new_ref: doorRef(reborn),
  };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const proof = await prove();
  const verified = await verifyProof(proof);
  const dir = resolve("work/perceived-affordance-field-001");
  await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, "proof.json"), JSON.stringify(proof, null, 2) + "\n");
  console.log(JSON.stringify({ file: resolve(dir, "proof.json"), ...verified }));
}
