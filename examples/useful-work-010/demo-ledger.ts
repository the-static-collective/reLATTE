// A separate, deliberately tiny demo ledger. It imports no reLATTE code.
// This file changes local demonstration balances, not money or enforceable rights.
import { readFile, rename, writeFile } from 'node:fs/promises';
const [command, path, entryRef, quantity] = process.argv.slice(2);
if (!path) throw new Error('DEMO_LEDGER_PATH_REQUIRED');
if (command === 'init') {
  await writeFile(path, JSON.stringify({ schema: 'external.demo-ledger/v1', balances: { offerer: '100', presenter: '0' }, entries: {} }), { flag: 'wx', mode: 0o600 });
} else if (command === 'transfer') {
  if (!entryRef || !/^[1-9][0-9]{0,5}$/.test(quantity ?? '')) throw new Error('INVALID_DEMO_LEDGER_TRANSFER');
  const ledger = JSON.parse(await readFile(path, 'utf8')), amount = BigInt(quantity);
  if (ledger.schema !== 'external.demo-ledger/v1') throw new Error('INVALID_DEMO_LEDGER');
  if (Object.hasOwn(ledger.entries, entryRef)) {
    if (ledger.entries[entryRef].quantity !== quantity) throw new Error('DEMO_LEDGER_ENTRY_CONFLICT');
    console.log(JSON.stringify(ledger.entries[entryRef]));
  } else {
    const from = BigInt(ledger.balances.offerer), to = BigInt(ledger.balances.presenter);
    if (from < amount) throw new Error('INSUFFICIENT_DEMO_CREDITS');
    const fraction = (n: bigint) => ({ numerator: n.toString(), denominator: '1' });
    const record = { schema: 'external.demo-ledger-entry/v1', entry_ref: entryRef, quantity,
      debit: { account_ref: 'demo-account:offerer', before: fraction(from), after: fraction(from - amount) },
      credit: { account_ref: 'demo-account:presenter', before: fraction(to), after: fraction(to + amount) } };
    ledger.balances = { offerer: (from - amount).toString(), presenter: (to + amount).toString() };
    ledger.entries[entryRef] = record;
    const temporary = path + '.pending'; await writeFile(temporary, JSON.stringify(ledger), { flag: 'wx', mode: 0o600 }); await rename(temporary, path);
    console.log(JSON.stringify(record));
  }
} else throw new Error('Usage: demo-ledger init <path> | transfer <path> <entry-ref> <positive-integer-credits>');
