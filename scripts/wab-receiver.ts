#!/usr/bin/env node
/** WORLD-ASKS-BACK-002: opt-in local policy gate over the *native* reLATTE R3 receiver.
 * This program DOES NOT dispatch work or actuate hardware. It admits only an
 * exact source-signed system.hash crossing after three independent signed grants.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { canonicalize, LocalReceiver, verifyCrossingEnvelope, verifyReceipt } from '../src/index.ts';

const ROLES = ['household', 'fabricator', 'stockist'] as const;
type Role = typeof ROLES[number];
const SCOPES: Record<Role, string> = {
  household: 'authorize-local-hash-of-my-proposal',
  fabricator: 'authorize-local-hash-compute',
  stockist: 'authorize-local-hash-of-stock-claim',
};
const RECEIVER_CONTRACT = 'relatte:wab-native-hash/v0';
const RECEIVER_WORLD = 'world:ghot:wab-native-hash';
const RECEIVER_PARTICULAR = 'particular:relatte:wab-native-hash';
const SOURCE_WORLD = 'world:ghot:synthetic-household';
const REQUESTED_EFFECT = { action: 'execute-bounded-hash', scope: 'local-compute-only' };
const CLAIMED_KIND = 'ghot.wab-native-hash/v0';
const GRANT_DOMAIN = 'GHOT-WAB002-NATIVE-GRANT|';
const POLICY_FILE = 'wab-local-policy.json';

type Obj = Record<string, any>;
function record(value: unknown, code: string): Obj {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw Error(code);
  return value as Obj;
}
function equal(a: unknown, b: unknown): boolean { return canonicalize(a) === canonicalize(b); }
function digest(value: unknown): string {
  return 'sha256:' + createHash('sha256').update(canonicalize(value), 'utf8').digest('hex');
}
function publicJwk(value: unknown): Obj {
  const jwk = record(value, 'WAB_BAD_PUBLIC_KEY');
  if (!equal(Object.keys(jwk).sort(), ['crv', 'kty', 'x', 'y'])) throw Error('WAB_BAD_PUBLIC_KEY_FIELDS');
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256') throw Error('WAB_BAD_CURVE');
  if (typeof jwk.x !== 'string' || typeof jwk.y !== 'string') throw Error('WAB_BAD_COORDINATES');
  if (Buffer.from(jwk.x, 'base64url').byteLength !== 32 || Buffer.from(jwk.y, 'base64url').byteLength !== 32)
    throw Error('WAB_BAD_COORDINATES');
  return jwk;
}
function pins(value: unknown): Obj {
  const valueObj = record(value, 'WAB_PINSET_REQUIRED');
  if (!equal(Object.keys(valueObj).sort(), [...ROLES].sort())) throw Error('WAB_EXACT_PINSET_REQUIRED');
  const keys = ROLES.map((role) => publicJwk(valueObj[role]));
  if (new Set(keys.map((x) => digest(x))).size !== 3) throw Error('WAB_DISTINCT_SIGNERS_REQUIRED');
  return valueObj;
}
function initPolicy(input: Obj): Obj {
  const sourcePins = pins(input.trusted_pins);
  const proposal = record(input.proposal, 'WAB_PROPOSAL_REQUIRED');
  if (proposal.schema !== 'ghot.wab-proposal/v0' || proposal.status !== 'PROPOSED' ||
      proposal.selected !== 'print' || proposal.semantic_effect !== 'none' ||
      proposal.task_request_present !== false ||
      typeof proposal.cut !== 'string' || !proposal.cut.startsWith('sha256:')) {
    throw Error('WAB_UNSUPPORTED_PROPOSAL');
  }
  const body = { ...proposal }; delete body.proposal_id;
  if (proposal.proposal_id !== 'wab-proposal:' + digest(body)) throw Error('WAB_BAD_PROPOSAL_ADDRESS');
  return {
    schema: 'relatte.wab-native-policy/v0',
    trusted_pins: sourcePins, proposal_id: proposal.proposal_id, cut: proposal.cut,
    capability: 'system.hash', receiver_world: RECEIVER_WORLD,
    physical_execution: false, economic_credit: 0,
  };
}
function householdParticular(key: Obj): string {
  return 'ghot-p256:' + digest(key).slice('sha256:'.length);
}
async function grantsValid(value: unknown, policy: Obj, crossing: Obj): Promise<boolean> {
  if (value === null || value === undefined) return false;
  const grants = record(value, 'WAB_GRANT_SET_NOT_OBJECT');
  if (!equal(Object.keys(grants).sort(), [...ROLES].sort())) {
    if (Object.keys(grants).length === 0) return false;
    throw Error('WAB_PARTIAL_OR_EXTRA_GRANTS');
  }
  for (const role of ROLES) {
    const grant = record(grants[role], 'WAB_BAD_GRANT');
    const keys = ['schema', 'role', 'proposal_id', 'cut', 'crossing_id', 'offer_address', 'capability', 'scope', 'decision', 'expires_at', 'public_key', 'signature'];
    if (!equal(Object.keys(grant).sort(), keys.sort())) throw Error('WAB_GRANT_FIELDS_INVALID');
    if (grant.schema !== 'ghot.wab-native-grant/v0' || grant.role !== role ||
        grant.proposal_id !== policy.proposal_id || grant.crossing_id !== crossing.crossing_id ||
        grant.offer_address !== crossing.extensions?.world_asks_back_native?.offer_address ||
        grant.cut !== policy.cut || grant.capability !== 'system.hash' ||
        grant.scope !== SCOPES[role] || grant.decision !== 'AUTHORIZE_LOCAL_HASH' ||
        typeof grant.expires_at !== 'string' || !Number.isFinite(Date.parse(grant.expires_at)) ||
        Date.parse(grant.expires_at) <= Date.now() ||
        Date.parse(grant.expires_at) > Date.now() + 10 * 60 * 1000 ||
        !equal(grant.public_key, policy.trusted_pins[role])) throw Error('WAB_GRANT_SCOPE_OR_PIN_FAILURE');
    const unsigned = { ...grant }; delete unsigned.signature;
    if (typeof grant.signature !== 'string') throw Error('WAB_BAD_GRANT_SIGNATURE');
    const publicKey = await crypto.subtle.importKey(
      'jwk', publicJwk(policy.trusted_pins[role]) as JsonWebKey,
      { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'],
    );
    const verified = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' }, publicKey,
      Buffer.from(grant.signature, 'base64url'),
      Buffer.from(GRANT_DOMAIN + canonicalize(unsigned), 'utf8'),
    );
    if (!verified) throw Error('WAB_BAD_GRANT_SIGNATURE');
  }
  return true;
}
async function handle(inputValue: unknown): Promise<Obj> {
  const input = record(inputValue, 'WAB_REQUEST_REQUIRED');
  if (input.schema !== 'relatte.wab-native-request/v0') throw Error('WAB_BAD_REQUEST_SCHEMA');
  if (typeof input.receiver_root !== 'string' || !input.receiver_root.startsWith('/'))
    throw Error('WAB_ABSOLUTE_ROOT_REQUIRED');
  if (input.action === 'init') {
    const policy = initPolicy(input);
    const receiver = await LocalReceiver.create(input.receiver_root, {
      world_id: RECEIVER_WORLD, receiver_particular: RECEIVER_PARTICULAR, contract_ref: RECEIVER_CONTRACT,
    });
    await writeFile(join(input.receiver_root, POLICY_FILE), JSON.stringify(policy, null, 2) + '\n',
      { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    return { schema: 'relatte.wab-native-result/v0', action: 'init',
             status: 'POLICY_PINNED_LOCALLY', policy_address: digest(policy),
             snapshot: receiver.snapshot(), physical_execution: false };
  }
  if (input.action !== 'submit') throw Error('WAB_BAD_ACTION');
  const policy = record(JSON.parse(await readFile(join(input.receiver_root, POLICY_FILE), 'utf8')), 'WAB_POLICY_MISSING');
  if (policy.schema !== 'relatte.wab-native-policy/v0' || policy.capability !== 'system.hash' ||
      policy.receiver_world !== RECEIVER_WORLD || policy.physical_execution !== false ||
      policy.economic_credit !== 0) throw Error('WAB_POLICY_INTEGRITY_FAILURE');
  pins(policy.trusted_pins);
  const proposal = record(input.proposal, 'WAB_PROPOSAL_REQUIRED');
  const checked = initPolicy({trusted_pins: policy.trusted_pins, proposal});
  if (checked.proposal_id !== policy.proposal_id || checked.cut !== policy.cut)
    throw Error('WAB_PROPOSAL_NOT_LOCALLY_PINNED');
  const crossing = record(input.crossing, 'WAB_CROSSING_REQUIRED');
  if (!(await verifyCrossingEnvelope(crossing))) throw Error('WAB_INVALID_SIGNED_CROSSING');
  if (!equal(crossing.signing?.public_key, policy.trusted_pins.household) ||
      crossing.source_particular !== householdParticular(policy.trusted_pins.household) ||
      crossing.source_world !== SOURCE_WORLD || crossing.declared_kind !== CLAIMED_KIND ||
      crossing.protocol_version !== '0' || !equal(crossing.requested_effect, REQUESTED_EFFECT) ||
      !equal(crossing.payload_refs, [{address: digest(proposal), role: 'proposal'}]) ||
      !equal(crossing.extensions?.world_asks_back_native, {
        proposal_id: proposal.proposal_id, cut: proposal.cut,
        capability: 'system.hash', physical_execution: false,
        offer_address: crossing.extensions?.world_asks_back_native?.offer_address,
      }) || typeof crossing.extensions?.world_asks_back_native?.offer_address !== 'string' ||
      !crossing.extensions.world_asks_back_native.offer_address.startsWith('sha256:')) throw Error('WAB_CROSSING_NOT_BOUND_TO_PINNED_INTENT');
  const approved = await grantsValid(input.grants, policy, crossing);
  const receiver = await LocalReceiver.open(input.receiver_root);
  // Ownership and requested effect verified BEFORE this durable RECEIVE. No
  // caller-supplied decision or unauthenticated "approve" flag is accepted.
  const received = await receiver.receive(crossing, input.received_at);
  const disposition = await receiver.dispose(
    crossing.crossing_id, approved ? 'ADMIT' : 'HOLD', input.disposed_at,
    approved ? { admit_effect: 'local-state-change', note: 'bounded local system.hash admitted; execution remains external' }
             : { note: 'no exact grants; held without effect' },
  );
  if (!(await verifyReceipt(received)) || !(await verifyReceipt(disposition)))
    throw Error('WAB_NATIVE_RECEIPT_VERIFICATION_FAILED');
  return {
    schema: 'relatte.wab-native-result/v0',
    action: 'submit', status: approved ? 'ADMITTED_FOR_LOCAL_HASH' : 'HELD_NO_CONSENT',
    approved, receive_receipt: received, disposition_receipt: disposition,
    snapshot: receiver.snapshot(), policy_address: digest(policy),
    physical_execution: false, economic_credit: 0,
  };
}
async function main(): Promise<void> {
  const parts: Buffer[] = [];
  for await (const c of process.stdin) parts.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  const raw = Buffer.concat(parts).toString('utf8');
  const result = await handle(JSON.parse(raw));
  process.stdout.write(JSON.stringify(result));
}
main().catch((e) => {
  process.stderr.write(JSON.stringify({error: e instanceof Error ? e.message : 'WAB_BRIDGE_FAILED'}) + '\n');
  process.exitCode = 1;
});
