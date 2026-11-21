/**
 * Opt-in PUBLIC synthetic evidence printer for FREEPORT 008.
 * No real audio/catalog, credentials, or human identity. No private keys printed.
 * Output is an untrusted transport packet until the native signatures are verified.
 */
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LocalReceiver} from '../src/receiver.ts';
import {generateP256KeyPair} from '../src/protocol.ts';
import {sealProgramProposal,deliverProgramForLocalReview,verifyCompletedProgramReview} from '../src/freeport-008.ts';
import type {SourcePin,DestinationPin} from '../src/freeport-008.ts';

const root=await mkdtemp(join(tmpdir(),'freeport008-public-evidence-'));
try {
  const sourceKeys=await generateP256KeyPair();
  const sourcePin:SourcePin={
    world:'world:synthetic-motif-ci',particular:'particular:synthetic-motif-ci',
    public_key:sourceKeys.publicKeyJwk as SourcePin['public_key'],
  };
  const receiver=await LocalReceiver.create(join(root,'tower'),{
    world_id:'world:synthetic-humkin-tower-ci',
    receiver_particular:'particular:synthetic-humkin-tower-ci',
    contract_ref:'contract:freeport-review-only-fixture',
  });
  const time='2026-11-21T23:00:00.000Z';
  const carrier=await sealProgramProposal({
    schema:'freeport.program-proposal/v1',
    program_id:'freeport008-synthetic-evidence',
    station:'HUMKIN',origin:'MOTIF',
    tracks:[{ref:'catalog:synthetic-test-one',transition:'fade',weight:50},
      {ref:'catalog:synthetic-test-two',transition:'cut',weight:50}],
    preview_only:true,schedule_effect:false,
  },{
    sourceKeys,sourceWorld:sourcePin.world,sourceParticular:sourcePin.particular,
    towerWorld:receiver.config.world_id,createdAt:time,ownerApprovedReview:true,
  });
  const local=await deliverProgramForLocalReview(carrier,{
    sourcePin,receiver,decision:'HOLD',reviewedAt:time,
  });
  const destination:DestinationPin={
    world:receiver.config.world_id,particular:receiver.config.receiver_particular,
    public_key:local.record.response_bundle.receive_receipt.signing.public_key,
  };
  const record=await verifyCompletedProgramReview(carrier,local.record.response_bundle,sourcePin,destination);
  if (receiver.snapshot().admitted.length !== 0 || record.disposition !== 'HOLD') throw Error('UNSAFE_FIXTURE');
  console.log('FREEPORT008_SYNTHETIC_REVIEW='+JSON.stringify(record));
} finally {
  await rm(root,{recursive:true,force:true});
}
