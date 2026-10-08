import { execute } from "../../interface-superspace-001/src/executor.mjs";
import { createEnvironment } from "../../interface-superspace-001/src/bindings.mjs";
import { verifyExecution } from "../../interface-superspace-001/src/verifier.mjs";
import {
  occurrence,
  seal,
  digest,
  verifySeal,
} from "../../interface-superspace-001/src/receipts.mjs";
import { verifyProposal } from "./field.mjs";
import { clone } from "./history.mjs";
import { verifyTicket, permissionClass } from "./world.mjs";
import { validateDynamic } from "./schemas.mjs";
export const operationFor = (r) => r.operation;
export const permissionFor = (r) =>
  r.requires.authority ?? permissionClass(r.operation);
// Owner decisions are explicit. Neither proposal discovery nor composition calls this.
export function authorize(
  plan,
  peers,
  subject,
  { max_uses = 1, ttl = 60000 } = {},
) {
  const grants = [];
  for (let i = 0; i < plan.doors.length; i++) {
    const door = plan.doors[i],
      world = peers.get(door.world_id);
    if (!world) throw new Error("PUBLISHER_UNAVAILABLE");
    const operation =
      i === 0 ? "observe" : operationFor(plan.relations[i - 1].descriptor);
    const permission =
      i === 0 ? "observe" : permissionFor(plan.relations[i - 1].descriptor);
    grants.push(
      world.issueGrant(door, { subject, operation, permission, max_uses, ttl }),
    );
  }
  return grants;
}
function peer(peers, ref) {
  const p = peers.get(ref.world_id);
  if (!p) throw new Error("PUBLISHER_UNAVAILABLE:" + ref.world_id);
  return p;
}
export async function executeDynamic(
  view,
  plan,
  source,
  {
    peers,
    subject,
    grants = [],
    extraBindings = new Map(),
    beforeStep,
    options = {},
  },
) {
  await verifyProposal(view, plan);
  const dynamic = {
    schema: "relatte.dynamic-route-occurrence.experimental/v0",
    occurrence_id: occurrence("field-execution"),
    field_plan_id: plan.field_plan_id,
    field_plan_digest: plan.field_plan_digest,
    view_digest: plan.view_digest,
    subject,
    operation_tickets: [],
    lifecycle_residuals: [],
    failures: [],
    nested: [],
    execution: null,
    result: "failed",
  };
  const environment = createEnvironment(view.registry, {
    ...options,
    network: plan.route.request.constraints.network,
    local_state: plan.route.request.constraints.local_state,
    witnesses: plan.route.request.constraints.witnesses,
    grants: [],
  });
  for (const [id, b] of extraBindings) environment.bindings.set(id, b);
  const tokenFor = (door, operation, permission) =>
    grants.find(
      (g) =>
        g.interface_id === door.descriptor.interface_id &&
        g.offer_id === door.offer_id &&
        g.world_id === door.world_id &&
        g.operation === operation &&
        g.permission === permission,
    );
  const consume = (
    door,
    operation,
    permission = permissionClass(operation),
  ) => {
    const world = peer(peers, door),
      token = tokenFor(door, operation, permission);
    const ticket = world.admitOperation(
      door,
      token,
      subject,
      operation,
      permission,
    );
    dynamic.operation_tickets.push(ticket);
    return world;
  };
  try {
    // Fresh owner checks, not a globally current registry digest.
    for (const door of plan.doors) peer(peers, door).checkDoor(door);
    for (const r of plan.relations) peer(peers, r).checkRelation(r);
    consume(plan.doors[0], "observe");
    const original = new Map(environment.bindings);
    // Shared implementation refs are dispatched by the declared relation identity;
    // each occurrence still has its own owner and incarnation gate.
    for (const bindingRef of new Set(
      plan.relations.map((r) => r.descriptor.binding_ref),
    )) {
      const implementation = original.get(bindingRef);
      if (!implementation) throw new Error("BINDING_UNAVAILABLE");
      environment.bindings.set(bindingRef, {
        ...implementation,
        run: async (a, context) => {
          const index = plan.route.relation_sequence.indexOf(
            context.relation.relation_id,
          );
          const relation = plan.relations[index];
          if (!relation || relation.descriptor.binding_ref !== bindingRef)
            throw new Error("RELATION_GATE_MISMATCH");
          const r = relation.descriptor,
            src = plan.doors[index],
            dst = plan.doors[index + 1];
          await beforeStep?.({
            index,
            relation,
            source: src,
            destination: dst,
          });
          peer(peers, relation).checkRelation(relation);
          peer(peers, src).checkDoor(src);
          const world = consume(dst, operationFor(r), permissionFor(r)),
            ticket = dynamic.operation_tickets.at(-1);
          const next = await implementation.run(a, {
            ...context,
            dynamic_record: dynamic,
          });
          // Withdrawal during an already admitted operation cannot erase its occurrence.
          try {
            world.checkDoor(dst);
            peer(peers, relation).checkRelation(relation);
          } catch (error) {
            dynamic.lifecycle_residuals.push({
              after_relation: r.relation_id,
              reason: error.message,
              admitted_ticket: ticket.ticket_id,
            });
          }
          return {
            ...next,
            evidence: { ...next.evidence, dynamic_gate: clone(ticket) },
          };
        },
      });
    }
    environment.grants = grants.map((g) => g.interface_id + "/" + g.permission);
    const result = await execute(
      view.registry,
      plan.route,
      source,
      environment,
    );
    verifyExecution(plan.route, result.record);
    dynamic.execution = result.record;
    dynamic.result = result.record.result;
    if (result.record.result === "failed")
      dynamic.failures.push(...result.record.failures);
    return {
      record: validateDynamic(
        "route-occurrence-v0",
        seal(dynamic, "dynamic_execution_digest"),
      ),
      artifact: result.artifact,
    };
  } catch (error) {
    dynamic.failures.push({ reason: error.message });
    for (const dispose of environment.cleanup)
      try {
        await dispose();
      } catch (e) {
        dynamic.lifecycle_residuals.push({ cleanup_failure: String(e) });
      }
    return {
      record: validateDynamic(
        "route-occurrence-v0",
        seal(dynamic, "dynamic_execution_digest"),
      ),
      artifact: source,
    };
  }
}
export function verifyDynamic(plan, record, anchors, depth = 0) {
  if (depth > 8) throw new Error("NESTED_OCCURRENCE_DEPTH");
  validateDynamic("route-occurrence-v0", record);
  verifySeal(plan, "field_plan_digest");
  verifySeal(record, "dynamic_execution_digest");
  if (
    record.field_plan_id !== plan.field_plan_id ||
    record.field_plan_digest !== plan.field_plan_digest ||
    record.occurrence_id === plan.field_plan_id ||
    record.view_digest !== plan.view_digest
  )
    throw new Error("PLAN_OCCURRENCE_CONFUSION");
  for (const ticket of record.operation_tickets) {
    const a = anchors.find((a) => a.world_id === ticket.world_id);
    if (!a) throw new Error("UNTRUSTED_TICKET");
    verifyTicket(ticket, a);
    if (ticket.subject !== record.subject)
      throw new Error("TICKET_SUBJECT_MISMATCH");
  }
  const ticketIds = new Set(record.operation_tickets.map((t) => t.ticket_id));
  if (
    ticketIds.size !== record.operation_tickets.length ||
    record.operation_tickets.length > plan.doors.length
  )
    throw new Error("TICKET_SEQUENCE_MISMATCH");
  for (let i = 0; i < record.operation_tickets.length; i++) {
    const t = record.operation_tickets[i],
      d = plan.doors[i],
      op = i === 0 ? "observe" : operationFor(plan.relations[i - 1].descriptor);
    if (
      t.interface_id !== d.descriptor.interface_id ||
      t.world_id !== d.world_id ||
      t.offer_id !== d.offer_id ||
      t.operation !== op ||
      t.permission !==
        (i === 0 ? "observe" : permissionFor(plan.relations[i - 1].descriptor))
    )
      throw new Error("TICKET_SEQUENCE_MISMATCH");
  }
  if (
    record.result === "succeeded" &&
    record.operation_tickets.length !== plan.doors.length
  )
    throw new Error("INCOMPLETE_TICKETS");
  for (const n of record.nested)
    verifyDynamic(n.member_plan, n.occurrence, anchors, depth + 1);
  if (record.execution) {
    verifyExecution(plan.route, record.execution);
    if (
      record.result !== record.execution.result ||
      record.operation_tickets.length <
        record.execution.actual_relation_receipts.length + 1
    )
      throw new Error("OCCURRENCE_RESULT_MISMATCH");
  }
  if (record.result === "failed" && !record.failures.length)
    throw new Error("UNATTRIBUTED_FAILURE");
  if (
    record.result === "succeeded" &&
    (!record.execution ||
      record.execution.result !== "succeeded" ||
      record.failures.length)
  )
    throw new Error("INCOMPLETE_OCCURRENCE");
  if (record.execution)
    for (let i = 0; i < record.execution.actual_relation_receipts.length; i++) {
      const receipt = record.execution.actual_relation_receipts[i],
        gate = receipt.evidence.dynamic_gate,
        door = plan.doors[i + 1];
      if (
        !gate ||
        !record.operation_tickets.some((t) => digest(t) === digest(gate)) ||
        gate.offer_id !== door.offer_id ||
        gate.interface_id !== door.descriptor.interface_id ||
        gate.world_id !== door.world_id ||
        gate.operation !== operationFor(plan.relations[i].descriptor) ||
        digest(gate) !== digest(record.operation_tickets[i + 1])
      )
        throw new Error("DOOR_TICKET_BINDING");
    }
  return true;
}
