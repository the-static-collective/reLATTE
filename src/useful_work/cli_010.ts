import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateP256KeyPair } from '../protocol.ts';
import { verifyAndExtractTransportFrame } from '../transport.ts';
import { boundedRead, bundle, fresh, held, json, now, readWorkerKeys } from './cli_io.ts';
import { createEvidence } from './settlement/evidence.ts';
import { decide, inspectOffer, presentEvidence, publishOffer, verifyExchange } from './settlement/exchange.ts';
import type { DecisionKind, ExchangeBundle } from './settlement/exchange.ts';
import { observeSettlement, recordHash, replaySettlement } from './settlement/observation.ts';
import { createSettlementBundle, verifySettlementBundle } from './settlement/bundle.ts';
import { LIMIT, SETTLEMENT_CONTRACT, signer } from './settlement/wire.ts';
import type { Wire } from './settlement/wire.ts';

const read = async (path: string) => JSON.parse((await boundedRead(path, LIMIT)).toString('utf8'));
async function crossing(path: string) { const v = await read(path); return v.transport === 'file-bundle' ? verifyAndExtractTransportFrame(v) : v; }
async function save(out: string, name: string, value: unknown) { await fresh(out); await json(join(out, name), value); }
async function demo(out: string) {
  // Demo-only dependencies are absent from portable replay paths.
  const { spawn } = await import('node:child_process');
  const { createContext } = await import('./valuation/context.ts');
  const { evaluate } = await import('./valuation/evaluator.ts');
  const { policyId } = await import('./valuation/policy.ts');
  const { rational } = await import('./valuation/rational.ts');
  await fresh(out);
  const fixturePath = import.meta.url.endsWith('.js') ? '../../../fixtures/useful-work-009-golden.json' : '../../fixtures/useful-work-009-golden.json';
  const resources = (await read(fileURLToPath(new URL(fixturePath, import.meta.url)))).bundle;
  const [offerer, presenter, adapter, replayer, valuer] = await Promise.all(Array.from({ length: 5 }, () => generateP256KeyPair()));
  const context = await createContext({ result_id: resources.summary.result_id, job_spec: resources.job_spec, work: resources.work,
    audit: null, history: null, resource_claims: [], canonical_artifact: null });
  const valuationPolicy = { schema: 'useful-work.valuation-policy/v1' as const, algorithm: 'rational-linear-discount/v1' as const,
    policy_name: 'demo-local-entry-value', policy_version: 1, unit: 'demo-credit', allow_self_reported_resources: false,
    terms: [{ metric: 'result_entries' as const, weight: rational(1, 256), cap: null, missing: 'reject' as const }], uncertainty_discounts: [] };
  const valuation = await evaluate(context, valuationPolicy, valuer, now(), { world_id: 'world:offer-demo-valuer', particular: 'particular:offer-demo-valuer' });
  const evidenceInput = { result_id: resources.summary.result_id, job_spec: resources.job_spec, work: resources.work,
    audit: null, audit_history: null, service_history: null, resources, valuations: [valuation] };
  const evidence = await createEvidence(evidenceInput);
  const cpu = resources.observations.find((e: Wire) => e.measurement.extensions.organ_adapter.artifact_kind === 'resource-cpu');
  const transfer = { kind: 'credit-ledger' as const, system_ref: 'external:demo-credit-ledger', asset_ref: 'asset:demonstration-credit',
    unit: 'demo-credit', amount: rational(12), from_ref: 'demo-account:offerer', to_ref: 'demo-account:presenter' };
  const terms = { description: 'I will provide 12 local demonstration credits for evidence admitted by this policy.', transfer,
    policy: { schema: 'useful-work.acceptance-policy/v1' as const, algorithm: 'typed-evidence-all/v1' as const, name: 'demo-admit-cpu-observation-and-local-valuation', clauses: [
      { kind: 'resource' as const, collector: signer(cpu.measurement), replayer: signer(cpu.receipt), metric: 'cpu_time_observed' as const,
        minimum: rational(1), maximum: null, allowed_capture_modes: ['live-local/v1'], allowed_reading_origins: [] },
      { kind: 'valuation' as const, evaluator: { world_id: 'world:offer-demo-valuer', public_key: valuer.publicKeyJwk },
        policy_id: policyId(valuationPolicy), unit: 'demo-credit', minimum_amount: rational(12) }] },
    present_before: new Date(Date.now() + 120_000).toISOString(), eligible_presenter: { world_id: 'world:offer-demo-presenter', public_key: presenter.publicKeyJwk },
    target: { result_id: evidence.result_id, work_crossing_id: evidence.work.crossing_id, job_spec_hash: context.work.extensions.organ_adapter.donor_claims.result_header.job_spec_hash },
    settlement_adapter: { identity: { world_id: 'world:offer-demo-ledger-adapter', public_key: adapter.publicKeyJwk }, allowed_record_origins: ['operator-import/v1' as const] } };
  const offer = await publishOffer(terms, offerer, 'world:offer-demo-offerer', now());
  const presentation = await presentEvidence(offer, evidence, presenter, 'world:offer-demo-presenter', now()), observedAt = now();
  const decision = await decide(offer, evidence, presentation, 'ACCEPT', observedAt, 'Local policy and observation window passed.', offerer, 'world:offer-demo-offerer', now());
  const exchange: ExchangeBundle = { schema: 'useful-work.offer-exchange/v1', offer, evidence, presentation, decision };
  await json(join(out, 'evidence-input.json'), evidenceInput); await json(join(out, 'evidence.json'), evidence);
  await json(join(out, 'offer-terms.json'), terms); await bundle(join(out, 'offer.json'), offer, 'Useful Work Kernel 010');
  await bundle(join(out, 'presentation.json'), presentation); await json(join(out, 'exchange.json'), exchange);
  for (const choice of ['HOLD', 'REJECT'] as const) await json(join(out, choice.toLowerCase() + '-exchange.json'), { ...exchange,
    decision: await decide(offer, evidence, presentation, choice, observedAt, 'Local discretion; no external transfer implied.', offerer, 'world:offer-demo-offerer', now()) });
  await mkdir(join(out, 'local-state'), { mode: 0o700 });
  for (const [name, key] of Object.entries({ offerer, presenter, adapter, replayer })) await json(join(out, 'local-state', name + '-key.json'), await crypto.subtle.exportKey('jwk', key.privateKey), true);
  const extension = import.meta.url.endsWith('.js') ? 'js' : 'ts', ledgerProgram = fileURLToPath(new URL(`../../examples/useful-work-010/demo-ledger.${extension}`, import.meta.url));
  const runLedger = (args: string[]) => new Promise<string>((yes, no) => {
    const p = spawn(process.execPath, ['--experimental-strip-types', ledgerProgram, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = ''; p.stdout.on('data', b => stdout += b); p.stderr.on('data', b => stderr += b);
    p.once('error', no); p.once('close', code => code === 0 ? yes(stdout) : no(new Error('EXTERNAL_DEMO_LEDGER_FAILED: ' + stderr)));
  });
  const ledgerPath = join(out, 'local-state/external-demo-ledger.json'); await runLedger(['init', ledgerPath]);
  const entry = JSON.parse(await runLedger(['transfer', ledgerPath, 'demo-entry-1', '12']));
  const record = { transfer, record_ref: entry.entry_ref, observed_at: now(),
    provenance: { record_origin: 'operator-import/v1' as const, provider_ref: 'external:demo-credit-ledger', adapter_version: 'demo-ledger-reader/v1',
      record_sha256: recordHash({ transfer, record_ref: entry.entry_ref, evidence: { entry_ref: entry.entry_ref, debit: entry.debit, credit: entry.credit } }) },
    evidence: { entry_ref: entry.entry_ref, debit: entry.debit, credit: entry.credit } };
  const observation = await observeSettlement(exchange, record, adapter, 'world:offer-demo-ledger-adapter', now());
  const receipt = await replaySettlement(exchange, observation, replayer, 'world:offer-demo-settlement-replayer', now());
  const input = { exchange, observations: [{ observation, receipt }] }, saved = await createSettlementBundle(input);
  await json(join(out, 'external-record.json'), record); await json(join(out, 'observation.json'), observation); await json(join(out, 'receipt.json'), receipt);
  await json(join(out, 'settlement-input.json'), input); await json(join(out, 'settlement.json'), saved); await json(join(out, 'summary.json'), saved.summary);
  await json(join(out, 'demo-provenance.json'), { resource_observations: 'replayed-public-009-fixture', valuation: 'new-local-007-opinion',
    external_action: 'separate-example-process-changed-local-demo-ledger', financial_payment_performed: false, resource_transfer_performed: false,
    demo_controls_all_new_keys: true, organizational_independence_verified: false });
  await held(join(out, 'receiver'), offer, 'world:offer-demo-holder', SETTLEMENT_CONTRACT);
  console.log(JSON.stringify({ decision: saved.summary.decision, settlement_observations: saved.summary.unique_observations,
    terms_match: saved.summary.observations[0].terms_match, transfer_performed_by_relatte: false, output: out }, null, 2));
}
async function main(args: string[]) {
  const command = args.shift(), paths: string[] = [], flags: Record<string, string> = {};
  while (args.length && !args[0].startsWith('--')) paths.push(resolve(args.shift()!));
  while (args.length) { const f = args.shift()!, v = args.shift(); if (!f.startsWith('--') || !v || v.startsWith('--') || Object.hasOwn(flags, f)) throw new Error('INVALID_CLI_OPTIONS'); flags[f] = v; }
  const arity: Record<string, number> = { demo: 0, evidence: 1, offer: 1, present: 2, decide: 3, observe: 2, replay: 2, collect: 1, verify: 1, 'verify-exchange': 1 };
  if (!command || arity[command] !== paths.length) throw new Error('Usage: useful-work-010 demo | evidence <input> | offer <terms> | present <offer> <evidence> | decide <offer> <evidence> <presentation> --choice ACCEPT|HOLD|REJECT --observed-at <UTC> --reason <text> | observe <exchange> <external-record> | replay <exchange> <observation> | collect <input> | verify <settlement> | verify-exchange <exchange>. Signing commands require --key <private-jwk> --world <world>; all commands accept --out <new-directory>.');
  const signing = ['offer', 'present', 'decide', 'observe', 'replay'].includes(command);
  const allowed = ['--out', ...(signing ? ['--key', '--world'] : []), ...(command === 'decide' ? ['--choice', '--observed-at', '--reason'] : [])];
  if (Object.keys(flags).some(f => !allowed.includes(f)) || (signing && (!flags['--key'] || !flags['--world']))) throw new Error('INVALID_CLI_OPTIONS');
  const out = resolve(flags['--out'] ?? `output/useful-work-010${command === 'demo' ? '' : '-' + command}`);
  if (command === 'demo') return demo(out);
  if (command === 'evidence') return save(out, 'evidence.json', await createEvidence(await read(paths[0])));
  if (command === 'verify-exchange') return save(out, 'exchange.json', (await verifyExchange(await read(paths[0]))).bundle);
  if (command === 'collect' || command === 'verify') {
    const b = command === 'collect' ? await createSettlementBundle(await read(paths[0])) : await verifySettlementBundle(await read(paths[0]));
    await save(out, 'settlement.json', b); await json(join(out, 'summary.json'), b.summary);
    console.log(JSON.stringify({ bundle_id: b.bundle_id, decision: b.summary.decision, observations: b.summary.unique_observations, output: out })); return;
  }
  const keys = await readWorkerKeys(resolve(flags['--key'])), world = flags['--world'];
  if (command === 'offer') { const o = await publishOffer(await read(paths[0]), keys, world, now()); await inspectOffer(o); await fresh(out); return bundle(join(out, 'offer.json'), o); }
  if (command === 'present') { const p = await presentEvidence(await crossing(paths[0]), await read(paths[1]), keys, world, now()); await fresh(out); return bundle(join(out, 'presentation.json'), p); }
  if (command === 'decide') {
    if (!flags['--choice'] || !flags['--observed-at'] || !flags['--reason']) throw new Error('DECISION_OPTIONS_REQUIRED');
    const offer = await crossing(paths[0]), evidence = await read(paths[1]), presentation = await crossing(paths[2]);
    const decision = await decide(offer, evidence, presentation, flags['--choice'] as DecisionKind, flags['--observed-at'], flags['--reason'], keys, world, now());
    return save(out, 'exchange.json', { schema: 'useful-work.offer-exchange/v1', offer, evidence, presentation, decision });
  }
  if (command === 'observe') return save(out, 'observation.json', await observeSettlement(await read(paths[0]), await read(paths[1]), keys, world, now()));
  if (command === 'replay') return save(out, 'receipt.json', await replaySettlement(await read(paths[0]), await crossing(paths[1]), keys, world, now()));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).catch(e => { console.error(e.message); process.exitCode = 1; });
