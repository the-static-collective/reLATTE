/** Explicit fault-injection laboratory. Production reference files are never edited. */
import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareWorkReceipts } from '../../src/useful_work/comparison.ts';

const root = fileURLToPath(new URL(import.meta.url.endsWith('.js') ? '../../../' : '../../', import.meta.url));
const args = process.argv.slice(2);
if (args.length !== 0 && (args.length !== 2 || args[0] !== '--out' || !args[1])) throw new Error('Usage: npm run useful-work-002:disagreement -- [--out <new-directory>]');
const out = resolve(args[1] ?? 'output/useful-work-002-disagreement');
await mkdir(resolve(out, '..'), { recursive: true }); await mkdir(out);
const edges = JSON.parse(await readFile(join(root, 'fixtures/useful-work-002-edges.json'), 'utf8'));
const jobPath = join(out, 'job.json');
await writeFile(jobPath, JSON.stringify(edges[0].job, null, 2) + '\n');
const scenarios = [];
for (const label of ['typescript-mutant', 'python-mutant']) {
  const isolated = await mkdtemp(join(tmpdir(), 'useful-work-002-lab-'));
  try {
    await cp(join(root, 'src'), join(isolated, 'src'), { recursive: true });
    await cp(join(root, 'independent'), join(isolated, 'independent'), { recursive: true });
    await cp(join(root, 'package.json'), join(isolated, 'package.json'));
    await symlink(join(root, 'node_modules'), join(isolated, 'node_modules'), 'dir');
    const relative = label === 'typescript-mutant' ? 'src/useful_work/algorithm.ts' : 'independent/julia_q24.py';
    const before = label === 'typescript-mutant' ? 'zi * zi <= 4n * q * q' : 'imaginary * imaginary > 4 * Q * Q';
    const after = label === 'typescript-mutant' ? 'zi * zi < 4n * q * q' : 'imaginary * imaginary >= 4 * Q * Q';
    const original = await readFile(join(isolated, relative), 'utf8');
    if (!original.includes(before)) throw new Error('MUTATION_TARGET_MISSING');
    const mutant = original.replaceAll(before, after);
    await writeFile(join(isolated, relative), mutant);
    const scenarioRoot = join(out, label);
    const code = await new Promise<number>((resolveCode, reject) => {
      const child = spawn(process.execPath, ['--experimental-strip-types', join(isolated, 'src/useful_work/cli_002.ts'),
        'demo', jobPath, '--out', scenarioRoot], { cwd: isolated, stdio: 'inherit' });
      child.once('error', reject); child.once('close', code => resolveCode(code ?? -1));
    });
    // Exit 1 is expected operational disagreement; inspect signed evidence, never count votes.
    if (code !== 1) throw new Error('EXPECTED_EXPLICIT_VERIFICATION_FAILURE');
    const receipts = await Promise.all(['typescript', 'python'].map(async implementation =>
      JSON.parse(await readFile(join(scenarioRoot, 'two-worlds', implementation, 'verification-receipt.json'), 'utf8'))));
    const comparison = await compareWorkReceipts(receipts);
    if (comparison.relation !== 'contradictory') throw new Error('MUTATION_NOT_DETECTED');
    await writeFile(join(scenarioRoot, label === 'typescript-mutant' ? 'mutated-reference.ts' : 'mutated-reference.py'), mutant);
    scenarios.push({ label, mutation: { before, after }, comparison_id: comparison.comparison_id,
      relation: comparison.relation, subject: comparison.subject, observations: comparison.observations });
  } finally { await rm(isolated, { recursive: true, force: true }); }
}
await writeFile(join(out, 'experiment.json'), JSON.stringify({
  schema: 'useful-work.disagreement-experiment/v1', scenarios,
  semantic_effect: 'none', law: 'COMPARISON ≠ ARBITRATION',
}, null, 2) + '\n');
console.log(JSON.stringify({ experiment: join(out, 'experiment.json'), scenarios, semantic_effect: 'none' }, null, 2));
