# FOUNDATION-OF-TRUST-001 — claim matrix

This is the prose rendering of [claim-matrix.json](../fixtures/foundation-of-trust-001/claim-matrix.json). Each ID below classifies its exact bounded claim. Definitions/rules do not create observations [C33].

| ID | Claim | Evidence class | Basis and limit |
| --- | --- | --- | --- |
| C01 | 137-test original regression baseline passed | OBSERVED | baseline on e250ad4; local npm run verify. Original baseline, before campaign |
| C02 | JWK metadata permitted one curve point to be counted as two keys | OBSERVED | same-key-metadata-failure.json baseline_result. Baseline bug is preserved |
| C03 | Normalized curve-point distinctness rejects the frozen same-key fraud | DERIVED | D tests and replay; WITNESS_KEYS_NOT_DISTINCT. Attribution is to key material, not humans |
| C04 | Unsigned hash-valid particularity transitions can be invented by anyone | OBSERVED | A hash-only weakness specimen/test. Legacy replay remains structural claim replay, not authorized evidence |
| C05 | Consequential continuity requires an authorized signed traversable path | DERIVED | assessContinuityPath; A/C tests. Under separately selected policy and inventory roots |
| C06 | Unsigned runner metadata previously supported a stronger custody report | OBSERVED | baseline custody verifier; F unsigned-metadata attack. Prior report cannot establish machine custody from public evidence alone |
| C07 | Signed runner declarations alone establish separate actual machines | REFUTED | F malicious valid machine-declaration specimen. Claim removed; E4 remains UNOBSERVED from artifacts |
| C08 | One operator can create two genuine keys and corroborate | OBSERVED | E mandatory permanent two-keys-one-custodian test. DISTINCT_SIGNING_KEYS_ONLY |
| C09 | Many keys imply many humans, custodians or administrative domains | REFUTED | S 1000-key one-process attack. Key-count threshold is Sybil-vulnerable |
| C10 | Verified witnesses bind the same crossing, handoff, parties, role and payload digest reference | DERIVED | primary and independent verifiers; I/J/K tests. Declared byte identity; actual payload material is not supplied |
| C11 | Crossing hash in receiver signature supplies causal binding | DERIVED | K isolated replay oracle. Does not prove key creation time or wall-clock arrival |
| C12 | A valid cryptographic signature establishes historical truth | REFUTED | M/N malicious but valid participants. Historical truth stays UNOBSERVED |
| C13 | Wall-clock timestamps establish trusted arrival chronology | REFUTED | L/N backdated, future and reversed timestamps. Trusted chronology stays UNOBSERVED |
| C14 | Known source/receiver contradictions survive replay and observer union | DERIVED | equivocation-source.json; equivocation-receiver.json; H tests. Conservative any authorized contradiction HOLD, including minority |
| C15 | Deleting any record in a pinned observation scope never raises earned confidence | DERIVED | Q deletion subsets; X seeded cases; replay loss_matrix. Requires independently retained inventory pin; replacement pin is new evidence/decision |
| C16 | Fresh verifier can detect every conflict withheld before its first observation | REFUTED | withholding-ceiling.json. Global completeness is UNOBSERVED |
| C17 | All artifact loss can be recovered cryptographically | REFUTED | Q empty observed scope; explicit survival root. Evidence cannot be fabricated |
| C18 | Historic signature validity survives key retirement and policy changes | DERIVED | K/M tests; frozen receipt IDs/signatures unchanged. Accepted current acts are evaluated separately |
| C19 | Current local policy can reject retired-key acts without rewriting receipts | DERIVED | CurrentTrustPolicy tests. Current policy is an explicit local input, not authenticated global truth |
| C20 | Versioned M-of-N policies count unique cryptographic keys with bounded roles | DERIVED | R 2/2,2/3,3/5 tests; S attack. Cryptographic quorum only; E6 does not imply E4 or E5 |
| C21 | Independent custody/admin/human quorum membership is observed | UNOBSERVED | All default custody facets unobserved. Role membership selected externally, not an anti-Sybil proof |
| C22 | Policy signer and inventory pins are externally trusted | ASSUMED | trust-root-graph.json. Exact policy/observed-inventory pins must be supplied independently |
| C23 | P-256, SHA-256 and the executing runtimes/verifiers are sound | ASSUMED | cryptographic-root; honest-local-verifier nodes. No custom cryptography; implementations share standards and Node runtime |
| C24 | A second implementation reconstructs IDs, verifies signatures and compares bindings | OBSERVED | V shared frozen fixtures; native node:crypto verifier. Shares ingress parser, JSON semantics, protocol specification and Node/OpenSSL ancestry; not full independence |
| C25 | Verifier output, broker possession, provenance and lineage grant authority | REFUTED | O/G/B/FatherHand tests. Receiver admission, capabilities and finality are separate local rules |
| C26 | Separate physical machines/hardware have been established by this local campaign | UNOBSERVED | Local process harness only. External CI platform observations may show job separation, not independently proven hardware |
| C27 | Separate custody/administrative domains or humans, and non-collusion | UNOBSERVED | All evidence taxonomy facets. No E5 or human quorum earned |
| C28 | Public artifacts can show that a key was never secretly copied elsewhere | UNOBSERVED | F machine-claim ceiling. Schema/code-path inspection observes no transported private fields, not universal absence of export |
| C29 | Every specified mutant is detected by a named assertion failure | OBSERVED | mutation-report.json; npm run trust:mutations. Twenty-one code mutants; no claim of exhaustive mutation coverage |
| C30 | Canonicalization hostile cases have defined identity/rejection behavior | DERIVED | W tests and protocol defaults. Signed nested fields retained; omitted nullable defaults and JWK metadata exclusions documented |
| C31 | Seeded graph campaign covers 2048 generated cases in default tests/CI | OBSERVED | X seed 0x1f0a001; package verify workflow. Bounded generated cases, not exhaustive state-space proof |
| C32 | Raw signatures remain attributable even if role/current policy rejects the claim | DERIVED | A/J/M/N tests invoke signature verifier separately. SIGNATURE != TRUTH != ROLE != AUTHORITY |
| C33 | E0/E1/E2/E3/E4/E5/E6/E7 labels confer no authority | DERIVED | Assessment has authority/admission/finality UNOBSERVED; documented ladder. E1/E4/E5/E7 are documented facets and not default assessor upgrades |
| C34 | Draft PR remains unmerged | OBSERVED | GitHub PR metadata final check. No merge call; draft retained |
| C35 | Regression and hostile suites, replay and mutants pass at tested SHA | OBSERVED | Final validation report. Exact counts/SHA in final report; tested code tree includes frozen fixtures |
| C36 | Bounded separate ephemeral CI jobs are externally observed | UNOBSERVED | Await current SHA workflow result; report external run separately. Never inferred by the public artifact assessor |
| C37 | Archive availability, honest root selection and at least one correct verifier survive | ASSUMED | trust-root-graph.json. These are the compromise ceiling |
| F01 | A, B, C2 are independently constituted local protocol referents with distinct keys | OBSERVED | foundation-of-trust-specimen.mjs; fatherhand.json. Independent local processes/random constitutions; no human identity claim |
| F02 | A/B and B/C2 signed founding/descendant bindings match | DERIVED | AB/bundle.json; BC2/bundle.json; both verifiers. Signed LINEAGE declaration, not same-particular continuity |
| F03 | No private key field enters intended public FatherHand output | OBSERVED | forbidPrivateEvidence; public bundle tests. Keys remain in local stores until removal; no universal non-export claim |
| F04 | A local process/store is gone; B restarts; then original B/C2 stores are removed | OBSERVED | Specimen harness mkdtemp/rm and fresh subprocess execution. Physical erasure, kernel caches and externally real source death UNOBSERVED |
| F05 | Fresh primary/secondary processes reconstruct surviving lineage from only public records and roots | OBSERVED | FatherHand subprocess test; trust:replay. Bounded survivor verification facet; root selections still ASSUMED |
| F06 | A remains archived referent while B and C2 remain distinct and inherit no founder-only grant | DERIVED | replayParticularity and hasCapability assertions; topology. No inference that B contains A, acts with A key, or receives current authorization |
| N01 | PROVISIONAL_NU remains a provisional name-surface attack label | OBSERVED | VIII tests and docs. No normative definition promoted |
| N02 | Same carrier/referent claim or identical surface history supplies neither continuity nor authority | DERIVED | VIII/A/B/C tests. Structural name path is still a declaration; consequential path requires signed evidence |
| L01 | Local CI count and final commit checks establish bounded test execution only | OBSERVED | Final report and external job evidence if available. Not a generic security claim |
| L02 | Current target property holds under every combination of arbitrary compromise | REFUTED | Both-key malicious claims; withheld conflict; root/verifier/archive-loss ceilings. Strongest claim is bounded reconstruction/consistency under explicit roots |
| C38 | Two byte-identical complete constitution records establish two independently observed constitution events | REFUTED | B full-constitution-copy limitation specimen. A copied event record is replay, not evidence of a second event; extra independent event evidence is required |
| C39 | Legacy hash-only capability grants establish cryptographic authorization | REFUTED | Legacy replayParticularity grants are structural declarations; consequential assessor authority remains UNOBSERVED. Only separately selected local capability/admission rules grant authority |

## Minimum evidence and partial loss

A frozen two-witness scope requires the exact selected policy receipt, inventory receipt, source crossing, receiver receipt, and externally retained key/policy/inventory pins. Extra witnesses increase the declared key quorum only under the event policy; custody/admin/human independence stays UNOBSERVED [C10, C15, C20–C22].

| Available evidence / selection | Conclusion | Evidence | Reason |
| --- | --- | --- | --- |
| Complete pinned source + receiver scope and matching admitted keys | VERIFIED | E3 CORROBORATED-KEYS | Matching signed witnesses; domain/human quorum unobserved |
| Complete pinned scope satisfying declared M-of-N | VERIFIED | E6 THRESHOLD, cryptographic keys only | Historical policy and distinct witness keys |
| Newly selected inventory explicitly containing one authorized source | CLAIMED | E2 SIGNED | SOURCE_WITNESS_ONLY; selecting this inventory is an external scope decision |
| Required source, receiver, observer or known conflict record deleted from retained inventory | HOLD | E0 UNOBSERVED conclusion; surviving signatures may still attribute claims | MISSING_REQUIRED_EVIDENCE; never bridge missing record |
| Policy or selected inventory unavailable | HOLD | E0 | POLICY_UNAVAILABLE / INVENTORY_UNAVAILABLE |
| Known contradictory authorized accounts retained | HOLD | E0 conclusion | EQUIVOCATION and both account IDs preserved |
| Complete selected inventory with no observed witness records | UNRECOVERABLE within supplied scope | E0 | SOURCE_WITNESS_UNAVAILABLE; global impossibility of retrieval is not inferred |
| All usable archives or trusted pins lost | HOLD until recovery, or empty-scope UNRECOVERABLE | E0 | No authentic history manufactured |

The machine-generated [replay report](../fixtures/foundation-of-trust-001/replay-report.json) lists all 16 deletion sets for the frozen two-witness scope. The tests also enumerate 31 deletion sets for a three-witness scope and all seven nonempty deletions of a conflict scope [C15, C17].

## Earned claim and unearned claims

The earned claim is reconstructible, policy-bound **cryptographic consistency and attribution within an externally pinned observed scope**. Actual handed payload material, historical truth, trusted chronology, global completeness, current authority/admission/finality and independently separated custody/administrative/human domains remain UNOBSERVED [C10, C12, C13, C16, C21–C23, C25–C28, C33, C37].

The report distinguishes a successful attack from a failed test: same-key metadata was a repaired failure [C02, C03]; signed machine spoofing [C07], dishonest chronology [C13], Sybil key quorum [C09], coherent malicious signatures [C12] and first-observer withholding [C16] remain successful counterexamples to stronger claims.
