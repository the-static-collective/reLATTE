// Deliberate field-test fault: change one recomputed prediction, never the artifact/proof.
import { readFile } from 'node:fs/promises';
import { sha256Hex } from '../../src/canonical.ts';
import { nativeTypescriptChecker } from '../../src/useful_work/merkle_native/typescript_checker.ts';
import type { NativeChecker } from '../../src/useful_work/merkle_native/verifier.ts';
export const faultChecker: NativeChecker = async (context, samples) => {
  const result = await nativeTypescriptChecker(context, samples);
  result.samples[0].count = (result.samples[0].count + 1) % (context.job.iterations + 1);
  result.implementation = { id: 'field-test/deliberate-count-fault/v1', runtime: process.version,
    source_sha256: sha256Hex(await readFile(new URL(import.meta.url))) };
  return result;
};
