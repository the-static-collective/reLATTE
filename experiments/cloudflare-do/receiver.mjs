// Experimental SQLite-backed reLATTE R3 receiver. No Node filesystem required.
// Uses the canonical reLATTE protocol for crossing and receipt signatures.
import { canonicalizeDomainValue, sha256Hex } from '../../src/canonical.ts';
import { generateP256KeyPair, sealReceipt, verifyCrossingEnvelope, verifyReceipt } from '../../src/protocol.ts';

export const CONFIG = Object.freeze({
  world_id: 'world:mystical-whimsey-edge-pilot',
  receiver_particular: 'particular:mw-durable-receiver-pilot',
  contract_ref: 'relatte:mw-service-hours-proposal/v0',
});
export const SOURCE_WORLD = 'world:mystical-whimsey-owner-pilot';
export const SOURCE_PARTICULAR = 'particular:mw-owner-pilot';
export const ALLOWED_KIND = 'mw.service-hours-proposal/v0';
const HASH_DOMAIN = 'reLATTE-LocalReceiverEvent-v0|';
const STATE_DOMAIN = 'reLATTE-LocalReceiverState-v0|';
const KEY_DOMAIN = 'reLATTE-TrustedSourcePublicKey-v0|';
const signedTime = () => new Date().toISOString();
const fromJson = text => JSON.parse(text);
const row = (sql, query, ...bindings) => sql.exec(query, ...bindings).toArray()[0] ?? null;
const list = (sql, query, ...bindings) => sql.exec(query, ...bindings).toArray();
const json = x => JSON.stringify(x);
const eq = (a, b) => json(a) === json(b);
const hex = bytes => sha256Hex(bytes);
const address = x => 'sha256:' + x;
const eventHash = e => 'relatte-local-event-v0:' + hex(canonicalizeDomainValue(HASH_DOMAIN, e));
const stateRef = statuses => 'relatte-local-state-v0:' + hex(canonicalizeDomainValue(STATE_DOMAIN, {
  world_id: CONFIG.world_id,
  receiver_particular: CONFIG.receiver_particular,
  status: statuses.slice().sort((a,b)=>a.crossing_id.localeCompare(b.crossing_id)),
}));
function keyPublic(jwk) {
  return { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y };
}
export function sourceFingerprint(jwk) {
  const p = keyPublic(jwk);
  if (p.kty !== 'EC' || p.crv !== 'P-256' || typeof p.x !== 'string' || typeof p.y !== 'string') {
    throw Error('BAD_SOURCE_PUBLIC_KEY');
  }
  return address(hex(canonicalizeDomainValue(KEY_DOMAIN, p)));
}
const needed = x => typeof x === 'string' && x.length > 0;
function publicShape(c) {
  // No customer data, raw notes, free-text payloads, or operation authority in this pilot.
  // The signed crossing commits only to a hash of owner-controlled *public* service hours.
  return c && typeof c === 'object' && !Array.isArray(c)
    && c.schema === 'relatte.crossing-envelope/v0' && c.protocol_version === '0'
    && c.source_world === SOURCE_WORLD && c.source_particular === SOURCE_PARTICULAR
    && c.declared_kind === ALLOWED_KIND
    && c.source_history_head == null && c.requested_effect == null
    && c.capability_ref == null && c.privacy_policy == null && c.audience_policy == null
    && c.return_address == null
    && Array.isArray(c.parents) && c.parents.length === 0
    && c.extensions && typeof c.extensions === 'object' && !Array.isArray(c.extensions)
    && Object.keys(c.extensions).length === 0
    && Array.isArray(c.payload_refs) && c.payload_refs.length === 1
    && Object.keys(c.payload_refs[0]).sort().join(',') === 'address,media_type,role'
    && /^sha256:[a-f0-9]{64}$/.test(c.payload_refs[0].address)
    && c.payload_refs[0].role === 'service-hours-proposal'
    && c.payload_refs[0].media_type === 'application/json'
    && needed(c.crossing_id) && needed(c.created_at);
}
function receiptDraft(crossingId, kind, before, after, priorHash, receiveId, payloadRefs) {
  return {
    schema: 'relatte.receipt/v0', crossing_id: crossingId,
    world_id: CONFIG.world_id, receiver_particular: CONFIG.receiver_particular,
    kind, semantic_effect: 'none', contract_ref: CONFIG.contract_ref,
    pre_state_ref: before, post_state_ref: after,
    descendant_refs: [], residual_refs: payloadRefs,
    note: kind === 'RECEIVED' ? 'verified crossing received; no admission'
      : 'service-hours proposal held for owner decision; no publication',
    created_at: signedTime(),
    extensions: { local_receiver: kind === 'RECEIVED'
      ? { law: 'RECEIVED != ADMITTED', history_head_before: priorHash }
      : { disposition: 'HOLD', receive_receipt_id: receiveId,
          protected_payload_effect: false, history_head_before: priorHash,
          laws: ['RECEIPT != ADMISSION', 'HOLD != ADMIT'] } },
  };
}
function event(seq, previous, type, crossing, receipt) {
  const e = { schema: 'relatte.local-receiver-event/v0',
    seq, previous_hash: previous, event_type: type,
    crossing_id: receipt.crossing_id, crossing: type === 'RECEIVE' ? crossing : null,
    receipt, created_at: receipt.created_at };
  return { ...e, event_hash: eventHash(e) };
}
function statuses(sql) {
  return list(sql, 'SELECT crossing_id, disposition FROM crossings ORDER BY crossing_id');
}

export class SqliteReceiver {
  constructor(storage) {
    // storage supports Cloudflare SQLite DO sql.exec and transactionSync.
    this.storage = storage;
    this.sql = storage.sql;
    this.queue = Promise.resolve();
    this.sql.exec('CREATE TABLE IF NOT EXISTS receiver_meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS crossings (crossing_id TEXT PRIMARY KEY, crossing_json TEXT NOT NULL, received_json TEXT NOT NULL, disposition TEXT NOT NULL, disposed_json TEXT NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS journal (seq INTEGER PRIMARY KEY, event_hash TEXT NOT NULL UNIQUE, event_json TEXT NOT NULL)');
  }
  _enqueue(fn) {
    const next = this.queue.then(fn);
    this.queue = next.then(() => {}, () => {});
    return next;
  }
  _meta(k) { return row(this.sql, 'SELECT v FROM receiver_meta WHERE k = ?', k)?.v ?? null; }
  async _keys() {
    const old = this._meta('receiver_jwk');
    if (old) {
      const material = fromJson(old);
      const privateKey = await crypto.subtle.importKey('jwk', material.private_jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
      const publicKey = await crypto.subtle.importKey('jwk', material.public_jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
      return { privateKey, publicKey, publicKeyJwk: material.public_jwk };
    }
    const pair = await generateP256KeyPair();
    const material = { private_jwk: await crypto.subtle.exportKey('jwk', pair.privateKey),
      public_jwk: pair.publicKeyJwk };
    // DO-only private key. Experimental: not a managed HSM / independent key custodian.
    this.storage.transactionSync(() => {
      if (this._meta('receiver_jwk')) throw Error('KEY_INIT_RACE');
      this.sql.exec('INSERT INTO receiver_meta (k,v) VALUES (?,?)', 'receiver_jwk', json(material));
    });
    return pair;
  }
  _head() {
    return row(this.sql, 'SELECT seq,event_hash FROM journal ORDER BY seq DESC LIMIT 1') ??
      { seq: 0, event_hash: null };
  }
  snapshot() {
    const items = statuses(this.sql);
    const head = this._head();
    return {
      schema: 'relatte.local-receiver-snapshot/v0',
      world_id: CONFIG.world_id, receiver_particular: CONFIG.receiver_particular,
      history_head: head.event_hash, journal_length: head.seq,
      received: items.map(x => x.crossing_id),
      held: items.filter(x => x.disposition === 'HOLD').map(x => x.crossing_id),
      admitted: [], refused: [], returned: [], state_ref: stateRef(items),
      demo: true, booking_enabled: false, publication_enabled: false,
    };
  }
  async ingest(value, pinnedSourceFingerprint) {
    return this._enqueue(async () => {
      if (!publicShape(value) || !(await verifyCrossingEnvelope(value))) throw Error('INVALID_PILOT_CROSSING');
      if (sourceFingerprint(value.signing.public_key) !== pinnedSourceFingerprint) throw Error('SOURCE_KEY_NOT_ENROLLED');
      const crossingId = value.crossing_id;
      const prior = row(this.sql, 'SELECT received_json,disposed_json FROM crossings WHERE crossing_id = ?', crossingId);
      if (prior) return {
        crossing_id: crossingId, duplicate: true,
        receive_receipt: fromJson(prior.received_json), disposition_receipt: fromJson(prior.disposed_json),
        state: this.snapshot(),
      };
      const keys = await this._keys();
      const before = stateRef(statuses(this.sql));
      const head = this._head();
      const payloadRefs = value.payload_refs.map(x => x.address);
      const receive = await sealReceipt(
        receiptDraft(crossingId,'RECEIVED',before,before,head.event_hash,null,payloadRefs), keys);
      const firstEvent = event(head.seq + 1, head.event_hash, 'RECEIVE', value, receive);
      const after = stateRef([...statuses(this.sql), { crossing_id: crossingId, disposition: 'HOLD' }]);
      const held = await sealReceipt(
        receiptDraft(crossingId,'R3_HOLD',before,after,firstEvent.event_hash,receive.receipt_id,payloadRefs), keys);
      const secondEvent = event(firstEvent.seq + 1,firstEvent.event_hash,'DISPOSITION',null,held);
      // No await in this transaction: either the complete RECEIVE+HOLD pair survives or neither.
      this.storage.transactionSync(() => {
        if (this._head().event_hash !== head.event_hash
            || row(this.sql, 'SELECT crossing_id FROM crossings WHERE crossing_id = ?', crossingId)) {
          throw Error('CONCURRENT_STATE_CHANGE');
        }
        this.sql.exec('INSERT INTO journal (seq,event_hash,event_json) VALUES (?,?,?)',
          firstEvent.seq, firstEvent.event_hash, json(firstEvent));
        this.sql.exec('INSERT INTO journal (seq,event_hash,event_json) VALUES (?,?,?)',
          secondEvent.seq, secondEvent.event_hash, json(secondEvent));
        this.sql.exec('INSERT INTO crossings (crossing_id,crossing_json,received_json,disposition,disposed_json) VALUES (?,?,?,?,?)',
          crossingId, json(value), json(receive), 'HOLD', json(held));
      });
      return { crossing_id: crossingId, duplicate: false, receive_receipt: receive,
        disposition_receipt: held, state: this.snapshot() };
    });
  }
  // Cold replay validates journal links, source signatures, receiver key continuity,
  // and the indexed materialized state. A damaged journal fails closed.
  async replay() {
    return this._enqueue(async () => {
      const events = list(this.sql, 'SELECT seq,event_hash,event_json FROM journal ORDER BY seq');
      const items = list(this.sql, 'SELECT * FROM crossings ORDER BY crossing_id');
      const known = new Map(), decisions = new Map();
      const keyJson = this._meta('receiver_jwk');
      if (events.length && !keyJson) throw Error('JOURNAL_WITHOUT_KEY');
      const ownerKey = keyJson ? fromJson(keyJson).public_jwk : null;
      let previous = null;
      for (let i=0;i<events.length;i++) {
        const entry = events[i], e = fromJson(entry.event_json);
        if (e.seq !== i+1 || entry.seq !== i+1 || e.previous_hash !== previous) throw Error('JOURNAL_CHAIN_BROKEN');
        const { event_hash, ...body } = e;
        if (event_hash !== eventHash(body) || entry.event_hash !== event_hash) throw Error('JOURNAL_HASH_BROKEN');
        if (!(await verifyReceipt(e.receipt)) || !eq(keyPublic(e.receipt.signing.public_key),keyPublic(ownerKey))) throw Error('JOURNAL_BAD_RECEIPT');
        if (e.receipt.world_id !== CONFIG.world_id || e.receipt.receiver_particular !== CONFIG.receiver_particular
            || e.receipt.crossing_id !== e.crossing_id || e.receipt.created_at !== e.created_at) throw Error('JOURNAL_WRONG_RECEIVER');
        if (e.event_type === 'RECEIVE') {
          if (known.has(e.crossing_id) || decisions.has(e.crossing_id) || !publicShape(e.crossing)
              || !(await verifyCrossingEnvelope(e.crossing)) || e.crossing.crossing_id !== e.crossing_id
              || e.receipt.kind !== 'RECEIVED' || e.receipt.semantic_effect !== 'none'
              || e.receipt.pre_state_ref !== stateRef([...known.keys()].map(crossing_id=>({crossing_id,disposition:decisions.get(crossing_id)??'RECEIVED'})))
              || e.receipt.post_state_ref !== e.receipt.pre_state_ref) throw Error('JOURNAL_BAD_RECEIVE');
          known.set(e.crossing_id, e);
        } else if (e.event_type === 'DISPOSITION') {
          if (!known.has(e.crossing_id) || decisions.has(e.crossing_id) || e.crossing !== null
              || e.receipt.kind !== 'R3_HOLD' || e.receipt.semantic_effect !== 'none'
              || e.receipt.extensions?.local_receiver?.receive_receipt_id !== known.get(e.crossing_id).receipt.receipt_id
              || e.receipt.pre_state_ref !== stateRef([...known.keys()].map(crossing_id=>({crossing_id,disposition:decisions.get(crossing_id)??'RECEIVED'})))
              || e.receipt.post_state_ref !== stateRef([...known.keys()].map(crossing_id=>({crossing_id,disposition:crossing_id===e.crossing_id?'HOLD':decisions.get(crossing_id)??'RECEIVED'}))))
            throw Error('JOURNAL_BAD_HOLD');
          decisions.set(e.crossing_id,'HOLD');
        } else throw Error('JOURNAL_BAD_EVENT_TYPE');
        previous = event_hash;
      }
      if (items.length !== known.size || decisions.size !== known.size || events.length !== known.size*2) throw Error('JOURNAL_INDEX_MISMATCH');
      for (const item of items) {
        const first=known.get(item.crossing_id);
        const secondEvent = events.map(x=>fromJson(x.event_json)).find(x=>x.event_type==='DISPOSITION'&&x.crossing_id===item.crossing_id);
        if (!first || !secondEvent || item.disposition !== 'HOLD'
            || !eq(fromJson(item.crossing_json),first.crossing)
            || !eq(fromJson(item.received_json),first.receipt)
            || !eq(fromJson(item.disposed_json),secondEvent.receipt)) throw Error('JOURNAL_INDEX_MISMATCH');
      }
      return this.snapshot();
    });
  }
}
