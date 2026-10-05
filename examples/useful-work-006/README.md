# Useful Work Kernel 006 — Audit Clock / Randomness Provenance

Kernel 006 publishes a signed policy **before the first scheduled slot**, then
retains every declared slot whether or not a challenge, response or mathematical
receipt becomes observable. The signed schedule supplies a denominator; successful
receipts no longer define the entire audit population.

```text
result + pinned work/job + cadence/rounds + sample size
       + source rule + fixed derivation + windows/expiry
                            ↓
                       AUDIT PLAN ID
                            ↓
signed publication observation + source event + scheduled slot
                            ↓
deterministic Kernel 004 challenge + signed issuance
                            ↓
signed observer inventories + retained responses/receipts
                            ↓
all planned slots + Kernel 005 evidence accumulator
```

```text
SCHEDULE ≠ AUTHORITY
RANDOMNESS ≠ TRUTH
NONRESPONSE ≠ FAILURE OF COMPUTATION
MISSING EVIDENCE ≠ NEGATIVE EVIDENCE
OBSERVED HISTORY ≠ COMPLETE HISTORY
```

## Run it

Node 22.18+; demos/tests also require Python 3.10+ with no extra packages.

```sh
npm ci
npm run verify
npm run useful-work-006 -- demo examples/useful-work-001/julia-001.json
```

The real-clock demo publishes/holds its plan and obtains a separately signed
publication observation before requesting entropy. An attributed provider in
another process emits signed events. Eighteen slots receive responses and scoped
TypeScript/Python receipts; the nineteenth is issued without an observable
response; the twentieth has no observable event or issuance. After the declared
windows elapse the retained history reports **20 planned, 18 completed sample
observations, 1 expired issuance, 1 unknown slot**. It waits for real deadlines
(roughly eleven seconds at default settings), without measuring compute time.

Use `--rounds <3..64>` and `--samples <1..64>` (bounded by job population) for
other demos; output directories must be new (`--out <new-directory>` for reruns).
The default output is `output/useful-work-006/`:

- `policy.json`, `plan.json`, `publication.json`, `plan-receiver/`: declared policy,
  signed crossing, attributed publication observation and local RECEIVE/HOLD.
- `slot-*/`: source events, signed issuances, native challenges, available responses,
  verifier receipts and HOLD journals.
- `clock-cuts/` and `snapshots/`: signed inventories and planned/issued snapshots.
- `history-input.json`: file manifest for another collector.
- `history/history.json`, `summary.json`, `crossing.json`, `receiver/`: self-contained
  final history, readable summary, signed transport reference and local HOLD.
- `history/evidence-audit.json`: an independently verifiable Kernel 005 object when
  receipts exist, with its conditional randomness model deliberately unset.
- `local-state/` and `prepared/worker-state/`: private demo role keys and worker data,
  separate from portable history. No private keys appear in committed fixtures.

The demo controls all test role keys on one machine. It demonstrates externally
**attributable** provider messages, not a live independent beacon, honest provider,
or objective global clock. Verification explicitly leaves those claims false.

Later verification needs only Node, the domain code and saved history, optionally
its crossing. Neither worker state, render artifacts, Python nor mathematical
implementation files are needed:

```sh
npm run useful-work-006 -- verify output/useful-work-006/history/history.json --crossing output/useful-work-006/history/crossing.json --out output/clock-reverified
npm run useful-work-006 -- collect output/useful-work-006/history-input.json --out output/clock-collected
npm run useful-work-005 -- verify output/useful-work-006/history/evidence-audit.json --out output/clock-evidence-reverified
```

## Policy and challenge contract — v1

`useful-work.audit-plan/v1` fixes the sole native `result_id`, exact
`work_crossing_id`, `job_spec_hash`, `declared_at`, `sample_count`, `expires_at`,
and these fields:

- `schedule`: `starts_at`, `cadence_ms`, `rounds`, `issue_window_ms`, `response_window_ms`.
- `randomness_rule`: schema `signed-external-event/v1`, pinned `source_world`,
  normalized P-256 `public_key`, `stream_id`, `first_sequence`.
- `challenge_rule`: literal `kernel-004-fixed-envelope-sha256-plan-slot-event/v1`.
- `challenger` / `observer`: pinned `world_id` and normalized P-256 `public_key`.

Keys for provider, challenger and observer are distinct; the plan publisher also
cannot be the provider key. Distinct keys establish attribution, not independent
people or execution. Declaration precedes the first slot. Timestamps use exact
UTC `YYYY-MM-DDTHH:mm:ss.sssZ`. Slot `i` starts at `starts_at + i*cadence_ms`, has
issue deadline `start + issue_window_ms`, and response deadline
`start + issue_window_ms + response_window_ms`. Windows include the deadline;
expiry occurs strictly afterward. Response deadlines are fixed by the schedule,
not extended by late issuance. `expires_at` equals the final response deadline.
Plans support 1–256 rounds; integer durations are 1–86,400,000 ms.

All hashes below concatenate the stated ASCII domain and JCS UTF-8:

```text
plan_id = "useful-work-audit-plan-v1:"
        + SHA256("UsefulWork-AuditPlan-v1|" || JCS(policy))
slot_id = "useful-work-audit-slot-v1:"
        + SHA256("UsefulWork-AuditSlot-v1|" || JCS({plan_id,index}))
nonce   = SHA256("UsefulWork-ScheduledChallenge-v1|"
        || JCS({plan_id,slot_id,randomness_event_id}))
```

A signed provider event contains exactly schema `useful-work.randomness-event/v1`,
`stream_id`, `sequence`, 32-byte lowercase `value_hex`, and `emitted_at` matching
its crossing timestamp. Slot `i` accepts only sequence `first_sequence+i` from
the pinned source. The event's signed claims must not predate its slot; an event
after the issue deadline remains recordable but cannot issue a valid challenge.
The nonce binds the complete authenticated event identity, including its value.
Reusing an event in another slot cannot satisfy that slot's sequence binding.

The challenger signs an ordinary Kernel 004 challenge using the fixed work/result,
sample size and derived nonce. Its timestamp is the event's `emitted_at` claim;
all other envelope fields follow the existing native message constructor, with
the plan's pinned challenger world/key. That timestamp is a **derivation field**,
not proof of physical issuance time. Verification reconstructs the entire unsigned
crossing identity: changing parents, timestamp, source particular, history head
or other metadata cannot grind an acceptable challenge. Coordinates use Kernel
004's SHA-256 rejection sampling and sparse Fisher–Yates over work/challenge IDs.

A separate signed `useful-work.audit-issuance/v1` binds `plan_id`, `slot_id`,
`slot_index`, `randomness_event_id`, `publication_observation_id` and `challenge_id`.
Publication evidence is required: the pinned observer must sign seeing that exact
plan crossing between declaration and the first slot. A backdated plan signature
alone is insufficient. Publication/source/clock chronology is **attributed to
those signers**, not established as objective time.

The signed-external-event adapter is the only source rule implemented here.
Provider equivocation (multiple authenticated events for one expected sequence)
and identical values across slots remain visible. Forks may produce multiple
challenges in one slot; they never manufacture additional scheduled rounds.
Signatures do not establish unpredictability or prevent a dishonest provider
from grinding event values/timestamps or backdating claims.

## Observed history, deadlines and missing evidence

Every summary materializes the whole signed schedule. Current status is evidence
description, with this priority:

| Status | Meaning within this retained inventory and observer cut |
|---|---|
| `ANSWERED` | An authenticated worker response is present, including late or malformed answers. |
| `EXPIRED` | Issuance is present, the observer's cut is past the response deadline, and no response is present. |
| `WITHHELD / UNKNOWN` | Attributed unavailability is reported, or no issuance is visible after its window. No withholding intent is inferred. |
| `ISSUED` | Authenticated issuance is present; no response is visible and its response window is still open. |
| `MISSED` | The observer explicitly reports no issuance observed after the issue deadline. This is an attributed absence report. |
| `PLANNED` | No issuance is visible and the issue window has not closed. |

`useful-work.audit-clock-observation/v1` supports `PLAN_PUBLISHED`, `ISSUE_SEEN`,
`RESPONSE_SEEN`, `MISS_REPORTED`, and `UNAVAILABLE_REPORTED`. Observations bind
the exact plan crossing and slot/subject. Seeing an issuance/response records
whether that observer's claimed timestamp lies within the declared window.
Worker timestamps cannot establish timeliness; no response or compute durations
are inferred. Absence reports survive alongside conflicting positive observations
and are explicitly indexed when they conflict with an earlier issuance observation.

An answered slot is separate from a completed **sampled** mathematical observation.
Unavailable checkers and malformed answers do not supply one; complete negative
mathematical receipts do. Neither status means the full job is correct. Kernel 005
still verifies the underlying receipt signatures, actual exchange scopes and
Merkle proofs, retaining exact unions, overlap, per-index predictions and conflicts.

The schedule accounting records planned, issued, answered and completed-observation
slots, plus slots without issuance/response/complete mathematical evidence. Each
slot exposes all event/challenge/response/receipt IDs, source equivocation and
timing observations. Exact replays are retained/authenticated but do not add slots.

The pinned observer signs `useful-work.audit-clock-cut/v1`: plan and plan crossing,
claimed `observed_at`, ordered claim-ID inventory hash, per-array prefix counts,
and `complete_history_asserted: false`. The inventory binds the work/job,
publication and ordered event/issuance/challenge/response/receipt/observation IDs,
including replays and earlier cut IDs. Removing or changing a claim breaks that
signed inventory even if a collector recomputes the enclosing history hash.

Appending requires a new signed cut and preserves earlier cuts and all records.
Earlier cuts authenticate exact monotone prefixes with dependencies present at
that snapshot. A late answer can change `EXPIRED` to `ANSWERED`, while the earlier
signed expired snapshot remains reconstructible. Signatures are checked before
deduplication. Unknown schemas/rules, bad signatures, context substitutions,
off-policy issuances, inconsistent claimed chronology and forged totals fail
explicitly. Such rejection is a protocol validation result, not guilt.

The declared schedule is complete **as a policy**, not as global observed history.
A dishonest observer can omit evidence before signing an inventory or publish a
different branch of history. Source availability, actual publication, entropy
honesty and observer completeness still require external evidence/trust. Missing
slots make selection visible; they do not by themselves validate Kernel 005's
honest-fresh model. No probability or correctness score is inferred from successful
slots in Kernel 006.

## Separate processes and durable formats

Individual CLI commands support signing/importing policies and events, issuing
native challenges and collecting independently witnessed history:

```sh
npm run useful-work-006 -- plan <policy.json> --key <planner-private-key.json> --out <new-dir>
npm run useful-work-006 -- observe <plan-bundle> --kind PLAN_PUBLISHED --key <observer-private-key.json> --out <new-dir>
npm run useful-work-006 -- randomness <plan-bundle> --slot 0 --key <provider-private-key.json> --out <new-dir>
npm run useful-work-006 -- issue <work-bundle> <plan-bundle> <publication-bundle> <event-bundle> --key <challenger-private-key.json> --out <new-dir>
```

The existing `useful-work-004 answer/verify` commands accept the resulting native
challenge. `observe --kind ISSUE_SEEN|RESPONSE_SEEN --slot <n> --subject <crossing-id>`
records local observations; absence kinds take no subject. `--at <UTC>` permits
offline attributed clock/event claims, with the same validation and trust limits.
Private key files are ordinary local P-256 JWKs, not identities conferring authority.

`history-input.json` uses schema `useful-work.audit-clock-input/v1`, canonical
`job_spec`, bundle paths `work`, `plan`, nullable `publication`, arrays of bundle
paths `events`, `responses`, `observations`, `prior_cuts`, raw signed JSON paths
`receipts`, and `issues: [{issuance:<bundle>,challenge:<bundle>}]`. `cut` is a signed
cut bundle path. Paths are relative to the manifest. `snapshot <manifest>` with
`cut: null` and `--key <observer-key>` signs the current inventory; `collect` checks
an existing signed cut.

`append <history.json> <additions.json> --key <observer-key>` signs a later cut and
retains previous cuts. Additions use schema `useful-work.audit-clock-additions/v1`
and exactly the `events`, `issues`, `responses`, `receipts`, `observations` arrays
with those same path rules. Empty arrays can advance the observed clock without
inventing evidence. Plan, publication, work and job remain fixed for that history.

The self-contained format is `useful-work.audit-clock-history/v1`; its ID is
`useful-work-audit-history-v1:` plus `SHA256("UsefulWork-AuditHistory-v1|" ||
JCS(object without history_id))`. The history address identifies evidence, not
a new result identity. Summary and Kernel 005 audit ID are rebuilt on every load.
The signed history reference uses existing opaque organs under
`contract:useful-work/audit-clock-v1`; RECEIVE/HOLD asserts possession and no
ownership, admission, consensus or valuation. No reLATTE core authority changes.
Limits: 1,024 records per evidence array, 1 MB per record, 64 MiB per history.

The [signed golden history](../../fixtures/useful-work-006-golden.json) pins a
four-slot real-clock run. [`clock_vectors.py`](clock_vectors.py) independently
derives policy/slot/nonce/full native crossing identities, coordinates and slot
accounting from the prose contract. Tests cross-check 64 generated policies,
authenticate every saved signature, exercise missing/late/negative evidence,
and verify relocated history with all worker/mathematical files removed.

Future seams: authenticated beacon adapters or multi-party commit/reveal can
implement new source rules; multiple observers can retain scoped inventories;
DOGRAM can show slot timelines, missing evidence and source forks; GHoT can retain
history cuts. Any statistical model must explicitly account for all declared
slots and its remaining selection/availability assumptions. Resource valuation
and admission remain outside reLATTE transport authority.
