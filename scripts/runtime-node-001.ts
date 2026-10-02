import { writeFile } from 'node:fs/promises';

import { ReLatteRuntime } from '../src/runtime.ts';

const root = process.env.RELATTE_RUNTIME_ROOT;
if (!root) throw new Error('RELATTE_RUNTIME_ROOT is required');

const bootAt = process.env.RELATTE_RUNTIME_BOOT_AT ?? new Date().toISOString();
const haltMarker = process.env.RELATTE_RUNTIME_TEST_HALT_AFTER_RECEIVE_FILE ?? null;

const runtime = await ReLatteRuntime.open({
  root,
  created_at: bootAt,
});

let stopping = false;
process.on('SIGTERM', () => {
  stopping = true;
});
process.on('SIGINT', () => {
  stopping = true;
});

while (!stopping) {
  const now = new Date().toISOString();
  const pulse = await runtime.pulseOne({
    claimed_at: now,
    received_at: now,
    committed_at: now,
    after_receive: haltMarker
      ? async ({ queue_item, receive_receipt }) => {
          await writeFile(
            haltMarker,
            JSON.stringify({
              schema: 'relatte.runtime-black-flag-halt-marker/v0',
              queue_item_id: queue_item.queue_item_id,
              crossing_id: queue_item.crossing_id,
              receive_receipt_id: receive_receipt.receipt_id,
            }, null, 2) + '\n',
            'utf8',
          );
          await new Promise<void>(() => {});
        }
      : undefined,
  });

  if (pulse.status === 'idle') {
    await new Promise((resolve) =>
      setTimeout(resolve, runtime.manifest.runtime.pulse_interval_ms)
    );
  }
}
