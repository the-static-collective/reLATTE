import { readFileSync } from 'node:fs';

import {
  renderVerifiedMetabolicNeighborhood,
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

console.log(
  await renderVerifiedMetabolicNeighborhood(
    crossingId,
    [crossing, receipt],
  ),
);
