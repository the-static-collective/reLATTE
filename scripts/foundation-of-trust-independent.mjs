/** Second implementation: native node:crypto P1363 verification; independent
 * identity bodies and canonical serializer. No high-level reLATTE imports.
 * This is bounded implementation diversity, not independent crypto standards.
 */
import { createHash, createPublicKey, verify } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
// Shared ingress parser only; identity and signature checks below are independent.
import { parseEvidenceJson } from '../src/evidence-json.ts';

const requireThat = (condition, reason) => { if (!condition) throw new Error(reason); };
function canon(value) {
  if (typeof value === 'string') { requireThat(value.isWellFormed(), 'LONE_SURROGATE'); return JSON.stringify(value); }
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    requireThat(Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value)), 'INVALID_NUMBER');
    return JSON.stringify(value);
  }
  requireThat(typeof value === 'object', 'NON_JSON_VALUE');
  requireThat(!Object.getOwnPropertySymbols(value).length, 'NON_JSON_VALUE');
  requireThat([Object.prototype, Array.prototype, null].includes(Object.getPrototypeOf(value)), 'NON_JSON_VALUE');
  for (const [k, d] of Object.entries(Object.getOwnPropertyDescriptors(value))) requireThat(!d.get && !d.set && (d.enumerable || (Array.isArray(value) && k === 'length')), 'NON_JSON_VALUE');
  if (Array.isArray(value)) {
    requireThat(Object.keys(value).length === value.length, 'NON_JSON_VALUE');
    return '[' + value.map(canon).join(',') + ']';
  }
  return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canon(value[k])).join(',') + '}';
}
const digest = (domain, object) => createHash('sha256').update(domain + canon(object)).digest('hex');
const exact = (v, allowed) => { requireThat(v && typeof v === 'object' && !Array.isArray(v), 'INVALID_OBJECT'); requireThat(Object.keys(v).every(k => allowed.includes(k)), 'UNEXPECTED_FIELD'); };
const complete = (v, fields) => { exact(v, fields); requireThat(Object.keys(v).length === fields.length, 'MISSING_FIELD'); };
function publicOnly(v) {
  if (!v || typeof v !== 'object') return;
  for (const [k, nested] of Object.entries(v)) { requireThat(!['d','p','q','dp','dq','qi','private_key','privateKey','secret','token','password'].includes(k), 'PRIVATE_MATERIAL_IN_PUBLIC_ARTIFACT'); publicOnly(nested); }
}
const bytes = (v, n) => { requireThat(typeof v === 'string' && /^[A-Za-z0-9_-]+$/.test(v), 'INVALID_BASE64URL'); const b = Buffer.from(v, 'base64url'); requireThat(b.length === n && b.toString('base64url') === v, 'INVALID_BASE64URL'); return b; };
const key = r => { const k = r.signing.public_key; requireThat(k.kty === 'EC' && k.crv === 'P-256' && !Object.hasOwn(k, 'd'), 'INVALID_PUBLIC_KEY'); bytes(k.x, 32); bytes(k.y, 32); return { kty: 'EC', crv: 'P-256', x: k.x, y: k.y }; };
const fingerprint = r => digest('reLATTE-TwoWitnessPublicKey-v0|', key(r));
const rid = r => r.schema === 'relatte.crossing-envelope/v0' ? r.crossing_id : r.receipt_id;
const crossingFields = ['schema','crossing_id','protocol_version','source_particular','source_world','source_history_head','parents','declared_kind','payload_refs','requested_effect','capability_ref','privacy_policy','audience_policy','return_address','created_at','signing','extensions'];
const receiptFields = ['schema','receipt_id','crossing_id','world_id','receiver_particular','kind','semantic_effect','contract_ref','pre_state_ref','post_state_ref','descendant_refs','residual_refs','note','created_at','signing','extensions'];
function signedRecord(r) {
  const crossing = r.schema === 'relatte.crossing-envelope/v0';
  requireThat(crossing || r.schema === 'relatte.receipt/v0', 'INVALID_SCHEMA');
  exact(r, crossing ? crossingFields : receiptFields); exact(r.signing, ['algorithm','public_key','signature','domain']);
  const domain = crossing ? 'relatte.crossing-signature/v0' : 'relatte.receipt-signature/v0';
  requireThat(r.signing.algorithm === 'ECDSA-P256-SHA256' && r.signing.domain === domain, 'INVALID_SIGNING_DOMAIN');
  const body = {};
  const strings = crossing ? ['source_particular','source_world','declared_kind'] : ['crossing_id','world_id','receiver_particular','kind','semantic_effect'];
  for (const f of strings) { requireThat(typeof r[f] === 'string' && r[f].length, 'MISSING_BINDING'); body[f] = r[f]; }
  requireThat(typeof r.created_at === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(r.created_at), 'INVALID_TIMESTAMP');
  body.schema = r.schema; body.created_at = r.created_at;
  if (crossing) { requireThat(r.protocol_version === '0' && Array.isArray(r.payload_refs), 'INVALID_CROSSING'); body.protocol_version = '0'; body.payload_refs = r.payload_refs; }
  for (const f of crossing ? ['source_history_head','requested_effect','capability_ref','privacy_policy','audience_policy','return_address'] : ['contract_ref','pre_state_ref','post_state_ref','note']) body[f] = Object.hasOwn(r, f) ? r[f] : null;
  for (const f of crossing ? ['parents'] : ['descendant_refs','residual_refs']) { body[f] = Object.hasOwn(r, f) ? r[f] : []; requireThat(Array.isArray(body[f]), 'INVALID_ARRAY'); }
  body.extensions = r.extensions ?? {};
  body.signing = { algorithm: r.signing.algorithm, public_key: key(r), domain };
  const stem = crossing ? 'CrossingEnvelope' : 'Receipt';
  const id = (crossing ? 'relatte-crossing-v0:' : 'relatte-receipt-v0:') + digest(`reLATTE-${stem}-v0|`, body);
  requireThat(id === rid(r), 'ID_MISMATCH');
  const sigBody = { [crossing ? 'crossing_id' : 'receipt_id']: id, ...body };
  const sigDomain = crossing ? 'reLATTE-CrossingSignature-v0|' : 'reLATTE-ReceiptSignature-v0|';
  requireThat(verify('sha256', Buffer.from(sigDomain + canon(sigBody)), { key: createPublicKey({ key: key(r), format: 'jwk' }), dsaEncoding: 'ieee-p1363' }, bytes(r.signing.signature, 64)), 'INVALID_SIGNATURE');
  return id;
}

export function independentlyVerify(bundle, roots, crossingId) {
  try {
    canon(bundle); publicOnly(bundle);
    exact(bundle, ['schema','policy','inventory','records']);
    requireThat(bundle.schema === 'relatte.foundation-bundle/v0', 'INVALID_BUNDLE');
    signedRecord(bundle.policy); signedRecord(bundle.inventory);
    requireThat(bundle.policy.receipt_id === roots.policy_id && fingerprint(bundle.policy) === roots.policy_key, 'UNTRUSTED_POLICY_ROOT');
    requireThat(bundle.inventory.receipt_id === roots.inventory_id && fingerprint(bundle.inventory) === roots.policy_key, 'UNTRUSTED_INVENTORY');
    const policy = bundle.policy.extensions.foundation_policy, inventory = bundle.inventory.extensions.foundation_inventory;
    complete(bundle.policy.extensions, ['foundation_policy']); complete(bundle.inventory.extensions, ['foundation_inventory']);
    complete(policy, ['schema','version','quorum','members','quorum_kind','root_assumptions']);
    complete(inventory, ['schema','policy_id','record_ids','scope']);
    requireThat(policy.schema === 'relatte.foundation-policy/v0' && inventory.schema === 'relatte.foundation-inventory/v0' && inventory.scope === 'OBSERVED_RECORDS_ONLY', 'INVALID_CONTROL_RECORD');
    requireThat(policy.root_assumptions.includes('MEMBERSHIP_SELECTED_EXTERNALLY'), 'MISSING_MEMBERSHIP_ASSUMPTION');
    for (const m of policy.members) { complete(m, ['key','role','particular','world']); requireThat(['SOURCE','RECEIVER','OBSERVER'].includes(m.role), 'INVALID_MEMBER'); }
    requireThat(inventory.policy_id === roots.policy_id, 'INVENTORY_POLICY_MISMATCH');
    requireThat(canon([...inventory.record_ids].sort()) === canon(bundle.records.map(rid).sort()), 'MISSING_REQUIRED_EVIDENCE');
    requireThat(new Set(bundle.records.map(rid)).size === bundle.records.length, 'DUPLICATE_WITNESS_RECORD');
    bundle.records.forEach(signedRecord);
    const crossing = bundle.records.find(r => r.schema === 'relatte.crossing-envelope/v0' && r.crossing_id === crossingId);
    requireThat(crossing, 'SOURCE_WITNESS_UNAVAILABLE');
    const f = crossing.extensions.foundation, b = crossing.extensions.two_witness_handoff;
    complete(crossing.extensions, ['foundation','two_witness_handoff']); complete(f, ['policy_id','relation']);
    complete(f.relation, ['kind','from','to','identity_basis']); complete(b, ['schema','handoff_id','receiver_world','receiver_particular','thing_ref']);
    requireThat(f.policy_id === roots.policy_id && f.relation.identity_basis === 'BYTE_IDENTITY', 'EVENT_POLICY_MISMATCH');
    requireThat(/^sha256:[a-f0-9]{64}$/.test(b.thing_ref), 'BYTE_DIGEST_REQUIRED');
    requireThat(crossing.requested_effect?.authority === 'receiver-local', 'ROLE_AUTHORITY_ESCALATION');
    requireThat(['CONTINUITY','LINEAGE','CUSTODY'].includes(f.relation.kind), 'INVALID_RELATION');
    if (f.relation.kind === 'CONTINUITY') requireThat(crossing.source_particular === b.receiver_particular, 'PARTICULAR_CONTINUITY_MISMATCH');
    else {
      requireThat(f.relation.from === crossing.source_particular && f.relation.to === b.receiver_particular, 'RELATION_ROLE_DISAGREEMENT');
      if (f.relation.kind === 'LINEAGE') requireThat(f.relation.from !== f.relation.to, 'LINEAGE_SELF_COLLAPSE');
    }
    requireThat(crossing.payload_refs.some(p => p.role === 'payload' && p.address === b.thing_ref), 'HANDOFF_THING_NOT_IN_CROSSING');
    const member = (r, role) => policy.members.some(m => m.key === fingerprint(r) && m.role === role && m.particular === (role === 'SOURCE' ? r.source_particular : r.receiver_particular) && m.world === (role === 'SOURCE' ? r.source_world : r.world_id));
    requireThat(member(crossing, 'SOURCE'), 'UNAUTHORIZED_SOURCE_ROLE');
    const siblings = bundle.records.filter(r => r.schema === 'relatte.crossing-envelope/v0' && r.source_particular === crossing.source_particular && r.source_world === crossing.source_world && r.extensions.two_witness_handoff.handoff_id === b.handoff_id && member(r, 'SOURCE'));
    const sourceAccount = r => canon({ binding: r.extensions.two_witness_handoff, foundation: r.extensions.foundation, payload: r.payload_refs, parents: r.parents ?? [], history: r.source_history_head ?? null });
    requireThat(new Set(siblings.map(sourceAccount)).size === 1, 'EQUIVOCATION');
    const receipts = bundle.records.filter(r => r.schema === 'relatte.receipt/v0' && r.crossing_id === crossingId);
    for (const signer of new Set(receipts.filter(r => member(r, 'RECEIVER') || member(r, 'OBSERVER')).map(fingerprint))) {
      const same = receipts.filter(r => fingerprint(r) === signer);
      requireThat(new Set(same.map(r => canon({ binding: r.extensions.two_witness_handoff, foundation: r.extensions.foundation, kind: r.kind, world: r.world_id, particular: r.receiver_particular, semantic_effect: r.semantic_effect }))).size === 1, 'EQUIVOCATION');
    }
    const keys = new Set([fingerprint(crossing)]); let receiverSeen = false;
    for (const receipt of receipts) {
      complete(receipt.extensions, ['foundation','two_witness_handoff']);
      requireThat(member(receipt, 'RECEIVER') || member(receipt, 'OBSERVER'), 'UNAUTHORIZED_RECEIVER_ROLE');
      const binding = receipt.extensions.two_witness_handoff;
      complete(binding, ['schema','handoff_id','source_particular','receiver_world','receiver_particular','thing_ref']);
      requireThat(receipt.kind === 'RECEIVED' || receipt.kind === 'R3_ADMIT', 'RECEIVER_DID_NOT_POSITIVELY_RECEIVE');
      requireThat(receipt.world_id === b.receiver_world && receipt.receiver_particular === b.receiver_particular && binding.source_particular === crossing.source_particular && binding.schema === b.schema && binding.handoff_id === b.handoff_id && binding.receiver_world === b.receiver_world && binding.receiver_particular === b.receiver_particular && binding.thing_ref === b.thing_ref && canon(receipt.extensions.foundation) === canon(f), 'HANDOFF_BINDING_DISAGREEMENT');
      requireThat(!keys.has(fingerprint(receipt)), 'DUPLICATE_SIGNER'); keys.add(fingerprint(receipt)); receiverSeen ||= member(receipt, 'RECEIVER');
    }
    requireThat(Number.isSafeInteger(policy.quorum) && policy.quorum >= 2 && policy.quorum <= policy.members.length, 'INVALID_THRESHOLD');
    requireThat(new Set(policy.members.map(m => m.key)).size === policy.members.length, 'DUPLICATE_MEMBER_KEY');
    requireThat(policy.quorum_kind === 'CRYPTOGRAPHIC_KEYS' && receiverSeen && keys.size >= policy.quorum, 'INSUFFICIENT_QUORUM');
    return { status: 'VERIFIED', evidence_level: policy.quorum === 2 ? 'E3 CORROBORATED-KEYS' : 'E6 THRESHOLD', independence_basis: 'DISTINCT_SIGNING_KEYS_ONLY', custody_domain: 'UNOBSERVED', canonical_crossing_id: crossingId };
  } catch (e) { return { status: 'HOLD', reasons: [e.message] }; }
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const [bundlePath, rootPath, crossingId] = process.argv.slice(2);
  requireThat(bundlePath && rootPath && crossingId, 'USAGE: <bundle.json> <externally-selected-roots.json> <crossing-id>');
  const result = independentlyVerify(parseEvidenceJson(await readFile(bundlePath, 'utf8')), parseEvidenceJson(await readFile(rootPath, 'utf8')), crossingId);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n'); process.exitCode = result.status === 'VERIFIED' ? 0 : 1;
}
