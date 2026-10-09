# WORLD-ASKS-BACK-002 — Native reLATTE receiver admission

Status: cross-repository experiment. NO physical hardware operation.

## Two-repository crossing

GHoT 001 produced an unassigned-work proposal. GHoT 002 issues a NEW
source-signed crossing for only a bounded real GHoT capability (system.hash).
This bridge invokes actual reLATTE LocalReceiver.create/open/receive/dispose
rather than manufacturing shaped mock R3 receipts.

The 001 APPROVE_SIMULATION grants are not accepted for 002.
Three new signed ghot.wab-native-grant/v0 records authorize the exact
crossing ID, proposal ID, cut, current GHoT offer digest, capability, scope,
and short expiry. Roles and exact scopes:

- household: authorize-local-hash-of-my-proposal
- fabricator: authorize-local-hash-compute
- stockist: authorize-local-hash-of-stock-claim

Without full consent, the receiver emits native RECEIVED and R3_HOLD.
With full consent, the receiver emits native RECEIVED and R3_ADMIT.
The receiver does not itself call GHoT or any executable.

## Policy ownership and replay

The local operator explicitly initializes the receiver once with three
distinct pinned P-256 public keys and an exact, content-addressed proposal
and observation cut. The pinned policy persists in the local receiver
directory and is never supplied by the later crossing requester.
A receiver.public-key-only method reports a stable normalized identity
across restart (never exports private key). GHoT pins it at initialization.

A HELD crossing cannot subsequently become ADMITTED; the only valid
attempt is a NEW crossing with fresh grants. Existing signed receipts
survive receiver reopen and repeated delivery idempotently.

## Local actual execution

GHoT independently checks a current actual native system.hash BODY offer
before creating the new crossing, rechecks it after R3_ADMIT and before
calling its own reference_node.execute. The reference executor itself checks
its current offer again. GHoT records a separate signed execution witness
for the proposal SHA digest, linked to the native R3 admit receipt and
native GHoT task/receipt identifiers.

## Reproduce in side-by-side checkouts

Requires Python 3, OpenSSL CLI, Node 24 and npm dependencies installed
inside reLATTE.

    cd GHoT
    python3 ghot/world_asks_back_native.py demo ../reLATTE
    python3 ghot/world_asks_back_native.py hold ../reLATTE

The demo creates disposable synthetic owner identities and a disposable
reLATTE receiver. It executes a real local hash, NOT a physical print.
The hold specimen has zero execution and a native signed R3_HOLD.

## Limits and non-collapse

- Observation, signature, and source claim are distinct.
- A signed grant is not a grant for any other capability or crossing.
- Native RECEIVED is not ADMITTED; ADMITTED is not EXECUTED.
- GHoT local hashing is real computation, not physical material work.
- Native reLATTE custody does not claim external physical custody.
- All three owner keys are fixture identities, not independently verified humans.
- Native BODY offers are local process readings, not independent hardware attestation.
- Operator-local policy files are not external tamper-resistant checkpoints.
- No network, USB, printer, RF, shell, physical repair, money or economic
  credit can be activated by this integration.
- No release to physical hardware or economy without separate safety,
  ownership, human-grant, custody and independent outcome checks.

Companion GHoT PR: https://github.com/the-static-collective/GHoT/pull/94
