import { fork, spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256Hex } from '../../src/canonical.ts';
import { fresh, json, now } from '../../src/useful_work/cli_io.ts';
import { canonicalBytes } from '../../src/useful_work/job.ts';
import { inspectPlan, scheduleSlot } from '../../src/useful_work/audit_clock/policy.ts';
import { createAudit } from '../../src/useful_work/audit/accumulator.ts';
import { verifyExchange } from '../../src/useful_work/settlement/exchange.ts';
import { createFieldArchive, FIELD_CONTRACT, verifyFieldDelivery } from '../../src/useful_work/field_test/archive.ts';
import { offerTerms, WORLD_KEYS } from '../../src/useful_work/field_test/profile.ts';
import type { WorldRole } from '../../src/useful_work/field_test/profile.ts';
import type { Wire } from '../../src/useful_work/settlement/wire.ts';

/** The controller routes public files and starts actors. It never reads a world key. */
export async function runField(job: unknown, destination: string) {
  const out = resolve(destination); await fresh(out);
  const mailbox = join(out, 'public-mailbox'), worlds = join(out, 'private-worlds'), external = join(out, 'external-ledger');
  await mkdir(mailbox); await mkdir(worlds, { mode: 0o700 }); await mkdir(external, { mode: 0o700 });
  const transcript: Wire[] = [], children = new Set<ChildProcess>(); let serial = 0, traceWrite = Promise.resolve();
  const recordStep = async (entry: Wire) => {
    transcript.push(entry);
    traceWrite = traceWrite.then(() => writeFile(join(out, 'process-transcript.json'), canonicalBytes([...transcript].sort((a, b) => a.step.localeCompare(b.step)))));
    await traceWrite;
  };
  const extension = import.meta.url.endsWith('.js') ? 'js' : 'ts', actorPath = fileURLToPath(new URL(`./actor.${extension}`, import.meta.url));
  // Python is not copied into .build; resolve the repository's independent external program.
  const ledgerPath = fileURLToPath(new URL(extension === 'js' ? '../../../examples/useful-work-field-001/ledger.py' : './ledger.py', import.meta.url));
  const read = async (path: string) => JSON.parse(await readFile(path, 'utf8'));
  const rootAt = (role: WorldRole) => join(worlds, role);
  const prepare = async (label: string, input: unknown) => {
    const stem = String(++serial).padStart(3, '0') + '-' + label, inputPath = join(mailbox, stem + '-input.json'), outputPath = join(mailbox, stem + '-output.json');
    await json(inputPath, input); return { inputPath, outputPath, stem };
  };
  function message(child: ChildProcess, kind: string) {
    return new Promise<void>((yes, no) => {
      const timer = setTimeout(() => { cleanup(); no(new Error('FIELD_CHILD_MESSAGE_TIMEOUT: ' + kind)); }, 60_000);
      const receive = (value: any) => { if (value?.kind === kind) { cleanup(); yes(); } else if (value?.kind === 'commit-failed') { cleanup(); no(new Error('FIELD_HOST_COMMIT_FAILED')); } };
      const exit = () => { cleanup(); no(new Error('FIELD_CHILD_EXIT_BEFORE_MESSAGE: ' + kind)); };
      const cleanup = () => { clearTimeout(timer); child.off('message', receive); child.off('exit', exit); };
      child.on('message', receive); child.once('exit', exit);
    });
  }
  async function launch(command: string, role: WorldRole, input: unknown) {
    const refs = await prepare(role + '-' + command, input), started_at = now();
    const child = fork(actorPath, [command, role, rootAt(role), refs.inputPath, refs.outputPath], { cwd: rootAt(role), silent: true, execArgv: ['--experimental-strip-types'] });
    children.add(child); let stderr = '';
    child.stderr!.on('data', b => { if (stderr.length < 4096) stderr += b.toString(); }); child.stdout!.resume();
    const done = new Promise<number>((yes, no) => { child.once('error', no); child.once('close', code => { children.delete(child); yes(code ?? 1); }); });
    const finish = async () => {
      const code = await done;
      if (code !== 0) throw new Error(`FIELD_ACTOR_FAILED ${role}/${command}: ${stderr.trim()}`);
      await recordStep({ step: refs.stem, actor: role, command, pid: child.pid!, started_at, finished_at: now(),
        input_sha256: sha256Hex(await readFile(refs.inputPath)), output_sha256: sha256Hex(await readFile(refs.outputPath)), exit_code: code });
      return read(refs.outputPath);
    };
    return { child, done, finish, ...refs };
  }
  const act = async (command: string, role: WorldRole, input: unknown) => (await launch(command, role, input)).finish();
  const waitUntil = async (at: string) => { while (Date.now() <= Date.parse(at)) await new Promise(yes => setTimeout(yes, Math.min(500, Date.parse(at) + 1 - Date.now()))); };
  async function ledger(command: 'init' | 'transfer', request?: Wire) {
    const refs = await prepare('ledger-' + command, request ?? {}), started_at = now(), state = join(external, 'state.json');
    const args = command === 'init' ? ['init', state] : ['transfer', state, refs.inputPath, refs.outputPath];
    const child = spawn('python3', ['-I', '-B', ledgerPath, ...args], { cwd: external, stdio: ['ignore', 'ignore', 'pipe'] }); children.add(child);
    let stderr = ''; child.stderr!.on('data', b => { if (stderr.length < 4096) stderr += b.toString(); });
    const code = await new Promise<number>((yes, no) => { child.once('error', no); child.once('close', code => { children.delete(child); yes(code ?? 1); }); });
    if (code !== 0) throw new Error('FIELD_EXTERNAL_LEDGER_FAILED: ' + stderr.trim());
    if (command === 'init') await json(refs.outputPath, { initialized: true });
    await recordStep({ step: refs.stem, actor: 'external-ledger', command, pid: child.pid!, started_at, finished_at: now(),
      input_sha256: sha256Hex(await readFile(refs.inputPath)), output_sha256: sha256Hex(await readFile(refs.outputPath)), exit_code: code });
    return command === 'init' ? (await read(state)).balances : read(refs.outputPath);
  }
  try {
    for (const role of Object.keys(WORLD_KEYS) as WorldRole[]) await mkdir(rootAt(role), { mode: 0o700 });
    const actors = Object.fromEntries(await Promise.all((Object.keys(WORLD_KEYS) as WorldRole[]).map(async role => [role, await act('init', role, {})])));
    console.log('Independent actor processes and local key stores initialized.');
    const producer = await launch('produce', 'A', { job_spec: job }); await message(producer.child, 'ready');
    const produced = message(producer.child, 'produced'); producer.child.send({ kind: 'run' }); await produced;
    producer.child.send({ kind: 'stop' }); const packet = await producer.finish();
    const before = await ledger('init');
    const boundary_holds: Wire[] = [await act('hold', 'B', { name: 'work', crossing: packet.native.work, contract_ref: FIELD_CONTRACT })];
    const fullReceipts = await Promise.all((['B', 'C'] as const).map(role => act('legacy-check', role, { packet })));
    const oldChallenge = await act('legacy-issue', 'B', { packet }), oldResponse = await act('legacy-answer', 'A', { packet, challenge: oldChallenge });
    const sampleReceipts = await Promise.all((['B', 'C'] as const).map(role => act('legacy-sample-check', role, { packet, challenge: oldChallenge, response: oldResponse })));
    console.log('Kernels 001–003: A rendered; B TypeScript and C Python independently checked the full and sampled legacy artifact.');
    const terms = offerTerms(packet, actors, new Date(Date.now() + 180_000).toISOString());
    const offer = await act('offer', 'B', terms); boundary_holds.push(await act('hold', 'A', { name: 'offer', crossing: offer, contract_ref: FIELD_CONTRACT }));
    const auditPlan = await act('plan', 'B', { packet, actors, purpose: 'audit' }), auditPublication = await act('audit-publication', 'B', { plan: auditPlan });
    const auditPolicy = (await inspectPlan(auditPlan)).policy;
    const auditInput: Wire = { job_spec: packet.job_spec, work: packet.native.work, plan: auditPlan, publication: auditPublication,
      events: [], issues: [], responses: [], receipts: [], observations: [], prior_cuts: [] };
    for (let slot = 0; slot < 2; slot++) {
      await waitUntil(scheduleSlot(auditPolicy, slot).scheduled_at);
      const event = await act('randomness', 'C', { plan: auditPlan, slot }); auditInput.events.push(event);
      const issue = await act('audit-issue', 'B', { packet, plan: auditPlan, publication: auditPublication, event }); auditInput.issues.push(issue);
      const response = await act('audit-answer', 'A', { packet, challenge: issue.challenge }); auditInput.responses.push(response);
      const receipts = await Promise.all((slot === 0 ? ['B', 'C', 'D'] as const : ['B', 'C'] as const).map(role => act('native-check', role, { packet, challenge: issue.challenge, response })));
      auditInput.receipts.push(...receipts);
    }
    const history = await act('audit-history', 'B', auditInput), audit = await createAudit(packet.job_spec, auditPolicy.result_id,
      auditInput.receipts.map((receipt: Wire) => { const index = auditInput.issues.findIndex((issue: Wire) => issue.challenge.crossing_id === receipt.extensions.useful_work_native.scope.challenge_id);
        return { work: packet.native.work, challenge: auditInput.issues[index].challenge, response: auditInput.responses[index], receipt }; }));
    boundary_holds.push(await act('hold', 'C', { name: 'response', crossing: auditInput.responses[0], contract_ref: FIELD_CONTRACT }));
    console.log('Kernels 004–006: two scheduled audits retained the deliberate signed count disagreement.');
    await act('network-start', 'A', {});
    const host = await launch('server', 'A', { packet }); await message(host.child, 'listening'); const endpoint = (await read(host.outputPath)).endpoint;
    const servicePlan = await act('plan', 'B', { packet, actors, purpose: 'service' }), servicePolicy = (await inspectPlan(servicePlan)).policy;
    const commitment = await act('service-commit', 'A', { packet, plan: servicePlan, endpoint });
    const serviceContext = { packet, plan: servicePlan, commitment }, contextRefs = await prepare('host-commit-context', serviceContext);
    // Context update is public-file IPC, never another actor's memory or private key.
    const committed = message(host.child, 'committed'); host.child.send({ kind: 'commit', path: contextRefs.inputPath }); await committed;
    const publication = await act('service-publication', 'B', serviceContext), serviceInput: Wire = {
      job_spec: packet.job_spec, work: packet.native.work, plan: servicePlan, commitment, publication, events: [], challenges: [], responses: [], receipts: [], prior_cuts: [] };
    for (let slot = 0; slot < 2; slot++) {
      await waitUntil(scheduleSlot(servicePolicy, slot).scheduled_at);
      const event = await act('randomness', 'C', { plan: servicePlan, slot }); serviceInput.events.push(event);
      const challenge = await act('service-issue', 'B', { ...serviceContext, publication, event }); serviceInput.challenges.push(challenge);
      if (slot === 0) {
        const result = await act('service-request', 'B', { ...serviceContext, publication, event, challenge });
        if (!result.response || result.transport_error) throw new Error('FIELD_LIVE_SERVICE_FAILED');
        serviceInput.responses.push(result.response); serviceInput.receipts.push(result.receipt);
      }
    }
    console.log('Kernel 008: live HTTP chunk proofs observed; deliberately leaving the second issued challenge unanswered until its window expires.');
    const measurements = await act('resource-observation', 'A', { packet }), resources = await act('resource-replay', 'C', { packet, measurements });
    await waitUntil(servicePolicy.expires_at); const serving = await act('service-history', 'B', serviceInput);
    host.child.send({ kind: 'stop' }); await host.finish();
    const inputEvidence = { result_id: auditPolicy.result_id, job_spec: packet.job_spec, work: packet.native.work,
      audit, audit_history: history, service_history: serving, resources, valuations: [] };
    const valuation = await act('valuate', 'B', { packet, evidence: inputEvidence });
    const presented = await act('present', 'A', { offer, evidence: { ...inputEvidence, valuations: [valuation] } }), exchange = await act('decide', 'B', presented);
    const v = await verifyExchange(exchange);
    if (v.report.choice !== 'ACCEPT') throw new Error('FIELD_ACCEPT_REQUIRED_BEFORE_OPERATOR_ACTION');
    const request = { entry_ref: 'field-entry-1', amount: '12', acceptance_ref: exchange.decision.receipt_id, evidence_ref: exchange.evidence.evidence_id };
    const externalRecord = await ledger('transfer', request), ledgerBytes = await readFile(join(external, 'state.json'));
    const observation = await act('settlement-observe', 'adapter', { exchange, external_record: externalRecord });
    const settlement = await act('settlement-replay', 'C', { exchange, observation });
    const dissent = await act('valuate', 'D', { packet, evidence: inputEvidence });
    boundary_holds.push(await act('hold', 'D', { name: 'work', crossing: packet.native.work, contract_ref: FIELD_CONTRACT }));
    if (!ledgerBytes.equals(await readFile(join(external, 'state.json')))) throw new Error('FIELD_REPLAY_CHANGED_EXTERNAL_LEDGER');
    console.log('Kernels 007/009/010: B locally ACCEPTS at 12; the external ledger moves 12; C replays; D values the same context at 5.');
    const after = (await read(join(external, 'state.json'))).balances;
    const archive = await createFieldArchive({ actors, packet, baseline: { full_receipts: fullReceipts, challenge: oldChallenge, response: oldResponse, sample_receipts: sampleReceipts },
      settlement, dissent, boundary_holds, external_ledger: { request, record: externalRecord, before, after }, transcript: [...transcript].sort((a, b) => a.step.localeCompare(b.step)) });
    const crossing = await act('preserve', 'C', archive);
    const retention = await Promise.all((['A', 'B', 'C', 'D'] as const).map(role => act('retain', role, { name: 'archive', archive, crossing, contract_ref: FIELD_CONTRACT })));
    const delivery = await verifyFieldDelivery({ schema: 'useful-work.field-test-001-delivery/v1', archive, crossing, retention });
    await mkdir(join(out, 'public-delivery')); await writeFile(join(out, 'public-delivery/field.json'), canonicalBytes(delivery), { flag: 'wx' });
    await json(join(out, 'public-delivery/summary.json'), archive.summary);
    await traceWrite;
    return { out, delivery };
  } finally {
    for (const child of children) child.kill('SIGKILL');
    await Promise.all([...children].map(child => new Promise<void>(yes => { if (child.exitCode !== null || child.signalCode !== null) yes(); else child.once('close', () => yes()); })));
  }
}
