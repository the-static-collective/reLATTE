import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const flow=readFileSync('.github/workflows/riff-raft-minecraft-006.yml','utf8');
const script='experiments/riff-raft-minecraft-006/seal-capsule.py';

test('RIFF-RAFT-006: archive only the pinned successful 005 and inherited 004 evidence',()=>{
  const py=readFileSync(script,'utf8');
  assert.match(py,/SOURCE_RUN = 37994927245/);
  assert.match(py,/SOURCE_ARTIFACT = 11646368461/);
  assert.match(py,/RETURN_PACKET_SHA = "1d9deb55ccda77a98d2c4c8c062fa965830077c26798b74a9344534d8657936e"/);
  assert.match(py,/PARENT_PACKET_SHA = "9956d0887a5f65495cb777a5ba06aa03451946c46285930d8d96eeaa2a7d0a17"/);
  assert.match(py,/CANNOT_OVERWRITE_DIFFERENT_HISTORY/);
  assert.match(py,/archive_grants_no_execution/);
  assert.match(py,/archive_grants_no_ownership/);
});
test('RIFF-RAFT-006: official workflow cannot silently replace the source or promote result',()=>{
  assert.match(flow,/ref: experiment\/riff-raft-minecraft-006-black-star-mailbox/);
  assert.match(flow,/contents: write/);
  assert.match(flow,/run-id: 37994927245/);
  assert.match(flow,/ref: c8b15d43b334b6091f4920578557616b56ce72a6/);
  assert.match(flow,/git push origin HEAD:refs\/heads\/experiment\/riff-raft-minecraft-006-black-star-mailbox/);
  assert.match(flow,/archive already in git; no CI source download necessary/i);
  assert.match(flow,/name: Fresh runner reopens archived Git-only signed evidence without Actions artifacts/);
  assert.ok(flow.indexOf('name: Independently verify original signed 004 + 005 ancestry') <
    flow.indexOf('name: Copy verified bytes into durable experimental Git tree'));
  assert.ok(flow.indexOf('name: Copy verified bytes into durable experimental Git tree') <
    flow.indexOf('name: Commit exact source archive only on experiment branch'));
});
test('RIFF-RAFT-006: missing archive fails closed even without GitHub or Minecraft',()=>{
  const empty=mkdtempSync(join(tmpdir(),'riff-raft-006-empty-'));
  try {
    assert.throws(()=>execFileSync('python3',[script,'reopen',empty],{
      stdio:'pipe'
    }), /Command failed/);
    assert.throws(()=>execFileSync('python3',[script,'seal',empty],{
      stdio:'pipe'
    }), /Command failed/);
  }finally{
    rmSync(empty,{recursive:true,force:true});
  }
});
