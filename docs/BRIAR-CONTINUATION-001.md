# BRIAR CONTINUATION 001 — Human Door / Headless

**Status:** executable mock-API integration on a review-only branch (2026-10-13).
**Scope:** a companion at the *edge* of Briar; no changes to upstream cryptography or Android apps.

## Source-backed opening

Briar is active in security-maintenance mode as of July 2026; it has not been abandoned. Its upstream `briar-headless` module has a documented local HTTP API:
- `GET /v1/contacts` includes `contactId` and `verified`;
- `POST /v1/messages/{contactId}` accepts `{ "text": "..." }`;
- authentication uses a local bearer token held in Briar's data directory.

- Official Headless API: https://github.com/briar/briar/blob/master/briar-headless/README.md
- Upstream source: https://code.briarproject.org/briar/briar
- Maintenance announcement: https://www.briarproject.org/news/2026-maintenance-mode/
- Mailbox: https://www.briarproject.org/mailbox/

This experiment uses only the documented API. It does not claim an Android Briar API or special access to chat content.

## What the new code does

`prepareBriarInvitation(crossingId, note)` creates a short readable, inspectable text invitation containing only the already-created `relatte-crossing-v0:<SHA256>` identifier and a bounded user-chosen note. **It does not include** an envelope, payload bytes, signing keys, or automatic claims about the content.

`briarSendConfirmation(contactId, invitation)` derives a recipient-and-text-bound confirmation string. A human-facing caller can display both the exact intended text and the confirmation string. This string is a consent guard for UI integration, **not evidence of a real human or cryptographic authorization**.

`submitBriarInvitation(...)` requires that confirmation, the explicit numeric recipient, the user's existing local bearer token, and a verified existing Briar contact. It requests `GET /v1/contacts` first and then sends exactly one `POST /v1/messages/{contactId}` to a strictly local `127.0.0.1` HTTP endpoint. No automatic retries, unsolicited contacts, or bulk broadcasts.

A successful API response means only **submitted to the local Briar peer**. It does not prove remote reception, that the recipient's Briar app is available, or a signed reLATTE receiver receipt. In Briar's messaging UI delivery indicators are separate.

## Boundaries and first threats

- **Only loopback:** the adapter refuses external URLs, credentials embedded in URLs, alternate hostnames, and HTTPS downgrade redirects. A desktop, remote server or mobile UI must not expose Briar's bearer token or headless port through a public web interface.
- **Privacy:** even a crossing ID and note can correlate people. Use only with an explicit chosen recipient. This experiment does not claim anonymity, does not encrypt the text itself, and trusts Briar for its documented messaging encryption.
- **Contact verification:** unverified contacts cannot receive automatic companion sends through this adapter; review identity with the person via a separate trusted channel.
- **Consent:** no scheduler triggers this API. A UI needs to show text, recipient, and allow an intentional user action.
- **No proof laundering:** submitting a message is not reLATTE RECEIVE, HOLD, ADMIT, or a transport ACK.
- **No destructive action:** only read contacts and send a selected private message. No contact adds/deletes or bulk history reads.

## Test

`node --test --experimental-strip-types test/briar-door.test.ts`

The tests run against a local mock of the documented Briar Headless interface, not a real Briar account or live Tor circuit. They check preview validation, no premature send, local-host restriction, rejection of an unverified contact, exact posted body, and refusal to fabricate delivery evidence.

## Continuation directions

**HUMAN 002:** first-party, reviewable UI for invitations, accessible on trusted local desktop; never put the bearer token in an untrusted browser.

**OFFLINE 003:** consented experiment with official Briar + Mailbox, one phone online, one offline, and a human witness log. Do not infer the protocol from the chat UI.

**MEDIA 004:** investigate upstream's unfinished attachment and backup work with threat modeling and an isolated test profile before changing storage or crypto. Avoid exposing message history or contact metadata to other services.

**FORK 005:** establish a properly attributed GPL-compatible derivative of the upstream Briar source (and separately AGPL-compatible Mailbox derivative if necessary). Test reproducible builds, Android background behavior, and security update intake. This branch is a companion implementation, **not** an upstream source fork.

The project is free software; Briar's main repository includes a GPL-3.0-or-later LICENSE, and Briar Mailbox includes AGPL-3.0-or-later. If we copy or modify their covered code, honor the corresponding notices, source-distribution requirements and trademark distinction. No upstream code is copied in this adapter.

## Laws

```
PERSON != NODE
CONTACT != BROADCAST DESTINATION
PREVIEW != CONSENT
MESSAGE SUBMISSION != REMOTE DELIVERY
BRIAR CONTACT != RELATTE RECEIVER
HUMAN INVITATION != CROSSING ADMISSION
ENCRYPTED PATH != UNIVERSAL ANONYMITY
```
