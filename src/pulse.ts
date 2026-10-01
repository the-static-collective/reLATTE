import {
  canonicalize,
  canonicalizeDomainValue,
  sha256Hex,
  validateTimestamp,
} from './canonical.ts';
import {
  verifyCulturalDescendant,
  verifyCulturalUptakeShape,
} from './descendant.ts';
import { verifyFieldProjectionShape } from './field.ts';
import {
  sealReceipt,
  verifyCrossingEnvelope,
  verifyReceipt,
} from './protocol.ts';
import type { P256KeyMaterial } from './protocol.ts';

export const COMPOSITION_QUESTION_ID_DOMAIN = 'reLATTE-CompositionQuestion-v0|';
export const COMPOSITION_PULSE_ID_DOMAIN = 'reLATTE-CompositionPulse-v0|';

const QUESTION_KEYS = [
  'schema',
  'question_id',
  'slow_witness_receipt_id',
  'origin_crossing_id',
  'local_act_crossing_id',
  'field_projection_id',
  'question',
  'constraints',
  'semantic_effect',
  'authority',
  'created_at',
  'laws',
] as const;

const PULSE_TRACE_KEYS = [
  'schema',
  'pulse_id',
  'origin_crossing_id',
  'origin_admit_receipt_id',
  'field_projection_id',
  'local_act_crossing_id',
  'local_act_admit_receipt_id',
  'slow_witness_receipt_id',
  'question_id',
  'uptake_id',
  'adaptation_receipt_id',
  'descendant_crossing_id',
  'descendant_receive_receipt_id',
  'return_crossing_id',
  'return_receive_receipt_id',
  'laws',
] as const;

const SLOW_POSTURES = new Set([
  'OBSERVATION',
  'QUESTION',
  'SPECULATION',
  'CANDIDATE',
  'TESTED',
  'REFUTED',
  'SUPERSEDED',
]);

export interface CompositionalQuestion {
  schema: 'relatte.compositional-question/v0';
  question_id?: string;
  slow_witness_receipt_id: string;
  origin_crossing_id: string;
  local_act_crossing_id: string;
  field_projection_id: string;
  question: string;
  constraints: string[];
  semantic_effect: 'none';
  authority: null;
  created_at: string;
  laws: string[];
}

export interface CompositionPulseTrace {
  schema: 'relatte.composition-pulse/v0';
  pulse_id?: string;
  origin_crossing_id: string;
  origin_admit_receipt_id: string;
  field_projection_id: string;
  local_act_crossing_id: string;
  local_act_admit_receipt_id: string;
  slow_witness_receipt_id: string;
  question_id: string;
  uptake_id: string;
  adaptation_receipt_id: string;
  descendant_crossing_id: string;
  descendant_receive_receipt_id: string;
  return_crossing_id: string;
  return_receive_receipt_id: string;
  laws: string[];
}

function asRecord(value: unknown, code: string): Record<string, any> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(code);
  }
  return value as Record<string, any>;
}

function assertOnlyKeys(
  object: Record<string, any>,
  allowed: readonly string[],
  code: string,
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(object)) {
    if (!allowedSet.has(key)) throw new Error(code);
  }
}

function nonEmpty(value: unknown, code: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(code);
  return value;
}

function stringArray(value: unknown, code: string): string[] {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== 'string' || entry.trim() === '')
  ) {
    throw new Error(code);
  }
  return [...value];
}

function publicKeyIdentity(value: unknown): string {
  const key = asRecord(value, 'INVALID_PUBLIC_KEY');
  return canonicalize({
    kty: key.kty,
    crv: key.crv,
    x: key.x,
    y: key.y,
  });
}

export async function buildPulseLocalActDraft(args: {
  origin_crossing: unknown;
  origin_admit_receipt: unknown;
  field_projection: unknown;
  local_particular: string;
  payload_ref: { address: string; media_type: string };
  return_address?: string | null;
  created_at: string;
}): Promise<Record<string, unknown>> {
  if (!(await verifyCrossingEnvelope(args.origin_crossing))) {
    throw new Error('INVALID_PULSE_ORIGIN');
  }
  if (!(await verifyReceipt(args.origin_admit_receipt))) {
    throw new Error('INVALID_PULSE_ORIGIN_ADMISSION');
  }
  if (!verifyFieldProjectionShape(args.field_projection)) {
    throw new Error('INVALID_PULSE_FIELD');
  }
  validateTimestamp(args.created_at);

  const origin = asRecord(args.origin_crossing, 'INVALID_PULSE_ORIGIN');
  const admission = asRecord(
    args.origin_admit_receipt,
    'INVALID_PULSE_ORIGIN_ADMISSION',
  );
  const field = asRecord(args.field_projection, 'INVALID_PULSE_FIELD');

  if (
    admission.kind !== 'R3_ADMIT' ||
    admission.crossing_id !== origin.crossing_id ||
    admission.world_id !== field.world_id ||
    !Array.isArray(field.admitted_receipt_ids) ||
    !field.admitted_receipt_ids.includes(admission.receipt_id)
  ) {
    throw new Error('PULSE_ORIGIN_FIELD_MISMATCH');
  }

  return {
    schema: 'relatte.crossing-envelope/v0',
    protocol_version: '0',
    source_particular: nonEmpty(
      args.local_particular,
      'INVALID_PULSE_LOCAL_PARTICULAR',
    ),
    source_world: field.world_id,
    source_history_head: field.history_root,
    parents: [origin.crossing_id],
    declared_kind: 'R13_LOCAL_ACT',
    payload_refs: [{
      address: nonEmpty(
        args.payload_ref.address,
        'INVALID_PULSE_ACT_PAYLOAD_ADDRESS',
      ),
      role: 'local-act',
      media_type: nonEmpty(
        args.payload_ref.media_type,
        'INVALID_PULSE_ACT_MEDIA_TYPE',
      ),
    }],
    requested_effect: {
      kind: 'fresh-local-act',
      authority: 'receiver-local',
    },
    capability_ref: null,
    privacy_policy: null,
    audience_policy: null,
    return_address: args.return_address ?? origin.return_address ?? null,
    created_at: args.created_at,
    extensions: {
      composition_pulse: {
        phase: 'LOCAL_ACT',
        origin_crossing_id: origin.crossing_id,
        origin_admit_receipt_id: admission.receipt_id,
        field_projection_id: field.projection_id,
        field_history_root: field.history_root,
        field_authorized_action: false,
        laws: [
          'FIELD != CAUSE',
          'FIELD != AUTHORITY',
          'WEATHER != INSTRUCTION',
          'ACT != PROJECTION',
        ],
      },
    },
  };
}

export async function sealSlowDevelopmentalWitness(args: {
  origin_crossing: unknown;
  local_act_crossing: unknown;
  local_act_admit_receipt: unknown;
  field_projection: unknown;
  witness_world_id: string;
  witness_particular: string;
  posture:
    | 'OBSERVATION'
    | 'QUESTION'
    | 'SPECULATION'
    | 'CANDIDATE'
    | 'TESTED'
    | 'REFUTED'
    | 'SUPERSEDED';
  observation: string;
  keys: P256KeyMaterial;
  created_at: string;
}): Promise<Record<string, any>> {
  if (!(await verifyCrossingEnvelope(args.origin_crossing))) {
    throw new Error('INVALID_SLOW_WITNESS_ORIGIN');
  }
  if (!(await verifyCrossingEnvelope(args.local_act_crossing))) {
    throw new Error('INVALID_SLOW_WITNESS_ACT');
  }
  if (!(await verifyReceipt(args.local_act_admit_receipt))) {
    throw new Error('INVALID_SLOW_WITNESS_ACT_RECEIPT');
  }
  if (!verifyFieldProjectionShape(args.field_projection)) {
    throw new Error('INVALID_SLOW_WITNESS_FIELD');
  }
  validateTimestamp(args.created_at);
  if (!SLOW_POSTURES.has(args.posture)) {
    throw new Error('INVALID_SLOW_WITNESS_POSTURE');
  }

  const origin = asRecord(args.origin_crossing, 'INVALID_SLOW_WITNESS_ORIGIN');
  const act = asRecord(args.local_act_crossing, 'INVALID_SLOW_WITNESS_ACT');
  const receipt = asRecord(
    args.local_act_admit_receipt,
    'INVALID_SLOW_WITNESS_ACT_RECEIPT',
  );
  const field = asRecord(args.field_projection, 'INVALID_SLOW_WITNESS_FIELD');

  if (
    act.declared_kind !== 'R13_LOCAL_ACT' ||
    receipt.kind !== 'R3_ADMIT' ||
    receipt.crossing_id !== act.crossing_id ||
    act.source_world !== field.world_id
  ) {
    throw new Error('SLOW_WITNESS_ACT_MISMATCH');
  }

  const pulse = asRecord(
    asRecord(act.extensions, 'INVALID_SLOW_WITNESS_ACT_EXTENSIONS')
      .composition_pulse,
    'INVALID_SLOW_WITNESS_ACT_EXTENSIONS',
  );
  if (
    pulse.origin_crossing_id !== origin.crossing_id ||
    pulse.field_projection_id !== field.projection_id
  ) {
    throw new Error('SLOW_WITNESS_LINEAGE_MISMATCH');
  }

  return sealReceipt({
    schema: 'relatte.receipt/v0',
    crossing_id: act.crossing_id,
    world_id: nonEmpty(
      args.witness_world_id,
      'INVALID_SLOW_WITNESS_WORLD',
    ),
    receiver_particular: nonEmpty(
      args.witness_particular,
      'INVALID_SLOW_WITNESS_PARTICULAR',
    ),
    kind: 'R13_SLOW_WITNESS',
    semantic_effect: 'none',
    contract_ref: 'relatte:r13-slow-developmental-witness/v0',
    pre_state_ref: field.projection_id,
    post_state_ref: field.projection_id,
    descendant_refs: [],
    residual_refs: [
      origin.crossing_id,
      receipt.receipt_id,
      field.projection_id,
    ],
    note: nonEmpty(args.observation, 'INVALID_SLOW_WITNESS_OBSERVATION'),
    created_at: args.created_at,
    extensions: {
      slow_witness: {
        posture: args.posture,
        origin_crossing_id: origin.crossing_id,
        local_act_crossing_id: act.crossing_id,
        local_act_admit_receipt_id: receipt.receipt_id,
        field_projection_id: field.projection_id,
        visible_from_here_then: true,
        source_authority: false,
        canonical_now: false,
        laws: [
          'WITNESS != SOURCE',
          'WITNESS != CANON',
          'VISIBLE THEN != CANON NOW',
          'PUBLISHED WITNESS != TRUTH',
        ],
      },
    },
  }, args.keys);
}

function questionIdentityBody(
  value: Omit<CompositionalQuestion, 'question_id'>,
): Omit<CompositionalQuestion, 'question_id'> {
  return {
    schema: 'relatte.compositional-question/v0',
    slow_witness_receipt_id: value.slow_witness_receipt_id,
    origin_crossing_id: value.origin_crossing_id,
    local_act_crossing_id: value.local_act_crossing_id,
    field_projection_id: value.field_projection_id,
    question: value.question,
    constraints: [...value.constraints],
    semantic_effect: 'none',
    authority: null,
    created_at: value.created_at,
    laws: [...value.laws],
  };
}

export async function createCompositionalQuestion(args: {
  slow_witness_receipt: unknown;
  question: string;
  constraints: string[];
  created_at: string;
}): Promise<CompositionalQuestion> {
  if (!(await verifyReceipt(args.slow_witness_receipt))) {
    throw new Error('INVALID_COMPOSITIONAL_WITNESS');
  }
  validateTimestamp(args.created_at);

  const witness = asRecord(
    args.slow_witness_receipt,
    'INVALID_COMPOSITIONAL_WITNESS',
  );
  if (
    witness.kind !== 'R13_SLOW_WITNESS' ||
    witness.semantic_effect !== 'none'
  ) {
    throw new Error('INVALID_COMPOSITIONAL_WITNESS_KIND');
  }

  const slow = asRecord(
    asRecord(witness.extensions, 'INVALID_COMPOSITIONAL_WITNESS_EXTENSIONS')
      .slow_witness,
    'INVALID_COMPOSITIONAL_WITNESS_EXTENSIONS',
  );

  const body: Omit<CompositionalQuestion, 'question_id'> = {
    schema: 'relatte.compositional-question/v0',
    slow_witness_receipt_id: nonEmpty(
      witness.receipt_id,
      'INVALID_COMPOSITIONAL_WITNESS_ID',
    ),
    origin_crossing_id: nonEmpty(
      slow.origin_crossing_id,
      'INVALID_COMPOSITIONAL_ORIGIN_ID',
    ),
    local_act_crossing_id: nonEmpty(
      slow.local_act_crossing_id,
      'INVALID_COMPOSITIONAL_ACT_ID',
    ),
    field_projection_id: nonEmpty(
      slow.field_projection_id,
      'INVALID_COMPOSITIONAL_FIELD_ID',
    ),
    question: nonEmpty(args.question, 'INVALID_COMPOSITIONAL_QUESTION'),
    constraints: stringArray(
      args.constraints,
      'INVALID_COMPOSITIONAL_CONSTRAINTS',
    ),
    semantic_effect: 'none',
    authority: null,
    created_at: args.created_at,
    laws: [
      'QUESTION != VERDICT',
      'QUESTION != AUTHORITY',
      'WITNESS != ANSWER',
      'COMPOSITION != CONSENSUS',
    ],
  };

  return {
    ...body,
    question_id: `relatte-compositional-question-v0:${sha256Hex(
      canonicalizeDomainValue(
        COMPOSITION_QUESTION_ID_DOMAIN,
        questionIdentityBody(body),
      ),
    )}`,
  };
}

export function verifyCompositionalQuestion(value: unknown): boolean {
  try {
    const question = asRecord(value, 'INVALID_COMPOSITIONAL_QUESTION');
    assertOnlyKeys(
      question,
      QUESTION_KEYS,
      'UNEXPECTED_COMPOSITIONAL_QUESTION_FIELD',
    );
    if (question.schema !== 'relatte.compositional-question/v0') return false;
    validateTimestamp(question.created_at);
    if (
      question.semantic_effect !== 'none' ||
      question.authority !== null
    ) {
      return false;
    }

    const body: Omit<CompositionalQuestion, 'question_id'> = {
      schema: 'relatte.compositional-question/v0',
      slow_witness_receipt_id: nonEmpty(
        question.slow_witness_receipt_id,
        'INVALID_COMPOSITIONAL_WITNESS_ID',
      ),
      origin_crossing_id: nonEmpty(
        question.origin_crossing_id,
        'INVALID_COMPOSITIONAL_ORIGIN_ID',
      ),
      local_act_crossing_id: nonEmpty(
        question.local_act_crossing_id,
        'INVALID_COMPOSITIONAL_ACT_ID',
      ),
      field_projection_id: nonEmpty(
        question.field_projection_id,
        'INVALID_COMPOSITIONAL_FIELD_ID',
      ),
      question: nonEmpty(
        question.question,
        'INVALID_COMPOSITIONAL_QUESTION_TEXT',
      ),
      constraints: stringArray(
        question.constraints,
        'INVALID_COMPOSITIONAL_CONSTRAINTS',
      ),
      semantic_effect: 'none',
      authority: null,
      created_at: question.created_at,
      laws: stringArray(question.laws, 'INVALID_COMPOSITIONAL_LAWS'),
    };

    return (
      typeof question.question_id === 'string' &&
      question.question_id ===
        `relatte-compositional-question-v0:${sha256Hex(
          canonicalizeDomainValue(
            COMPOSITION_QUESTION_ID_DOMAIN,
            questionIdentityBody(body),
          ),
        )}`
    );
  } catch {
    return false;
  }
}

export async function sealOwnerLocalAdaptation(args: {
  question: unknown;
  uptake: unknown;
  slow_witness_receipt: unknown;
  local_world_id: string;
  local_particular: string;
  response: string;
  keys: P256KeyMaterial;
  created_at: string;
}): Promise<Record<string, any>> {
  if (!verifyCompositionalQuestion(args.question)) {
    throw new Error('INVALID_PULSE_QUESTION');
  }
  if (!verifyCulturalUptakeShape(args.uptake)) {
    throw new Error('INVALID_PULSE_UPTAKE');
  }
  if (!(await verifyReceipt(args.slow_witness_receipt))) {
    throw new Error('INVALID_PULSE_SLOW_WITNESS');
  }
  validateTimestamp(args.created_at);

  const question = asRecord(args.question, 'INVALID_PULSE_QUESTION');
  const uptake = asRecord(args.uptake, 'INVALID_PULSE_UPTAKE');
  const witness = asRecord(
    args.slow_witness_receipt,
    'INVALID_PULSE_SLOW_WITNESS',
  );

  if (
    question.slow_witness_receipt_id !== witness.receipt_id ||
    question.origin_crossing_id !== uptake.ancestor_crossing_id ||
    question.field_projection_id !== uptake.field_projection_id ||
    uptake.world_id !== args.local_world_id ||
    uptake.local_particular !== args.local_particular
  ) {
    throw new Error('PULSE_ADAPTATION_LINEAGE_MISMATCH');
  }

  return sealReceipt({
    schema: 'relatte.receipt/v0',
    crossing_id: question.local_act_crossing_id,
    world_id: nonEmpty(
      args.local_world_id,
      'INVALID_PULSE_ADAPTATION_WORLD',
    ),
    receiver_particular: nonEmpty(
      args.local_particular,
      'INVALID_PULSE_ADAPTATION_PARTICULAR',
    ),
    kind: 'R13_ADAPTATION',
    semantic_effect: 'none',
    contract_ref: question.question_id,
    pre_state_ref: uptake.field_history_root,
    post_state_ref: uptake.field_history_root,
    descendant_refs: [],
    residual_refs: [
      uptake.uptake_id,
      witness.receipt_id,
      question.question_id,
    ],
    note: nonEmpty(args.response, 'INVALID_PULSE_ADAPTATION_RESPONSE'),
    created_at: args.created_at,
    extensions: {
      adaptation: {
        question_id: question.question_id,
        slow_witness_receipt_id: witness.receipt_id,
        uptake_id: uptake.uptake_id,
        field_projection_id: uptake.field_projection_id,
        authority: 'fresh-local',
        inherited_authority: false,
        field_authorized_action: false,
        witness_authorized_action: false,
        question_authorized_action: false,
        laws: [
          'QUESTION != AUTHORITY',
          'WITNESS != AUTHORITY',
          'FIELD != AUTHORITY',
          'ADAPTATION = FRESH LOCAL ACT',
        ],
      },
    },
  }, args.keys);
}

export async function buildPulseDescendantDraft(args: {
  descendant_draft: unknown;
  slow_witness_receipt: unknown;
  question: unknown;
  adaptation_receipt: unknown;
}): Promise<Record<string, any>> {
  if (!(await verifyReceipt(args.slow_witness_receipt))) {
    throw new Error('INVALID_PULSE_SLOW_WITNESS');
  }
  if (!verifyCompositionalQuestion(args.question)) {
    throw new Error('INVALID_PULSE_QUESTION');
  }
  if (!(await verifyReceipt(args.adaptation_receipt))) {
    throw new Error('INVALID_PULSE_ADAPTATION');
  }

  const draft = structuredClone(
    asRecord(args.descendant_draft, 'INVALID_PULSE_DESCENDANT_DRAFT'),
  );
  const witness = asRecord(
    args.slow_witness_receipt,
    'INVALID_PULSE_SLOW_WITNESS',
  );
  const question = asRecord(args.question, 'INVALID_PULSE_QUESTION');
  const adaptation = asRecord(
    args.adaptation_receipt,
    'INVALID_PULSE_ADAPTATION',
  );

  if (
    witness.kind !== 'R13_SLOW_WITNESS' ||
    adaptation.kind !== 'R13_ADAPTATION' ||
    question.slow_witness_receipt_id !== witness.receipt_id ||
    adaptation.contract_ref !== question.question_id
  ) {
    throw new Error('PULSE_DESCENDANT_LINEAGE_MISMATCH');
  }

  const cultural = asRecord(
    asRecord(draft.extensions, 'INVALID_PULSE_DESCENDANT_EXTENSIONS')
      .cultural_descendant,
    'INVALID_PULSE_DESCENDANT_EXTENSIONS',
  );
  const adaptationExtension = asRecord(
    asRecord(adaptation.extensions, 'INVALID_PULSE_ADAPTATION_EXTENSIONS')
      .adaptation,
    'INVALID_PULSE_ADAPTATION_EXTENSIONS',
  );

  if (adaptationExtension.uptake_id !== cultural.uptake_id) {
    throw new Error('PULSE_DESCENDANT_UPTAKE_MISMATCH');
  }

  draft.extensions = {
    ...asRecord(draft.extensions, 'INVALID_PULSE_DESCENDANT_EXTENSIONS'),
    composition_pulse: {
      phase: 'DESCENDANT',
      slow_witness_receipt_id: witness.receipt_id,
      question_id: question.question_id,
      adaptation_receipt_id: adaptation.receipt_id,
      uptake_id: cultural.uptake_id,
      inherited_authority: false,
      laws: [
        'QUESTION != AUTHORITY',
        'ADAPTATION != ANCESTOR',
        'DESCENDANT != ADMISSION',
      ],
    },
  };

  return draft;
}

export async function buildPulseReturnDraft(args: {
  origin_crossing: unknown;
  descendant_crossing: unknown;
  destination_world_id: string;
  destination_particular: string;
  created_at: string;
}): Promise<Record<string, unknown>> {
  if (!(await verifyCrossingEnvelope(args.origin_crossing))) {
    throw new Error('INVALID_PULSE_RETURN_ORIGIN');
  }
  if (!(await verifyCrossingEnvelope(args.descendant_crossing))) {
    throw new Error('INVALID_PULSE_RETURN_DESCENDANT');
  }
  validateTimestamp(args.created_at);

  const origin = asRecord(args.origin_crossing, 'INVALID_PULSE_RETURN_ORIGIN');
  const descendant = asRecord(
    args.descendant_crossing,
    'INVALID_PULSE_RETURN_DESCENDANT',
  );
  const returnAddress = nonEmpty(
    origin.return_address,
    'PULSE_ORIGIN_HAS_NO_RETURN_ADDRESS',
  );

  return {
    schema: 'relatte.crossing-envelope/v0',
    protocol_version: '0',
    source_particular: nonEmpty(
      args.destination_particular,
      'INVALID_PULSE_RETURN_PARTICULAR',
    ),
    source_world: nonEmpty(
      args.destination_world_id,
      'INVALID_PULSE_RETURN_WORLD',
    ),
    source_history_head: null,
    parents: [descendant.crossing_id],
    declared_kind: 'R13_RETURN',
    payload_refs: [{
      address: descendant.crossing_id,
      role: 'return-parent',
      media_type: 'application/vnd.relatte.crossing-id',
    }],
    requested_effect: {
      kind: 'candidate-return',
      authority: 'receiver-local',
    },
    capability_ref: null,
    privacy_policy: null,
    audience_policy: null,
    return_address: null,
    created_at: args.created_at,
    extensions: {
      composition_return: {
        to_return_address: returnAddress,
        origin_crossing_id: origin.crossing_id,
        descendant_crossing_id: descendant.crossing_id,
        inherited_authority: false,
        inherited_admission: false,
        laws: [
          'RETURN ADDRESS != RETURN AUTHORITY',
          'RETURN != ADMISSION',
          'DESCENDANT ADMIT != ORIGIN ADMIT',
        ],
      },
    },
  };
}

function pulseIdentityBody(
  value: Omit<CompositionPulseTrace, 'pulse_id'>,
): Omit<CompositionPulseTrace, 'pulse_id'> {
  return {
    schema: 'relatte.composition-pulse/v0',
    origin_crossing_id: value.origin_crossing_id,
    origin_admit_receipt_id: value.origin_admit_receipt_id,
    field_projection_id: value.field_projection_id,
    local_act_crossing_id: value.local_act_crossing_id,
    local_act_admit_receipt_id: value.local_act_admit_receipt_id,
    slow_witness_receipt_id: value.slow_witness_receipt_id,
    question_id: value.question_id,
    uptake_id: value.uptake_id,
    adaptation_receipt_id: value.adaptation_receipt_id,
    descendant_crossing_id: value.descendant_crossing_id,
    descendant_receive_receipt_id: value.descendant_receive_receipt_id,
    return_crossing_id: value.return_crossing_id,
    return_receive_receipt_id: value.return_receive_receipt_id,
    laws: [...value.laws],
  };
}

export async function assembleCompositionPulse(args: {
  origin_crossing: unknown;
  origin_admit_receipt: unknown;
  field_projection: unknown;
  local_act_crossing: unknown;
  local_act_admit_receipt: unknown;
  slow_witness_receipt: unknown;
  question: unknown;
  uptake: unknown;
  adaptation_receipt: unknown;
  descendant_crossing: unknown;
  descendant_receive_receipt: unknown;
  return_crossing: unknown;
  return_receive_receipt: unknown;
}): Promise<CompositionPulseTrace> {
  if (!(await verifyCrossingEnvelope(args.origin_crossing))) {
    throw new Error('INVALID_PULSE_ORIGIN');
  }
  if (!(await verifyReceipt(args.origin_admit_receipt))) {
    throw new Error('INVALID_PULSE_ORIGIN_ADMISSION');
  }
  if (!verifyFieldProjectionShape(args.field_projection)) {
    throw new Error('INVALID_PULSE_FIELD');
  }
  if (!(await verifyCrossingEnvelope(args.local_act_crossing))) {
    throw new Error('INVALID_PULSE_LOCAL_ACT');
  }
  if (!(await verifyReceipt(args.local_act_admit_receipt))) {
    throw new Error('INVALID_PULSE_LOCAL_ACT_RECEIPT');
  }
  if (!(await verifyReceipt(args.slow_witness_receipt))) {
    throw new Error('INVALID_PULSE_SLOW_WITNESS');
  }
  if (!verifyCompositionalQuestion(args.question)) {
    throw new Error('INVALID_PULSE_QUESTION');
  }
  if (!verifyCulturalUptakeShape(args.uptake)) {
    throw new Error('INVALID_PULSE_UPTAKE');
  }
  if (!(await verifyReceipt(args.adaptation_receipt))) {
    throw new Error('INVALID_PULSE_ADAPTATION');
  }
  if (!(await verifyCrossingEnvelope(args.descendant_crossing))) {
    throw new Error('INVALID_PULSE_DESCENDANT');
  }
  if (!(await verifyReceipt(args.descendant_receive_receipt))) {
    throw new Error('INVALID_PULSE_DESCENDANT_RECEIPT');
  }
  if (!(await verifyCrossingEnvelope(args.return_crossing))) {
    throw new Error('INVALID_PULSE_RETURN');
  }
  if (!(await verifyReceipt(args.return_receive_receipt))) {
    throw new Error('INVALID_PULSE_RETURN_RECEIPT');
  }

  const origin = asRecord(args.origin_crossing, 'INVALID_PULSE_ORIGIN');
  const originAdmit = asRecord(
    args.origin_admit_receipt,
    'INVALID_PULSE_ORIGIN_ADMISSION',
  );
  const field = asRecord(args.field_projection, 'INVALID_PULSE_FIELD');
  const act = asRecord(args.local_act_crossing, 'INVALID_PULSE_LOCAL_ACT');
  const actAdmit = asRecord(
    args.local_act_admit_receipt,
    'INVALID_PULSE_LOCAL_ACT_RECEIPT',
  );
  const witness = asRecord(
    args.slow_witness_receipt,
    'INVALID_PULSE_SLOW_WITNESS',
  );
  const question = asRecord(args.question, 'INVALID_PULSE_QUESTION');
  const uptake = asRecord(args.uptake, 'INVALID_PULSE_UPTAKE');
  const adaptation = asRecord(
    args.adaptation_receipt,
    'INVALID_PULSE_ADAPTATION',
  );
  const descendant = asRecord(
    args.descendant_crossing,
    'INVALID_PULSE_DESCENDANT',
  );
  const descendantReceive = asRecord(
    args.descendant_receive_receipt,
    'INVALID_PULSE_DESCENDANT_RECEIPT',
  );
  const returned = asRecord(args.return_crossing, 'INVALID_PULSE_RETURN');
  const returnReceive = asRecord(
    args.return_receive_receipt,
    'INVALID_PULSE_RETURN_RECEIPT',
  );

  if (
    originAdmit.kind !== 'R3_ADMIT' ||
    originAdmit.crossing_id !== origin.crossing_id ||
    !Array.isArray(field.admitted_receipt_ids) ||
    !field.admitted_receipt_ids.includes(originAdmit.receipt_id)
  ) {
    throw new Error('PULSE_ORIGIN_ADMISSION_MISMATCH');
  }

  const localActExtension = asRecord(
    asRecord(act.extensions, 'INVALID_PULSE_LOCAL_ACT_EXTENSIONS')
      .composition_pulse,
    'INVALID_PULSE_LOCAL_ACT_EXTENSIONS',
  );
  if (
    act.declared_kind !== 'R13_LOCAL_ACT' ||
    localActExtension.origin_crossing_id !== origin.crossing_id ||
    localActExtension.origin_admit_receipt_id !== originAdmit.receipt_id ||
    localActExtension.field_projection_id !== field.projection_id ||
    localActExtension.field_authorized_action !== false ||
    actAdmit.kind !== 'R3_ADMIT' ||
    actAdmit.crossing_id !== act.crossing_id
  ) {
    throw new Error('PULSE_LOCAL_ACT_MISMATCH');
  }

  const slow = asRecord(
    asRecord(witness.extensions, 'INVALID_PULSE_SLOW_WITNESS_EXTENSIONS')
      .slow_witness,
    'INVALID_PULSE_SLOW_WITNESS_EXTENSIONS',
  );
  if (
    witness.kind !== 'R13_SLOW_WITNESS' ||
    witness.crossing_id !== act.crossing_id ||
    slow.origin_crossing_id !== origin.crossing_id ||
    slow.local_act_admit_receipt_id !== actAdmit.receipt_id ||
    question.slow_witness_receipt_id !== witness.receipt_id ||
    question.origin_crossing_id !== origin.crossing_id ||
    question.local_act_crossing_id !== act.crossing_id ||
    question.field_projection_id !== field.projection_id
  ) {
    throw new Error('PULSE_WITNESS_QUESTION_MISMATCH');
  }

  const adaptationExtension = asRecord(
    asRecord(adaptation.extensions, 'INVALID_PULSE_ADAPTATION_EXTENSIONS')
      .adaptation,
    'INVALID_PULSE_ADAPTATION_EXTENSIONS',
  );
  if (
    adaptation.kind !== 'R13_ADAPTATION' ||
    adaptation.contract_ref !== question.question_id ||
    adaptation.crossing_id !== act.crossing_id ||
    adaptationExtension.uptake_id !== uptake.uptake_id ||
    adaptationExtension.question_id !== question.question_id ||
    adaptationExtension.authority !== 'fresh-local'
  ) {
    throw new Error('PULSE_ADAPTATION_MISMATCH');
  }

  if (
    !(await verifyCulturalDescendant({
      ancestor_crossing: args.origin_crossing,
      admitted_receipt: args.origin_admit_receipt,
      field_projection: args.field_projection,
      uptake: args.uptake,
      descendant_crossing: args.descendant_crossing,
    }))
  ) {
    throw new Error('INVALID_PULSE_CULTURAL_DESCENDANT');
  }

  const descendantPulse = asRecord(
    asRecord(descendant.extensions, 'INVALID_PULSE_DESCENDANT_EXTENSIONS')
      .composition_pulse,
    'INVALID_PULSE_DESCENDANT_EXTENSIONS',
  );
  if (
    descendantPulse.slow_witness_receipt_id !== witness.receipt_id ||
    descendantPulse.question_id !== question.question_id ||
    descendantPulse.adaptation_receipt_id !== adaptation.receipt_id ||
    descendantPulse.uptake_id !== uptake.uptake_id ||
    publicKeyIdentity(descendant.signing.public_key) !==
      publicKeyIdentity(adaptation.signing.public_key)
  ) {
    throw new Error('PULSE_DESCENDANT_ADAPTATION_MISMATCH');
  }

  if (
    descendantReceive.kind !== 'RECEIVED' ||
    descendantReceive.crossing_id !== descendant.crossing_id ||
    descendantReceive.semantic_effect !== 'none' ||
    descendantReceive.world_id === originAdmit.world_id
  ) {
    throw new Error('PULSE_DESCENDANT_RECEIVE_MISMATCH');
  }

  const returnExtension = asRecord(
    asRecord(returned.extensions, 'INVALID_PULSE_RETURN_EXTENSIONS')
      .composition_return,
    'INVALID_PULSE_RETURN_EXTENSIONS',
  );
  if (
    returned.declared_kind !== 'R13_RETURN' ||
    !Array.isArray(returned.parents) ||
    returned.parents.length !== 1 ||
    returned.parents[0] !== descendant.crossing_id ||
    returned.source_world !== descendantReceive.world_id ||
    returnExtension.origin_crossing_id !== origin.crossing_id ||
    returnExtension.descendant_crossing_id !== descendant.crossing_id ||
    returnExtension.to_return_address !== origin.return_address ||
    returnExtension.inherited_authority !== false ||
    returnExtension.inherited_admission !== false
  ) {
    throw new Error('PULSE_RETURN_MISMATCH');
  }

  if (
    returnReceive.kind !== 'RECEIVED' ||
    returnReceive.crossing_id !== returned.crossing_id ||
    returnReceive.world_id !== originAdmit.world_id ||
    returnReceive.semantic_effect !== 'none'
  ) {
    throw new Error('PULSE_RETURN_RECEIVE_MISMATCH');
  }

  const body: Omit<CompositionPulseTrace, 'pulse_id'> = {
    schema: 'relatte.composition-pulse/v0',
    origin_crossing_id: origin.crossing_id,
    origin_admit_receipt_id: originAdmit.receipt_id,
    field_projection_id: field.projection_id,
    local_act_crossing_id: act.crossing_id,
    local_act_admit_receipt_id: actAdmit.receipt_id,
    slow_witness_receipt_id: witness.receipt_id,
    question_id: question.question_id,
    uptake_id: uptake.uptake_id,
    adaptation_receipt_id: adaptation.receipt_id,
    descendant_crossing_id: descendant.crossing_id,
    descendant_receive_receipt_id: descendantReceive.receipt_id,
    return_crossing_id: returned.crossing_id,
    return_receive_receipt_id: returnReceive.receipt_id,
    laws: [
      'FIELD != AUTHORITY',
      'WITNESS != CANON',
      'QUESTION != AUTHORITY',
      'ADAPTATION = FRESH LOCAL ACT',
      'ANCESTRY != AUTHORITY',
      'DESCENDANT != ADMISSION',
      'RETURN != ADMISSION',
      'PULSE != CONSENSUS',
    ],
  };

  return {
    ...body,
    pulse_id: `relatte-composition-pulse-v0:${sha256Hex(
      canonicalizeDomainValue(
        COMPOSITION_PULSE_ID_DOMAIN,
        pulseIdentityBody(body),
      ),
    )}`,
  };
}

export function verifyCompositionPulseTrace(value: unknown): boolean {
  try {
    const trace = asRecord(value, 'INVALID_COMPOSITION_PULSE');
    assertOnlyKeys(
      trace,
      PULSE_TRACE_KEYS,
      'UNEXPECTED_COMPOSITION_PULSE_FIELD',
    );
    if (trace.schema !== 'relatte.composition-pulse/v0') return false;

    const body: Omit<CompositionPulseTrace, 'pulse_id'> = {
      schema: 'relatte.composition-pulse/v0',
      origin_crossing_id: nonEmpty(trace.origin_crossing_id, 'INVALID_PULSE_ORIGIN_ID'),
      origin_admit_receipt_id: nonEmpty(trace.origin_admit_receipt_id, 'INVALID_PULSE_ORIGIN_ADMIT_ID'),
      field_projection_id: nonEmpty(trace.field_projection_id, 'INVALID_PULSE_FIELD_ID'),
      local_act_crossing_id: nonEmpty(trace.local_act_crossing_id, 'INVALID_PULSE_ACT_ID'),
      local_act_admit_receipt_id: nonEmpty(trace.local_act_admit_receipt_id, 'INVALID_PULSE_ACT_ADMIT_ID'),
      slow_witness_receipt_id: nonEmpty(trace.slow_witness_receipt_id, 'INVALID_PULSE_WITNESS_ID'),
      question_id: nonEmpty(trace.question_id, 'INVALID_PULSE_QUESTION_ID'),
      uptake_id: nonEmpty(trace.uptake_id, 'INVALID_PULSE_UPTAKE_ID'),
      adaptation_receipt_id: nonEmpty(trace.adaptation_receipt_id, 'INVALID_PULSE_ADAPTATION_ID'),
      descendant_crossing_id: nonEmpty(trace.descendant_crossing_id, 'INVALID_PULSE_DESCENDANT_ID'),
      descendant_receive_receipt_id: nonEmpty(trace.descendant_receive_receipt_id, 'INVALID_PULSE_DESCENDANT_RECEIVE_ID'),
      return_crossing_id: nonEmpty(trace.return_crossing_id, 'INVALID_PULSE_RETURN_ID'),
      return_receive_receipt_id: nonEmpty(trace.return_receive_receipt_id, 'INVALID_PULSE_RETURN_RECEIVE_ID'),
      laws: stringArray(trace.laws, 'INVALID_PULSE_LAWS'),
    };

    return (
      typeof trace.pulse_id === 'string' &&
      trace.pulse_id ===
        `relatte-composition-pulse-v0:${sha256Hex(
          canonicalizeDomainValue(
            COMPOSITION_PULSE_ID_DOMAIN,
            pulseIdentityBody(body),
          ),
        )}`
    );
  } catch {
    return false;
  }
}
