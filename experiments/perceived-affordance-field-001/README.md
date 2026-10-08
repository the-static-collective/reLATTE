# PERCEIVED-AFFORDANCE-FIELD-001 — misleading pressure without authority mutation

Status: experimental contract, not yet executable. Branch is stacked on COMPOSITION-INSTANCE-002 (#79) at `21e7d7a`. No normative-core changes.

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
