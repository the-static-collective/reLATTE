import { randomUUID } from 'node:crypto';
import {
  generateP256KeyPair, sealCrossingEnvelope, sealReceipt, signingKeyIdentity,
  evidenceRecordId, sha256Hex,
  type P256KeyMaterial, type FoundationBundle, type TrustRoots,
} from '../../src/index.ts';

export const TIME = '2026-10-07T00:00:00.000Z';
export const THING = 'sha256:' + sha256Hex(Buffer.from('identical seed bytes'));
export const member = (keys: P256KeyMaterial, role: string, particular: string, world: string) => ({
  key: signingKeyIdentity({ signing: { public_key: keys.publicKeyJwk } }), role, particular, world,
});
export async function controlReceipt(extension: string, value: any, key: P256KeyMaterial) {
  return sealReceipt({ schema: 'relatte.receipt/v0', crossing_id: 'control:foundation', world_id: 'world:policy',
    receiver_particular: 'policy:root', kind: 'RECEIVED', semantic_effect: 'none', created_at: TIME,
    extensions: { [extension]: value } }, key);
}
export async function makePolicy(keys: P256KeyMaterial[], root: P256KeyMaterial, options: any = {}) {
  return controlReceipt('foundation_policy', { schema: 'relatte.foundation-policy/v0', version: options.version ?? '1',
    quorum: options.quorum ?? 2, quorum_kind: 'CRYPTOGRAPHIC_KEYS',
    members: options.members ?? keys.map((k, i) => member(k, i === 0 ? 'SOURCE' : i === 1 ? 'RECEIVER' : 'OBSERVER',
      i === 0 ? options.source ?? 'P' : options.receiver ?? 'Q', i === 0 ? 'world:A' : 'world:B')),
    root_assumptions: ['MEMBERSHIP_SELECTED_EXTERNALLY', 'INVENTORY_COMPLETENESS_BOUNDED_TO_PIN'] }, root);
}
export async function makeSource(key: P256KeyMaterial, policy: any, options: any = {}) {
  const source = options.source ?? 'P', receiver = options.receiver ?? 'Q';
  return sealCrossingEnvelope({ schema: 'relatte.crossing-envelope/v0', protocol_version: '0', source_particular: source,
    source_world: 'world:A', source_history_head: options.history ?? null, parents: options.parents ?? [], declared_kind: 'FOUNDATION_HANDOFF',
    payload_refs: [{ address: options.thing ?? THING, role: 'payload', media_type: 'application/octet-stream' }],
    created_at: options.time ?? TIME, requested_effect: { kind: 'handoff-candidate', authority: 'receiver-local' },
    extensions: { two_witness_handoff: { schema: 'relatte.two-witness-handoff/v0', handoff_id: options.handoff ?? randomUUID(),
      receiver_world: 'world:B', receiver_particular: receiver, thing_ref: options.thing ?? THING },
      foundation: { policy_id: policy.receipt_id, relation: options.relation ?? {
        kind: 'LINEAGE', from: source, to: receiver, identity_basis: 'BYTE_IDENTITY' } } },
    ...options.draft }, key);
}
export async function makeReceiver(crossing: any, key: P256KeyMaterial, options: any = {}) {
  const binding = crossing.extensions.two_witness_handoff;
  return sealReceipt({ schema: 'relatte.receipt/v0', crossing_id: crossing.crossing_id, world_id: binding.receiver_world,
    receiver_particular: binding.receiver_particular, kind: 'RECEIVED', semantic_effect: 'none', created_at: options.time ?? TIME,
    extensions: { two_witness_handoff: { ...binding, source_particular: crossing.source_particular }, foundation: crossing.extensions.foundation },
    ...options.draft }, key);
}
export async function freeze(policy: any, records: any[], root: P256KeyMaterial): Promise<{ bundle: FoundationBundle; roots: TrustRoots }> {
  const inventory = await controlReceipt('foundation_inventory', { schema: 'relatte.foundation-inventory/v0', policy_id: policy.receipt_id,
    record_ids: records.map(evidenceRecordId), scope: 'OBSERVED_RECORDS_ONLY' }, root);
  return { bundle: { schema: 'relatte.foundation-bundle/v0', policy, inventory, records }, roots: {
    policy_key: signingKeyIdentity(policy), policy_id: policy.receipt_id, inventory_id: inventory.receipt_id } };
}
export async function scenario(options: any = {}) {
  const keys = await Promise.all(Array.from({ length: options.count ?? 2 }, () => generateP256KeyPair()));
  const root = await generateP256KeyPair(); const policy = await makePolicy(keys, root, options);
  const crossing = await makeSource(keys[0], policy, options);
  const receipts = await Promise.all(keys.slice(1).map(k => makeReceiver(crossing, k)));
  return { ...await freeze(policy, [crossing, ...receipts], root), crossing_id: crossing.crossing_id, crossing, receipts, keys, root, policy };
}
