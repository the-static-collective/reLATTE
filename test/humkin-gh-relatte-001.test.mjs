import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inspectCatalog, receive, verifyPublic } from '../scripts/humkin-gh-relatte-001.mjs';

const REVISION = 'a'.repeat(40);
const COMMITTED_AT = '2026-11-17T11:46:00Z';
function source() {
  return {
    discovery: Buffer.from(JSON.stringify({catalog:'https://humkin.abundent.org/tracks.json'})),
    tracks: Buffer.from(JSON.stringify({
      artist:'HUMKIN',
      tracks:Array.from({length:12},(_,i)=>({
        number:i+1, title:'Synthetic track '+(i+1), url:'audio/Track_'+(i+1)+'.mp3',
      })),
    })),
  };
}
async function fixture(root) {
  const dir=join(root,'carrier');
  await mkdir(dir,{recursive:true});
  const {discovery,tracks}=source();
  const manifest=inspectCatalog(discovery,tracks,REVISION,COMMITTED_AT);
  await writeFile(join(dir,'discovery.json'),discovery);
  await writeFile(join(dir,'tracks.json'),tracks);
  await writeFile(join(dir,'source-manifest.json'),JSON.stringify(manifest));
  return dir;
}
test('native HUMKIN catalog crossing signs RECEIVE, HOLD and survives cold reLATTE replay',async()=>{
  const root=await mkdtemp(join(tmpdir(),'humkin-crossing-'));
  try {
    const carrier=await fixture(root);
    const result=await receive(carrier,join(root,'work'));
    assert.equal(result.disposition,'HOLD');
    assert.equal(result.catalog_count,12);
    assert.equal(result.local_cold_replay_verified,true);
    assert.equal(result.receiver_admitted,false);
    assert.equal(result.audio_transferred,false);
    const publicResult=await verifyPublic(join(root,'work','public'));
    assert.equal(publicResult.crossing_id,result.crossing_id);
    assert.equal(publicResult.hold_receipt_id,result.hold_receipt_id);
  } finally {await rm(root,{recursive:true,force:true});}
});
test('changed GitHub-carried source bytes are refused before signing',async()=>{
  const root=await mkdtemp(join(tmpdir(),'humkin-tamper-'));
  try {
    const carrier=await fixture(root);
    await writeFile(join(carrier,'tracks.json'),(await readFile(join(carrier,'tracks.json'),'utf8'))+' ');
    await assert.rejects(()=>receive(carrier,join(root,'work')),/SOURCE_MANIFEST_MISMATCH/);
  } finally {await rm(root,{recursive:true,force:true});}
});
test('signed receipt substitution is rejected by independent public verifier',async()=>{
  const root=await mkdtemp(join(tmpdir(),'humkin-receipt-'));
  try {
    const carrier=await fixture(root);
    await receive(carrier,join(root,'work'));
    const file=join(root,'work','public','native-result.json');
    const obj=JSON.parse(await readFile(file,'utf8'));
    obj.disposition_receipt.semantic_effect='admitted';
    await writeFile(file,JSON.stringify(obj));
    await assert.rejects(()=>verifyPublic(join(root,'work','public')),/BAD_SIGNED_RECEIPT|UNAUTHORIZED_EFFECT/);
  } finally {await rm(root,{recursive:true,force:true});}
});
test('unsafe paths, duplicate track numbers and non-HUMKIN sources are refused',()=>{
  const {discovery,tracks}=source();
  const bad=JSON.parse(tracks.toString());
  bad.tracks[0].url='../outside.mp3';
  assert.throws(()=>inspectCatalog(discovery,Buffer.from(JSON.stringify(bad)),REVISION,COMMITTED_AT),/UNSAFE_TRACK_PATH/);
  bad.tracks[0].url='audio/Track_1.mp3';
  bad.tracks[0].number=2;
  assert.throws(()=>inspectCatalog(discovery,Buffer.from(JSON.stringify(bad)),REVISION,COMMITTED_AT),/DUPLICATE_TRACK_NUMBER/);
  assert.throws(()=>inspectCatalog(Buffer.from('{}'),tracks,REVISION,COMMITTED_AT),/WRONG_DISCOVERY_ORIGIN/);
});
