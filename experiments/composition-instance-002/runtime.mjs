import { fork, execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { occurrence } from '../interface-superspace-001/src/receipts.mjs';
import { RUNTIME_ID } from './room-state.mjs';
export class RoomRuntime {
  #child; #pending = new Map(); #alive = true;
  constructor(path, state, onTermination = () => {}) {
    this.path = path; this.author_session_id = occurrence('author');
    writeFileSync(path, JSON.stringify(state));
    this.#child = fork(fileURLToPath(new URL('./room-worker.mjs', import.meta.url)), [path], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'], execArgv: ['--max-old-space-size=32'] });
    this.pid = this.#child.pid;
    this.ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.#child.kill('SIGKILL'); reject(new Error('RUNTIME_START_TIMEOUT')); }, 5000);
      this.#child.on('message', (m) => {
        if (m.ready) { clearTimeout(timer); m.runtime_id === RUNTIME_ID ? resolve() : reject(new Error('COMPOSITION_RUNTIME_MISMATCH')); }
        const p = this.#pending.get(m.id); if (p) { this.#pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(new Error(m.error)) : p.resolve(m); }
      });
      this.#child.on('error', reject);
      this.#child.on('exit', (code, signal) => { clearTimeout(timer); this.#alive = false; reject(new Error('RUNTIME_TERMINATED')); for (const p of this.#pending.values()) { clearTimeout(p.timer); p.reject(new Error('RUNTIME_TERMINATED')); } this.#pending.clear(); onTermination({ code, signal }); });
    });
    this.ready.catch(() => {});
  }
  async call(action, semantic) {
    await this.ready; if (!this.#alive) throw new Error('RUNTIME_TERMINATED');
    const id = occurrence('call');
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.#pending.delete(id); this.#child.kill('SIGKILL'); reject(new Error('RUNTIME_TIMEOUT')); }, 5000);
      this.#pending.set(id, { resolve, reject, timer }); this.#child.send({ id, action, semantic });
    });
  }
  state() { return JSON.parse(readFileSync(this.path, 'utf8')); }
  observe(session) {
    if (session === this.author_session_id) throw new Error('COMPOSITION_OBSERVER_NOT_DISTINCT');
    // Fresh read-only process: never asks the author process for its claimed state.
    return JSON.parse(execFileSync(process.execPath, ['-e', 'process.stdout.write(require("node:fs").readFileSync(process.argv[1]))', this.path], { timeout: 5000, encoding: 'utf8' }));
  }
  async kill() {
    if (!this.#alive) return;
    const exited = new Promise(resolve => this.#child.once('exit', resolve));
    this.#child.kill('SIGKILL'); await exited;
  }
}
