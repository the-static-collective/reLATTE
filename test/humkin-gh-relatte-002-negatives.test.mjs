import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, copyFile, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyReturn } from '../scripts/humkin-gh-relatte-002.mjs';

const origin = process.env.HUMKIN_ORIGIN_HOLD;
const returned = process.env.HUMKIN_GHOT_RETURN;
if (!origin || !returned) throw new Error('Actual GitHub artifacts required for negative tests');

async function copiedReturn(fn) {
  const temp = await mkdtemp(join(tmpdir(), 'humkin-ghot-negative-'));
  try {
    await copyFile(join(returned,'ghot-execution.json'),join(temp,'ghot-execution.json'));
    await copyFile(join(returned,'relatte-return.json'),join(temp,'relatte-return.json'));
    await fn(temp);
  } finally {
    await rm(temp,{force:true,recursive:true});
  }
}

test('untainted actual return is valid',async()=>{
  const result=await verifyReturn(origin,returned);
  assert.equal(result.cryptographic_return_verified,true);
  assert.equal(result.status,'VERIFIED_CANDIDATE_ONLY');
});

test('altered GHoT result bytes fail their signed payload binding',async()=>{
  await copiedReturn(async temp=>{
    const path=join(temp,'ghot-execution.json');
    const value=JSON.parse(await readFile(path,'utf8'));
    value.ghot_output_sha256='a'.repeat(64);
    await writeFile(path,JSON.stringify(value)+'\n');
    await assert.rejects(()=>verifyReturn(origin,temp));
  });
});

test('altered source crossing id fails origin binding',async()=>{
  await copiedReturn(async temp=>{
    const path=join(temp,'ghot-execution.json');
    const value=JSON.parse(await readFile(path,'utf8'));
    value.source_crossing_id='forged-crossing';
    await writeFile(path,JSON.stringify(value)+'\n');
    await assert.rejects(()=>verifyReturn(origin,temp),/RETURN_ORIGIN_NOT_BOUND/);
  });
});

test('HOLD cannot be rewritten into ADMIT without signature failure',async()=>{
  await copiedReturn(async temp=>{
    const path=join(temp,'relatte-return.json');
    const value=JSON.parse(await readFile(path,'utf8'));
    value.disposition_receipt.kind='R3_ADMIT';
    await writeFile(path,JSON.stringify(value)+'\n');
    await assert.rejects(()=>verifyReturn(origin,temp),/RETURN_SIGNATURE_INVALID|RETURN_NOT_HELD/);
  });
});

test('extra execution fields cannot be silently introduced',async()=>{
  await copiedReturn(async temp=>{
    const path=join(temp,'ghot-execution.json');
    const value=JSON.parse(await readFile(path,'utf8'));
    value.hum_award=999999;
    await writeFile(path,JSON.stringify(value)+'\n');
    await assert.rejects(()=>verifyReturn(origin,temp),/UNRECOGNIZED_EXECUTION_FIELDS/);
  });
});
