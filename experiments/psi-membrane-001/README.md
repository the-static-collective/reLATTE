# PSI-MEMBRANE-001 — history-cut entailment without authority

Non-normative executable specimen for [issue #82](https://github.com/the-static-collective/reLATTE/issues/82), stacked on [COMPOSITION-INSTANCE-002 / #79](../composition-instance-002/README.md). It introduces a small Ψ-inspired membrane between verified selected histories and observer-relative affordance. It is not a formal Ψ-calculus implementation or a general theorem prover.

```text
P_O(H@h) = Ψ_O,h
Ψ_O,h ⊢ φ(M)

H_t → projection → Ψ_t → condition φ → explicit selection
    → fresh owner authority → occurrence R_t → formation Φ(H_t, R_t)
    → new selected history → Ψ_(t+1)
```

`φ` is a condition/question; `Ψ` is a selected assertion environment; `Φ` is a realized history transformation. None grants authority.

## Founding proof

At h0, the selected, signed publication supports a live offer and `inspect` compatibility, and the observer declares the local ability `inspect`. The finite rule entails `affords(O,c,inspect)`. The specimen preserves the witness and selects an existing #78 route without executing it.

Immediate execution with separately issued owner grants succeeds. In the delayed execution, the owner withdraws the offer before the request reaches execution. At h1, the publication survives as history but there is no current `live` assertion. Fresh entailment is negative and the selected route is denied before native effect. The h0 witness still verifies against h0.

A second case uses #79's actual subprocess/runtime and fsynced terminal fence. The instance executes an observation, advances its signed bridge history, then dies with cleanup intentionally interrupted. Its old offer remains visible in the inherited historical field projection. The selected fence removes liveness in the membrane; the prior witness verifies, but delayed execution is denied. The unchanged #79 owner gate independently refuses the old grant.

Same-carrier reconstitution yields a new offer and a positive current entailment. The old witness/selection still cannot execute because its referent identifies the old offer. Neither fresh entailment nor retained grants resurrects the prior incarnation.

The checked proof reports:

| Evidence | Count |
| --- | ---: |
| Selected history-cut contexts | 16 |
| Entailment witnesses | 23 |
| Native occurrences | 4 |
| Denials before native effect | 3 |
| Signed owner tickets | 8 |
| Restored live authority / replay side effects | 0 / 0 |

Two contexts have equal current **carrier/operation/result surfaces** despite different publish/withdraw/reconstitution histories. Their terms, histories, witnesses, native occurrences and signed crossing ancestry remain distinct. Surface comparison deliberately omits opaque identity fields for comparison only; it is never used to deduplicate histories, identify particulars or authorize execution.

Two explicitly published edges entail `connected(A,B,inspect)` and `connected(B,C,inspect)`, with support provenance. Neither the converse `connected(B,A,inspect)` nor the transitive `connected(A,C,inspect)` follows. Observer O1 selects H1 and O2 selects H2; each has a positive condition unavailable in the other's selected view. O12 explicitly selects both verified cuts and can derive the cross-world direct edge. That composite context remains local selection, not global truth.

## Bounded implementation

[The membrane](membrane.mjs) has four fixed conditions: `resolves`, `live_referent`, `affords`, and directed `connected`. The founding operation `inspect` maps explicitly to the existing native `observe` operation. Unknown conditions fail closed. There is no user-supplied rule program, recursive premise language, name parser, or transitive/converse inference rule.

Terms are bounded observer-declared cup links to an owner world and interface, optionally an incarnation. A link is confirmed only against selected owner publication evidence; the carrier's spelling has no rule semantics. This internal `CupTerm` is removable. [AFFORDANCE-FIELD-001 / #81](https://github.com/the-static-collective/reLATTE/issues/81) is not executable in the parent snapshot, so this experiment neither implements nor changes its proposed `NameCupV0` contract. It also leaves the separate [perceived-affordance contract / #83](https://github.com/the-static-collective/reLATTE/pull/83) untouched.

Projection reuses #78's `FieldObserver` verification, attestation and collision behavior. It requires the exact observer-declared selected world set and, for declared #79 incarnations, the exact selected journal set. Histories must be signed and chained under explicitly supplied anchors. Bridge journals use #79's unchanged verifier and an explicit ledger-to-field incarnation binding. Selected terminal fences override historical publication liveness. Observer abilities and observation time are local declarations, not objective facts inferred from signatures.

Assertions include supported publication, offer/incarnation, operation compatibility, liveness, withdrawal, observer ability, explicit directed relation, terminal death and realized bridge formation. Every positive derivation cites actual signed event references or the observer-local declaration reference. Support locators resolve into the retained signed inputs. Negative results are scoped to the complete selected cut; omitted history is `OUTSIDE_SELECTED_VIEW`, not a global falsehood.

The environment pins the policy, full selected inputs, observation time, frontiers, assertion digest, support locators and inherited view snapshot. Limits are eight selected owner histories, eight incarnation journals, sixteen terms, eight declared abilities, 512 assertions, and each parent's 4,096-event bound. Verified contexts are immutable. A parsed context must be reconstructed and verified before derivation; resealing invented assertions does not pass reconstruction.

`EntailmentWitnessV0` retains observer/policy, history-cut references, frontier and assertion digests, condition/term, result, referents, support/assertion references, fixed rule and derivation time. Its content identity changes when support or a selected frontier changes. It carries `authority: []` and `semantic_effect: none`.

[Selection/execution](execution.mjs) binds a positive witness to the historical view, route target, native operation and referent. It reacquires a context from a trusted observer-local callback, rejects rollback of retained cuts, re-derives the condition, and checks offer/incarnation continuity. It then invokes the unchanged #78 executor or an actual #79 bridge. It cannot issue grants or accept an artifact-supplied execution adapter. Parent owner handles and explicitly held grants remain outside the membrane. Fresh owner checks still occur at entry and before native boundaries; withdrawal after re-entailment remains authoritative.

The formation loop uses actual #79 native observation and occurrence journal entries. Reprojection advances the frontier and assertion digest from those realized events; successful derivation alone is never recorded as an occurrence. Carried results use unchanged P-256 crossings; an independent durable receiver explicitly chooses HOLD. Entailment does not select that disposition.

## Run and cold-verify

Node 24 and the parent's pinned dependencies are required:

```sh
npm ci
node --test experiments/psi-membrane-001/tests/*.test.mjs
node experiments/psi-membrane-001/specimen.mjs
node experiments/psi-membrane-001/verify.mjs work/psi-membrane-001
```

The checked-in [compact receipt](../../fixtures/psi-membrane-001/receipt.json) exposes both h0 and h1 witnesses and a digest of the [compressed signed evidence](../../fixtures/psi-membrane-001/evidence.tar.gz). It is unsigned derived evidence with no semantic effect. The archive retains literal JSON bytes and content-addressed context objects; no private keys are included.

```sh
mkdir -p work/psi-membrane-001-fixture
# Compare this digest with receipt.json's archive_sha256 before extraction.
sha256sum fixtures/psi-membrane-001/evidence.tar.gz
tar -xzf fixtures/psi-membrane-001/evidence.tar.gz -C work/psi-membrane-001-fixture
node experiments/psi-membrane-001/verify.mjs work/psi-membrane-001-fixture
```

[The cold verifier](verify.mjs) verifies the independently anchored proof signature, selected field/journal prefixes, reconstructed environments, witnesses, route proposals, selection bindings, native occurrence evidence, ticket signatures and grant state at signed owner heads, sequential use bounds, receipt signatures and crossing ancestry. It checks all founding cases. It never constructs an owner or runtime, restores grant counters or tokens as live authority, or calls execution/publication. The hostile suite checks a fresh Node verifier process and verifies that evidence files remain unchanged.

The checked receipt's fixture test verifies archive/byte digests, both printed witnesses, and the full cold proof. Signed inputs establish attribution/integrity under chosen anchors, not physical or universal truth. `roots.json` supplies explicit specimen trust inputs for internal coherence; external consumers must select their own anchors.

All **32 membrane tests** pass, including the twenty issue attacks, mid-boundary withdrawal, the realized formation loop, selection/rollback/adapter attacks and cold-verifier tampering. The **118-test inherited seam suite** and **385-test repository suite**, TypeScript check/build, trust mutations and trust/bootstrap/sovereign replay also pass. Eight composition tests overlap between inherited and repository suites; these are not additive unique-test counts.

For inherited donor-dependent tests, use the same pinned donors as #78/#79:

```sh
git clone https://github.com/the-static-collective/tranchNOSE.git ../tranchNOSE
git -C ../tranchNOSE checkout 670ca60012929b51e66b8bac7d0c9b85a4f95d7b
git clone https://github.com/the-static-collective/GHoT.git ../GHoT
git -C ../GHoT checkout e35dd470384d864b7b0b629a68dad570875a7df0
TRANCHNOSE_ROOT=../tranchNOSE GHOT_ROOT=../GHoT node --test test/composition-instance-001.test.ts experiments/composition-instance-002/tests/*.test.mjs experiments/dynamic-interface-field-001/tests/*.test.mjs experiments/interface-superspace-001/tests/*.test.mjs
TRANCHNOSE_ROOT=../tranchNOSE GHOT_ROOT=../GHoT npm run verify
```

## Governing snapshot and claim boundary

The inherited snapshot is `21e7d7a7413507b3b9301354f51f7f98d89d2eee`. Cold verification checks `src/`, `spec/`, stable schemas and #77/#78/#79/#76 experiment code against that snapshot. No inherited files, package contracts or normative behavior change. This is the snapshot governing this specimen, not a permanent restriction on future reLATTE evolution. Preserve this checkout for historical replay after future core changes.

The context-acquisition callback, implementation attestations, local clock, declared abilities and chosen trust bindings are trusted host inputs. Reacquisition does not establish a globally latest frontier. Even if a callback supplies a retained historical cut, actual owner gates still determine execution. There is no distributed atomic entailment/owner check; parent gates handle races at each native boundary. This is a trusted local specimen, not an OS sandbox for malicious executable host code.

Research inspiration comes from Ψ-calculi, non-monotonic assertions, transition provenance, directed connectivity, and history-conditioned event structures. These are methodological neighbors, not protocol authority. The slice earns inspectable bounded history-cut derivations and stale-execution refusal. It earns no full Ψ-calculi conformance, theorem proving, global truth/state/selection, globally latest history, objective observer ability, causal truth from signatures, consensus, or semantic equivalence of histories.

```text
FORMATION != ASSERTION != TRUTH
ASSERTION != AUTHORITY
PROJECTION != SOURCE
SELECTED HISTORY != GLOBAL HISTORY
ASSERTION COMPOSITION != GLOBAL MERGE
ENTAILMENT != OCCURRENCE / SELECTION / AUTHORIZATION / EXECUTION / ADMISSION
HISTORICAL ENTAILMENT != CURRENT AFFORDANCE
CURRENT AFFORDANCE != CURRENT AUTHORITY
SAME CURRENT ENTAILMENTS != SAME HISTORY
SAME HISTORY PREFIX != SAME FUTURE
PROVENANCE != AUTHORITY
CONNECTIVITY != SYMMETRY / TRANSITIVITY
SILENT DELAY != NO CHANGE
WAITING != HISTORY STASIS
EVENT != PUBLICATION != DISCOVERY != SELECTION != AUTHORIZATION != EXECUTION
LINEAGE != AUTHORITY
NAME POSSESSION != AFFORDANCE
```

Ψ entails. reLATTE remembers. Authority still lives elsewhere.
