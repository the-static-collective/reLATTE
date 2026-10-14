import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { SqliteReceiver, sourceFingerprint, CONFIG, SOURCE_WORLD, SOURCE_PARTICULAR, ALLOWED_KIND } from '../receiver.mjs';
import { generateP256KeyPair, sealCrossingEnvelope, verifyReceipt } from '../../../src/protocol.ts';

function dbFixture() {
  const db = new DatabaseSync(':memory:');
  const storage = {
    sql: { exec(q,...args) {
      const s = db.prepare(q);
      if (/^\s*SELECT\b/i.test(q)) return {toArray:()=>s.all(...args)};
      s.run(...args); return {toArray:()=>[]};
    }},
    transactionSync(fn) {
      db.exec('BEGIN IMMEDIATE');
      try { const v=fn(); db.exec('COMMIT'); return v; }
      catch(e){ db.exec('ROLLBACK'); throw e; }
    }
  };
  return {db,storage};
}
async function fixture(keys, salt='one', overrides={}) {
  const sha = createHash('sha256').update('public hours '+salt).digest('hex');
  return sealCrossingEnvelope({
    schema:'relatte.crossing-envelope/v0', protocol_version:'0',
    source_particular:SOURCE_PARTICULAR,source_world:SOURCE_WORLD,
    source_history_head:null, parents:[], declared_kind:ALLOWED_KIND,
    payload_refs:[{role:'service-hours-proposal',address:'sha256:'+sha,media_type:'application/json'}],
    requested_effect:null,capability_ref:null,privacy_policy:null,audience_policy:null,
    return_address:null,created_at:'2026-10-14T15:00:00.000Z',extensions:{},
    ...overrides,
  },keys);
}
test('SQLite journal signs real reLATTE RECEIVED and HOLD receipts; never books or publishes',async()=>{
  const {storage}=dbFixture();
  const owner=await generateP256KeyPair();
  const pinned=sourceFingerprint(owner.publicKeyJwk);
  const receiver=new SqliteReceiver(storage);
  const crossing=await fixture(owner);
  const first=await receiver.ingest(crossing,pinned);
  assert.equal(first.duplicate,false);
  assert.equal(first.receive_receipt.kind,'RECEIVED');
  assert.equal(first.disposition_receipt.kind,'R3_HOLD');
  assert.equal(first.disposition_receipt.semantic_effect,'none');
  assert.equal(first.disposition_receipt.extensions.local_receiver.protected_payload_effect,false);
  assert.ok(await verifyReceipt(first.receive_receipt));
  assert.ok(await verifyReceipt(first.disposition_receipt));
  assert.equal(first.disposition_receipt.pre_state_ref!==first.disposition_receipt.post_state_ref,true);
  assert.equal(first.state.journal_length,2);
  assert.deepEqual(first.state.held,[crossing.crossing_id]);
  assert.deepEqual(first.state.admitted,[]);
  assert.equal(first.state.booking_enabled,false);
  assert.equal(first.state.publication_enabled,false);
  assert.equal(first.state.world_id,CONFIG.world_id);
  assert.deepEqual(await (new SqliteReceiver(storage)).replay(pinned),receiver.snapshot());
  const second=await receiver.ingest(crossing,pinned);
  assert.equal(second.duplicate,true);
  assert.equal(second.receive_receipt.receipt_id,first.receive_receipt.receipt_id);
  assert.equal(second.disposition_receipt.receipt_id,first.disposition_receipt.receipt_id);
  assert.equal(receiver.snapshot().journal_length,2);
});
test('two distinct crossings remain verifiable after restart; duplicate parallel ingress is idempotent',async()=>{
  const {storage}=dbFixture();
  const owner=await generateP256KeyPair();
  const pinned=sourceFingerprint(owner.publicKeyJwk);
  const receiver=new SqliteReceiver(storage);
  const one=await fixture(owner,'first'),two=await fixture(owner,'second');
  const outcomes=await Promise.all([receiver.ingest(one,pinned),receiver.ingest(one,pinned),receiver.ingest(two,pinned)]);
  assert.deepEqual(outcomes.map(x=>x.duplicate),[false,true,false]);
  assert.equal(receiver.snapshot().journal_length,4);
  assert.equal(receiver.snapshot().held.length,2);
  assert.deepEqual(await (new SqliteReceiver(storage)).replay(pinned),receiver.snapshot());
});
test('untrusted keys and signed private free-text metadata are rejected without persistent history',async()=>{
  const {storage}=dbFixture();
  const source=await generateP256KeyPair();
  const stranger=await generateP256KeyPair();
  const pinned=sourceFingerprint(source.publicKeyJwk);
  const receiver=new SqliteReceiver(storage);
  const wrong=await fixture(stranger);
  await assert.rejects(()=>receiver.ingest(wrong,pinned),/SOURCE_KEY_NOT_ENROLLED/);
  const forbidden=await fixture(source,'bad',{extensions:{customer:'a person'}}); 
  await assert.rejects(()=>receiver.ingest(forbidden,pinned),/INVALID_PILOT_CROSSING/);
  const tampered=await fixture(source,'changed');
  tampered.declared_kind='not-signed-now';
  await assert.rejects(()=>receiver.ingest(tampered,pinned),/INVALID_PILOT_CROSSING/);
  assert.equal(receiver.snapshot().journal_length,0);
});
test('cold replay fails closed for modified journal bytes and wrong identity enrollment',async()=>{
  const {storage,db}=dbFixture();
  const source=await generateP256KeyPair();
  const other=await generateP256KeyPair();
  const pinned=sourceFingerprint(source.publicKeyJwk);
  const receiver=new SqliteReceiver(storage);
  await receiver.ingest(await fixture(source),pinned);
  await assert.rejects(()=>new SqliteReceiver(storage).replay(sourceFingerprint(other.publicKeyJwk)),/JOURNAL_BAD_RECEIVE|SOURCE_KEY_NOT_ENROLLED/);
  db.prepare("UPDATE journal SET event_json = ? WHERE seq = 1").run('{"malformed":true}');
  await assert.rejects(()=>new SqliteReceiver(storage).replay(pinned),/JOURNAL_CHAIN_BROKEN|JOURNAL_HASH_BROKEN/);
});
