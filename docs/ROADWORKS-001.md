# ROADWORKS 001 — The Message Finds Another Road

**Status:** experimental review branch; localhost executable proof plus candidate network map (2026-10-13).

## Why this exists

An earlier cryptocurrency/VPN experiment treated small independently owned machines as potential providers of useful connectivity. ROADWORKS explores the transport lesson: **can an already-signed reLATTE crossing survive the failure of a selected road without silently widening the permissions of the sender, changing crossing identity, or duplicating receiver-local history?**

This increment extends [REPLACEABLE TRANSPORT 001](REPLACEABLE-TRANSPORT-001.md), not reLATTE's semantic authority. Transport choice belongs to the caller's explicit policy; RECEIVE/HOLD/ADMIT/REFUSE belongs to the local receiver.

## Executable slice

Two separate HTTP listeners on loopback are connected to one durable LocalReceiver. Route A successfully delivers an independently signed crossing and intentionally loses its transport acknowledgment. The sender retries the **same** crossing through permitted route B. The receiver does not append a second RECEIVE event. B's ACK only establishes transport acknowledgment, not local admission.

The policy requires an ordered list of **allowed road IDs** and an explicit list of **allowed road kinds**. The current executor refuses unknown, disallowed, duplicate, or currently unimplemented roads. It compares ACK schema, frame identity, crossing identity, and transport-only semantics.

The tests prove actual localhost sockets and durable receiver logic. They do not prove a live Tor circuit, two physical hosts, a VPN, or anonymity.

## Named roads and current status

| Road | Intended job | Status in this branch |
| --- | --- | --- |
| Loopback HTTP | Real bounded socket test | Executable lab |
| File bundle | Removable handoff (existing R6) | Existing executable transport |
| WireGuard | Consent-based private overlay between machines | Future adapter |
| Tor onion service | Onion-reachable, separately authenticated application endpoint | Future adapter |
| I2P | Internal anonymity-oriented application service | Future adapter |
| Yggdrasil | Encrypted IPv6 overlay; **not an anonymity system** | Future adapter |
| Reticulum / LXMF | Low-bandwidth / intermittent store-and-forward delivery | Future adapter |
| **Briar and Briar Mailbox** | **Human contact continuity** over Tor, Bluetooth, local Wi-Fi or removable media; offline handoff | **Human-only companion, not automated** |

**Keep Briar.** Its important contribution is how people can exchange encrypted information and keep relationships functioning across changing physical network availability. Someone may *voluntarily* send a human invitation about a crossing using Briar, and Briar Mailbox may hold that personal message while the recipient is offline. Neither activity counts as an automated machine delivery or a receiver-signed RECEIVE receipt. Sharing a crossing identifier may create linkability; do not automatically broadcast identities, full envelopes, or private payloads through chat.

Briar announced **maintenance mode July 9, 2026**. The team intends essential security fixes, not substantial new features; this design must not rely on a future public Briar API. No unsupported API integration, background app scraping, or claims that Briar is a VPN exit node.

Sources:
- https://briarproject.org/how-it-works/
- https://briarproject.org/mailbox/
- https://briarproject.org/news/2026-maintenance-mode/
- https://community.torproject.org/onion-services/setup/
- https://reticulum.network/manual/reference.html

## Constitutional boundaries

- ROAD != DESTINATION != IDENTITY != AUTHORITY
- DELIVERED != ADMITTED
- HTTP ACK != SIGNED RECEIVE
- DECLARED ROAD LABEL != PROOF OF ANONYMITY
- REQUIRED ONION != SILENT DIRECT FALLBACK
- HUMAN INVITATION != MACHINE DELIVERY
- NO PERMITTED ROAD != OPEN INTERNET CONNECTION

Current label-based policy cannot verify underlying circuits or peer identity. Production deployment needs independently tested carrier adapters, key pinning / endpoint authentication, proxy isolation, safe DNS behavior, credential-handling rules, persistent outbound queues, logging minimization, replay protection and explicit consent for operators. Tor, I2P, private mesh, and Briar are not interchangeable security guarantees.

## Run

- npm install
- npm run verify
- For only this slice: node --test --experimental-strip-types test/roadworks-policy.test.ts test/roadworks.test.ts

## Next crossings (unimplemented)

1. Run two physically distinct machines over a permitted, authenticated WireGuard overlay.
2. Implement a Tor v3 onion HTTP client through a Tor-specific SOCKS adapter, with isolated proxy credentials and a hard prohibition on direct DNS or clearnet fallback for onion-only messages.
3. Test relay loss, restart persistence, and signed receiver-local receipts independently from transport ACKs.
4. Conduct a voluntary person-to-person Briar + Mailbox continuity experiment with manually recorded observations, not simulated API calls.
5. Trial Reticulum message delivery on actual low-bandwidth equipment.

No mining on unapproved infrastructure, unsolicited exit relay, live anonymity claim, or automatic Briar messaging is performed in ROADWORKS 001.
