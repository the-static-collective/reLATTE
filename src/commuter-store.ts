import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { CommuterCursorStore } from './commuter.ts';

/**
 * Single-writer file cursor for a poller on one durable filesystem.
 * No distributed lock, remote-store transaction, or fsync guarantee.
 */
export class FileCommuterCursorStore implements CommuterCursorStore {
  constructor(readonly path: string) {
    if (typeof path !== 'string' || path.trim() === '') {
      throw new Error('INVALID_COMMUTER_CURSOR_PATH');
    }
  }

  async read(): Promise<string | null> {
    let raw: string;
    try {
      raw = await readFile(this.path, 'utf8');
    } catch (error: any) {
      if (error?.code === 'ENOENT') return null;
      throw error;
    }
    const stored: unknown = JSON.parse(raw);
    if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) {
      throw new Error('INVALID_COMMUTER_CURSOR_STORE');
    }
    const value = stored as Record<string, unknown>;
    if (value.schema !== 'relatte.commuter-cursor/v0' ||
        (value.cursor !== null && typeof value.cursor !== 'string')) {
      throw new Error('INVALID_COMMUTER_CURSOR_STORE');
    }
    return value.cursor as string | null;
  }

  async write(next: string | null): Promise<void> {
    if (next !== null && typeof next !== 'string') throw new Error('INVALID_COMMUTER_CURSOR');
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = this.path + '.' + randomUUID() + '.pending';
    try {
      await writeFile(temporary, JSON.stringify({
        schema: 'relatte.commuter-cursor/v0',
        cursor: next,
      }) + '\n', { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      await rename(temporary, this.path);
    } finally {
      await rm(temporary, { force: true });
    }
  }
}
