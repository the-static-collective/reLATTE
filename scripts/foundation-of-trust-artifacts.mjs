import { readFile, lstat, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { parseEvidenceJson, forbidPrivateEvidence, assessFoundationBundle } from '../src/index.ts';

export async function readPublicBundleDirectory(dir) {
  let parent = resolve(dir);
  while (true) {
    const info = await lstat(parent);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('UNSAFE_ARTIFACT_DIRECTORY');
    const next = resolve(parent, '..'); if (next === parent) break; parent = next;
  }
  const files = (await readdir(dir)).sort();
  if (JSON.stringify(files) !== JSON.stringify(['bundle.json'])) throw new Error('UNEXPECTED_ARTIFACT_FILES');
  const path = join(dir, 'bundle.json'), stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('UNSAFE_ARTIFACT');
  if (stat.size <= 0 || stat.size > 2_000_000) throw new Error('OVERSIZED_ARTIFACT');
  const bundle = parseEvidenceJson(await readFile(path, 'utf8')); forbidPrivateEvidence(bundle); return bundle;
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const [dir, rootPath, crossingId] = process.argv.slice(2);
  if (!dir || !rootPath || !crossingId) throw new Error('USAGE: <public-directory> <externally-selected-roots.json> <crossing-id>');
  try {
    const bundle = await readPublicBundleDirectory(dir);
    const roots = parseEvidenceJson(await readFile(rootPath, 'utf8'));
    const result = await assessFoundationBundle({ bundle, roots, crossing_id: crossingId });
    process.stdout.write(JSON.stringify(result, null, 2) + '\n'); process.exitCode = result.status === 'VERIFIED' ? 0 : 1;
  } catch (e) { process.stdout.write(JSON.stringify({ status: 'HOLD', evidence_level: 'E0 UNOBSERVED', reasons: [e.message] }) + '\n'); process.exitCode = 1; }
}
