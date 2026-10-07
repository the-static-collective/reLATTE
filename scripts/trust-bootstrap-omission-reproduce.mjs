/** Preserve a reproducible counterexample to the preliminary unclosed model.
 * Execute the actual assessor with only its signed-scope guard removed in a
 * disposable tree. Never use this deliberately unsafe model for assessment.
 */
import { mkdtemp, cp, symlink, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root = new URL('..', import.meta.url).pathname;
export async function reproduceOmissionFailure(bundle, local_root) {
  const work = await mkdtemp(join(tmpdir(), 'bootstrap-unclosed-model-'));
  try {
    await cp(join(root, 'src'), join(work, 'src'), { recursive: true });
    await cp(join(root, 'package.json'), join(work, 'package.json'));
    await symlink(join(root, 'node_modules'), join(work, 'node_modules'), 'dir');
    const path = join(work, 'src/trust-bootstrap.ts'), original = await readFile(path, 'utf8');
    const guard = "requireThat(body.core_digest === bootstrapCoreDigest(bundle) && Array.isArray(body.record_ids) && sorted(body.record_ids) === sorted(bootstrapRecordIds(bundle)), 'FROZEN_ENCOUNTER_EVIDENCE_CHANGED');";
    assert.equal(original.split(guard).length, 2);
    const unsafe = original.replace(guard, '// DELIBERATELY UNSAFE: preliminary model has no signed encounter scope check');
    await writeFile(path, unsafe);
    const { assessTrustBootstrap } = await import(pathToFileURL(path).href);
    const before = await assessTrustBootstrap({ bundle, local_root }), withheld = structuredClone(bundle); withheld.decisions.pop();
    const after = await assessTrustBootstrap({ bundle: withheld, local_root });
    assert.equal(before.status, 'HOLD'); assert.ok(before.reasons.includes('LOCAL_DECISION_EQUIVOCATION_OR_DUPLICATE'));
    assert.equal(after.status, 'MUTUALLY_WITNESSED'); assert.ok(after.confidence > before.confidence);
    return { model: 'PRELIMINARY_SCOPE_GUARD_REMOVED', removed_guard: guard,
      original_source_sha256: createHash('sha256').update(original).digest('hex'), unsafe_source_sha256: createHash('sha256').update(unsafe).digest('hex'),
      before, after, failure: 'DELETING_VALID_CONTRADICTION_RAISED_TRUST' };
  } finally { await rm(work, { recursive: true, force: true }); }
}
