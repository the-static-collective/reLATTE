import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  verifyCrossingEnvelope,
  verifyReceipt,
} from '../src/index.ts';

async function fixture(name: string): Promise<any> {
  return JSON.parse(await readFile(`fixtures/${name}`, 'utf8'));
}

test('independent Python verifier agrees on SB-001, SB-002, and SB-003', () => {
  const run = spawnSync(
    'python3',
    ['scripts/supabardo-independent-verify.py', '--root', process.cwd()],
    { encoding: 'utf8' },
  );

  assert.equal(
    run.status,
    0,
    `independent verifier failed\nstdout:\n${run.stdout}\nstderr:\n${run.stderr}`,
  );

  const report = JSON.parse(run.stdout.trim());
  assert.equal(report.ok, true);
  assert.equal(report.verifier, 'python-stdlib-p256/v0');
  assert.equal(report.imports_relattes_typescript, false);
  assert.deepEqual(
    report.results.map((entry: any) => [entry.specimen, entry.outcome]),
    [
      ['SB-001', 'ADMIT'],
      ['SB-002', 'HOLD'],
      ['SB-003', 'FRESH_LOCAL_ADMIT'],
    ],
  );
  assert.deepEqual(
    report.results.map((entry: any) => entry.evidence_set_id),
    [
      'sb001-evidence-v0:cbb5e16c8209e1978d1cc1910c4b5128fa58bdab1bb9bbd7d4112ebd0f6c5174',
      'sb002-evidence-v0:a44ce387493dec11fbd0902a8ca03f090b3d08ee79db89e53084f84195bbd581',
      'sb003-evidence-v0:706d1f95a15e11435c3d770886243b78a225677bde7926f02ed07d49bd6afb27',
    ],
  );
});

test('SB-003 frozen archive is interoperable with the TypeScript protocol verifier', async () => {
  const arkBytes = await readFile('fixtures/sb003-ark.json');
  const crossing = await fixture('sb003-signed-crossing.json');
  const receipts = await Promise.all([
    fixture('sb003-release-receipt.json'),
    fixture('sb003-unresolved-receipt.json'),
    fixture('sb003-successor-acceptance-receipt.json'),
    fixture('sb003-successor-admit-receipt.json'),
    fixture('sb003-exit-receipt.json'),
  ]);

  assert.equal(
    createHash('sha256').update(arkBytes).digest('hex'),
    '476d5062adf81b18d9fa2ae3fe39c9b2c1a2115bf7f9f5c177901d741fed22e2',
  );
  assert.equal(await verifyCrossingEnvelope(crossing), true);
  for (const receipt of receipts) {
    assert.equal(await verifyReceipt(receipt), true);
  }
});

test('independent verifier fails closed when one frozen SB-003 signature byte is changed', async () => {
  const original = await readFile('fixtures/sb003-exit-receipt.json', 'utf8');
  const exit = JSON.parse(original);
  const signature = exit.signing.signature as string;
  exit.signing.signature =
    (signature[0] === 'A' ? 'B' : 'A') + signature.slice(1);

  const fs = await import('node:fs/promises');
  const os = await import('node:os');
  const path = await import('node:path');

  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'sb-independent-'));
  try {
    await fs.cp('fixtures', path.join(temp, 'fixtures'), { recursive: true });
    await fs.mkdir(path.join(temp, 'scripts'), { recursive: true });
    await fs.copyFile(
      'scripts/supabardo-independent-verify.py',
      path.join(temp, 'scripts', 'supabardo-independent-verify.py'),
    );
    await fs.writeFile(
      path.join(temp, 'fixtures', 'sb003-exit-receipt.json'),
      JSON.stringify(exit, null, 2) + '\n',
      'utf8',
    );

    const run = spawnSync(
      'python3',
      [path.join(temp, 'scripts', 'supabardo-independent-verify.py'), '--root', temp],
      { encoding: 'utf8' },
    );

    assert.notEqual(run.status, 0);
    const report = JSON.parse(run.stdout.trim());
    assert.equal(report.ok, false);
    assert.match(report.error, /INVALID_RECEIPT_SIGNATURE/);
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
});
