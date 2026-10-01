import { readFileSync } from 'node:fs';

import { followRoomNavigationRequest } from '../src/index.ts';

const bundlePath = process.argv[2];
const requestPath = process.argv[3];

if (!bundlePath || !requestPath) {
  throw new Error('Usage: node demo/follow-room-request.ts bundle.json request.json');
}

const bundle = JSON.parse(readFileSync(bundlePath, 'utf8'));
const request = JSON.parse(readFileSync(requestPath, 'utf8'));

if (!Array.isArray(bundle.records)) {
  throw new Error('Bundle must contain records[].');
}

const result = await followRoomNavigationRequest(request, bundle.records);

console.log(JSON.stringify(result.destination, null, 2));
