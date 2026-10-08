import { readFile, readdir } from 'node:fs/promises';
import Ajv from 'ajv';
import { digest, canonical } from './receipts.mjs';
export const ROOT = new URL('../', import.meta.url);
export const readJSON = async path => JSON.parse(await readFile(new URL(path, ROOT), 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: true });
const validators = new Map();
export async function validate(schema, value) {
  if (!validators.has(schema)) validators.set(schema, ajv.compile(await readJSON('schemas/' + schema + '-v0.schema.json')));
  const test = validators.get(schema);
  if (!test(value)) throw new Error('SCHEMA:' + schema + ':' + ajv.errorsText(test.errors));
}
const loadDir = async dir => Promise.all((await readdir(new URL(dir, ROOT))).filter(n => n.endsWith('.json')).sort().map(n => readJSON(dir + '/' + n)));
export async function loadRegistry() {
  const [interfaces, relations, contracts, surfaces] = await Promise.all([loadDir('interfaces'), loadDir('relations'), readJSON('fixtures/binding-contracts.json'), readJSON('fixtures/surface-contracts.json')]);
  return buildRegistry({ interfaces, relations, contracts, surfaces });
}
// Attestations are local implementation contracts, not discovery-derived permission.
// They bound declared behavior; they do not establish universal semantic truth.
const behavior = r => {
  const { relation_id, source, destination, ...rest } = r;
  return rest;
};
const surfaceBehavior = i => {
  const { interface_id, participant_ref, ...rest } = i;
  return rest;
};
export async function buildRegistry({ interfaces, relations, contracts, surfaces }) {
  const nodes = new Map(); const edges = new Map();
  for (const i of interfaces) {
    await validate('interface-particular', i);
    if (nodes.has(i.interface_id)) throw new Error('DUPLICATE_INTERFACE');
    const expected = surfaces.find(s => s.emits[0] === i.emits[0] && s.evidence.source_ref === i.evidence.source_ref);
    if (!expected || canonical(surfaceBehavior(i)) !== canonical(surfaceBehavior(expected))) throw new Error('UNATTESTED_SURFACE:' + i.interface_id);
    if (i.authority.authorize) throw new Error('AUTHORITY_ESCALATION');
    nodes.set(i.interface_id, structuredClone(i));
  }
  for (const r of relations) {
    await validate('interface-relation', r);
    const a = nodes.get(r.source), b = nodes.get(r.destination);
    if (!a || !b) throw new Error('DANGLING_RELATION');
    if (edges.has(r.relation_id)) throw new Error('DUPLICATE_RELATION');
    if (!a.emits.includes(r.consumes) || !b.accepts.includes(r.produces) || !b.emits.includes(r.produces)) throw new Error('PROTOCOL_INCOMPATIBLE:' + r.relation_id);
    if (!b.operations.includes(r.operation)) throw new Error('OPERATION_UNSUPPORTED');
    if (r.requires.authority === 'mutate' && !b.authority.mutate) throw new Error('AUTHORITY_ESCALATION');
    if (r.operation === 'mutate' && r.requires.authority !== 'mutate') throw new Error('OBSERVE_MUTATE_ESCALATION');
    if (r.may_lose.some(x => r.preserves[x] === true)) throw new Error('LOSSLESS_OVER_LOSSY');
    if (r.may_lose.includes('reversibility') && r.reversible) throw new Error('REVERSIBLE_OVER_IRREVERSIBLE');
    if (r.removes.includes('ordered') && r.preserves.order) throw new Error('INFORMATION_WIDENING');
    const expected = contracts[r.binding_ref];
    if (!expected || canonical(behavior(r)) !== canonical(behavior(expected))) throw new Error('UNATTESTED_RELATION:' + r.relation_id);
    edges.set(r.relation_id, structuredClone(r));
  }
  const data = { interfaces: [...nodes.values()].sort((a,b) => a.interface_id.localeCompare(b.interface_id)), relations: [...edges.values()].sort((a,b) => a.relation_id.localeCompare(b.relation_id)) };
  return { ...data, nodes, edges, contracts, surfaces, registry_digest: digest(data) };
}
export function assertRegistryIntegrity(registry) {
  const data={interfaces:[...registry.nodes.values()].sort((a,b)=>a.interface_id.localeCompare(b.interface_id)),relations:[...registry.edges.values()].sort((a,b)=>a.relation_id.localeCompare(b.relation_id))};
  if (digest(data)!==registry.registry_digest || digest({interfaces:registry.interfaces,relations:registry.relations})!==registry.registry_digest) throw new Error('REGISTRY_CHANGED');
}
