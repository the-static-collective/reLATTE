import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { LocalReceiver, verifyCrossingEnvelope, verifyReceipt } from '../src/index.ts';
import { submitLanternHOLD, validateLanternEvidence } from '../scripts/lantern-commons-handoff-004.ts';

const sha='0fbce0b83dd510bdba7a8865406270a703fc376e5dc51ef9fb7d5fd31fd780cf';
function candidate(){
  const w=(label:string,seed:string,h:string)=>({label,world_seed:seed,
    world_level_dat_sha256:h,observed_built_kind:'kitchen',
    observation_source:'offline-local-save-NBT',game_client_session_proof:false,
    identity_claim:'none',checks:{kitchen:{build_shape_matches:true,
      touched_block_positions:466,total_mismatch_count:0,
      source_structure_checks:{kitchen:true}}}});
  return {schema:'relatte.skill-cartridge-candidate-004/v0',
    source_datapack_sha256:sha,source_function_sha256:{kitchen:'a'.repeat(64)},
    receiver_disposition:'HOLD',authority:'NONE',source_derived_same_shape_observed:true,
    eligibility_for_later_native_relatte_review:'CANDIDATE_ONLY',
    actual_operator_command_history:null,independent_live_client_observer:null,
    cryptographic_source_signatures:null,worlds_have_different_seeds:true,
    worlds:[w('A','123','b'.repeat(64)),w('B','456','c'.repeat(64))]};
}
test('source-native P-256 crossing + signed local HOLD + payload custody + restart',async()=>{
  const root=await mkdtemp(join(tmpdir(),'lantern-004-'));
  try{
    const p=await submitLanternHOLD(Buffer.from(JSON.stringify(candidate())),
      join(root,'receiver'),'2026-11-03T17:00:00.000Z');
    assert.equal(await verifyCrossingEnvelope(p.crossing),true);
    for(const r of [p.received_receipt,p.held_receipt,p.custody_receipt])
      assert.equal(await verifyReceipt(r),true);
    assert.equal(p.held_receipt.kind,'R3_HOLD');
    assert.equal(p.held_receipt.semantic_effect,'none');
    assert.ok((await LocalReceiver.open(join(root,'receiver'))).snapshot().held.includes(p.crossing.crossing_id));
    assert.equal(p.minecraft_execution_verified,false);
  }finally{await rm(root,{force:true,recursive:true});}
});
test('no shape match cannot enter the signed crossing',()=>{
  const p=candidate();p.source_derived_same_shape_observed=false;
  assert.throws(()=>validateLanternEvidence(p),/BLOCK_MATCH_NOT_PROVEN/);
});
test('claims of independent live witness rejected',()=>{
  const p=candidate();(p as any).independent_live_client_observer={verified:true};
  assert.throws(()=>validateLanternEvidence(p),/FALSE_WITNESS_CLAIM/);
});
test('same-seed world clone rejected',()=>{
  const p=candidate();p.worlds[1].world_seed='123';
  assert.throws(()=>validateLanternEvidence(p),/SAME_SEED/);
});
test('automatic ADMIT explicitly prohibited',()=>{
  const p=candidate();p.receiver_disposition='ADMIT';
  assert.throws(()=>validateLanternEvidence(p),/AUTHORITY/);
});
