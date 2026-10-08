import {
  buildRegistry,
  validate,
  assertRegistryIntegrity,
} from "../../interface-superspace-001/src/registry.mjs";
import {
  synthesize,
  verifyPlan,
} from "../../interface-superspace-001/src/planner.mjs";
import {
  digest,
  seal,
  verifySeal,
  occurrence,
} from "../../interface-superspace-001/src/receipts.mjs";
import { clone, verifyHistory, replay } from "./history.mjs";
import { validateDynamic } from "./schemas.mjs";
export class FieldObserver {
  #anchors = new Map();
  #seen = new Map();
  #surfaces;
  #contracts;
  constructor({ anchors = [], surfaces, contracts }) {
    this.#surfaces = clone(surfaces);
    this.#contracts = clone(contracts);
    for (const a of anchors) this.trust(a);
  }
  trust(anchor) {
    const old = this.#anchors.get(anchor.world_id);
    if (old && old.public_key !== anchor.public_key)
      throw new Error("ANCHOR_CONFLICT");
    this.#anchors.set(anchor.world_id, clone(anchor));
  }
  extendAttestations({ surfaces, contracts }) {
    for (const [id, contract] of Object.entries(contracts))
      if (
        this.#contracts[id] &&
        digest(this.#contracts[id]) !== digest(contract)
      )
        throw new Error("ATTESTATION_CONFLICT");
    for (const s of surfaces)
      if (
        this.#surfaces.some(
          (old) =>
            old.interface_id === s.interface_id && digest(old) !== digest(s),
        )
      )
        throw new Error("ATTESTATION_CONFLICT");
    this.#surfaces.push(...clone(surfaces));
    Object.assign(this.#contracts, clone(contracts));
  }
  async project(histories, now) {
    if (!Number.isSafeInteger(now) || now < 0)
      throw new Error("INVALID_OBSERVATION_TIME");
    const frontiers = [],
      doors = new Map(),
      relations = new Map(),
      excluded = [],
      owners = new Set();
    for (const events of histories) {
      const id = events[0]?.world_id,
        anchor = this.#anchors.get(id);
      if (!anchor) throw new Error("UNTRUSTED_PUBLISHER");
      if (owners.has(id)) throw new Error("DUPLICATE_PUBLISHER_HISTORY");
      owners.add(id);
      const frontier = verifyHistory(events, anchor),
        previous = this.#seen.get(id);
      if (events.at(-1).at_ms > now) throw new Error("FUTURE_HISTORY");
      if (
        previous &&
        (events.length < previous.count ||
          digest(events[previous.count - 1]) !== previous.head)
      )
        throw new Error("HISTORY_ROLLBACK_OR_EQUIVOCATION");
      const state = replay(events, now);
      frontiers.push(frontier);
      for (const [interfaceId, d] of state.doors) {
        if (doors.has(interfaceId))
          throw new Error("INTERFACE_OWNERSHIP_COLLISION");
        doors.set(interfaceId, d);
      }
      for (const [relationId, r] of state.relations) {
        if (relations.has(relationId))
          throw new Error("RELATION_OWNERSHIP_COLLISION");
        relations.set(relationId, r);
      }
    }
    const active = [];
    for (const [relationId, r] of relations) {
      const source = doors.get(r.source.interface_id),
        destination = doors.get(r.destination.interface_id);
      const matches = (door, ref) =>
        door &&
        door.world_id === ref.world_id &&
        door.offer_id === ref.offer_id &&
        door.descriptor_digest === ref.descriptor_digest;
      if (!matches(source, r.source) || !matches(destination, r.destination)) {
        excluded.push({
          relation_id: relationId,
          reason: "ENDPOINT_INCARNATION_UNAVAILABLE",
        });
        continue;
      }
      active.push(r.descriptor);
    }
    const registry = await buildRegistry({
      interfaces: [...doors.values()].map((d) => d.descriptor),
      relations: active,
      contracts: this.#contracts,
      surfaces: this.#surfaces,
    });
    const snapshot = {
      schema: "relatte.dynamic-field-view.experimental/v0",
      observed_at: now,
      frontiers: frontiers.sort((a, b) => a.world_id.localeCompare(b.world_id)),
      door_refs: [...doors.values()],
      relation_refs: [...relations.values()],
      excluded,
      registry_digest: registry.registry_digest,
      scope: "SELECTED_LOCAL_HISTORIES_ONLY",
      authority: [],
    };
    for (const frontier of frontiers)
      this.#seen.set(frontier.world_id, frontier);
    return {
      registry,
      doors,
      relations,
      snapshot: validateDynamic("field-view-v0", seal(snapshot, "view_digest")),
    };
  }
}
export function verifyView(view) {
  validateDynamic("field-view-v0", view.snapshot);
  verifySeal(view.snapshot, "view_digest");
  if (
    view.snapshot.registry_digest !== view.registry.registry_digest ||
    digest(view.snapshot.door_refs) !== digest([...view.doors.values()]) ||
    digest(view.snapshot.relation_refs) !== digest([...view.relations.values()])
  )
    throw new Error("VIEW_PROJECTION_MISMATCH");
}
export async function propose(view, request) {
  verifyView(view);
  assertRegistryIntegrity(view.registry);
  await validate("route-request", request);
  if (!view.doors.has(request.from))
    return {
      status: "NO_ROUTE",
      plans: [],
      rejections: [
        {
          interface_id: request.from,
          relation_id: null,
          reasons: [
            {
              code: "source_not_in_selected_view",
              detail: { scope: view.snapshot.scope },
            },
          ],
        },
      ],
      excluded: view.snapshot.excluded,
      scope: view.snapshot.scope,
    };
  const search = await synthesize(view.registry, request),
    plans = search.candidates.map((route) => {
      const doors = route.interface_sequence.map((id) =>
        clone(view.doors.get(id)),
      );
      const relations = route.relation_sequence.map((id) =>
        clone(view.relations.get(id)),
      );
      return seal(
        {
          schema: "relatte.dynamic-route-proposal.experimental/v0",
          field_plan_id: occurrence("field-plan"),
          view_digest: view.snapshot.view_digest,
          observed_at: view.snapshot.observed_at,
          frontiers: clone(view.snapshot.frontiers),
          route,
          doors,
          relations,
          authority: [],
        },
        "field_plan_digest",
      );
    });
  return {
    status: search.status,
    plans,
    rejections: search.rejections,
    excluded: view.snapshot.excluded,
    scope: view.snapshot.scope,
  };
}
export async function verifyProposal(view, plan) {
  verifyView(view);
  validateDynamic("route-proposal-v0", plan);
  verifySeal(view.snapshot, "view_digest");
  verifySeal(plan, "field_plan_digest");
  if (
    plan.schema !== "relatte.dynamic-route-proposal.experimental/v0" ||
    plan.authority.length ||
    plan.view_digest !== view.snapshot.view_digest
  )
    throw new Error("FIELD_PLAN_VIEW_MISMATCH");
  await verifyPlan(view.registry, plan.route);
  if (
    plan.doors.length !== plan.route.interface_sequence.length ||
    plan.relations.length !== plan.route.relation_sequence.length
  )
    throw new Error("FIELD_PLAN_SEQUENCE_MISMATCH");
  for (let i = 0; i < plan.doors.length; i++)
    if (
      digest(plan.doors[i]) !==
      digest(view.doors.get(plan.route.interface_sequence[i]))
    )
      throw new Error("FIELD_PLAN_DOOR_MISMATCH");
  for (let i = 0; i < plan.relations.length; i++)
    if (
      digest(plan.relations[i]) !==
      digest(view.relations.get(plan.route.relation_sequence[i]))
    )
      throw new Error("FIELD_PLAN_RELATION_MISMATCH");
}
