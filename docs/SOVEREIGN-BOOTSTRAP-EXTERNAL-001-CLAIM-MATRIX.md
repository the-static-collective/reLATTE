# SOVEREIGN-BOOTSTRAP-EXTERNAL-001 — claim matrix

Machine-readable source: [claim-matrix.json](../fixtures/sovereign-bootstrap-external-001/claim-matrix.json). Actual external execution is **NOT_EXECUTED** [S01, S33].

| ID | Exact bounded claim | Class | Basis / limit |
| --- | --- | --- | --- |
| S01 | SOVEREIGN-BOOTSTRAP-EXTERNAL-001 was executed across independently administered pre-existing roots | UNOBSERVED | external-inputs.json: NOT_EXECUTED / BLOCKED_EXTERNAL_INPUTS; no independently administered roots or operator evidence supplied |
| S02 | Current local adversarial specimens establish separate administrators, independent pin retention or absence of shared orchestration | UNOBSERVED | test helper/driver controls both local keys; no CI or local directory trick upgrades this |
| S03 | The external operator adapter takes one existing selected root/key and creates no new root | OBSERVED | script has no init or generateP256KeyPair; checkpoint keeps original root/history; wrong key rejected |
| S04 | P equivocation is discoverable under each own-root delegation without admission of B authority | DERIVED | own independently supplied root/history and selected P claim; signed incompatible global rules; peer_authority UNOBSERVED |
| S05 | B actively signs two competing activation claims for the same slot/version/base history | OBSERVED | four hostile records: two role-correct B proposals and two valid B decisions; signatures verified separately |
| S06 | Contradictory B signatures are attributable before B sovereignty is trusted | DERIVED | native/primary conflict reconstruction; E2 SIGNED, authority UNOBSERVED; no claim of B honesty or remote actual activation |
| S07 | B can silently erase A previously recorded contradiction by serving only one branch | REFUTED | local view and owner-pinned observation head remain separate from incoming evidence; local merge only adds |
| S08 | Separate observers can exchange previously disjoint B branches and reconstruct a signed contradiction | DERIVED | observer-union specimen; neither observer alone saw the activation fork; union retains both records |
| S09 | An observer can prove a never-seen deliberately withheld B fork | REFUTED | incomplete never-observed history test; global_completeness UNOBSERVED; refusal needs no invented contradiction |
| S10 | Pinned signed observation history preserves remembered conflict IDs when payload records are lost | DERIVED | known-loss.json: remembered IDs remain; fresh signature-pair reconstruction degrades to E0; HOLD |
| S11 | Remembered conflict IDs establish currently reconstructible counterevidence without the underlying records | REFUTED | remembered local signed claim and reproducible signed pair are distinct; missing archive prevents new checkpoint/edge |
| S12 | The prior stateless assessor could forget its conflict facet after truncated input while still failing closed | OBSERVED | prior-stateless-loss.json on baseline a8f975b: EQUIVOCATION before, UNOBSERVED/HOLD after; not an admission bypass |
| S13 | Hostile proof can replace the independently retained own view with a cleaner candidate | REFUTED | RETAINED_LOCAL_VIEW_REPLACEMENT; known local IDs copied before assessing incoming edge |
| S14 | A fresh bilateral edge advances beyond known version 2 claims and acknowledges every known contradiction | DERIVED | new version 3 proposal, local decisions, both frozen closures; exact conflict IDs, old policy IDs, history/observation heads and view digests |
| S15 | The new edge erases either old policy selection, history or known contradiction | REFUTED | fixed false history_rewrite/sovereignty_import/conflict_erasure; old data immutable; signed conflicts retained |
| S16 | Neither side can authorize a new edge by withholding, refusing or replaying old consent | DERIVED | missing/refusal HOLD; old receipt type/proposal binding cannot serve new scoped local decision |
| S17 | P can impersonate either local root decision | REFUTED | P signature remains valid but wrong root/role rejected; root point distinct from delegated P |
| S18 | One valid signer can fabricate a conflict fact solely through a local conflict label | REFUTED | every observation snapshot recomputes conflicts from archived signed records; false conflict assertions fail |
| S19 | Losing signed archive or closure evidence can increase an earned edge level | REFUTED | all archive record deletions tested with retained owner pins/views; frozen core binds all decision receipts; levels decrease or remain |
| S20 | 128 deterministically selected incomplete deliveries preserve known local contradiction | OBSERVED | seed 0x5e001; durable local archive unchanged; incoming subset never substitutes for owner history |
| S21 | Benign JWK key IDs hide one underlying B signing key | REFUTED | normalized P-256 point comparison detects B fork despite metadata aliases |
| S22 | Primary and native verifiers independently reconstruct the same conflict and final edge IDs | OBSERVED | frozen fixtures, independent semantic path, node:crypto signatures and ID bodies, cold public-only subprocess replay |
| S23 | The verifier paths have full implementation or cryptographic independence | REFUTED | shared specification, strict ingress, Node/JSON/runtime ancestry and native foundation receipt primitives; no high-level assessment imports |
| S24 | A software signature establishes old objective truth, actual remote activation or an honest administrator | REFUTED | history means old attributable local statements and choices; historical_truth UNOBSERVED; malicious B signatures stay valid |
| S25 | Fresh edge grants global peer sovereignty or transfers root authority | REFUTED | THIS_NEW_EDGE_ONLY; peer_key/genesis explicitly selected only for the exact new edge; administrative/human authority unobserved |
| S26 | Actual administrators A/B and their previously selected root/head/observation pins are independently controlled | ASSUMED | external run requires operator-owned roots and separately retained pins; caller must supply and substantiate external control sources |
| S27 | Root pre-existence, independent administration and no shared orchestration can be proven by timestamps, root self-signatures or local metadata | REFUTED | external evidence/inspection is required; machine and key multiplicity is not administration |
| S28 | At least one honest verifier, runtime/configuration and protected local selection survives | ASSUMED | an administrator can ignore any verifier; an honest replacement under that administrator root can reproduce the result |
| S29 | Enough public counterevidence and separately retained selections survive | ASSUMED | all archive and pin loss prevents reconstruction; exact backups can recover, changed trust selections are new decisions |
| S30 | P-256/SHA-256 and the canonical signed receipt implementation remain sound | ASSUMED | existing reLATTE cryptography/canonicalization unchanged; no new cryptographic primitive |
| S31 | New edge has global finality or excludes all hidden future competing activations | UNOBSERVED | both current keys may sign another fork; no global completeness/consensus; known later forks remain detectable on encounter |
| S32 | Malicious B can be forced to consent, behave honestly or reach an actual human conclusion | REFUTED | liveness/current consent/human identity unobserved; verifier symmetry does not establish operator cooperation |
| S33 | External signing ceremony and pre-existing roots remain required inputs | OBSERVED | external-inputs.json names missing root/pin/control/operator evidence; actual external execution NOT_EXECUTED |
| S34 | 30 new local malicious-admin tests and current 326-test main suite pass | OBSERVED | final verification: 296 prior cases plus 30; actual external administrative campaign not counted as passing |
| S35 | 39 deliberate invariant removals are detected, including seven new sovereign guards | OBSERVED | mutation report; names exact killer test and source hash; no exhaustive invariant coverage claim |
| S36 | PR #67 remains draft and unmerged at the reported SHA | OBSERVED | GitHub metadata final check; no merge |
| S37 | Public contexts/fixtures and the cold verifier transport private keys | REFUTED | public-only ingress/output checks; one existing local JWK read by signer; cold replay reads only public evidence/pins; secret-copy absence globally UNOBSERVED |
| S38 | Trust graph closes through circular mutual root endorsement | REFUTED | acyclic graph ends at external local selection, survival and verifier assumptions; new edge does not justify its prior roots |
| S39 | A future bilateral act imports B historical claims as A accepted truth | REFUTED | explicit acknowledgement retains contradiction rather than endorsing its truth; old local selections stay distinct |
| S40 | The experiment strongest currently earned result is a local E3 distinct-key reconciliation with E2 retained contradictions | DERIVED | primary/native frozen proof; actual independent administration and no common orchestration remain UNOBSERVED |
