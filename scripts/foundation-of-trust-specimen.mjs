import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { generateP256KeyPair, signingKeyIdentity, sha256Hex } from '../src/index.ts';
import { controlReceipt, freeze } from '../test/support/foundation.ts';

const base = new URL('..', import.meta.url).pathname;
const invoke = args => JSON.parse(execFileSync(process.execPath, ['--experimental-strip-types', 'scripts/foundation-of-trust-fatherhand.mjs', ...args], { cwd: base, encoding: 'utf8' }));
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const save = async (path, value) => writeFile(path, JSON.stringify(value, null, 2) + '\n');

export async function buildFatherHandSpecimen(outputDir) {
  const work = await mkdtemp(join(tmpdir(), 'fatherhand-hostile-'));
  try {
    const thing = 'sha256:' + sha256Hex(Buffer.from('identical founder seed'));
    const localA = join(work, 'A'), localB = join(work, 'B'), localC2 = join(work, 'C2');
    const A = invoke(['constitute', localA, 'world:A', thing]);
    const B = invoke(['constitute', localB, 'world:B', thing]);
    const C2 = invoke(['constitute', localC2, 'world:C2', thing]);
    await mkdir(outputDir, { recursive: true });
    const root = await generateP256KeyPair();
    const edge = async (source, receiver, sourceLocal, receiverLocal, prefix, parent = null) => {
      const sourceId = source.constitution.particular_id, receiverId = receiver.constitution.particular_id;
      const policy = await controlReceipt('foundation_policy', { schema: 'relatte.foundation-policy/v0', version: prefix,
        quorum: 2, quorum_kind: 'CRYPTOGRAPHIC_KEYS', members: [
          { key: signingKeyIdentity({ signing: { public_key: source.public_key } }), role: 'SOURCE', particular: sourceId, world: source.constitution.world_id },
          { key: signingKeyIdentity({ signing: { public_key: receiver.public_key } }), role: 'RECEIVER', particular: receiverId, world: receiver.constitution.world_id }],
        root_assumptions: ['MEMBERSHIP_SELECTED_EXTERNALLY', 'INVENTORY_COMPLETENESS_BOUNDED_TO_PIN'] }, root);
      const request = { schema: 'relatte.crossing-envelope/v0', protocol_version: '0', source_particular: sourceId,
        source_world: source.constitution.world_id, source_history_head: parent, parents: parent ? [parent] : [],
        declared_kind: 'FATHERHAND_HOSTILE_001', payload_refs: [{ address: thing, role: 'payload', media_type: 'application/octet-stream' }],
        created_at: '2026-10-07T00:00:00.000Z', requested_effect: { kind: 'bounded-founding-handoff', authority: 'receiver-local' },
        extensions: { two_witness_handoff: { schema: 'relatte.two-witness-handoff/v0', handoff_id: crypto.randomUUID(), receiver_world: receiver.constitution.world_id, receiver_particular: receiverId, thing_ref: thing },
          foundation: { policy_id: policy.receipt_id, relation: { kind: 'LINEAGE', from: sourceId, to: receiverId, identity_basis: 'BYTE_IDENTITY' } } } };
      const requestPath = join(work, prefix + '-request.json'), sourcePath = join(work, prefix + '-source.json'), receiverPath = join(work, prefix + '-receiver.json');
      await save(requestPath, request); const crossing = invoke(['source', sourceLocal, requestPath, sourcePath]);
      const receipt = invoke(['receiver', receiverLocal, sourcePath, receiverPath]);
      const frozen = await freeze(policy, [crossing, receipt], root);
      const dir = join(outputDir, prefix); await mkdir(dir, { recursive: true }); await save(join(dir, 'bundle.json'), frozen.bundle);
      await save(join(outputDir, prefix + '-roots.json'), frozen.roots);
      return { ...frozen, crossing_id: crossing.crossing_id };
    };
    const ab = await edge(A, B, localA, localB, 'AB');
    await rm(localA, { recursive: true, force: true });
    // Fresh process reads B's durable local identity and public receipts.
    const restarted = invoke(['restart', localB, join(outputDir, 'AB/bundle.json'), 'unused']);
    const bc2 = await edge(B, C2, localB, localC2, 'BC2', ab.crossing_id);
    await rm(localB, { recursive: true, force: true }); await rm(localC2, { recursive: true, force: true });
    const topology = { schema: 'relatte.fatherhand-hostile-specimen/v0', identities: { A, B, C2 },
      edges: [{ directory: 'AB', crossing_id: ab.crossing_id }, { directory: 'BC2', crossing_id: bc2.crossing_id }],
      restarted_B: restarted, claim_ids: ['F01', 'F02', 'F03', 'F04', 'F05', 'F06'],
      local_process_death: 'OBSERVED_BY_HARNESS', physical_erasure: 'UNOBSERVED', independent_machines: 'UNOBSERVED',
      private_material_in_public_output: false, signing_authority_inherited: false };
    await save(join(outputDir, 'fatherhand.json'), topology);
    // Only public evidence survives the harness. Root selection remains an
    // explicit external assumption, never inferred from inclusion in files.
    return { ab, bc2, topology };
  } finally { await rm(work, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const out = process.argv[2]; if (!out) throw new Error('USAGE: <public-fixture-output-directory>');
  const specimen = await buildFatherHandSpecimen(out);
  process.stdout.write(JSON.stringify({ specimen: 'FATHERHAND-HOSTILE-001', crossings: [specimen.ab.crossing_id, specimen.bc2.crossing_id], output: resolve(out), private_material: 'NOT_TRANSPORTED_BY_HARNESS' }, null, 2) + '\n');
}
