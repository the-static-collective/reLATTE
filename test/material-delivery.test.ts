import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile,mkdir,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {
  LocalReceiver,generateP256KeyPair,sealCrossingEnvelope,
  sha256Hex,verifyReceipt,receiveMaterialDelivery,
} from '../src/index.ts';

const WHEN='2026-10-07T04:48:10.000Z';
async function harness(disposition: 'HOLD'|'REFUSE') {
  const base=await mkdtemp(join(tmpdir(),'relatte-material-route-'));
  const receiverRoot=join(base,'receiver');
  const receiver=await LocalReceiver.create(receiverRoot,{
    world_id:'webz:the-static-collective/orchard-022100',
    receiver_particular:'particular:webz:orchard-local-inbox',
    contract_ref:'contract:webz:orchard-fixture-inbox/v0',
  });
  const payload=Buffer.from(disposition==='HOLD'?'{"fruit":"orange"}\n':'{"spore":"refused"}\n');
  const crossing=await sealCrossingEnvelope({
    schema:'relatte.crossing-envelope/v0',
    protocol_version:'0',
    source_particular:'particular:webz:test',
    source_world:'webz:the-static-collective/sanctuary',
    source_history_head:null,
    parents:[],
    declared_kind:'OPAQUE_ORGAN_ARTIFACT',
    payload_refs:[{address:'sha256:'+sha256Hex(payload),role:'fictional-first-party-artifact',media_type:'application/json'}],
    requested_effect:null,capability_ref:null,privacy_policy:null,audience_policy:null,return_address:null,
    created_at:'2026-10-07T04:48:00.000Z',extensions:{},
  },await generateP256KeyPair());
  await receiver.receive(crossing,'2026-10-07T04:48:01.000Z');
  await receiver.dispose(crossing.crossing_id,disposition,'2026-10-07T04:48:02.000Z');
  const carrier=join(base,'material.carrier.json');
  await writeFile(carrier,JSON.stringify({schema:'webz.material-carrier/v0',crossing,payload_base64:payload.toString('base64')})+'\n');
  const request={
    schema:'relatte.material-delivery/v0',
    carrier_path:carrier,receiver_root:receiverRoot,
    expected_crossing_id:crossing.crossing_id,created_at:WHEN,
  };
  return {base,receiverRoot,payload,crossing,carrier,request};
}

test('independent destination process receives and signs actual bytes held under receiver custody',async()=>{
  const h=await harness('HOLD');
  try {
    const result=await receiveMaterialDelivery(h.request);
    assert.equal(result.schema,'relatte.material-delivery-result/v0');
    assert.equal(result.payload_sha256,sha256Hex(h.payload));
    assert.equal(result.received_byte_length,h.payload.length);
    assert.equal(result.retained,true);
    assert.equal(result.receiver_disposition,'R3_HOLD');
    assert.equal(await verifyReceipt(result.custody_receipt),true);
    assert.equal(result.custody_receipt.signing.public_key.x,result.receive_receipt.signing.public_key.x);
    const retained=await readFile(join(h.receiverRoot,'payloads',h.crossing.crossing_id+'.bin'));
    assert.deepEqual(retained,h.payload);
    assert.deepEqual(result.receiver_snapshot.admitted,[]);
    assert.equal((await receiveMaterialDelivery(h.request)).custody_receipt.receipt_id,result.custody_receipt.receipt_id);
  }finally {await rm(h.base,{recursive:true,force:true});}
});

test('destination verifies refused bytes without keeping material',async()=>{
  const h=await harness('REFUSE');
  try {
    const result=await receiveMaterialDelivery(h.request);
    assert.equal(result.receiver_disposition,'R3_REFUSE');
    assert.equal(result.retained,false);
    assert.equal(await verifyReceipt(result.custody_receipt),true);
    await assert.rejects(
      ()=>stat(join(h.receiverRoot,'payloads',h.crossing.crossing_id+'.bin')),{code:'ENOENT'},
    );
    assert.deepEqual(result.receiver_snapshot.admitted,[]);
  }finally {await rm(h.base,{recursive:true,force:true});}
});

test('destination refuses tampered carrier bytes even though crossing envelope remains signed',async()=>{
  const h=await harness('HOLD');
  try{
    const data=JSON.parse(await readFile(h.carrier,'utf8'));
    data.payload_base64=Buffer.from('{"fruit":"forgery"}\n').toString('base64');
    await writeFile(h.carrier,JSON.stringify(data));
    await assert.rejects(()=>receiveMaterialDelivery(h.request),/MATERIAL_BYTES_NOT_BOUND_TO_SIGNED_CROSSING/);
    const receiver=await LocalReceiver.open(h.receiverRoot);
    assert.equal(receiver.getPayloadCustodyReceipt(h.crossing.crossing_id),null);
  }finally{await rm(h.base,{recursive:true,force:true});}
});

test('destination refuses forged crossing, foreign receiver and unsafe carrier form',async()=>{
  const h=await harness('HOLD');
  try{
    await assert.rejects(()=>receiveMaterialDelivery({...h.request, invented_authority:'yes'}),/UNEXPECTED_DELIVERY_REQUEST_FIELD/);
    await assert.rejects(()=>receiveMaterialDelivery({...h.request, carrier_path:'../relative'}),/CARRIER_PATH_NOT_ABSOLUTE/);
    let carrier=JSON.parse(await readFile(h.carrier,'utf8'));
    carrier.crossing.source_world='world:imposter';
    await writeFile(h.carrier,JSON.stringify(carrier));
    await assert.rejects(()=>receiveMaterialDelivery(h.request),/UNVERIFIED_CARRIER_CROSSING/);
  }finally{await rm(h.base,{recursive:true,force:true});}
});
