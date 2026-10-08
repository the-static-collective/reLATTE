# PERCEIVED-AFFORDANCE-FIELD-001 — misleading pressure without authority mutation

Status: executable experiment-local observer lens with two-observer route proof and cold verifier. Draft PR #83 remains stacked on COMPOSITION-INSTANCE-002 (#79). No normative-core changes. Exact tested SHA and CI results are tracked in the PR.

## Question

Can an authenticated but non-authoritative claim alter which route a participant **perceives** as possible while leaving actual owner-local admissions unchanged?

The field contains evidence, assertions, and interfaces. None of these automatically changes the owner authority graph.

## Provenance

- ACTS-4-BOUNDARY-001 and local extraction commit `b6ff8fc` were reported separately; not imported or asserted to exist in this GitHub branch.
- COMPOSITION-INSTANCE-001 (#77): instance/runtime/candidate authority boundary.
- DYNAMIC-INTERFACE-FIELD-001 (#78): signed owner publication/withdrawal, incarnation, selected history, fresh admission.
- COMPOSITION-INSTANCE-002 (#79): temporary runtime-caused doors, terminal fencing, historical continuity.
- INTERFACE-SUPERSPACE-001 (#76): candidate route discovery and bounded execution.

## Invariants

```text
PERCEIVED AFFORDANCE != OWNER AUTHORITY
OBSERVATION != ADMISSION
SIGNED PRESSURE != OWNER WITHDRAWAL
CLAIMED CLOSURE != CLOSED DOOR
CLAIMED OPENING != OPEN DOOR
ORIENTATION CHANGE != CAPABILITY GRANT
DISCOVERY != EXECUTION
RECOMMENDATION != SELECTION
```

## Minimal executable slice

Use existing signed owner histories and route/occurrence verification from #78 or #79. Add only experiment-local view/projection and observation records. No new global registry, normative grammar, or theology-aware parser.

Create two contemporaneous observer views of the same immutable owner state and door incarnation:

1. **Observer P:** has a correctly signed message from a separate PRESSURING_ACTOR saying Door A is unavailable. Observer-facing proposal selection marks A **perceived closed**, with the statement attributed to its actual signer and classified as non-owner evidence. Door A remains owner-open.
2. **Observer Q:** does not incorporate that pressure message; A is perceived open. Both observers share the same actual owner-local admission/grant state.
3. Both submit independently constructed candidate routes. Compare the views, selections, fresh owner gates, and executed occurrences. P may decline the open route, or request a fresh owner check and discover it is open; P must never claim a denial by the owner unless an owner gate actually denies.
4. Reverse the deception: pressuring actor claims Door B open while owner has already withdrawn it. The observer may propose B, but execution must HOLD/deny at the actual owner gate.
5. Reorient P (e.g. `ORIENT/RECALL/NAME/BOUND/REQUEST/ACT/RECEIVE`) as a **local interpretive operation only**. It can alter P's displayed view or chosen proposal; it must not create permissions or produce a fictitious owner receipt.
6. Archive signed pressure, the observer's particular view/proposal, owner frontier/incarnation, actual authorization verdict, and occurrence/refusal/HOLD. Cold replay verifies without executing or resurrecting authority.

Expected table:

| Specimen | Reported perception | Actual owner state | Correct operative result |
| --- | --- | --- | --- |
| False closure | A closed | A open | A may execute only with valid scoped current grant, otherwise HOLD |
| False opening | B open | B withdrawn | DENIED/HOLD |
| Reorientation | A may be open | A open | May change proposal; still requires current owner admission |
| Actual withdrawal | A open (stale view) | A withdrawn | DENIED/HOLD |
| Dead incarnation | Old door appears in history | Incarnation fenced | DENIED/HOLD, no resurrection |

## Hostile gates

- A valid signer who is not the door owner cannot publish, withdraw, or mint a grant.
- Claim format, urgency, repetition, sacred/institutional wording and observer agreement do not become authority.
- Unresolved source / missing owner history cannot be treated as explicit `NONE` or `OPEN`. Represent `UNEXAMINED`, `UNRESOLVED`, `NONE`, and `DISCOVERED` separately when assessing authority.
- Old grants, recreated interface IDs, forked descendants, delayed events and torn observer histories fail closed at owner gate.
- Independent observation is preserved; the test must not artificially force observers to perceive identical opportunities.
- Signing proves authenticity, not jurisdiction. Recording a claimed miracle or divine sanction does not authorize execution.
- A route taken despite the threat must not be labeled `threat_removed` without specific evidence.
- No artifact may report a successful execution when only a candidate was generated.
- Cold verification must make zero external side effects.

## Evidence / acceptance

- Deterministic two-observer, two-door fixture with signed actual owner histories and independently attributed pressure.
- Golden machine-readable evidence binds each view to the selected owner frontier, signer, interpreted affordances, chosen candidate, gate verdict and observed outcome.
- Negative cases for both false opening and false closure; one live and one fenced incarnation.
- Existing #79 bridge, #78 dynamic field, #77 composition and #76 superspace tests still pass; no changes to their files.
- `src/`, `spec/`, stable `schemas/` unchanged.
- Document exact reproducible commands, failure limitations and signed cold-verification results; do not state green until actually run.
- Keep draft/unmerged for review, with any extraction to a general-purpose API as **separate** follow-up.

## Architecture decision (proposed)

An experiment-local observer projection is preferred over a shared authoritative affordance service. It sacrifices central consistency of perceived opportunity, intentionally: distinct observer histories can disagree. It gains explicit provenance and permits the real admission gate to remain independent. The simpler alternative of appending pressure to the owner history is rejected because it launders third-party assertion into owner authority.

## Codex implementation prompt

Implement this contract on this branch, retaining the scope and test gates above. First inspect the exact #79, #78, and #76 interfaces rather than inventing call signatures. Keep the smallest removable experiment-local diff, generate signed trace fixtures from actual execution, run both fresh and cold verifiers and the parent suites, and open a *draft* PR stacked on #79. Do not merge. Record tested head SHA, passing test counts, limitations and any unsatisfied acceptance criteria.

## Executable implementation

The contract is implemented without changing field ownership or creating a global authority service:

- `lens.mjs` — separate FieldObserver instances, authenticated non-owner pressure, observer-specific interpreted affordances, reorientation and refusal to turn perception into grants.
- `run.mjs` — creates signed owner histories, independently selected views, a false closure, a successful independent observer route, a reorientation route, a false opening after owner withdrawal, and a denied stale-incarnation route.
- `verify.mjs` — cold read-only reconstruction of selected history prefixes, signatures, view projections, pressure interpretations, plans, actual dynamic occurrences, grant/ticket ancestry, and signed withdrawal/reconstitution.
- `tests/affordance.test.mjs` — adversarial fixtures including conflicting pressure, tampering, missing history, no inherited grant, stale owner gates, and COMPOSITION-INSTANCE-002 terminal-death fencing.
- `.github/workflows/perceived-affordance-field-001.yml` — runs new and inherited tests, repository verification, reproducible proof generation, repeated cold verification, and artifact upload.

### Reproduction

From the repository root, with dependencies installed and Node.js 24:

```sh
node --test experiments/perceived-affordance-field-001/tests/*.test.mjs
node experiments/perceived-affordance-field-001/run.mjs
node experiments/perceived-affordance-field-001/verify.mjs
node experiments/perceived-affordance-field-001/verify.mjs
```

The proof is written to `work/perceived-affordance-field-001/proof.json`. It includes actual signed owner histories and gate tickets, independently derived observer view records, signed pressure, candidate plans, and resulting occurrences. Fresh runs create new identities and occurrence IDs; the same archived proof must verify deterministically on repeated cold reads. The CLI verifier never executes a crossing.

### Limits and provenance

- The runnable proof exercises ordinary withdrawal and reconstitution. The separate integration test exercises actual terminal death from #79; it is not misleadingly counted among the proof JSON's four occurrences.
- Owner world histories, pressure and operation tickets carry signatures. The runner's local failure records are content-sealed, not additional owner-signed denials. A failure reason is not a free-standing owner authorization statement.
- `UNEXAMINED` (owner excluded from selected histories) is not `NONE` (an absent door in a verified selected history). Unreadable or contradictory evidence is rejected rather than guessed into either status.
- Perceived opening/closure is not a cross-world truth claim. A signed actor is only known as the holder of that key; signing grants no jurisdiction over the door.
- New interfaces, public APIs, semantic pressure parsers, persisted observer identities, cross-host deployment and a playable Minecraft consumer are deliberately out of scope.
- CI proves these fixtures and inherited code paths, not that all distributed or human perceptual effects have been demonstrated. No merge or normative promotion is implied.

