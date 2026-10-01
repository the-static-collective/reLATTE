export const COM5_ROLES = [
  'COMPOST',
  'COMPOSE',
  'COMPUTE',
  'COMMUTE',
  'COMMUNE',
] as const;

export type Com5Role = (typeof COM5_ROLES)[number];

export interface Com5Observation {
  role: Com5Role;
  subject: string;
  relation?: string;
  evidence_refs?: readonly string[];
  note?: string;
}

export type Com5Projection = Readonly<Record<Com5Role, readonly Com5Observation[]>>;

function assertNonEmpty(value: string, field: string): void {
  if (value.trim().length === 0) throw new Error(`INVALID_COM5_${field.toUpperCase()}`);
}

function validateObservation(observation: Com5Observation): void {
  if (!COM5_ROLES.includes(observation.role)) throw new Error('INVALID_COM5_ROLE');
  assertNonEmpty(observation.subject, 'subject');

  if (observation.relation !== undefined) assertNonEmpty(observation.relation, 'relation');
  if (observation.note !== undefined) assertNonEmpty(observation.note, 'note');

  for (const ref of observation.evidence_refs ?? []) {
    assertNonEmpty(ref, 'evidence_ref');
  }
}

/**
 * Build a derived COM⁵ view over explicitly supplied observations.
 *
 * This function does not infer protocol truth, lifecycle state, ancestry,
 * authority, or admission. A subject may lawfully appear in multiple roles.
 */
export function projectCom5(
  observations: readonly Com5Observation[],
): Com5Projection {
  const grouped: Record<Com5Role, Com5Observation[]> = {
    COMPOST: [],
    COMPOSE: [],
    COMPUTE: [],
    COMMUTE: [],
    COMMUNE: [],
  };

  for (const observation of observations) {
    validateObservation(observation);
    grouped[observation.role].push({
      ...observation,
      evidence_refs: observation.evidence_refs === undefined
        ? undefined
        : [...observation.evidence_refs],
    });
  }

  return grouped;
}

function renderObservation(observation: Com5Observation): string {
  const relation = observation.relation === undefined ? '' : ` --${observation.relation}-->`;
  const refs = observation.evidence_refs?.length
    ? ` [evidence: ${observation.evidence_refs.join(', ')}]`
    : '';
  const note = observation.note === undefined ? '' : ` — ${observation.note}`;
  return `  ${observation.subject}${relation}${refs}${note}`;
}

/**
 * Render an observability trace in stable COM⁵ order.
 *
 * Rendering is intentionally non-authoritative: it reports the observations
 * supplied by the caller and does not modify protocol objects.
 */
export function renderCom5Trace(
  observations: readonly Com5Observation[],
): string {
  const projection = projectCom5(observations);
  const lines = ['COM⁵ metabolic projection'];

  for (const role of COM5_ROLES) {
    lines.push('', role);
    const entries = projection[role];
    if (entries.length === 0) {
      lines.push('  (none observed)');
      continue;
    }
    for (const observation of entries) {
      lines.push(renderObservation(observation));
    }
  }

  return lines.join('\n');
}
