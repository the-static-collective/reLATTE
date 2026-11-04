# SPAWN 024 — Live reLATTE Discovery & Signed Relay

The first public opt-in short-lived signed capability relay between independently operated world cartridges.

## Status
Backend: ACTIVE new isolated Supabase Edge Function relatte-relay-024. 2 new private RLS tables. Existing Commons and NOW ROUTE services untouched. Experimental frontend source: Lantern_024_Live_Relay.html on draft PR #173.

Backend: https://kbhqacsdvjsstzyplqij.supabase.co/functions/v1/relatte-relay-024
Append ?health=1 for health; ?action=discover&category=all for opt-in public catalogue. These are JSON APIs, not a hosted HTML page.

## Two-device field protocol

1. Open SPAWN 024 HTML locally and create a real operation and world forks.
2. Export two independent Live Relay World HTML cartridges and open them in separate browser sessions or devices, one per participant.
3. Provider creates a P-256 signing key and expressly signs a narrow non-sensitive OFFER in the Crossing Dock, after inspecting actual availability/rights.
4. Provider independently checks the public discovery consent in the Relay panel and chooses Publish. The offer is visible to all visitors for up to one hour. Server issues a random owner capability token and stores only its hash.
5. Recipient presses Find recent opt-in offers, selects one, and verifies the signature. Recipient then voluntarily signs an INTEREST and separately chooses Send. The server verifies the exact offer hash and an independent signing key. It issues an independent guest capability token.
6. Provider checks their private inbox by Refresh or voluntary 45-second polling, verifies interest, chooses HOLD, ADMIT or REFUSE, signs it, then explicitly sends the decision.
7. Recipient refreshes, checks the provider signature and may sign/relay an acknowledgment. Provider can verify it. Acknowledgment means SEEN_NOT_DELIVERED and never asserts a physical handoff.

Every send is deliberate; no automatic participant contact, purchases, inventory transfer, public GLEAN sync, location lookup or task-completion claim.

## What is public / private

Public opt-in discovery: a generic category, sanitized 12–100 character summary, self-reported 1–20 units, scope review/test/copy, expiry, and original signed OFFER packet. No names, addresses, phone numbers, emails, URLs, passwords, exact locations or food categories are accepted. This is unverified self-report, open to everyone.

Private tables: hashed 256-bit owner and guest bearer tokens, one signed interest, one signed decision, one signed ACK, packet metadata. RLS is enabled with no anon/authenticated database grants. The standalone HTML contains no server secret. JSON packet serialization order is preserved as TEXT, so PostgreSQL JSONB reordering cannot invalidate P-256 ECDSA signatures.

The server validates P-256 signatures and linked hashes, not the identity, legal authority, safety, ownership, actual inventory, consent of other people, physical delivery, or independent adoption. Private bearer secrets and session signing keys exist only in memory while the tab is open. Tokens are carried in POST bodies, not URLs. Public relay uses account-free stateless CORS and requires explicit permission and signatures for all writes.

There is no push delivery: opt-in polling is 45 seconds and stops when the tab closes. This first version holds at most one signed interest per offer. Expired offers no longer appear in discovery. Scheduled deletion of historical expired rows is not yet implemented.

## Testing

The inherited 017–023 software suites run unchanged. test_relay_024.mjs checks the standalone frontend and consent gates, live health and CORS, signed-packet invalid input handling, discovery isolation and a complete live two-cartridge OFFER→INTEREST→ADMIT→ACK exchange using SANDBOX-only synthetic data invisible to the public catalogue. No fake field outcome is reported.

Source is in draft PR #173 stacked on #172. No main merge, production site replacement, or change to NOW ROUTE.
