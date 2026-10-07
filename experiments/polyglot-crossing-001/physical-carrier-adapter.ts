import { sha256Hex } from '../../src/canonical.ts';
import { makeObservation, type AdapterObservation } from './common.ts';

export function makePrintableCarrier(bytes: Uint8Array): string {
  const payload = Buffer.from(bytes);
  return [
    'RELATTE-PHYSICAL-CARRIER/1',
    `sha256:${sha256Hex(payload)}`,
    `bytes:${payload.length}`,
    `base64url:${payload.toString('base64url')}`,
    'scope:PRINTABLE_OR_QR_PAYLOAD_NOT_PHYSICAL_CUSTODY_PROOF',
  ].join('\n');
}

export function observePrintableCarrier(card: string): AdapterObservation {
  const lines = card.split('\n');
  if (
    lines.length !== 5 ||
    lines[0] !== 'RELATTE-PHYSICAL-CARRIER/1' ||
    !lines[1]?.startsWith('sha256:') ||
    !lines[2]?.startsWith('bytes:') ||
    !lines[3]?.startsWith('base64url:') ||
    lines[4] !== 'scope:PRINTABLE_OR_QR_PAYLOAD_NOT_PHYSICAL_CUSTODY_PROOF'
  ) throw new Error('INVALID_PRINTABLE_CARRIER');

  const claimedHash = lines[1].slice('sha256:'.length);
  const claimedLength = Number(lines[2].slice('bytes:'.length));
  const encoded = lines[3].slice('base64url:'.length);
  const observed = Buffer.from(encoded, 'base64url');
  if (
    observed.toString('base64url') !== encoded ||
    observed.length !== claimedLength ||
    sha256Hex(observed) !== claimedHash
  ) throw new Error('PRINTABLE_CARRIER_INTEGRITY_FAILURE');

  return makeObservation(
    'physical-carrier',
    `printable-carrier:sha256:${sha256Hex(Buffer.from(card, 'utf8'))}`,
    observed,
    'application/octet-stream',
    {
      carrier_sha256: sha256Hex(Buffer.from(card, 'utf8')),
      payload_sha256: claimedHash,
      identity_model: 'printable/QR-compatible carrier surface',
      physical_custody: 'UNOBSERVED',
    },
  );
}
