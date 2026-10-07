import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { makeObservation, type AdapterObservation } from './common.ts';

export async function observeGit(bytes: Uint8Array): Promise<{
  observation: AdapterObservation;
  cleanup: () => Promise<void>;
}> {
  const root = await mkdtemp(join(tmpdir(), 'relatte-polyglot-git-'));
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'polyglot@example.invalid'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Polyglot Adapter'], { cwd: root });
  await writeFile(join(root, 'artifact.bin'), Buffer.from(bytes));
  execFileSync('git', ['add', 'artifact.bin'], { cwd: root });
  execFileSync('git', ['commit', '-q', '-m', 'polyglot specimen'], {
    cwd: root,
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: '2026-10-07T00:00:00Z',
      GIT_COMMITTER_DATE: '2026-10-07T00:00:00Z',
    },
  });

  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const blob = execFileSync('git', ['rev-parse', 'HEAD:artifact.bin'], { cwd: root, encoding: 'utf8' }).trim();
  const observed = execFileSync('git', ['show', 'HEAD:artifact.bin'], { cwd: root });

  return {
    observation: makeObservation(
      'git',
      `git:${commit}:blob:${blob}:artifact.bin`,
      observed,
      'application/octet-stream',
      { commit, blob, path: 'artifact.bin', identity_model: 'commit/tree/blob DAG' },
    ),
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}
