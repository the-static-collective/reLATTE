import assert from 'node:assert/strict';
import {mkdtemp, readFile, readdir, rm, writeFile, stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {
  LocalReceiver, generateP256KeyPair, sealCrossingEnvelope, sha256Hex,
  verifyReceipt,
} from '../src/index.ts';

async function setup() {
  const base = await mkdtemp(join(tmpdir(), 'relatte-material-custody-'));
  const root = join(base, 'orchard-receiver');
  const receiver = await LocalReceiver.create(root, {
    world_id: 'webz:the-static-collective/orchard-022100',
    receiver_particular: 'particular:webz:orchard-local-inbox',
    contract_ref: 'contract:webz:orchard-fixture-inbox/v0',
  });
  return {base, root, receiver};
}
async function crossingFor(payload: Buffer, marker: string) {
  const keys = await generateP256KeyPair();
  return sealCrossingEnvelope({
    schema: 'relatte.crossing-envelope/v0',
    protocol_version: '0',
    source_particular: 'particular:webz:test:' + marker,
    source_world: 'webz:the-static-collective/sanctuary',
    source_history_head: null,
    parents: [],
    declared_kind: 'OPAQUE_ORGAN_ARTIFACT',
    payload_refs: [{
      address: 'sha256:' + sha256Hex(payload),
      role: 'fictional-first-party-artifact',
      media_type: 'application/json',
    }],
    requested_effect: {kind: 'candidate-world-parcel-ingress', authority: 'orchard-receiver-local'},
    capability_ref: null,
    privacy_policy: null,
    audience_policy: null,
    return_address: 'webz::static/sanctuary',
    created_at: '2026-10-07T04:30:00.000Z',
    extensions: {},
  }, keys);
}

test('HOLD independently verifies and retains exact bytes with receiver-key signed custody receipt', async () => {
  const {base, root, receiver} = await setup();
  try {
    const payload = Buffer.from('{"title":"Impossible orange","seed":"022100"}\n', 'utf8');
    const crossing = await crossingFor(payload,'fruit');
    await receiver.receive(crossing,'2026-10-07T04:30:01.000Z');
    await receiver.dispose(crossing.crossing_id,'HOLD','2026-10-07T04:30:02.000Z');
    const length = receiver.journalLength();
    const receipt = await receiver.verifyPayloadBytes(
      crossing.crossing_id,payload,'2026-10-07T04:30:03.000Z',
    );
    assert.equal(await verifyReceipt(receipt),true);
    assert.equal(receipt.kind,'PAYLOAD_BYTES_VERIFIED');
    assert.equal(receipt.semantic_effect,'none');
    assert.equal(receipt.crossing_id,crossing.crossing_id);
    assert.equal(receipt.extensions.local_receiver.payload_custody.sha256,sha256Hex(payload));
    assert.equal(receipt.extensions.local_receiver.payload_custody.byte_length,payload.length);
    assert.equal(receipt.extensions.local_receiver.payload_custody.retained,true);
    assert.equal(receipt.extensions.local_receiver.payload_custody.disposition,'HOLD');
    assert.equal(receipt.signing.public_key.kty,'EC');
    assert.equal(receiver.journalLength(),length+1);
    const stored = await readFile(join(root,'payloads',crossing.crossing_id+'.bin'));
    assert.deepEqual(stored,payload);
    const reopened = await LocalReceiver.open(root);
    assert.equal(reopened.getPayloadCustodyReceipt(crossing.crossing_id)?.receipt_id,receipt.receipt_id);
    assert.equal(await verifyReceipt(reopened.getPayloadCustodyReceipt(crossing.crossing_id)),true);
    assert.deepEqual(reopened.snapshot().admitted,[]);
    assert.deepEqual(reopened.snapshot().held,[crossing.crossing_id]);
    const repeat = await reopened.verifyPayloadBytes(crossing.crossing_id,payload,'2026-10-07T04:31:03.000Z');
    assert.equal(repeat.receipt_id,receipt.receipt_id);
    assert.equal(reopened.journalLength(),length+1);
  } finally {await rm(base,{recursive:true,force:true});}
});

test('REFUSE verifies actual received bytes but does not retain an artifact', async () => {
  const {base, root, receiver} = await setup();
  try {
    const payload = Buffer.from('{"kind":"fictional-uninvited-spore"}\n');
    const crossing = await crossingFor(payload,'spore');
    await receiver.receive(crossing,'2026-10-07T04:30:01.000Z');
    await receiver.dispose(crossing.crossing_id,'REFUSE','2026-10-07T04:30:02.000Z');
    const receipt=await receiver.verifyPayloadBytes(crossing.crossing_id,payload,'2026-10-07T04:30:03.000Z');
    assert.equal(await verifyReceipt(receipt),true);
    assert.equal(receipt.extensions.local_receiver.payload_custody.disposition,'REFUSE');
    assert.equal(receipt.extensions.local_receiver.payload_custody.retained,false);
    await assert.rejects(()=>stat(join(root,'payloads',crossing.crossing_id+'.bin')),{code:'ENOENT'});
    const reopened=await LocalReceiver.open(root);
    assert.equal(reopened.getPayloadCustodyReceipt(crossing.crossing_id)?.receipt_id,receipt.receipt_id);
    assert.deepEqual(reopened.snapshot().refused,[crossing.crossing_id]);
    assert.deepEqual(reopened.snapshot().admitted,[]);
  } finally {await rm(base,{recursive:true,force:true});}
});

test('forged bytes, wrong ordering, and unexpected receiver disposition refuse before custody',async()=>{
  const {base,receiver}=await setup();
  try {
    const bytes=Buffer.from('{"safe":true}\n');
    const crossing=await crossingFor(bytes,'negative');
    await assert.rejects(
      ()=>receiver.verifyPayloadBytes(crossing.crossing_id,bytes,'2026-10-07T04:30:01.000Z'),
      /CROSSING_NOT_RECEIVED|DISPOSITION_REQUIRED/,
    );
    await receiver.receive(crossing,'2026-10-07T04:30:01.000Z');
    await assert.rejects(
      ()=>receiver.verifyPayloadBytes(crossing.crossing_id,bytes,'2026-10-07T04:30:02.000Z'),
      /DISPOSITION_REQUIRED/,
    );
    await receiver.dispose(crossing.crossing_id,'HOLD','2026-10-07T04:30:02.000Z');
    const before=receiver.journalLength();
    await assert.rejects(
      ()=>receiver.verifyPayloadBytes(crossing.crossing_id,Buffer.from('{"safe":false}\n'),'2026-10-07T04:30:03.000Z'),
      /PAYLOAD_SHA_MISMATCH/,
    );
    await assert.rejects(
      ()=>receiver.verifyPayloadBytes(crossing.crossing_id,Buffer.alloc(65537), '2026-10-07T04:30:03.000Z'),
      /PAYLOAD_TOO_LARGE/,
    );
    assert.equal(receiver.journalLength(),before);
    assert.equal(receiver.getPayloadCustodyReceipt(crossing.crossing_id),null);
  } finally {await rm(base,{recursive:true,force:true});}
});

test('cold receiver replay rejects tampered retained bytes, custody receipt and journal',async()=>{
  const {base,root,receiver}=await setup();
  try {
    const bytes=Buffer.from('{"verified":true}\n');
    const crossing=await crossingFor(bytes,'tamper');
    await receiver.receive(crossing,'2026-10-07T04:30:01.000Z');
    await receiver.dispose(crossing.crossing_id,'HOLD','2026-10-07T04:30:02.000Z');
    await receiver.verifyPayloadBytes(crossing.crossing_id,bytes,'2026-10-07T04:30:03.000Z');
    const material=join(root,'payloads',crossing.crossing_id+'.bin');
    await writeFile(material,'tampered', 'utf8');
    await assert.rejects(()=>LocalReceiver.open(root),/INVALID_CUSTODY_BYTES|PAYLOAD_SHA_MISMATCH/);
    await writeFile(material,bytes);
    const journal=join(root,'journal.jsonl');
    const lines=(await readFile(journal,'utf8')).trim().split('\n');
    const event=JSON.parse(lines[2]);
    event.receipt.extensions.local_receiver.payload_custody.byte_length=123456;
    lines[2]=JSON.stringify(event);
    await writeFile(journal,lines.join('\n')+'\n','utf8');
    await assert.rejects(()=>LocalReceiver.open(root),/INVALID_RECEIVER_EVENT_HASH|INVALID_RECEIVER_RECEIPT/);
  } finally {await rm(base,{recursive:true,force:true});}
});
