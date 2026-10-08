# ACTS-4-BOUNDARY-001 — authenticated pressure does not inherit authority

**Non-normative experiment.** The field may contain a claim without the authority
graph containing its claimed authority. Acts 4:24–31 is the provenance of the
executable witness, not a machine authority rule.

The [preserved specimen](../experiments/acts4-boundary-001/README.md) and
[durable extraction](../experiments/acts4-boundary-001/EXTRACTION.md) arrive from
standalone commit `b6ff8fc`. All 14 files from that commit are copied unchanged,
including its Ed25519 signed inputs, traces, original tests, assessment seam,
hostile matrix, and compact receipt. Earlier notes that neighboring sources
were unavailable describe that extraction's original workspace; the links below
now locate those experiments in this repository's separate branches.

## Replay and evidence

From the repository root, with Python 3.10 or newer:

```sh
python -m pip install -r experiments/acts4-boundary-001/requirements.txt
python -m unittest discover -s experiments/acts4-boundary-001 -v
python experiments/acts4-boundary-001/experiment.py
python experiments/acts4-boundary-001/golden_receipt.py --check
python experiments/acts4-boundary-001/laundering_matrix.py
```

The original specimen remains independently executable. The 40 tests include
its original 24 cases and 16 extraction checks. A separate CI job runs those
checks alongside reLATTE's existing verification without changing `src/`,
`spec/`, existing schemas, admission policy, package dependencies, or receipt
grammar. The reference model uses Ed25519 and its own signed-envelope domain;
it does not claim to implement the normative P-256 crossing profile.

The [golden receipt](../experiments/acts4-boundary-001/artifacts/golden-receipt.json)
records:

| World | Threat verification | Threat authority | Owner admission | Crossing |
| --- | --- | --- | --- | --- |
| A | Verified | `NONE` | Current | `ROUTE_SUCCESS / CROSSED` |
| B | Verified | `NONE` | Withdrawn | `ROUTE_DENIED / HOLD` |

Both use the same seven operations and prayer/request architecture. The
receipt is unsigned derived evidence with operative effect `NONE`, bound to
the [preserved signed inputs and traces](../experiments/acts4-boundary-001/artifacts/paired-worlds.json)
by file digests and checked through public-key replay. No summary signer or
trust root is introduced. Do not overwrite the preserved archive when replaying.

[authority.py](../experiments/acts4-boundary-001/authority.py) distinguishes
`NOT_CHECKED`, `UNRESOLVED`, explicit `NONE`, and `DISCOVERED`. Authenticity,
source, semantics and arbitrary asserted authority do not independently produce
operative authority. Claims remain exact evidence rather than executable
capabilities. [The additive adapter](../experiments/acts4-boundary-001/boundary_adapter.py)
records the actual owner-local grant/update hash, revision, world, incarnation
and verification time behind an operative effect or crossing decision. It wraps
the preserved reference monitor; it does not replace reLATTE's receiver.

The [ten-row laundering matrix](../experiments/acts4-boundary-001/artifacts/authority-laundering.json)
retains unsigned/signed threats, institutional commands, a stale grant,
wrong-owner and forged-owner claims, a dramatic sign, a sacred claim, genuine
unanimous signed recommendations, and a current owner withdrawal. Only the
last alters admission by authority. All other artifacts remain inspectable
evidence with explicit authority `NONE`.

## Neighboring experiments and existing machinery

These links pin the inspected source snapshots. They are relationships, not
dependencies or authority transfers; their unmerged branches are not imported
by this PR.

- [COMPOSITION-INSTANCE-001](https://github.com/the-static-collective/reLATTE/blob/f34772194e761585ee6d05a48be33f614f6d4c03/docs/COMPOSITION-INSTANCE-001.md)
  ([PR #77](https://github.com/the-static-collective/reLATTE/pull/77)) separates
  admitted bounded runtime execution from a resulting candidate's forced HOLD.
  This experiment adds that a participant's authenticated pressure or claimed
  authority cannot replace that admission or admit the output.
- [DYNAMIC-INTERFACE-FIELD-001](https://github.com/the-static-collective/reLATTE/blob/1bdb060130842df2f634831a80f4dc5bb57f630c/experiments/dynamic-interface-field-001/README.md)
  ([PR #78](https://github.com/the-static-collective/reLATTE/pull/78)) separates
  projected field views from fresh owner checks, scoped grants and signed
  operation tickets. Arbitrary pressure may appear in a perceived field without
  becoming an authority-graph edge. Its
  [door-grant schema](https://github.com/the-static-collective/reLATTE/blob/1bdb060130842df2f634831a80f4dc5bb57f630c/experiments/dynamic-interface-field-001/schemas/door-grant-v0.schema.json)
  remains its own owner-local contract.
- [COMPOSITION-INSTANCE-002](https://github.com/the-static-collective/reLATTE/blob/21e7d7a7413507b3b9301354f51f7f98d89d2eee/experiments/composition-instance-002/README.md)
  ([PR #79](https://github.com/the-static-collective/reLATTE/pull/79)) distinguishes
  runtime events, eligible interfaces, explicit publication, owner grants and
  fresh reconstitution. A retained claim or history cannot restore an old
  incarnation's authority or substitute for fresh authorization.
- [Identity/signature profile](../spec/IDENTITY-SIGNATURE-PROFILE-V0.md),
  [crossing and receipt implementation](../src/protocol.ts), and
  [Local Receiver 001](LOCAL-RECEIVER-001.md) already separate verification,
  receipt and owner-local disposition. This specimen preserves and inspects
  that distinction without changing their behavior.
- [Field Consequence 001](FIELD-CONSEQUENCE-001.md) similarly treats derived
  susceptibility as context with no authority over history or admission.

```text
VERIFIED STATEMENT != AUTHORITY   THREAT != AUTHORITY
PRESSURE != ADMISSION            REQUEST != GRANT
CLAIM != CAPABILITY              SIGN != AUTHORIZATION
WITNESS != CONTROL
```
