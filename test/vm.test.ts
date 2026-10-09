import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  LocalReceiver,
  RelatteVm,
  bootAdmittedVm,
  createVmManifest,
  generateP256KeyPair,
  sealCrossingEnvelope,
  sealReceipt,
  verifyCrossingEnvelope,
  verifyVmAdmission,
  verifyVmCandidate,
  verifyVmManifest,
  verifyVmTrace,
} from '../src/index.ts';

const START = '2026-10-09T12:00:00.000Z';
const RECEIVED = '2026-10-09T12:01:00.000Z';
const ADMITTED = '2026-10-09T12:02:00.000Z';

function identity(label: string) {
  return {
    world_id: 'world:vm-' + label,
    particular: 'particular:vm-' + label,
    runtime_id: 'runtime:vm-' + label,
  };
}

async function fixture(base: string) {
  const manifest = createVmManifest(6, 1);
  const a = new RelatteVm(manifest, identity('a'));
  assert.equal(a.increment(), 1);
  const b = a.spawnGuest(identity('b'));
  assert.equal(b.increment(), 1);
  assert.equal(b.increment(), 2);
  const guestKeys = await generateP256KeyPair();
  const crossing = await b.proposeSelf(guestKeys, START);
  const receiver = await LocalReceiver.create(join(base, 'independent-owner'), {
    world_id: 'world:independent-owner',
    receiver_particular: 'particular:independent-owner',
    contract_ref: 'contract:independent-local-vm-admission/v0',
  });
  const received = await receiver.receive(crossing, RECEIVED);
  const owner = {
    world_id: receiver.config.world_id,
    receiver_particular: receiver.config.receiver_particular,
    contract_ref: receiver.config.contract_ref,
    // Out-of-band host-trusted public key, never taken from the VM candidate.
    public_key: structuredClone(received.signing.public_key),
  };
  return { manifest, a, b, crossing, receiver, received, owner, guestKeys };
}

test('manifest is a finite content-addressed self reference, never a recursively nested blob', () => {
  const manifest = createVmManifest(6, 1);
  assert.equal(manifest.self_ref, manifest.manifest_id);
  assert.equal(verifyVmManifest(manifest), true);
  assert.equal(verifyVmManifest({ ...manifest, max_steps: 7 }), false);
  assert.equal(verifyVmManifest({ ...manifest, self_ref: 'fake' }), false);
  assert.equal(verifyVmManifest({ ...manifest, laws: [...manifest.laws, 'GUEST IS ROOT'] }), false);
  assert.throws(() => createVmManifest(10_000, 1), /INVALID_VM_BOUNDS/);
});

test('cold crossing verification, owner admission, death, and fresh reconstruction', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-vm-001-'));
  try {
    const f = await fixture(base);
    assert.deepEqual(f.b.describeSelf(), f.a.describeSelf());
    assert.equal(f.b.describeSelf().self_ref, f.manifest.manifest_id);
    assert.equal(f.a.depth, 0);
    assert.equal(f.b.depth, 1);
    assert.throws(() => f.b.spawnGuest(identity('c')), /VM_DEPTH_EXCEEDED/);
    assert.equal(f.a.counter, 1);
    assert.equal(f.b.counter, 2);

    assert.equal(await verifyCrossingEnvelope(f.crossing), true);
    assert.equal(await verifyVmCandidate(f.manifest, f.crossing), true);
    assert.equal(verifyVmTrace(f.b.trace, 6, f.b.historyHead), true);

    const admitted = await f.receiver.dispose(
      f.crossing.crossing_id,
      'ADMIT',
      ADMITTED,
      { admit_effect: 'relatte-vm-boot' },
    );
    const evidence = {
      receive_receipt: f.received,
      admit_receipt: admitted,
      owner: f.owner,
    };
    assert.equal(await verifyVmAdmission(f.manifest, f.crossing, evidence), true);

    // The only things that survive are portable, public, signed artifacts.
    const archive = join(base, 'surviving-evidence.json');
    await writeFile(archive, JSON.stringify({
      manifest: f.manifest,
      crossing: f.crossing,
      evidence,
    }), 'utf8');
    f.a.terminate();
    f.b.terminate();
    assert.throws(() => f.b.increment(), /VM_IS_DEAD/);
    assert.throws(() => f.b.describeSelf(), /VM_IS_DEAD/);
    await assert.rejects(f.b.proposeSelf(f.guestKeys, START), /VM_IS_DEAD/);

    const cold = JSON.parse(await readFile(archive, 'utf8'));
    const successor = await bootAdmittedVm({
      ...cold,
      successor_identity: identity('a-prime'),
    });
    assert.equal(successor.active, true);
    assert.equal(successor.counter, 0);
    assert.deepEqual(successor.trace, []);
    assert.deepEqual(successor.describeSelf(), f.manifest);
    assert.deepEqual(successor.predecessor?.trace, f.crossing.extensions.vm.trace);
    assert.equal(successor.predecessor?.history_head, f.crossing.source_history_head);
    assert.equal(successor.predecessor?.crossing_id, f.crossing.crossing_id);
    assert.equal(successor.increment(), 1);
    assert.notEqual(successor.identity.world_id, f.b.identity.world_id);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('signed guest authority escalation remains a candidate, never host admission', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-vm-attack-'));
  try {
    const f = await fixture(base);
    // Guest can validly SIGN its own requested escalation.
    const selfGrant = await sealCrossingEnvelope({
      ...f.crossing,
      extensions: {
        vm: {
          ...f.crossing.extensions.vm,
          inherited_authority: true,
          requested_grants: ['owner-admin'],
        },
      },
    }, f.guestKeys);
    assert.equal(await verifyCrossingEnvelope(selfGrant), true);
    assert.equal(await verifyVmCandidate(f.manifest, selfGrant), false);

    const inventedGrant = await sealCrossingEnvelope({
      ...f.crossing,
      extensions: {
        vm: {
          ...f.crossing.extensions.vm,
          requested_grants: ['boot-without-host'],
        },
      },
    }, f.guestKeys);
    assert.equal(await verifyCrossingEnvelope(inventedGrant), true);
    assert.equal(await verifyVmCandidate(f.manifest, inventedGrant), false);

    // A signed proposal + RECEIVE is insufficient.
    const hold = await f.receiver.dispose(
      f.crossing.crossing_id, 'HOLD', ADMITTED,
    );
    assert.equal(await verifyVmAdmission(f.manifest, f.crossing, {
      receive_receipt: f.received,
      admit_receipt: hold,
      owner: f.owner,
    }), false);
    await assert.rejects(
      bootAdmittedVm({
        manifest: f.manifest, crossing: f.crossing,
        evidence: {
          receive_receipt: f.received, admit_receipt: hold, owner: f.owner,
        },
        successor_identity: identity('a-prime'),
      }),
      /VM_ADMISSION_NOT_VERIFIED/,
    );
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('forged receipt, cross-wiring, changed manifest, changed history and identity reuse fail', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-vm-hostile-'));
  try {
    const f = await fixture(base);
    const admitted = await f.receiver.dispose(
      f.crossing.crossing_id, 'ADMIT', ADMITTED, { admit_effect: 'relatte-vm-boot' },
    );
    const evidence = {
      receive_receipt: f.received,
      admit_receipt: admitted,
      owner: f.owner,
    };

    const guestForgedAdmit = await sealReceipt(admitted, f.guestKeys);
    assert.equal(await verifyVmAdmission(f.manifest, f.crossing, {
      ...evidence, admit_receipt: guestForgedAdmit,
    }), false);

    assert.equal(await verifyVmAdmission(f.manifest, f.crossing, {
      ...evidence,
      receive_receipt: { ...f.received, crossing_id: 'crossing:other' },
    }), false);

    assert.equal(await verifyVmAdmission(f.manifest, f.crossing, {
      ...evidence,
      owner: { ...f.owner, world_id: f.crossing.source_world },
    }), false);

    assert.equal(await verifyVmCandidate(
      createVmManifest(7, 1), f.crossing,
    ), false);

    const editedHistory = structuredClone(f.crossing);
    editedHistory.extensions.vm.trace[0].argument = 999;
    assert.equal(await verifyVmCandidate(f.manifest, editedHistory), false);

    const signedFalseHistory = await sealCrossingEnvelope({
      ...f.crossing,
      extensions: {
        vm: {
          ...f.crossing.extensions.vm,
          trace: [{ ...f.crossing.extensions.vm.trace[0], argument: 999 }],
        },
      },
    }, f.guestKeys);
    assert.equal(await verifyCrossingEnvelope(signedFalseHistory), true);
    assert.equal(await verifyVmCandidate(f.manifest, signedFalseHistory), false);

    await assert.rejects(
      bootAdmittedVm({
        manifest: f.manifest, crossing: f.crossing, evidence,
        successor_identity: identity('b'),
      }),
      /VM_SUCCESSOR_IDENTITY_NOT_FRESH/,
    );

    const independent = new RelatteVm(createVmManifest(2, 0), identity('short'));
    independent.increment();
    independent.increment();
    assert.throws(() => independent.increment(), /VM_STEP_BUDGET_EXHAUSTED/);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
