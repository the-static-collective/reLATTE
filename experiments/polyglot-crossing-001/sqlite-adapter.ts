import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { sha256Hex } from '../../src/canonical.ts';
import { makeObservation, type AdapterObservation } from './common.ts';

export async function observeSqlite(bytes: Uint8Array): Promise<{
  observation: AdapterObservation;
  cleanup: () => Promise<void>;
}> {
  const root = await mkdtemp(join(tmpdir(), 'relatte-polyglot-sqlite-'));
  const db = join(root, 'world.sqlite');
  const payload = Buffer.from(bytes).toString('base64');
  const script = [
    'import base64, json, sqlite3, sys',
    'db, payload = sys.argv[1], sys.argv[2]',
    'con = sqlite3.connect(db)',
    'con.execute("create table artifacts(id integer primary key, payload blob not null)")',
    'cur = con.execute("insert into artifacts(payload) values (?)", (base64.b64decode(payload),))',
    'rowid = cur.lastrowid',
    'con.commit()',
    'raw = con.execute("select payload from artifacts where id=?", (rowid,)).fetchone()[0]',
    'print(json.dumps({"rowid": rowid, "payload": base64.b64encode(raw).decode()}))',
    'con.close()',
  ].join('\n');

  const raw = execFileSync('python3', ['-c', script, db, payload], { encoding: 'utf8' });
  const parsed = JSON.parse(raw) as { rowid: number; payload: string };
  const observed = Buffer.from(parsed.payload, 'base64');
  const dbBytes = await readFile(db);

  return {
    observation: makeObservation(
      'sqlite',
      `sqlite:db-sha256:${sha256Hex(dbBytes)}:artifacts:rowid:${parsed.rowid}`,
      observed,
      'application/octet-stream',
      {
        table: 'artifacts',
        rowid: parsed.rowid,
        database_sha256: sha256Hex(dbBytes),
        identity_model: 'database file + table row',
      },
    ),
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}
