import {
  COM5_ROLES,
  type Com5Observation,
  type Com5Role,
} from './com5.ts';

export interface Com5Door {
  role: Com5Role;
  observations: readonly Com5Observation[];
}

export interface Com5RoomView {
  focal_subject: string;
  doors: readonly Com5Door[];
  unrelated_observation_count: number;
}

function assertFocalSubject(subject: string): void {
  if (subject.trim().length === 0) throw new Error('INVALID_COM5_FOCAL_SUBJECT');
}

/**
 * Build a conservative five-door view for one exact subject.
 *
 * The room does not infer relationships from notes, relation strings, or
 * evidence refs. Only observations whose subject exactly matches the focal
 * subject enter its doors.
 */
export function buildCom5Room(
  focalSubject: string,
  observations: readonly Com5Observation[],
): Com5RoomView {
  assertFocalSubject(focalSubject);

  const direct = observations.filter(
    (observation) => observation.subject === focalSubject,
  );

  const doors = COM5_ROLES.map((role) => ({
    role,
    observations: direct.filter((observation) => observation.role === role),
  }));

  return {
    focal_subject: focalSubject,
    doors,
    unrelated_observation_count: observations.length - direct.length,
  };
}

export function renderCom5Room(
  focalSubject: string,
  observations: readonly Com5Observation[],
): string {
  const room = buildCom5Room(focalSubject, observations);
  const lines = [`COM⁵ room: ${room.focal_subject}`];

  for (const door of room.doors) {
    lines.push('', `[${door.role}]`);
    if (door.observations.length === 0) {
      lines.push('  (no direct observation)');
      continue;
    }

    for (const observation of door.observations) {
      const relation = observation.relation
        ? ` --${observation.relation}-->`
        : '';
      const note = observation.note ? ` — ${observation.note}` : '';
      lines.push(`  ${observation.subject}${relation}${note}`);
    }
  }

  if (room.unrelated_observation_count > 0) {
    lines.push(
      '',
      `outside focal subject: ${room.unrelated_observation_count} observation(s)`,
    );
  }

  return lines.join('\n');
}
