import { mkdir, open, readFile, readdir, rename } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { canonicalBytes } from '../job.ts';
import { now } from '../cli_io.ts';
import { hash, assert } from './message.ts';
import type { Wire } from '../settlement/wire.ts';

/** Write-through local state; no shared filesystem is needed between peers. */
export async function atomic(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = path + '.pending', fd = await open(temporary, 'w', 0o600);
  try { await fd.writeFile(canonicalBytes(value)); await fd.sync(); } finally { await fd.close(); }
  await rename(temporary, path); const dir = await open(dirname(path), 'r'); try { await dir.sync(); } finally { await dir.close(); }
}
export async function readJson(path: string) { return JSON.parse(await readFile(path, 'utf8')); }
export async function optional(path: string) { try { return await readJson(path); } catch (error: any) { if (error.code === 'ENOENT') return null; throw error; } }
export class Journal {
  readonly events: Wire[] = []; private queue = Promise.resolve();
  readonly root:string; readonly run:string; readonly role:string;
  constructor(root: string, run: string, role: string) {this.root=root;this.run=run;this.role=role;}
  async load() {
    const dir = join(this.root, 'journal'); await mkdir(dir, { recursive: true, mode: 0o700 });
    for (const name of (await readdir(dir)).filter(x => /^\d{8}\.json$/.test(x)).sort()) {
      assert(name===String(this.events.length).padStart(8,'0')+'.json','WIRE_JOURNAL_SEQUENCE_GAP');
      const e = await readJson(join(dir, name)); const { event_id, ...body } = e;
      assert(e.run_id === this.run && e.role === this.role && e.sequence === this.events.length && e.previous === (this.events.at(-1)?.event_id ?? null) && event_id === hash('UsefulWork-WireLocalEvent-v1|', body), 'WIRE_JOURNAL_CORRUPT');
      this.events.push(e);
    }
    return this;
  }
  append(kind: string, message_id: string | null, detail: Wire = {}) {
    let result: Wire;
    const task = this.queue.then(async () => {
      assert(this.events.length<10000,'WIRE_JOURNAL_EVENT_LIMIT');
      const body = { schema: 'useful-work.wire-local-event/v1', run_id: this.run, role: this.role, sequence: this.events.length,
        previous: this.events.at(-1)?.event_id ?? null, observed_at: now(), kind, message_id, detail };
      result = { ...body, event_id: hash('UsefulWork-WireLocalEvent-v1|', body) };
      await atomic(join(this.root, 'journal', String(body.sequence).padStart(8, '0') + '.json'), result); this.events.push(result);
    });
    this.queue = task; return task.then(() => result!);
  }
  async idle() { await this.queue; }
}
