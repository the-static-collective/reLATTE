import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { runPython } from '../python_verifier.ts';
import type { NativeChecker } from './verifier.ts';

export const NATIVE_PYTHON_SCRIPT = fileURLToPath(new URL(
  import.meta.url.endsWith('.js') ? '../../../../independent/merkle_result_v1.py' : '../../../independent/merkle_result_v1.py', import.meta.url));
export function nativePythonChecker(options: { script?: string; executable?: string } = {}): NativeChecker {
  return async (context, samples) => {
    const path = options.script ?? NATIVE_PYTHON_SCRIPT;
    const math = join(dirname(resolve(path)), 'julia_q24.py');
    const sources = await Promise.all([readFile(path), readFile(math)]);
    const sourceHash = createHash('sha256').update('UsefulWork-NativeVerifierSource-v1|').update(sources[0]).update(sources[1]).digest('hex');
    const output = await runPython('sample', {
      job_base64: Buffer.from(context.jobBytes).toString('base64'), result_header: context.header, result_id: context.result_id,
      samples: samples.map(s => ({ index: s.index, committed_count: s.committed_count, proof: s.proof })),
    }, { ...options, script: path });
    if (output.schema !== 'useful-work.python-native-samples/v1' || output.result_id !== context.result_id ||
        output.job_spec_hash !== context.header.job_spec_hash || output.sampled_entries_bound_to_result_identity !== true ||
        output.implementation?.source_sha256 !== sourceHash || output.implementation?.id !== 'useful-work/python-merkle-q24/v1') throw new Error('INVALID_PYTHON_NATIVE_REPORT');
    return { samples: output.samples, implementation: output.implementation };
  };
}
