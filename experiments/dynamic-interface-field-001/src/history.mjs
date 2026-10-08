import {
  generateKeyPairSync,
  createPublicKey,
  sign,
  verify,
} from "node:crypto";
import { canonicalize } from "../../../src/canonical.ts";
import {
  digest,
  occurrence,
} from "../../interface-superspace-001/src/receipts.mjs";
import { validateDynamic } from "./schemas.mjs";
export const clone = (value) => structuredClone(value);
export const keyId = (publicKey) => "world:" + digest(publicKey).slice(7);
export function identity() {
  const keys = generateKeyPairSync("ed25519");
  const public_key = keys.publicKey
    .export({ format: "der", type: "spki" })
    .toString("base64");
  return { ...keys, public_key, world_id: keyId(public_key) };
}
export function signed(body, keys) {
  const snapshot = clone(body);
  return {
    ...snapshot,
    public_key: keys.public_key,
    signature: sign(
      null,
      Buffer.from(canonicalize(snapshot)),
      keys.privateKey,
    ).toString("base64"),
  };
}
export function verifySigned(value, publicKey) {
  const { public_key, signature, ...body } = value;
  if (public_key !== publicKey || typeof signature !== "string")
    throw new Error("UNTRUSTED_SIGNER");
  if (
    !verify(
      null,
      Buffer.from(canonicalize(body)),
      createPublicKey({
        key: Buffer.from(publicKey, "base64"),
        format: "der",
        type: "spki",
      }),
      Buffer.from(signature, "base64"),
    )
  )
    throw new Error("INVALID_SIGNATURE");
  return body;
}
export function verifyHistory(events, anchor) {
  if (events.length > 4096) throw new Error("HISTORY_BOUND_EXCEEDED");
  if (!events.length) throw new Error("EMPTY_HISTORY");
  let previous = null,
    time = -1;
  const seen = new Set();
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    validateDynamic("field-event-v0", e);
    verifySigned(e, anchor.public_key);
    if (e.world_id !== anchor.world_id || keyId(e.public_key) !== e.world_id)
      throw new Error("WORLD_ID_MISMATCH");
    if (e.seq !== i || e.previous !== previous || seen.has(e.event_id))
      throw new Error("BROKEN_HISTORY");
    if (!Number.isSafeInteger(e.at_ms) || e.at_ms < time)
      throw new Error("CLOCK_REGRESSION");
    if (
      e.schema !== "relatte.dynamic-field-event.experimental/v0" ||
      (i === 0) !== (e.kind === "genesis")
    )
      throw new Error("EVENT_SCHEMA");
    time = e.at_ms;
    seen.add(e.event_id);
    previous = digest(e);
  }
  return { world_id: anchor.world_id, head: previous, count: events.length };
}
export function replay(events, now) {
  const doors = new Map(),
    relations = new Map(),
    grants = new Map(),
    revoked = new Set(),
    published = new Map(),
    offerIds = new Set();
  for (const e of events) {
    for (const [id, d] of doors) if (d.expires_at <= e.at_ms) doors.delete(id);
    for (const [id, r] of relations)
      if (r.expires_at <= e.at_ms) relations.delete(id);
    if (
      ["publish", "reconstitute", "fork-door", "relation-publish"].includes(
        e.kind,
      )
    ) {
      if (
        offerIds.has(e.payload.offer_id) ||
        e.payload.expires_at <= e.at_ms ||
        e.payload.expires_at - e.at_ms > 60000
      )
        throw new Error("INVALID_OFFER_LEASE_OR_ID");
      offerIds.add(e.payload.offer_id);
    }
    if (
      e.kind === "publish" ||
      e.kind === "reconstitute" ||
      e.kind === "fork-door"
    ) {
      const p = e.payload,
        id = p.descriptor.interface_id;
      if (digest(p.descriptor) !== p.descriptor_digest)
        throw new Error("DESCRIPTOR_DIGEST_MISMATCH");
      if (doors.has(id)) throw new Error("DOOR_ALREADY_OPEN");
      if (
        e.kind === "reconstitute" &&
        !p.parents.some(
          (parent) =>
            parent.world_id === e.world_id &&
            published.get(id)?.has(parent.offer_id),
        )
      )
        throw new Error("RECONSTITUTION_LINEAGE_MISMATCH");
      if (
        e.kind === "fork-door" &&
        !p.parents.some(
          (parent) => digest(parent) === digest(events[0].payload.parent),
        )
      )
        throw new Error("FORK_LINEAGE_MISMATCH");
      if (!published.has(id)) published.set(id, new Set());
      published.get(id).add(p.offer_id);
      doors.set(id, {
        ...clone(p),
        world_id: e.world_id,
        event_ref: digest(e),
      });
    } else if (e.kind === "withdraw") {
      const current = doors.get(e.payload.interface_id);
      if (current?.offer_id !== e.payload.offer_id)
        throw new Error("WITHDRAW_INCARNATION_MISMATCH");
      doors.delete(e.payload.interface_id);
    } else if (e.kind === "relation-publish") {
      if (relations.has(e.payload.descriptor.relation_id))
        throw new Error("RELATION_ALREADY_OPEN");
      if (
        e.payload.descriptor.source !== e.payload.source.interface_id ||
        e.payload.descriptor.destination !== e.payload.destination.interface_id
      )
        throw new Error("ENDPOINT_MISMATCH");
      relations.set(e.payload.descriptor.relation_id, {
        ...clone(e.payload),
        world_id: e.world_id,
        event_ref: digest(e),
      });
    } else if (e.kind === "relation-withdraw") {
      if (relations.get(e.payload.relation_id)?.offer_id !== e.payload.offer_id)
        throw new Error("WITHDRAW_RELATION_MISMATCH");
      relations.delete(e.payload.relation_id);
    } else if (e.kind === "grant") {
      const token = e.payload,
        door = doors.get(token.interface_id);
      verifySigned(token, e.public_key);
      if (
        grants.has(token.grant_id) ||
        token.world_id !== e.world_id ||
        !door ||
        token.offer_id !== door.offer_id ||
        token.descriptor_digest !== door.descriptor_digest ||
        token.expires_at > door.expires_at ||
        token.expires_at <= e.at_ms
      )
        throw new Error("INVALID_PUBLISHED_GRANT");
      if (
        !door.descriptor.operations.includes(token.operation) ||
        !door.descriptor.authority[token.permission] ||
        (["configure", "perturb", "mutate"].includes(token.operation) &&
          token.permission !== "mutate")
      )
        throw new Error("INVALID_GRANT_AUTHORITY");
      grants.set(token.grant_id, clone(token));
    } else if (e.kind === "revoke") {
      if (!grants.has(e.payload.grant_id)) throw new Error("UNKNOWN_GRANT");
      revoked.add(e.payload.grant_id);
    } else if (e.kind === "fork") {
      const parent = e.payload.parent,
        door = doors.get(parent.interface_id);
      if (
        parent.world_id !== e.world_id ||
        parent.head !== e.previous ||
        door?.offer_id !== parent.offer_id ||
        keyId(e.payload.child.public_key) !== e.payload.child.world_id ||
        e.payload.child.world_id === e.world_id
      )
        throw new Error("FORK_PARENT_MISMATCH");
    } else if (!["genesis", "composition-created"].includes(e.kind))
      throw new Error("UNKNOWN_EVENT_KIND");
  }
  for (const [id, d] of doors) if (d.expires_at <= now) doors.delete(id);
  for (const [id, r] of relations)
    if (r.expires_at <= now) relations.delete(id);
  return { doors, relations, grants, revoked };
}
export const newId = occurrence;
