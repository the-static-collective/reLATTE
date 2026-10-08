import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const LEDGER = join(ROOT, 'fixtures', 'sb001-research-bat-ledger.json');

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

test('research BAT ledger has unique bounded findings with evidence for every PASS', async () => {
  const ledger = JSON.parse(await readFile(LEDGER, 'utf8'));
  assert.equal(ledger.schema, 'supabardo.sb001-research-bat-ledger/v0');
  assert.equal(ledger.specimen, 'SB-001');
  assert.match(ledger.claim, /not compliance or certification/i);

  const ids = ledger.bats.map((entry: any) => entry.id);
  assert.equal(new Set(ids).size, ids.length);

  const allowed = new Set(['PASS', 'PARTIAL', 'NONTRANSFER', 'OPEN']);
  for (const entry of ledger.bats) {
    assert.equal(allowed.has(entry.status), true, `invalid status for ${entry.id}`);
    assert.equal(typeof entry.attack, 'string');
    assert.equal(entry.attack.length > 0, true);
    assert.equal(typeof entry.result, 'string');
    assert.equal(entry.result.length > 0, true);
    if (entry.status === 'PASS') {
      assert.equal(Array.isArray(entry.evidence), true);
      assert.equal(entry.evidence.length > 0, true, `PASS without evidence: ${entry.id}`);
    }
  }
});

test('research BAT dependency claim stays OPEN while dependency resolution is not locked', async () => {
  const ledger = JSON.parse(await readFile(LEDGER, 'utf8'));
  const dependencyBat = ledger.bats.find((entry: any) => entry.id === 'RBAT-DEPS-01');
  assert.ok(dependencyBat);

  const packageJson = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
  for (const [name, version] of Object.entries({
    ...(packageJson.dependencies ?? {}),
    ...(packageJson.devDependencies ?? {}),
  })) {
    assert.equal(typeof version, 'string');
    assert.doesNotMatch(version as string, /^[~^*><=]|\s|\|/, `dependency is not exact-pinned: ${name}`);
  }

  const lockPresent =
    await exists(join(ROOT, 'package-lock.json')) ||
    await exists(join(ROOT, 'npm-shrinkwrap.json'));

  if (!lockPresent) {
    assert.equal(dependencyBat.status, 'OPEN');
    assert.match(dependencyBat.result, /not proven/i);
  }
});

test('research BAT SBOM claim stays OPEN while no machine-readable SBOM is present', async () => {
  const ledger = JSON.parse(await readFile(LEDGER, 'utf8'));
  const sbomBat = ledger.bats.find((entry: any) => entry.id === 'RBAT-SBOM-01');
  assert.ok(sbomBat);

  const sbomPresent =
    await exists(join(ROOT, 'sbom.spdx.json')) ||
    await exists(join(ROOT, 'sbom.cdx.json')) ||
    await exists(join(ROOT, 'bom.json'));

  if (!sbomPresent) {
    assert.equal(sbomBat.status, 'OPEN');
    assert.match(sbomBat.result, /not proven/i);
  }
});

test('research BAT explicitly records TUF freshness as non-transfer rather than forcing WAIT expiry', async () => {
  const ledger = JSON.parse(await readFile(LEDGER, 'utf8'));
  const freezeBat = ledger.bats.find((entry: any) => entry.id === 'RBAT-FREEZE-01');
  assert.ok(freezeBat);
  assert.equal(freezeBat.status, 'NONTRANSFER');
  assert.match(freezeBat.result, /legitimate uncertainty/i);
});

test('research BAT does not hide fully colluding authorized keys behind a green signature check', async () => {
  const ledger = JSON.parse(await readFile(LEDGER, 'utf8'));
  const collusionBat = ledger.bats.find((entry: any) => entry.id === 'RBAT-COLLUSION-01');
  assert.ok(collusionBat);
  assert.equal(collusionBat.status, 'OPEN');
  assert.match(collusionBat.result, /outside SB-001's proof boundary/i);
});
