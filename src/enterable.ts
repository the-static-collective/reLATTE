import type { Com5Observation, Com5Role } from './com5.ts';
import { COM5_ROLES } from './com5.ts';
import {
  buildVerifiedMetabolicNeighborhood,
  type VerifiedMetabolicNeighborhood,
} from './neighborhood.ts';
import { verifyCrossingEnvelope } from './protocol.ts';
import {
  walkVerifiedReentryPath,
  type VerifiedEncounter,
} from './reentry.ts';

type UnknownRecord = Record<string, unknown>;

export type EnterableInstrumentKind =
  | 'residual-shelf'
  | 'relation-board'
  | 'receipt-console'
  | 'road-map'
  | 'participation-room'
  | 'audio-player'
  | 'video-player'
  | 'image-viewer'
  | 'text-sheet'
  | 'document-viewer'
  | 'source-inspector';

export interface EnterableMediaRef {
  address: string;
  role: string;
  media_type: string | null;
  source_crossing_id: string;
}

export interface EnterableInstrument {
  kind: EnterableInstrumentKind;
  source: 'door' | 'media';
  ref: string | null;
  media_type: string | null;
  note: string;
}

export interface EnterableDoor {
  role: Com5Role;
  observations: readonly Com5Observation[];
  instruments: readonly EnterableInstrument[];
}

export interface EnterableParticularPacket {
  schema: 'relatte.enterable-particular/v0';
  subject: string;
  projection_status: 'derived-non-authoritative';
  authority: 'none';
  doors: readonly EnterableDoor[];
  neighbor_refs: readonly string[];
  media_refs: readonly EnterableMediaRef[];
  encounter: VerifiedEncounter | null;
  history_cut: {
    accepted_record_count: number;
    rejected_record_count: number;
  };
  boundary: readonly string[];
}

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function text(record: UnknownRecord, key: string): string | null {
  return typeof record[key] === 'string' && record[key] !== ''
    ? record[key] as string
    : null;
}

function mediaKind(mediaType: string | null): EnterableInstrumentKind {
  if (mediaType === null) return 'source-inspector';
  if (mediaType.startsWith('audio/')) return 'audio-player';
  if (mediaType.startsWith('video/')) return 'video-player';
  if (mediaType.startsWith('image/')) return 'image-viewer';
  if (mediaType.startsWith('text/')) return 'text-sheet';
  if (mediaType === 'application/pdf') return 'document-viewer';
  return 'source-inspector';
}

function doorInstrument(role: Com5Role): EnterableInstrument {
  const table: Record<Com5Role, EnterableInstrumentKind> = {
    COMPOST: 'residual-shelf',
    COMPOSE: 'relation-board',
    COMPUTE: 'receipt-console',
    COMMUTE: 'road-map',
    COMMUNE: 'participation-room',
  };

  return {
    kind: table[role],
    source: 'door',
    ref: null,
    media_type: null,
    note: `Local renderer proposal for the ${role} door; not protocol authority.`,
  };
}

function mediaInstrument(ref: EnterableMediaRef): EnterableInstrument {
  return {
    kind: mediaKind(ref.media_type),
    source: 'media',
    ref: ref.address,
    media_type: ref.media_type,
    note: `Declared payload role: ${ref.role}.`,
  };
}

async function verifiedMediaRefs(records: readonly unknown[]): Promise<EnterableMediaRef[]> {
  const out: EnterableMediaRef[] = [];

  for (const value of records) {
    const record = asRecord(value);
    if (record === null || record.schema !== 'relatte.crossing-envelope/v0') continue;
    if (!(await verifyCrossingEnvelope(record))) continue;

    const crossingId = text(record, 'crossing_id');
    if (crossingId === null || !Array.isArray(record.payload_refs)) continue;

    for (const candidate of record.payload_refs) {
      const payload = asRecord(candidate);
      if (payload === null) continue;

      const address = text(payload, 'address');
      const role = text(payload, 'role');
      const mediaType = payload.media_type === null
        ? null
        : typeof payload.media_type === 'string'
          ? payload.media_type
          : null;

      if (address === null || role === null) continue;

      out.push({
        address,
        role,
        media_type: mediaType,
        source_crossing_id: crossingId,
      });
    }
  }

  return out;
}

function projectionDoors(
  neighborhood: VerifiedMetabolicNeighborhood,
  mediaRefs: readonly EnterableMediaRef[],
): EnterableDoor[] {
  return COM5_ROLES.map((role) => {
    const roomDoor = neighborhood.room.doors.find((door) => door.role === role)!;
    const instruments: EnterableInstrument[] = [doorInstrument(role)];

    if (role === 'COMPOSE') {
      instruments.push(...mediaRefs.map(mediaInstrument));
    }

    return {
      role,
      observations: [...roomDoor.observations],
      instruments,
    };
  });
}

/**
 * Produce a portable, non-authoritative "enterable particular" projection.
 *
 * The packet is a handoff surface for a renderer such as ROroomOM. It does not
 * carry admission, execution authority, source ownership, or a universal media
 * schema. The receiver must create its own local encounter.
 */
export async function buildEnterableParticular(
  subject: string,
  records: readonly unknown[],
  encounterPath?: readonly string[],
): Promise<EnterableParticularPacket> {
  const neighborhood = await buildVerifiedMetabolicNeighborhood(subject, records);
  const mediaRefs = (await verifiedMediaRefs(records))
    .filter((ref) => ref.source_crossing_id === subject);

  let encounter: VerifiedEncounter | null = null;
  if (encounterPath !== undefined) {
    if (encounterPath.length === 0 || encounterPath[encounterPath.length - 1] !== subject) {
      throw new Error('ENTERABLE_PATH_MUST_END_AT_SUBJECT');
    }
    const walk = await walkVerifiedReentryPath(encounterPath, records);
    encounter = walk.current_encounter;
  }

  return {
    schema: 'relatte.enterable-particular/v0',
    subject,
    projection_status: 'derived-non-authoritative',
    authority: 'none',
    doors: projectionDoors(neighborhood, mediaRefs),
    neighbor_refs: [...neighborhood.neighbor_refs],
    media_refs: mediaRefs,
    encounter,
    history_cut: {
      accepted_record_count: neighborhood.accepted_record_count,
      rejected_record_count: neighborhood.rejected_records.length,
    },
    boundary: [
      'PROJECTION != AUTHORITY',
      'DOOR != CROSSING',
      'MEDIA REF != MEDIA CONTENT',
      'ROOM RENDERING != SOURCE MUTATION',
      'RECEIVER ENCOUNTER != SOURCE IDENTITY',
    ],
  };
}
