import { mkdirSync, openSync, writeSync, fsyncSync, closeSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { canonical, byteDigest, digest } from '../interface-superspace-001/src/receipts.mjs';
import { signed, verifySigned } from '../dynamic-interface-field-001/src/history.mjs';

// Write-once content objects and fsynced signed journal. No private keys are persisted.
export class EvidenceStore {
  constructor(root) { this.root = root; mkdirSync(join(root, 'objects'), { recursive: true }); }
  put(value) {
    const bytes = Buffer.from(JSON.stringify(value)), ref = byteDigest(bytes), path = this.path(ref);
    if (!existsSync(path)) {
      const fd = openSync(path, 'wx', 0o600);
      try { writeSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
      const dir = openSync(join(this.root, 'objects'), 'r');
      try { fsyncSync(dir); } finally { closeSync(dir); }
    }
    return ref;
  }
  path(ref) { if (!/^sha256:[a-f0-9]{64}$/.test(ref)) throw new Error('INVALID_CONTENT_REF'); return join(this.root, 'objects', ref.slice(7) + '.json'); }
  get(ref) { const bytes = readFileSync(this.path(ref)); if (byteDigest(bytes) !== ref) throw new Error('CONTENT_DIGEST_MISMATCH'); return JSON.parse(bytes); }
  append(name, value) {
    if (!/^incarnation:[a-f0-9-]+$/.test(name)) throw new Error('INVALID_JOURNAL_NAME');
    const fd = openSync(join(this.root, name + '.jsonl'), 'a', 0o600);
    try { writeSync(fd, canonical(value) + '\n'); fsyncSync(fd); } finally { closeSync(fd); }
    const dir = openSync(this.root, 'r'); try { fsyncSync(dir); } finally { closeSync(dir); }
  }
  journal(name) {
    if (!/^incarnation:[a-f0-9-]+$/.test(name)) throw new Error('INVALID_JOURNAL_NAME');
    const path = join(this.root, name + '.jsonl');
    if (!existsSync(path)) return [];
    const text = readFileSync(path, 'utf8');
    if (!text.endsWith('\n')) throw new Error('TORN_JOURNAL_FAIL_CLOSED');
    return text.trim().split('\n').map(JSON.parse);
  }
}
export function verifyJournal(events, anchor) {
  let previous = null, dead = false;
  if (!events.length || events[0].kind !== 'admitted') throw new Error('ADMISSION_REQUIRED');
  for (let i = 0; i < events.length; i++) {
    const e = events[i]; verifySigned(e, anchor.public_key);
    if (e.seq !== i || e.previous !== previous || e.incarnation_id !== events[0].incarnation_id || e.world_id !== anchor.world_id) throw new Error('BROKEN_BRIDGE_JOURNAL');
    if (dead && !['terminated', 'cleanup', 'denial'].includes(e.kind)) throw new Error('EVENT_AFTER_TERMINAL_FENCE');
    if (e.kind === 'death-fence') { if (dead) throw new Error('DUPLICATE_DEATH'); dead = true; }
    previous = digest(e);
  }
  return { dead, head: previous };
}
export function appendSigned(store, incarnation, keys, kind, payload) {
  const events = store.journal(incarnation);
  const event = signed({ schema: 'relatte.composition-field-bridge.experimental/v0', incarnation_id: incarnation, world_id: keys.world_id, seq: events.length, previous: events.length ? digest(events.at(-1)) : null, kind, payload }, keys);
  verifyJournal([...events, event], keys);
  store.append(incarnation, event); return event;
}
