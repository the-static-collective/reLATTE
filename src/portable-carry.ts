import {
  canonicalize,
  canonicalizeDomainValue,
  sha256Hex,
  validateTimestamp,
} from './canonical.ts';
import {
  type CarryTransportBundle,
} from './carry-card.ts';
import {
  type ReturnEnvelope,
} from './return-envelope.ts';
import {
  verifyCrossingEnvelope,
} from './protocol.ts';

export const PORTABLE_CARRY_ID_DOMAIN = 'reLATTE-PortableCarry-v0|';
export const PORTABLE_CARRY_MEDIA_TYPE =
  'application/vnd.relatte.portable-carry+json';
export const CARRY_TEXT_BEGIN = '-----BEGIN RELATTE CARRY-----';
export const CARRY_TEXT_END = '-----END RELATTE CARRY-----';

export interface PortableCarryArtifact {
  schema: 'relatte.portable-carry/v0';
  portable_id: string;
  media_type: typeof PORTABLE_CARRY_MEDIA_TYPE;
  created_at: string;
  transport_bundle: CarryTransportBundle;
  return_envelope: ReturnEnvelope | null;
  laws: string[];
}

function asRecord(value: unknown, code: string): Record<string, any> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(code);
  }
  return value as Record<string, any>;
}

function nonEmpty(value: unknown, code: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(code);
  return value;
}

function body(
  value: Omit<PortableCarryArtifact, 'portable_id'>,
): Record<string, unknown> {
  return {
    schema: value.schema,
    media_type: value.media_type,
    created_at: value.created_at,
    transport_bundle: value.transport_bundle,
    return_envelope: value.return_envelope,
    laws: [...value.laws],
  };
}

function portableId(
  value: Omit<PortableCarryArtifact, 'portable_id'>,
): string {
  return `relatte-portable-carry-v0:${sha256Hex(
    canonicalizeDomainValue(PORTABLE_CARRY_ID_DOMAIN, body(value))
  )}`;
}

export async function createPortableCarry(args: {
  transport_bundle: CarryTransportBundle;
  return_envelope?: ReturnEnvelope | null;
  created_at: string;
}): Promise<PortableCarryArtifact> {
  validateTimestamp(args.created_at);
  if (args.transport_bundle.schema !== 'relatte.carry-transport-bundle/v0') {
    throw new Error('INVALID_PORTABLE_CARRY_BUNDLE');
  }
  if (!(await verifyCrossingEnvelope(args.transport_bundle.crossing))) {
    throw new Error('INVALID_PORTABLE_CARRY_CROSSING');
  }

  const normalized: Omit<PortableCarryArtifact, 'portable_id'> = {
    schema: 'relatte.portable-carry/v0',
    media_type: PORTABLE_CARRY_MEDIA_TYPE,
    created_at: args.created_at,
    transport_bundle: args.transport_bundle,
    return_envelope: args.return_envelope ?? null,
    laws: [
      'ROAD != PARCEL',
      'FILE != AUTHORITY',
      'ARMOR != AUTHORITY',
      'COPY != NEW CROSSING',
      'PORTABLE != ADMITTED',
    ],
  };
  return {
    ...value,
    portable_id: portableId(value),
  };
}

export async function parsePortableCarry(
  value: unknown,
): Promise<PortableCarryArtifact> {
  const artifact = asRecord(value, 'INVALID_PORTABLE_CARRY');
  if (artifact.schema !== 'relatte.portable-carry/v0') {
    throw new Error('INVALID_PORTABLE_CARRY_SCHEMA');
  }
  if (artifact.media_type !== PORTABLE_CARRY_MEDIA_TYPE) {
    throw new Error('INVALID_PORTABLE_CARRY_MEDIA_TYPE');
  }
  const createdAt = nonEmpty(
    artifact.created_at,
    'INVALID_PORTABLE_CARRY_CREATED_AT',
  );
  validateTimestamp(createdAt);

  const transportBundle = asRecord(
    artifact.transport_bundle,
    'INVALID_PORTABLE_CARRY_BUNDLE',
  ) as unknown as CarryTransportBundle;
  if (transportBundle.schema !== 'relatte.carry-transport-bundle/v0') {
    throw new Error('INVALID_PORTABLE_CARRY_BUNDLE');
  }
  if (!(await verifyCrossingEnvelope(transportBundle.crossing))) {
    throw new Error('INVALID_PORTABLE_CARRY_CROSSING');
  }

  const value: Omit<PortableCarryArtifact, 'portable_id'> = {
    schema: 'relatte.portable-carry/v0',
    media_type: PORTABLE_CARRY_MEDIA_TYPE,
    created_at: createdAt,
    transport_bundle: transportBundle,
    return_envelope:
      artifact.return_envelope == null
        ? null
        : artifact.return_envelope as ReturnEnvelope,
    laws: Array.isArray(artifact.laws) ? [...artifact.laws] : [],
  };
  const expected = portableId(normalized);
  if (artifact.portable_id !== expected) {
    throw new Error('PORTABLE_CARRY_ID_MISMATCH');
  }

  return {
    ...normalized,
    portable_id: expected,
  };
}

export function serializePortableCarry(
  artifact: PortableCarryArtifact,
): string {
  return canonicalize(artifact);
}

export async function deserializePortableCarry(
  text: string,
): Promise<PortableCarryArtifact> {
  const source = nonEmpty(text, 'PORTABLE_CARRY_TEXT_REQUIRED');
  return parsePortableCarry(JSON.parse(source));
}

function wrapBase64Url(value: string, width = 72): string {
  const lines: string[] = [];
  for (let index = 0; index < value.length; index += width) {
    lines.push(value.slice(index, index + width));
  }
  return lines.join('\n');
}

export function armorPortableCarry(
  artifact: PortableCarryArtifact,
): string {
  const encoded = Buffer.from(
    serializePortableCarry(artifact),
    'utf8',
  ).toString('base64url');
  return [
    CARRY_TEXT_BEGIN,
    'Version: 0',
    `Portable-ID: ${artifact.portable_id}`,
    '',
    wrapBase64Url(encoded),
    CARRY_TEXT_END,
  ].join('\n');
}

export async function dearmorPortableCarry(
  armored: string,
): Promise<PortableCarryArtifact> {
  const text = nonEmpty(armored, 'CARRY_TEXT_REQUIRED').trim();
  const lines = text.split(/\r?\n/);
  if (lines[0] !== CARRY_TEXT_BEGIN) {
    throw new Error('CARRY_TEXT_BEGIN_MISSING');
  }
  if (lines.at(-1) !== CARRY_TEXT_END) {
    throw new Error('CARRY_TEXT_END_MISSING');
  }

  const blank = lines.indexOf('');
  if (blank < 1) throw new Error('CARRY_TEXT_HEADER_SEPARATOR_MISSING');
  const headers = new Map<string, string>();
  for (const line of lines.slice(1, blank)) {
    const colon = line.indexOf(':');
    if (colon <= 0) throw new Error('INVALID_CARRY_TEXT_HEADER');
    headers.set(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
  }
  if (headers.get('Version') !== '0') {
    throw new Error('UNSUPPORTED_CARRY_TEXT_VERSION');
  }

  const encoded = lines
    .slice(blank + 1, -1)
    .join('')
    .trim();
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) {
    throw new Error('INVALID_CARRY_TEXT_BODY');
  }

  const bytes = Buffer.from(encoded, 'base64url');
  if (bytes.toString('base64url') !== encoded) {
    throw new Error('NON_CANONICAL_CARRY_TEXT_BODY');
  }
  const artifact = await deserializePortableCarry(bytes.toString('utf8'));
  const headerId = headers.get('Portable-ID');
  if (headerId !== artifact.portable_id) {
    throw new Error('CARRY_TEXT_PORTABLE_ID_MISMATCH');
  }
  return artifact;
}
