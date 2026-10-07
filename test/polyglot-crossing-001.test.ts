import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

import {
  generateP256KeyPair,
  verifyCrossingEnvelope,
  verifyReceipt,
} from '../src/protocol.ts';
import {
  FROZEN_CORE_SHA,
  assertObservationBytes,
  makePolyglotHop,
  verifyHopBinding,
  type AdapterObservation,
  type LocalDisposition,
  type PolyglotHop,
} from '../experiments/polyglot-crossing-001/common.ts';
import { observeGit } from '../experiments/polyglot-crossing-001/git-adapter.ts';
import { observeFilesystem } from '../experiments/polyglot-crossing-001/filesystem-adapter.ts';
import { observeSqlite } from '../experiments/polyglot-crossing-001/sqlite-adapter.ts';
import { observeHttp } from '../experiments/polyglot-crossing-001/http-adapter.ts';
import { observeSignedJson } from '../experiments/polyglot-crossing-001/signed-json-adapter.ts';
import {
  makePrintableCarrier,
  observePrintableCarrier,
} from '../experiments/polyglot-crossing-001/physical-carrier-adapter.ts';

const PAYLOAD = Buffer.from(
  JSON.stringify({
    schema: 'static.polyglot-seed/v0',
    particular: 'playdough-lego-001',
    message: 'same payload; incompatible native identity models',
  }),
  'utf8',
);

async function hop(
  observation: AdapterObservation,
  parent: string | null,
  disposition: LocalDisposition,
  index: number,
): Promise<PolyglotHop> {
  return makePolyglotHop({
    observation,
    signer: await generateP256KeyPair(),
    receiver: await generateP256KeyPair(),
    parent_crossing_id: parent,
    disposition,
    hop_index: index,
  });
}

test('POLYGLOT-CROSSING-001: normative src core is unchanged from frozen SHA', () => {
  const changed = execFileSync(
    'git',
    ['diff', '--name-only', FROZEN_CORE_SHA, 'HEAD', '--', 'src'],
    { encoding: 'utf8' },
  ).trim();

  assert.equal(changed, '');
});

test('POLYGLOT-CROSSING-001: six alien substrates preserve bytes without collapsing native particulars', async () => {
  const git = await observeGit(PAYLOAD);
  const filesystem = await observeFilesystem(PAYLOAD);
  const sqlite = await observeSqlite(PAYLOAD);
  const http = await observeHttp(PAYLOAD);

  try {
    const signedJson = await observeSignedJson(PAYLOAD);
    const physical = observePrintableCarrier(makePrintableCarrier(PAYLOAD));

    const observations = [
      git.observation,
      filesystem.observation,
      sqlite.observation,
      http.observation,
      signedJson,
      physical,
    ];

    for (const value of observations) assertObservationBytes(value, PAYLOAD);

    assert.equal(new Set(observations.map((value) => value.content_sha256)).size, 1);
    assert.equal(new Set(observations.map((value) => value.native_id)).size, 6);
    assert.deepEqual(
      observations.map((value) => value.substrate),
      ['git', 'filesystem', 'sqlite', 'http', 'signed-json', 'physical-carrier'],
    );
  } finally {
    await Promise.all([
      git.cleanup(),
      filesystem.cleanup(),
      sqlite.cleanup(),
      http.cleanup(),
    ]);
  }
});

test('POLYGLOT-CROSSING-001: one crossing grammar chains all six worlds with local-only decisions', async () => {
  const git = await observeGit(PAYLOAD);
  const filesystem = await observeFilesystem(PAYLOAD);
  const sqlite = await observeSqlite(PAYLOAD);
  const http = await observeHttp(PAYLOAD);

  let hops: PolyglotHop[] = [];
  try {
    const observations = [
      git.observation,
      filesystem.observation,
      sqlite.observation,
      http.observation,
      await observeSignedJson(PAYLOAD),
      observePrintableCarrier(makePrintableCarrier(PAYLOAD)),
    ];
    const dispositions: LocalDisposition[] = [
      'R3_ADMIT',
      'R3_HOLD',
      'R3_REFUSE',
      'RETURN',
      'R3_ADMIT',
      'R3_HOLD',
    ];

    let parent: string | null = null;
    for (let index = 0; index < observations.length; index += 1) {
      const current = await hop(observations[index]!, parent, dispositions[index]!, index);
      verifyHopBinding(current, PAYLOAD);
      hops.push(current);
      parent = current.crossing.crossing_id;
    }

    assert.equal(hops.length, 6);
    assert.deepEqual(hops.map((value) => value.disposition), dispositions);

    for (let index = 0; index < hops.length; index += 1) {
      const current = hops[index]!;
      assert.equal(await verifyCrossingEnvelope(current.crossing), true);
      assert.equal(await verifyReceipt(current.receipt), true);
      assert.equal(
        current.crossing.extensions.polyglot_crossing_001.frozen_core_sha,
        FROZEN_CORE_SHA,
      );
      assert.equal(
        current.crossing.extensions.polyglot_crossing_001.adapter_only,
        true,
      );
      assert.equal(current.crossing.requested_effect.authority, 'receiver-local');
      assert.equal(current.crossing.capability_ref, null);
      assert.equal(
        current.receipt.extensions.polyglot_crossing_001.authority_scope,
        'THIS_RECEIVER_ONLY',
      );

      if (index === 0) {
        assert.deepEqual(current.crossing.parents, []);
      } else {
        assert.deepEqual(
          current.crossing.parents,
          [hops[index - 1]!.crossing.crossing_id],
        );
      }
    }

    assert.equal(
      new Set(hops.map((value) => value.observation.content_sha256)).size,
      1,
    );
    assert.equal(
      new Set(hops.map((value) => value.crossing.source_particular)).size,
      6,
    );

    // Admission in one world cannot force admission in the next.
    assert.equal(hops[0]!.disposition, 'R3_ADMIT');
    assert.equal(hops[1]!.disposition, 'R3_HOLD');
    assert.equal(hops[2]!.disposition, 'R3_REFUSE');
  } finally {
    await Promise.all([
      git.cleanup(),
      filesystem.cleanup(),
      sqlite.cleanup(),
      http.cleanup(),
    ]);
  }

  // Native substrate state is gone. Durable public crossing/receipt evidence
  // must still reconstruct the exact route.
  const publicEvidence = JSON.parse(JSON.stringify(
    hops.map((value) => ({
      crossing: value.crossing,
      receipt: value.receipt,
      substrate: value.observation.substrate,
      native_id: value.observation.native_id,
      content_sha256: value.observation.content_sha256,
    })),
  )) as Array<Record<string, any>>;

  assert.equal(publicEvidence.length, 6);
  for (let index = 0; index < publicEvidence.length; index += 1) {
    const current = publicEvidence[index]!;
    assert.equal(await verifyCrossingEnvelope(current.crossing), true);
    assert.equal(await verifyReceipt(current.receipt), true);
    assert.equal(current.receipt.crossing_id, current.crossing.crossing_id);
    if (index > 0) {
      assert.deepEqual(
        current.crossing.parents,
        [publicEvidence[index - 1]!.crossing.crossing_id],
      );
    }
  }
});

test('POLYGLOT-CROSSING-001: adapter byte lies fail before becoming continuity evidence', async () => {
  const filesystem = await observeFilesystem(PAYLOAD);
  try {
    const lied = structuredClone(filesystem.observation);
    lied.observed_bytes = Buffer.from('different bytes', 'utf8');

    assert.throws(
      () => assertObservationBytes(lied, PAYLOAD),
      /ADAPTER_BYTES_CHANGED/,
    );
  } finally {
    await filesystem.cleanup();
  }
});

test('POLYGLOT-CROSSING-001: adapter identity substitution is not hidden by equal bytes', async () => {
  const filesystem = await observeFilesystem(PAYLOAD);
  try {
    const current = await hop(filesystem.observation, null, 'R3_HOLD', 0);
    const substituted = structuredClone(current);
    substituted.observation.native_id = 'fs:invented-other-particular';

    assert.throws(
      () => verifyHopBinding(substituted, PAYLOAD),
      /POLYGLOT_ADAPTER_BINDING_MISMATCH/,
    );
  } finally {
    await filesystem.cleanup();
  }
});

test('POLYGLOT-CROSSING-001: receipt replay against another substrate crossing is rejected by binding', async () => {
  const git = await observeGit(PAYLOAD);
  const filesystem = await observeFilesystem(PAYLOAD);
  try {
    const first = await hop(git.observation, null, 'R3_ADMIT', 0);
    const second = await hop(
      filesystem.observation,
      first.crossing.crossing_id,
      'R3_HOLD',
      1,
    );

    assert.equal(await verifyReceipt(first.receipt), true);
    assert.equal(await verifyCrossingEnvelope(second.crossing), true);
    assert.notEqual(first.receipt.crossing_id, second.crossing.crossing_id);
    assert.throws(
      () => verifyHopBinding({ ...second, receipt: first.receipt }, PAYLOAD),
      /POLYGLOT_RECEIPT_CROSSING_MISMATCH/,
    );
  } finally {
    await Promise.all([git.cleanup(), filesystem.cleanup()]);
  }
});

test('POLYGLOT-CROSSING-001: printable carrier detects a one-character payload mutation', () => {
  const card = makePrintableCarrier(PAYLOAD);
  const marker = 'base64url:';
  const start = card.indexOf(marker) + marker.length;
  const original = card[start]!;
  const replacement = original === 'A' ? 'B' : 'A';
  const tampered = card.slice(0, start) + replacement + card.slice(start + 1);

  assert.throws(
    () => observePrintableCarrier(tampered),
    /PRINTABLE_CARRIER_INTEGRITY_FAILURE/,
  );
});
