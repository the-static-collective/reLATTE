import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const dir = fileURLToPath(new URL('../integrations/briar-continuation/', import.meta.url));
const bootstrap = join(dir, 'bootstrap-briar.sh');
const verify = join(dir, 'verify-briar-source.sh');

test('both fork-setup scripts pass the bash syntax checker', () => {
  for (const file of [bootstrap, verify]) {
    const result = spawnSync('bash', ['-n', file], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
});

test('bootstrap refuses pre-existing target instead of damaging owned files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'briar-bootstrap-refuse-'));
  try {
    const result = spawnSync('bash', [bootstrap, dir], { encoding: 'utf8' });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /NEW_EMPTY_PATH/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('bootstrap has an explicit canonical source and no push side effects', async () => {
  const source = await readFile(bootstrap, 'utf8');
  assert.match(source, /https:\/\/code\.briarproject\.org\/briar\/briar\.git/);
  assert.match(source, /release-1\.5\.21/);
  assert.match(source, /aea0e4a6/);
  assert.match(source, /git submodule update --init --recursive/);
  assert.match(source, /LICENSE\.txt/);
  assert.doesNotMatch(source, /^\s*git push /m);
});

test('source verification requires ancestry, submodule fidelity and clean worktree', async () => {
  const source = await readFile(verify, 'utf8');
  assert.match(source, /git merge-base --is-ancestor/);
  assert.match(source, /git submodule status --recursive/);
  assert.match(source, /git status --porcelain/);
  assert.match(source, /assembleDebug/);
});
