import test from 'node:test';
import assert from 'node:assert/strict';
import {newMemory,choose,learn} from '../experiments/lantern-commons-009/commons-policy.mjs';
const obs=(memory,patch={})=>({
  inventory:4,protected_reserve:1,partner_deposit:0,
  episode:memory.episodes+1,garden_dry:true,...patch
});
const facts=(memory,patch={})=>({
  episode:memory.episodes+1,own_gift:false,partner_gift:false,
  garden_restored:false,protected_need:false,...patch
});
test('both roles begin from the same policy with role-specific separate memory',()=>{
  for(const role of ['grower','mason']){
    const m=newMemory(role);
    assert.equal(choose(m,obs(m)).act,'TRIAL_GIFT');
  }
});
test('protected personal need outranks a promise of public benefit',()=>{
  const m=newMemory('grower');
  assert.equal(choose(m,obs(m,{inventory:2,protected_reserve:1})).act,'PROTECT_OWN_NEED');
  assert.equal(choose(m,obs(m,{inventory:4,protected_reserve:3,partner_deposit:2})).act,'PROTECT_OWN_NEED');
});
test('actual other barrel material outranks earlier refusal even after bad history',()=>{
  let m=newMemory('mason');
  // Record a real previous reversible but unreciprocated first offer.
  // Without a prior offer, the game is free to initiate a fresh trial.
  m=learn(m,facts(m,{own_gift:true}));
  assert.equal(choose(m,obs(m,{partner_deposit:0})).act,'WAIT_FOR_EVIDENCE');
  assert.equal(choose(m,obs(m,{partner_deposit:2})).act,'RECIPROCATE_MATERIAL');
});
test('reversible invitation expires and is reoffered after two episodes without punishment',()=>{
  let m=newMemory('grower');
  m=learn(m,facts(m,{own_gift:true}));
  assert.equal(choose(m,obs(m)).act,'WAIT_FOR_EVIDENCE');
  m=learn(m,facts(m));
  assert.equal(choose(m,obs(m)).act,'REOPEN_REVERSIBLY');
});
test('actual last public good supports retrying a bounded offer',()=>{
  let m=newMemory('grower');
  m=learn(m,facts(m,{own_gift:true,partner_gift:true,garden_restored:true}));
  assert.equal(choose(m,obs(m)).act,'REPEAT_WITNESSED_GIFT');
});
test('scarcity is recorded separately from an unreciprocated attempt',()=>{
  let m=newMemory('mason');
  m=learn(m,facts(m,{protected_need:true}));
  assert.equal(m.protected_need_declines,1);
  assert.equal(m.unreciprocated_offers,0);
  assert.equal(m.last_result,'PROTECTED_NEED');
});
test('a claimed but absent gift cannot create a success receipt',()=>{
  const m=newMemory('grower');
  assert.throws(()=>learn(m,facts(m,{own_gift:true,garden_restored:true,partner_gift:false})),
    /RESTORED_WITHOUT_BOTH/);
});
test('memory episode order cannot be forged or skipped',()=>{
  const m=newMemory('grower');
  assert.throws(()=>choose(m,obs(m,{episode:3})),/EPISODE_ORDER/);
  assert.throws(()=>learn(m,facts(m,{episode:2})),/EPISODE_ORDER/);
});
test('negative inventory, negative reserves and mismatched schema are rejected',()=>{
  const m=newMemory('grower');
  assert.throws(()=>choose(m,obs(m,{inventory:-1})),/INVALID_INVENTORY/);
  assert.throws(()=>choose(m,obs(m,{protected_reserve:-2})),/INVALID_PROTECTED_RESERVE/);
  assert.throws(()=>choose({...m,schema:'fabricated'},obs(m)),/MEMORY/);
});
test('whispered rumor is not a policy input or donation credential',()=>{
  const m=newMemory('grower');
  m.episodes=1;
  assert.equal(choose(m,obs(m,{rumor_partner_has_gift:true})).act,'REOPEN_REVERSIBLY');
  // The policy does not have a field for rumor at all: a forged claim cannot
  // satisfy partner_deposit, the real Minecraft barrel observation.
});
test('no moral scoring or human-specific reputation appears in memory',()=>{
  const m=learn(newMemory('grower'),facts(newMemory('grower')));
  assert.ok(!('reputation' in m));
  assert.ok(!('human_id' in m));
  assert.ok(!('moral_score' in m));
});
test('maintains separate material histories through repeated independent rounds',()=>{
  let a=newMemory('grower'),b=newMemory('mason');
  a=learn(a,facts(a,{own_gift:true,partner_gift:true,garden_restored:true}));
  b=learn(b,facts(b,{protected_need:true}));
  assert.equal(a.successes,1);
  assert.equal(b.protected_need_declines,1);
  assert.equal(a.episodes,1);
  assert.equal(b.episodes,1);
  assert.notEqual(a.last_result,b.last_result);
});
