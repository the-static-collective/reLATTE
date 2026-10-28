# BRIDGE-005 — Independently signed, review-only reLATTE crossing

The Static Collective's public Bridge Desk now exports exact, source-pinned, public-only `abundent.bridge-work-card/v1` candidates for JAR;VIS and planZ. The browser's SHA-256 candidate ID verifies only the public card's digest; it is **not** a signature and is not evidence of consent.

`src/bridge-review.ts` supplies a **separate, opt-in** local crossing to a real reLATTE `LocalReceiver`. It validates all 23 known candidate doors, four actions, the exact historical source commit, all authority-denying flags, and the digest. The owner supplies real source signing keys and must explicitly opt into review. It creates a signed `BRIDGE_PUBLIC_REVIEW_CANDIDATE` envelope with only a hash pointer to the public candidate and no journal notes, credentials or contacts. An independently controlled receiver can issue genuine signed `RECEIVE` and `HOLD` or `REFUSE` receipts in its own durable local journal.

**Limit:** the code refuses `ADMIT`, `RETURN`, and all execution or transmission effects; it never authenticates an outside institution, sends an application or signs on that institution's behalf. A synthetic fixture's public/private keys authenticate only the test fixture. Real keys, receiving organization permission, independent operator/sponsor identity, and transfer of the original packet bytes remain local human requirements. The `LocalReceiver` journal stays with the receiver; reLATTE is *not* a central network history.

Test `test/bridge-review.test.ts` verifies no receipt without an explicit local source-approval gate, signature-valid independent RECEIVE/HOLD and REFUSE on synthetic worlds, replay idempotency, and refusal of modified or authority-claiming packets.

This is a cryptographic **review transport prototype** that complements JAR;VIS's real localhost reader and planZ's offline triage. It must not be described as a deployed cross-organization communications system, verified field outcome, institutional enrollment or actual external receipt.
