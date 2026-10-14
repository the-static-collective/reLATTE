// R3-CF-002 / first independent signed owner-side Durable Object.
// NO customer data, appointment requests, publishing or commerce.
import { DurableObject } from 'cloudflare:workers';
import { canonicalize, sha256Hex } from '../../../src/canonical.ts';
import {
  generateP256KeyPair, sealCrossingEnvelope, verifyReceipt,
} from '../../../src/protocol.ts';
import {
  sourceFingerprint, CONFIG, SOURCE_WORLD, SOURCE_PARTICULAR, ALLOWED_KIND,
} from '../receiver.mjs';

const json = JSON.stringify;
const queryOne = (sql, sqlText, ...args) => sql.exec(sqlText, ...args).toArray()[0] ?? null;
const parse = JSON.parse;
const equality = (a,b) => json(a)===json(b);
function timestring(value) {
  return typeof value === 'string' && /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(value);
}
function daySet(days) {
  return Array.isArray(days) && days.length > 0 && days.length < 8
    && days.every((x,i)=>Number.isInteger(x)&&x>=1&&x<=7&&(!i||x>days[i-1]));
}
export function normalizePublicHours(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('INVALID_PUBLIC_HOURS');
  if (Object.keys(value).sort().join('|') !== ['schema','days','opens','closes','timezone'].sort().join('|'))
    throw Error('INVALID_PUBLIC_HOURS');
  if (value.schema!=='mw.public-hours/v0'
      || value.timezone!=='America/Chicago'
      || !daySet(value.days)
      || !timestring(value.opens) || !timestring(value.closes)
      || value.opens>=value.closes) throw Error('INVALID_PUBLIC_HOURS');
  return {
    schema:'mw.public-hours/v0',timezone:'America/Chicago',
    days:[...value.days], opens:value.opens, closes:value.closes,
  };
}
function publicKeyOnly(key) { return {kty:key.kty,crv:key.crv,x:key.x,y:key.y}; }
const fingerprint = jwk => sourceFingerprint(jwk);
export class OwnerOutbox {
  constructor(storage) {
    this.storage = storage; this.sql = storage.sql;
    this.queue = Promise.resolve();
    this.sql.exec('CREATE TABLE IF NOT EXISTS owner_meta (k TEXT PRIMARY KEY,v TEXT NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS outbox (proposal_key TEXT PRIMARY KEY,crossing_id TEXT UNIQUE NOT NULL,crossing_json TEXT NOT NULL,receipts_json TEXT)');
  }
  _enqueue(fn) {
    const next = this.queue.then(fn);
    this.queue = next.then(()=>{},()=>{});
    return next;
  }
  _meta(k) {return queryOne(this.sql,'SELECT v FROM owner_meta WHERE k = ?',k)?.v ?? null;}
  async _keys() {
    const existing=this._meta('owner_jwk');
    if (existing) {
      const k=parse(existing);
      const privateKey=await crypto.subtle.importKey('jwk',k.private,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
      const publicKey=await crypto.subtle.importKey('jwk',k.public,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
      return {privateKey,publicKey,publicKeyJwk:k.public};
    }
    const pair=await generateP256KeyPair();
    const pairValue={private:await crypto.subtle.exportKey('jwk',pair.privateKey),public:pair.publicKeyJwk};
    this.storage.transactionSync(()=>{
      if(this._meta('owner_jwk'))throw Error('SOURCE_IDENTITY_INITIALIZATION_RACE');
      this.sql.exec('INSERT INTO owner_meta (k,v) VALUES (?,?)','owner_jwk',json(pairValue));
    });
    return pair;
  }
  async identity() {
    return this._enqueue(async()=>{
      const keys=await this._keys();
      return {world_id:SOURCE_WORLD,particular:SOURCE_PARTICULAR,
        public_key:keys.publicKeyJwk,fingerprint:fingerprint(keys.publicKeyJwk),
        admitted_to_operate_business:false};
    });
  }
  async prepare(proposed) {
    return this._enqueue(async()=>{
      const hours=normalizePublicHours(proposed);
      const proposalKey='sha256:'+sha256Hex(Buffer.from(canonicalize(hours),'utf8'));
      const prev=queryOne(this.sql,'SELECT * FROM outbox WHERE proposal_key = ?',proposalKey);
      if(prev) return {
        proposed_hours:hours,crossing:parse(prev.crossing_json),
        acknowledged:prev.receipts_json!==null,
        receipts:prev.receipts_json?parse(prev.receipts_json):null,
      };
      const keys=await this._keys();
      const crossing=await sealCrossingEnvelope({
        schema:'relatte.crossing-envelope/v0',protocol_version:'0',
        source_particular:SOURCE_PARTICULAR,source_world:SOURCE_WORLD,
        source_history_head:null,parents:[],declared_kind:ALLOWED_KIND,
        payload_refs:[{address:proposalKey,role:'service-hours-proposal',media_type:'application/json'}],
        requested_effect:null,capability_ref:null,privacy_policy:null,audience_policy:null,
        return_address:null,created_at:new Date().toISOString(),extensions:{},
      },keys);
      this.storage.transactionSync(()=>{
        if(queryOne(this.sql,'SELECT proposal_key FROM outbox WHERE proposal_key = ?',proposalKey))
          throw Error('PROPOSAL_RACE');
        this.sql.exec('INSERT INTO outbox (proposal_key,crossing_id,crossing_json,receipts_json) VALUES (?,?,?,NULL)',
          proposalKey,crossing.crossing_id,json(crossing));
      });
      return {proposed_hours:hours,crossing,acknowledged:false,receipts:null};
    });
  }
  async confirm(crossingId, received, held, pinnedReceiverKey) {
    return this._enqueue(async()=>{
      const existing=queryOne(this.sql,'SELECT * FROM outbox WHERE crossing_id = ?',crossingId);
      if(!existing)throw Error('UNKNOWN_SOURCE_CROSSING');
      if(!/^sha256:[a-f0-9]{64}$/.test(pinnedReceiverKey))throw Error('NO_RECEIVER_TRUST_ANCHOR');
      const crossing=parse(existing.crossing_json);
      if(!(await verifyReceipt(received)) || !(await verifyReceipt(held)))
        throw Error('BAD_REMOTE_RECEIPT_SIGNATURE');
      for(const receipt of [received,held]) {
        if(receipt.crossing_id!==crossingId
          ||receipt.world_id!==CONFIG.world_id
          ||receipt.receiver_particular!==CONFIG.receiver_particular
          ||receipt.semantic_effect!=='none'
          ||fingerprint(receipt.signing?.public_key)!==pinnedReceiverKey)
          throw Error('UNTRUSTED_REMOTE_RECEIPT');
      }
      if(received.kind!=='RECEIVED'
         ||held.kind!=='R3_HOLD'
         ||held.extensions?.local_receiver?.receive_receipt_id!==received.receipt_id
         ||held.extensions?.local_receiver?.protected_payload_effect!==false
         ||!equality(received.residual_refs,crossing.payload_refs.map(x=>x.address))
         ||!equality(held.residual_refs,crossing.payload_refs.map(x=>x.address))
         ||received.post_state_ref!==received.pre_state_ref
         ||held.post_state_ref===held.pre_state_ref)
        throw Error('WRONG_REMOTE_CONSEQUENCE');
      const pair={received,held};
      if(existing.receipts_json!==null) {
        if(!equality(parse(existing.receipts_json),pair)) throw Error('CONFLICTING_REMOTE_RECEIPTS');
        return {crossing_id:crossingId,duplicate:true,confirmed:true,receipt_ids:[received.receipt_id,held.receipt_id]};
      }
      this.storage.transactionSync(()=>{
        this.sql.exec('UPDATE outbox SET receipts_json = ? WHERE crossing_id = ? AND receipts_json IS NULL',
          json(pair),crossingId);
      });
      return {crossing_id:crossingId,duplicate:false,confirmed:true,receipt_ids:[received.receipt_id,held.receipt_id]};
    });
  }
  snapshot() {
    const items=this.sql.exec('SELECT proposal_key,crossing_id,receipts_json FROM outbox ORDER BY proposal_key').toArray();
    return {world_id:SOURCE_WORLD,particular:SOURCE_PARTICULAR,
      generated:items.length,confirmed:items.filter(x=>x.receipts_json!==null).length,
      pending:items.filter(x=>x.receipts_json===null).length,
      crossing_ids:items.map(x=>x.crossing_id),
      owner_business_authority:false,booking_enabled:false,publication_enabled:false};
  }
}
export class MysticalWhimseyOwner extends DurableObject {
  constructor(ctx,env){
    super(ctx,env);
    this.outbox=new OwnerOutbox(ctx.storage);
  }
  async identity(){return this.outbox.identity();}
  async prepare(hours){return this.outbox.prepare(hours);}
  async confirm(crossingId,received,held,pinned){return this.outbox.confirm(crossingId,received,held,pinned);}
  async state(){return this.outbox.snapshot();}
}
