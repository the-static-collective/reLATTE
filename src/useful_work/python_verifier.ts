import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { sha256Hex } from '../canonical.ts';
import { inspectWork, MAX_ARTIFACT_BYTES } from './inspection.ts';
import type { ArtifactSource, ComputationEvidence, VerificationResult } from './verification_types.ts';

export const PYTHON_SCRIPT = fileURLToPath(new URL(
  import.meta.url.endsWith('.js') ? '../../../independent/julia_q24.py' : '../../independent/julia_q24.py', import.meta.url,
));

/** Isolated standard-library process; stdin/stdout are data, never executable source. */
export function runPython(action: 'verify' | 'render' | 'sample', request: unknown, options: { script?: string; executable?: string } = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const child = spawn(options.executable ?? 'python3', ['-I', '-B', options.script ?? PYTHON_SCRIPT, action], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('PYTHON_TIMEOUT')); }, 30_000);
    timer.unref();
    let stdout = ''; let stderr = ''; let bytes = 0;
    child.stdout.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > MAX_ARTIFACT_BYTES) { child.kill('SIGKILL'); reject(new Error('PYTHON_OUTPUT_LIMIT')); }
      else stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', chunk => { if (stderr.length < 4096) stderr += chunk.toString('utf8'); });
    child.once('error', () => { clearTimeout(timer); reject(new Error('PYTHON_UNAVAILABLE')); });
    child.stdin.on('error', () => { /* Exit/error below reports early child termination. */ });
    child.once('close', code => {
      clearTimeout(timer);
      try {
        const output = JSON.parse(stdout);
        if (code !== 0) reject(new Error(output.error ?? 'PYTHON_VERIFIER_FAILED'));
        else resolve(output);
      } catch { reject(new Error(`PYTHON_VERIFIER_FAILED${stderr ? ': ' + stderr.trim() : ''}`)); }
    });
    child.stdin.end(JSON.stringify(request));
  });
}

/** Shares byte authentication, never the TypeScript worker/verifier algorithm. */
export async function verifyWorkPython(
  crossing: unknown, source: ArtifactSource, options: { script?: string; executable?: string } = {},
): Promise<VerificationResult> {
  const { report, artifacts, result, job } = await inspectWork(crossing, source, 'recompute');
  try {
    const scriptHash = sha256Hex(await readFile(options.script ?? PYTHON_SCRIPT));
    report.implementation = { id: 'useful-work/python-q24/v1', runtime: 'not started', source_sha256: scriptHash };
    if (report.errors.length) return report;
    const output = await runPython('verify', {
      job_base64: artifacts['job-spec'].toString('base64'),
      result_base64: artifacts['canonical-result'].toString('base64'),
    }, options);
    // Bind the child report to the exact authenticated bytes and local program.
    const mismatch = output.first_mismatch;
    if (output.schema !== 'useful-work.python-computation/v1' ||
      output.job_spec_hash !== report.manifest?.job_spec_hash || output.artifact_result_hash !== report.manifest?.result_hash ||
      typeof output.recomputed_result_hash !== 'string' || !/^[a-f0-9]{64}$/.test(output.recomputed_result_hash) ||
      output.implementation?.source_sha256 !== scriptHash || output.implementation?.id !== 'useful-work/python-q24/v1' ||
      typeof output.implementation?.runtime !== 'string' || typeof output.matched !== 'boolean' ||
      output.matched !== (output.artifact_result_hash === output.recomputed_result_hash) ||
      (output.matched ? mismatch !== null : !result || !Number.isSafeInteger(mismatch?.index) ||
        mismatch.index < 0 || mismatch.index >= result.escape_counts.length ||
        mismatch.artifact_count !== result.escape_counts[mismatch.index] || !Number.isSafeInteger(mismatch.recomputed_count) ||
        mismatch.recomputed_count < 0 || !job || mismatch.recomputed_count > job.iterations ||
        mismatch.recomputed_count === mismatch.artifact_count)) throw new Error('INVALID_PYTHON_REPORT');
    report.implementation = output.implementation;
    report.computation = {
      job_spec_hash: output.job_spec_hash, artifact_result_hash: output.artifact_result_hash,
      recomputed_result_hash: output.recomputed_result_hash, first_mismatch: mismatch,
    } as ComputationEvidence;
    if (output.matched) report.claims.computation_independently_verified = true;
    else report.errors.push('COMPUTATION_MISMATCH');
  } catch (error) { report.errors.push(error instanceof Error ? error.message : 'PYTHON_VERIFIER_FAILED'); }
  return report;
}
