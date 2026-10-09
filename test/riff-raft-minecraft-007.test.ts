import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compareRepositoryCopies,verifyExistingCustodyBytes,SOURCE_SHA256} from
  '../experiments/riff-raft-minecraft-007/custody-audit.mjs';

const SOURCE_PATH='fixtures/riff-raft-minecraft-006/signed-005-return.bundle.json';

test('007: primary Git-only evidence cold replays actual signed 004 + 005 native game worlds',async()=>{
  const raw=readFileSync(SOURCE_PATH);
  const result=await verifyExistingCustodyBytes(raw);
  assert.equal(result.source_sha256,SOURCE_SHA256);
  assert.deepEqual(result.observed_prior_and_next,{A:[3,5],B:[6,2]});
  assert.equal(result.disposition,'HOLD');
  assert.equal(result.all_original_signatures_and_source_bytes_verified,true);
  assert.equal(result.admission,false);
  assert.equal(result.physical_actuation,false);
  assert.equal(result.administrative_independence_verified,false);
});

test('007: two separate local source copies must match exactly',async()=>{
  const raw=readFileSync(SOURCE_PATH);
  const received=await compareRepositoryCopies(raw,Buffer.from(raw));
  assert.equal(received.disposition,'HOLD');
});

test('007: altered bytes, missing replica, and old signatures cannot become new evidence',async()=>{
  const raw=readFileSync(SOURCE_PATH);
  const tampered=Buffer.from(raw);
  tampered[tampered.length-1] ^= 1;
  await assert.rejects(()=>compareRepositoryCopies(raw,tampered),/TWO_STORES_DIFFER_OR_MISSING/);
  await assert.rejects(()=>verifyExistingCustodyBytes(tampered),/PINNED_SOURCE_BYTE_HASH_CHANGED/);
  await assert.rejects(()=>compareRepositoryCopies(raw,Buffer.alloc(0)),/TWO_STORES_DIFFER_OR_MISSING/);
});

test('007: distribution is NOT independently administered authority',()=>{
  const flow=readFileSync('.github/workflows/riff-raft-minecraft-007.yml','utf8');
  assert.match(flow,/name: RIFF-RAFT-MINECRAFT-007/);
  assert.match(flow,/repository: the-static-collective\/GHoT/);
  assert.match(flow,/name: reLATTE source reopens while GHoT peer data is unavailable/);
  assert.match(flow,/name: GHoT copy reopens while reLATTE primary data is unavailable/);
  const auditor=readFileSync('experiments/riff-raft-minecraft-007/custody-audit.mjs','utf8');
  assert.match(auditor,/administrative_independence_verified:false/);
});
