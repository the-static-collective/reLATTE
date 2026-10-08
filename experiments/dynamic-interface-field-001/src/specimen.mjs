import { loadRegistry } from "../../interface-superspace-001/src/registry.mjs";
import { id, request } from "../../interface-superspace-001/src/proofs.mjs";
import {
  digest,
  occurrence,
} from "../../interface-superspace-001/src/receipts.mjs";
import { FieldObserver, propose } from "./field.mjs";
import { LocalWorld } from "./world.mjs";
import { clone } from "./history.mjs";
export async function specimen() {
  const library = await loadRegistry(),
    time = { value: 1000 },
    clock = () => time.value;
  const a = new LocalWorld({ clock }),
    b = new LocalWorld({ clock }),
    c = new LocalWorld({ clock });
  const observer = new FieldObserver({
    anchors: [a.anchor, b.anchor, c.anchor],
    surfaces: library.surfaces,
    contracts: library.contracts,
  });
  const active = new Map(),
    bytes = Buffer.from("Doors appear; history remains.");
  const offer = (world, name) => {
    const d = world.publish(library.nodes.get(id(name)));
    active.set(d.descriptor.interface_id, d);
    return d;
  };
  const source = offer(a, "payload-bytes"),
    observation = offer(c, "carrier-observation"),
    intake = offer(c, "relatte-receiver-intake");
  const publishEdge = (world, descriptor) =>
    world.publishRelation(
      descriptor,
      active.get(descriptor.source),
      active.get(descriptor.destination),
    );
  const cross = library.relations.find(
    (r) =>
      r.source === observation.descriptor.interface_id &&
      r.destination === intake.descriptor.interface_id,
  );
  publishEdge(c, cross);
  const histories = () => [a.history(), b.history(), c.history()];
  const peers = new Map([a, b, c].map((w) => [w.world_id, w]));
  const project = () => observer.project(histories(), clock());
  const query = (goal) =>
    request(library, {
      bytes,
      network: false,
      permissions: library.relations
        .filter((r) => r.requires.authority)
        .map((r) => r.destination + "/" + r.requires.authority),
      goal: goal ?? "relatte.observation",
    });
  async function publishPath(world, names) {
    const doors = names.map((n) => offer(world, n));
    const ids = [
      source.descriptor.interface_id,
      ...doors.map((d) => d.descriptor.interface_id),
      observation.descriptor.interface_id,
    ];
    const relations = [];
    for (let i = 0; i < ids.length - 1; i++) {
      const r = library.relations.find(
        (r) => r.source === ids[i] && r.destination === ids[i + 1],
      );
      if (!r) throw new Error("MISSING_EXISTING_RELATION");
      relations.push(publishEdge(world, r));
    }
    return { doors, relations };
  }
  return {
    library,
    time,
    clock,
    a,
    b,
    c,
    observer,
    active,
    bytes,
    source,
    observation,
    intake,
    histories,
    peers,
    project,
    query,
    publishEdge,
    publishPath,
    sourceArtifact: () => ({
      bytes: Buffer.from(bytes),
      native_ref: occurrence("source"),
      particular_id: occurrence("particular"),
    }),
  };
}
export function adaptRelation(
  template,
  source,
  destination,
  { binding_ref = template.binding_ref } = {},
) {
  return {
    ...clone(template),
    relation_id: occurrence("relation"),
    source: source.descriptor.interface_id,
    destination: destination.descriptor.interface_id,
    consumes: source.descriptor.emits[0],
    produces: destination.descriptor.emits[0],
    binding_ref,
  };
}
