import test from 'node:test';
import assert from 'node:assert/strict';
import {freshMemory,decide,remember} from '../experiments/lantern-commons-008/discernment.mjs';
const observe=(partner=0,self=2)=>({self_items:self,partner_barrel_items:partner,garden_dry:true});
const outcome=(statement,partner=0,restored=false,moved=false)=>({
  partner_statement:statement,partner_barrel_items:partner,garden_restored:restored,grower_material_moved:moved});
test('new creature proposes a reversible first trial, not an obligation',()=>{
  assert.equal(decide(freshMemory(),observe()).action,'OFFER_REVERSIBLY');
});
test('material from partner is stronger than a previous refusal',()=>{
  const memory=remember(freshMemory(),outcome('DECLINE'));
  assert.equal(decide(memory,observe()).action,'WAIT_FOR_MATERIAL_PROOF');
  assert.equal(decide(memory,observe(2)).action,'RECIPROCATE_VERIFIED');
});
test('falsely claiming a gift does not authorize an automatic reciprocal gift',()=>{
  const memory=remember(freshMemory(),outcome('CLAIM_GIFT'));
  assert.equal(memory.unverified_claims,1);
  assert.equal(decide(memory,observe()).action,'WAIT_FOR_MATERIAL_PROOF');
});
test('honest scarcity is not classified as deception',()=>{
  const memory=remember(freshMemory(),outcome('UNABLE'));
  assert.equal(memory.resource_constraints,1);
  assert.equal(memory.unverified_claims,0);
  assert.equal(memory.explicit_refusals,0);
});
test('demonstrated reciprocity permits another reversible offer',()=>{
  const memory=remember(freshMemory(),outcome('GIFT',2,true,true));
  assert.equal(memory.material_reciprocations,1);
  assert.equal(decide(memory,observe()).action,'OFFER_REVERSIBLY');
});
test('even a previously successful partner cannot force transfer if our items absent',()=>{
  const memory=remember(freshMemory(),outcome('GIFT',2,true,true));
  assert.equal(decide(memory,observe(2,1)).action,'REQUEST_ASSISTANCE');
});
test('healthy garden requires no contribution',()=>{
  assert.equal(decide(freshMemory(),{...observe(),garden_dry:false}).action,'OBSERVE');
});
test('reject fake restored garden without verified complementary items',()=>{
  assert.throws(()=>remember(freshMemory(),outcome('GIFT',0,true,true)),/CONTRADICTORY/);
});
test('reject fake restored garden without own actual material act',()=>{
  assert.throws(()=>remember(freshMemory(),outcome('GIFT',2,true,false)),/CONTRADICTORY/);
});
test('one episode after refusal can recover through actual reciprocal act',()=>{
  let m=remember(freshMemory(),outcome('DECLINE'));
  assert.equal(decide(m,observe()).action,'WAIT_FOR_MATERIAL_PROOF');
  assert.equal(decide(m,observe(2)).action,'RECIPROCATE_VERIFIED');
  m=remember(m,outcome('GIFT',2,true,true));
  assert.equal(m.material_reciprocations,1);
  assert.equal(m.explicit_refusals,1);
  assert.equal(m.last_outcome,'SHARED_GARDEN_RESTORED');
});
test('no individual human identity or moral judgment fields appear in memory',()=>{
  const memory=remember(freshMemory(),outcome('CLAIM_GIFT'));
  assert.ok(!('reputation' in memory));
  assert.ok(!('person_id' in memory));
  assert.ok(!('moral_score' in memory));
});
