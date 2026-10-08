import {
  identity,
  signed,
  clone,
  newId,
  verifySigned,
  keyId,
  replay,
} from "./history.mjs";
import { digest } from "../../interface-superspace-001/src/receipts.mjs";
import { validateDynamic } from "./schemas.mjs";
export const permissionClass = (operation) =>
  operation === "propose"
    ? "propose"
    : ["configure", "perturb", "mutate"].includes(operation)
      ? "mutate"
      : "observe";
const MAX_LEASE = 60000;
export class LocalWorld {
  #keys;
  #events = [];
  #used = new Map();
  #clock;
  #last = -1;
  constructor({ clock = () => Date.now(), parent = null } = {}) {
    this.#keys = identity();
    this.#clock = clock;
    this.append("genesis", { parent });
  }
  get anchor() {
    return { world_id: this.#keys.world_id, public_key: this.#keys.public_key };
  }
  get world_id() {
    return this.#keys.world_id;
  }
  get head() {
    return digest(this.#events.at(-1));
  }
  history() {
    return clone(this.#events);
  }
  now() {
    const now = this.#clock();
    if (!Number.isSafeInteger(now) || now < this.#last)
      throw new Error("CLOCK_REGRESSION");
    this.#last = now;
    return now;
  }
  append(kind, payload) {
    if (this.#events.length >= 4096) throw new Error("HISTORY_BOUND_EXCEEDED");
    const now = this.now();
    this.#last = now;
    const event = signed(
      {
        schema: "relatte.dynamic-field-event.experimental/v0",
        event_id: newId("event"),
        world_id: this.world_id,
        seq: this.#events.length,
        previous: this.#events.length ? this.head : null,
        at_ms: now,
        kind,
        payload,
      },
      this.#keys,
    );
    validateDynamic("field-event-v0", event);
    replay([...this.#events, event], now);
    this.#events.push(event);
    return clone(event);
  }
  current() {
    return replay(this.#events, this.now());
  }
  publish(
    descriptor,
    { ttl = MAX_LEASE, parents = [], kind = "publish" } = {},
  ) {
    if (!["publish", "reconstitute", "fork-door"].includes(kind))
      throw new Error("INVALID_PUBLICATION_KIND");
    if (!Number.isInteger(ttl) || ttl <= 0 || ttl > MAX_LEASE)
      throw new Error("UNBOUNDED_LEASE");
    if (this.current().doors.has(descriptor.interface_id))
      throw new Error("DOOR_ALREADY_OPEN");
    if (kind !== "publish" && !parents.length)
      throw new Error("LINEAGE_REQUIRED");
    if (descriptor.authority.authorize) throw new Error("AUTHORITY_ESCALATION");
    const payload = {
      offer_id: newId("offer"),
      descriptor: clone(descriptor),
      descriptor_digest: digest(descriptor),
      expires_at: this.now() + ttl,
      parents: clone(parents),
    };
    this.append(kind, payload);
    return clone(this.current().doors.get(descriptor.interface_id));
  }
  withdraw(interfaceId) {
    const door = this.current().doors.get(interfaceId);
    if (!door) throw new Error("DOOR_NOT_OPEN");
    return this.append("withdraw", {
      interface_id: interfaceId,
      offer_id: door.offer_id,
    });
  }
  publishRelation(descriptor, source, destination, { ttl = MAX_LEASE } = {}) {
    if (ttl <= 0 || ttl > MAX_LEASE || !Number.isInteger(ttl))
      throw new Error("UNBOUNDED_LEASE");
    if (
      descriptor.source !== source.descriptor.interface_id ||
      descriptor.destination !== destination.descriptor.interface_id
    )
      throw new Error("ENDPOINT_MISMATCH");
    if (this.current().relations.has(descriptor.relation_id))
      throw new Error("RELATION_ALREADY_OPEN");
    const ref = (d) => ({
      world_id: d.world_id,
      interface_id: d.descriptor.interface_id,
      offer_id: d.offer_id,
      descriptor_digest: d.descriptor_digest,
    });
    const payload = {
      offer_id: newId("relation-offer"),
      descriptor: clone(descriptor),
      source: ref(source),
      destination: ref(destination),
      expires_at: Math.min(
        this.now() + ttl,
        source.expires_at,
        destination.expires_at,
      ),
    };
    this.append("relation-publish", payload);
    return clone(this.current().relations.get(descriptor.relation_id));
  }
  withdrawRelation(id) {
    const r = this.current().relations.get(id);
    if (!r) throw new Error("RELATION_NOT_OPEN");
    return this.append("relation-withdraw", {
      relation_id: id,
      offer_id: r.offer_id,
    });
  }
  issueGrant(
    door,
    {
      subject,
      operation,
      permission = permissionClass(operation),
      ttl = MAX_LEASE,
      max_uses = 1,
    } = {},
  ) {
    this.checkDoor(door);
    const d = door.descriptor;
    if (permissionClass(operation) === "mutate" && permission !== "mutate")
      throw new Error("OPERATION_NOT_AUTHORIZED");
    if (
      operation === "authorize" ||
      !d.operations.includes(operation) ||
      !["observe", "propose", "mutate"].includes(permission) ||
      !d.authority[permission]
    )
      throw new Error("OPERATION_NOT_AUTHORIZED");
    if (
      !subject ||
      ttl <= 0 ||
      ttl > MAX_LEASE ||
      !Number.isInteger(ttl) ||
      !Number.isInteger(max_uses) ||
      max_uses < 1 ||
      max_uses > 128
    )
      throw new Error("UNBOUNDED_GRANT");
    const token = signed(
      {
        schema: "relatte.dynamic-door-grant.experimental/v0",
        grant_id: newId("grant"),
        world_id: this.world_id,
        interface_id: d.interface_id,
        offer_id: door.offer_id,
        descriptor_digest: door.descriptor_digest,
        subject,
        operation,
        permission,
        expires_at: Math.min(this.now() + ttl, door.expires_at),
        max_uses,
      },
      this.#keys,
    );
    this.append("grant", token);
    return token;
  }
  revoke(token) {
    verifySigned(token, this.#keys.public_key);
    if (!this.current().grants.has(token.grant_id))
      throw new Error("UNKNOWN_GRANT");
    return this.append("revoke", { grant_id: token.grant_id });
  }
  checkDoor(expected) {
    if (expected.world_id !== this.world_id) throw new Error("WRONG_WORLD");
    if (digest(expected.descriptor) !== expected.descriptor_digest)
      throw new Error("DESCRIPTOR_DIGEST_MISMATCH");
    const actual = this.current().doors.get(expected.descriptor.interface_id);
    if (!actual) throw new Error("DOOR_UNAVAILABLE");
    if (
      actual.offer_id !== expected.offer_id ||
      actual.descriptor_digest !== expected.descriptor_digest
    )
      throw new Error("STALE_INCARNATION");
    return actual;
  }
  checkRelation(expected) {
    if (expected.world_id !== this.world_id) throw new Error("WRONG_WORLD");
    const actual = this.current().relations.get(
      expected.descriptor.relation_id,
    );
    if (!actual) throw new Error("RELATION_UNAVAILABLE");
    if (
      actual.offer_id !== expected.offer_id ||
      digest(actual.descriptor) !== digest(expected.descriptor)
    )
      throw new Error("STALE_RELATION");
    return actual;
  }
  admitOperation(
    door,
    token,
    subject,
    operation,
    permission = permissionClass(operation),
  ) {
    this.checkDoor(door);
    if (!token) throw new Error("GRANT_ABSENT");
    validateDynamic("door-grant-v0", token);
    verifySigned(token, this.#keys.public_key);
    const state = this.current(),
      published = state.grants.get(token.grant_id);
    if (!published || digest(token) !== digest(published))
      throw new Error("UNKNOWN_GRANT");
    if (
      token.world_id !== this.world_id ||
      token.interface_id !== door.descriptor.interface_id ||
      token.offer_id !== door.offer_id ||
      token.descriptor_digest !== door.descriptor_digest
    )
      throw new Error("GRANT_SCOPE_MISMATCH");
    if (
      token.subject !== subject ||
      token.operation !== operation ||
      token.permission !== permission
    )
      throw new Error("GRANT_SCOPE_MISMATCH");
    if (state.revoked.has(token.grant_id)) throw new Error("GRANT_REVOKED");
    if (token.expires_at <= this.now()) throw new Error("GRANT_EXPIRED");
    const used = this.#used.get(token.grant_id) ?? 0;
    if (used >= token.max_uses) throw new Error("GRANT_EXHAUSTED");
    this.#used.set(token.grant_id, used + 1);
    return signed(
      {
        schema: "relatte.dynamic-operation-ticket.experimental/v0",
        ticket_id: newId("ticket"),
        world_id: this.world_id,
        head: this.head,
        offer_id: door.offer_id,
        interface_id: door.descriptor.interface_id,
        grant_id: token.grant_id,
        subject,
        operation,
        permission,
        at_ms: this.now(),
        use: used + 1,
      },
      this.#keys,
    );
  }
  fork(door, descriptor) {
    this.checkDoor(door);
    if (descriptor.interface_id === door.descriptor.interface_id)
      throw new Error("FORK_REQUIRES_NEW_PARTICULAR");
    const parent = {
      world_id: this.world_id,
      head: this.head,
      offer_id: door.offer_id,
      interface_id: door.descriptor.interface_id,
    };
    const child = new LocalWorld({ clock: this.#clock, parent });
    this.append("fork", { child: child.anchor, parent });
    const forked = child.publish(descriptor, {
      kind: "fork-door",
      parents: [parent],
    });
    return { child, door: forked };
  }
}
export function verifyTicket(ticket, anchor) {
  validateDynamic("operation-ticket-v0", ticket);
  verifySigned(ticket, anchor.public_key);
  if (
    keyId(ticket.public_key) !== ticket.world_id ||
    ticket.world_id !== anchor.world_id
  )
    throw new Error("WRONG_WORLD");
  return true;
}
