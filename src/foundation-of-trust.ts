/** Bounded hostile evidence assessor. A receipt proves signature attribution,
 * not truth, custody independence, human identity, admission or authority.
 * Roots and inventory pins MUST be chosen outside the received proof bundle.
 */
import { canonicalize, canonicalizeDomainValue, sha256Hex, validateForCanonicalization } from './canonical.ts';
import { verifyCrossingEnvelope, verifyReceipt } from './protocol.ts';
import { assessTwoWitnessHandoff } from './two-witness.ts';
export { parseEvidenceJson } from './evidence-json.ts';

export type EvidenceClass = 'OBSERVED' | 'DERIVED' | 'ASSUMED' | 'UNOBSERVED' | 'REFUTED';
export type PublicRecord = Record<string, any>;
export interface TrustRoots {
  policy_key: string;
  policy_id: string;
  inventory_id: string;
}
export interface CurrentTrustPolicy {
  version: string;
  world: string;
  policy_id: string;
  retired_keys: string[];
  accepted_crossings: string[];
}
export interface FoundationBundle {
  schema: 'relatte.foundation-bundle/v0';
  policy: PublicRecord | null;
  inventory: PublicRecord | null;
  records: PublicRecord[];
}
export interface FoundationAssessment {
  schema: 'relatte.foundation-assessment/v0';
  status: 'VERIFIED' | 'CLAIMED' | 'HOLD' | 'UNRECOVERABLE';
  evidence_level: 'E0 UNOBSERVED' | 'E2 SIGNED' | 'E3 CORROBORATED-KEYS' | 'E6 THRESHOLD';
  confidence: number;
  reasons: string[];
  signature_valid_ids: string[];
  conflict_ids: string[];
  independence_basis: 'NONE' | 'DISTINCT_SIGNING_KEYS_ONLY';
  quorum_kind: 'UNOBSERVED' | 'CRYPTOGRAPHIC_KEYS';
  custody: Record<string, EvidenceClass>;
  historically_verified: boolean;
  currently_acceptable: boolean | 'UNOBSERVED';
  admission: 'UNOBSERVED';
  authority: 'UNOBSERVED';
  finality: 'UNOBSERVED';
  survivor_verification: 'UNOBSERVED';
  trusted_chronology: 'UNOBSERVED';
  historical_truth: 'UNOBSERVED';
  binding_identity: 'BYTE_IDENTITY' | 'UNOBSERVED';
  payload_material: 'UNOBSERVED';
}

const fail = (ok: unknown, code: string): void => { if (!ok) throw new Error(code); };
const hash = (domain: string, value: unknown): string => sha256Hex(canonicalizeDomainValue(domain, value));
export function signingKeyIdentity(record: PublicRecord): string {
  const k = record.signing?.public_key;
  return hash('reLATTE-TwoWitnessPublicKey-v0|', { kty: k?.kty, crv: k?.crv, x: k?.x, y: k?.y });
}
export function evidenceRecordId(record: PublicRecord): string {
  return record.schema === 'relatte.crossing-envelope/v0' ? record.crossing_id : record.receipt_id;
}


export function forbidPrivateEvidence(value: unknown): void {
  validateForCanonicalization(value);
  const visit = (v: any): void => {
    if (!v || typeof v !== 'object') return;
    for (const [k, child] of Object.entries(v)) {
      fail(!['d', 'p', 'q', 'dp', 'dq', 'qi', 'private_key', 'privateKey', 'secret', 'token', 'password'].includes(k), 'PRIVATE_MATERIAL_IN_PUBLIC_ARTIFACT');
      visit(child);
    }
  };
  visit(value);
}
function exact(v: any, keys: string[], code: string): void {
  fail(v && typeof v === 'object' && !Array.isArray(v), code);
  fail(canonicalize(Object.keys(v).sort()) === canonicalize([...keys].sort()), code);
}

export interface TrustRootNode { id: string; class: EvidenceClass; depends_on: string[]; basis: string }
export function validateTrustRootGraph(nodes: TrustRootNode[]): void {
  const map = new Map(nodes.map(n => [n.id, n]));
  fail(map.size === nodes.length, 'DUPLICATE_TRUST_ROOT');
  const visiting = new Set<string>(), done = new Set<string>();
  const visit = (id: string): void => {
    fail(!visiting.has(id), 'CIRCULAR_TRUST_JUSTIFICATION'); if (done.has(id)) return;
    const node = map.get(id); fail(node, 'MISSING_TRUST_ROOT');
    fail(['ASSUMED', 'OBSERVED', 'DERIVED'].includes(node!.class), 'INVALID_TRUST_ROOT_CLASS');
    fail(node!.class !== 'DERIVED' || node!.depends_on.length > 0, 'UNFOUNDED_DERIVATION');
    visiting.add(id); for (const dep of node!.depends_on) visit(dep);
    visiting.delete(id); done.add(id);
  };
  for (const node of nodes) visit(node.id);
}

function initial(): FoundationAssessment {
  return {
    schema: 'relatte.foundation-assessment/v0', status: 'HOLD', evidence_level: 'E0 UNOBSERVED', confidence: 0,
    reasons: [], signature_valid_ids: [], conflict_ids: [], independence_basis: 'NONE', quorum_kind: 'UNOBSERVED',
    custody: { signing_identity: 'UNOBSERVED', distinct_key: 'UNOBSERVED', distinct_process: 'UNOBSERVED',
      distinct_runtime: 'UNOBSERVED', distinct_machine: 'UNOBSERVED', distinct_custody_domain: 'UNOBSERVED',
      distinct_administrative_domain: 'UNOBSERVED', distinct_human: 'UNOBSERVED', non_collusion: 'UNOBSERVED' },
    historically_verified: false, currently_acceptable: 'UNOBSERVED', admission: 'UNOBSERVED',
    authority: 'UNOBSERVED', finality: 'UNOBSERVED', survivor_verification: 'UNOBSERVED',
    trusted_chronology: 'UNOBSERVED', historical_truth: 'UNOBSERVED', binding_identity: 'UNOBSERVED',
    payload_material: 'UNOBSERVED',
  };
}

/** An inventory receipt commits the observation scope, including contradictions.
 * It does NOT assert universal absence of unknown or withheld witnesses.
 * Caller supplies the expected edge, root key, policy and inventory pins.
 */
export async function assessFoundationBundle(args: {
  bundle: FoundationBundle;
  roots: TrustRoots;
  crossing_id: string;
  current?: CurrentTrustPolicy;
}): Promise<FoundationAssessment> {
  const out = initial();
  const reject = (code: string): FoundationAssessment => { out.reasons.push(code); return out; };
  try {
    const { bundle, roots } = args;
    forbidPrivateEvidence(bundle);
    exact(bundle, ['schema', 'policy', 'inventory', 'records'], 'UNEXPECTED_BUNDLE_FIELD');
    fail(bundle.schema === 'relatte.foundation-bundle/v0' && Array.isArray(bundle.records), 'INVALID_BUNDLE');
    if (!bundle.policy) return reject('POLICY_UNAVAILABLE');
    if (!(await verifyReceipt(bundle.policy))) return reject('INVALID_POLICY_SIGNATURE');
    if (signingKeyIdentity(bundle.policy) !== roots.policy_key || bundle.policy.receipt_id !== roots.policy_id) return reject('UNTRUSTED_POLICY_ROOT');
    exact(bundle.policy.extensions, ['foundation_policy'], 'UNEXPECTED_POLICY_EXTENSION');
    const policy = bundle.policy.extensions?.foundation_policy;
    exact(policy, ['schema', 'version', 'quorum', 'members', 'quorum_kind', 'root_assumptions'], 'INVALID_POLICY');
    fail(policy.schema === 'relatte.foundation-policy/v0' && typeof policy.version === 'string', 'INVALID_POLICY');
    fail(policy.quorum_kind === 'CRYPTOGRAPHIC_KEYS', 'UNOBSERVED_QUORUM_DOMAIN');
    fail(Array.isArray(policy.members) && Number.isSafeInteger(policy.quorum) && policy.quorum >= 2 && policy.quorum <= policy.members.length, 'INVALID_THRESHOLD');
    fail(Array.isArray(policy.root_assumptions) && policy.root_assumptions.includes('MEMBERSHIP_SELECTED_EXTERNALLY'), 'MISSING_MEMBERSHIP_ASSUMPTION');
    const memberKeys = new Set<string>();
    for (const member of policy.members) {
      exact(member, ['key', 'role', 'particular', 'world'], 'INVALID_MEMBER');
      fail(typeof member.key === 'string' && /^[a-f0-9]{64}$/.test(member.key), 'INVALID_MEMBER');
      fail(['SOURCE', 'RECEIVER', 'OBSERVER'].includes(member.role) && typeof member.particular === 'string' && typeof member.world === 'string', 'INVALID_MEMBER');
      fail(!memberKeys.has(member.key), 'DUPLICATE_MEMBER_KEY'); memberKeys.add(member.key);
    }
    if (!bundle.inventory) return reject('INVENTORY_UNAVAILABLE');
    if (!(await verifyReceipt(bundle.inventory))) return reject('INVALID_INVENTORY_SIGNATURE');
    if (signingKeyIdentity(bundle.inventory) !== roots.policy_key || bundle.inventory.receipt_id !== roots.inventory_id) return reject('UNTRUSTED_INVENTORY');
    exact(bundle.inventory.extensions, ['foundation_inventory'], 'UNEXPECTED_INVENTORY_EXTENSION');
    const inventory = bundle.inventory.extensions?.foundation_inventory;
    exact(inventory, ['schema', 'policy_id', 'record_ids', 'scope'], 'INVALID_INVENTORY');
    fail(inventory.schema === 'relatte.foundation-inventory/v0' && inventory.policy_id === roots.policy_id, 'INVENTORY_POLICY_MISMATCH');
    fail(inventory.scope === 'OBSERVED_RECORDS_ONLY', 'UNBOUNDED_INVENTORY_CLAIM');
    fail(Array.isArray(inventory.record_ids) && inventory.record_ids.every((id: any) => typeof id === 'string'), 'INVALID_INVENTORY');
    fail(new Set(inventory.record_ids).size === inventory.record_ids.length, 'DUPLICATE_INVENTORY_ID');
    const ids = bundle.records.map(evidenceRecordId);
    if (new Set(ids).size !== ids.length) return reject('DUPLICATE_WITNESS_RECORD');
    if (inventory.record_ids.some((id: string) => !ids.includes(id))) return reject('MISSING_REQUIRED_EVIDENCE');
    if (ids.some(id => !inventory.record_ids.includes(id))) return reject('UNINVENTORIED_EVIDENCE');
    for (const record of bundle.records) {
      const valid = record.schema === 'relatte.crossing-envelope/v0' ? await verifyCrossingEnvelope(record)
        : record.schema === 'relatte.receipt/v0' && await verifyReceipt(record);
      if (!valid) return reject('INVALID_WITNESS_SIGNATURE');
      out.signature_valid_ids.push(evidenceRecordId(record));
    }
    const crossings = bundle.records.filter(r => r.schema === 'relatte.crossing-envelope/v0');
    const target = crossings.find(r => r.crossing_id === args.crossing_id);
    if (!target) { out.status = bundle.records.length ? 'HOLD' : 'UNRECOVERABLE'; return reject('SOURCE_WITNESS_UNAVAILABLE'); }
    const foundation = target.extensions?.foundation;
    exact(target.extensions, ['foundation', 'two_witness_handoff'], 'UNEXPECTED_FOUNDATION_EXTENSION');
    exact(foundation, ['policy_id', 'relation'], 'INVALID_FOUNDATION_BINDING');
    if (foundation.policy_id !== roots.policy_id) return reject('EVENT_POLICY_MISMATCH');
    exact(foundation.relation, ['kind', 'from', 'to', 'identity_basis'], 'INVALID_RELATION');
    fail(['CONTINUITY', 'LINEAGE', 'CUSTODY'].includes(foundation.relation.kind), 'INVALID_RELATION');
    fail(foundation.relation.identity_basis === 'BYTE_IDENTITY', 'UNSUPPORTED_IDENTITY_BASIS');
    fail(typeof foundation.relation.from === 'string' && typeof foundation.relation.to === 'string', 'INVALID_RELATION');
    // Role membership is bounded by event policy, not self-assigned labels.
    const member = (r: PublicRecord, role: string): any => policy.members.find((m: any) =>
      m.key === signingKeyIdentity(r) && m.role === role && m.particular === (role === 'SOURCE' ? r.source_particular : r.receiver_particular)
      && m.world === (role === 'SOURCE' ? r.source_world : r.world_id));
    if (!member(target, 'SOURCE')) return reject('UNAUTHORIZED_SOURCE_ROLE');
    const first = await assessTwoWitnessHandoff({ crossing: target });
    if (first.status !== 'CLAIMED') { out.reasons.push(...first.reasons); return out; }
    const binding = target.extensions.two_witness_handoff;
    exact(binding, ['schema', 'handoff_id', 'receiver_world', 'receiver_particular', 'thing_ref'], 'UNEXPECTED_HANDOFF_FIELD');
    fail(/^sha256:[a-f0-9]{64}$/.test(binding.thing_ref), 'BYTE_DIGEST_REQUIRED');
    fail(target.requested_effect?.authority === 'receiver-local', 'ROLE_AUTHORITY_ESCALATION');
    const relation = foundation.relation;
    if (relation.kind === 'CONTINUITY') {
      fail(target.source_particular === binding.receiver_particular, 'PARTICULAR_CONTINUITY_MISMATCH');
    } else {
      fail(relation.from === target.source_particular && relation.to === binding.receiver_particular, 'RELATION_ROLE_DISAGREEMENT');
      if (relation.kind === 'LINEAGE') fail(relation.from !== relation.to, 'LINEAGE_SELF_COLLAPSE');
    }
    const sourceClaims = crossings.filter(r => r.source_particular === target.source_particular && r.source_world === target.source_world
      && r.extensions?.two_witness_handoff?.handoff_id === binding.handoff_id && member(r, 'SOURCE'));
    // All signed accounts of a handoff stay available; no last-write-wins map.
    const account = (r: PublicRecord): string => canonicalize({ binding: r.extensions?.two_witness_handoff ?? null,
      relation: r.extensions?.foundation ?? null, payload: r.payload_refs ?? null, parents: r.parents ?? [], history: r.source_history_head ?? null });
    if (new Set(sourceClaims.map(account)).size > 1) {
      out.conflict_ids = sourceClaims.map(evidenceRecordId); return reject('EQUIVOCATION');
    }
    const receipts = bundle.records.filter(r => r.schema === 'relatte.receipt/v0' && r.crossing_id === target.crossing_id);
    const eligible = receipts.filter(r => member(r, 'RECEIVER') || member(r, 'OBSERVER'));
    const receiptAccount = (r: PublicRecord): string => canonicalize({ binding: r.extensions?.two_witness_handoff ?? null,
      foundation: r.extensions?.foundation ?? null, kind: r.kind, world: r.world_id, particular: r.receiver_particular, semantic_effect: r.semantic_effect });
    for (const key of new Set(eligible.map(signingKeyIdentity))) {
      const sameKey = eligible.filter(r => signingKeyIdentity(r) === key);
      if (new Set(sameKey.map(receiptAccount)).size > 1) { out.conflict_ids = sameKey.map(evidenceRecordId); return reject('EQUIVOCATION'); }
    }
    const keys = new Set<string>([signingKeyIdentity(target)]);
    let receiverSeen = false;
    for (const receipt of receipts) {
      exact(receipt.extensions, ['foundation', 'two_witness_handoff'], 'UNEXPECTED_FOUNDATION_EXTENSION');
      if (!member(receipt, 'RECEIVER') && !member(receipt, 'OBSERVER')) return reject('UNAUTHORIZED_RECEIVER_ROLE');
      if (canonicalize(receipt.extensions?.foundation ?? null) !== canonicalize(foundation)) return reject('RELATION_BINDING_DISAGREEMENT');
      exact(receipt.extensions.two_witness_handoff, ['schema', 'handoff_id', 'source_particular', 'receiver_world', 'receiver_particular', 'thing_ref'], 'UNEXPECTED_HANDOFF_FIELD');
      const pair = await assessTwoWitnessHandoff({ crossing: target, receiver_receipt: receipt });
      if (pair.status !== 'CORROBORATED') { out.reasons.push(...pair.reasons); return out; }
      if (keys.has(signingKeyIdentity(receipt))) return reject('DUPLICATE_SIGNER');
      keys.add(signingKeyIdentity(receipt));
      receiverSeen ||= Boolean(member(receipt, 'RECEIVER'));
    }
    if (!receipts.length) {
      out.status = 'CLAIMED'; out.evidence_level = 'E2 SIGNED'; out.confidence = 2;
      out.custody.signing_identity = 'OBSERVED'; out.reasons = ['SOURCE_WITNESS_ONLY']; return out;
    }
    if (!receiverSeen) return reject('RECEIVER_WITNESS_UNAVAILABLE');
    if (keys.size < policy.quorum) return reject('INSUFFICIENT_QUORUM');
    out.status = 'VERIFIED'; out.historically_verified = true;
    out.binding_identity = 'BYTE_IDENTITY';
    out.evidence_level = policy.quorum === 2 ? 'E3 CORROBORATED-KEYS' : 'E6 THRESHOLD';
    // E6 is a policy facet, not proof of E4/E5. Confidence counts observed keys.
    out.confidence = policy.quorum; out.independence_basis = 'DISTINCT_SIGNING_KEYS_ONLY';
    out.quorum_kind = 'CRYPTOGRAPHIC_KEYS'; out.custody.signing_identity = 'OBSERVED'; out.custody.distinct_key = 'OBSERVED';
    out.reasons = ['MATCHING_SIGNED_WITNESSES', 'SYBIL_RESISTANCE_UNOBSERVED', 'GLOBAL_COMPLETENESS_UNOBSERVED'];
    if (args.current) {
      const current = args.current;
      try {
        validateForCanonicalization(current);
        exact(current, ['version', 'world', 'policy_id', 'retired_keys', 'accepted_crossings'], 'INVALID_CURRENT_POLICY');
        fail([current.version, current.world, current.policy_id].every(v => typeof v === 'string' && v.length > 0), 'INVALID_CURRENT_POLICY');
        fail([current.retired_keys, current.accepted_crossings].every(v => Array.isArray(v) && v.every(k => typeof k === 'string')), 'INVALID_CURRENT_POLICY');
      } catch {
        out.currently_acceptable = false; out.reasons.push('INVALID_CURRENT_POLICY'); return out;
      }
      const retired = [...keys].some(k => current.retired_keys.includes(k));
      out.currently_acceptable = current.world === binding.receiver_world && current.policy_id === roots.policy_id
        && current.accepted_crossings.includes(target.crossing_id) && !retired;
      if (!out.currently_acceptable) out.reasons.push(retired ? 'CURRENT_KEY_RETIRED' : 'CURRENT_POLICY_REJECTS');
    }
    return out;
  } catch (e) { return reject(e instanceof Error ? e.message : 'INVALID_EVIDENCE'); }
}

/** Consequential paths consume verified signed edges. Unsigned structural
 * particularity records remain declarations and cannot populate this graph.
 */
export async function assessContinuityPath(args: {
  edges: { bundle: FoundationBundle; roots: TrustRoots; crossing_id: string }[];
  from: string; to: string; particular: string;
}): Promise<{ status: 'VERIFIED' | 'HOLD'; same_particular: boolean; reasons: string[]; authority: 'UNOBSERVED' }> {
  const adjacency = new Map<string, string[]>();
  for (const edge of args.edges) {
    const result = await assessFoundationBundle(edge);
    if (!result.historically_verified) continue;
    const crossing = edge.bundle.records.find(r => r.crossing_id === edge.crossing_id && r.schema === 'relatte.crossing-envelope/v0')!;
    const relation = crossing.extensions.foundation.relation;
    if (relation.kind !== 'CONTINUITY' || crossing.source_particular !== args.particular
      || crossing.extensions.two_witness_handoff.receiver_particular !== args.particular) continue;
    adjacency.set(relation.from, [...(adjacency.get(relation.from) ?? []), relation.to]);
  }
  const pending = [args.from], seen = new Set<string>();
  while (pending.length) {
    const node = pending.shift()!; if (seen.has(node)) continue; seen.add(node);
    for (const next of adjacency.get(node) ?? []) {
      if (next === args.to) return { status: 'VERIFIED', same_particular: true, reasons: ['TRAVERSABLE_SIGNED_PATH'], authority: 'UNOBSERVED' };
      pending.push(next);
    }
  }
  return { status: 'HOLD', same_particular: false, reasons: ['NO_WITNESSED_CONTINUITY_PATH'], authority: 'UNOBSERVED' };
}
