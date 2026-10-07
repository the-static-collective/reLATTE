# TRUST-BOOTSTRAP-EQUIVOCATION-001 — threat model

Claims refer to the [claim matrix](TRUST-BOOTSTRAP-EQUIVOCATION-001-CLAIM-MATRIX.md). The bounded target is the discovery and retention of a policy signer’s contradictory accounts across two previously selected local roots, followed by explicit scope-limited future agreement. Cryptographic corroboration does not establish separate administration, social identity, truth or a unique global policy [B01–B12, B22–B30, B35–B36].

## Adversary and trust boundary

P has its valid key and may sign any incompatible account. The broker may substitute, delete, duplicate, reorder or mix public artifacts. Either root can validly refuse, sign false statements, choose the wrong peer, rewrite a candidate history, sign contradictory choices or collude. A verifier may lie. Clocks and cached state are hostile. Root selection, known local heads/activation, verifier configuration and durable backups are separate external inputs [B03, B08–B15, B20, B23–B25, B28–B32].

| Compromise | What can be forged / denied | What remains bounded | Conclusion / recovery | Human decision |
| --- | --- | --- | --- | --- |
| P signing key | Both incompatible policy accounts; convincing backdates | Cannot sign either root’s decision, delegation or closure without its key | Preserve signatures and both choices; EQUIVOCATION/HOLD until new explicit root decisions [B02–B04, B09, B20] | New root-scoped decisions; human nature UNOBSERVED [B27] |
| A root key | New A journal forks, declarations, admissions and closures | Cannot independently sign B’s point or replace an independently retained A old head | HOLD for changed pinned head or known activation; recover old pins/evidence and explicitly select replacement trust [B10, B23, B28] | Required for trustworthy new root selection [B23] |
| B root key | False B consent, history forks, retrospective statements | Cannot independently sign A’s point; pinned B old heads remain checkable | A must not treat signed B statements as truth; disclose compromise, preserve receipts, choose new scoped peer if desired [B07, B20, B22–B24] | Required to select a trustworthy replacement peer [B23] |
| Both root keys | Entire alternative future edges and unpinned rewritten histories | Existing receipt bytes/signature validity and independently retained pins remain reconstructible | E3 signature coherence only; current trust requires fresh external decisions; global uniqueness UNOBSERVED [B10, B22–B24, B28–B30] | Yes [B23] |
| Broker / one archive | Delete proof/pins in its possession, substitute or withhold another scope | Cannot sign root closure or alter its committed core without keys | Missing committed record HOLD; obtain matching public backup. Complete unsigned listing cannot close scope [B14–B15, B25, B31] | No for exact backup; yes for changing trust selection [B23, B25] |
| Verifier / CI config | Lie about result or execute altered checks | Public receipt signatures/IDs and bindings remain independently reproducible | Replace with an honest verifier/configuration; recompute from original selected pins [B18–B19, B24, B31] | Needed if choosing replacement execution trust [B24] |
| Clock | Sign arbitrary timestamps, reorder apparent wall-clock history | Parent/head/proposal/receipt bindings define causal dependencies | Recompute causal evidence; trusted arrival chronology UNOBSERVED [B20] | No universal expiry decision is invented [B20] |
| One closure lost | Deny a complete frozen encounter conclusion | Surviving records stay signature-attributable | HOLD / E0 mutual edge; retain E2 surviving signature facet; restore exact closure [B14, B25] | No for exact recovery [B25] |
| Local root/head/activation selection lost | Supply a plausible root or alternative valid activation | Internal proof coherence is checkable; external prior selection cannot be inferred | HOLD without local root; lack of known activation prevents global fork exclusion [B05, B23, B28–B30] | Yes if no independently retained pin survives [B23, B25] |
| All original processes dead | Runtime denial; signing continuation unavailable | Durable records and externally supplied selections survive if archived | Same E3 historical edge reconstructible; liveness and secret erasure unobserved [B16–B18, B25–B26] | No for historical replay [B25] |

## Root graph and ceiling

[trust-root-graph.json](../fixtures/trust-bootstrap-equivocation-001/trust-root-graph.json) marks every node ASSUMED, OBSERVED or DERIVED. The joint edge does not justify the roots that authorize its decisions. Root selection terminates at external assumptions rather than circular proof [B23–B25, B37].

Per perspective, the local root is selected externally. The local root’s signed decision introduces the exact peer key **for this edge only**. The peer’s self-signed history supplies coherence and the chosen peer key supplies attributable consent; neither globally imports foreign root authority. Interpreting this peer as a genuinely independent known administrator still needs external evidence [B04–B07, B22–B23, B26, B36].

The ceiling is E3 CORROBORATED-KEYS under selected local roots, exact frozen encounter evidence, surviving pins and at least one honest verifier. No E5 administrative separation, human quorum, absence of withheld forks, current liveness or finality is earned. Replacing roots or pins can change current local acceptance; it cannot change the old signed record bytes or old selections [B06–B07, B14–B15, B22–B30, B36].
