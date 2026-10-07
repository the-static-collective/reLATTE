# FIRST CONTACT 001 — A Knock Between Sovereign Worlds

**Status:** bounded loopback integration specimen; **not** public internet deployment or two-person field proof.  
**Owner:** reLATTE transport + sovereign receipt substrate.  
**Related:** [Issue #61](https://github.com/the-static-collective/reLATTE/issues/61), [STORYSHIP](https://github.com/the-static-collective/STORYSHIP), [webZ](https://github.com/the-static-collective/webZ).

## The question

Can one independently authored contribution arrive across a *real transport*, remain unadmitted, meet two different owner-local decisions, and carry a signed response back without requiring shared sovereign state?

```text
visitor B signs candidate X
    ├── HTTP → Storyship A's porch → RECEIVE → A chooses ADMIT
    └── HTTP → Storyship C's porch → RECEIVE → C chooses REFUSE
                      │                            │
                signed response               signed response
                      └──────── HTTP return ───────┘
                        visitor verifies independently
```

## Executable evidence

Run:

```bash
npm install
node --test --experimental-strip-types test/first-contact.test.ts
```

The test uses the actual R3/R5/R6 primitives: `sealCrossingEnvelope`, `makeTransportFrame`, `postHttpTransport`, `createHttpRelayServer`, `LocalReceiver`, `buildSovereignResponseBundle`, and `verifySovereignResponseBundle`.

Its two receivers have independent signing keys, persisted journals, world IDs and TCP listener ports. Source X is the same canonical signed crossing at both. Both HTTP ACKs confirm **delivery only**. No protected story consequence exists until the owner decision. B's ADMIT generates a synthetic local candidate reference; C's REFUSE generates none. Separate loopback HTTP return endpoints serve each signed response. The sender verifies signatures and cross-wiring. Duplicate arrival is idempotent. Cold replay reconstructs both worlds.

The payload ref is **synthetic**; no participant media was moved, resolved or published. One test process orchestrates the separate endpoints and simulated human decision calls. The two HTTP return endpoints are test-only and have no authentication; they bind exclusively to `127.0.0.1` and **must not be deployed**.

## Network architecture, ordered by authority

| Surface | Owns | Must not claim |
| --- | --- | --- |
| webZ | inviteable world addresses, opt-in discovery, navigation, revocation UX | admission or user identity |
| reLATTE | signature, exact crossing, network delivery, local receipts, independent verification | truth, personhood, or universal world state |
| SupaBardo | optional inert relay / unresolved store-and-forward | source authority or automatic local consequence |
| STORYSHIP | user-visible narrative projection, local participation, re-entry | that generated rendering is historical fact |
| Each participant | choices, content permissions, world-local consequences | blanket ownership over somebody else's work |

The code path is opt-in and separate from STORYSHIP's launch-v0 no-spend, human-mediated provider gate.

## Real two-device acceptance: next crossing

1. **Porch identity**: A explicitly creates a scoped invitation (world ID, endpoint, purpose, maximum bytes, expiry, revocable capability). Do not put reusable bearer credentials in query strings, public URLs, logs, GitHub, or analytics.
2. **Transport**: HTTPS (and origin validation) at the edge; invitation authorization, body limit, quotas, and anti-abuse filters *before* the existing reLATTE HTTP relay; source signature checks are necessary but not invitation authorization.
3. **Arrival**: A's LocalReceiver logs a verified RECEIVE as inert; page/UI shows a human-readable pending candidate. No automatic ADMIT; no broad implicit media rights.
4. **Decision**: A approves or refuses with a fresh explicit owner act. HOLD is not a delayed auto-admit. Preserve attribution and refuse without erasure.
5. **Return**: B receives a signed response via an authorized inbox or outbound push and verifies the full SovereignResponseBundle. TLS transport ACK != signed RECEIVE receipt != signed disposition.
6. **Re-entry**: A's Storyship renders admitted consequence with a link back to original source, consent terms, and receiver receipt. Narrative projection cannot falsify the crossing ledger.
7. **Cold & hostile**: restart both clients, resend duplicates, forge/cross-wire bundles, expire/revoke invites, send oversized or malicious media, test adversarial filenames and XSS, lose the optional relay, then replay. Both users retain independent records.

## Hard boundary: no accidental public server

The current `createHttpRelayServer` is intentionally minimal. By itself it does **not** supply TLS, authenticated endpoints, capability scoping, throttling, identity binding, content moderation, upload protection, or a durable store-and-forward queue.

Do **not** bind it publicly or expose the experimental response endpoint to a tunnel. Production internet connectivity needs an authenticated edge and independent security review.

## Falsification conditions

This specimen fails as a general networking claim if a first-time visitor cannot complete the invite flow, if the returned signature cannot be verified without A's private state, if a refused crossing becomes story canon, if shared relay state is required for reconstitution, or if publication permissions are assumed from delivery.

**Exit criterion:** two real people, on different devices and networks, share one invited bounded contribution with **independently verified return**, an explicit local decision, preserved ancestry, a deliberate refusal case, and a redacted reproducible witness bundle.

```text
ENCOUNTER != AGREEMENT
INVITE != ADMIT
ACK != RECEIPT
SIGNED != TRUE
SHARED HISTORY != SHARED AUTHORITY
```
