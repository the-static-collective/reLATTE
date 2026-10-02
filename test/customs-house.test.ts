import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCustomsArrivalView,
  buildCustomsDepartureView,
  buildCustomsReleasedPreview,
} from '../src/customs-house.ts';
import {
  releaseCarryCard,
  type LocalCarryCard,
} from '../src/carry-card.ts';

const SECRET = 'LOCAL-ONLY-CONTEXT-MUST-STAY-HOME';

function card(): LocalCarryCard {
  return {
    schema: 'relatte.local-carry-card/v0',
    human_intent: 'continue one bounded task with another assistant',
    offered_context: [
      'Budget under $400',
      'Hands-on controls preferred',
      SECRET,
    ],
    admitted_context: [
      'Budget under $400',
      'Hands-on controls preferred',
    ],
    open_questions: [
      'Warm sound or clean preamps?',
    ],
    expires_at: '2026-10-02T05:00:00.000Z',
  };
}

test('departure desk may show source-local withheld text while release preview cannot', () => {
  const local = card();
  const draft = buildCustomsDepartureView({
    card: local,
  });

  assert.equal(draft.locality, 'source-local-only');
  assert.equal(draft.transmittable, false);
  assert.equal(draft.staying_home_count, 1);
  assert.equal(
    draft.items.find((item) => item.text === SECRET)?.selected_to_carry,
    false,
  );

  const parcel = releaseCarryCard({
    card: local,
    decision: 'RELEASE',
    created_at: '2026-10-02T04:00:00.000Z',
  });
  const released = buildCustomsDepartureView({
    card: local,
    decision: 'RELEASE',
    released_parcel_id: parcel.parcel_id,
  });
  const preview = buildCustomsReleasedPreview(parcel);

  assert.equal(released.decision, 'RELEASE');
  assert.equal(preview.staying_home_count, 1);
  assert.equal(JSON.stringify(preview).includes(SECRET), false);
  assert.deepEqual(preview.carrying, local.admitted_context);
});

test('arrival desk cannot expose source-withheld text and keeps receive distinct from disposition', () => {
  const local = card();
  const parcel = releaseCarryCard({
    card: local,
    decision: 'RELEASE',
    created_at: '2026-10-02T04:00:00.000Z',
  });

  const undecided = buildCustomsArrivalView({
    parcel,
    crossing_id: 'relatte-crossing-v0:arrival-unit',
    received: true,
    decrypted: true,
    receive_receipt_id: 'relatte-receipt-v0:receive-unit',
  });

  assert.equal(undecided.decision, 'UNDECIDED');
  assert.equal(undecided.admitted, false);
  assert.equal(undecided.held, false);
  assert.equal(undecided.source_withheld_count, 1);
  assert.equal(undecided.source_withheld_text_available, false);
  assert.equal(JSON.stringify(undecided).includes(SECRET), false);

  const held = buildCustomsArrivalView({
    parcel,
    crossing_id: 'relatte-crossing-v0:arrival-unit',
    received: true,
    decrypted: true,
    disposition: 'HOLD',
    receive_receipt_id: 'relatte-receipt-v0:receive-unit',
    disposition_receipt_id: 'relatte-receipt-v0:hold-unit',
  });

  assert.equal(held.decision, 'HOLD');
  assert.equal(held.held, true);
  assert.equal(held.admitted, false);
});

test('departure projection rejects admitted text that was never offered', () => {
  const invalid = card();
  invalid.admitted_context = [
    ...invalid.admitted_context,
    'invented context',
  ];

  assert.throws(
    () => buildCustomsDepartureView({ card: invalid }),
    /CUSTOMS_ADMITTED_CONTEXT_NOT_OFFERED/,
  );
});
