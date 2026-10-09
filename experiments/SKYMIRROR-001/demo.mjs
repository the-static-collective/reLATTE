import { createHash } from 'node:crypto';
import { encodeOptical, decodeOptical, propagateChips, airtimeSeconds, relayGeometry } from './skymirror.mjs';
const packet = Buffer.from('ONE LIGHT / ONE ROAD', 'utf8');
const outbound = encodeOptical(packet);
const inbound = decodeOptical(propagateChips(outbound));
const digest = (value) => createHash('sha256').update(value).digest('hex');
const output = {
  specimen: 'SKYMIRROR-001',
  transmitter_sha256: digest(packet),
  receiver_sha256: digest(inbound),
  byte_exact: inbound.equals(packet),
  sample_chips: Array.from(outbound.subarray(0, 32)),
  airtime_at_4_chips_per_second: airtimeSeconds(packet.length, 4),
  geometry_example: relayGeometry([-1, 0, -1], [0, 0, 0], [1, 0, -1]),
  actuality: 'OFFLINE_SIMULATION_ONLY',
};
console.log(JSON.stringify(output, null, 2));
