#!/usr/bin/env node
// TRANSPORT-COMPOSITION-001: deterministic multi-road simulation; NO radios,
 // telephone lines, Bluetooth adapters or Wi-Fi interfaces are opened.
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  LocalReceiver, CrossingFieldReceiver,
  generateP256KeyPair, sealCrossingEnvelope,
  createCrossingFieldManifest, makeCarrierFragment,
  verifyCarrierObservation,
} from '../src/index.ts';

const at=(n)=>new Date(Date.UTC(2026,9,9,20,0,n)).toISOString();
const sender=await generateP256KeyPair();
const observerKey=await generateP256KeyPair();
const crossing=await sealCrossingEnvelope({
  schema:'relatte.crossing-envelope/v0', protocol_version:'0',
  source_particular:'particular:static-phone-demo',
  source_world:'world:static-phone-demo',
  source_history_head:null,parents:[],
  declared_kind:'TRANSPORT_COMPOSITION_001_DEMO',
  payload_refs:[],
  requested_effect:{kind:'receive-proposal',authority:'receiver-local'},
  capability_ref:null,privacy_policy:null,audience_policy:null,return_address:null,
  created_at:at(0),
  extensions:{demo:'same signed data crosses several disconnected simulated transport paths'},
},sender);
const manifest=await createCrossingFieldManifest(crossing,64);
const choices=['bluetooth','telephone-audio','wifi-mesh','wifi-direct',
  'cellular-sms','lora-unlicensed','internet','file-courier'];
const composer=new CrossingFieldReceiver(manifest,{
  world_id:'world:static-field-receiver',
  particular:'particular:static-field-receiver',
  signing_keys:observerKey,
  allowed_carriers:choices,
});
const fragments=[];
const observations=[];
for(let i=0;i<manifest.fragment_count;i++){
  if(i===1)continue; // simulate a broken telephone link; resume over Wi-Fi
  const carrier=choices[i%choices.length];
  const p=await makeCarrierFragment({
    manifest,crossing,index:i,carrier,route_id:'simulated-'+carrier+'-'+i,sent_at:at(1),
  });
  fragments.push(p);
  observations.push(await composer.ingest(p,at(2)));
}
const interrupted=await composer.reconstruct();
if(interrupted.state!=='INCOMPLETE')throw Error('EXPECTED_INTERRUPTION');
const recovery=await makeCarrierFragment({
  manifest,crossing,index:1,carrier:'wifi-direct',
  route_id:'simulated-wifi-recovery',sent_at:at(3),
});
fragments.push(recovery);
const arrival=await composer.ingest(recovery,at(4));
observations.push(arrival);
if(!(await verifyCarrierObservation(arrival,recovery,manifest,observerKey.publicKeyJwk))) {
  throw Error('MISSING_SIGNED_ROUTE_PROVENANCE');
}
const reconstructed=await composer.reconstruct();
if(reconstructed.state!=='RECONSTRUCTED') throw Error('CROSSING_NOT_RECONSTRUCTED');
const privateRoot=await mkdtemp(join(tmpdir(),'relatte-crossing-field-demo-'));
try {
  const receiver=await LocalReceiver.create(join(privateRoot,'receiver'),{
    world_id:'world:demo-owner',receiver_particular:'particular:demo-owner',
    contract_ref:'contract:transport-composition-001/v0',
  });
  const before=receiver.snapshot();
  const receipt=await composer.receiveLocally(receiver,at(5));
  const after=receiver.snapshot();
  if(before.received.length!==0||after.admitted.length!==0||receipt.kind!=='RECEIVED') {
    throw Error('AUTHORITY_BOUNDARY_BREACH');
  }
  const output=process.argv[2];
  const record={
    schema:'relatte.transport-composition-demo/v0',
    crossing_id:crossing.crossing_id,transfer_id:manifest.transfer_id,
    canonical_crossing_sha256:manifest.canonical_sha256,
    fragment_count:manifest.fragment_count,
    simulated_carriers:[...new Set(observations.map(o=>o.carrier))],
    interrupted_state:interrupted.state,
    reconstructed_state:reconstructed.state,
    observation_receipts:observations.map(o=>o.receipt),
    owner_receive_receipt:receipt,
    admitted:false,
    physical_link_used:false,
    canonical_identity_preserved:reconstructed.crossing.crossing_id===crossing.crossing_id,
  };
  if(output){await mkdir(join(output),{recursive:true});await writeFile(join(output,'witness.json'),JSON.stringify(record,null,2)+'\n');}
  console.log(JSON.stringify({
    verified:true,crossing_id:crossing.crossing_id,
    simulated_carriers:record.simulated_carriers,
    fragments:manifest.fragment_count,
    interruption:interrupted.state,
    final:reconstructed.state,received_kind:receipt.kind,admitted:false,
    actual_hardware_transmissions:0,
  }));
} finally {await rm(privateRoot,{recursive:true,force:true});}
