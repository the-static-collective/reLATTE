import test from 'node:test';
import assert from 'node:assert/strict';
import './engine.js';
const E=globalThis.Lantern013Engine;

test('standard SHA-256 vectors bind world bytes',()=>{
  assert.equal(E.sha256('abc'),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(E.sha256(''),'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});
test('foundation is sealed before any experiments',()=>{
  const shelf=E.family(),origin=shelf.cartridges[0];
  E.verifyCartridge(origin);
  E.disturb(shelf.working,'drought');E.advance(shelf.working,7);
  assert.equal(origin.world.day,1);
  assert.equal(origin.world.weather,'clear');
  assert.notDeepEqual(origin.world,shelf.working);
});
test('fork copies have distinct IDs and exact immutable parent ancestry',()=>{
  const shelf=E.family(),root=shelf.baseId;
  E.disturb(shelf.working,'frost');
  const a=E.snapshot(shelf,'frost');
  assert.equal(a.parentCartridgeId,root);
  E.advance(shelf.working,5);
  const grandchild=E.snapshot(shelf,'continuation');
  assert.equal(grandchild.parentCartridgeId,a.cartridgeId);
  assert.equal(shelf.cartridges[0].world.day,1);
  E.checkout(shelf,root);E.disturb(shelf.working,'rain');
  const sibling=E.snapshot(shelf,'rain');
  assert.equal(sibling.parentCartridgeId,root);
  assert.notEqual(sibling.cartridgeId,a.cartridgeId);
  E.checkShelf(shelf);
});
test('tampering with the saved world or its lineage fails verification',()=>{
  const shelf=E.family();
  const worldTamper=E.copy(shelf.cartridges[0]);worldTamper.world.stores.grain+=100;
  assert.throws(()=>E.verifyCartridge(worldTamper),/modified/);
  const lineageTamper=E.copy(shelf.cartridges[0]);lineageTamper.branch='forged';
  assert.throws(()=>E.verifyCartridge(lineageTamper),/identity/);
});
test('all five world events exercise bounded and internally valid state transitions',()=>{
  for(const event of ['drought','rain','frost','visitor','discovery']){
    const world=E.newWorld();E.disturb(world,event);E.advance(world,14);E.check(world);
    assert.ok(world.people.every(p=>p.grain>=0&&p.hunger>=0&&p.hunger<=10));
    assert.ok(world.field.every(f=>f.stage>=0&&f.stage<=3));
  }
});
test('two identical worlds subjected to the same shocks have identical histories',()=>{
  const a=E.newWorld(),b=E.newWorld();
  for(const world of [a,b]){E.disturb(world,'visitor');E.disturb(world,'drought');E.advance(world,14);}
  assert.deepEqual(a,b);
});
test('private reserves prevent automatic seizure of resource from hungry peers',()=>{
  const world=E.newWorld();world.stores.grain=0;
  for(const p of world.people)p.grain=p.reserve;
  E.disturb(world,'drought');E.advance(world,1);
  assert.equal(world.stats.shared,0);
  assert.ok(world.people.every(p=>p.grain>=0));
  assert.ok(!world.history.some(event=>event.type==='gift'));
});
test('new inhabitant arrives without magical wheat, wood or seeds',()=>{
  const world=E.newWorld(),before=world.stores.grain,forest=world.forest;
  const p=E.newLife(world);
  assert.equal(p.grain,0);assert.equal(p.wood,0);assert.equal(p.seed,0);
  assert.equal(world.stores.grain,before);assert.equal(world.forest,forest);
});
test('conversation is clearly scripted and grounded in observed state',()=>{
  const world=E.newWorld();
  assert.match(E.speak(world,'p1','why not share'),/protect/);
  assert.match(E.speak(world,'p1','tell me secrets'),/scripted/);
  assert.throws(()=>E.speak(world,'fake-id','water'),/Unknown/);
});
test('hostile shelf imports and unknown working-copy parents are rejected',()=>{
  const s=E.family(),missing=E.copy(s);
  missing.baseId='a'.repeat(64);
  assert.throws(()=>E.checkShelf(missing),/Unknown working/);
  const duplicate=E.copy(s);duplicate.cartridges.push(E.copy(duplicate.cartridges[0]));
  assert.throws(()=>E.checkShelf(duplicate),/Duplicated/);
});
test('seventeen immutable stress forks stay internally consistent and bounded',()=>{
  const shelf=E.family();
  for(let i=0;i<17;i++){
    E.disturb(shelf.working,i%2?'drought':'rain');
    E.advance(shelf.working,14);
    E.snapshot(shelf,'history-'+i);
  }
  E.checkShelf(shelf);
  assert.equal(shelf.cartridges.length,18);
  assert.ok(shelf.working.history.length<=180);
  assert.equal(new Set(shelf.cartridges.map(c=>c.cartridgeId)).size,18);
});
