import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { sampleOrbit } from '../algorithm.ts';
import { parseJob } from '../job.ts';
import type { NativeChecker } from './verifier.ts';

export const nativeTypescriptChecker: NativeChecker = async (context, samples) => {
  const job = parseJob(JSON.parse(Buffer.from(context.jobBytes).toString('utf8')));
  const extension = import.meta.url.endsWith('.js') ? 'js' : 'ts';
  const sources = await Promise.all([readFile(new URL(`../algorithm.${extension}`, import.meta.url)), readFile(new URL(`./result.${extension}`, import.meta.url))]);
  return { samples: samples.map(s => sampleOrbit(job, s.index)), implementation: {
    id: 'useful-work/typescript-merkle-q24/v1', runtime: process.version,
    source_sha256: createHash('sha256').update('UsefulWork-NativeVerifierSource-v1|').update(sources[0]).update(sources[1]).digest('hex'),
  } };
};
