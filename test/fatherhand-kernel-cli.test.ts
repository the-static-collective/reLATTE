import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import test from 'node:test';

test('synthetic FatherHand kernel emits public-only network-free witness', () => {
  const script = resolve('scripts/fatherhand-kernel.ts');
  const run = spawnSync(
    process.execPath,
    ['--experimental-strip-types', script],
    { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } },
  );
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stderr, '');
  const report = JSON.parse(run.stdout);
  assert.equal(report.schema, 'webz.fatherhand-kernel-witness/v0');
  assert.equal(report.synthetic_only, true);
  assert.equal(report.network_used, false);
  assert.equal(report.all_root_handles_retired_before_report, true);
  assert.equal(report.recovery.total, 5);
  assert.equal(report.recovery.threshold, 3);
  assert.equal(report.recovery.genesis_secret_retired_before_recovery, true);
  assert.equal(report.recovery.two_share_recovery_refused, true);
  assert.equal(report.recovery.child_descendants_recovered_one_lineage, true);
  assert.equal(report.succession.old_and_new_signatures_verified, true);
  assert.equal(report.succession.fresh_recovery_total, 5);
  assert.equal(report.succession.fresh_recovery_threshold, 3);
  assert.equal(report.succession.fresh_recovery_set_issued, true);
  assert.equal(report.operational_delegation.verified, true);
  assert.equal(report.peer_trust.verified, true);
  assert.equal(report.peer_trust.tofu_used, false);
  assert.match(report.scope, /network-free/);

  const serialized = run.stdout;
  for (const forbidden of [
    '"d":',
    '"private_key":',
    '"share_bytes":',
    '"fragment_bytes":',
    '"seed_material":',
    '"recovery_payload":',
    '"secret_share":',
  ]) {
    assert.equal(serialized.includes(forbidden), false, 'public witness leaked ' + forbidden);
  }
});
