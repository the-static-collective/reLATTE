/** Disposable local participant. Public context is checked before signing;
 * only this participant's directory contains its private JWK. Calls use
 * separate processes; that does not establish independent administration.
 */
import { mkdir, readFile, writeFile, appendFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { generateP256KeyPair, signingKeyIdentity, verifyReceipt, assessTrustBootstrap,
  bootstrapCoreDigest, bootstrapRecordIds, bootstrapEdgeId, parseEvidenceJson, forbidPrivateEvidence } from '../src/index.ts';
import { bootstrapReceipt, journalEvent, journalPin } from '../test/support/bootstrap.ts';
const [op, localDir, inputPath] = process.argv.slice(2);
const load = async path => parseEvidenceJson(await readFile(path, 'utf8'));
const save = (path, body) => writeFile(path, JSON.stringify(body, null, 2) + '\n');
const need = (ok, reason) => { if (!ok) throw new Error(reason); };
const input = inputPath ? await load(inputPath) : {};
forbidPrivateEvidence(input);
await mkdir(localDir, { recursive: true });
const privatePath = join(localDir, 'private.json');
const publicPath = join(localDir, 'journal.json');
async function localKeys() {
  const privateJwk = await load(privatePath);
  const privateKey = await crypto.subtle.importKey('jwk', privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const { d: _, ...publicKeyJwk } = privateJwk;
  return { privateKey, publicKeyJwk };
}
async function add(kind, data) {
  const j = await load(publicPath); const receipt = await journalEvent(await localKeys(), j.admin_id, j.records, kind, data);
  // Durable append log is authoritative; snapshot is a convenience checked
  // against the append log when restarting, never used to erase past entries.
  await appendFile(join(localDir, 'history.ndjson'), JSON.stringify(receipt) + '\n');
  j.records.push(receipt); await save(publicPath, j); await save(join(localDir, 'root-pin.json'), journalPin(j)); return j;
}
let output;
if (op === 'init') {
  const keys = await generateP256KeyPair(); await save(privatePath, await crypto.subtle.exportKey('jwk', keys.privateKey));
  const admin_id = input.admin_id;
  const genesis = await journalEvent(keys, admin_id, [], 'GENESIS', { scope: 'SOVEREIGN_LOCAL_ROOT', constitution_nonce: crypto.randomUUID() });
  const j = { admin_id, records: [genesis] };
  await writeFile(join(localDir, 'history.ndjson'), JSON.stringify(genesis) + '\n', { flag: 'wx' });
  await save(publicPath, j); await save(join(localDir, 'root-pin.json'), journalPin(j)); output = j;
} else if (op === 'policy-init') {
  const keys = await generateP256KeyPair(); await save(privatePath, await crypto.subtle.exportKey('jwk', keys.privateKey));
  output = { policy_key: signingKeyIdentity({ signing: { public_key: keys.publicKeyJwk } }), slot: crypto.randomUUID() };
} else if (op === 'delegate') output = await add('DELEGATE_POLICY', { ...input, version: 1, scope: 'ONE_DECLARED_POLICY_SLOT' });
else if (op === 'policy-sign') output = await bootstrapReceipt('bootstrap_policy', input, await localKeys(), 'policy:P', 'bootstrap:policy:' + input.slot);
else if (op === 'select') {
  const j = await load(publicPath), delegation = j.records.at(-1).extensions.bootstrap_journal.data;
  need(await verifyReceipt(input) && signingKeyIdentity(input) === delegation.policy_key && input.extensions.bootstrap_policy.slot === delegation.slot, 'UNAUTHORIZED_LOCAL_POLICY_SELECTION');
  await save(join(localDir, 'original-policy.json'), input); output = await add('SELECT_POLICY', { claim_id: input.receipt_id });
} else if (op === 'observe') {
  const assessment = await assessTrustBootstrap({ bundle: input, local_root: await load(join(localDir, 'root-pin.json')) });
  need(assessment.conflict === 'EQUIVOCATION' && assessment.reasons.includes('FOREIGN_ROOT_NOT_LOCALLY_SELECTED'), 'CONFLICT_NOT_RECONSTRUCTED');
  output = await add('OBSERVE_CONFLICT', { claim_ids: assessment.conflict_ids });
} else if (op === 'propose' || op === 'admit-exact' || op === 'close') {
  const j = await load(publicPath), pin = await load(join(localDir, 'root-pin.json')), keys = await localKeys();
  const assessment = await assessTrustBootstrap({ bundle: input, local_root: pin });
  if (op === 'propose') {
    need(assessment.conflict === 'EQUIVOCATION' && assessment.reasons.includes('NO_MUTUAL_POLICY_EDGE'), 'INVALID_PROPOSAL_BASIS');
    const first = input.policy_claims[0].extensions.bootstrap_policy;
    const data = { schema: 'relatte.bootstrap-proposal/v0', proposal_nonce: crypto.randomUUID(), slot: first.slot, version: first.version + 1,
      participants: input.journals.map(j => ({ ...journalPin(j), prior_policy_id: j.records.find(r => r.extensions.bootstrap_journal.kind === 'SELECT_POLICY').extensions.bootstrap_journal.data.claim_id })),
      conflict_ids: assessment.conflict_ids, terms: { scope: 'FUTURE_CROSS_ADMIN_HANDOFFS', quorum: 2, membership: 'EXACT_EDGE_PARTICIPANTS', root_import: false, history_rewrite: false },
      activation: 'AFTER_BOTH_LOCAL_ADMISSIONS', history_mode: 'RETAIN_BOTH_UNCHANGED' };
    output = await bootstrapReceipt('bootstrap_proposal', data, keys, j.admin_id, 'bootstrap:join:' + JSON.stringify(input.journals.map(j => j.records.at(-1).receipt_id).sort()));
  } else if (op === 'admit-exact') {
    need(assessment.reasons.includes('EXPLICIT_LOCAL_DECISIONS_REQUIRED') || assessment.reasons.includes('BOTH_LOCAL_ADMISSIONS_REQUIRED'), 'LOCAL_EDGE_CANNOT_BE_ADMITTED');
    // Scripted external choice for this specimen. Signature proves attribution,
    // not an independently observed human decision or separate administration.
    const proposal = input.proposal, participants = proposal.extensions.bootstrap_proposal.participants;
    const peer = participants.find(p => p.admin_id !== j.admin_id);
    const data = { schema: 'relatte.bootstrap-local-decision/v0', admin_id: j.admin_id, proposal_id: proposal.receipt_id,
      base_head: pin.head_id, local_genesis: pin.genesis_id, peer_key: peer.key, peer_genesis: peer.genesis_id,
      decision: 'ADMIT', scope: 'THIS_FUTURE_POLICY_EDGE_ONLY', selection_basis: 'EXPLICIT_LOCAL_ROOT_DECISION', decision_nonce: crypto.randomUUID() };
    output = await bootstrapReceipt('bootstrap_decision', data, keys, j.admin_id, proposal.receipt_id);
    await appendFile(join(localDir, 'decisions.ndjson'), JSON.stringify(output) + '\n');
  } else {
    need(assessment.reasons.includes('BOTH_FROZEN_ENCOUNTER_CLOSURES_REQUIRED'), 'INVALID_ENCOUNTER_CANNOT_BE_CLOSED');
    output = await bootstrapReceipt('bootstrap_closure', { schema: 'relatte.bootstrap-closure/v0', admin_id: j.admin_id,
      core_digest: bootstrapCoreDigest(input), record_ids: bootstrapRecordIds(input), local_head: pin.head_id,
      proposal_id: input.proposal.receipt_id, scope: 'THIS_FROZEN_ENCOUNTER_ONLY' }, keys, j.admin_id, input.proposal.receipt_id);
    await appendFile(join(localDir, 'decisions.ndjson'), JSON.stringify(output) + '\n');
  }
} else if (op === 'commit') {
  const pin = await load(join(localDir, 'root-pin.json')), result = await assessTrustBootstrap({ bundle: input, local_root: pin });
  need(result.status === 'MUTUALLY_WITNESSED', 'INVALID_EDGE_CANNOT_ACTIVATE');
  const edge_id = bootstrapEdgeId(input.proposal, input.decisions), statePath = join(localDir, 'local-state.json');
  let exists = true; try { await access(statePath); } catch { exists = false; }
  if (exists) need((await load(statePath)).edge_id === edge_id, 'ACTIVE_POLICY_EDGE_FORK');
  const archive = join(localDir, 'encounters'); await mkdir(archive, { recursive: true });
  if (!exists) await writeFile(join(archive, edge_id.replace(':', '_') + '.json'), JSON.stringify(input, null, 2) + '\n', { flag: 'wx' });
  await save(join(localDir, 'encounter.json'), input);
  await save(statePath, { pin: { ...pin, active_edge_id: edge_id }, edge_id, administrative_independence: 'UNOBSERVED' }); output = result;
} else if (op === 'restart') {
  const state = await load(join(localDir, 'local-state.json')), bundle = await load(join(localDir, 'encounter.json'));
  const log = (await readFile(join(localDir, 'history.ndjson'), 'utf8')).trim().split('\n').map(parseEvidenceJson);
  need(JSON.stringify(log) === JSON.stringify(bundle.journals.find(j => j.admin_id === state.pin.admin_id).records), 'DURABLE_HISTORY_LOG_MISMATCH');
  output = await assessTrustBootstrap({ bundle, local_root: state.pin }); need(output.joint_edge_id === state.edge_id, 'RESTART_POLICY_EDGE_CHANGED');
} else throw new Error('UNKNOWN_BOOTSTRAP_OPERATION');
forbidPrivateEvidence(output); process.stdout.write(JSON.stringify(output) + '\n');
