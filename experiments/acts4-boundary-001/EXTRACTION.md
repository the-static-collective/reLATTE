# Durable authenticated-pressure authority boundary

The field may contain a claim without the authority graph containing its claimed
authority. This is the general result preserved from
[ACTS-4-BOUNDARY-001](README.md). Acts 4 is the specimen's provenance; it supplies
no machine authority rule. All original specimen files, its original 24 tests,
and [signed traces](artifacts/paired-worlds.json) remain byte-for-byte intact.

```text
VERIFIED STATEMENT != AUTHORITY   THREAT != AUTHORITY
PRESSURE != ADMISSION            REQUEST != GRANT
CLAIM != CAPABILITY              SIGN != AUTHORIZATION
WITNESS != CONTROL
```

[authority.py](authority.py) defines an evidence-only
`ArtifactAuthorityAssessment`. It separately preserves the artifact ID,
authenticity and verification method, source, semantics, exact claim body,
asserted authority, discovered authority, authority source, operative effect,
and decision reason. `inspect_evidence` accepts a caller's verification method
and explicitly supplied assertions. It has no religious, institutional,
contractual, emergency, or majority-vote parser. Signed semantics and source
labels remain distinct from jurisdiction and authorization.

| Authority result | Meaning |
| --- | --- |
| `NOT_CHECKED` | Authority assessment has not occurred, even if signature verification succeeded |
| `UNRESOLVED` | Available evidence cannot establish the relevant authority/provenance |
| `NONE` | The applicable local authority path was evaluated and this artifact has no operative effect |
| `DISCOVERED` | The existing owner-local path accepted a scoped authority update |

`NONE` serializes as the string `NONE`, not JSON null or missing data. A null
`authority_source` means there is no source to cite; the separate authority
state retains the distinction between unexamined, unresolved and explicitly no
authority. An artifact rejected as stale has no *current operative effect*;
this does not erase its historical significance or the signer's identity.

`AUTHENTICITY → MAY INFORM ASSESSMENT` and
`AUTHENTICITY -/→ OPERATIVE AUTHORITY`. Assessment objects are records, not
capabilities. Neither `inspect_evidence` nor an asserted role can mint a grant,
alter admission, or satisfy the monitor's capacity-receipt registry.

<a id="crossing-grant-receipt-machinery"></a>

[boundary_adapter.py](boundary_adapter.py) is an additive adapter around the
specimen's unchanged [`World.apply_admission`, `request_capacity`, and `cross`
machinery](experiment.py). `AuthorityBoundary.submit` delegates admission to the
existing owner-local path, then records its decision. Accepted effects identify
the configured owner, world, route, subject, operation, signed admission-update
hash (`grant_id`), revision, local monitor incarnation, and UTC verification
timestamp. The artifact cannot choose those provenance fields. The adapter
does not issue capacity receipts or introduce admission policy.

`AuthorityBoundary.cross` delegates the actual decision to `World.cross` and
adds a separate explanation with the original decision reason and the source
of the ledger entry used. Rejected claims do not replace that source. When
receipt validation causes HOLD, its reason remains explicit even if owner
admission is current. If an owner decision occurred outside this adapter, its
extra provenance is `UNRESOLVED`; the adapter does not invent a timestamp or
silently change the crossing outcome. Incarnations belong to adapter-local
monitor instances, distinct even when world labels and actor keys are shared.

[laundering_matrix.py](laundering_matrix.py) exercises ten required inputs.
[Its saved evidence](artifacts/authority-laundering.json) retains signed bodies,
claims, signatures, assessments, and the sources of crossing decisions.
Unsigned threats, signed threats, institutional commands, stale legitimate
grants, wrong-owner claims, forged owner claims, dramatic signs, sacred claims,
and unanimous observer recommendations all yield explicit `NONE`. The unanimous
recommendation contains genuine signed votes from every registered actor,
including the door owner. Only a legitimate *current owner withdrawal* changes
admission and produces HOLD. Owner signatures on non-admission artifacts still
have zero operative authority through this path.

The extended [suite](test_authority.py) also checks all seven requested arbitrary
assertions, forged capacity expansion, unexamined/unresolved/NONE separation,
source attribution, preservation of malformed evidence, durable signatures,
and golden-receipt tamper detection. All **40 tests** pass, comprising the
original 24 and 16 extraction tests; the matrix covers ten separate rows.

[artifacts/golden-receipt.json](artifacts/golden-receipt.json) is the compact
machine-readable discovery receipt. [golden_receipt.py](golden_receipt.py)
verifies archived signed inputs against the fixture's pinned keys, independently
replays both worlds using public keys only, compares outcomes and architecture,
and binds the receipt to SHA-256 digests of every original file. The receipt
reports two verified threats with authority `NONE`, zero capacity escalations,
World A `CURRENT / CROSSED`, and World B `WITHDRAWN / HOLD`.

The summary is an **unsigned derived evidence receipt** with operative effect
`NONE`. The specimen had no summary-signing practice or retained private keys.
No new receipt signer or trust root is introduced. Its owner-source timestamps
describe signature verification during replay, not a claimed timestamp of the
original archived run. Regeneration changes verification times and monitor
incarnations; `--check` validates the preserved receipt without overwriting it.
Signatures prove input integrity under the archived fixture bindings; the
unsigned receipt and repository history are not an external trust anchor.

```bash
python -m unittest -v
python experiment.py                         # independent original specimen
python golden_receipt.py --check             # verify preserved evidence/receipt
python laundering_matrix.py                 # rerun all ten rhetorical cases
```

To save a fresh matrix, use `--output <path>`. `golden_receipt.py --output <path>`
derives a new receipt. Keep the original signed specimen archive for provenance;
rerunning `experiment.py --output artifacts/paired-worlds.json` would replace it
with freshly signed inputs and deliberately fail the preserved receipt check.

Neighboring experiment references are
[COMPOSITION-INSTANCE-001](#composition-instance-001),
[DYNAMIC-INTERFACE-FIELD-001](#dynamic-interface-field-001), and
[COMPOSITION-INSTANCE-002](#composition-instance-002). Their sources and an
upstream reLATTE core were not present in this workspace. These links identify
the integration relationships below, not unverified external source locations
or claims that those suites were run.

<a id="composition-instance-001"></a>

**COMPOSITION-INSTANCE-001:** At an eventual composition/instance integration,
instance labels and statements remain evidence. Operative effects must cite
the actual owner-local grant, world and incarnation. No grant is inherited from
this experiment's identity or theological provenance. Resolve the source link
when the neighboring repository is available.

<a id="dynamic-interface-field-001"></a>

**DYNAMIC-INTERFACE-FIELD-001:** A participant's perceived field may contain
arbitrary authenticated pressure without that pressure becoming part of the
authority graph. Field rendering can consume evidence and assessments; only
the appropriate [owner-local path](#crossing-grant-receipt-machinery) can produce
an operative effect. Authentication, dramatic presentation and observer count
do not constitute edges in that authority graph. Resolve the source link when
the neighboring repository is available.

<a id="composition-instance-002"></a>

**COMPOSITION-INSTANCE-002:** At an eventual second composition/instance
integration, preserve the distinction between evidence composition and
authority composition. Assessments carry owner/instance provenance for
inspection; they do not transfer or combine the neighboring experiment's
authority. Resolve the source link when its repository is available.

No normative core behavior changed, and no unavoidable core seam was needed.
The generic assessment is reusable; the concrete adapter and replay utility
remain explicitly tied to this standalone specimen's existing monitor.
The original trusted in-process and synchronous-crossing assumptions still
apply. No upstream runtime integration, distributed enforcement, or unavailable
neighboring suite validation is claimed.
