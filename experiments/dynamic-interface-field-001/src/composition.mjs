import { LocalWorld } from "./world.mjs";
import { clone, newId } from "./history.mjs";
import { digest } from "../../interface-superspace-001/src/receipts.mjs";
import { verifyProposal } from "./field.mjs";
import { executeDynamic, verifyDynamic } from "./runtime.mjs";
export async function createComposition({
  memberView,
  memberPlan,
  clock,
  limits = { max_calls: 1, max_bytes: 4096, max_steps: 8, ttl: 60000 },
}) {
  await verifyProposal(memberView, memberPlan);
  limits = clone(limits);
  memberPlan = clone(memberPlan);
  if (
    !Number.isInteger(limits.max_calls) ||
    limits.max_calls < 1 ||
    limits.max_calls > 8 ||
    !Number.isInteger(limits.max_bytes) ||
    limits.max_bytes < 1 ||
    limits.max_bytes > 4096 ||
    !Number.isInteger(limits.max_steps) ||
    limits.max_steps < 1 ||
    limits.max_steps > 8 ||
    !Number.isInteger(limits.ttl) ||
    limits.ttl < 1 ||
    limits.ttl > 60000
  )
    throw new Error("UNBOUNDED_COMPOSITION");
  const route = memberPlan.route;
  if (
    !route.relation_sequence.length ||
    memberPlan.doors.some((d) =>
      d.descriptor.capabilities.includes("bounded.observation"),
    ) ||
    route.relation_sequence.length > limits.max_steps ||
    route.request.constraints.network ||
    route.request.constraints.mutation_authority ||
    route.request.constraints.loss_budget ||
    route.destination_goal.emits !== "adapter.observation"
  )
    throw new Error("UNSUPPORTED_COMPOSITION_SCOPE");
  if (
    memberPlan.relations.some(
      (r) =>
        r.descriptor.requires.network ||
        ["mutate", "authorize", "configure", "perturb"].includes(
          r.descriptor.operation,
        ) ||
        r.descriptor.requires.authority === "mutate" ||
        !r.descriptor.preserves.bytes,
    )
  )
    throw new Error("COMPOSITION_AUTHORITY_OR_LOSS_ESCALATION");
  const world = new LocalWorld({ clock }),
    composition_id = newId("composition");
  const manifest = {
    schema: "relatte.composition-instance.experimental/v0",
    composition_id,
    world_id: world.world_id,
    member_plan_digest: memberPlan.field_plan_digest,
    member_doors: memberPlan.doors.map((d) => ({
      world_id: d.world_id,
      interface_id: d.descriptor.interface_id,
      offer_id: d.offer_id,
    })),
    limits: clone(limits),
    authority: {
      observe: true,
      propose: false,
      authorize: false,
      mutate: false,
    },
    network: false,
    arbitrary_shell: false,
    recursion: false,
  };
  world.append("composition-created", manifest);
  const base = clone(memberView.registry.nodes.get(route.source_interface)),
    input = {
      ...base,
      interface_id: newId("interface"),
      participant_ref: composition_id,
      direction: "input",
      protocol: "bounded-composition-call/v0",
      operations: ["observe"],
      capabilities: ["bounded.observation"],
      authority: clone(manifest.authority),
      information: {
        ...base.information,
        capacity: limits.max_bytes,
        native_dimensions: [
          "composition instance",
          "input parent",
          "member occurrence refs",
        ],
      },
      state: { retention: "relational", replayable: false },
      evidence: {
        produces: ["composition receipt"],
        verification: ["nested route verification", "member owner gates"],
        source_ref: digest(manifest) + ":input",
      },
      constraints: {
        required: [],
        forbidden: ["network", "arbitrary_shell", "mutate", "authorize"],
      },
    };
  const output = {
    ...clone(input),
    interface_id: newId("interface"),
    direction: "output",
    accepts: ["adapter.observation"],
    emits: ["adapter.observation"],
    evidence: { ...input.evidence, source_ref: digest(manifest) + ":output" },
  };
  const inDoor = world.publish(input, { ttl: limits.ttl }),
    outDoor = world.publish(output, { ttl: limits.ttl });
  const template = clone(memberPlan.relations[0].descriptor);
  const relation = {
    ...template,
    relation_id: newId("relation"),
    source: input.interface_id,
    destination: output.interface_id,
    consumes: input.emits[0],
    produces: output.emits[0],
    operation: "observe",
    preconditions: ["ordered"],
    postconditions: ["observed"],
    removes: [],
    kind: "transform",
    requires: {
      network: false,
      live_participant: true,
      local_state: true,
      witness: null,
      authority: "observe",
    },
    binding_ref: newId("binding"),
    verification_ref: newId("verification"),
  };
  const relationOffer = world.publishRelation(relation, inDoor, outDoor, {
    ttl: limits.ttl,
  });
  let calls = 0,
    memberAuthority = null,
    retired = false;
  const retire = () => {
    if (retired) return;
    retired = true;
    for (const d of [inDoor, outDoor])
      if (world.current().doors.has(d.descriptor.interface_id))
        world.withdraw(d.descriptor.interface_id);
    if (world.current().relations.has(relation.relation_id))
      world.withdrawRelation(relation.relation_id);
  };
  const receiptLog = [];
  const instance = {
    manifest,
    world,
    input: inDoor,
    output: outDoor,
    relation: relationOffer,
    receipts: () => clone(receiptLog),
    retire,
    attestations: {
      surfaces: [input, output],
      contracts: { [relation.binding_ref]: clone(relation) },
    },
    // Explicit installation of separately owner-issued grants, never from outer tokens.
    installMemberAuthority({ peers, subject, grants }) {
      if (memberAuthority)
        throw new Error("MEMBER_AUTHORITY_ALREADY_INSTALLED");
      memberAuthority = { peers, subject, grants: clone(grants) };
    },
    binding: {
      contract_digest: digest(relation),
      verify: async (_a, b) =>
        !!b.observation && b.evidence.native.member_result === "succeeded",
      run: async (a, context) => {
        if (!memberAuthority)
          throw new Error("COMPOSITION_MEMBER_AUTHORITY_ABSENT");
        if (a.bytes.length > limits.max_bytes)
          throw new Error("COMPOSITION_CAPACITY");
        if (calls >= limits.max_calls) throw new Error("COMPOSITION_EXHAUSTED");
        world.checkDoor(inDoor);
        world.checkDoor(outDoor);
        calls++;
        context.cleanup?.push(() => {
          if (calls >= limits.max_calls) {
            retire();
            context.dynamic_record.lifecycle_residuals.push({
              composition_retired: composition_id,
              reason: "call_budget_exhausted",
            });
          }
        });
        const nestedSource = {
          bytes: Buffer.from(a.bytes),
          native_ref: newId("composition-input"),
          particular_id: newId("particular"),
        };
        if (nestedSource.bytes.length !== route.request.state.byte_length)
          throw new Error("COMPOSITION_REQUEST_STATE_MISMATCH");
        const result = await executeDynamic(
          memberView,
          memberPlan,
          nestedSource,
          { ...memberAuthority },
        );
        verifyDynamic(
          memberPlan,
          result.record,
          [...memberAuthority.peers.values()].map((w) => w.anchor),
        );
        const evidence = {
          composition_id,
          call: calls,
          input_parent_particular: context.parent.particular_id,
          nested_source_particular:
            result.record.execution?.source.particular_id ?? null,
          member_occurrence_id: result.record.occurrence_id,
          member_result: result.record.result,
        };
        receiptLog.push({
          evidence: clone(evidence),
          occurrence: clone(result.record),
        });
        context.dynamic_record.nested.push({
          composition_id,
          member_plan: clone(memberPlan),
          occurrence: clone(result.record),
        });
        if (result.record.result !== "succeeded")
          throw new Error("COMPOSITION_MEMBER_FAILED");
        return {
          ...result.artifact,
          representation: "adapter.observation",
          native_ref: newId("composition-result"),
          authority: [],
          evidence: { facts: ["observed"], native: evidence },
          residuals: result.record.lifecycle_residuals,
        };
      },
    },
  };
  return instance;
}
