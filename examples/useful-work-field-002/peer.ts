import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { P256KeyMaterial } from '../../src/protocol.ts';
import { canonicalBytes } from '../../src/useful_work/job.ts';
import { now } from '../../src/useful_work/cli_io.ts';
import type { Wire } from '../../src/useful_work/settlement/wire.ts';
import type { WorldRole } from '../../src/useful_work/field_test/profile.ts';
import { acknowledge, assert, inspectMessage, makeMessage, MAX_WIRE_BYTES, validatePeers, verifyAcknowledgement } from '../../src/useful_work/wire_field/message.ts';
import { sealLocalView } from '../../src/useful_work/wire_field/replay.ts';
import { atomic, Journal, optional } from '../../src/useful_work/wire_field/store.ts';

export interface PeerConfig { run_id: string; role: WorldRole; root: string; bind_host: string; port: number; peers: Wire; endpoints: Record<WorldRole, string>;
  service_endpoint: string; network_interface: string; issue_window_ms: number; response_window_ms: number; starts_after_ms: number;
  retry_ms: number; timeout_ms: number; unavailable_ms: number; late_window_ms: number; run_timeout_ms: number; surface: Wire; job_spec: Wire; door_market?: Wire }
export class Peer {
  readonly messages = new Map<string, Wire>(); readonly journal: Journal; readonly server;
  readonly inFlight = new Set<string>(); private receiving = Promise.resolve(); private applying = false; private flushing = false;
  handler: (message: Wire) => Promise<void> = async () => {}; progress: () => Promise<void> = async () => {};
  nativeHandler?: (req: IncomingMessage, res: ServerResponse) => void;
  marketHandler?: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
  stopRequested = false; complete = false; private lastError: string | null = null;
  readonly config:PeerConfig; readonly keys:P256KeyMaterial;
  constructor(config: PeerConfig, keys: P256KeyMaterial) {
    this.config=config;this.keys=keys;
    validatePeers(config.peers); assert(config.peers[config.role].keys.primary.public_key.x === keys.publicKeyJwk.x && config.peers[config.role].keys.primary.public_key.y === keys.publicKeyJwk.y, 'WIRE_LOCAL_PRIVATE_KEY_MISMATCH');
    this.journal = new Journal(config.root, config.run_id, config.role);
    this.server = createServer(async (req, res) => {
      if (req.url === '/health' && req.method === 'GET') { res.writeHead(200).end(JSON.stringify({ role: config.role, ready: true })); return; }
      if (req.url === '/native' && this.nativeHandler) { this.nativeHandler(req, res); return; }
      if (req.url === '/doors' && req.method === 'GET' && this.marketHandler) { await this.marketHandler(req, res); return; }
      if (req.url !== '/wire' || req.method !== 'POST') { res.writeHead(404).end(); return; }
      try {
        assert(Number(req.headers['content-length'] ?? 0) <= MAX_WIRE_BYTES, 'WIRE_HTTP_LIMIT'); let size = 0; const chunks: Buffer[] = [];
        for await (const b of req) { size += b.length; assert(size <= MAX_WIRE_BYTES, 'WIRE_HTTP_LIMIT'); chunks.push(Buffer.from(b)); }
        const m = await inspectMessage(JSON.parse(Buffer.concat(chunks).toString('utf8')), config.run_id, config.peers, config.role);
        const task = this.receiving.then(async () => {
          const firstSeen = !this.journal.events.some(e => e.kind === 'RECEIVE' && e.message_id === m.id);
          await this.persist(m.packet); const ack = await acknowledge(m.id, config.role, keys, now());
          await this.journal.append('RECEIVE', m.id, { first_seen: firstSeen, ack }); return ack;
        });
        this.receiving = task.then(() => {}, () => {}); const ack = await task;
        res.writeHead(200, { 'content-type': 'application/json' }).end(canonicalBytes(ack));
      } catch (error: any) { res.writeHead(400).end(JSON.stringify({ error: String(error.message).slice(0,160) })); }
    });
    this.server.requestTimeout = 10000;
  }
  get role() { return this.config.role; }
  list(topic: string) {
    const seen=new Set(this.journal.events.filter(e=>['RECEIVE','SEND_INTENT'].includes(e.kind)).map(e=>e.message_id));
    return [...this.messages.values()].filter(m => seen.has(m.crossing.crossing_id) && m.crossing.extensions.organ_adapter.donor_claims.topic === topic);
  }
  first(topic: string) { return this.list(topic)[0] ?? null; }
  async load() {
    await this.journal.load(); await mkdir(join(this.config.root, 'messages'), { recursive: true, mode: 0o700 });
    for (const name of await readdir(join(this.config.root, 'messages'))) if (/^[a-f0-9]{64}\.json$/.test(name)) {
      const m = await inspectMessage(JSON.parse(await readFile(join(this.config.root, 'messages', name), 'utf8')), this.config.run_id, this.config.peers);
      this.messages.set(m.id, m.packet);
    }
    // A message file written before its RECEIVE/SEND_INTENT commit is an orphan, not an observation.
    for (const id of this.messages.keys()) if (!this.journal.events.some(e => ['RECEIVE','SEND_INTENT'].includes(e.kind) && e.message_id === id)) this.messages.delete(id);
    const attempts = this.journal.events.filter(e => e.kind === 'SEND_ATTEMPT');
    for (const e of attempts) if (!this.journal.events.some(v => ['SEND_ACK','SEND_FAILURE','ATTEMPT_INTERRUPTED'].includes(v.kind) && v.detail.attempt_id === e.detail.attempt_id)) {
      await this.journal.append('ATTEMPT_INTERRUPTED', e.message_id, { ...e.detail, reason: 'Local restart; remote delivery outcome remains unknown.' });
    }
    await this.journal.append('START', null, { surface: this.config.surface, process_id: process.pid, resumed: this.journal.events.length > 0 });
  }
  private async persist(m: Wire) {
    const id = m.crossing.crossing_id;assert(this.messages.has(id)||this.messages.size<256,'WIRE_MESSAGE_COUNT_LIMIT');await atomic(join(this.config.root, 'messages', id.split(':')[1] + '.json'), m); this.messages.set(id, m);
  }
  async once(label: string, action: () => Promise<Wire>) {
    assert(/^[a-zA-Z0-9_-]{1,128}$/.test(label), 'INVALID_WIRE_LOCAL_LABEL'); const path = join(this.config.root, 'results', label + '.json');
    const old = await optional(path); if (old !== null) return old;
    const value = await action(); await atomic(path, value); return value;
  }
  async emit(label: string, topic: string, recipients: WorldRole[], body: unknown, dependencies: string[] = []) {
    const packet = await this.once('wire-' + label, () => makeMessage(this.config.run_id, this.role, recipients, topic, dependencies, body, this.keys, now()));
    const m = await inspectMessage(packet, this.config.run_id, this.config.peers);
    assert(m.claims.topic === topic && canonicalBytes(m.body).equals(canonicalBytes(body)), 'WIRE_INTENT_LABEL_CONFLICT');
    await this.persist(m.packet);
    if (!this.journal.events.some(e => e.kind === 'SEND_INTENT' && e.message_id === m.id)) await this.journal.append('SEND_INTENT', m.id);
    return m.id;
  }
  acknowledged(id: string, recipient: WorldRole) { return this.journal.events.some(e => e.kind === 'SEND_ACK' && e.message_id === id && e.detail.recipient === recipient); }
  private async flushOne(id: string, recipient: WorldRole) {
    const slot = id + '/' + recipient; if (this.inFlight.has(slot) || this.acknowledged(id, recipient)) return;
    const prior = this.journal.events.filter(e => e.message_id === id && e.detail.recipient === recipient && ['SEND_FAILURE','ATTEMPT_INTERRUPTED'].includes(e.kind));
    if (prior.length && Date.now() - Date.parse(prior.at(-1)!.observed_at) < Math.min(this.config.retry_ms * 2 ** Math.min(prior.length - 1, 3), 3000)) return;
    this.inFlight.add(slot);
    const attempt_id = slot + '/' + this.journal.events.filter(e => e.kind === 'SEND_ATTEMPT' && e.message_id === id && e.detail.recipient === recipient).length;
    try {
      await this.journal.append('SEND_ATTEMPT', id, { recipient, attempt_id });
      const response = await fetch(this.config.endpoints[recipient] + '/wire', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(this.config.timeout_ms),
        headers: { 'content-type': 'application/json' }, body: canonicalBytes(this.messages.get(id)).toString('utf8') });
      if (!response.ok) { await response.body?.cancel(); throw new Error('WIRE_HTTP_STATUS_' + response.status); }
      assert(response.body,'WIRE_ACK_BODY_REQUIRED');const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
      try{while(true){const{done,value}=await reader.read();if(done)break;size+=value.length;assert(size<20000,'WIRE_ACK_SIZE_LIMIT');chunks.push(value);}}finally{await reader.cancel();}
      const ack = await verifyAcknowledgement(JSON.parse(Buffer.concat(chunks).toString('utf8')), id, recipient, this.config.peers);
      await this.journal.append('SEND_ACK', id, { recipient, attempt_id, ack });
    } catch (error: any) { await this.journal.append('SEND_FAILURE', id, { recipient, attempt_id, reason: String(error.message).slice(0,160) }); }
    finally { this.inFlight.delete(slot); }
  }
  async flush() {
    if (this.flushing) return; this.flushing = true;
    try {
      const queue: (() => Promise<void>)[] = [];
      for (const e of this.journal.events.filter(e => e.kind === 'SEND_INTENT')) {
        const m = this.messages.get(e.message_id)!;
        for (const recipient of m.crossing.extensions.organ_adapter.donor_claims.recipients) if (!this.acknowledged(e.message_id, recipient)) queue.push(() => this.flushOne(e.message_id, recipient));
      }
      // Independent attempts allow causal dependants to arrive ahead of a delayed packet.
      let index = 0; await Promise.all(Array.from({ length: Math.min(8,queue.length) }, async () => { while (index < queue.length) await queue[index++](); }));
    } finally { this.flushing = false; }
  }
  async pump() {
    if (this.applying || this.stopRequested) return; this.applying = true;
    try {
      const received = [...new Set(this.journal.events.filter(e => e.kind === 'RECEIVE').map(e => e.message_id))];
      for (const id of received) {
        if (this.journal.events.some(e => ['APPLIED','DOMAIN_FAILURE'].includes(e.kind) && e.message_id === id)) continue;
        const m = this.messages.get(id)!, claims = m.crossing.extensions.organ_adapter.donor_claims;
        const seen=new Set(this.journal.events.filter(e=>['RECEIVE','SEND_INTENT'].includes(e.kind)).map(e=>e.message_id));
        const missing = claims.dependencies.filter((d: string) => !seen.has(d));
        if (missing.length) { if (!this.journal.events.some(e => e.kind === 'PENDING' && e.message_id === id)) await this.journal.append('PENDING', id, { missing }); continue; }
        try { await this.handler(m); await this.journal.append('APPLIED', id); }
        catch (error: any) { const reason=String(error.message).slice(0,160);await this.journal.append('DOMAIN_FAILURE', id, { error: reason }); this.lastError = String(error.message);console.error(this.role,'DOMAIN_FAILURE',claims.topic,reason); }
      }
      await this.progress();
    } catch (error: any) { if (this.lastError !== error.message) { this.lastError = error.message; console.error(this.role, error.message); } }
    finally { this.applying = false; }
  }
  hasOutstanding() {
    return this.journal.events.filter(e => e.kind === 'SEND_INTENT').some(e => this.messages.get(e.message_id)!.crossing.extensions.organ_adapter.donor_claims.recipients.some((r: WorldRole) => !this.acknowledged(e.message_id,r)));
  }
  async export() {
    await this.journal.idle(); const events = structuredClone(this.journal.events);
    const ids = new Set(events.filter(e => ['RECEIVE','SEND_INTENT'].includes(e.kind)).map(e => e.message_id));
    const delivery = await sealLocalView({ run_id: this.config.run_id, role: this.role, peers: this.config.peers, messages: [...this.messages.values()].filter(m => ids.has(m.crossing.crossing_id)), events }, this.keys, now());
    await atomic(join(this.config.root,'cuts',delivery.view.view_id.split(':')[1]+'.json'),delivery);
    await atomic(join(this.config.root, 'public-local-view.json'), delivery);
    if(this.config.door_market&&this.role==='A'&&this.complete)await (await import('../useful-work-field-003/market.ts')).preserveMarket(this,delivery);
    return delivery;
  }
  async quiesce() {while(this.applying||this.inFlight.size)await new Promise(yes=>setTimeout(yes,50));await this.receiving;await this.journal.idle();}
}
