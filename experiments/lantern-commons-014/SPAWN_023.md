# SPAWN 023 — reLATTE Permissioned Crossings

## A first working boundary between independently operated world cartridges

**Source:** [Lantern_023_Permissioned_Crossings.html](Lantern_023_Permissioned_Crossings.html)

**Public direct-download endpoint:** https://kbhqacsdvjsstzyplqij.supabase.co/functions/v1/relatte-crossing-023/download . It delivers the standalone HTML file as an attachment. Open the downloaded file locally; the Supabase Edge host is **not** an interactive HTML site. Its GET root and health query are read-only JSON metadata, and POST is refused. This delivery does not publish any offers or import packets.

SPAWN 022 established standalone executable offline world cartridges. SPAWN 023 enables two separate copies to exchange **cryptographically signed, narrowly scoped capability packets** by deliberate copy/paste. Each person's local cartridge retains its own simulation and does not inherit another person's inventory, identity, private notes, or observed successes.

This is a functional **offline two-party consent handshake**. It is **not** yet a live federated public registry or a physically verified transfer.

### Test the crossing

1. Open `Lantern_023_Permissioned_Crossings.html`, seed or create real hats, and create four hypothetical world forks. Select one.
2. Under **reLATTE crossing bridge**, export a world with the crossing desk. Open that exported HTML in one browser tab/device **A**.
3. Export another world cartridge for operator **B** and open it separately; for a meaningful test, use a separate device/browser or private session. **Do not represent two tabs run by one person as two independently verified people.**
4. Both people click **Create a one-session signing key**. These are fresh P-256 keys kept in browser memory for the duration of that tab, not identity proofs.
5. A writes a **non-sensitive, genuinely checked, small capability** and explicitly checks the voluntary OFFER consent box before clicking **Sign OFFER packet**. No share occurs yet.
6. A manually sends the full JSON text in **My latest signed outbound packet** to B through a communication channel they choose. B pastes it into **Inbound signed JSON packet**, clicks **Verify inbound signature and chain**, and reads the limits.
7. B chooses whether to participate, checks the explicit INTEREST consent box and clicks **Sign INTEREST response**. B copies that JSON to A.
8. A verifies the interest and its exact signed offer reference, then chooses **HOLD** (more review), **ADMIT** (permission for only the specified test/review), or **REFUSE**, signing that decision manually.
9. B independently verifies the signed decision. B can sign **Acknowledge decision (NOT delivery)**. A verifies the final signed acknowledgment. Both now have a chain of matching signatures and consent choices. This does **not** prove an actual transfer, identity, quality, availability or completion.
10. Any physical-world action requires new, separate real-world permission and evidence. If the operator wishes to submit an eligible *real* local OFFER/NEED, they can separately open the already-live [NOW ROUTE pilot](https://kbhqacsdvjsstzyplqij.supabase.co/functions/v1/now-route-live) and enter it deliberately. That separate system does **not** accept or verify SPAWN 023 signatures, and the cartridges **do not automatically synchronize with it**.

### Packet protocol

The portable deck executes a fixed `relatte/crossing-packet/v1` contract:

- **OFFER**: random UUID; session public signing key; one generic category; 1–20 units; descriptive label; scope `review | test | copy`; issued/expiry times; ECDSA P-256/SHA-256 signature.
- **INTEREST**: a different key signs an interest that binds to the exact signed offer packet hash, offer ID, quantity and generic purpose.
- **DECISION**: original offer key signs `HOLD | ADMIT | REFUSE` and binds to both exact signed upstream packet hashes.
- **ACK**: interest key signs a final `SEEN_NOT_DELIVERED` acknowledgment binding to the offer, interest and provider decision.

Each imported packet is checked for exact schema/fields, safe bounded data, a valid time window, public-key structure, ECDSA signature, and correct parent packet hashes/roles. Unknown fields, signature edits, expired messages, wrong actors, second conflicting interests and out-of-scope messages are rejected. Only one OFFER/INTEREST/DECISION chain is supported in this minimal pilot.

**Key limitation:** A signature proves possession of a *session* private key, not someone's legal identity, real-world capacity, ownership, safety, actual consent of other persons, a completed delivery, or absence of later replay elsewhere. The session private key is not exported and cannot survive a tab reload. Exporting the world cartridge does not export the key. User-selected packet transmission is manual; if the tab closes mid-protocol, begin a new crossing.

### Consent and safety

The user must explicitly opt into offering and again into expressing interest. Provider signing is separate and can refuse. The default output is **no action**. No email, phone number, detailed address, URL, credential, account number or uncontrolled plaintext is permitted in the protocol's free-text fields. The available categories are **tools, reusable materials, reproducible methods, original art, skills and digital processes**—not food or cash. Even accepted materials must be independently inspected for safety, fitness, actual ownership and permission.

No publishing, internet requests, backend credentials, remote code execution, automatic resource reservation, currency settlement, inventory deduction, contact scraping or user enrollment are involved. Even a final signed ACK specifically disclaims delivery.

### Independent use vs simulations

Virtual world score and a permissioned crossing are separate. A simulation does not create an OFFER. Only manually checked descriptions and the issuing person's opt-in may leave a cartridge. Likewise, a positive ACK does not mark a Learning Loom task completed or update a real-world inventory. The existing user-facing world export strips all world IDs, private material checks, observations and simulated run histories.

### Developer verification

Run `node --test experiments/lantern-commons-014/test_crossing_023.mjs`.

The tests execute the JavaScript extracted from actual generated standalone HTML cartridges in **two independent browser-like VMs** with independent P-256 signing keys, exchange signed packets and verify both sides of the chain. They also attempt tampering, altered scopes, wrong public keys, changed hashes, hostile personal text, expired messages, unauthorized extra interests, unknown fields and forged completion claims. The inherited 017–022 suites remain in CI.

**Not yet claimed:** public discovery, live cartridge-to-cartridge real-time delivery, externally verified identity, independent stock/auditor signatures, real-world fulfillment, field-measured benefit, deployment to a permanent domain or formal signature-based settlement.

**Code status:** draft stacked PR #172 on SPAWN 022 #171, not merged. A **new isolated, public GET/HEAD-only Supabase Edge Function** was deployed solely to deliver this standalone file as a binary attachment and disclose JSON health; it does not write to any production tables or change existing Supabase services. Supabase explicitly rewrites GET HTML to plain text on ordinary Edge domains, so the endpoint is download-only and not represented as a hosted interactive webpage. Existing NOW ROUTE remains independent.
