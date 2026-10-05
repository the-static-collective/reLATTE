import { readFile } from 'node:fs/promises';
import { sampleOrbit } from '../algorithm.ts';
import { sha256Hex } from '../../canonical.ts';
import { parseJob } from '../job.ts';
import type { SampleChecker } from './verifier.ts';

/** Reference world. Independent worlds use pythonChecker instead. */
export const typescriptChecker: SampleChecker = async (jobBytes, indices) => {
  const job = parseJob(JSON.parse(jobBytes.toString('utf8')));
  const source = new URL(import.meta.url.endsWith('.js') ? '../algorithm.js' : '../algorithm.ts', import.meta.url);
  return { samples: indices.map(i => sampleOrbit(job, i)), implementation: {
    id: 'useful-work/typescript-q24/v1', runtime: process.version, source_sha256: sha256Hex(await readFile(source)),
  } };
};
