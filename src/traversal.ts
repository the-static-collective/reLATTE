import type { Com5Observation } from './com5.ts';
import {
  buildVerifiedMetabolicNeighborhood,
  type VerifiedMetabolicNeighborhood,
} from './neighborhood.ts';

export interface VerifiedTraversalStep {
  from_subject: string;
  to_subject: string;
  road_observations: readonly Com5Observation[];
  from: VerifiedMetabolicNeighborhood;
  to: VerifiedMetabolicNeighborhood;
}

export interface VerifiedMetabolicWalk {
  subjects: readonly string[];
  steps: readonly VerifiedTraversalStep[];
  current: VerifiedMetabolicNeighborhood;
}

function assertSubject(subject: string): void {
  if (subject.trim().length === 0) throw new Error('INVALID_TRAVERSAL_SUBJECT');
}

function roadObservations(
  fromSubject: string,
  toSubject: string,
  observations: readonly Com5Observation[],
): Com5Observation[] {
  return observations.filter(
    (observation) =>
      observation.subject === fromSubject
      && (observation.evidence_refs ?? []).includes(toSubject),
  );
}

/**
 * Re-center from one verified COM⁵ room to one direct attributable neighbor.
 *
 * The destination must already appear in the source room's verified one-hop
 * neighbor refs. This prevents arbitrary graph-shaped teleportation.
 */
export async function openVerifiedNeighbor(
  fromSubject: string,
  toSubject: string,
  records: readonly unknown[],
): Promise<VerifiedTraversalStep> {
  assertSubject(fromSubject);
  assertSubject(toSubject);

  const from = await buildVerifiedMetabolicNeighborhood(fromSubject, records);

  if (!from.neighbor_refs.includes(toSubject)) {
    throw new Error('NON_NEIGHBOR_TRAVERSAL');
  }

  const road = roadObservations(fromSubject, toSubject, from.observations);
  if (road.length === 0) {
    throw new Error('UNEXPLAINED_NEIGHBOR');
  }

  const to = await buildVerifiedMetabolicNeighborhood(toSubject, records);

  return {
    from_subject: fromSubject,
    to_subject: toSubject,
    road_observations: road,
    from,
    to,
  };
}

/**
 * Walk an explicitly chosen subject path against one fixed supplied history cut.
 *
 * Every hop is independently re-derived from the same records. A later subject
 * cannot retroactively create an earlier road.
 */
export async function walkVerifiedMetabolicPath(
  subjects: readonly string[],
  records: readonly unknown[],
): Promise<VerifiedMetabolicWalk> {
  if (subjects.length === 0) throw new Error('EMPTY_TRAVERSAL_PATH');
  for (const subject of subjects) assertSubject(subject);

  let current = await buildVerifiedMetabolicNeighborhood(subjects[0]!, records);
  const steps: VerifiedTraversalStep[] = [];

  for (let index = 1; index < subjects.length; index += 1) {
    const nextSubject = subjects[index]!;
    const step = await openVerifiedNeighbor(
      current.focal_subject,
      nextSubject,
      records,
    );
    steps.push(step);
    current = step.to;
  }

  return {
    subjects: [...subjects],
    steps,
    current,
  };
}

export function renderTraversalStep(step: VerifiedTraversalStep): string {
  const lines = [
    `COM⁵ traversal: ${step.from_subject} -> ${step.to_subject}`,
    '',
    'road evidence:',
  ];

  for (const observation of step.road_observations) {
    const relation = observation.relation ?? 'observed';
    const refs = observation.evidence_refs?.length
      ? ` [${observation.evidence_refs.join(', ')}]`
      : '';
    const note = observation.note ? ` — ${observation.note}` : '';
    lines.push(`  ${observation.role}: ${relation}${refs}${note}`);
  }

  lines.push(
    '',
    `destination direct observations: ${
      step.to.room.doors.reduce(
        (count, door) => count + door.observations.length,
        0,
      )
    }`,
    `destination neighbors: ${step.to.neighbor_refs.length}`,
  );

  return lines.join('\n');
}
