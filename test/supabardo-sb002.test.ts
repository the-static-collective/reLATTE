import assert from 'node:assert/strict';
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  generateP256KeyPair,
  sealCrossingEnvelope,
  sealReceipt,
  verifyCrossingEnvelope,
  verifyReceipt,
} from '../src/index.ts';
import {
  SB002_PINNED_EVIDENCE_SET_ID,
  computeSb002EvidenceSetId,
  verifyPinnedSb002EvidenceSet,
  verifySb002Bundle,
} from '../scripts/sb002-verify.ts';

const F = join(process.cwd(), 'fixtures');

async function fixture(name: string): Promise<any> {
  return JSON.parse(await readFile(join(F, name), 'utf8'));
}

async function pinnedBundle() {
  return {
    proposal_bytes: await readFile(join(F, 'sb002-toaster-proposal.json')),
    crossing: await fixture('sb002-signed-crossing.json'),
    release: await fixture('sb002-release-receipt.json'),
    unresolved: await fixture('sb002-unresolved-receipt.json'),
    disposition: await fixture('sb002-hold-receipt.json'),
    exit: await fixture('sb002-exit-receipt.json'),
  };
}

function crossingDraft(value: any): any {
  const { crossing_id: _id, signing: _signing, ...draft } = value;
  return structuredClone(draft);
}
function receiptDraft(value: any): any {
  const { receipt_id: _id, signing: _signing, ...draft } = value;
  return structuredClone(draft);
}

async function freshBundle() {
  const pinned = await pinnedBundle();
  const sourceKeys = await generateP256KeyPair();
  const bardoKeys = await generateP256KeyPair();
  const destinationKeys = await generateP256KeyPair();

  const crossing = await sealCrossingEnvelope(crossingDraft(pinned.crossing), sourceKeys);
  const releaseDraft = receiptDraft(pinned.release);
  releaseDraft.crossing_id = crossing.crossing_id;
  releaseDraft.post_state_ref = crossing.crossing_id;
  const release = await sealReceipt(releaseDraft, sourceKeys);

  const waitDraft = receiptDraft(pinned.unresolved);
  waitDraft.crossing_id = crossing.crossing_id;
  waitDraft.pre_state_ref = release.receipt_id;
  waitDraft.post_state_ref = crossing.crossing_id;
  const unresolved = await sealReceipt(waitDraft, bardoKeys);

  const dispositionDraft = receiptDraft(pinned.disposition);
  dispositionDraft.crossing_id = crossing.crossing_id;
  dispositionDraft.extensions.local_receiver.supabardo_unresolved_receipt_id =
    unresolved.receipt_id;
  const disposition = await sealReceipt(dispositionDraft, destinationKeys);

  const exitDraft = receiptDraft(pinned.exit);
  exitDraft.crossing_id = crossing.crossing_id;
  exitDraft.pre_state_ref = unresolved.receipt_id;
  exitDraft.post_state_ref = disposition.receipt_id;
  exitDraft.extensions.supabardo.destination_disposition_receipt_id =
    disposition.receipt_id;
  const exit = await sealReceipt(exitDraft, bardoKeys);

  return {
    ...pinned,
    sourceKeys,
    bardoKeys,
    destinationKeys,
    crossing,
    release,
    unresolved,
    disposition,
    exit,
  };
}

test('SB-002 exact creative proposal crossing verifies', async () => {
  const b = await pinnedBundle();
  assert.equal(await verifyCrossingEnvelope(b.crossing), true);
  for (const receipt of [b.release, b.unresolved, b.disposition, b.exit]) {
    assert.equal(await verifyReceipt(receipt), true);
  }
  assert.equal(await verifySb002Bundle(b), true);
});

test('SB-002 is materially different from SB-001', async () => {
  const b = await pinnedBundle();
  const sb1 = await fixture('sb001-signed-crossing.json');
  const sb1Disposition = await fixture('sb001-admit-receipt.json');
  assert.notEqual(b.crossing.source_world, sb1.source_world);
  assert.notEqual(b.crossing.declared_kind, sb1.declared_kind);
  assert.equal(b.disposition.kind, 'TOASTER_HOLD');
  assert.equal(sb1Disposition.kind, 'R3_ADMIT');
});

test('SB-002 reconstructs after transient field death', async () => {
  const base = await mkdtemp(join(tmpdir(), 'supabardo-sb002-'));
  const field = join(base, 'bardo');
  const durable = join(base, 'durable');
  try {
    await mkdir(field, { recursive: true });
    await mkdir(durable, { recursive: true });
    const b = await pinnedBundle();
    await writeFile(join(field, 'open.json'), JSON.stringify({
      crossing_id: b.crossing.crossing_id,
      state: 'OPEN',
      destination_disposition: null,
    }) + '\n');
    await writeFile(join(durable, 'history.json'), JSON.stringify(b) + '\n');
    await rm(field, { recursive: true, force: true });
    await assert.rejects(() => access(field));
    const recovered = JSON.parse(await readFile(join(durable, 'history.json'), 'utf8'));
    recovered.proposal_bytes = Buffer.from(recovered.proposal_bytes.data);
    assert.equal(await verifySb002Bundle(recovered), true);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('SB-002 pinned evidence set binds exact history', async () => {
  const b = await pinnedBundle();
  const manifest = await fixture('sb002-evidence-manifest.json');
  assert.equal(await verifyPinnedSb002EvidenceSet(b, manifest), true);
  assert.equal(computeSb002EvidenceSetId(b), SB002_PINNED_EVIDENCE_SET_ID);
});

test('BAT refuses source-preselected KEEP even when freshly signed', async () => {
  const b = await freshBundle();
  const draft = crossingDraft(b.crossing);
  draft.requested_effect.destination_disposition = 'KEEP';
  b.crossing = await sealCrossingEnvelope(draft, b.sourceKeys);
  await assert.rejects(() => verifySb002Bundle(b), /SB002_GLOBALIZED_REQUEST/);
});

test('BAT refuses a validly signed WAIT that claims KEEP', async () => {
  const b = await freshBundle();
  const draft = receiptDraft(b.unresolved);
  draft.extensions.supabardo.destination_disposition = 'KEEP';
  b.unresolved = await sealReceipt(draft, b.bardoKeys);
  await assert.rejects(() => verifySb002Bundle(b), /SB002_PREMATURE_DESTINATION_MEANING/);
});

test('BAT refuses destination HOLD that silently grants render authority', async () => {
  const b = await freshBundle();
  const draft = receiptDraft(b.disposition);
  draft.extensions.local_receiver.render_authority = true;
  b.disposition = await sealReceipt(draft, b.destinationKeys);
  await assert.rejects(() => verifySb002Bundle(b), /SB002_HOLD_RENDER_AUTHORITY/);
});

test('BAT refuses destination pretending human KEEP occurred', async () => {
  const b = await freshBundle();
  const draft = receiptDraft(b.disposition);
  draft.extensions.local_receiver.human_keep_observed = true;
  b.disposition = await sealReceipt(draft, b.destinationKeys);
  await assert.rejects(() => verifySb002Bundle(b), /SB002_FALSE_KEEP/);
});

test('BAT refuses KEEP substituted for historical HOLD', async () => {
  const b = await freshBundle();
  const draft = receiptDraft(b.disposition);
  draft.kind = 'TOASTER_KEEP';
  draft.semantic_effect = 'candidate-kept';
  draft.extensions.local_receiver.disposition = 'KEEP';
  b.disposition = await sealReceipt(draft, b.destinationKeys);
  await assert.rejects(() => verifySb002Bundle(b), /SB002_DESTINATION_NOT_HOLD/);
});

test('BAT refuses EXIT rewriting HOLD as KEEP', async () => {
  const b = await freshBundle();
  const draft = receiptDraft(b.exit);
  draft.extensions.supabardo.destination_disposition = 'KEEP';
  b.exit = await sealReceipt(draft, b.bardoKeys);
  await assert.rejects(() => verifySb002Bundle(b), /SB002_EXIT_DISPOSITION_DRIFT/);
});

test('BAT refuses a different valid JSON proposal wearing the pinned content address', async () => {
  const b = await freshBundle();
  const proposal = JSON.parse(Buffer.from(b.proposal_bytes).toString('utf8'));
  proposal.candidate.title = 'SUBSTITUTED PROPOSAL';
  b.proposal_bytes = Buffer.from(JSON.stringify(proposal) + '\n');
  await assert.rejects(() => verifySb002Bundle(b), /SB002_PROPOSAL_HASH_MISMATCH/);
});

test('BAT evidence commitment changes for another lawful ceremony', async () => {
  const pinned = await pinnedBundle();
  const fresh = await freshBundle();
  assert.notEqual(computeSb002EvidenceSetId(fresh), computeSb002EvidenceSetId(pinned));
});
