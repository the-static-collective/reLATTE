import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateP256KeyPair } from '../protocol.ts';
import { canonicalBytes, exactKeys, integer, parseJob, record } from './job.ts';
import { claims } from './challenge/exchange.ts';
import { inspectNativeWork } from './merkle_native/exchange.ts';
import { verifyNativeChallenge } from './merkle_native/verifier.ts';
import { nativePythonChecker } from './merkle_native/python_checker.ts';
import { nativeReceipt } from './merkle_native/receipt.ts';
import { now, json, fresh, bundle, held, boundedRead, loadBundle, readWorkerKeys } from './cli_io.ts';
import { inspectPlan, publishPlan, scheduleSlot } from './audit_clock/policy.ts';
import { emitRandomness, issueScheduledChallenge, observe } from './audit_clock/provenance.ts';
import { appendHistory, createHistory, MAX_HISTORY_BYTES, sealHistoryCut, verifyHistory } from './audit_clock/history.ts';
import { sealHistoryCrossing, verifyHistoryCrossing } from './audit_clock/transport.ts';
import { CLOCK_CONTRACT, equal, instant, iso } from './audit_clock/wire.ts';
import type { AuditHistory, AuditPolicy, HistoryInput, ObservationKind } from './audit_clock/types.ts';

async function readJson(path: string, max = MAX_HISTORY_BYTES) { return JSON.parse((await boundedRead(path, max)).toString('utf8')); }
async function workAt(path: string) {
  const work = await loadBundle(path), hash = claims(work).useful_work_native?.job_spec_hash;
  if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) throw new Error('INVALID_JOB_ADDRESS');
  return inspectNativeWork(work, await boundedRead(join(dirname(path), 'artifacts', hash), 4096));
}
async function saveHistory(out: string, history: AuditHistory) {
  const verified = await verifyHistory(history); await fresh(out);
  await writeFile(join(out, 'history.json'), canonicalBytes(verified.history), { flag: 'wx' });
  await json(join(out, 'summary.json'), verified.history.summary);
  if (verified.audit) await writeFile(join(out, 'evidence-audit.json'), canonicalBytes(verified.audit), { flag: 'wx' });
  const crossing = await sealHistoryCrossing(verified.history, await generateP256KeyPair(), now());
  await bundle(join(out, 'crossing.json'), crossing, 'Useful Work Kernel 006');
  await held(join(out, 'receiver'), crossing, 'world:useful-work-audit-clock-holder', CLOCK_CONTRACT);
  console.log(JSON.stringify({ history_id: history.history_id, plan_id: history.summary.plan_id, result_id: history.summary.result_id,
    as_of_observer_claim: history.summary.as_of_observer_claim, status_counts: history.summary.status_counts,
    schedule_accounting: history.summary.schedule_accounting, observed_history_complete: false, authority_asserted: false, output: out }, null, 2));
}
async function references(path: string, additions = false) {
  const m = record(await readJson(path, 4 * 1024 * 1024), 'INVALID_HISTORY_MANIFEST');
  const arrays = ['events', 'issues', 'responses', 'receipts', 'observations'] as const;
  const expected = additions ? ['schema', ...arrays] : ['schema', 'job_spec', 'work', 'plan', 'publication', ...arrays, 'prior_cuts', 'cut'];
  exactKeys(m, expected, 'INVALID_HISTORY_MANIFEST_FIELDS');
  if (m.schema !== (additions ? 'useful-work.audit-clock-additions/v1' : 'useful-work.audit-clock-input/v1')) throw new Error('UNSUPPORTED_HISTORY_MANIFEST');
  const ref = (v: unknown) => { if (typeof v !== 'string' || !v) throw new Error('INVALID_HISTORY_INPUT_PATH'); return resolve(dirname(path), v); };
  const crossing = (v: unknown) => loadBundle(ref(v));
  const out: Record<string, any> = {};
  for (const field of [...arrays, ...(additions ? [] : ['prior_cuts'])]) {
    if (!Array.isArray(m[field])) throw new Error('INVALID_HISTORY_ARRAY');
    integer(m[field].length, 0, 1024, 'HISTORY_RECORD_COUNT_LIMIT'); out[field] = [];
    for (const v of m[field]) {
      if (field === 'issues') {
        const r = record(v, 'INVALID_ISSUE_REFS'); exactKeys(r, ['issuance', 'challenge'], 'INVALID_ISSUE_REFS');
        out[field].push({ issuance: await crossing(r.issuance), challenge: await crossing(r.challenge) });
      } else out[field].push(field === 'receipts' ? await readJson(ref(v), 1_000_000) : await crossing(v));
    }
  }
  if (!additions) Object.assign(out, { job_spec: parseJob(m.job_spec), work: await crossing(m.work), plan: await crossing(m.plan),
    publication: m.publication === null ? null : await crossing(m.publication), cut: m.cut === null ? null : await crossing(m.cut) });
  return out;
}
async function subprocess(path: string, args: string[]) {
  const code = await new Promise<number>((resolveCode, reject) => {
    const child = spawn(process.execPath, ['--experimental-strip-types', path, ...args], { stdio: 'inherit' });
    child.once('error', reject); child.once('close', code => resolveCode(code ?? 1));
  });
  if (code !== 0) throw new Error('CLOCK_DEMO_STEP_FAILED');
}
async function waitUntil(at: string) {
  const target = instant(at);
  while (Date.now() < target) await new Promise(resolveWait => setTimeout(resolveWait, Math.min(1000, target - Date.now())));
}
async function demo(jobPath: string, out: string, rounds: number, samples: number) {
  const requested = parseJob(await readJson(jobPath, 4096)); integer(samples, 1, Math.min(64, requested.width * requested.height), 'INVALID_SAMPLE_COUNT');
  await fresh(out);
  const extension = import.meta.url.endsWith('.js') ? 'js' : 'ts';
  await subprocess(fileURLToPath(new URL(`./cli_004.${extension}`, import.meta.url)), ['prepare', jobPath, '--out', join(out, 'prepared')]);
  const workPath = join(out, 'prepared/delivery/work.json'), context = await workAt(workPath);
  const [planner, provider, challenger, observer] = await Promise.all(Array.from({ length: 4 }, () => generateP256KeyPair()));
  await mkdir(join(out, 'local-state'), { mode: 0o700 });
  for (const [name, keys] of [['planner', planner], ['provider', provider], ['challenger', challenger], ['observer', observer]] as const)
    await json(join(out, 'local-state', name + '-key.json'), await crypto.subtle.exportKey('jwk', keys.privateKey), true);
  const policy: AuditPolicy = { schema: 'useful-work.audit-plan/v1', result_id: context.result_id, work_crossing_id: context.crossing.crossing_id,
    job_spec_hash: context.header.job_spec_hash, declared_at: now(), sample_count: samples, expires_at: '',
    schedule: { starts_at: iso(Date.now() + 500), cadence_ms: 25, rounds, issue_window_ms: Math.max(3000, rounds * 500), response_window_ms: 100 },
    randomness_rule: { schema: 'signed-external-event/v1', source_world: 'world:useful-work-demo-randomness-provider', public_key: provider.publicKeyJwk, stream_id: 'demo-cryptographic-random-events', first_sequence: 1 },
    challenge_rule: 'kernel-004-fixed-envelope-sha256-plan-slot-event/v1', challenger: { world_id: 'world:useful-work-scheduled-challenger', public_key: challenger.publicKeyJwk },
    observer: { world_id: 'world:useful-work-demo-clock-observer', public_key: observer.publicKeyJwk } };
  policy.expires_at = scheduleSlot(policy, rounds - 1).response_deadline;
  const plan = await publishPlan(policy, planner); await json(join(out, 'policy.json'), policy); await bundle(join(out, 'plan.json'), plan);
  await held(join(out, 'plan-receiver'), plan, policy.observer.world_id, CLOCK_CONTRACT);
  const publication = await observe(plan, 'PLAN_PUBLISHED', null, plan.crossing_id, observer, now()); await bundle(join(out, 'publication.json'), publication);
  const input: Omit<HistoryInput, 'cut'> = { job_spec: context.job, work: context.crossing, plan, publication, events: [], issues: [], responses: [], receipts: [], observations: [], prior_cuts: [] };
  await mkdir(join(out, 'snapshots')); await mkdir(join(out, 'clock-cuts'));
  let cut = await sealHistoryCut(input, observer, now());
  await bundle(join(out, 'clock-cuts/initial.json'), cut);
  await writeFile(join(out, 'snapshots/planned.json'), canonicalBytes(await createHistory({ ...input, cut })), { flag: 'wx' });
  input.prior_cuts.push(cut);
  const { answerNativeChallenge } = await import('./merkle_native/worker.ts');
  const { nativeTypescriptChecker } = await import('./merkle_native/typescript_checker.ts');
  const workerKeys = await readWorkerKeys(join(out, 'prepared/worker-state/private-key.json'));
  const artifact = await boundedRead(join(out, 'prepared/worker-state/result.json'), 16 * 1024 * 1024);
  const verifierKeys = [await generateP256KeyPair(), await generateP256KeyPair()], checkers = [nativeTypescriptChecker, nativePythonChecker()];
  const refs: Record<string, any> = { schema: 'useful-work.audit-clock-input/v1', job_spec: context.job, work: 'prepared/delivery/work.json', plan: 'plan.json',
    publication: 'publication.json', events: [], issues: [], responses: [], receipts: [], observations: [], prior_cuts: ['clock-cuts/initial.json'], cut: null };
  for (let i = 0; i < rounds - 1; i++) {
    const slot = scheduleSlot(policy, i); await waitUntil(slot.scheduled_at);
    const dir = join(out, 'slot-' + i); await mkdir(dir);
    // The separately signed provider runs in another process. The demo owns its
    // test keys; this is attributable provenance, not a claim of an external beacon.
    await subprocess(fileURLToPath(import.meta.url), ['randomness', join(out, 'plan.json'), '--slot', String(i), '--key', join(out, 'local-state/provider-key.json'), '--out', join(dir, 'randomness')]);
    const event = await loadBundle(join(dir, 'randomness/event.json'));
    input.events.push(event); refs.events.push(`slot-${i}/randomness/event.json`);
    const issue = await issueScheduledChallenge(context, plan, publication, event, challenger); input.issues.push(issue);
    await bundle(join(dir, 'issuance.json'), issue.issuance); await bundle(join(dir, 'challenge.json'), issue.challenge);
    refs.issues.push({ issuance: `slot-${i}/issuance.json`, challenge: `slot-${i}/challenge.json` });
    const seenIssue = await observe(plan, 'ISSUE_SEEN', i, issue.issuance.crossing_id, observer, now()); input.observations.push(seenIssue);
    await bundle(join(dir, 'issue-seen.json'), seenIssue); refs.observations.push(`slot-${i}/issue-seen.json`);
    if (i < rounds - 2) {
      const response = await answerNativeChallenge(context, issue.challenge, artifact, workerKeys, now()); input.responses.push(response);
      await bundle(join(dir, 'response.json'), response); refs.responses.push(`slot-${i}/response.json`);
      const seenResponse = await observe(plan, 'RESPONSE_SEEN', i, response.crossing_id, observer, now()); input.observations.push(seenResponse);
      await bundle(join(dir, 'response-seen.json'), seenResponse); refs.observations.push(`slot-${i}/response-seen.json`);
      for (let world = 0; world < 2; world++) {
        const label = world ? 'python' : 'typescript', report = await verifyNativeChallenge(context, issue.challenge, response, checkers[world]);
        const receipt = await nativeReceipt(report, verifierKeys[world], now(), { world_id: `world:useful-work-clock:${label}`, receiver_particular: `particular:useful-work-clock:${label}` });
        input.receipts.push(receipt); await json(join(dir, label + '-receipt.json'), receipt); refs.receipts.push(`slot-${i}/${label}-receipt.json`);
        await held(join(dir, label + '-receiver'), response, receipt.world_id, CLOCK_CONTRACT);
      }
    }
    console.log(JSON.stringify({ slot: i, challenge_id: issue.challenge.crossing_id, response_observed: i < rounds - 2 }));
  }
  cut = await sealHistoryCut(input, observer, now()); await bundle(join(out, 'clock-cuts/issued.json'), cut);
  await writeFile(join(out, 'snapshots/issued.json'), canonicalBytes(await createHistory({ ...input, cut })), { flag: 'wx' });
  input.prior_cuts.push(cut); refs.prior_cuts.push('clock-cuts/issued.json');
  console.log(JSON.stringify({ step: 'waiting-for-observer-deadline', expires_at: policy.expires_at, note: 'Elapsed response windows are not compute-time measurements.' }));
  await waitUntil(iso(instant(policy.expires_at) + 1));
  const unavailable = await observe(plan, 'UNAVAILABLE_REPORTED', rounds - 1, null, observer, now(), 'No event or issuance observed for this slot; no intent or computational verdict inferred.');
  input.observations.push(unavailable); await bundle(join(out, 'unknown-slot.json'), unavailable); refs.observations.push('unknown-slot.json');
  cut = await sealHistoryCut(input, observer, now()); await bundle(join(out, 'clock-cuts/final.json'), cut); refs.cut = 'clock-cuts/final.json';
  await json(join(out, 'history-input.json'), refs);
  await saveHistory(join(out, 'history'), await createHistory({ ...input, cut }));
}

async function main(args: string[]) {
  const command = args.shift(), inputs: string[] = [], flags: Record<string, string> = {};
  while (args.length && !args[0].startsWith('--')) inputs.push(resolve(args.shift()!));
  while (args.length) { const name = args.shift()!, value = args.shift(); if (Object.hasOwn(flags, name) || !value || value.startsWith('--')) throw new Error('INVALID_CLI_OPTIONS'); flags[name] = value; }
  const arity: Record<string, number> = { demo: 1, plan: 1, randomness: 1, issue: 4, observe: 1, collect: 1, snapshot: 1, append: 2, verify: 1 };
  if (!command || arity[command] !== inputs.length) throw new Error('Usage: useful-work-006 demo <job> | plan <policy> --key <planner-key> | randomness <plan> --slot <n> --key <provider-key> | issue <work> <plan> <publication> <event> --key <challenger-key> | observe <plan> --kind <kind> --key <observer-key> | collect <manifest> | snapshot <manifest> --key <observer-key> | append <history> <additions> --key <observer-key> | verify <history> [--crossing <bundle>] [--out <new-directory>]');
  const allowed = ['--out', ...(command === 'demo' ? ['--rounds', '--samples'] : []), ...(['plan', 'randomness', 'issue', 'observe', 'snapshot', 'append'].includes(command) ? ['--key'] : []),
    ...(['randomness', 'observe'].includes(command) ? ['--slot', '--at'] : []), ...(command === 'observe' ? ['--kind', '--subject', '--note'] : []), ...(command === 'verify' ? ['--crossing'] : [])];
  if (Object.keys(flags).some(f => !allowed.includes(f))) throw new Error('INVALID_CLI_OPTIONS');
  const out = resolve(flags['--out'] ?? `output/useful-work-006${command === 'demo' ? '' : '-' + command}`), at = flags['--at'] ?? now(); instant(at);
  const keys = async () => { if (!flags['--key']) throw new Error('SIGNING_KEY_REQUIRED'); return readWorkerKeys(resolve(flags['--key'])); };
  if (command === 'demo') return demo(inputs[0], out, integer(Number(flags['--rounds'] ?? '20'), 3, 64, 'INVALID_AUDIT_ROUNDS'), integer(Number(flags['--samples'] ?? '16'), 1, 64, 'INVALID_SAMPLE_COUNT'));
  if (command === 'plan') { const value = await publishPlan(await readJson(inputs[0], 100_000), await keys()); await fresh(out); await bundle(join(out, 'plan.json'), value); await held(join(out, 'receiver'), value, 'world:useful-work-plan-holder', CLOCK_CONTRACT); return; }
  if (command === 'randomness') { if (flags['--slot'] === undefined) throw new Error('SLOT_REQUIRED'); const value = await emitRandomness(await loadBundle(inputs[0]), Number(flags['--slot']), await keys(), at); await fresh(out); await bundle(join(out, 'event.json'), value); return; }
  if (command === 'issue') { const issue = await issueScheduledChallenge(await workAt(inputs[0]), await loadBundle(inputs[1]), await loadBundle(inputs[2]), await loadBundle(inputs[3]), await keys()); await fresh(out); await bundle(join(out, 'issuance.json'), issue.issuance); await bundle(join(out, 'challenge.json'), issue.challenge); return; }
  if (command === 'observe') {
    const p = await inspectPlan(await loadBundle(inputs[0])), kind = flags['--kind'] as ObservationKind;
    const value = await observe(p.plan, kind, flags['--slot'] === undefined ? null : Number(flags['--slot']), flags['--subject'] ?? (kind === 'PLAN_PUBLISHED' ? p.plan.crossing_id : null), await keys(), at, flags['--note'] ?? null);
    await fresh(out); await bundle(join(out, 'observation.json'), value); return;
  }
  if (command === 'collect' || command === 'snapshot') {
    const input = await references(inputs[0]) as HistoryInput;
    if (command === 'snapshot') { if (input.cut !== null) throw new Error('SNAPSHOT_REQUIRES_EMPTY_CUT_REF'); input.cut = await sealHistoryCut(input, await keys(), now()); }
    else if (input.cut === null) throw new Error('SIGNED_CUT_REQUIRED');
    return saveHistory(out, await createHistory(input));
  }
  if (command === 'append') {
    const { history } = await verifyHistory(await readJson(inputs[0])), additions = await references(inputs[1], true);
    const { schema: _, history_id: __, summary: ___, ...input } = history;
    for (const field of ['events', 'issues', 'responses', 'receipts', 'observations'] as const) input[field] = [...input[field], ...additions[field]];
    input.prior_cuts = [...input.prior_cuts, history.cut];
    const cut = await sealHistoryCut(input, await keys(), now());
    return saveHistory(out, await appendHistory(history, additions, cut));
  }
  const value = await readJson(inputs[0]), verified = flags['--crossing'] ? await verifyHistoryCrossing(await loadBundle(resolve(flags['--crossing'])), value) : await verifyHistory(value);
  return saveHistory(out, verified.history);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
