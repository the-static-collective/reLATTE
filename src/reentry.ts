import type { VerifiedTraversalStep, VerifiedMetabolicWalk } from './traversal.ts';
import { walkVerifiedMetabolicPath } from './traversal.ts';

export interface VerifiedEncounter {
  subject: string;
  encounter_index: number;
  occurrence_number: number;
  first_encounter_index: number;
  is_reentry: boolean;
  arrived_via: VerifiedTraversalStep | null;
}

export interface VerifiedReentryWitness {
  subject: string;
  first_encounter_index: number;
  reentry_encounter_index: number;
  occurrence_number: number;
  return_step: VerifiedTraversalStep;
  intervening_subjects: readonly string[];
}

export interface VerifiedReentryWalk extends VerifiedMetabolicWalk {
  encounters: readonly VerifiedEncounter[];
  reentries: readonly VerifiedReentryWitness[];
  current_encounter: VerifiedEncounter;
}

/**
 * Annotate a verified provenance walk with deterministic encounter/re-entry
 * witnesses. Re-entry is a property of traversal history, not a mutation of
 * the underlying subject.
 */
export async function walkVerifiedReentryPath(
  subjects: readonly string[],
  records: readonly unknown[],
): Promise<VerifiedReentryWalk> {
  const walk = await walkVerifiedMetabolicPath(subjects, records);

  const firstSeen = new Map<string, number>();
  const counts = new Map<string, number>();
  const encounters: VerifiedEncounter[] = [];
  const reentries: VerifiedReentryWitness[] = [];

  for (let index = 0; index < walk.subjects.length; index += 1) {
    const subject = walk.subjects[index]!;
    const previousCount = counts.get(subject) ?? 0;
    const occurrence = previousCount + 1;
    counts.set(subject, occurrence);

    const firstIndex = firstSeen.get(subject);
    const isReentry = firstIndex !== undefined;

    if (firstIndex === undefined) {
      firstSeen.set(subject, index);
    }

    const arrivedVia = index === 0 ? null : walk.steps[index - 1]!;

    const encounter: VerifiedEncounter = {
      subject,
      encounter_index: index,
      occurrence_number: occurrence,
      first_encounter_index: firstIndex ?? index,
      is_reentry: isReentry,
      arrived_via: arrivedVia,
    };

    encounters.push(encounter);

    if (isReentry && arrivedVia !== null) {
      reentries.push({
        subject,
        first_encounter_index: firstIndex!,
        reentry_encounter_index: index,
        occurrence_number: occurrence,
        return_step: arrivedVia,
        intervening_subjects: walk.subjects.slice(firstIndex! + 1, index),
      });
    }
  }

  return {
    ...walk,
    encounters,
    reentries,
    current_encounter: encounters[encounters.length - 1]!,
  };
}

export function renderReentryWitness(
  witness: VerifiedReentryWitness,
): string {
  const lines = [
    `COM⁵ re-entry: ${witness.subject}`,
    `occurrence: ${witness.occurrence_number}`,
    `first encounter index: ${witness.first_encounter_index}`,
    `re-entry index: ${witness.reentry_encounter_index}`,
    `intervening subjects: ${
      witness.intervening_subjects.length === 0
        ? '(none)'
        : witness.intervening_subjects.join(' -> ')
    }`,
    '',
    `return road: ${witness.return_step.from_subject} -> ${witness.return_step.to_subject}`,
  ];

  for (const observation of witness.return_step.road_observations) {
    const refs = observation.evidence_refs?.length
      ? ` [${observation.evidence_refs.join(', ')}]`
      : '';
    lines.push(
      `  ${observation.role}: ${observation.relation ?? 'observed'}${refs}`,
    );
  }

  lines.push(
    '',
    'same subject: yes',
    'same encounter position: no',
    'underlying subject mutation claimed: no',
  );

  return lines.join('\n');
}
