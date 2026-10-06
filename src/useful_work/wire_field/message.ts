import { sealOpaqueOrganCrossing } from '../../organ.ts';
import { verifyCrossingEnvelope, verifyReceipt, sealReceipt } from '../../protocol.ts';
import type { P256KeyMaterial } from '../../protocol.ts';
import { sha256Hex } from '../../canonical.ts';
import { canonicalBytes, exactKeys, record, integer } from '../job.ts';
import { equal, instant } from '../audit_clock/wire.ts';
import { signer, identity } from '../settlement/wire.ts';
import type { Wire } from '../settlement/wire.ts';
import { WORLD_KEYS, worldId } from '../field_test/profile.ts';
import type { WorldRole } from '../field_test/profile.ts';

export const WIRE_CONTRACT = 'contract:useful-work/field-test-002-wire-v1';
export const MAX_WIRE_BYTES = 8 * 1024 * 1024;
export const TOPIC_SENDERS: Record<string, readonly WorldRole[]> = {
  packet: ['A'], notice: ['A'], offer: ['B'], 'legacy-challenge': ['B'], 'legacy-response': ['A'],
  'legacy-full-receipt': ['B', 'C'], 'legacy-sample-receipt': ['B', 'C'], 'audit-plan': ['B'],
  'audit-event': ['C'], 'audit-issue': ['B'], 'audit-response': ['A'], 'audit-receipt': ['B', 'C', 'D'],
  'service-plan': ['B'], 'service-commit': ['A'], 'service-publication': ['B'], 'service-event': ['C'],
  'service-challenge': ['B'], 'resource-measurements': ['A'], 'resource-bundle': ['C'],
  evidence: ['B'], presentation: ['A'], acceptance: ['B'], 'ledger-record': ['adapter'],
  settlement: ['C'], dissent: ['D'], 'late-offer': ['B'], 'late-presentation': ['A'], 'late-hold': ['B'],
};
export const hash = (domain: string, value: unknown) => sha256Hex(Buffer.concat([Buffer.from(domain), canonicalBytes(value)]));
export function assert(condition: unknown, code: string): asserts condition { if (!condition) throw new Error(code); }
export function validatePeers(value: unknown) {
  const peers = record(value, 'INVALID_WIRE_PEERS'); exactKeys(peers, Object.keys(WORLD_KEYS), 'INVALID_WIRE_PEERS');
  const keys = new Set<string>();
  for (const role of Object.keys(WORLD_KEYS) as WorldRole[]) {
    const card = record(peers[role],'INVALID_WIRE_PEER'); exactKeys(card,['schema','role','world_id','keys','process_id'],'INVALID_WIRE_PEER');
    assert(card.schema==='useful-work.field-actor/v1' && card.role === role && card.world_id === worldId(role), 'WIRE_PEER_WORLD_MISMATCH'); integer(card.process_id,1,2147483647,'INVALID_WIRE_PEER_PROCESS');
    exactKeys(record(card.keys, 'INVALID_WIRE_PEER_KEYS'), [...WORLD_KEYS[role]], 'INVALID_WIRE_PEER_KEYS');
    for (const [name, value] of Object.entries(card.keys)) {
      const k = identity(value); assert(k.world_id === (name === 'primary' ? worldId(role) : `${worldId(role)}:${name}`), 'WIRE_PEER_KEY_WORLD_MISMATCH');
      const fingerprint = canonicalBytes(k.public_key).toString(); assert(!keys.has(fingerprint), 'WIRE_PEERS_SHARE_KEY'); keys.add(fingerprint);
    }
  }
  return peers;
}
export async function makeMessage(run: string, role: WorldRole, recipients: WorldRole[], topic: string, dependencies: string[], body: unknown, keys: P256KeyMaterial, at: string) {
  const claims = { schema: 'useful-work.wire-message/v1', run_id: run, from: role, recipients: [...recipients].sort(), topic,
    dependencies: [...dependencies].sort(), body_sha256: hash('UsefulWork-WireBody-v1|', body),
    transport_delivery_guaranteed: false, semantic_effect: 'none', global_order_asserted: false };
  const crossing = await sealOpaqueOrganCrossing({ schema: 'relatte.opaque-organ-spec/v0', family_ref: 'organ:useful-work/field-test-002-wire-v1',
    donor_contract_ref: WIRE_CONTRACT, artifact_kind: 'attributed-peer-message', source_world: worldId(role), source_particular: 'particular:wire:sender',
    source_history_head: null, payload_refs: [{ address: 'sha256:' + claims.body_sha256, role: 'wire-body', media_type: 'application/json' }],
    donor_claims: claims, requested_effect: { kind: 'candidate-ingress', authority: 'receiver-local' }, return_address: null, created_at: at }, keys);
  return { schema: 'useful-work.wire-packet/v1', crossing, body };
}
export async function inspectMessage(value: unknown, run: string, peersValue: unknown, recipient?: WorldRole) {
  assert(canonicalBytes(value).length <= MAX_WIRE_BYTES, 'WIRE_MESSAGE_TOO_LARGE');
  const p = record(structuredClone(value), 'INVALID_WIRE_MESSAGE'); exactKeys(p, ['schema', 'crossing', 'body'], 'INVALID_WIRE_MESSAGE');
  assert(p.schema === 'useful-work.wire-packet/v1' && await verifyCrossingEnvelope(p.crossing), 'INVALID_WIRE_SIGNATURE');
  const peers = validatePeers(peersValue), c = p.crossing, organ = c.extensions?.organ_adapter, m = record(organ?.donor_claims, 'INVALID_WIRE_CLAIMS');
  exactKeys(m, ['schema', 'run_id', 'from', 'recipients', 'topic', 'dependencies', 'body_sha256', 'transport_delivery_guaranteed', 'semantic_effect', 'global_order_asserted'], 'INVALID_WIRE_CLAIMS');
  assert(m.schema === 'useful-work.wire-message/v1' && m.run_id === run && typeof run === 'string' && /^[A-Za-z0-9_-]{1,96}$/.test(run), 'WIRE_RUN_MISMATCH');
  assert(Object.hasOwn(peers, m.from) && equal(signer(c), peers[m.from].keys.primary), 'WIRE_SENDER_KEY_MISMATCH');
  assert(Object.hasOwn(TOPIC_SENDERS, m.topic) && TOPIC_SENDERS[m.topic].includes(m.from), 'WIRE_TOPIC_SENDER_MISMATCH');
  for (const [list, limit] of [[m.recipients, 5], [m.dependencies, 16]] as const) {
    assert(Array.isArray(list) && list.length <= limit && new Set(list).size === list.length && equal([...list].sort(), list), 'INVALID_WIRE_LIST');
  }
  assert(m.recipients.length > 0 && m.recipients.every((r: string) => Object.hasOwn(peers, r)) && (!recipient || m.recipients.includes(recipient)), 'WIRE_RECIPIENT_MISMATCH');
  assert(m.dependencies.every((id: unknown) => typeof id === 'string' && /^relatte-crossing-v0:[a-f0-9]{64}$/.test(id)) && !m.dependencies.includes(c.crossing_id), 'INVALID_WIRE_DEPENDENCIES');
  assert(m.body_sha256 === hash('UsefulWork-WireBody-v1|', p.body) && m.transport_delivery_guaranteed === false && m.semantic_effect === 'none' && m.global_order_asserted === false, 'WIRE_BODY_OR_CLAIMS_MISMATCH');
  assert(organ.family_ref === 'organ:useful-work/field-test-002-wire-v1' && organ.donor_contract_ref === WIRE_CONTRACT && organ.artifact_kind === 'attributed-peer-message' &&
    equal(c.payload_refs, [{ address: 'sha256:' + m.body_sha256, role: 'wire-body', media_type: 'application/json' }]) && equal(c.requested_effect, { kind: 'candidate-ingress', authority: 'receiver-local' }), 'WIRE_ENVELOPE_SCOPE_MISMATCH');
  return { packet: p, id: c.crossing_id as string, claims: m, body: p.body };
}
export async function acknowledge(id: string, role: WorldRole, keys: P256KeyMaterial, at: string) {
  return sealReceipt({ schema: 'relatte.receipt/v0', crossing_id: id, world_id: worldId(role), receiver_particular: 'particular:wire:inbox',
    kind: 'RECEIVED', semantic_effect: 'none', contract_ref: WIRE_CONTRACT, pre_state_ref: null, post_state_ref: null,
    descendant_refs: [], residual_refs: [], created_at: at, note: 'This peer durably recorded this wire message locally. No application, agreement, global ordering or exactly-once network delivery is asserted.' }, keys);
}
export async function verifyAcknowledgement(value: Wire, id: string, role: WorldRole, peers: Wire) {
  assert(await verifyReceipt(value) && equal(signer(value), peers[role].keys.primary) && value.crossing_id === id && value.world_id === worldId(role) &&
    value.kind === 'RECEIVED' && value.semantic_effect === 'none' && value.contract_ref === WIRE_CONTRACT, 'INVALID_WIRE_ACKNOWLEDGEMENT'); instant(value.created_at); return value;
}
