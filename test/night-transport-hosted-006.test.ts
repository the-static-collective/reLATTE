import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { verifyCrossingEnvelope, verifyReceipt } from '../src/protocol.ts';

test('hosted Night Shift 006 cryptographic receipts independently verify', async () => {
 const fixture = JSON.parse(await readFile(new URL('./fixtures/night-transport-hosted-006.json',import.meta.url),'utf8'));
 assert.equal(fixture.source_ref,'the-static-collective/reLATTE#121');
 assert.equal(fixture.crossing.declared_kind,'EVIDENCE_OBSERVATION');
 assert.equal(fixture.received.kind,'RECEIVED');
 assert.equal(fixture.held.kind,'R3_HOLD');
 assert.equal(await verifyCrossingEnvelope(fixture.crossing),true);
 assert.equal(await verifyReceipt(fixture.received),true);
 assert.equal(await verifyReceipt(fixture.held),true);
 assert.equal(fixture.received.crossing_id,fixture.crossing.crossing_id);
 assert.equal(fixture.held.crossing_id,fixture.crossing.crossing_id);
 assert.notDeepEqual(fixture.crossing.signing.public_key,fixture.received.signing.public_key);
 assert.deepEqual(fixture.received.signing.public_key,fixture.held.signing.public_key);
 assert.equal(fixture.held.semantic_effect,'none');
});
