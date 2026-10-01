import { readFileSync } from 'node:fs';

import {
  renderReentryWitness,
  walkVerifiedReentryPath,
} from '../src/index.ts';

function fixture(name: string): unknown {
  return JSON.parse(
    readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'),
  );
}

const crossing = fixture('genesis-signed-crossing.json') as Record<string, unknown>;
const receipt = fixture('genesis-signed-receipt.json');
const crossingId = crossing.crossing_id;

if (typeof crossingId !== 'string') throw new Error('fixture crossing_id missing');

const walk = await walkVerifiedReentryPath(
  [crossingId, 'particular:genesis-b', crossingId],
  [crossing, receipt],
);

console.log(
  walk.reentries.length === 0
    ? 'No re-entry witnessed.'
    : renderReentryWitness(walk.reentries[0]!),
);
