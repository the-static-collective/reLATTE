import { FieldObserver, verifyView, propose } from "../dynamic-interface-field-001/src/field.mjs";
import { identity, signed, verifySigned, keyId, clone } from "../dynamic-interface-field-001/src/history.mjs";
import { digest, seal, verifySeal } from "../interface-superspace-001/src/receipts.mjs";

// Experiment-local interpretation. Never changes FieldObserver, LocalWorld or grants.
const SCHEMA = "relatte.perceived-affordance.experimental/v0";
const PRESSURE = "relatte.perceived-pressure.experimental/v0";
const states = new Set(["OPEN", "CLOSED"]);
const exactRef = (ref) => {
  if (!ref || !["world_id", "interface_id", "offer_id"].every((k) =>
    typeof ref[k] === "string" && ref[k].length > 0))
    throw new Error("INVALID_DOOR_REF");
  return { world_id: ref.world_id, interface_id: ref.interface_id, offer_id: ref.offer_id };
};
export const doorRef = (door) => exactRef({
  world_id: door.world_id,
  interface_id: door.descriptor.interface_id,
  offer_id: door.offer_id,
});
export const pressureIdentity = identity;

// Signature authenticates the actor, never the actor's claimed authority.
export function signPressure(keys, ref, claimed_state, at_ms, reason = "external assertion") {
  if (!states.has(claimed_state) || !Number.isSafeInteger(at_ms) || at_ms < 0 ||
      typeof reason !== "string" || reason.length > 256)
    throw new Error("INVALID_PRESSURE");
  const target = exactRef(ref);
  if (keys.world_id === target.world_id) throw new Error("OWNER_IS_NOT_PRESSURING_ACTOR");
  return signed({
    schema: PRESSURE, world_id: keys.world_id, door_ref: target,
    claimed_state, at_ms, reason, authority: [],
  }, keys);
}
export function verifyPressure(message, trustedAnchors, target, observedAt) {
  if (!message || message.schema !== PRESSURE || !states.has(message.claimed_state) ||
      !Number.isSafeInteger(message.at_ms) || message.at_ms < 0 ||
      message.at_ms > observedAt || !Array.isArray(message.authority) ||
      message.authority.length !== 0 || typeof message.reason !== "string" ||
      message.reason.length > 256)
    throw new Error("INVALID_PRESSURE");
  const anchor = trustedAnchors.find((a) => a.world_id === message.world_id);
  if (!anchor || keyId(anchor.public_key) !== anchor.world_id)
    throw new Error("UNTRUSTED_PRESSURE_ACTOR");
  if (message.world_id === target.world_id)
    throw new Error("PRESSURE_OWNER_CONFUSION");
  verifySigned(message, anchor.public_key);
  if (digest(exactRef(message.door_ref)) !== digest(exactRef(target)))
    throw new Error("PRESSURE_INCARCATION_MISMATCH");
  return true;
}
export function localOwnerObservation(view, target) {
  verifyView(view);
  const ref = exactRef(target);
  const selected = view.snapshot.frontiers.some((f) => f.world_id === ref.world_id);
  if (!selected) return "UNEXAMINED";
  const door = view.doors.get(ref.interface_id);
  if (!door) return "NONE";
  return door.world_id === ref.world_id && door.offer_id === ref.offer_id
    ? "DISCOVERED" : "NONE";
}
export function interpret(view, observer_id, ref, messages = [], anchors = [], orientation = "PRESSURE_AWARE") {
  verifyView(view);
  const target = exactRef(ref);
  if (typeof observer_id !== "string" || !observer_id ||
      !["PRESSURE_AWARE", "REORIENT_TO_SELECTED_EVIDENCE"].includes(orientation) ||
      !Array.isArray(messages) || messages.length > 16)
    throw new Error("INVALID_OBSERVATION");
  const owner_observation = localOwnerObservation(view, target);
  for (const msg of messages) verifyPressure(msg, anchors, target, view.snapshot.observed_at);
  const claims = [...new Set(messages.map((m) => m.claimed_state))];
  // Reorientation changes an interpretation, not the source histories or rights.
  const perceived_state = orientation === "REORIENT_TO_SELECTED_EVIDENCE"
    ? owner_observation === "DISCOVERED" ? "OPEN" :
      owner_observation === "NONE" ? "CLOSED" : "UNKNOWN"
    : claims.length > 1 ? "CONTESTED" :
      claims.length === 1 ? claims[0] :
      owner_observation === "DISCOVERED" ? "OPEN" :
      owner_observation === "NONE" ? "CLOSED" : "UNKNOWN";
  return seal({
    schema: SCHEMA, observer_id, target, view_digest: view.snapshot.view_digest,
    observed_at: view.snapshot.observed_at, selected_frontiers: clone(view.snapshot.frontiers),
    owner_observation, perceived_state, orientation,
    pressure: clone(messages), pressure_anchors: clone(anchors),
    authority: [], grants: [],
  }, "interpretation_digest");
}
export function verifyInterpretation(view, report) {
  if (!report || report.schema !== SCHEMA) throw new Error("INVALID_INTERPRETATION");
  verifySeal(report, "interpretation_digest");
  const expected = interpret(view, report.observer_id, report.target,
    report.pressure, report.pressure_anchors, report.orientation);
  if (digest(expected) !== digest(report)) throw new Error("INTERPRETATION_PROJECTION_MISMATCH");
  return true;
}
// Proposal selection is observer-relative; underlying planner remains authoritative about registry shape.
export async function perceivedProposal(view, report, request, { override = false } = {}) {
  verifyInterpretation(view, report);
  if (report.perceived_state !== "OPEN" && !override)
    return { status: "DECLINED_BY_OBSERVER", plans: [], observer_id: report.observer_id };
  const candidates = await propose(view, request);
  return { ...candidates, observer_id: report.observer_id };
}
export function independentObserver(library, ownerAnchors) {
  return new FieldObserver({
    anchors: ownerAnchors, surfaces: library.surfaces, contracts: library.contracts,
  });
}
