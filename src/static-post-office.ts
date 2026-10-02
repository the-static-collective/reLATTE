import {
  canonicalizeDomainValue,
  sha256Hex,
  validateTimestamp,
} from './canonical.ts';
import type { LocalCarryCard } from './carry-card.ts';
import type { PortableCarryArtifact } from './portable-carry.ts';

export const STATIC_POST_DISPATCH_ID_DOMAIN =
  'reLATTE-StaticPostDispatch-v0|';
export const STATIC_POSTBAG_ID_DOMAIN =
  'reLATTE-StaticPostbag-v0|';
export const STATIC_POST_STAMP_ID_DOMAIN =
  'reLATTE-StaticPostStamp-v0|';

export interface StaticPostCover {
  recipient_world: string;
  parcel_id: string;
  portable_id: string;
  crossing_id: string;
  return_envelope_id: string;
}

export interface ThreeWorldDispatch {
  schema: 'relatte.three-world-dispatch/v0';
  dispatch_id: string;
  source_world: string;
  parcel_id: string;
  recipients: [StaticPostCover, StaticPostCover, StaticPostCover];
  created_at: string;
  laws: string[];
}

export interface StaticPostReturn {
  world_id: string;
  portable_id: string;
  crossing_id: string;
  parent_crossing_id: string;
  receive_receipt_id: string | null;
  disposition: 'HOLD' | 'ADMIT' | 'REFUSE' | 'RETURN';
  disposition_receipt_id: string | null;
  carried_context: string[];
  open_questions: string[];
}

export interface StaticPostbag {
  schema: 'relatte.static-postbag/v0';
  postbag_id: string;
  dispatch_id: string;
  source_parcel_id: string;
  returns: [StaticPostReturn, StaticPostReturn, StaticPostReturn];
  laws: string[];
}

export interface StaticPostCompositorDraft {
  schema: 'relatte.static-post-compositor-draft/v0';
  source_postbag_id: string;
  available_context: Array<{
    world_id: string;
    text: string;
  }>;
  carried_forward: string[];
  left_home: string[];
  open_tensions: string[];
  descendant_card: LocalCarryCard;
  laws: string[];
}

export interface StaticPostStamp {
  schema: 'relatte.static-post-stamp/v0';
  stamp_id: string;
  direction: 'OUTBOUND' | 'RETURN';
  world_id: string;
  crossing_id: string;
  parcel_id: string | null;
  receipt_id: string | null;
  disposition: 'RELEASED' | 'RECEIVED' | 'HOLD' | 'ADMIT' | 'REFUSE' | 'RETURN';
  stamped_at: string;
  laws: string[];
}

function asRecord(value: unknown, code: string): Record<string, any> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(code);
  }
  return value as Record<string, any>;
}

function nonEmpty(value: unknown, code: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(code);
  }
  return value;
}

function parcelIdFromArtifact(artifact: PortableCarryArtifact): string {
  const crossing = asRecord(
    artifact.transport_bundle.crossing,
    'INVALID_STATIC_POST_CROSSING',
  );
  return nonEmpty(
    crossing.extensions?.carry_card?.parcel_id,
    'STATIC_POST_PARCEL_ID_MISSING',
  );
}

function coverFromArtifact(
  recipientWorld: string,
  artifact: PortableCarryArtifact,
): StaticPostCover {
  if (artifact.return_envelope === null) {
    throw new Error('STATIC_POST_RETURN_ENVELOPE_REQUIRED');
  }
  const crossing = artifact.transport_bundle.crossing;
  const target = crossing.audience_policy?.target_world;
  if (target !== recipientWorld) {
    throw new Error('STATIC_POST_RECIPIENT_TARGET_MISMATCH');
  }
  if (artifact.return_envelope.recipient_world !== recipientWorld) {
    throw new Error('STATIC_POST_RETURN_RECIPIENT_MISMATCH');
  }

  return {
    recipient_world: recipientWorld,
    parcel_id: parcelIdFromArtifact(artifact),
    portable_id: artifact.portable_id,
    crossing_id: nonEmpty(
      crossing.crossing_id,
      'STATIC_POST_CROSSING_ID_MISSING',
    ),
    return_envelope_id:
      artifact.return_envelope.return_envelope_id,
  };
}

function dispatchBody(
  value: Omit<ThreeWorldDispatch, 'dispatch_id'>,
): Record<string, unknown> {
  return {
    schema: value.schema,
    source_world: value.source_world,
    parcel_id: value.parcel_id,
    recipients: value.recipients.map((entry) => ({ ...entry })),
    created_at: value.created_at,
    laws: [...value.laws],
  };
}

export function buildThreeWorldDispatch(args: {
  source_world: string;
  artifacts: [
    { recipient_world: string; artifact: PortableCarryArtifact },
    { recipient_world: string; artifact: PortableCarryArtifact },
    { recipient_world: string; artifact: PortableCarryArtifact },
  ];
  created_at: string;
}): ThreeWorldDispatch {
  validateTimestamp(args.created_at);
  const sourceWorld = nonEmpty(
    args.source_world,
    'INVALID_STATIC_POST_SOURCE_WORLD',
  );
  const covers = args.artifacts.map(({ recipient_world, artifact }) =>
    coverFromArtifact(
      nonEmpty(recipient_world, 'INVALID_STATIC_POST_RECIPIENT_WORLD'),
      artifact,
    )
  ) as ThreeWorldDispatch['recipients'];

  const worlds = covers.map((cover) => cover.recipient_world);
  if (new Set(worlds).size !== 3) {
    throw new Error('STATIC_POST_REQUIRES_THREE_DISTINCT_WORLDS');
  }

  const parcelIds = new Set(covers.map((cover) => cover.parcel_id));
  if (parcelIds.size !== 1) {
    throw new Error('STATIC_POST_LETTER_BODY_DIVERGED');
  }

  const crossingIds = new Set(covers.map((cover) => cover.crossing_id));
  if (crossingIds.size !== 3) {
    throw new Error('STATIC_POST_COVERS_MUST_BE_DISTINCT');
  }

  const portableIds = new Set(covers.map((cover) => cover.portable_id));
  if (portableIds.size !== 3) {
    throw new Error('STATIC_POST_PORTABLE_COVERS_MUST_BE_DISTINCT');
  }

  const body: Omit<ThreeWorldDispatch, 'dispatch_id'> = {
    schema: 'relatte.three-world-dispatch/v0',
    source_world: sourceWorld,
    parcel_id: covers[0].parcel_id,
    recipients: covers,
    created_at: args.created_at,
    laws: [
      'LETTER BODY != COVER',
      'SAME PARCEL != SAME CIPHERTEXT',
      'SAME QUESTION != SHARED WORLD',
      'RECIPIENT COVER != GLOBAL BROADCAST',
      'PARALLEL DELIVERY != CONSENSUS',
    ],
  };

  return {
    ...body,
    dispatch_id: `relatte-static-post-dispatch-v0:${sha256Hex(
      canonicalizeDomainValue(STATIC_POST_DISPATCH_ID_DOMAIN, dispatchBody(body)),
    )}`,
  };
}

function postbagBody(
  value: Omit<StaticPostbag, 'postbag_id'>,
): Record<string, unknown> {
  return {
    schema: value.schema,
    dispatch_id: value.dispatch_id,
    source_parcel_id: value.source_parcel_id,
    returns: value.returns.map((entry) => ({
      ...entry,
      carried_context: [...entry.carried_context],
      open_questions: [...entry.open_questions],
    })),
    laws: [...value.laws],
  };
}

export function buildStaticPostbag(args: {
  dispatch: ThreeWorldDispatch;
  returns: [StaticPostReturn, StaticPostReturn, StaticPostReturn];
}): StaticPostbag {
  const expectedParents = new Set(
    args.dispatch.recipients.map((entry) => entry.crossing_id),
  );
  const worlds = new Set(args.dispatch.recipients.map((entry) => entry.recipient_world));
  const seenWorlds = new Set<string>();
  const seenParents = new Set<string>();

  for (const returned of args.returns) {
    if (!worlds.has(returned.world_id)) {
      throw new Error('STATIC_POST_RETURN_WORLD_NOT_DISPATCHED');
    }
    if (!expectedParents.has(returned.parent_crossing_id)) {
      throw new Error('STATIC_POST_RETURN_PARENT_UNKNOWN');
    }
    if (seenWorlds.has(returned.world_id)) {
      throw new Error('STATIC_POST_DUPLICATE_RETURN_WORLD');
    }
    if (seenParents.has(returned.parent_crossing_id)) {
      throw new Error('STATIC_POST_DUPLICATE_RETURN_PARENT');
    }
    seenWorlds.add(returned.world_id);
    seenParents.add(returned.parent_crossing_id);
  }

  if (seenWorlds.size !== 3 || seenParents.size !== 3) {
    throw new Error('STATIC_POSTBAG_INCOMPLETE');
  }

  const body: Omit<StaticPostbag, 'postbag_id'> = {
    schema: 'relatte.static-postbag/v0',
    dispatch_id: args.dispatch.dispatch_id,
    source_parcel_id: args.dispatch.parcel_id,
    returns: args.returns,
    laws: [
      'POSTBAG != MERGER',
      'THREE RETURNS != AGREEMENT',
      'RETURN ORDER != RANKING',
      'DIVERGENCE != FAILURE',
      'COLLECTION != ADMISSION',
    ],
  };

  return {
    ...body,
    postbag_id: `relatte-static-postbag-v0:${sha256Hex(
      canonicalizeDomainValue(STATIC_POSTBAG_ID_DOMAIN, postbagBody(body)),
    )}`,
  };
}

export function buildStaticPostCompositorDraft(args: {
  postbag: StaticPostbag;
  carried_forward: string[];
  left_home?: string[];
  open_tensions?: string[];
  human_intent: string;
  expires_at?: string | null;
}): StaticPostCompositorDraft {
  const available = args.postbag.returns.flatMap((returned) =>
    returned.carried_context.map((text) => ({
      world_id: returned.world_id,
      text,
    }))
  );
  const availableText = new Set(available.map((entry) => entry.text));
  const carried = [...new Set(args.carried_forward)];
  const leftHome = [...new Set(args.left_home ?? [])];

  for (const text of [...carried, ...leftHome]) {
    if (!availableText.has(text)) {
      throw new Error('STATIC_POST_COMPOSITOR_SELECTION_NOT_IN_RETURNS');
    }
  }
  const overlap = carried.filter((text) => leftHome.includes(text));
  if (overlap.length > 0) {
    throw new Error('STATIC_POST_COMPOSITOR_CONTRADICTORY_SELECTION');
  }

  const offered = [...new Set(available.map((entry) => entry.text))];
  const tensions = [...new Set(args.open_tensions ?? [])];
  const descendantCard: LocalCarryCard = {
    schema: 'relatte.local-carry-card/v0',
    human_intent: nonEmpty(
      args.human_intent,
      'INVALID_STATIC_POST_DESCENDANT_INTENT',
    ),
    offered_context: offered,
    admitted_context: carried,
    open_questions: tensions,
    expires_at: args.expires_at ?? null,
  };

  return {
    schema: 'relatte.static-post-compositor-draft/v0',
    source_postbag_id: args.postbag.postbag_id,
    available_context: available,
    carried_forward: carried,
    left_home: leftHome,
    open_tensions: tensions,
    descendant_card: descendantCard,
    laws: [
      'POSTBAG != MERGER',
      'COMPOSITION != CONSENSUS',
      'SELECTION != RANKING',
      'OMISSION != NONEXISTENCE',
      'DESCENDANT != SUMMARY',
    ],
  };
}

export function buildStaticPostStamp(args: {
  direction: StaticPostStamp['direction'];
  world_id: string;
  crossing_id: string;
  parcel_id?: string | null;
  receipt_id?: string | null;
  disposition: StaticPostStamp['disposition'];
  stamped_at: string;
}): StaticPostStamp {
  validateTimestamp(args.stamped_at);
  const body: Omit<StaticPostStamp, 'stamp_id'> = {
    schema: 'relatte.static-post-stamp/v0',
    direction: args.direction,
    world_id: nonEmpty(args.world_id, 'INVALID_STATIC_POST_STAMP_WORLD'),
    crossing_id: nonEmpty(
      args.crossing_id,
      'INVALID_STATIC_POST_STAMP_CROSSING',
    ),
    parcel_id: args.parcel_id ?? null,
    receipt_id: args.receipt_id ?? null,
    disposition: args.disposition,
    stamped_at: args.stamped_at,
    laws: [
      'STAMP != AUTHORITY',
      'STAMP != RANKING',
      'STAMP != OWNERSHIP',
      'STAMP IS A PROJECTION OF AN ATTRIBUTABLE EVENT',
    ],
  };

  return {
    ...body,
    stamp_id: `relatte-static-post-stamp-v0:${sha256Hex(
      canonicalizeDomainValue(STATIC_POST_STAMP_ID_DOMAIN, body),
    )}`,
  };
}
