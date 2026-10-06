import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { verifyCrossingEnvelope, verifyReceipt } from '../src/index.ts';

const FIXTURES = join(process.cwd(), 'fixtures');
const PAYLOAD_SHA256 = '56376cad6f1c5f9b3bc671876dddeaf8ad63c90b2f162a11383b68561f51a82f';

async function fixture(name: string): Promise<any> {
  return JSON.parse(await readFile(join(FIXTURES, name), 'utf8'));
}

test('SB-001 binds one STATIC-OS particular to one signed crossing and separated authority domains', async () => {
  const sourceBytes = await readFile(join(FIXTURES, 'sb001-static-os-particular.json'));
  assert.equal(createHash('sha256').update(sourceBytes).digest('hex'), PAYLOAD_SHA256);

  const crossing = await fixture('sb001-signed-crossing.json');
  const release = await fixture('sb001-release-receipt.json');
  const unresolved = await fixture('sb001-unresolved-receipt.json');
  const admit = await fixture('sb001-admit-receipt.json');
  const exit = await fixture('sb001-exit-receipt.json');

  assert.equal(await verifyCrossingEnvelope(crossing), true);
  for (const receipt of [release, unresolved, admit, exit]) {
    assert.equal(await verifyReceipt(receipt), true);
    assert.equal(receipt.crossing_id, crossing.crossing_id);
    assert.equal(Object.prototype.hasOwnProperty.call(receipt.signing.public_key, 'd'), false);
  }

  assert.equal(crossing.payload_refs[0].address, `sha256:${PAYLOAD_SHA256}`);
  assert.equal(crossing.declared_kind, 'STATIC_OS_WHOLE_BODY_PARTICULAR');

  assert.equal(release.kind, 'SB001_RELEASE');
  assert.equal(release.extensions.supabardo.source_bytes_may_remain, true);
  assert.ok(release.residual_refs.includes(`sha256:${PAYLOAD_SHA256}`));

  assert.equal(unresolved.kind, 'SB001_UNRESOLVED_INTERVAL');
  assert.equal(unresolved.semantic_effect, 'none');
  assert.equal(unresolved.extensions.supabardo.state, 'OPEN');
  assert.equal(unresolved.extensions.supabardo.destination_disposition, null);
  assert.deepEqual(
    unresolved.extensions.supabardo.occurrence_classes,
    ['ENTER', 'FORM', 'WITNESS', 'WAIT'],
  );

  assert.equal(admit.kind, 'R3_ADMIT');
  assert.equal(admit.world_id, 'world:sb001-b');
  assert.equal(admit.extensions.local_receiver.disposition, 'ADMIT');
  assert.equal(
    admit.extensions.local_receiver.supabardo_unresolved_receipt_id,
    unresolved.receipt_id,
  );

  assert.equal(exit.kind, 'SB001_EXIT');
  assert.equal(exit.semantic_effect, 'none');
  assert.equal(exit.pre_state_ref, unresolved.receipt_id);
  assert.equal(exit.post_state_ref, admit.receipt_id);
  assert.equal(
    exit.extensions.supabardo.destination_disposition_receipt_id,
    admit.receipt_id,
  );

  assert.deepEqual(crossing.signing.public_key, release.signing.public_key);
  assert.deepEqual(unresolved.signing.public_key, exit.signing.public_key);
  assert.notDeepEqual(crossing.signing.public_key, unresolved.signing.public_key);
  assert.notDeepEqual(crossing.signing.public_key, admit.signing.public_key);
  assert.notDeepEqual(unresolved.signing.public_key, admit.signing.public_key);
});

test('SB-001 remains reconstructible after the entire transient Bardo state is killed', async () => {
  const base = await mkdtemp(join(tmpdir(), 'supabardo-sb001-'));
  const bardoRoot = join(base, 'bardo');
  const archiveRoot = join(base, 'durable');
  try {
    await mkdir(bardoRoot, { recursive: true });
    await mkdir(archiveRoot, { recursive: true });

    const crossing = await fixture('sb001-signed-crossing.json');
    const release = await fixture('sb001-release-receipt.json');
    const unresolved = await fixture('sb001-unresolved-receipt.json');
    const admit = await fixture('sb001-admit-receipt.json');
    const exit = await fixture('sb001-exit-receipt.json');

    await writeFile(
      join(bardoRoot, 'field.json'),
      JSON.stringify({
        crossing_id: crossing.crossing_id,
        state: 'OPEN',
        occurrences: ['ENTER', 'FORM', 'WITNESS', 'WAIT', 'EXIT'],
        destination_meaning: null,
      }, null, 2) + '\n',
      'utf8',
    );

    await writeFile(
      join(archiveRoot, 'history.json'),
      JSON.stringify({ crossing, release, unresolved, admit, exit }, null, 2) + '\n',
      'utf8',
    );

    await rm(bardoRoot, { recursive: true, force: true });
    await assert.rejects(() => access(bardoRoot));

    const history = JSON.parse(await readFile(join(archiveRoot, 'history.json'), 'utf8'));
    assert.equal(await verifyCrossingEnvelope(history.crossing), true);
    for (const receipt of [history.release, history.unresolved, history.admit, history.exit]) {
      assert.equal(await verifyReceipt(receipt), true);
    }

    assert.equal(history.release.post_state_ref, history.crossing.crossing_id);
    assert.equal(history.unresolved.pre_state_ref, history.release.receipt_id);
    assert.equal(history.admit.extensions.local_receiver.supabardo_unresolved_receipt_id, history.unresolved.receipt_id);
    assert.equal(history.exit.pre_state_ref, history.unresolved.receipt_id);
    assert.equal(history.exit.post_state_ref, history.admit.receipt_id);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('SB-001 refuses retroactive meaning manufacture', async () => {
  const unresolved = await fixture('sb001-unresolved-receipt.json');
  const forgedWait = structuredClone(unresolved);
  forgedWait.extensions.supabardo.destination_disposition = 'ADMIT';
  assert.equal(await verifyReceipt(forgedWait), false);

  const admit = await fixture('sb001-admit-receipt.json');
  const forgedAuthority = structuredClone(admit);
  forgedAuthority.world_id = 'supabardo:sb001';
  assert.equal(await verifyReceipt(forgedAuthority), false);
});
