import { readFile } from 'node:fs/promises';
import { sha256Hex } from '../../canonical.ts';
import { PYTHON_SCRIPT, runPython } from '../python_verifier.ts';
import type { SampleChecker } from './verifier.ts';

/** No worker or TypeScript mathematical implementation imports. */
export function pythonChecker(options: { script?: string; executable?: string } = {}): SampleChecker {
  return async (jobBytes, indices) => {
    const sourceHash = sha256Hex(await readFile(options.script ?? PYTHON_SCRIPT));
    const output = await runPython('sample', { job_base64: jobBytes.toString('base64'), indices }, options);
    if (output.schema !== 'useful-work.python-samples/v1' || output.job_spec_hash !== sha256Hex(jobBytes) ||
        output.implementation?.id !== 'useful-work/python-q24/v1' || output.implementation?.source_sha256 !== sourceHash) throw new Error('INVALID_PYTHON_SAMPLE_REPORT');
    return { samples: output.samples, implementation: output.implementation };
  };
}
