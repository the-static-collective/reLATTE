import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { specimen, adaptRelation } from "./src/specimen.mjs";
import { propose } from "./src/field.mjs";
import { authorize, executeDynamic, verifyDynamic } from "./src/runtime.mjs";
import { createComposition } from "./src/composition.mjs";
import {
  occurrence,
  digest,
} from "../interface-superspace-001/src/receipts.mjs";
import { clone } from "./src/history.mjs";
import { verifyCrossing } from "../interface-superspace-001/src/verifier.mjs";
export async function prove() {
  const s = await specimen(),
    views = [],
    plans = [],
    records = [],
    crossings = [],
    milestones = [];
  const saveView = (v) => {
    views.push({ snapshot: v.snapshot, histories: s.histories() });
    return v;
  };
  const run = async (v, p, grants, subject, extraBindings = new Map()) => {
    const result = await executeDynamic(v, p, s.sourceArtifact(), {
      peers: s.peers,
      grants,
      subject,
      extraBindings,
    });
    verifyDynamic(
      p,
      result.record,
      [...s.peers.values()].map((w) => w.anchor),
    );
    records.push(result.record);
    if (result.artifact.crossing) {
      assert.ok(await verifyCrossing(result.artifact));
      crossings.push({
        occurrence_id: result.record.occurrence_id,
        crossing: result.artifact.crossing,
        receipt: result.artifact.receipt,
      });
    }
    return result;
  };
  const before = saveView(await s.project());
  assert.equal((await propose(before, s.query())).status, "NO_ROUTE");
  milestones.push({ kind: "no-door", view: before.snapshot.view_digest });
  const x = await s.publishPath(s.a, ["filesystem-output"]);
  const vx = saveView(await s.project()),
    px = (await propose(vx, s.query())).plans[0];
  plans.push(px);
  const executor = occurrence("caller"),
    oldGrants = authorize(px, s.peers, executor, { max_uses: 2 });
  const first = await run(vx, px, oldGrants, executor);
  assert.equal(first.record.result, "succeeded");
  milestones.push({ kind: "X-open", offer_id: x.doors[0].offer_id });
  s.time.value++;
  s.a.withdraw(x.doors[0].descriptor.interface_id);
  const closed = saveView(await s.project());
  assert.equal((await propose(closed, s.query())).status, "NO_ROUTE");
  const stale = await run(vx, px, oldGrants, executor);
  assert.equal(stale.record.result, "failed");
  assert.equal(stale.record.execution, null);
  milestones.push({
    kind: "X-withdrawn",
    historical_plan: px.field_plan_id,
    denied: stale.record.occurrence_id,
  });
  const y = await s.publishPath(s.b, [
    "midi-event-out",
    "midi-event-in",
    "midi-reconstruction",
  ]);
  const vy = saveView(await s.project()),
    py = (await propose(vy, s.query())).plans[0];
  plans.push(py);
  const fresh = await run(vy, py, authorize(py, s.peers, executor), executor);
  assert.equal(fresh.record.result, "succeeded");
  milestones.push({
    kind: "Y-open",
    offer_id: y.doors[0].offer_id,
    new_plan: py.field_plan_id,
  });
  const member = (await propose(vy, s.query("adapter.observation"))).plans[0];
  plans.push(member);
  const composition = await createComposition({
    memberView: vy,
    memberPlan: member,
    clock: s.clock,
  });
  s.peers.set(composition.world.world_id, composition.world);
  s.observer.trust(composition.world.anchor);
  s.observer.extendAttestations(composition.attestations);
  const memberSubject = composition.manifest.composition_id;
  composition.installMemberAuthority({
    peers: s.peers,
    subject: memberSubject,
    grants: authorize(member, s.peers, memberSubject),
  });
  const inbound = adaptRelation(
    s.library.relations.find(
      (r) =>
        r.source === s.source.descriptor.interface_id &&
        r.destination === x.doors[0].descriptor.interface_id,
    ),
    s.source,
    composition.input,
  );
  inbound.postconditions = ["ordered"];
  inbound.requires.authority = "observe";
  inbound.binding_ref = occurrence("binding");
  inbound.verification_ref = occurrence("verification");
  const outbound = adaptRelation(
    s.library.relations.find(
      (r) =>
        r.source === s.observation.descriptor.interface_id &&
        r.destination === s.intake.descriptor.interface_id,
    ),
    composition.output,
    s.intake,
  );
  outbound.binding_ref = occurrence("binding");
  outbound.verification_ref = occurrence("verification");
  // Endpoint aliases are new local boundary contracts, not planner conditionals.
  const surfaces = [clone(s.source.descriptor), clone(s.intake.descriptor)];
  const contracts = {
    [inbound.binding_ref]: inbound,
    [outbound.binding_ref]: outbound,
  };
  s.observer.extendAttestations({ surfaces, contracts });
  composition.world.publishRelation(inbound, s.source, composition.input);
  composition.world.publishRelation(outbound, composition.output, s.intake);
  const compositionHistories = () => [
    ...s.histories(),
    composition.world.history(),
  ];
  const vc = await s.observer.project(compositionHistories(), s.clock());
  views.push({ snapshot: vc.snapshot, histories: compositionHistories() });
  const compositionQuery = s.query();
  compositionQuery.constraints.permissions = vc.registry.relations
    .filter((r) => r.requires.authority)
    .map((r) => r.destination + "/" + r.requires.authority);
  const pc = (await propose(vc, compositionQuery)).plans.find((p) =>
    p.route.interface_sequence.includes(
      composition.input.descriptor.interface_id,
    ),
  );
  assert.ok(pc);
  plans.push(pc);
  const env = (
    await import("../interface-superspace-001/src/bindings.mjs")
  ).createEnvironment(vc.registry);
  const receiver = env.bindings.get(
    s.library.relations.find((r) => r.kind === "cross").binding_ref,
  );
  const extra = new Map([
    [
      inbound.binding_ref,
      {
        contract_digest: digest(inbound),
        verify: async (a, b) => b.bytes.equals(a.bytes),
        run: async (a) => ({
          ...a,
          representation: "payload.bytes",
          native_ref: occurrence("composition-entry"),
          evidence: {
            native: { composition_id: composition.manifest.composition_id },
            facts: ["ordered"],
          },
        }),
      },
    ],
    [composition.relation.descriptor.binding_ref, composition.binding],
    [outbound.binding_ref, { ...receiver, contract_digest: digest(outbound) }],
  ]);
  const outerGrants = authorize(pc, s.peers, executor);
  const composed = await run(vc, pc, outerGrants, executor, extra);
  assert.equal(composed.record.result, "succeeded");
  assert.equal(composed.record.nested.length, 1);
  milestones.push({
    kind: "composition-new-door",
    composition_id: composition.manifest.composition_id,
    interface_id: composition.input.descriptor.interface_id,
    occurrence: composed.record.occurrence_id,
  });
  assert.ok(
    !composition.world
      .current()
      .doors.has(composition.input.descriptor.interface_id),
  );
  const retired = await s.observer.project(compositionHistories(), s.clock());
  views.push({ snapshot: retired.snapshot, histories: compositionHistories() });
  const retiredAttempt = await run(vc, pc, outerGrants, executor, extra);
  assert.equal(retiredAttempt.record.result, "failed");
  assert.match(retiredAttempt.record.failures[0].reason, /DOOR_UNAVAILABLE/);
  milestones.push({
    kind: "composition-retired",
    historical_plan: pc.field_plan_id,
    denied: retiredAttempt.record.occurrence_id,
  });
  const reconstituted = s.a.publish(x.doors[0].descriptor, {
    kind: "reconstitute",
    parents: [{ world_id: s.a.world_id, offer_id: x.doors[0].offer_id }],
  });
  s.active.set(reconstituted.descriptor.interface_id, reconstituted);
  for (const r of x.relations) {
    s.a.withdrawRelation(r.descriptor.relation_id);
    s.publishEdge(s.a, r.descriptor);
  }
  const after = await s.observer.project(compositionHistories(), s.clock());
  views.push({ snapshot: after.snapshot, histories: compositionHistories() });
  const aba = await run(vx, px, oldGrants, executor);
  assert.equal(aba.record.result, "failed");
  assert.match(aba.record.failures[0].reason, /STALE_INCARNATION/);
  const afterQuery = s.query();
  afterQuery.constraints.permissions = after.registry.relations
    .filter((r) => r.requires.authority)
    .map((r) => r.destination + "/" + r.requires.authority);
  const replan = (await propose(after, afterQuery)).plans.find((p) =>
    p.route.interface_sequence.includes(reconstituted.descriptor.interface_id),
  );
  plans.push(replan);
  const again = await run(
    after,
    replan,
    authorize(replan, s.peers, executor),
    executor,
    extra,
  );
  assert.equal(again.record.result, "succeeded");
  milestones.push({
    kind: "reconstituted",
    previous_offer: x.doors[0].offer_id,
    new_offer: reconstituted.offer_id,
    stale_denied: aba.record.occurrence_id,
  });
  const forkDescriptor = {
    ...clone(y.doors[0].descriptor),
    interface_id: occurrence("interface"),
    participant_ref: occurrence("participant"),
  };
  const fork = s.b.fork(y.doors[0], forkDescriptor);
  s.peers.set(fork.child.world_id, fork.child);
  assert.throws(() =>
    fork.child.admitOperation(fork.door, oldGrants[0], executor, "observe"),
  );
  s.observer.trust(fork.child.anchor);
  s.observer.extendAttestations({ surfaces: [forkDescriptor], contracts: {} });
  const eventIn = adaptRelation(y.relations[0].descriptor, s.source, fork.door);
  const eventOut = adaptRelation(
    y.relations[1].descriptor,
    fork.door,
    y.doors[1],
  );
  fork.child.publishRelation(eventIn, s.source, fork.door);
  fork.child.publishRelation(eventOut, fork.door, y.doors[1]);
  const forkHistories = [...compositionHistories(), fork.child.history()],
    vf = await s.observer.project(forkHistories, s.clock());
  views.push({ snapshot: vf.snapshot, histories: forkHistories });
  const forkQuery = s.query();
  forkQuery.constraints.permissions = vf.registry.relations
    .filter((r) => r.requires.authority)
    .map((r) => r.destination + "/" + r.requires.authority);
  const pf = (await propose(vf, forkQuery)).plans.find((p) =>
    p.route.interface_sequence.includes(forkDescriptor.interface_id),
  );
  assert.ok(pf);
  plans.push(pf);
  const forkRun = await run(
    vf,
    pf,
    authorize(pf, s.peers, executor),
    executor,
    extra,
  );
  assert.equal(forkRun.record.result, "succeeded");
  milestones.push({
    kind: "fork",
    parent_offer: y.doors[0].offer_id,
    child_world: fork.child.world_id,
    child_offer: fork.door.offer_id,
    inherited_grants: [],
    fresh_occurrence: forkRun.record.occurrence_id,
  });
  return {
    schema: "relatte.dynamic-field-proof.experimental/v0",
    anchors: [...s.peers.values()].map((w) => w.anchor),
    histories: [...s.peers.values()].map((w) => w.history()),
    views,
    plans,
    records,
    crossings,
    milestones,
    composition_manifest: composition.manifest,
    composition_receipts: composition.receipts(),
    extra_attestations: {
      surfaces: [
        ...composition.attestations.surfaces,
        ...surfaces,
        forkDescriptor,
      ],
      contracts: { ...composition.attestations.contracts, ...contracts },
    },
    normative_core_mutations: 0,
  };
}
if (
  process.argv[1] &&
  new URL(import.meta.url).pathname === resolve(process.argv[1])
) {
  const result = await prove(),
    out = resolve(
      process.env.DYNAMIC_FIELD_OUT ?? "work/dynamic-interface-field-001",
    );
  await mkdir(out, { recursive: true });
  await writeFile(
    resolve(out, "proofs.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(
    JSON.stringify(
      {
        milestones: result.milestones.map((m) => m.kind),
        succeeded: result.records.filter((r) => r.result === "succeeded")
          .length,
        denied: result.records.filter((r) => r.result === "failed").length,
        evidence: resolve(out, "proofs.json"),
      },
      null,
      2,
    ),
  );
}
