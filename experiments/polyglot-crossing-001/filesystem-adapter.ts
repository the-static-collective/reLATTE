import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { makeObservation, type AdapterObservation } from './common.ts';

export async function observeFilesystem(bytes: Uint8Array): Promise<{
  observation: AdapterObservation;
  cleanup: () => Promise<void>;
}> {
  const root = await mkdtemp(join(tmpdir(), 'relatte-polyglot-fs-'));
  const path = join(root, 'artifact.bin');
  await writeFile(path, Buffer.from(bytes));
  const info = await stat(path);
  const observed = await readFile(path);

  return {
    observation: makeObservation(
      'filesystem',
      `fs:dev:${info.dev}:ino:${info.ino}:artifact.bin`,
      observed,
      'application/octet-stream',
      {
        path_scope: 'local',
        regular_file: info.isFile(),
        device: String(info.dev),
        inode: String(info.ino),
        identity_model: 'local file object + bytes',
      },
    ),
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}
