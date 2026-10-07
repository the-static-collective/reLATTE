import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { LocalReceiver, sha256Hex, verifyCrossingEnvelope, verifyReceipt } from '../src/index.ts';

const ONE_PIXEL_PNG=Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==','base64');

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function run(script:string,args:string[]):Promise<RunResult>{
  return new Promise<RunResult>((ok,fail)=>{
    const child=spawn(process.execPath,['--experimental-strip-types',resolve(script),...args],{stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='';
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data',p=>stdout+=p); child.stderr.on('data',p=>stderr+=p);
    child.once('error',fail); child.once('close',code=>ok({code,stdout,stderr}));
  });
}
async function seedFixture(base:string):Promise<{seedRoot:string;seed:any}>{
  const image=join(base,'seed.png'),text=join(base,'seed.txt'),seedRoot=join(base,'seed-root');
  await writeFile(image,ONE_PIXEL_PNG);
  await writeFile(text,'The chest freezer does not hold meat. It holds syllables.\n');
  const seeded=await run('scripts/paperchain-seed-vault.mjs',[image,text,seedRoot]);
  assert.equal(seeded.code,0,seeded.stderr);
  return {seedRoot,seed:JSON.parse(seeded.stdout)};
}
async function fatherhandFixture(
  base:string,
  seedRoot:string,
  mutate?:(value:any)=>void,
  name='fatherhand.json',
):Promise<{path:string;bytes:Buffer;value:any}>{
  const manifest=JSON.parse(await readFile(join(seedRoot,'seed-manifest.json'),'utf8'));
  const seedWitness=JSON.parse(await readFile(join(seedRoot,'witness.json'),'utf8'));
  const scope=[manifest.seed_id,seedWitness.crossing_id].sort();
  const value:any={
    schema:'tranchnode/fatherhand-paperchain-plant-witness/v0.1',
    seedId:manifest.seed_id,
    heldCrossingId:seedWitness.crossing_id,
    requiredAct:{
      capability:'paperchain.plant',
      scopeRefs:scope,
      purposeId:'purpose:paperchain:germination',
    },
    validation:{
      schema:'tranchnode/fatherhand-authority-validation-receipt/v0.1',
      terminalGrantId:'grant:paperchain:C',
      fatherhandId:'fatherhand:paperchain:test',
      chain:['grant:paperchain:A','grant:paperchain:B','grant:paperchain:C'],
      required:{
        capability:'paperchain.plant',
        scopeRefs:scope,
        purposeId:'purpose:paperchain:germination',
      },
      result:'valid',
      failures:[],
      uncertainties:[],
      evaluatedAt:'2026-10-07T07:00:00Z',
      evaluatorVersion:'fatherhand-grant-validator/v0.1',
      nonClaims:['fixture mirrors TranchNode witness contract; reLATTE does not recompute grant-chain semantics'],
    },
    capacityState:'valid',
    nonClaims:['CAPACITY != CONSENT','VALIDATION != ACTIVATION'],
  };
  mutate?.(value);
  const bytes=Buffer.from(JSON.stringify(value,null,2)+'\n','utf8');
  const path=join(base,name);
  await writeFile(path,bytes);
  return {path,bytes,value};
}

test('Fatherhand capacity + literal PLANT produces admitted local uptake, fresh child crossing and exact child custody',async()=>{
  const base=await mkdtemp(join(tmpdir(),'paperchain-germination-'));
  try{
    const {seedRoot,seed}=await seedFixture(base);
    const authority=await fatherhandFixture(base,seedRoot);
    const out=join(base,'germinated');
    const planted=await run('scripts/paperchain-plant.mjs',[seedRoot,out,'PLANT',authority.path]);
    assert.equal(planted.code,0,planted.stderr);
    const witness:any=JSON.parse(planted.stdout);
    assert.equal(witness.schema,'paperchain.germination-witness/v0');
    assert.equal(witness.consent,'PLANT');
    assert.equal(witness.held_seed_crossing,seed.crossing_id);
    assert.equal(witness.fatherhand.capacity_state,'valid');
    assert.equal(witness.fatherhand.witness_sha256,sha256Hex(authority.bytes));
    assert.notEqual(witness.planting_crossing_id,seed.crossing_id);
    assert.notEqual(witness.descendant_crossing_id,witness.planting_crossing_id);
    assert.ok(witness.laws.includes('HOLD != PLANT'));
    assert.ok(witness.laws.includes('CAPACITY != CONSENT'));
    assert.ok(witness.laws.includes('CONSENT != CAPACITY'));

    const copiedAuthority=await readFile(join(out,'fatherhand-plant-witness.json'));
    assert.deepEqual(copiedAuthority,authority.bytes);

    const svg=await readFile(join(out,'seedling-001.svg'));
    assert.equal(sha256Hex(svg),witness.child.sha256);
    assert.equal(svg.length,witness.child.byte_length);
    assert.match(svg.toString('utf8'),/PAPERCHAIN \/ GERMINATION 002/);
    assert.match(svg.toString('utf8'),/PLANTED DESCENDANT/);

    const plant:any=JSON.parse(await readFile(join(out,'planting-crossing.json'),'utf8'));
    const admit:any=JSON.parse(await readFile(join(out,'plant-admit-receipt.json'),'utf8'));
    const descendant:any=JSON.parse(await readFile(join(out,'descendant-crossing.json'),'utf8'));
    assert.equal(await verifyCrossingEnvelope(plant),true);
    assert.equal(plant.capability_ref,'sha256:'+sha256Hex(authority.bytes));
    assert.equal(plant.extensions.fatherhand_capacity.witness_sha256,sha256Hex(authority.bytes));
    assert.equal(plant.extensions.fatherhand_capacity.fatherhand_id,'fatherhand:paperchain:test');
    assert.equal(plant.extensions.fatherhand_capacity.inherited_authority,false);
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
    const authority=await fatherhandFixture(base,seedRoot);
    for(const token of ['','YES','plant','TRUE']){
      const out=join(base,'out-'+(token||'empty'));
      const attempt=await run('scripts/paperchain-plant.mjs',[seedRoot,out,token,authority.path]);
      assert.notEqual(attempt.code,0);
      assert.match(attempt.stderr,/EXPLICIT_PLANT_REQUIRED/);
      await assert.rejects(()=>stat(out),{code:'ENOENT'});
    }
  }finally{await rm(base,{recursive:true,force:true});}
});

test('Fatherhand capacity cannot be omitted, invalid, rebound, or purpose-laundered into PLANT',async()=>{
  const base=await mkdtemp(join(tmpdir(),'paperchain-fatherhand-gates-'));
  try{
    const {seedRoot}=await seedFixture(base);
    const cases:Array<{name:string;mutate:(value:any)=>void;pattern:RegExp}>=[
      {name:'invalid',mutate:value=>{value.capacityState='invalid';value.validation.result='invalid';value.validation.failures=[{code:'required_capability_missing'}];},pattern:/FATHERHAND_WITNESS_BINDING_INVALID|FATHERHAND_CAPACITY_NOT_VALID/},
      {name:'wrong-seed',mutate:value=>{value.seedId='paperchain-seed:'+'9'.repeat(64);},pattern:/FATHERHAND_WITNESS_BINDING_INVALID/},
      {name:'wrong-capability',mutate:value=>{value.requiredAct.capability='paperchain.inspect';},pattern:/FATHERHAND_REQUIRED_ACT_MISMATCH/},
      {name:'wrong-purpose',mutate:value=>{value.requiredAct.purposeId='purpose:paperchain:publication';},pattern:/FATHERHAND_REQUIRED_ACT_MISMATCH/},
      {name:'wrong-validation-scope',mutate:value=>{value.validation.required.scopeRefs=['scope:other'];},pattern:/FATHERHAND_VALIDATION_SCOPE_MISMATCH/},
    ];
    for(const entry of cases){
      const authority=await fatherhandFixture(base,seedRoot,entry.mutate,'fatherhand-'+entry.name+'.json');
      const out=join(base,'out-'+entry.name);
      const attempt=await run('scripts/paperchain-plant.mjs',[seedRoot,out,'PLANT',authority.path]);
      assert.notEqual(attempt.code,0);
      assert.match(attempt.stderr,entry.pattern);
      await assert.rejects(()=>stat(out),{code:'ENOENT'});
    }

    const missing=await run('scripts/paperchain-plant.mjs',[seedRoot,join(base,'missing'),'PLANT']);
    assert.notEqual(missing.code,0);
  }finally{await rm(base,{recursive:true,force:true});}
});

test('tampered held manifest blocks PLANT before Fatherhand evidence can activate a garden',async()=>{
  const base=await mkdtemp(join(tmpdir(),'paperchain-tamper-plant-'));
  try{
    const {seedRoot}=await seedFixture(base);
    const authority=await fatherhandFixture(base,seedRoot);
    await writeFile(join(seedRoot,'seed-manifest.json'),'{"tampered":true}\n');
    const out=join(base,'out');
    const attempt=await run('scripts/paperchain-plant.mjs',[seedRoot,out,'PLANT',authority.path]);
    assert.notEqual(attempt.code,0);
    assert.match(attempt.stderr,/SEED_WITNESS_MISMATCH|INVALID_SEED_MANIFEST/);
    await assert.rejects(()=>stat(out),{code:'ENOENT'});
  }finally{await rm(base,{recursive:true,force:true});}
});
