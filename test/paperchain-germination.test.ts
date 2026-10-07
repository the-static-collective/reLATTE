import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { LocalReceiver, sha256Hex, verifyCrossingEnvelope, verifyReceipt } from '../src/index.ts';

const ONE_PIXEL_PNG=Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==','base64');

function run(script,args){
  return new Promise((ok,fail)=>{
    const child=spawn(process.execPath,['--experimental-strip-types',resolve(script),...args],{stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='';
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data',p=>stdout+=p); child.stderr.on('data',p=>stderr+=p);
    child.once('error',fail); child.once('close',code=>ok({code,stdout,stderr}));
  });
}
async function seedFixture(base){
  const image=join(base,'seed.png'),text=join(base,'seed.txt'),seedRoot=join(base,'seed-root');
  await writeFile(image,ONE_PIXEL_PNG);
  await writeFile(text,'The chest freezer does not hold meat. It holds syllables.\n');
  const seeded=await run('scripts/paperchain-seed-vault.mjs',[image,text,seedRoot]);
  assert.equal(seeded.code,0,seeded.stderr);
  return {seedRoot,seed:JSON.parse(seeded.stdout)};
}

test('literal PLANT produces admitted local uptake, fresh SVG child crossing and second-world exact child custody',async()=>{
  const base=await mkdtemp(join(tmpdir(),'paperchain-germination-'));
  try{
    const {seedRoot,seed}=await seedFixture(base);
    const out=join(base,'germinated');
    const planted=await run('scripts/paperchain-plant.mjs',[seedRoot,out,'PLANT']);
    assert.equal(planted.code,0,planted.stderr);
    const witness=JSON.parse(planted.stdout);
    assert.equal(witness.schema,'paperchain.germination-witness/v0');
    assert.equal(witness.consent,'PLANT');
    assert.equal(witness.held_seed_crossing,seed.crossing_id);
    assert.notEqual(witness.planting_crossing_id,seed.crossing_id);
    assert.notEqual(witness.descendant_crossing_id,witness.planting_crossing_id);
    assert.ok(witness.laws.includes('HOLD != PLANT'));

    const svg=await readFile(join(out,'seedling-001.svg'));
    assert.equal(sha256Hex(svg),witness.child.sha256);
    assert.equal(svg.length,witness.child.byte_length);
    assert.match(svg.toString('utf8'),/PAPERCHAIN \/ GERMINATION 002/);
    assert.match(svg.toString('utf8'),/PLANTED DESCENDANT/);

    const plant=JSON.parse(await readFile(join(out,'planting-crossing.json'),'utf8'));
    const admit=JSON.parse(await readFile(join(out,'plant-admit-receipt.json'),'utf8'));
    const descendant=JSON.parse(await readFile(join(out,'descendant-crossing.json'),'utf8'));
    assert.equal(await verifyCrossingEnvelope(plant),true);
    assert.equal(await verifyReceipt(admit),true);
    assert.equal(admit.kind,'R3_ADMIT');
    assert.deepEqual(plant.parents,[seed.crossing_id]);
    assert.equal(await verifyCrossingEnvelope(descendant),true);
    assert.deepEqual(descendant.parents,[plant.crossing_id]);
    assert.equal(descendant.declared_kind,'R10_CULTURAL_DESCENDANT');
    assert.equal(descendant.payload_refs[0].address,'sha256:'+witness.child.sha256);

    const garden=await LocalReceiver.open(join(out,'garden'));
    assert.deepEqual(garden.snapshot().admitted,[plant.crossing_id]);
    const nursery=await LocalReceiver.open(join(out,'nursery'));
    assert.deepEqual(nursery.snapshot().held,[descendant.crossing_id]);
    assert.deepEqual(nursery.snapshot().admitted,[]);
    const custody=nursery.getPayloadCustodyReceipt(descendant.crossing_id);
    assert.equal(custody?.receipt_id,witness.child_custody_receipt_id);
    assert.equal(await verifyReceipt(custody),true);
    const retained=await readFile(join(out,'nursery','payloads',descendant.crossing_id+'.bin'));
    assert.deepEqual(retained,svg);
  }finally{await rm(base,{recursive:true,force:true});}
});

test('HOLD cannot silently germinate: missing or altered PLANT token leaves no output',async()=>{
  const base=await mkdtemp(join(tmpdir(),'paperchain-no-plant-'));
  try{
    const {seedRoot}=await seedFixture(base);
    for(const token of ['','YES','plant','TRUE']){
      const out=join(base,'out-'+(token||'empty'));
      const attempt=await run('scripts/paperchain-plant.mjs',[seedRoot,out,token]);
      assert.notEqual(attempt.code,0);
      assert.match(attempt.stderr,/EXPLICIT_PLANT_REQUIRED/);
    }
  }finally{await rm(base,{recursive:true,force:true});}
});

test('tampered held manifest blocks PLANT before a garden is created',async()=>{
  const base=await mkdtemp(join(tmpdir(),'paperchain-tamper-plant-'));
  try{
    const {seedRoot}=await seedFixture(base);
    await writeFile(join(seedRoot,'seed-manifest.json'),'{"tampered":true}\n');
    const out=join(base,'out');
    const attempt=await run('scripts/paperchain-plant.mjs',[seedRoot,out,'PLANT']);
    assert.notEqual(attempt.code,0);
    assert.match(attempt.stderr,/SEED_WITNESS_MISMATCH|INVALID_SEED_MANIFEST/);
  }finally{await rm(base,{recursive:true,force:true});}
});
