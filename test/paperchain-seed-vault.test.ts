import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { LocalReceiver, sha256Hex, verifyReceipt } from '../src/index.ts';

// A tiny first-party PNG fixture; actual CLI accepts arbitrary bounded user PNGs.
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==',
  'base64',
);
function execute(image: string, manuscript: string, out: string) {
  return new Promise<{code: number|null, stdout: string, stderr: string}>((ok, fail) => {
    const child=spawn(process.execPath,
      ['--experimental-strip-types',resolve('scripts/paperchain-seed-vault.mjs'),image,manuscript,out],
      {stdio:['ignore','pipe','pipe']});
    let stdout='';
    let stderr='';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data',part => {stdout+=part;});
    child.stderr.on('data',part => {stderr+=part;});
    child.once('error',fail);
    child.once('close',code => ok({code,stdout,stderr}));
  });
}

test('one source image + one manuscript crosses as a held signed seed, without pretending to transport the PNG',async()=>{
  const base=await mkdtemp(join(tmpdir(),'paperchain-001-'));
  try{
    const image=join(base,'seed.png');
    const manuscript=join(base,'seed.txt');
    const root=join(base,'output');
    await writeFile(image,ONE_PIXEL_PNG);
    const story=Buffer.from('The chest freezer in the garage does not hold meat. It holds syllables.\n');
    await writeFile(manuscript,story);
    const run=await execute(image,manuscript,root);
    assert.equal(run.code,0,run.stderr);
    const witness=JSON.parse(run.stdout);
    assert.equal(witness.evidence,'SIGNED_MANIFEST_BYTES_VERIFIED_AND_HELD');
    assert.equal(witness.source_image_sha256,sha256Hex(ONE_PIXEL_PNG));
    assert.equal(witness.source_manuscript_sha256,sha256Hex(story));
    assert.ok(witness.not_proven.includes('source-image-byte-custody'));
    assert.ok(witness.not_proven.includes('receiver-admission'));
    const manifestBytes=await readFile(join(root,'seed-manifest.json'));
    assert.equal(sha256Hex(manifestBytes),witness.seed_manifest_sha256);
    const manifest=JSON.parse(manifestBytes.toString('utf8'));
    assert.equal(manifest.source_artifacts[0].delivery_state,'SOURCE_LOCAL_ONLY');
    assert.equal(manifest.source_artifacts[0].sha256,sha256Hex(ONE_PIXEL_PNG));
    const receiver=await LocalReceiver.open(join(root,'receiver'));
    assert.deepEqual(receiver.snapshot().held,[witness.crossing_id]);
    assert.deepEqual(receiver.snapshot().admitted,[]);
    const custody=receiver.getPayloadCustodyReceipt(witness.crossing_id);
    assert.equal(custody?.receipt_id,witness.custody_receipt_id);
    assert.equal(await verifyReceipt(custody),true);
    const payload=await readFile(join(root,'receiver','payloads',witness.crossing_id+'.bin'));
    assert.deepEqual(payload,manifestBytes);
    assert.notDeepEqual(payload,ONE_PIXEL_PNG);
    const candidate=JSON.parse(await readFile(join(root,'first-panel-candidate.json'),'utf8'));
    assert.equal(candidate.status,'CANDIDATE_NOT_GERMINATED');
    assert.equal(candidate.parent_seed,witness.seed_id);
    assert.equal(candidate.source_image,'sha256:'+sha256Hex(ONE_PIXEL_PNG));
    const rerun=await execute(image,manuscript,root);
    assert.notEqual(rerun.code,0);
    assert.match(rerun.stderr,/OUTPUT_ROOT_ALREADY_EXISTS/);
  }finally{await rm(base,{recursive:true,force:true});}
});

test('invalid source PNG fails before crossing or producing a receiver',async()=>{
  const base=await mkdtemp(join(tmpdir(),'paperchain-bad-source-'));
  try{
    const image=join(base,'fake.png'),text=join(base,'story.txt'),root=join(base,'out');
    await writeFile(image,'not an image');
    await writeFile(text,'story');
    const run=await execute(image,text,root);
    assert.notEqual(run.code,0);
    assert.match(run.stderr,/PNG_SIGNATURE_OR_IHDR_MISSING/);
    await assert.rejects(()=>stat(root),{code:'ENOENT'});
  }finally{await rm(base,{recursive:true,force:true});}
});
