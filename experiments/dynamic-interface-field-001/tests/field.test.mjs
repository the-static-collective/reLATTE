import test from "node:test";
import assert from "node:assert/strict";
import { specimen } from "../src/specimen.mjs";
import { FieldObserver, propose, verifyProposal } from "../src/field.mjs";
import { LocalWorld } from "../src/world.mjs";
import { authorize, executeDynamic, verifyDynamic } from "../src/runtime.mjs";
import { createComposition } from "../src/composition.mjs";
import { clone, identity, signed, verifyHistory } from "../src/history.mjs";
import {
  digest,
  seal,
  occurrence,
} from "../../interface-superspace-001/src/receipts.mjs";
import { createEnvironment } from "../../interface-superspace-001/src/bindings.mjs";
import { verifyProof } from "../verify-run.mjs";
import { prove } from "../run.mjs";
async function setup(names = ["filesystem-output"], goal) {
  const s = await specimen(),
    path = await s.publishPath(s.a, names),
    view = await s.project(),
    plan = (await propose(view, s.query(goal))).plans[0],
    subject = occurrence("caller");
  assert.ok(plan);
  return { ...s, path, view, plan, subject };
}
const run = (s, grants, opts = {}) =>
  executeDynamic(s.view, s.plan, s.sourceArtifact(), {
    peers: s.peers,
    subject: s.subject,
    grants,
    ...opts,
  });
const grants = (s, options) => authorize(s.plan, s.peers, s.subject, options);
const reseal = (value, field) => {
  const copy = clone(value);
  delete copy[field];
  return seal(copy, field);
};
const anchors = (s) => [...s.peers.values()].map((w) => w.anchor);

test("lifecycle executes replacement, composition and reconstitution; plans stay historical", async () => {
  const p = await prove();
  const verified = await verifyProof(JSON.parse(JSON.stringify(p)));
  assert.equal(verified.verified_occurrences, 9);
  assert.equal(p.normative_core_mutations, 0);
  assert.deepEqual(
    p.milestones.map((m) => m.kind),
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
  assert.equal(p.records.filter((r) => r.result === "succeeded").length, 5);
  assert.equal(p.records.filter((r) => r.result === "failed").length, 3);
  assert.equal(p.crossings.length, 5);
  for (const r of p.records)
    verifyDynamic(
      p.plans.find((x) => x.field_plan_id === r.field_plan_id),
      JSON.parse(JSON.stringify(r)),
      p.anchors,
    );
  const outer = p.records.find((r) => r.nested.length);
  assert.notEqual(
    outer.occurrence_id,
    outer.nested[0].occurrence.occurrence_id,
  );
  assert.notEqual(
    outer.execution.source.particular_id,
    outer.nested[0].occurrence.execution.source.particular_id,
  );
  assert.ok(
    outer.nested[0].occurrence.operation_tickets.every(
      (t) => t.subject === p.composition_manifest.composition_id,
    ),
  );
  assert.ok(p.crossings.every((c) => c.receipt.kind === "R3_HOLD"));
});
test("absence is relative to selected histories, never global absence", async () => {
  const s = await setup();
  const local = await s.observer.project(
    [s.a.history(), s.c.history()],
    s.clock(),
  );
  assert.equal(local.snapshot.scope, "SELECTED_LOCAL_HISTORIES_ONLY");
  assert.equal(local.snapshot.frontiers.length, 2);
  assert.equal((await propose(local, s.query())).status, "CANDIDATES");
  const incomplete = await s.observer.project([s.c.history()], s.clock());
  assert.equal((await propose(incomplete, s.query())).status, "NO_ROUTE");
  assert.equal(
    (await propose(incomplete, s.query())).rejections[0].reasons[0].code,
    "source_not_in_selected_view",
  );
});
test("discovery and selection produce no execution grants", async () => {
  const s = await setup();
  assert.deepEqual(s.plan.authority, []);
  assert.equal(s.a.current().grants.size, 0);
  const r = await run(s, []);
  assert.equal(r.record.result, "failed");
  assert.match(r.record.failures[0].reason, /GRANT_ABSENT/);
  assert.equal(r.record.execution, null);
});
test("withdrawal defeats stale view and old owner grants", async () => {
  const s = await setup(),
    g = grants(s);
  s.a.withdraw(s.path.doors[0].descriptor.interface_id);
  const r = await run(s, g);
  assert.equal(r.record.execution, null);
  assert.match(r.record.failures[0].reason, /DOOR_UNAVAILABLE/);
  await verifyProposal(s.view, s.plan);
  assert.ok(s.plan.field_plan_id);
});
test("expiry defeats a valid signed advertisement and unexpired caller plan", async () => {
  const s = await setup(),
    g = grants(s);
  s.time.value += 60000;
  const r = await run(s, g);
  assert.match(r.record.failures[0].reason, /DOOR_UNAVAILABLE/);
});
test("revocation defeats an otherwise available door", async () => {
  const s = await setup(),
    g = grants(s);
  s.a.revoke(g[1]);
  const r = await run(s, g);
  assert.equal(r.record.result, "failed");
  assert.match(r.record.failures[0].reason, /GRANT_REVOKED/);
  assert.equal(r.record.execution.actual_relation_receipts.length, 0);
  verifyDynamic(s.plan, r.record, anchors(s));
});
test("grant expiry is checked by issuing owner", async () => {
  const s = await setup(),
    g = grants(s, { ttl: 1 });
  s.time.value++;
  const r = await run(s, g);
  assert.match(r.record.failures[0].reason, /GRANT_EXPIRED/);
  assert.equal(r.record.execution, null);
});
test("use bounds cannot be reset by replaying a token", async () => {
  const s = await setup(),
    g = grants(s);
  assert.equal((await run(s, g)).record.result, "succeeded");
  assert.match((await run(s, g)).record.failures[0].reason, /GRANT_EXHAUSTED/);
});
test("same interface ID and bytes after reconstitution have a fresh incarnation", async () => {
  const s = await setup(),
    g = grants(s),
    old = s.path.doors[0];
  s.a.withdraw(old.descriptor.interface_id);
  const next = s.a.publish(old.descriptor, {
    kind: "reconstitute",
    parents: [{ world_id: s.a.world_id, offer_id: old.offer_id }],
  });
  assert.equal(next.descriptor_digest, old.descriptor_digest);
  assert.notEqual(next.offer_id, old.offer_id);
  assert.match(
    (await run(s, g)).record.failures[0].reason,
    /STALE_INCARNATION/,
  );
  assert.throws(
    () => s.a.admitOperation(next, g[1], s.subject, "observe"),
    /GRANT_SCOPE_MISMATCH/,
  );
});
test("missing live publisher is attributable and cannot be replaced by evidence", async () => {
  const s = await setup(),
    g = grants(s);
  s.peers.delete(s.a.world_id);
  const r = await run(s, g);
  assert.match(r.record.failures[0].reason, /PUBLISHER_UNAVAILABLE/);
  assert.equal(r.record.execution, null);
});
test("unrelated door publication does not invalidate an executable historical plan", async () => {
  const s = await setup(),
    g = grants(s);
  s.a.publish({
    ...clone(s.source.descriptor),
    interface_id: occurrence("interface"),
  });
  const r = await run(s, g);
  assert.equal(r.record.result, "succeeded");
  assert.notEqual(
    s.a.head,
    s.plan.frontiers.find((f) => f.world_id === s.a.world_id).head,
  );
});
test("withdrawal at the next boundary preserves the observed prefix", async () => {
  const s = await setup(),
    g = grants(s);
  const r = await run(s, g, {
    beforeStep: ({ index }) => {
      if (index === 1) s.a.withdraw(s.path.doors[0].descriptor.interface_id);
    },
  });
  assert.equal(r.record.result, "failed");
  assert.equal(r.record.execution.actual_relation_receipts.length, 1);
  assert.match(r.record.failures[0].reason, /DOOR_UNAVAILABLE/);
  verifyDynamic(s.plan, r.record, anchors(s));
});
test("withdrawal during an admitted operation is residual evidence, not retroactive erasure", async () => {
  const s = await setup(),
    g = grants(s),
    edge = s.plan.relations[0].descriptor;
  const original = createEnvironment(s.view.registry).bindings.get(
    edge.binding_ref,
  );
  const extraBindings = new Map([
    [
      edge.binding_ref,
      {
        ...original,
        run: async (a, c) => {
          const next = await original.run(a, c);
          s.a.withdraw(s.path.doors[0].descriptor.interface_id);
          return next;
        },
      },
    ],
  ]);
  const r = await run(s, g, { extraBindings });
  assert.equal(r.record.result, "failed");
  assert.equal(r.record.execution.actual_relation_receipts.length, 1);
  assert.match(r.record.lifecycle_residuals[0].reason, /DOOR_UNAVAILABLE/);
  verifyDynamic(s.plan, r.record, anchors(s));
});
test("withdrawing a relation prevents composition through still-open endpoints", async () => {
  const s = await setup(),
    g = grants(s);
  s.a.withdrawRelation(s.path.relations[0].descriptor.relation_id);
  assert.match(
    (await run(s, g)).record.failures[0].reason,
    /RELATION_UNAVAILABLE/,
  );
});
test("subject, operation and forged tokens cannot widen owner permission", async () => {
  const s = await setup(),
    g = grants(s),
    door = s.path.doors[0];
  assert.throws(
    () => s.a.admitOperation(door, g[1], "other", "observe"),
    /GRANT_SCOPE/,
  );
  assert.throws(
    () => s.a.admitOperation(door, g[1], s.subject, "mutate"),
    /GRANT_SCOPE/,
  );
  assert.throws(
    () =>
      s.a.admitOperation(
        door,
        { ...g[1], max_uses: 128 },
        s.subject,
        "observe",
      ),
    /INVALID_SIGNATURE/,
  );
  const hostile = {
    ...clone(door.descriptor),
    interface_id: occurrence("interface"),
    operations: ["observe", "configure"],
  };
  const fake = s.a.publish(hostile);
  assert.throws(
    () => s.a.issueGrant(fake, { subject: s.subject, operation: "configure" }),
    /OPERATION_NOT_AUTHORIZED/,
  );
});
test("reconstitution requires inspectable prior local lineage", async () => {
  const s = await setup(),
    old = s.path.doors[0];
  s.a.withdraw(old.descriptor.interface_id);
  assert.throws(
    () => s.a.publish(old.descriptor, { kind: "reconstitute" }),
    /LINEAGE_REQUIRED/,
  );
  assert.throws(
    () =>
      s.a.publish(old.descriptor, {
        kind: "reconstitute",
        parents: [{ world_id: s.a.world_id, offer_id: "invented" }],
      }),
    /LINEAGE_MISMATCH/,
  );
});
test("fork has new identity, explicit parent, separate trust and no inherited grants", async () => {
  const s = await setup(),
    g = grants(s),
    d = {
      ...clone(s.path.doors[0].descriptor),
      interface_id: occurrence("interface"),
    };
  const f = s.a.fork(s.path.doors[0], d);
  assert.notEqual(f.child.world_id, s.a.world_id);
  assert.equal(f.child.current().grants.size, 0);
  assert.equal(f.door.parents[0].offer_id, s.path.doors[0].offer_id);
  assert.throws(
    () => f.child.admitOperation(f.door, g[1], s.subject, "observe"),
    /UNTRUSTED_SIGNER/,
  );
  await assert.rejects(
    s.observer.project([...s.histories(), f.child.history()], s.clock()),
    /UNTRUSTED_PUBLISHER/,
  );
  s.observer.trust(f.child.anchor);
  s.observer.extendAttestations({ surfaces: [d], contracts: {} });
  const view = await s.observer.project(
    [...s.histories(), f.child.history()],
    s.clock(),
  );
  assert.ok(view.doors.has(d.interface_id));
  const token = f.child.issueGrant(f.door, {
    subject: s.subject,
    operation: "observe",
  });
  assert.ok(f.child.admitOperation(f.door, token, s.subject, "observe"));
});
test("tampered history, rollback, duplicate roots and future claims are rejected", async () => {
  const s = await setup(),
    histories = s.histories();
  const bad = clone(histories);
  bad[0][1].payload.descriptor.protocol = "fake";
  await assert.rejects(s.observer.project(bad, s.clock()), /INVALID_SIGNATURE/);
  await assert.rejects(
    s.observer.project([histories[0], histories[0]], s.clock()),
    /DUPLICATE_PUBLISHER/,
  );
  await assert.rejects(
    s.observer.project([histories[0].slice(0, -1)], s.clock()),
    /ROLLBACK_OR_EQUIVOCATION/,
  );
  await assert.rejects(
    s.observer.project(histories, s.clock() - 1),
    /FUTURE_HISTORY/,
  );
});
test("clock rollback cannot revive expired grants", async () => {
  const s = await setup();
  s.time.value += 10;
  s.a.current();
  s.time.value--;
  assert.throws(() => s.a.current(), /CLOCK_REGRESSION/);
});
test("publisher signatures do not override protocol or implementation attestations", async () => {
  const s = await setup();
  const malicious = {
    ...clone(s.source.descriptor),
    interface_id: occurrence("interface"),
    protocol: "invented",
  };
  s.b.publish(malicious);
  await assert.rejects(s.project(), /UNATTESTED_SURFACE/);
});
test("signed duplicate publication and fabricated descriptor digests are rejected", async () => {
  const s = await setup(),
    p = clone(s.a.history().find((e) => e.kind === "publish").payload);
  p.offer_id = occurrence("offer");
  assert.throws(() => s.a.append("publish", p), /DOOR_ALREADY_OPEN/);
  p.descriptor.interface_id = occurrence("interface");
  assert.throws(() => s.a.append("publish", p), /DESCRIPTOR_DIGEST_MISMATCH/);
});
test("a self-signed root is not discovery authority", async () => {
  const keys = identity(),
    e = signed(
      {
        schema: "relatte.dynamic-field-event.experimental/v0",
        event_id: "event:x",
        world_id: keys.world_id,
        seq: 0,
        previous: null,
        at_ms: 1000,
        kind: "genesis",
        payload: { parent: null },
      },
      keys,
    );
  assert.ok(
    verifyHistory([e], {
      world_id: keys.world_id,
      public_key: keys.public_key,
    }),
  );
  const s = await specimen();
  await assert.rejects(
    s.observer.project([[e]], s.clock()),
    /UNTRUSTED_PUBLISHER/,
  );
});
test("view mutation and resealed plan substitution do not masquerade as discovery", async () => {
  const s = await setup();
  const bad = clone(s.plan);
  bad.doors[1].offer_id = "offer:fake";
  await assert.rejects(
    verifyProposal(s.view, reseal(bad, "field_plan_digest")),
    /FIELD_PLAN_DOOR_MISMATCH/,
  );
  s.view.doors.delete(s.path.doors[0].descriptor.interface_id);
  await assert.rejects(propose(s.view, s.query()), /VIEW_PROJECTION_MISMATCH/);
});
test("opaque interface renaming retains dynamic routes without participant switches", async () => {
  const s = await setup(),
    view = s.view;
  const names = new Map(
    view.registry.interfaces.map((d, i) => [
      d.interface_id,
      "interface:opaque-" + i,
    ]),
  );
  const surfaces = view.registry.surfaces.map((d) => ({
    ...clone(d),
    interface_id: names.get(d.interface_id) ?? d.interface_id,
    participant_ref: "participant:opaque",
  }));
  const descriptors = view.registry.interfaces.map((d) => ({
    ...clone(d),
    interface_id: names.get(d.interface_id),
    participant_ref: "participant:opaque",
  }));
  const relations = view.registry.relations.map((r) => ({
    ...clone(r),
    source: names.get(r.source),
    destination: names.get(r.destination),
  }));
  // Attestations retain original binding contracts: endpoint semantics ignore nouns.
  const worlds = [
      new LocalWorld({ clock: s.clock }),
      new LocalWorld({ clock: s.clock }),
    ],
    active = new Map();
  for (const d of descriptors) active.set(d.interface_id, worlds[0].publish(d));
  for (const r of relations)
    worlds[1].publishRelation(
      r,
      active.get(r.source),
      active.get(r.destination),
    );
  const observer = new FieldObserver({
    anchors: worlds.map((w) => w.anchor),
    surfaces: [...view.registry.surfaces, ...surfaces],
    contracts: view.registry.contracts,
  });
  const opaque = await observer.project(
      worlds.map((w) => w.history()),
      s.clock(),
    ),
    q = s.query();
  q.from = names.get(q.from);
  q.constraints.permissions = opaque.registry.relations
    .filter((r) => r.requires.authority)
    .map((r) => r.destination + "/" + r.requires.authority);
  const candidate = (await propose(opaque, q)).plans[0];
  assert.ok(candidate);
  assert.deepEqual(
    candidate.route.interface_sequence,
    s.plan.route.interface_sequence.map((id) => names.get(id)),
  );
});
async function compositionSetup() {
  const s = await setup(
    ["midi-event-out", "midi-event-in", "midi-reconstruction"],
    "adapter.observation",
  );
  const c = await createComposition({
    memberView: s.view,
    memberPlan: s.plan,
    clock: s.clock,
  });
  return { s, c };
}
const context = () => ({
  parent: { particular_id: "particular:outer" },
  dynamic_record: { nested: [] },
});
test("composition publishes new particulars and cannot mint member authority", async () => {
  const { s, c } = await compositionSetup();
  assert.notEqual(
    c.input.descriptor.interface_id,
    s.source.descriptor.interface_id,
  );
  assert.equal(c.world.current().grants.size, 0);
  assert.deepEqual(c.manifest.authority, {
    observe: true,
    propose: false,
    authorize: false,
    mutate: false,
  });
  await assert.rejects(
    c.binding.run(s.sourceArtifact(), context()),
    /MEMBER_AUTHORITY_ABSENT/,
  );
  assert.throws(
    () =>
      c.world.issueGrant(c.input, { subject: s.subject, operation: "mutate" }),
    /OPERATION_NOT_AUTHORIZED/,
  );
});
test("composition checks live members and retains nested failure occurrence", async () => {
  const { s, c } = await compositionSetup();
  c.installMemberAuthority({
    peers: s.peers,
    subject: s.subject,
    grants: grants(s),
  });
  s.a.withdraw(s.path.doors[0].descriptor.interface_id);
  const ctx = context();
  await assert.rejects(
    c.binding.run(s.sourceArtifact(), ctx),
    /COMPOSITION_MEMBER_FAILED/,
  );
  assert.equal(ctx.dynamic_record.nested.length, 1);
  assert.equal(ctx.dynamic_record.nested[0].occurrence.result, "failed");
  assert.match(
    ctx.dynamic_record.nested[0].occurrence.failures[0].reason,
    /DOOR_UNAVAILABLE/,
  );
});
test("composition limits are immutable, enforce call count and reject byte widening", async () => {
  const s = await setup(["filesystem-output"], "adapter.observation"),
    limits = { max_calls: 1, max_bytes: 4096, max_steps: 8, ttl: 60000 };
  const c = await createComposition({
    memberView: s.view,
    memberPlan: s.plan,
    clock: s.clock,
    limits,
  });
  c.installMemberAuthority({
    peers: s.peers,
    subject: s.subject,
    grants: grants(s, { max_uses: 2 }),
  });
  limits.max_calls = 999;
  assert.equal(
    (await c.binding.run(s.sourceArtifact(), context())).representation,
    "adapter.observation",
  );
  await assert.rejects(
    c.binding.run(s.sourceArtifact(), context()),
    /COMPOSITION_EXHAUSTED/,
  );
  const { s: t, c: d } = await compositionSetup();
  d.installMemberAuthority({
    peers: t.peers,
    subject: t.subject,
    grants: grants(t),
  });
  await assert.rejects(
    d.binding.run({ bytes: Buffer.alloc(4097) }, context()),
    /COMPOSITION_CAPACITY/,
  );
});
test("composition rejects unbounded depth, network and endpoint-crossing scope", async () => {
  const s = await setup();
  await assert.rejects(
    createComposition({
      memberView: s.view,
      memberPlan: s.plan,
      clock: s.clock,
    }),
    /UNSUPPORTED_COMPOSITION_SCOPE/,
  );
  const { s: t } = await compositionSetup();
  await assert.rejects(
    createComposition({
      memberView: t.view,
      memberPlan: t.plan,
      clock: t.clock,
      limits: { max_calls: 9, max_bytes: 4096, max_steps: 8, ttl: 60000 },
    }),
    /UNBOUNDED_COMPOSITION/,
  );
});
test("receipt tampering cannot swap an operation ticket or omit required tickets", async () => {
  const s = await setup(),
    r = (await run(s, grants(s))).record;
  const fake = clone(r);
  fake.operation_tickets[1] = fake.operation_tickets[0];
  assert.throws(
    () =>
      verifyDynamic(
        s.plan,
        reseal(fake, "dynamic_execution_digest"),
        anchors(s),
      ),
    /TICKET_SEQUENCE_MISMATCH/,
  );
  const noTickets = clone(r);
  noTickets.operation_tickets = [];
  assert.throws(
    () =>
      verifyDynamic(
        s.plan,
        reseal(noTickets, "dynamic_execution_digest"),
        anchors(s),
      ),
    /INCOMPLETE_TICKETS/,
  );
});

test("permission and operation are independent scopes for a configuration door", async () => {
  const s = await setup(),
    descriptor = {
      ...clone(s.source.descriptor),
      interface_id: occurrence("interface"),
      operations: ["observe", "configure"],
      authority: {
        observe: true,
        propose: false,
        authorize: false,
        mutate: true,
      },
    },
    door = s.a.publish(descriptor);
  assert.throws(
    () =>
      s.a.issueGrant(door, {
        subject: s.subject,
        operation: "configure",
        permission: "observe",
      }),
    /OPERATION_NOT_AUTHORIZED/,
  );
  const token = s.a.issueGrant(door, {
    subject: s.subject,
    operation: "configure",
    permission: "mutate",
  });
  assert.equal(token.operation, "configure");
  assert.equal(token.permission, "mutate");
  assert.throws(
    () => s.a.admitOperation(door, token, s.subject, "observe", "mutate"),
    /GRANT_SCOPE_MISMATCH/,
  );
  assert.equal(
    s.a.admitOperation(door, token, s.subject, "configure", "mutate").operation,
    "configure",
  );
});
test("equivocation is rejected even when both alternative histories are signed", async () => {
  const s = await specimen(),
    keys = identity(),
    anchor = { world_id: keys.world_id, public_key: keys.public_key };
  const base = {
    schema: "relatte.dynamic-field-event.experimental/v0",
    event_id: "event:root",
    world_id: keys.world_id,
    seq: 0,
    previous: null,
    at_ms: 1000,
    kind: "genesis",
    payload: { parent: null },
  };
  const one = signed(base, keys),
    two = signed({ ...base, event_id: "event:other-root" }, keys);
  s.observer.trust(anchor);
  await s.observer.project([[one]], s.clock());
  await assert.rejects(
    s.observer.project([[two]], s.clock()),
    /ROLLBACK_OR_EQUIVOCATION/,
  );
});
test("failed projection does not poison an observer frontier", async () => {
  const s = await setup(),
    bad = s.b.publish({
      ...clone(s.source.descriptor),
      interface_id: occurrence("interface"),
      protocol: "invented",
    });
  await assert.rejects(s.project(), /UNATTESTED_SURFACE/);
  s.b.withdraw(bad.descriptor.interface_id);
  assert.ok(await s.project());
});
test("owner cannot label an unrelated event as a fork of an existing door", async () => {
  const s = await setup(),
    child = new LocalWorld({ clock: s.clock });
  assert.throws(
    () =>
      s.a.append("fork", {
        child: child.anchor,
        parent: {
          world_id: s.a.world_id,
          head: s.a.head,
          offer_id: "invented",
          interface_id: s.source.descriptor.interface_id,
        },
      }),
    /FORK_PARENT_MISMATCH/,
  );
});
