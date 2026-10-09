import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  LocalReceiver, CrossingFieldReceiver,
  createCrossingFieldManifest, verifyCrossingFieldManifest,
  makeCarrierFragment, verifyCarrierFragment, verifyCarrierObservation,
  generateP256KeyPair, sealCrossingEnvelope, sealReceipt,
  canonicalizeDomainValue, sha256Hex,
} from '../src/index.ts';
import type { CarrierKind, CrossingCarrierFragment } from '../src/index.ts';

const at=(seconds:number)=>new Date(Date.UTC(2026,9,9,19,0,seconds)).toISOString();
async function source() {
  const signer=await generateP256KeyPair();
  const crossing=await sealCrossingEnvelope({
    schema:'relatte.crossing-envelope/v0',
    protocol_version:'0',
    source_particular:'particular:field-source',
    source_world:'world:field-source',
    source_history_head:null,parents:[],
    declared_kind:'TRANSPORT_COMPOSITION_DEMO',
    payload_refs:[],
    requested_effect:{kind:'inspect-only',authority:'receiver-local'},
    capability_ref:null,
    privacy_policy:null,audience_policy:null,return_address:null,
    created_at:at(0),
    extensions:{message:'The house takes attendance, across roads and interruptions.',
      note:'One signed crossing, different journey evidence'},
  },signer);
  return {crossing,manifest:await createCrossingFieldManifest(crossing,64)};
}
const observer=async () => ({
  world_id:'world:field-receiver',
  particular:'particular:field-receiver',
  signing_keys:await generateP256KeyPair(),
  allowed_carriers:[
    'bluetooth','wifi-direct','wifi-mesh','telephone-audio',
    'cellular-sms','lora-unlicensed','internet','file-courier',
  ] as CarrierKind[],
});
async function frame(f:Awaited<ReturnType<typeof source>>,
  index:number,carrier:CarrierKind,route_id:string) {
  return makeCarrierFragment({...f,index,carrier,route_id,sent_at:at(1)});
}
function changedPacket(packet:CrossingCarrierFragment,bytes:Buffer):CrossingCarrierFragment {
  const {packet_id,...old}=packet;
  const body={
    ...old,
    data_base64url:bytes.toString('base64url'),
    fragment_sha256:sha256Hex(bytes),
  };
  return {...body,packet_id:'relatte-carrier-packet-v0:'+
    sha256Hex(canonicalizeDomainValue('reLATTE-CarrierPacket-v0|',body))};
}

test('001 signed crossing changes roads and resumes after omission; no new crossing identity',async()=>{
  const f=await source();
  assert.equal(verifyCrossingFieldManifest(f.manifest),true);
  const receiver=new CrossingFieldReceiver(f.manifest,await observer());
  const carriers:CarrierKind[]=['bluetooth','telephone-audio','wifi-mesh','wifi-direct',
    'cellular-sms','lora-unlicensed','internet','file-courier'];
  let duplicatePacket:CrossingCarrierFragment | undefined;
  const packets:CrossingCarrierFragment[]=[];
  for(let i=0;i<f.manifest.fragment_count;i++){
    const p=await frame(f,i,carriers[i%carriers.length], 'road-'+i);
    assert.equal(verifyCarrierFragment(p,f.manifest).packet.packet_id,p.packet_id);
    packets.push(p);
    if(i===1){duplicatePacket=p;continue;} // interrupted route
    const observation=await receiver.ingest(p,at(2));
    assert.equal(observation.status,'STORED');
    assert.equal(await verifyCarrierObservation(observation,p,f.manifest,
      receiver.observer.signing_keys.publicKeyJwk),true);
  }
  const incomplete=await receiver.reconstruct();
  assert.equal(incomplete.state,'INCOMPLETE');
  if(incomplete.state==='INCOMPLETE') assert.deepEqual(incomplete.missing,[1]);
  assert.ok(duplicatePacket);
  const secondRoad=await frame(f,1,'wifi-direct','recovery-over-new-road');
  const retried=await receiver.ingest(secondRoad,at(3));
  assert.equal(retried.status,'STORED');
  const duplicate=await receiver.ingest(duplicatePacket!,at(4));
  assert.equal(duplicate.status,'DUPLICATE');
  assert.notEqual(secondRoad.packet_id,duplicatePacket!.packet_id);
  const complete=await receiver.reconstruct();
  assert.equal(complete.state,'RECONSTRUCTED');
  if(complete.state==='RECONSTRUCTED'){
    assert.equal(complete.crossing.crossing_id,f.crossing.crossing_id);
    assert.deepEqual(complete.crossing,f.crossing);
    assert.equal(complete.route_history.length,packets.length+1);
    assert.equal(new Set(complete.route_history.map(x=>x.carrier)).size,carriers.length);
    assert.equal(complete.route_history.filter(x=>x.index===1).length,2);
    assert.equal(complete.route_history.every(x=>x.receipt.semantic_effect==='none'),true);
  }
});

test('delivery is not RECEIVE; RECEIVE is not ADMIT; owner independently HOLDS',async()=>{
  const f=await source();
  const observerNode=new CrossingFieldReceiver(f.manifest,await observer());
  for(let i=0;i<f.manifest.fragment_count;i++){
    await observerNode.ingest(await frame(f,i,'wifi-mesh','mesh-hop-'+i),at(2));
  }
  const root=await mkdtemp(join(tmpdir(),'transport-field-'));
  try{
    const owner=await LocalReceiver.create(join(root,'owner'),{
      world_id:'world:owner-route',receiver_particular:'particular:owner-route',
      contract_ref:'contract:field-001/v0',
    });
    assert.equal(owner.snapshot().received.length,0);
    assert.equal(owner.snapshot().admitted.length,0);
    const rx=await observerNode.receiveLocally(owner,at(3));
    assert.equal(rx.kind,'RECEIVED');
    assert.equal(owner.snapshot().received.includes(f.crossing.crossing_id),true);
    assert.equal(owner.snapshot().admitted.length,0);
    const hold=await owner.dispose(f.crossing.crossing_id,'HOLD',at(4));
    assert.equal(hold.semantic_effect,'none');
    assert.equal(owner.snapshot().held.includes(f.crossing.crossing_id),true);
    assert.equal(owner.snapshot().admitted.length,0);
  }finally{await rm(root,{force:true,recursive:true});}
});

test('001 false and damaged fragments permanently HOLD despite valid later paths',async()=>{
  const f=await source();
  const receiver=new CrossingFieldReceiver(f.manifest,await observer());
  const p=await frame(f,0,'bluetooth','bt-original');
  assert.equal((await receiver.ingest(p,at(2))).status,'STORED');
  const bytes=Buffer.from(p.data_base64url,'base64url');
  bytes[0]^=1;
  const broken={...p,data_base64url:bytes.toString('base64url')}; // packet signature/id and part digest fail
  assert.equal((await receiver.ingest(broken,at(3))).status,'HOLD');
  for(let i=1;i<f.manifest.fragment_count;i++){
    assert.equal((await receiver.ingest(await frame(f,i,'wifi-direct','retry-'+i),at(4))).status,'HOLD');
  }
  assert.equal((await receiver.reconstruct()).state,'HOLD');
  await assert.rejects(receiver.receiveLocally({} as LocalReceiver,at(5)),/FIELD_NOT_RECONSTRUCTED/);
});

test('001 a self-consistent conflicting part cannot silently win by alternate route',async()=>{
  const f=await source();
  const receiver=new CrossingFieldReceiver(f.manifest,await observer());
  const good=await frame(f,0,'wifi-direct','way-a');
  assert.equal((await receiver.ingest(good,at(2))).status,'STORED');
  const bytes=Buffer.from(good.data_base64url,'base64url');
  bytes[0]^=1;
  const bad=changedPacket({...good,route_id:'way-b'},bytes);
  assert.doesNotThrow(()=>verifyCarrierFragment(bad,f.manifest));
  const observed=await receiver.ingest(bad,at(3));
  assert.equal(observed.status,'HOLD');
  assert.equal(observed.reason,'FIELD_CONFLICTING_FRAGMENT');
  assert.equal((await receiver.reconstruct()).state,'HOLD');
});

test('001 invalid manifest, foreign crossing and sender claims cannot cross authority boundaries',async()=>{
  const f=await source();
  assert.equal(verifyCrossingFieldManifest({...f.manifest,chunk_size:88}),false);
  assert.equal(verifyCrossingFieldManifest({...f.manifest,fragment_count:1}),false);
  await assert.rejects(createCrossingFieldManifest(f.crossing,1),/FIELD_INVALID_CHUNK_SIZE/);
  await assert.rejects(makeCarrierFragment({
    ...f,index:0,carrier:'amateur-radio',route_id:'ham',sent_at:at(1),
  }),/FIELD_HAM_CROSSING_BYTES_DENIED/);
  const large=await createCrossingFieldManifest(f.crossing,256);
  await assert.rejects(makeCarrierFragment({
    manifest:large,crossing:f.crossing,index:0,
    carrier:'lora-unlicensed',route_id:'lora',sent_at:at(1),
  }),/FIELD_CARRIER_CAPACITY_EXCEEDED/);
  const receiver=new CrossingFieldReceiver(f.manifest,await observer());
  const sample=await frame(f,0,'bluetooth','known');
  const foreign={...sample,transfer_id:'relatte-crossing-field-v0:'+'0'.repeat(64)};
  assert.equal((await receiver.ingest(foreign,at(2))).status,'HOLD');
  assert.equal((await receiver.reconstruct()).state,'HOLD');
});

test('001 local signed route observations remain independently attributable but grant nothing',async()=>{
  const f=await source();
  const obs=await observer();
  const rx=new CrossingFieldReceiver(f.manifest,obs);
  const p=await frame(f,0,'telephone-audio','analog-link');
  const received=await rx.ingest(p,at(2));
  assert.equal(received.receipt.kind,'TRANSPORT_FRAGMENT_OBSERVED');
  assert.equal(received.receipt.semantic_effect,'none');
  assert.equal(received.receipt.extensions.crossing_field.receive_authority,false);
  assert.equal(received.receipt.extensions.crossing_field.admission_authority,false);
  assert.equal(await verifyCarrierObservation(received,p,f.manifest,obs.signing_keys.publicKeyJwk),true);
  const another=await generateP256KeyPair();
  assert.equal(await verifyCarrierObservation(received,p,f.manifest,another.publicKeyJwk),false);
  const spoof=await sealReceipt({
    ...received.receipt,
    extensions:{crossing_field:{...received.receipt.extensions.crossing_field,admission_authority:true}},
  },obs.signing_keys);
  assert.equal(await verifyCarrierObservation({...received,receipt:spoof},p,f.manifest,obs.signing_keys.publicKeyJwk),false);
});
