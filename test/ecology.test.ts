import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildCom5CrossingDraft,
  buildCommuterLine,
  declareRelease,
  draftGrammarCandidate,
  generateP256KeyPair,
  makeCarrierPacket,
  makeFogCase,
  projectCulturalWeather,
  proposeCapacity,
  recordTradition,
  runFrontDoor,
  sealCom5Capsule,
  sealCrossingEnvelope,
  sealReceipt,
  verifyCarrierPacket,
  verifyReceipt,
} from '../src/index.ts';

function load(path: string): any {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function capsule(): any {
  return load('fixtures/com5-capsule-001.json');
}

function porch(): any {
  return load('fixtures/porch-com5-creative-001.json');
}

async function crossingFor(capsuleValue: any): Promise<any> {
  const sealed = sealCom5Capsule(capsuleValue);
  const draft = buildCom5CrossingDraft(sealed, {
    source_particular: 'particular:ecology-machine-source',
    source_world: 'world:ecology-machine-source',
    created_at: '2026-10-01T19:30:00.000Z',
  });
  return sealCrossingEnvelope(draft, await generateP256KeyPair());
}

async function signDraft(draft: Record<string, unknown>): Promise<any> {
  return sealReceipt(draft, await generateP256KeyPair());
}

test('Grammar Diving Bell emits candidate grammar, not authority', () => {
  const candidate = draftGrammarCandidate({
    name: 'Cost-Carrying Return',
    grammar_id: 'grammar:cost-carrying-return/v0',
    proposition: 'Return preserves transformation cost while allowing a later release question.',
    observed_in: ['external:story-circle-lineage', 'collective:com5-capsule-001'],
    evidence_refs: ['evidence:documented-eight-beat-structure', 'evidence:com5-release-mutation'],
    portable_operators: ['ENTER', 'NEED', 'ADAPT', 'PAY', 'RETURN', 'CHANGE', 'RELEASE'],
    non_authorities: ['SOURCE_PERSON != GRAMMAR', 'INFLUENCE != ENDORSEMENT'],
    created_at: '2026-10-01T19:29:00.000Z',
  });

  assert.equal(candidate.status, 'CANDIDATE');
  assert.match(candidate.candidate_id!, /^relatte-grammar-candidate-v0:[0-9a-f]{64}$/);
  assert.equal(Object.prototype.hasOwnProperty.call(candidate, 'authority'), false);

  const changed = draftGrammarCandidate({
    name: 'Cost-Carrying Return',
    grammar_id: 'grammar:cost-carrying-return/v0',
    proposition: 'Return preserves transformation cost while allowing a later release question.',
    observed_in: ['external:story-circle-lineage', 'collective:com5-capsule-001'],
    evidence_refs: ['evidence:different'],
    portable_operators: ['ENTER', 'NEED', 'ADAPT', 'PAY', 'RETURN', 'CHANGE', 'RELEASE'],
    non_authorities: ['SOURCE_PERSON != GRAMMAR', 'INFLUENCE != ENDORSEMENT'],
    created_at: '2026-10-01T19:29:00.000Z',
  });
  assert.notEqual(candidate.candidate_id, changed.candidate_id);
});

test('Front Door composes customs with separate divergent local decisions', async () => {
  const sourceCapsule = sealCom5Capsule(capsule());
  const crossing = await crossingFor(sourceCapsule);

  const admitDoor = runFrontDoor({
    porch: porch(),
    capsule: sourceCapsule,
    crossing,
    customs_at: '2026-10-01T19:31:00.000Z',
    local_at: '2026-10-01T19:32:00.000Z',
    receiver_policy: load('fixtures/com5-receiver-performance.json'),
  });

  const refuseDoor = runFrontDoor({
    porch: porch(),
    capsule: sourceCapsule,
    crossing,
    customs_at: '2026-10-01T19:33:00.000Z',
    local_at: '2026-10-01T19:34:00.000Z',
    receiver_policy: load('fixtures/com5-receiver-archive.json'),
  });

  assert.equal(admitDoor.customs_receipt_draft.kind, 'CUSTOMS_WELCOME');
  assert.equal(refuseDoor.customs_receipt_draft.kind, 'CUSTOMS_WELCOME');
  assert.equal(admitDoor.local_receipt_draft?.kind, 'COM5_ADMIT');
  assert.equal(refuseDoor.local_receipt_draft?.kind, 'COM5_REFUSE');
});

test('Postal Service carriers preserve one signed crossing identity', async () => {
  const sourceCapsule = sealCom5Capsule(capsule());
  const crossing = await crossingFor(sourceCapsule);

  const git = makeCarrierPacket(crossing, 'git-artifact', 'same crossing carried as Git artifact');
  const file = makeCarrierPacket(crossing, 'file-bundle', 'same crossing carried as file bundle');

  assert.equal(git.crossing_id, file.crossing_id);
  assert.equal(await verifyCarrierPacket(git), true);
  assert.equal(await verifyCarrierPacket(file), true);

  const tampered = { ...file, crossing_id: 'relatte-crossing-v0:' + '0'.repeat(64) };
  assert.equal(await verifyCarrierPacket(tampered), false);
});

test('Fog Customs preserves unresolved hold without turning it into refusal', async () => {
  const unknown = capsule();
  unknown.grammar.grammar_id = 'grammar:unknown-festival-ritual/v0';
  const sealed = sealCom5Capsule(unknown);
  const crossing = await crossingFor(sealed);

  const door = runFrontDoor({
    porch: porch(),
    capsule: sealed,
    crossing,
    customs_at: '2026-10-01T19:35:00.000Z',
    local_at: '2026-10-01T19:36:00.000Z',
    receiver_policy: load('fixtures/com5-receiver-performance.json'),
  });

  assert.equal(door.state, 'CUSTOMS_STOP');
  assert.equal(door.customs_receipt_draft.kind, 'CUSTOMS_HOLD');
  assert.equal(door.local_receipt_draft, null);

  const fog = makeFogCase(
    door.customs_receipt_draft,
    ['Is the unfamiliar grammar actually a renamed known relation?'],
    ['The capsule has attributable ancestry.'],
    ['Whether this porch intends to recognize this ritual grammar.'],
  );

  assert.equal(fog.status, 'UNRESOLVED');
  assert.ok(fog.laws.includes('UNKNOWN != REFUSE'));
});

test('full ecology round composes consequence, weather, tradition, capacity, release, and commuter routes', async () => {
  const sourceCapsule = sealCom5Capsule(capsule());
  const crossing = await crossingFor(sourceCapsule);

  const admitDoor = runFrontDoor({
    porch: porch(),
    capsule: sourceCapsule,
    crossing,
    customs_at: '2026-10-01T19:40:00.000Z',
    local_at: '2026-10-01T19:41:00.000Z',
    receiver_policy: load('fixtures/com5-receiver-performance.json'),
  });
  const refuseDoor = runFrontDoor({
    porch: porch(),
    capsule: sourceCapsule,
    crossing,
    customs_at: '2026-10-01T19:42:00.000Z',
    local_at: '2026-10-01T19:43:00.000Z',
    receiver_policy: load('fixtures/com5-receiver-archive.json'),
  });

  const admitCustoms = await signDraft(admitDoor.customs_receipt_draft);
  const admitLocal = await signDraft(admitDoor.local_receipt_draft!);
  const refuseCustoms = await signDraft(refuseDoor.customs_receipt_draft);
  const refuseLocal = await signDraft(refuseDoor.local_receipt_draft!);

  assert.equal(await verifyReceipt(admitCustoms), true);
  assert.equal(await verifyReceipt(admitLocal), true);
  assert.equal(await verifyReceipt(refuseCustoms), true);
  assert.equal(await verifyReceipt(refuseLocal), true);

  const weather = projectCulturalWeather([
    admitCustoms,
    admitLocal,
    refuseCustoms,
    refuseLocal,
  ]);
  assert.equal(weather.by_kind.COM5_ADMIT, 1);
  assert.equal(weather.by_kind.COM5_REFUSE, 1);
  assert.equal(weather.by_grammar['grammar:cost-carrying-return/v0'], 4);
  assert.equal(Object.prototype.hasOwnProperty.call(weather, 'ranking'), false);
  assert.ok(weather.laws.includes('FREQUENCY != VALUE'));

  const tradition = recordTradition({
    capsule: sourceCapsule,
    admitted_receipt: admitLocal,
    descendant_ref: 'artifact:performance-descendant-001',
    variation: 'The admitted world turns RELEASE into a final audience handoff beat.',
    created_at: '2026-10-01T19:44:00.000Z',
  });
  assert.equal(tradition.ancestry_preserved, true);
  assert.equal(tradition.inherited_authority, false);
  assert.match(tradition.tradition_trace_id!, /^relatte-tradition-v0:[0-9a-f]{64}$/);

  const capacity = proposeCapacity({
    admitted_receipt: admitLocal,
    world_id: 'world:com5-performance-lab',
    participant_ref: 'participant:performer-001',
    capability_kind: 'propose-descendant',
    scope: ['grammar:cost-carrying-return/v0'],
    created_at: '2026-10-01T19:45:00.000Z',
  });
  assert.equal(capacity.proposal_only, true);
  assert.equal(capacity.reputation_score, null);

  assert.throws(() => proposeCapacity({
    admitted_receipt: refuseLocal,
    world_id: 'world:com5-archive-lab',
    participant_ref: 'participant:visitor-001',
    capability_kind: 'propose-descendant',
    scope: ['grammar:cost-carrying-return/v0'],
    created_at: '2026-10-01T19:45:30.000Z',
  }), /CAPACITY_REQUIRES_ADMITTED_PARTICIPATION/);

  const rest = declareRelease({
    world_id: 'world:com5-performance-lab',
    mode: 'REST',
    subject_refs: ['artifact:performance-descendant-001'],
    note: 'Descendant enters Sabbath rest; history remains addressable.',
    created_at: '2026-10-01T19:46:00.000Z',
  });
  assert.equal(rest.deletion_implied, false);
  assert.equal(rest.successor_authority, 'fresh-decision-required');

  assert.throws(() => declareRelease({
    world_id: 'world:com5-performance-lab',
    mode: 'RELEASE',
    subject_refs: ['artifact:performance-descendant-001'],
    offered_refs: ['artifact:performance-descendant-001'],
    note: 'Attempted public reuse release with no explicit license.',
    created_at: '2026-10-01T19:47:00.000Z',
  }), /RELEASE_REQUIRES_LICENSE_REF/);

  const line = buildCommuterLine({
    source_world: 'world:ecology-machine-source',
    crossing,
    receipts: [admitLocal, refuseLocal],
  });

  assert.equal(line.edges.length, 2);
  assert.deepEqual(
    new Set(line.edges.map((edge) => edge.disposition)),
    new Set(['COM5_ADMIT', 'COM5_REFUSE']),
  );
  assert.equal(line.edges.every((edge) => edge.crossing_id === crossing.crossing_id), true);
  assert.equal(line.return_routes.length, 2);
  assert.ok(line.laws.includes('ROUTE != AUTHORITY'));
});
