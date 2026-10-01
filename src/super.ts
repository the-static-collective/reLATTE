import {
  buildVerifiedMetabolicNeighborhood,
  type VerifiedMetabolicNeighborhood,
} from './neighborhood.ts';
import {
  buildEnterableParticular,
  type EnterableParticularPacket,
} from './enterable.ts';

export const SUPER_RELATTE_SCHEMA = 'relatte.super/v0' as const;

export interface SuperRelatteView {
  schema: typeof SUPER_RELATTE_SCHEMA;
  subject: string;
  neighborhood: VerifiedMetabolicNeighborhood;
  enterable: EnterableParticularPacket;
  composition: {
    protocol: 'signed-crossing-and-receipt';
    metabolism: 'COM5';
    traversal: 'verified-neighbor-only';
    reentry: 'encounter-is-not-identity';
    room: 'derived-non-authoritative';
  };
  boundary: readonly string[];
}

/**
 * Compose the current reLATTE protocol with the recovered Web5/COM5 room
 * lineage without granting the projection any new authority.
 */
export async function buildSuperRelatteView(
  subject: string,
  records: readonly unknown[],
  encounterPath?: readonly string[],
): Promise<SuperRelatteView> {
  const [neighborhood, enterable] = await Promise.all([
    buildVerifiedMetabolicNeighborhood(subject, records),
    buildEnterableParticular(subject, records, encounterPath),
  ]);

  return {
    schema: SUPER_RELATTE_SCHEMA,
    subject,
    neighborhood,
    enterable,
    composition: {
      protocol: 'signed-crossing-and-receipt',
      metabolism: 'COM5',
      traversal: 'verified-neighbor-only',
      reentry: 'encounter-is-not-identity',
      room: 'derived-non-authoritative',
    },
    boundary: [
      'PROJECTION != AUTHORITY',
      'DOOR != CROSSING',
      'RECOMMENDATION != SELECTION',
      'OMISSION != NONEXISTENCE',
      'REENTRY != IDENTITY REPLACEMENT',
    ],
  };
}
