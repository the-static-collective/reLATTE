import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalBytes } from './job.ts';
import { boundedRead, fresh, json } from './cli_io.ts';
import { verifyFieldDelivery } from './field_test/archive.ts';
async function main(args: string[]) {
  const command = args.shift(), input = args.shift(); let out: string | undefined;
  if (args.length) { if (args.shift() !== '--out' || !(out = args.shift()) || args.length) throw new Error('INVALID_FIELD_CLI_OPTIONS'); }
  if (!['run', 'verify'].includes(command ?? '') || !input) throw new Error('Usage: useful-work-field-001 run <job.json> | verify <public-field.json> [--out <new-directory>]');
  const value = JSON.parse((await boundedRead(resolve(input), command === 'run' ? 4096 : 192 * 1024 * 1024)).toString('utf8'));
  const destination = resolve(out ?? `output/useful-work-field-001${command === 'verify' ? '-verified' : ''}`);
  let delivery: Awaited<ReturnType<typeof verifyFieldDelivery>>;
  if (command === 'run') delivery = (await (await import('../../examples/useful-work-field-001/run.ts')).runField(value, destination)).delivery;
  else {
    delivery = await verifyFieldDelivery(value); await fresh(destination);
    await writeFile(join(destination, 'field.json'), canonicalBytes(delivery), { flag: 'wx' }); await json(join(destination, 'summary.json'), delivery.archive.summary);
  }
  console.log(JSON.stringify({ field_id: delivery.archive.field_id, decision: delivery.archive.summary.kernel_trace['010'].choice,
    B_value: delivery.archive.summary.observations.B_local_value, D_value: delivery.archive.summary.observations.D_local_value,
    external_ledger_after: delivery.archive.summary.observations.external_ledger_after,
    contradictions: delivery.archive.summary.kernel_trace['005'].contradictions.length, expired_service_slots: delivery.archive.summary.observations.expired_service_slots,
    winner_selected: false, output: destination }, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
