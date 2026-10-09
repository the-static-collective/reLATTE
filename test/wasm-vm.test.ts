import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  LocalReceiver,
  RelatteVm,
  createVmManifest,
  createWasmVmPackage,
  generateP256KeyPair,
  proposeWasmVm,
  runAdmittedWasmVm,
  sealCrossingEnvelope,
  sealReceipt,
  validateWasmEnvelope,
  verifyCrossingEnvelope,
  verifyWasmVmAdmission,
  verifyWasmVmCandidate,
  verifyWasmVmPackage,
} from '../src/index.ts';

const ADD_BYTES = Buffer.from(
  'AGFzbQEAAAABBwFgAn9/AX8DAgEABwgBBHN0ZXAAAAoJAQcAIAAgAWoL', 'base64',
);
const LOOP_BYTES = Buffer.from(
  'AGFzbQEAAAABBwFgAn9/AX8DAgEABwgBBHN0ZXAAAAoLAQkAA0AMAAtBAAs=', 'base64',
);
const MEMORY_BYTES = Buffer.from(
  'AGFzbQEAAAABBwFgAn9/AX8DAgEABQQBAQEBBwgBBHN0ZXAAAAoJAQcAIAAgAWoL', 'base64',
);
const timestamp = (minute: number) => '2026-10-09T14:' +
  String(minute).padStart(2, '0') + ':00.000Z';
const identity = (n: string) => ({
  world_id: 'world:wasm-' + n,
  particular: 'particular:wasm-' + n,
  runtime_id: 'runtime:wasm-' + n,
});

async function sourceFixture(bytes = ADD_BYTES, timeout = 1500) {
  const manifest = createVmManifest(8, 1);
  const outer = new RelatteVm(manifest, identity('outer'));
  const guest = outer.spawnGuest(identity('guest'));
  guest.increment();
  const keys = await generateP256KeyPair();
  const parent_crossing = await guest.proposeSelf(keys, timestamp(0));
  const pkg = createWasmVmPackage(manifest, bytes, timeout);
  const wasm_crossing = await proposeWasmVm({
    manifest, parent_crossing, wasm_bytes: bytes, package: pkg,
    signing_keys: keys, created_at: timestamp(1),
  });
  return {
    outer, guest, keys,
    candidate: {
      manifest, parent_crossing, wasm_crossing,
      package: pkg, wasm_bytes: bytes,
    },
  };
}

async function admittedFixture(base: string, name: string, crossing: Record<string, any>) {
  const receiver = await LocalReceiver.create(join(base, name), {
    world_id: 'world:owner-' + name,
    receiver_particular: 'particular:owner-' + name,
    contract_ref: 'contract:wasm-owner-' + name + '/v0',
  });
  const receive_receipt = await receiver.receive(crossing, timestamp(2));
  const admit_receipt = await receiver.dispose(crossing.crossing_id, 'ADMIT',
    timestamp(3), { admit_effect: 'relatte-wasm-vm-launch' });
  const owner = {
    world_id: receiver.config.world_id,
    receiver_particular: receiver.config.receiver_particular,
    contract_ref: receiver.config.contract_ref,
    // Copy is pinned by host independently of the guest crossing.
    public_key: structuredClone(receive_receipt.signing.public_key),
  };
  return { receiver, evidence: { receive_receipt, admit_receipt, owner } };
}

test('002 manifest self-reference is finite and binary content-addressed; memory and budgets are bounded', async () => {
  const f = await sourceFixture();
  const { manifest, wasm_bytes: bytes, package: pkg } = f.candidate;
  assert.equal(pkg.self_ref, pkg.package_id);
  assert.equal(pkg.vm_manifest_id, manifest.manifest_id);
  assert.equal(verifyWasmVmPackage(pkg, manifest, bytes), true);
  assert.equal(await verifyWasmVmCandidate(f.candidate), true);
  assert.equal(verifyWasmVmPackage({...pkg, timeout_ms: pkg.timeout_ms + 1}, manifest, bytes), false);
  assert.equal(verifyWasmVmPackage({...pkg, wasm_sha256: '0'.repeat(64)}, manifest, bytes), false);
  assert.equal(verifyWasmVmPackage(pkg, manifest, Buffer.from([1,2,3,4])), false);
  assert.throws(() => createWasmVmPackage(manifest, ADD_BYTES, 150), /INVALID_WASM_TIME_BUDGET/);
  assert.throws(() => createWasmVmPackage(manifest, ADD_BYTES, 6000), /INVALID_WASM_TIME_BUDGET/);
  assert.throws(() => createWasmVmPackage(manifest, MEMORY_BYTES), /WASM_FORBIDDEN_SECTION/);
  assert.throws(() => validateWasmEnvelope(Uint8Array.from(ADD_BYTES.subarray(0, 12))), /WASM_TRUNCATED_SECTION/);
  assert.throws(() => createWasmVmPackage(manifest, Buffer.alloc(4097)), /WASM_BYTE_BOUND/);
});

test('two independent local admissions launch distinct real OS processes with identical WASM and no inherited grants', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-wasm-two-process-'));
  try {
    const f = await sourceFixture();
    const hostC = await admittedFixture(base, 'c', f.candidate.wasm_crossing);
    const hostD = await admittedFixture(base, 'd', f.candidate.wasm_crossing);
    assert.equal(await verifyWasmVmAdmission(f.candidate, hostC.evidence), true);
    assert.equal(await verifyWasmVmAdmission(f.candidate, hostD.evidence), true);
    f.guest.terminate();
    f.outer.terminate();

    const runC = await runAdmittedWasmVm({
      candidate: f.candidate, evidence: hostC.evidence,
      successor: identity('successor-c'), left: 19, right: 23,
    });
    const runD = await runAdmittedWasmVm({
      candidate: f.candidate, evidence: hostD.evidence,
      successor: identity('successor-d'), left: -4, right: 3,
    });
    assert.equal(runC.result, 42);
    assert.equal(runD.result, -1);
    assert.equal(runC.package_id, runD.package_id);
    assert.equal(runC.parent_crossing_id, f.candidate.parent_crossing.crossing_id);
    assert.equal(runC.candidate_crossing_id, f.candidate.wasm_crossing.crossing_id);
    assert.ok(runC.pid > 0);
    assert.ok(runD.pid > 0);
    assert.notEqual(runC.pid, runD.pid);
    assert.notEqual(runC.pid, process.pid);
    assert.deepEqual(runC.inherited_grants, []);
    assert.deepEqual(runD.inherited_grants, []);
  } finally {
    await rm(base, {recursive: true, force: true});
  }
});

test('cold archived evidence reconstructs and executes after the source and receiving host roots are deleted', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-wasm-cold-'));
  try {
    const f = await sourceFixture();
    const host = await admittedFixture(base, 'cold', f.candidate.wasm_crossing);
    const archive = join(base, 'evidence.json');
    await writeFile(archive, JSON.stringify({
      manifest: f.candidate.manifest,
      parent_crossing: f.candidate.parent_crossing,
      wasm_crossing: f.candidate.wasm_crossing,
      package: f.candidate.package,
      wasm_b64: f.candidate.wasm_bytes.toString('base64'),
      evidence: host.evidence,
    }));
    f.guest.terminate();
    f.outer.terminate();
    await rm(host.receiver.root, {recursive: true, force: true});
    const saved = JSON.parse(await readFile(archive, 'utf8'));
    const candidate = {
      manifest: saved.manifest,
      parent_crossing: saved.parent_crossing,
      wasm_crossing: saved.wasm_crossing,
      package: saved.package,
      wasm_bytes: Buffer.from(saved.wasm_b64, 'base64'),
    };
    assert.equal(await verifyWasmVmCandidate(candidate), true);
    assert.equal(await verifyWasmVmAdmission(candidate, saved.evidence), true);
    const run = await runAdmittedWasmVm({
      candidate, evidence: saved.evidence, successor: identity('cold-successor'),
      left: 10, right: 32,
    });
    assert.equal(run.result, 42);
    assert.deepEqual(run.inherited_grants, []);
  } finally {
    await rm(base, {recursive: true, force: true});
  }
});

test('valid guest signatures cannot create grants, bypass HOLD, spoof host key or swap executable bytes', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-wasm-hostile-'));
  try {
    const f = await sourceFixture();
    const { candidate } = f;
    const host = await admittedFixture(base, 'strict', candidate.wasm_crossing);
    const changedBytes = {...candidate, wasm_bytes: LOOP_BYTES};
    assert.equal(await verifyWasmVmCandidate(changedBytes), false);

    const hacked = await sealCrossingEnvelope({
      ...candidate.wasm_crossing,
      extensions: {
        wasm_vm: {
          ...candidate.wasm_crossing.extensions.wasm_vm,
          inherited_authority: true,
          requested_grants: ['host-admin'],
        },
      },
    }, f.keys);
    assert.equal(await verifyCrossingEnvelope(hacked), true);
    assert.equal(await verifyWasmVmCandidate({...candidate, wasm_crossing: hacked}), false);

    const guestForgedHost = await sealReceipt(host.evidence.admit_receipt, f.keys);
    assert.equal(await verifyWasmVmAdmission(candidate, {
      ...host.evidence, admit_receipt: guestForgedHost,
    }), false);
    assert.equal(await verifyWasmVmAdmission(candidate, {
      ...host.evidence,
      owner: {...host.evidence.owner, public_key: candidate.wasm_crossing.signing.public_key},
    }), false);

    const holding = await LocalReceiver.create(join(base, 'hold'), {
      world_id: 'world:hold', receiver_particular: 'particular:hold',
      contract_ref: 'contract:hold/v0',
    });
    const received = await holding.receive(candidate.wasm_crossing, timestamp(4));
    const hold = await holding.dispose(candidate.wasm_crossing.crossing_id, 'HOLD', timestamp(5));
    const holdEvidence = {
      receive_receipt: received, admit_receipt: hold,
      owner: {
        world_id: holding.config.world_id, receiver_particular: holding.config.receiver_particular,
        contract_ref: holding.config.contract_ref,
        public_key: received.signing.public_key,
      },
    };
    assert.equal(await verifyWasmVmAdmission(candidate, holdEvidence), false);
    await assert.rejects(runAdmittedWasmVm({
      candidate, evidence: holdEvidence,
      successor: identity('not-authorized'), left: 1, right: 1,
    }), /WASM_LAUNCH_NOT_ADMITTED/);
    await assert.rejects(runAdmittedWasmVm({
      candidate, evidence: host.evidence,
      successor: identity('guest'), left: 1, right: 1,
    }), /WASM_SUCCESSOR_IDENTITY_NOT_FRESH/);
    await assert.rejects(runAdmittedWasmVm({
      candidate, evidence: host.evidence,
      successor: identity('valid'), left: 2 ** 40, right: 0,
    }), /INVALID_WASM_ARGUMENT/);
  } finally {
    await rm(base, {recursive: true, force: true});
  }
});

test('malicious infinite-loop WASM is terminated by parent wall-clock deadline; healthy successor still works', async () => {
  const base = await mkdtemp(join(tmpdir(), 'relatte-wasm-timeout-'));
  try {
    const loop = await sourceFixture(LOOP_BYTES, 450);
    const host = await admittedFixture(base, 'timeout', loop.candidate.wasm_crossing);
    await assert.rejects(runAdmittedWasmVm({
      candidate: loop.candidate, evidence: host.evidence,
      successor: identity('loop-successor'), left: 1, right: 2,
    }), /WASM_PROCESS_TIMEOUT/);
    const good = await sourceFixture();
    const allowed = await admittedFixture(base, 'good', good.candidate.wasm_crossing);
    const run = await runAdmittedWasmVm({
      candidate: good.candidate, evidence: allowed.evidence,
      successor: identity('after-timeout'), left: 2, right: 3,
    });
    assert.equal(run.result, 5);
  } finally {
    await rm(base, {recursive: true, force: true});
  }
});
