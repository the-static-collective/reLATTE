import {
  canonicalize,
  canonicalizeDomainValue,
  sha256Hex,
  validateForCanonicalization,
  validateTimestamp,
} from './canonical.ts';
import {
  sealCrossingEnvelope,
  sealReceipt,
  verifyCrossingEnvelope,
  verifyReceipt,
} from './protocol.ts';
import type { P256KeyMaterial } from './protocol.ts';

export const TRANSLATE_THROUGH_ID_DOMAIN = 'reLATTE-TranslateThrough-v0|';

export const TRANSLATE_THROUGH_LAWS = [
  'THROUGH != TO',
  'ROUTE != ENDPOINT',
  'INTERMEDIATE != TEMPORARY',
  'RETURN != ORIGINAL',
  'DRIFT != FAILURE',
  'TRANSLATION != ADMISSION',
  'EXECUTOR != AUTHORITY',
  'SOURCE SURVIVES ROUTE',
  'EACH OBSERVED STAGE MUST BE ADDRESSABLE',
  'RECEIPT != SEMANTIC EQUIVALENCE',
  'ROUTE CHANGE != SAME OPERATION',
] as const;

export const TRANSLATE_THROUGH_STAGE_LAWS = [
  'STAGE RECEIPT != SEMANTIC EQUIVALENCE',
  'STAGE OUTPUT != ADMISSION',
  'EXECUTOR != AUTHORITY',
  'INPUT SURVIVES OUTPUT',
  'FAILED STAGE != ERASED HISTORY',
] as const;

export const TRANSLATE_THROUGH_ROUTE_RECEIPT_LAWS = [
  'ROUTE RECEIPT != SEMANTIC EQUIVALENCE',
  'COMPLETE != ADMITTED',
  'PARTIAL != FAILURE',
  'INTERMEDIATE OUTPUTS REMAIN ADDRESSABLE',
  'RETURN != ORIGINAL',
] as const;

const SPEC_KEYS = [
  'schema',
  'source_world',
  'source_particular',
  'source_history_head',
  'source_ref',
  'route',
  'policy',
  'return_address',
  'created_at',
] as const;

const SOURCE_REF_KEYS = ['address', 'media_type'] as const;
const STAGE_KEYS = [
  'stage_id',
  'domain',
  'representation',
  'role',
  'policy_ref',
] as const;
const POLICY_KEYS = [
  'preserve_intermediates',
  'require_stage_receipts',
  'semantic_equivalence_claim',
  'route_change',
  'outputs_are_descendants',
] as const;
const ATTACHMENT_KEYS = [
  'schema',
  'operation_id',
  'source_ref',
  'route',
  'policy',
  'laws',
] as const;
const STAGE_EXTENSION_KEYS = [
  'schema',
  'operation_id',
  'stage_index',
  'stage_id',
  'from',
  'to',
  'input_ref',
  'output_ref',
  'state',
  'prior_stage_receipt_id',
  'semantic_equivalence_claim',
  'laws',
] as const;
const ROUTE_RECEIPT_EXTENSION_KEYS = [
  'schema',
  'operation_id',
  'route_state',
  'stage_receipt_ids',
  'stage_output_refs',
  'completed_stage_count',
  'expected_stage_count',
  'last_addressable_ref',
  'semantic_equivalence_claim',
  'laws',
] as const;
const ROUTE_POINT_KEYS = [
  'stage_id',
  'domain',
  'representation',
  'role',
] as const;

const STAGE_ROLES = new Set(['source', 'through', 'target', 'return']);
const STAGE_STATES = new Set(['COMPLETE', 'HELD', 'REFUSED', 'FAILED']);

export interface TranslateThroughSourceRef {
  address: string;
  media_type: string;
}

export interface TranslateThroughStage {
  stage_id: string;
  domain: string;
  representation: string;
  role: 'source' | 'through' | 'target' | 'return';
  policy_ref: string | null;
}

export interface TranslateThroughPolicy {
  preserve_intermediates: true;
  require_stage_receipts: true;
  semantic_equivalence_claim: 'none';
  route_change: 'new-operation';
  outputs_are_descendants: true;
}

export interface TranslateThroughAttachment {
  schema: 'relatte.translate-through/v0';
  operation_id?: string;
  source_ref: TranslateThroughSourceRef;
  route: TranslateThroughStage[];
  policy: TranslateThroughPolicy;
  laws: string[];
}

export type TranslateThroughStageState =
  | 'COMPLETE'
  | 'HELD'
  | 'REFUSED'
  | 'FAILED';

export type TranslateThroughRouteState =
  | 'COMPLETE'
  | 'PARTIAL'
  | 'HELD'
  | 'REFUSED'
  | 'FAILED';

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

function nullableString(value: unknown, code: string): string | null {
  if (value === null) return null;
  return nonEmpty(value, code);
}

function exactStringArray(value: unknown, expected: readonly string[]): boolean {
  return Array.isArray(value) &&
    value.length === expected.length &&
    value.every((entry, index) => entry === expected[index]);
}

function normalizeSourceRef(value: unknown): TranslateThroughSourceRef {
  const source = asRecord(value, 'INVALID_TRANSLATE_THROUGH_SOURCE_REF');
  assertOnlyKeys(
    source,
    SOURCE_REF_KEYS,
    'UNEXPECTED_TRANSLATE_THROUGH_SOURCE_REF_FIELD',
  );
  return {
    address: nonEmpty(
      source.address,
      'INVALID_TRANSLATE_THROUGH_SOURCE_ADDRESS',
    ),
    media_type: nonEmpty(
      source.media_type,
      'INVALID_TRANSLATE_THROUGH_SOURCE_MEDIA_TYPE',
    ),
  };
}

function normalizeStage(
  value: unknown,
  index: number,
  count: number,
): TranslateThroughStage {
  const stage = asRecord(value, 'INVALID_TRANSLATE_THROUGH_STAGE');
  assertOnlyKeys(
    stage,
    STAGE_KEYS,
    'UNEXPECTED_TRANSLATE_THROUGH_STAGE_FIELD',
  );
  const role = nonEmpty(
    stage.role,
    'INVALID_TRANSLATE_THROUGH_STAGE_ROLE',
  );
  if (!STAGE_ROLES.has(role)) {
    throw new Error('INVALID_TRANSLATE_THROUGH_STAGE_ROLE');
  }

  if (index === 0 && role !== 'source') {
    throw new Error('TRANSLATE_THROUGH_ROUTE_MUST_START_AT_SOURCE');
  }
  if (index > 0 && index < count - 1 && role !== 'through') {
    throw new Error('TRANSLATE_THROUGH_INTERMEDIATE_MUST_BE_THROUGH');
  }
  if (
    index === count - 1 &&
    role !== 'target' &&
    role !== 'return'
  ) {
    throw new Error('TRANSLATE_THROUGH_ROUTE_MUST_END_AT_TARGET_OR_RETURN');
  }

  return {
    stage_id: nonEmpty(
      stage.stage_id,
      'INVALID_TRANSLATE_THROUGH_STAGE_ID',
    ),
    domain: nonEmpty(
      stage.domain,
      'INVALID_TRANSLATE_THROUGH_STAGE_DOMAIN',
    ),
    representation: nonEmpty(
      stage.representation,
      'INVALID_TRANSLATE_THROUGH_STAGE_REPRESENTATION',
    ),
    role: role as TranslateThroughStage['role'],
    policy_ref: nullableString(
      stage.policy_ref,
      'INVALID_TRANSLATE_THROUGH_STAGE_POLICY_REF',
    ),
  };
}

function normalizeRoute(value: unknown): TranslateThroughStage[] {
  if (!Array.isArray(value) || value.length < 3) {
    throw new Error('TRANSLATE_THROUGH_ROUTE_REQUIRES_THROUGH_STAGE');
  }
  const route = value.map((stage, index) =>
    normalizeStage(stage, index, value.length)
  );
  const ids = new Set(route.map((stage) => stage.stage_id));
  if (ids.size !== route.length) {
    throw new Error('DUPLICATE_TRANSLATE_THROUGH_STAGE_ID');
  }
  return route;
}

function normalizePolicy(value: unknown): TranslateThroughPolicy {
  const policy = asRecord(value, 'INVALID_TRANSLATE_THROUGH_POLICY');
  assertOnlyKeys(
    policy,
    POLICY_KEYS,
    'UNEXPECTED_TRANSLATE_THROUGH_POLICY_FIELD',
  );
  if (
    policy.preserve_intermediates !== true ||
    policy.require_stage_receipts !== true ||
    policy.semantic_equivalence_claim !== 'none' ||
    policy.route_change !== 'new-operation' ||
    policy.outputs_are_descendants !== true
  ) {
    throw new Error('INVALID_TRANSLATE_THROUGH_POLICY');
  }
  return {
    preserve_intermediates: true,
    require_stage_receipts: true,
    semantic_equivalence_claim: 'none',
    route_change: 'new-operation',
    outputs_are_descendants: true,
  };
}

function attachmentIdentityBody(
  value: Omit<TranslateThroughAttachment, 'operation_id'>,
): Omit<TranslateThroughAttachment, 'operation_id'> {
  return {
    schema: 'relatte.translate-through/v0',
    source_ref: structuredClone(value.source_ref),
    route: structuredClone(value.route),
    policy: structuredClone(value.policy),
    laws: [...value.laws],
  };
}

function createAttachmentFromParts(args: {
  source_ref: unknown;
  route: unknown;
  policy: unknown;
}): TranslateThroughAttachment {
  const sourceRef = normalizeSourceRef(args.source_ref);
  const route = normalizeRoute(args.route);
  const policy = normalizePolicy(args.policy);
  const body: Omit<TranslateThroughAttachment, 'operation_id'> = {
    schema: 'relatte.translate-through/v0',
    source_ref: sourceRef,
    route,
    policy,
    laws: [...TRANSLATE_THROUGH_LAWS],
  };
  validateForCanonicalization(body);
  return {
    ...body,
    operation_id: 'relatte-translate-through-v0:' + sha256Hex(
      canonicalizeDomainValue(
        TRANSLATE_THROUGH_ID_DOMAIN,
        attachmentIdentityBody(body),
      ),
    ),
  };
}

export function createTranslateThroughAttachment(
  specValue: unknown,
): TranslateThroughAttachment {
  const spec = asRecord(specValue, 'INVALID_TRANSLATE_THROUGH_SPEC');
  assertOnlyKeys(
    spec,
    SPEC_KEYS,
    'UNEXPECTED_TRANSLATE_THROUGH_SPEC_FIELD',
  );
  if (spec.schema !== 'relatte.translate-through-spec/v0') {
    throw new Error('INVALID_TRANSLATE_THROUGH_SPEC_SCHEMA');
  }
  return createAttachmentFromParts({
    source_ref: spec.source_ref,
    route: spec.route,
    policy: spec.policy,
  });
}

export async function sealTranslateThroughCrossing(
  specValue: unknown,
  keys: P256KeyMaterial,
): Promise<Record<string, any>> {
  const spec = asRecord(specValue, 'INVALID_TRANSLATE_THROUGH_SPEC');
  assertOnlyKeys(
    spec,
    SPEC_KEYS,
    'UNEXPECTED_TRANSLATE_THROUGH_SPEC_FIELD',
  );
  if (spec.schema !== 'relatte.translate-through-spec/v0') {
    throw new Error('INVALID_TRANSLATE_THROUGH_SPEC_SCHEMA');
  }
  validateTimestamp(
    nonEmpty(spec.created_at, 'INVALID_TRANSLATE_THROUGH_CREATED_AT'),
  );

  const attachment = createTranslateThroughAttachment(spec);
  const sourceRef = normalizeSourceRef(spec.source_ref);

  return sealCrossingEnvelope({
    schema: 'relatte.crossing-envelope/v0',
    protocol_version: '0',
    source_particular: nonEmpty(
      spec.source_particular,
      'INVALID_TRANSLATE_THROUGH_SOURCE_PARTICULAR',
    ),
    source_world: nonEmpty(
      spec.source_world,
      'INVALID_TRANSLATE_THROUGH_SOURCE_WORLD',
    ),
    source_history_head:
      spec.source_history_head === null
        ? null
        : nonEmpty(
            spec.source_history_head,
            'INVALID_TRANSLATE_THROUGH_SOURCE_HISTORY_HEAD',
          ),
    parents: [],
    declared_kind: 'TRANSLATE_THROUGH',
    payload_refs: [{
      address: sourceRef.address,
      role: 'translate-through-source',
      media_type: sourceRef.media_type,
    }],
    requested_effect: {
      kind: 'translate.through',
      operation_id: attachment.operation_id,
      authority: 'receiver-local',
    },
    capability_ref: null,
    privacy_policy: null,
    audience_policy: null,
    return_address:
      spec.return_address === null
        ? null
        : nonEmpty(
            spec.return_address,
            'INVALID_TRANSLATE_THROUGH_RETURN_ADDRESS',
          ),
    created_at: spec.created_at,
    extensions: {
      translate_through: attachment,
    },
  }, keys);
}

function attachmentFromCrossing(crossingValue: unknown): TranslateThroughAttachment {
  const crossing = asRecord(
    crossingValue,
    'INVALID_TRANSLATE_THROUGH_CROSSING',
  );
  const extensions = asRecord(
    crossing.extensions,
    'INVALID_TRANSLATE_THROUGH_EXTENSIONS',
  );
  const attachment = asRecord(
    extensions.translate_through,
    'INVALID_TRANSLATE_THROUGH_ATTACHMENT',
  );
  assertOnlyKeys(
    attachment,
    ATTACHMENT_KEYS,
    'UNEXPECTED_TRANSLATE_THROUGH_ATTACHMENT_FIELD',
  );
  if (attachment.schema !== 'relatte.translate-through/v0') {
    throw new Error('INVALID_TRANSLATE_THROUGH_ATTACHMENT_SCHEMA');
  }

  const rebuilt = createAttachmentFromParts({
    source_ref: attachment.source_ref,
    route: attachment.route,
    policy: attachment.policy,
  });
  if (
    typeof attachment.operation_id !== 'string' ||
    attachment.operation_id !== rebuilt.operation_id ||
    !exactStringArray(attachment.laws, TRANSLATE_THROUGH_LAWS) ||
    canonicalize(attachment) !== canonicalize(rebuilt)
  ) {
    throw new Error('INVALID_TRANSLATE_THROUGH_ATTACHMENT');
  }
  return rebuilt;
}

export async function verifyTranslateThroughCrossing(
  crossingValue: unknown,
): Promise<boolean> {
  try {
    if (!(await verifyCrossingEnvelope(crossingValue))) return false;
    const crossing = asRecord(
      crossingValue,
      'INVALID_TRANSLATE_THROUGH_CROSSING',
    );
    if (crossing.declared_kind !== 'TRANSLATE_THROUGH') return false;

    const attachment = attachmentFromCrossing(crossing);
    if (
      !Array.isArray(crossing.payload_refs) ||
      crossing.payload_refs.length !== 1
    ) {
      return false;
    }
    const payload = asRecord(
      crossing.payload_refs[0],
      'INVALID_TRANSLATE_THROUGH_PAYLOAD',
    );
    if (
      payload.address !== attachment.source_ref.address ||
      payload.media_type !== attachment.source_ref.media_type ||
      payload.role !== 'translate-through-source'
    ) {
      return false;
    }

    const effect = asRecord(
      crossing.requested_effect,
      'INVALID_TRANSLATE_THROUGH_EFFECT',
    );
    return (
      Object.keys(effect).sort().join('|') ===
        ['authority', 'kind', 'operation_id'].sort().join('|') &&
      effect.kind === 'translate.through' &&
      effect.operation_id === attachment.operation_id &&
      effect.authority === 'receiver-local'
    );
  } catch {
    return false;
  }
}

function routePoint(stage: TranslateThroughStage): Record<string, string> {
  return {
    stage_id: stage.stage_id,
    domain: stage.domain,
    representation: stage.representation,
    role: stage.role,
  };
}

function normalizeRoutePoint(
  value: unknown,
  code: string,
): Record<string, string> {
  const point = asRecord(value, code);
  assertOnlyKeys(point, ROUTE_POINT_KEYS, code);
  return {
    stage_id: nonEmpty(point.stage_id, code),
    domain: nonEmpty(point.domain, code),
    representation: nonEmpty(point.representation, code),
    role: nonEmpty(point.role, code),
  };
}

function mapStageState(
  state: TranslateThroughStageState,
): { kind: string; semantic_effect: string } {
  if (state === 'COMPLETE') {
    return { kind: 'EXECUTED', semantic_effect: 'descendant-created' };
  }
  if (state === 'HELD') {
    return { kind: 'HELD', semantic_effect: 'none' };
  }
  if (state === 'REFUSED') {
    return { kind: 'REFUSED', semantic_effect: 'none' };
  }
  return { kind: 'FAILED', semantic_effect: 'none' };
}

function stageExtension(receiptValue: unknown): Record<string, any> {
  const receipt = asRecord(
    receiptValue,
    'INVALID_TRANSLATE_THROUGH_STAGE_RECEIPT',
  );
  const extensions = asRecord(
    receipt.extensions,
    'INVALID_TRANSLATE_THROUGH_STAGE_EXTENSIONS',
  );
  const extension = asRecord(
    extensions.translate_through_stage,
    'INVALID_TRANSLATE_THROUGH_STAGE_EXTENSION',
  );
  assertOnlyKeys(
    extension,
    STAGE_EXTENSION_KEYS,
    'UNEXPECTED_TRANSLATE_THROUGH_STAGE_EXTENSION_FIELD',
  );
  if (extension.schema !== 'relatte.translate-through-stage-receipt/v0') {
    throw new Error('INVALID_TRANSLATE_THROUGH_STAGE_EXTENSION_SCHEMA');
  }
  return extension;
}

function validateStageExtensionAgainstRoute(
  extension: Record<string, any>,
  attachment: TranslateThroughAttachment,
): {
  stageIndex: number;
  state: TranslateThroughStageState;
  inputRef: string;
  outputRef: string | null;
} {
  if (
    typeof extension.stage_index !== 'number' ||
    !Number.isInteger(extension.stage_index) ||
    extension.stage_index < 1 ||
    extension.stage_index >= attachment.route.length
  ) {
    throw new Error('INVALID_TRANSLATE_THROUGH_STAGE_INDEX');
  }
  const stageIndex = extension.stage_index;
  const from = attachment.route[stageIndex - 1];
  const to = attachment.route[stageIndex];
  const state = nonEmpty(
    extension.state,
    'INVALID_TRANSLATE_THROUGH_STAGE_STATE',
  );
  if (!STAGE_STATES.has(state)) {
    throw new Error('INVALID_TRANSLATE_THROUGH_STAGE_STATE');
  }

  const normalizedFrom = normalizeRoutePoint(
    extension.from,
    'INVALID_TRANSLATE_THROUGH_STAGE_FROM',
  );
  const normalizedTo = normalizeRoutePoint(
    extension.to,
    'INVALID_TRANSLATE_THROUGH_STAGE_TO',
  );

  if (
    extension.operation_id !== attachment.operation_id ||
    extension.stage_id !== to.stage_id ||
    canonicalize(normalizedFrom) !== canonicalize(routePoint(from)) ||
    canonicalize(normalizedTo) !== canonicalize(routePoint(to)) ||
    extension.semantic_equivalence_claim !== 'none' ||
    !exactStringArray(
      extension.laws,
      TRANSLATE_THROUGH_STAGE_LAWS,
    )
  ) {
    throw new Error('TRANSLATE_THROUGH_STAGE_ROUTE_MISMATCH');
  }

  const inputRef = nonEmpty(
    extension.input_ref,
    'INVALID_TRANSLATE_THROUGH_STAGE_INPUT_REF',
  );
  const outputRef =
    extension.output_ref === null
      ? null
      : nonEmpty(
          extension.output_ref,
          'INVALID_TRANSLATE_THROUGH_STAGE_OUTPUT_REF',
        );
  if (state === 'COMPLETE' && outputRef === null) {
    throw new Error('COMPLETE_TRANSLATE_THROUGH_STAGE_REQUIRES_OUTPUT');
  }
  if (state !== 'COMPLETE' && outputRef !== null) {
    throw new Error('NONCOMPLETE_TRANSLATE_THROUGH_STAGE_FORBIDS_OUTPUT');
  }

  return {
    stageIndex,
    state: state as TranslateThroughStageState,
    inputRef,
    outputRef,
  };
}

export async function sealTranslateThroughStageReceipt(args: {
  crossing: unknown;
  stage_index: number;
  input_ref: string;
  output_ref: string | null;
  state: TranslateThroughStageState;
  world_id: string;
  receiver_particular: string;
  prior_stage_receipt?: unknown | null;
  note?: string | null;
  created_at: string;
  keys: P256KeyMaterial;
}): Promise<Record<string, any>> {
  if (!(await verifyTranslateThroughCrossing(args.crossing))) {
    throw new Error('INVALID_TRANSLATE_THROUGH_CROSSING');
  }
  validateTimestamp(args.created_at);
  const crossing = asRecord(
    args.crossing,
    'INVALID_TRANSLATE_THROUGH_CROSSING',
  );
  const attachment = attachmentFromCrossing(crossing);

  if (
    !Number.isInteger(args.stage_index) ||
    args.stage_index < 1 ||
    args.stage_index >= attachment.route.length
  ) {
    throw new Error('INVALID_TRANSLATE_THROUGH_STAGE_INDEX');
  }
  if (!STAGE_STATES.has(args.state)) {
    throw new Error('INVALID_TRANSLATE_THROUGH_STAGE_STATE');
  }

  const inputRef = nonEmpty(
    args.input_ref,
    'INVALID_TRANSLATE_THROUGH_STAGE_INPUT_REF',
  );
  const outputRef =
    args.output_ref === null
      ? null
      : nonEmpty(
          args.output_ref,
          'INVALID_TRANSLATE_THROUGH_STAGE_OUTPUT_REF',
        );

  let priorReceiptId: string | null = null;
  if (args.stage_index === 1) {
    if (args.prior_stage_receipt !== undefined &&
        args.prior_stage_receipt !== null) {
      throw new Error('FIRST_TRANSLATE_THROUGH_STAGE_FORBIDS_PRIOR');
    }
    if (inputRef !== attachment.source_ref.address) {
      throw new Error('FIRST_TRANSLATE_THROUGH_STAGE_INPUT_MUST_BE_SOURCE');
    }
  } else {
    if (args.prior_stage_receipt === undefined ||
        args.prior_stage_receipt === null) {
      throw new Error('TRANSLATE_THROUGH_STAGE_REQUIRES_PRIOR');
    }
    if (!(await verifyReceipt(args.prior_stage_receipt))) {
      throw new Error('INVALID_TRANSLATE_THROUGH_PRIOR_RECEIPT');
    }
    const prior = asRecord(
      args.prior_stage_receipt,
      'INVALID_TRANSLATE_THROUGH_PRIOR_RECEIPT',
    );
    if (prior.crossing_id !== crossing.crossing_id) {
      throw new Error('TRANSLATE_THROUGH_PRIOR_CROSSING_MISMATCH');
    }
    const priorExtension = stageExtension(prior);
    const priorState = validateStageExtensionAgainstRoute(
      priorExtension,
      attachment,
    );
    if (
      priorState.stageIndex !== args.stage_index - 1 ||
      priorState.state !== 'COMPLETE' ||
      priorState.outputRef !== inputRef
    ) {
      throw new Error('TRANSLATE_THROUGH_STAGE_CHAIN_MISMATCH');
    }
    priorReceiptId = nonEmpty(
      prior.receipt_id,
      'INVALID_TRANSLATE_THROUGH_PRIOR_RECEIPT_ID',
    );
  }

  if (args.state === 'COMPLETE' && outputRef === null) {
    throw new Error('COMPLETE_TRANSLATE_THROUGH_STAGE_REQUIRES_OUTPUT');
  }
  if (args.state !== 'COMPLETE' && outputRef !== null) {
    throw new Error('NONCOMPLETE_TRANSLATE_THROUGH_STAGE_FORBIDS_OUTPUT');
  }

  const mapping = mapStageState(args.state);
  const from = attachment.route[args.stage_index - 1];
  const to = attachment.route[args.stage_index];

  return sealReceipt({
    schema: 'relatte.receipt/v0',
    crossing_id: crossing.crossing_id,
    world_id: nonEmpty(
      args.world_id,
      'INVALID_TRANSLATE_THROUGH_STAGE_WORLD',
    ),
    receiver_particular: nonEmpty(
      args.receiver_particular,
      'INVALID_TRANSLATE_THROUGH_STAGE_RECEIVER',
    ),
    kind: mapping.kind,
    semantic_effect: mapping.semantic_effect,
    contract_ref: null,
    pre_state_ref: inputRef,
    post_state_ref: outputRef,
    descendant_refs: outputRef === null ? [] : [outputRef],
    residual_refs: [inputRef],
    note: args.note ?? null,
    created_at: args.created_at,
    extensions: {
      translate_through_stage: {
        schema: 'relatte.translate-through-stage-receipt/v0',
        operation_id: attachment.operation_id,
        stage_index: args.stage_index,
        stage_id: to.stage_id,
        from: routePoint(from),
        to: routePoint(to),
        input_ref: inputRef,
        output_ref: outputRef,
        state: args.state,
        prior_stage_receipt_id: priorReceiptId,
        semantic_equivalence_claim: 'none',
        laws: [...TRANSLATE_THROUGH_STAGE_LAWS],
      },
    },
  }, args.keys);
}

export async function verifyTranslateThroughStageReceipt(args: {
  crossing: unknown;
  receipt: unknown;
  prior_stage_receipt?: unknown | null;
}): Promise<boolean> {
  try {
    if (!(await verifyTranslateThroughCrossing(args.crossing))) return false;
    if (!(await verifyReceipt(args.receipt))) return false;
    const crossing = asRecord(
      args.crossing,
      'INVALID_TRANSLATE_THROUGH_CROSSING',
    );
    const receipt = asRecord(
      args.receipt,
      'INVALID_TRANSLATE_THROUGH_STAGE_RECEIPT',
    );
    if (receipt.crossing_id !== crossing.crossing_id) return false;

    const attachment = attachmentFromCrossing(crossing);
    const extension = stageExtension(receipt);
    const validated = validateStageExtensionAgainstRoute(
      extension,
      attachment,
    );
    const mapping = mapStageState(validated.state);

    if (
      receipt.kind !== mapping.kind ||
      receipt.semantic_effect !== mapping.semantic_effect ||
      receipt.pre_state_ref !== validated.inputRef ||
      receipt.post_state_ref !== validated.outputRef ||
      canonicalize(receipt.descendant_refs) !== canonicalize(
        validated.outputRef === null ? [] : [validated.outputRef],
      ) ||
      canonicalize(receipt.residual_refs) !== canonicalize(
        [validated.inputRef],
      )
    ) {
      return false;
    }

    if (validated.stageIndex === 1) {
      return (
        extension.prior_stage_receipt_id === null &&
        validated.inputRef === attachment.source_ref.address &&
        (args.prior_stage_receipt === undefined ||
          args.prior_stage_receipt === null)
      );
    }

    if (args.prior_stage_receipt === undefined ||
        args.prior_stage_receipt === null) {
      return false;
    }
    if (!(await verifyReceipt(args.prior_stage_receipt))) return false;
    const prior = asRecord(
      args.prior_stage_receipt,
      'INVALID_TRANSLATE_THROUGH_PRIOR_RECEIPT',
    );
    if (prior.crossing_id !== crossing.crossing_id) return false;
    const priorExtension = stageExtension(prior);
    const priorValidated = validateStageExtensionAgainstRoute(
      priorExtension,
      attachment,
    );

    return (
      extension.prior_stage_receipt_id === prior.receipt_id &&
      priorValidated.stageIndex === validated.stageIndex - 1 &&
      priorValidated.state === 'COMPLETE' &&
      priorValidated.outputRef === validated.inputRef
    );
  } catch {
    return false;
  }
}

function deriveRouteState(
  attachment: TranslateThroughAttachment,
  stageReceipts: Record<string, any>[],
): TranslateThroughRouteState {
  if (stageReceipts.length === 0) return 'PARTIAL';
  const last = stageExtension(stageReceipts[stageReceipts.length - 1]);
  const validated = validateStageExtensionAgainstRoute(last, attachment);
  if (
    stageReceipts.length === attachment.route.length - 1 &&
    validated.state === 'COMPLETE'
  ) {
    return 'COMPLETE';
  }
  if (validated.state === 'HELD') return 'HELD';
  if (validated.state === 'REFUSED') return 'REFUSED';
  if (validated.state === 'FAILED') return 'FAILED';
  return 'PARTIAL';
}

function routeReceiptMapping(
  state: TranslateThroughRouteState,
  finalRole: TranslateThroughStage['role'],
): { kind: string; semantic_effect: string } {
  if (state === 'COMPLETE') {
    return {
      kind: 'EXECUTED',
      semantic_effect:
        finalRole === 'return' ? 'return-created' : 'descendant-created',
    };
  }
  if (state === 'HELD') return { kind: 'HELD', semantic_effect: 'none' };
  if (state === 'REFUSED') {
    return { kind: 'REFUSED', semantic_effect: 'none' };
  }
  if (state === 'FAILED') {
    return { kind: 'FAILED', semantic_effect: 'none' };
  }
  return { kind: 'CHECKPOINTED', semantic_effect: 'none' };
}

async function verifiedStageChain(args: {
  crossing: unknown;
  stage_receipts: unknown[];
}): Promise<{
  receipts: Record<string, any>[];
  attachment: TranslateThroughAttachment;
  outputRefs: string[];
  lastAddressableRef: string;
}> {
  if (!(await verifyTranslateThroughCrossing(args.crossing))) {
    throw new Error('INVALID_TRANSLATE_THROUGH_CROSSING');
  }
  const crossing = asRecord(
    args.crossing,
    'INVALID_TRANSLATE_THROUGH_CROSSING',
  );
  const attachment = attachmentFromCrossing(crossing);
  if (args.stage_receipts.length > attachment.route.length - 1) {
    throw new Error('TOO_MANY_TRANSLATE_THROUGH_STAGE_RECEIPTS');
  }

  const receipts: Record<string, any>[] = [];
  const outputRefs: string[] = [];
  let prior: Record<string, any> | null = null;
  let lastAddressableRef = attachment.source_ref.address;

  for (let index = 0; index < args.stage_receipts.length; index++) {
    const receipt = asRecord(
      args.stage_receipts[index],
      'INVALID_TRANSLATE_THROUGH_STAGE_RECEIPT',
    );
    if (
      !(await verifyTranslateThroughStageReceipt({
        crossing,
        receipt,
        prior_stage_receipt: prior,
      }))
    ) {
      throw new Error('INVALID_TRANSLATE_THROUGH_STAGE_CHAIN');
    }
    const extension = stageExtension(receipt);
    if (extension.stage_index !== index + 1) {
      throw new Error('TRANSLATE_THROUGH_STAGE_CHAIN_GAP');
    }
    const validated = validateStageExtensionAgainstRoute(
      extension,
      attachment,
    );
    if (validated.outputRef !== null) {
      outputRefs.push(validated.outputRef);
      lastAddressableRef = validated.outputRef;
    }
    receipts.push(receipt);
    prior = receipt;

    if (
      validated.state !== 'COMPLETE' &&
      index !== args.stage_receipts.length - 1
    ) {
      throw new Error('TRANSLATE_THROUGH_TERMINAL_STAGE_NOT_LAST');
    }
  }

  return {
    receipts,
    attachment,
    outputRefs,
    lastAddressableRef,
  };
}

function routeReceiptExtension(receiptValue: unknown): Record<string, any> {
  const receipt = asRecord(
    receiptValue,
    'INVALID_TRANSLATE_THROUGH_ROUTE_RECEIPT',
  );
  const extensions = asRecord(
    receipt.extensions,
    'INVALID_TRANSLATE_THROUGH_ROUTE_EXTENSIONS',
  );
  const extension = asRecord(
    extensions.translate_through_route,
    'INVALID_TRANSLATE_THROUGH_ROUTE_EXTENSION',
  );
  assertOnlyKeys(
    extension,
    ROUTE_RECEIPT_EXTENSION_KEYS,
    'UNEXPECTED_TRANSLATE_THROUGH_ROUTE_EXTENSION_FIELD',
  );
  if (extension.schema !== 'relatte.translate-through-route-receipt/v0') {
    throw new Error('INVALID_TRANSLATE_THROUGH_ROUTE_EXTENSION_SCHEMA');
  }
  return extension;
}

export async function sealTranslateThroughRouteReceipt(args: {
  crossing: unknown;
  stage_receipts: unknown[];
  world_id: string;
  receiver_particular: string;
  note?: string | null;
  created_at: string;
  keys: P256KeyMaterial;
}): Promise<Record<string, any>> {
  validateTimestamp(args.created_at);
  const crossing = asRecord(
    args.crossing,
    'INVALID_TRANSLATE_THROUGH_CROSSING',
  );
  const chain = await verifiedStageChain({
    crossing,
    stage_receipts: args.stage_receipts,
  });
  const routeState = deriveRouteState(
    chain.attachment,
    chain.receipts,
  );

  const mapping = routeReceiptMapping(
    routeState,
    chain.attachment.route[chain.attachment.route.length - 1].role,
  );

  return sealReceipt({
    schema: 'relatte.receipt/v0',
    crossing_id: crossing.crossing_id,
    world_id: nonEmpty(
      args.world_id,
      'INVALID_TRANSLATE_THROUGH_ROUTE_WORLD',
    ),
    receiver_particular: nonEmpty(
      args.receiver_particular,
      'INVALID_TRANSLATE_THROUGH_ROUTE_RECEIVER',
    ),
    kind: mapping.kind,
    semantic_effect: mapping.semantic_effect,
    contract_ref: null,
    pre_state_ref: chain.attachment.source_ref.address,
    post_state_ref: chain.lastAddressableRef,
    descendant_refs: [...chain.outputRefs],
    residual_refs: [chain.attachment.source_ref.address],
    note: args.note ?? null,
    created_at: args.created_at,
    extensions: {
      translate_through_route: {
        schema: 'relatte.translate-through-route-receipt/v0',
        operation_id: chain.attachment.operation_id,
        route_state: routeState,
        stage_receipt_ids: chain.receipts.map((receipt) =>
          nonEmpty(
            receipt.receipt_id,
            'INVALID_TRANSLATE_THROUGH_STAGE_RECEIPT_ID',
          )
        ),
        stage_output_refs: [...chain.outputRefs],
        completed_stage_count: chain.receipts.filter((receipt) =>
          stageExtension(receipt).state === 'COMPLETE'
        ).length,
        expected_stage_count: chain.attachment.route.length - 1,
        last_addressable_ref: chain.lastAddressableRef,
        semantic_equivalence_claim: 'none',
        laws: [...TRANSLATE_THROUGH_ROUTE_RECEIPT_LAWS],
      },
    },
  }, args.keys);
}

export async function verifyTranslateThroughRouteReceipt(args: {
  crossing: unknown;
  stage_receipts: unknown[];
  receipt: unknown;
}): Promise<boolean> {
  try {
    if (!(await verifyReceipt(args.receipt))) return false;
    const crossing = asRecord(
      args.crossing,
      'INVALID_TRANSLATE_THROUGH_CROSSING',
    );
    const receipt = asRecord(
      args.receipt,
      'INVALID_TRANSLATE_THROUGH_ROUTE_RECEIPT',
    );
    if (receipt.crossing_id !== crossing.crossing_id) return false;

    const chain = await verifiedStageChain({
      crossing,
      stage_receipts: args.stage_receipts,
    });
    const routeState = deriveRouteState(
      chain.attachment,
      chain.receipts,
    );
    const mapping = routeReceiptMapping(
      routeState,
      chain.attachment.route[chain.attachment.route.length - 1].role,
    );
    const extension = routeReceiptExtension(receipt);

    if (
      extension.operation_id !== chain.attachment.operation_id ||
      extension.route_state !== routeState ||
      extension.completed_stage_count !== chain.receipts.filter((entry) =>
        stageExtension(entry).state === 'COMPLETE'
      ).length ||
      extension.expected_stage_count !== chain.attachment.route.length - 1 ||
      extension.last_addressable_ref !== chain.lastAddressableRef ||
      extension.semantic_equivalence_claim !== 'none' ||
      !exactStringArray(
        extension.laws,
        TRANSLATE_THROUGH_ROUTE_RECEIPT_LAWS,
      )
    ) {
      return false;
    }

    const expectedReceiptIds = chain.receipts.map((entry) => entry.receipt_id);
    if (
      canonicalize(extension.stage_receipt_ids) !==
        canonicalize(expectedReceiptIds) ||
      canonicalize(extension.stage_output_refs) !==
        canonicalize(chain.outputRefs) ||
      receipt.kind !== mapping.kind ||
      receipt.semantic_effect !== mapping.semantic_effect ||
      receipt.pre_state_ref !== chain.attachment.source_ref.address ||
      receipt.post_state_ref !== chain.lastAddressableRef ||
      canonicalize(receipt.descendant_refs) !== canonicalize(chain.outputRefs) ||
      canonicalize(receipt.residual_refs) !== canonicalize(
        [chain.attachment.source_ref.address],
      )
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
