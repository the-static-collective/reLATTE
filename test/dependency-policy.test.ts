import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('MCP dependency policy rejects downgrade, malicious registry and lock corruption', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'relatte-mcp-deps-'));
  const scriptPath = join(dir, 'scripts', 'check-dependency-policy.mjs');
  const manifestPath = join(dir, 'package.json');
  const lockPath = join(dir, 'package-lock.json');
  await mkdir(join(dir, 'scripts'));

  const originalManifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const originalLock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
  await copyFile(new URL('../scripts/check-dependency-policy.mjs', import.meta.url), scriptPath);

  const run = async (manifest: any, lock: any) => {
    await writeFile(manifestPath, JSON.stringify(manifest));
    await writeFile(lockPath, JSON.stringify(lock));
    return spawnSync(process.execPath, [scriptPath], { encoding: 'utf8', cwd: dir, timeout: 10000 });
  };
  try {
    assert.equal((await run(originalManifest, originalLock)).status, 0);

    // A version change without a matching lockfile cannot pass.
    const drift = structuredClone(originalManifest);
    drift.dependencies['@modelcontextprotocol/server'] = '2.0.0';
    assert.notEqual((await run(drift, originalLock)).status, 0);

    // Even a coordinated downgrade of both manifest and lock is rejected.
    const downgrade = structuredClone(originalManifest);
    const downgradeLock = structuredClone(originalLock);
    downgrade.dependencies['@modelcontextprotocol/server'] = '2.0.0';
    downgrade.devDependencies['@modelcontextprotocol/client'] = '2.0.0';
    downgradeLock.packages[''].dependencies['@modelcontextprotocol/server'] = '2.0.0';
    downgradeLock.packages[''].devDependencies['@modelcontextprotocol/client'] = '2.0.0';
    downgradeLock.packages['node_modules/@modelcontextprotocol/server'].version = '2.0.0';
    downgradeLock.packages['node_modules/@modelcontextprotocol/client'].version = '2.0.0';
    assert.notEqual((await run(downgrade, downgradeLock)).status, 0);

    // Reject substitution of a package source and removal of integrity.
    const malicious = structuredClone(originalLock);
    malicious.packages['node_modules/@modelcontextprotocol/client'].resolved =
      'https://registry.attacker.example/client.tgz';
    assert.notEqual((await run(originalManifest, malicious)).status, 0);

    const corrupted = structuredClone(originalLock);
    delete corrupted.packages['node_modules/@modelcontextprotocol/client'].integrity;
    assert.notEqual((await run(originalManifest, corrupted)).status, 0);

    // Reject accidental runtime promotion of the OAuth test client.
    const promoted = structuredClone(originalManifest);
    promoted.dependencies['@modelcontextprotocol/client'] = promoted.devDependencies['@modelcontextprotocol/client'];
    assert.notEqual((await run(promoted, originalLock)).status, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
