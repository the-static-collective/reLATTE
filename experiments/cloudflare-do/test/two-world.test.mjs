import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { OwnerOutbox, normalizePublicHours } from '../owner/owner-store.mjs';
import { SqliteReceiver, sourceFingerprint } from '../receiver.mjs';

function storage() {
 const db=new DatabaseSync(':memory:');
 const ctx={
  sql:{exec(q,...args){const s=db.prepare(q);
    if(/^\s*SELECT\b/i.test(q))return {toArray:()=>s.all(...args)};
    s.run(...args);return {toArray:()=>[]};
  }},
  transactionSync(fn) {
   db.exec('BEGIN IMMEDIATE');
   try {const result=fn();db.exec('COMMIT');return result;}
   catch(e) {db.exec('ROLLBACK');throw e;}
  }
 };
 return {db,ctx};
}
const hours=Object.freeze({
 schema:'mw.public-hours/v0',timezone:'America/Chicago',
 days:[1,2,3,4,5],opens:'09:00',closes:'21:00'
});
test('two distinct SQLite worlds exchange actual reLATTE signed crossings and HOLD receipts',async()=>{
 const a=storage(),b=storage();
 const owner=new OwnerOutbox(a.ctx),receiver=new SqliteReceiver(b.ctx);
 const identity=await owner.identity();
 const sourcePin=identity.fingerprint;
 const recipient=await receiver.identity();
 assert.notEqual(sourcePin,recipient.fingerprint);
 const prepared=await owner.prepare(hours);
 assert.equal(prepared.acknowledged,false);
 assert.equal(owner.snapshot().pending,1);
 assert.equal(prepared.crossing.source_world,'world:mystical-whimsey-owner-pilot');
 const received=await receiver.ingest(prepared.crossing,sourcePin);
 const confirmed=await owner.confirm(prepared.crossing.crossing_id,
   received.receive_receipt,received.disposition_receipt,recipient.fingerprint);
 assert.equal(confirmed.confirmed,true);
 assert.equal(confirmed.duplicate,false);
 assert.equal(owner.snapshot().pending,0);
 assert.equal(owner.snapshot().confirmed,1);
 assert.equal(owner.snapshot().booking_enabled,false);
 assert.equal(receiver.snapshot().admitted.length,0);
 assert.equal(receiver.snapshot().held.length,1);
 const retry=await owner.prepare(hours);
 assert.equal(retry.acknowledged,true);
 assert.equal(retry.crossing.crossing_id,prepared.crossing.crossing_id);
 const duplicate=await receiver.ingest(retry.crossing,sourcePin);
 assert.equal(duplicate.duplicate,true);
 assert.equal((await owner.confirm(prepared.crossing.crossing_id,
   duplicate.receive_receipt,duplicate.disposition_receipt,recipient.fingerprint)).duplicate,true);
 assert.equal(receiver.snapshot().journal_length,2);
 assert.equal((await new OwnerOutbox(a.ctx).identity()).fingerprint,sourcePin);
 assert.equal((await new SqliteReceiver(b.ctx).identity()).fingerprint,recipient.fingerprint);
 assert.deepEqual(await new SqliteReceiver(b.ctx).replay(sourcePin),receiver.snapshot());
});
test('untrusted receiver cannot convince owner that its source proposal was held',async()=>{
 const a=storage(),b=storage(),c=storage();
 const owner=new OwnerOutbox(a.ctx),receiver=new SqliteReceiver(b.ctx),stranger=new SqliteReceiver(c.ctx);
 const source=await owner.identity();
 const recipient=await receiver.identity();
 const packet=await owner.prepare(hours);
 const remote=await receiver.ingest(packet.crossing,source.fingerprint);
 await assert.rejects(()=>owner.confirm(packet.crossing.crossing_id,
   remote.receive_receipt,remote.disposition_receipt,source.fingerprint),/UNTRUSTED_REMOTE_RECEIPT/);
 const altered=structuredClone(remote.disposition_receipt);
 altered.kind='R3_ADMIT';
 await assert.rejects(()=>owner.confirm(packet.crossing.crossing_id,
   remote.receive_receipt,altered,recipient.fingerprint),/BAD_REMOTE_RECEIPT_SIGNATURE/);
 assert.equal(owner.snapshot().pending,1);
 assert.equal(owner.snapshot().confirmed,0);
});
test('unknown business fields and corrupted hours are rejected before signing',async()=>{
 const owner=new OwnerOutbox(storage().ctx);
 const invalid=[
  {...hours,customer_name:'test'},
  {...hours,days:[1,2,2,3]},
  {...hours,timezone:'UTC'},
  {...hours,opens:'21:00',closes:'09:00'},
  {...hours,opens:'25:00'},
 ];
 for(const attempted of invalid) await assert.rejects(()=>owner.prepare(attempted),/INVALID_PUBLIC_HOURS/);
 assert.deepEqual(normalizePublicHours(hours),hours);
 assert.equal(owner.snapshot().generated,0);
});
