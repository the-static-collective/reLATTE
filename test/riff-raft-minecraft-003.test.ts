import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {verifyCrossingEnvelope,verifyReceipt} from '../src/protocol.ts';
import {
  SCHEMA,BUNDLE_SCHEMA,assemblePair,emitSignedReturn,
} from '../experiments/riff-raft-minecraft-003/two-world-replay.mjs';

const sha=(x:Buffer|string)=>createHash('sha256').update(x).digest('hex');

test('RIFF-RAFT-003: one or zero worlds never becomes two',async()=>{
  await assert.rejects(()=>assemblePair([]),/EXPECTED_TWO_WORLDS/);
  await assert.rejects(()=>assemblePair([{world_id:'A'}]),/EXPECTED_TWO_WORLDS/);
});
test('RIFF-RAFT-003: duplicate labels refuse before parsing false evidence',async()=>{
  const invalid={world_id:'A',composition_bytes:Buffer.from('{}'),runtime_bytes:Buffer.from('{}')};
  await assert.rejects(()=>assemblePair([invalid,invalid]),/BAD_INSTANCE_EVIDENCE/);
});
test('RIFF-RAFT-003: malformed signed story cannot impersonate Minecraft',async()=>{
  await assert.rejects(()=>assemblePair([
    {world_id:'A',composition_bytes:Buffer.from('{}'),runtime_bytes:Buffer.from('{}')},
    {world_id:'B',composition_bytes:Buffer.from('{}'),runtime_bytes:Buffer.from('{}')},
  ]),/BAD_INSTANCE_EVIDENCE/);
});
test('RIFF-RAFT-003: portable P256 crossing and receipt bind exact bytes and stay HOLD',async()=>{
  // This unit-test specimen is deliberately NOT valid game evidence;
  // it tests only the cryptographic transport primitive.
  const fake={
    schema:SCHEMA,
    worlds:[{instance_id:'test:a'},{instance_id:'test:b'}],
    biological_restoration_verified:false,
    owner_admission:false,
  };
  const packet=await emitSignedReturn(fake,{});
  assert.equal(packet.schema,BUNDLE_SCHEMA);
  assert.equal(packet.receipt.kind,'R3_HOLD');
  assert.equal(await verifyCrossingEnvelope(packet.crossing),true);
  assert.equal(await verifyReceipt(packet.receipt),true);
  assert.equal(packet.receipt.crossing_id,packet.crossing.crossing_id);
  assert.equal(packet.crossing.payload_refs[0].address,
    'sha256:'+sha(Buffer.from(packet.packet_json,'utf8')));
  const changed=structuredClone(packet.crossing);
  changed.payload_refs[0].address='sha256:'+'a'.repeat(64);
  assert.equal(await verifyCrossingEnvelope(changed),false);
  assert.equal(packet.packet_json,JSON.stringify(fake));
});
test('RIFF-RAFT-003: signing ephemeral game return does not admit remote work',async()=>{
  const item=await emitSignedReturn({schema:SCHEMA,worlds:[]},{});
  assert.equal(item.receipt.kind,'R3_HOLD');
  assert.equal(item.crossing.requested_effect.kind,'candidate-ingress');
  assert.equal(item.crossing.requested_effect.authority,'receiver-local');
  assert.equal(item.receipt.semantic_effect,'local-only');
});
