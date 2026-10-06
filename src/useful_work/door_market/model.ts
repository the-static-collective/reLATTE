import { sealOpaqueOrganCrossing } from '../../organ.ts';
import { verifyCrossingEnvelope } from '../../protocol.ts';
import type { P256KeyMaterial } from '../../protocol.ts';
import { canonicalBytes, exactKeys, record } from '../job.ts';
import { equal, expectedCrossingId, instant, nonempty } from '../audit_clock/wire.ts';
import { domainHash } from '../audit_clock/policy.ts';
import { evidenceReference, evaluateAcceptance, latestSignedAt, verifyEvidence } from '../settlement/evidence.ts';
import { inspectOffer, inspectPresentation, presentEvidence } from '../settlement/exchange.ts';
import { identity, signer } from '../settlement/wire.ts';
import type { Identity, Wire } from '../settlement/wire.ts';

export const MARKET_CONTRACT = 'contract:useful-work/door-market-v1';
export const MARKET_LAWS = Object.freeze(['DISCOVERY ≠ RECOMMENDATION', 'RECOMMENDATION ≠ SELECTION', 'DOOR ≠ CROSSING', 'MATCH ≠ ACCEPTANCE']);
export const MARKET_LIMITS = Object.freeze({ recommendation_issued: false, ranking_asserted: false, automatic_selection_performed: false,
  automatic_crossing_performed: false, acceptance_asserted: false, transfer_performed: false, capacity_verified: false,
  directory_complete: false, universal_identity_asserted: false, universal_price_asserted: false, shared_state_asserted: false });
function assert(condition: unknown, error: string): asserts condition { if (!condition) throw new Error(error); }
const id = (domain: string, body: unknown) => domain + ':' + domainHash(domain + '|', body);
function bounded(value: unknown, limit = 32 * 1024 * 1024) { assert(canonicalBytes(value).length <= limit, 'MARKET_SIZE_LIMIT'); }
function run(value: unknown): asserts value is string { assert(typeof value === 'string' && /^[A-Za-z0-9_-]{1,96}$/.test(value), 'INVALID_MARKET_RUN'); }
function spec(kind: string, payload: Wire, world: string, at: string) {
  nonempty(world); instant(at);
  return { schema: 'relatte.opaque-organ-spec/v0' as const, family_ref: `organ:useful-work/door-market-${kind}-v1`,
    donor_contract_ref: MARKET_CONTRACT, artifact_kind: `door-market-${kind}`, source_world: world,
    source_particular: 'particular:door-market:publisher', source_history_head: null,
    payload_refs: [{ address: 'sha256:' + domainHash('DoorMarket-Payload-v1|', payload), role: kind, media_type: 'application/json' }],
    donor_claims: payload, requested_effect: { kind: 'candidate-ingress', authority: 'receiver-local' }, return_address: null, created_at: at };
}
async function seal(kind: string, payload: Wire, keys: P256KeyMaterial, world: string, at: string) {
  bounded(payload, 2 * 1024 * 1024); return sealOpaqueOrganCrossing(spec(kind, payload, world, at), keys);
}
async function inspect(value: unknown, kind: string, runId: string) {
  run(runId); bounded(value, 2 * 1024 * 1024); const c = structuredClone(record(value, 'INVALID_MARKET_MESSAGE'));
  assert(await verifyCrossingEnvelope(c), 'INVALID_MARKET_SIGNATURE');
  const p = record(c.extensions?.organ_adapter?.donor_claims, 'INVALID_MARKET_PAYLOAD');
  assert(p.schema === `useful-work.door-market-${kind}/v1` && p.run_id === runId, 'MARKET_RUN_OR_KIND_MISMATCH');
  assert(equal(p.claims, MARKET_LIMITS) && equal(p.laws, MARKET_LAWS), 'MARKET_LIMITS_MISMATCH');
  assert(c.crossing_id === expectedCrossingId(spec(kind, p, c.source_world, c.created_at), signer(c).public_key), 'MARKET_ENVELOPE_MISMATCH');
  return { crossing: c, payload: p, publisher: signer(c) };
}
const payload = (kind: string, runId: string, body: Wire) => ({ schema: `useful-work.door-market-${kind}/v1`, run_id: runId, ...body, claims: MARKET_LIMITS, laws: MARKET_LAWS });
function endpoint(value: unknown) {
  nonempty(value); const u = new URL(value as string);
  assert(['http:', 'https:'].includes(u.protocol) && !u.username && !u.password && !u.hash, 'INVALID_MARKET_ENDPOINT'); return u.href;
}
function inventory(e: Awaited<ReturnType<typeof verifyEvidence>>) {
  return { audit: e.audit !== null, audit_history: e.history !== null, service_history: e.service !== null,
    resource_adapters: Object.entries(e.resources?.summary.by_adapter ?? {}).filter(([, v]) => (v as unknown[]).length > 0).map(([k]) => k).sort(),
    valuation_ids: e.bundle.valuations.map((v: Wire) => v.crossing.crossing_id).sort() };
}

/** A descriptor attributes one exact evidence inventory; it promises no future availability. */
export async function publishDescriptor(evidence: unknown, runId: string, keys: P256KeyMaterial, world: string, at: string) {
  run(runId); const e = await verifyEvidence(evidence);
  assert(equal(signer(e.bundle.work), { world_id: world, public_key: keys.publicKeyJwk }), 'MARKET_DESCRIPTOR_PRODUCER_MISMATCH');
  assert(instant(at) >= latestSignedAt(e.bundle), 'MARKET_DESCRIPTOR_PRECEDES_EVIDENCE');
  return seal('descriptor', payload('descriptor', runId, { evidence: evidenceReference(e.bundle), inventory: inventory(e) }), keys, world, at);
}
export async function inspectDescriptor(value: unknown, evidence: unknown, runId: string) {
  const d = await inspect(value, 'descriptor', runId), e = await verifyEvidence(evidence);
  exactKeys(d.payload, ['schema', 'run_id', 'evidence', 'inventory', 'claims', 'laws'], 'INVALID_MARKET_DESCRIPTOR');
  assert(equal(d.payload.evidence, evidenceReference(e.bundle)) && equal(d.payload.inventory, inventory(e)), 'MARKET_DESCRIPTOR_EVIDENCE_MISMATCH');
  assert(equal(d.publisher, signer(e.bundle.work)), 'MARKET_DESCRIPTOR_PRODUCER_MISMATCH');
  assert(instant(d.crossing.created_at) >= latestSignedAt(e.bundle), 'MARKET_DESCRIPTOR_PRECEDES_EVIDENCE');
  return { ...d, evidence: e };
}
/** Offer and routing hint must be published by the same locally attributable identity. */
export async function publishDoor(offer: unknown, crossingEndpoint: string, runId: string, keys: P256KeyMaterial, world: string, at: string) {
  run(runId); const o = await inspectOffer(offer);
  assert(equal(o.offerer, { world_id: world, public_key: keys.publicKeyJwk }), 'MARKET_DOOR_OFFERER_MISMATCH');
  assert(instant(at) >= instant(o.crossing.created_at), 'MARKET_DOOR_PRECEDES_OFFER');
  const advertisement = await seal('door', payload('door', runId, { offer_id: o.crossing.crossing_id, crossing_endpoint: endpoint(crossingEndpoint) }), keys, world, at);
  return { schema: 'useful-work.door/v1', offer: o.crossing, advertisement };
}
export async function inspectDoor(value: unknown, runId: string) {
  bounded(value, 4 * 1024 * 1024); const door = structuredClone(record(value, 'INVALID_MARKET_DOOR'));
  exactKeys(door, ['schema', 'offer', 'advertisement'], 'INVALID_MARKET_DOOR'); assert(door.schema === 'useful-work.door/v1', 'INVALID_MARKET_DOOR');
  const a = await inspect(door.advertisement, 'door', runId), o = await inspectOffer(door.offer);
  exactKeys(a.payload, ['schema', 'run_id', 'offer_id', 'crossing_endpoint', 'claims', 'laws'], 'INVALID_MARKET_DOOR_PAYLOAD');
  assert(a.payload.offer_id === o.crossing.crossing_id && equal(a.publisher, o.offerer), 'MARKET_DOOR_OFFERER_MISMATCH');
  assert(endpoint(a.payload.crossing_endpoint) === a.payload.crossing_endpoint && instant(a.crossing.created_at) >= instant(o.crossing.created_at), 'MARKET_DOOR_SCOPE_MISMATCH');
  return { door, door_id: a.crossing.crossing_id as string, offer: o, crossing_endpoint: a.payload.crossing_endpoint as string };
}
export async function publishListing(doors: Wire[], runId: string, keys: P256KeyMaterial, world: string, at: string) {
  run(runId); assert(doors.length <= 32, 'MARKET_DOOR_COUNT_LIMIT'); const ids: string[] = [];
  for (const d of doors) { const v = await inspectDoor(d, runId); assert(equal(v.offer.offerer, { world_id: world, public_key: keys.publicKeyJwk }), 'MARKET_LISTING_IDENTITY_MISMATCH');
    assert(instant(at) >= instant(d.advertisement.created_at), 'MARKET_LISTING_PRECEDES_DOOR'); ids.push(v.door_id); }
  assert(new Set(ids).size === ids.length, 'MARKET_DUPLICATE_LISTING_DOOR');
  return { schema: 'useful-work.door-listing/v1', doors, listing: await seal('listing', payload('listing', runId, { door_ids: ids.sort() }), keys, world, at) };
}
export async function inspectListing(value: unknown, runId: string, expected: Identity) {
  bounded(value, 8 * 1024 * 1024); const l = record(value, 'INVALID_MARKET_LISTING'); exactKeys(l, ['schema', 'doors', 'listing'], 'INVALID_MARKET_LISTING');
  assert(l.schema === 'useful-work.door-listing/v1' && Array.isArray(l.doors) && l.doors.length <= 32, 'INVALID_MARKET_LISTING');
  const p = await inspect(l.listing, 'listing', runId); exactKeys(p.payload, ['schema', 'run_id', 'door_ids', 'claims', 'laws'], 'INVALID_MARKET_LISTING_PAYLOAD');
  assert(equal(p.publisher, identity(expected)), 'MARKET_LISTING_IDENTITY_MISMATCH'); const ids: string[] = [];
  for (const d of l.doors) { const v = await inspectDoor(d, runId); assert(equal(v.offer.offerer, p.publisher), 'MARKET_LISTING_IDENTITY_MISMATCH');
    assert(instant(p.crossing.created_at) >= instant(d.advertisement.created_at), 'MARKET_LISTING_PRECEDES_DOOR'); ids.push(v.door_id); }
  assert(new Set(ids).size === ids.length && equal(p.payload.door_ids, ids.sort()), 'MARKET_LISTING_DOORS_MISMATCH');
  return structuredClone(l);
}

export interface DiscoveryInput { run_id: string; descriptor: Wire; evidence: Wire; doors: unknown[]; expected_offerers: Identity[]; observed_at: string }
/** Pure local computation: no network, callbacks, ranking, choice, or presentation. */
export async function discover(value: DiscoveryInput) {
  bounded(value); const i = structuredClone(record(value, 'INVALID_MARKET_DISCOVERY_INPUT')) as DiscoveryInput;
  exactKeys(i, ['run_id', 'descriptor', 'evidence', 'doors', 'expected_offerers', 'observed_at'], 'INVALID_MARKET_DISCOVERY_INPUT');
  run(i.run_id); const d = await inspectDescriptor(i.descriptor, i.evidence, i.run_id), at = instant(i.observed_at);
  assert(at >= instant(d.crossing.created_at), 'MARKET_DISCOVERY_PRECEDES_DESCRIPTOR');
  assert(Array.isArray(i.doors) && i.doors.length <= 64 && Array.isArray(i.expected_offerers) && i.expected_offerers.length <= 16, 'MARKET_DIRECTORY_LIMIT');
  const pins = i.expected_offerers.map(identity); assert(new Set(pins.map(p => p.world_id)).size === pins.length && new Set(pins.map(p => canonicalBytes(p.public_key).toString())).size === pins.length, 'MARKET_DUPLICATE_LOCAL_IDENTITY');
  const rows: Wire[] = [], rejected: Wire[] = [], duplicates: string[] = [], seen = new Set<string>();
  for (const source of i.doors) {
    try {
      const door = await inspectDoor(source, i.run_id), o = door.offer;
      assert(pins.some(p => equal(p, o.offerer)), 'MARKET_UNPINNED_OFFERER');
      if (seen.has(door.door_id)) { duplicates.push(door.door_id); continue; } seen.add(door.door_id);
      const policy = evaluateAcceptance(d.evidence, o.terms.policy);
      const conditions = { presenter_matches: o.terms.eligible_presenter === null || equal(o.terms.eligible_presenter, d.publisher),
        target_matches: o.terms.target === null || equal(o.terms.target, { result_id: d.evidence.native.result_id, work_crossing_id: d.evidence.native.crossing.crossing_id, job_spec_hash: d.evidence.native.header.job_spec_hash }),
        open_at_local_observation: at >= instant(door.door.advertisement.created_at) && at < instant(o.terms.present_before) };
      rows.push({ door_id: door.door_id, offer_id: o.crossing.crossing_id, offerer: o.offerer, transfer_terms: o.terms.transfer,
        crossing_endpoint: door.crossing_endpoint, policy_evaluation: policy, conditions,
        compatibility: !Object.values(conditions).every(Boolean) ? 'local-condition-mismatch' : policy.status === 'PASS' ? 'appears-compatible' : policy.status === 'MISSING' ? 'missing-evidence' : 'policy-mismatch',
        acceptance_observed: false, selection: null });
    } catch (error: any) { rejected.push({ source_hash: domainHash('DoorMarket-RejectedSource-v1|', source), error: String(error.message).slice(0,160) }); }
  }
  rows.sort((a,b) => a.door_id.localeCompare(b.door_id));
  const body = { schema: 'useful-work.door-discovery/v1', input: i, descriptor_id: d.crossing.crossing_id,
    evidence_id: d.evidence.bundle.evidence_id, rows, rejected_sources: rejected, duplicate_door_ids: duplicates,
    ordering: 'door-id-only/no-economic-ranking', recommendation: null, selected_door_id: null, claims: MARKET_LIMITS, laws: MARKET_LAWS };
  return { ...body, discovery_id: id('useful-work-door-discovery-v1', body) };
}
export async function verifyDiscovery(value: unknown) {
  bounded(value); const v = record(value, 'INVALID_MARKET_DISCOVERY'), rebuilt = await discover(v.input);
  assert(equal(rebuilt, v), 'MARKET_DISCOVERY_REPLAY_MISMATCH'); return rebuilt;
}
export async function chooseDoor(discovery: unknown, doorId: string, reason: string, keys: P256KeyMaterial, world: string, at: string) {
  const d = await verifyDiscovery(discovery); nonempty(reason); assert(reason.length <= 4096, 'MARKET_REASON_LIMIT');
  assert(d.rows.some(r => r.door_id === doorId), 'MARKET_CHOICE_DOOR_NOT_OBSERVED');
  assert(equal(signer(d.input.descriptor), { world_id: world, public_key: keys.publicKeyJwk }), 'MARKET_CHOICE_NOT_SOVEREIGN_PRESENTER');
  assert(instant(at) >= instant(d.input.observed_at), 'MARKET_CHOICE_PRECEDES_DISCOVERY');
  // Even a negative hint may be selected. Selection is sovereign; the offerer still decides.
  return seal('choice', payload('choice', d.input.run_id, { discovery_id: d.discovery_id, descriptor_id: d.descriptor_id,
    evidence_id: d.evidence_id, door_id: doorId, offer_id: d.rows.find(r => r.door_id === doorId)!.offer_id, reason, local_choice_issued: true }), keys, world, at);
}
export async function inspectChoice(choice: unknown, discovery: unknown) {
  const d = await verifyDiscovery(discovery), c = await inspect(choice, 'choice', d.input.run_id);
  exactKeys(c.payload, ['schema', 'run_id', 'discovery_id', 'descriptor_id', 'evidence_id', 'door_id', 'offer_id', 'reason', 'local_choice_issued', 'claims', 'laws'], 'INVALID_MARKET_CHOICE');
  assert(c.payload.local_choice_issued === true, 'MARKET_LOCAL_CHOICE_REQUIRED');
  nonempty(c.payload.reason); assert(c.payload.reason.length <= 4096, 'MARKET_REASON_LIMIT');
  const row = d.rows.find(r => r.door_id === c.payload.door_id);
  assert(row && c.payload.discovery_id === d.discovery_id && c.payload.descriptor_id === d.descriptor_id && c.payload.evidence_id === d.evidence_id && c.payload.offer_id === row.offer_id, 'MARKET_CHOICE_REFERENCE_MISMATCH');
  assert(equal(c.publisher, signer(d.input.descriptor)), 'MARKET_CHOICE_NOT_SOVEREIGN_PRESENTER');
  assert(instant(c.crossing.created_at) >= instant(d.input.observed_at), 'MARKET_CHOICE_PRECEDES_DISCOVERY');
  const source = d.input.doors.find((s: any) => s?.advertisement?.crossing_id === row.door_id);
  return { choice: c.crossing, discovery: d, door: await inspectDoor(source, d.input.run_id) };
}
/** An explicit second local action; signing a choice alone never calls this function. */
export async function crossChosenDoor(choice: unknown, discovery: unknown, keys: P256KeyMaterial, world: string, at: string) {
  const c = await inspectChoice(choice, discovery);
  assert(equal(signer(c.choice), { world_id: world, public_key: keys.publicKeyJwk }), 'MARKET_CROSSING_NOT_PRESENTER');
  assert(instant(at) >= instant(c.choice.created_at), 'MARKET_CROSSING_PRECEDES_CHOICE');
  const presentation = await presentEvidence(c.door.offer.crossing, c.discovery.input.evidence, keys, world, at);
  const intent = await seal('crossing', payload('crossing', c.discovery.input.run_id, { choice_id: c.choice.crossing_id,
    discovery_id: c.discovery.discovery_id, door_id: c.door.door_id, presentation_id: presentation.crossing_id, local_crossing_intent_issued: true }), keys, world, at);
  return { schema: 'useful-work.door-crossing/v1', choice: c.choice, intent, offer: c.door.offer.crossing,
    evidence: c.discovery.input.evidence, presentation };
}
export async function inspectDoorCrossing(value: unknown, discovery: unknown) {
  bounded(value); const v = record(value, 'INVALID_MARKET_CROSSING'); exactKeys(v, ['schema', 'choice', 'intent', 'offer', 'evidence', 'presentation'], 'INVALID_MARKET_CROSSING');
  assert(v.schema === 'useful-work.door-crossing/v1', 'INVALID_MARKET_CROSSING');
  const c = await inspectChoice(v.choice, discovery), intent = await inspect(v.intent, 'crossing', c.discovery.input.run_id);
  exactKeys(intent.payload, ['schema', 'run_id', 'choice_id', 'discovery_id', 'door_id', 'presentation_id', 'local_crossing_intent_issued', 'claims', 'laws'], 'INVALID_MARKET_CROSSING_INTENT');
  assert(equal(intent.payload, payload('crossing', c.discovery.input.run_id, { choice_id: c.choice.crossing_id, discovery_id: c.discovery.discovery_id,
    door_id: c.door.door_id, presentation_id: v.presentation.crossing_id, local_crossing_intent_issued: true })), 'MARKET_CROSSING_REFERENCE_MISMATCH');
  assert(equal(v.offer, c.door.offer.crossing) && equal(v.evidence, c.discovery.input.evidence), 'MARKET_CROSSING_SCOPE_MISMATCH');
  const p = await inspectPresentation(v.offer, v.evidence, v.presentation);
  assert(equal(p.presenter, signer(c.choice)) && equal(intent.publisher, p.presenter), 'MARKET_CROSSING_NOT_PRESENTER');
  assert(instant(p.crossing.created_at) >= instant(c.choice.created_at) && intent.crossing.created_at === p.crossing.created_at, 'MARKET_CROSSING_PRECEDES_CHOICE');
  return structuredClone(v);
}
