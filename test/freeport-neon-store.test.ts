import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {LocalReceiver} from '../src/receiver.ts';
import {generateP256KeyPair} from '../src/protocol.ts';
import {sealProgramProposal,deliverProgramForLocalReview,
  verifyCompletedProgramReview,archiveCompletedProgramReview,projectSignedReviewToHumkinDraft} from '../src/freeport-008.ts';
import type {SourcePin,DestinationPin,ReviewRecord} from '../src/freeport-008.ts';
import {NeonFreeportReviewArchive} from '../src/freeport-neon-store.ts';

test('native reLATTE receipts survive independently pinned verification and mock Neon archival',async()=>{
  const root=await mkdtemp(join(tmpdir(),'freeport008-neon-'));
  try{
    const keys=await generateP256KeyPair();
    const source:SourcePin={world:'world:synthetic-motif',particular:'particular:synthetic-proposer',
      public_key:keys.publicKeyJwk as SourcePin['public_key']};
    const receiver=await LocalReceiver.create(join(root,'tower'),{
      world_id:'world:synthetic-tower',receiver_particular:'particular:synthetic-tower',
      contract_ref:'contract:synthetic-review-only',
    });
    const payload={schema:'freeport.program-proposal/v1',program_id:'test-008',
      station:'HUMKIN',origin:'MOTIF',
      tracks:[{ref:'catalog:test-a',transition:'fade',weight:70}],
      preview_only:true,schedule_effect:false};
    const timestamp='2026-11-21T23:00:00.000Z';
    const carrier=await sealProgramProposal(payload,{
      sourceKeys:keys,sourceWorld:source.world,sourceParticular:source.particular,
      towerWorld:receiver.config.world_id,createdAt:timestamp,ownerApprovedReview:true,
    });
    const local=await deliverProgramForLocalReview(carrier,{
      sourcePin:source,receiver,decision:'HOLD',reviewedAt:timestamp,
    });
    // Test-only pin: a real deployment requires independent owner approval of this public key.
    const destination:DestinationPin={
      world:receiver.config.world_id,particular:receiver.config.receiver_particular,
      public_key:local.record.response_bundle.receive_receipt.signing.public_key,
    };
    const valid=await verifyCompletedProgramReview(carrier,local.record.response_bundle,source,destination);
    assert.equal(valid.disposition,'HOLD');
    assert.equal(valid.crossing_id,carrier.crossing.crossing_id);
    const draft=await projectSignedReviewToHumkinDraft(
      carrier,local.record.response_bundle,source,destination,'long-wave',
    );
    assert.equal(draft.schema,'humkin.radiohouse.program/v1');
    assert.equal(draft.publication_state,'draft');
    assert.equal(draft.items.length,1);
    assert.equal(draft.items[0].recording_id,'test-a');
    assert.equal(draft.approval_ref,local.record.response_bundle.disposition_receipt.receipt_id);
    await assert.rejects(()=>projectSignedReviewToHumkinDraft(
      carrier,local.record.response_bundle,source,destination,'INVALID STATION',
    ),/INVALID_HUMKIN_STATION/);
    const stored=new Map<string,Record<string,unknown>>();
    const columns=['crossing_id','source_world','destination_world','source_key_fingerprint',
      'payload_sha256','payload_base64','crossing_envelope','response_bundle','disposition'];
    const db={
      async query(sql:string,params:unknown[]):Promise<{rows:Record<string,any>[]}>{
        if(sql.includes('INSERT INTO')){
          const key=String(params[0]);
          if(stored.has(key))return {rows:[]};
          stored.set(key,Object.fromEntries(columns.map((name,i)=>[name,params[i]])));
          return {rows:[{crossing_id:key}]};
        }
        const data=stored.get(String(params[0]));
        return {rows:data?[data]:[]};
      },
    };
    const archive=new NeonFreeportReviewArchive(db);
    await archiveCompletedProgramReview(carrier,local.record.response_bundle,source,destination,archive);
    await archiveCompletedProgramReview(carrier,local.record.response_bundle,source,destination,archive);
    assert.equal(stored.size,1);
    await assert.rejects(()=>archive.saveReview({...valid,payload_base64:'Yg=='}),/DIVERGENT/);
    const fake=structuredClone(local.record.response_bundle);
    fake.disposition_receipt.kind='R3_ADMIT';
    await assert.rejects(()=>verifyCompletedProgramReview(carrier,fake,source,destination));
    const wrong=await generateP256KeyPair();
    await assert.rejects(()=>verifyCompletedProgramReview(carrier,local.record.response_bundle,source,{
      ...destination,public_key:wrong.publicKeyJwk as SourcePin['public_key'],
    }),/UNTRUSTED_OR_CONSEQUENTIAL/);
  }finally{await rm(root,{recursive:true,force:true})}
});
