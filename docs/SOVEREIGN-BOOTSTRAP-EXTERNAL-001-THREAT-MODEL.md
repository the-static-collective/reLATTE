# SOVEREIGN-BOOTSTRAP-EXTERNAL-001 — threat model

The externally administered campaign is **NOT_EXECUTED**. The local campaign attacks signed claims and durable owner knowledge with P and B actively malicious. Claim IDs refer to the [claim matrix](SOVEREIGN-BOOTSTRAP-EXTERNAL-001-CLAIM-MATRIX.md) [S01–S06].

| Adversary / loss | Can manufacture or suppress | Cannot derive from that access alone | Bounded result / recovery |
| --- | --- | --- | --- |
| Malicious P | Valid incompatible policies, backdates, false assertions | A or B root decisions without those keys | E2 signed policy contradiction; HOLD until fresh scoped decisions [S04, S17, S24] |
| Malicious B | Valid B proposal/activation forks, B journal forks, selective disclosure, refusal | A signature or replacement of A independently retained observation head | E2 attributable contradictions on observation; refuse silent convergence. Exact local archive/pins protect known evidence [S05–S09, S13, S16] |
| P + B | Coordinated signed lies and hidden histories | A signature under an uncompromised A key | No signed-claims-to-truth upgrade; unknown forks remain unknown. Fresh A choice remains necessary [S09, S16–S17, S24–S25] |
| A key compromised | New A assertions, observations and consent | An original B signature without B key; old pinned receipt preimage | New A choices may be untrustworthy; recover old independent pins/counterevidence, choose replacement root externally [S26–S30] |
| Both root keys compromised | New apparent bilateral acts and forged local declarations | Alteration of existing content-addressed receipt bytes without detection under retained pins | E3 attribution alone cannot establish honesty or live human consent; fresh external trust decisions required [S24, S26–S31] |
| Broker / B archive | Selective public subsets, reordered presentation, withheld roots/records | Root-signed observation commitments or frozen core signatures | Merge with independently retained own view; missing required evidence HOLD; obtain exact backup [S07–S13, S19, S29] |
| Own archive partly lost | Deny reproduction of a signed conflict pair | Manufacture missing counterevidence | Remembered local IDs retained, reconstruction E0/HOLD; restore exact public records [S10–S11, S29] |
| Own pin/log lost or replaced | Attempt a cleaner initial state | Derive the old selected root/head/observation selection from a hash or self-signature | HOLD unless independently retained selections and records can be restored; changed selection is a new external decision [S13, S26–S29] |
| Verifier / CI configuration | Lie about assessment or skip guards | Change independently verified original signature bytes | Recompute with a correct replacement verifier under own independently selected inputs [S22–S23, S28–S30] |
| Clock / network order | Misleading chronology or delayed encounter | Trusted real arrival time, domain separation or causal receipt dependencies | Causal bindings and owner-log parents remain; clocks supply no independent administration evidence [S24, S27, S30] |

The [trust-root graph](../fixtures/sovereign-bootstrap-external-001/trust-root-graph.json) is acyclic. Each perspective terminates at its own external selection, correct verifier/crypto and evidence survival assumptions. A new bilateral edge does not retroactively justify either original root. B’s counterclaims can be signature-attributable without accepted B authority [S06, S26–S30, S38].

The ceiling is local E3 key corroboration with retained E2 contradictions. Actual independent administration, no common orchestration, objective old truth, hidden-fork absence, current human consent and global finality are unobserved. A malicious administrator cannot be compelled to run an honest verifier or agree; any fresh edge requires its attributable scoped act and the other side’s independent choice [S01–S02, S24–S26, S31–S32, S40].
