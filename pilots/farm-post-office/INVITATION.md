# Farm Post Office — invitation and owner-safe pilot kit

**Project:** reLATTE COMMUTER-001  
**Page:** `pilots/farm-post-office/index.html` (interactive *browser-only simulation*)  
**First potential user:** a local farm that wants its co-op e-commerce system and email service to communicate automatically.  
**Status:** invitation-ready demo; **no live farm, customer, storefront, email provider, or partner authorization is connected.**

## Personal invitation (send by a person, not an automated campaign)

> Hey! I enjoyed meeting you. You mentioned wanting your co-op store and email system to talk automatically, so I built a little demonstration of what that could look like. It uses imaginary customers, doesn't touch your systems, and takes about a minute to try.
>
> **Try the Farm Post Office:** [insert verified public demo URL]
>
> If it seems useful, I'd love to sit down with you for 10–15 minutes to find out which tools you're using and what you want to happen automatically. No cost or commitment to explore it. No passwords or customer data needed to start.

The invite should remain **personal** and be sent through the contact channel the two people actually exchanged. Never imply Cedar Crate Farm has endorsed, partnered in, or commissioned this project.

## The first meeting: ask only what matters

1. Which exact commerce/CSA provider and email/newsletter/CRM platform are in use?
2. What is one **specific event → desired action**? Examples: membership becomes active → update the correct contact tag; newsletter unsubscribed → suppress marketing everywhere.
3. What has the current manual workaround been? Rough event volume and acceptable delay?
4. Where is authoritative opt-in/opt-out evidence recorded, and who owns the communication policy?
5. Can the owner authorize a limited synthetic-only trial first? Which owner or administrator can approve read/write access later?

**Do not request credentials, access tokens, database exports, or customer contact information in the invitation or pilot note.**

## Product fit and integration gate

- Validate a permitted source mechanism (webhook, scoped API, CSV export, or periodic report). Some third-party platforms may not support autonomous reads; do not imply they do.
- Determine a permitted destination action and obtain independent approval for each scope. "Contact sync" is not marketing consent.
- Ask whether deletion, unsubscribe, erasure, and record-retention rules need to travel in both directions.
- Choose the smallest reversible experiment: **one sanitized event, one owner-approved destination effect, one inspectable status**.
- Owner-controlled enable/disable; no unattended message send until authorized and tested.
- Decide who operates the service and how ongoing costs, access, incident handling, and ownership would work.

## Acceptance checklist

- [ ] The farmer can name the storefront and email platform.
- [ ] A synthetic source event produces a signed, attributable crossing.
- [ ] An independent receiver signs RECEIVE and ADMIT/HOLD/REFUSE receipts.
- [ ] No marketing event is applied without verified valid opt-in and scope.
- [ ] Revoked permission blocks a previously admitted event when rechecked.
- [ ] Two deliveries of the same event cause **one** destination action.
- [ ] A simulated destination outage does not lose an event or incorrectly advance a cursor.
- [ ] A protected owner-operated test record reaches the real destination with the appropriate authorization and provider receipt.
- [ ] The operator sees meaningful results and can suspend synchronization.
- [ ] Both parties approve a written scope before production customer data or live messaging.

## Deployment and copy checkpoints

- Hosting the static demo is not equivalent to deploying COMMUTER-001's backend worker.
- Confirm the public URL is reachable without a Vercel team login.
- Confirm sample event buttons, retry, reset, copy note, and email draft work on mobile.
- The page intentionally stores no input server-side and asks the recipient to reply through the invitation channel. A back-end intake endpoint requires a separate consent, privacy, and anti-abuse review.
- Check that no public example includes real customer addresses, secrets, sales numbers, or private communications.

## Technical source

- [COMMUTER-001](../../docs/COMMUTER-001.md)
- [reLATTE correspondence organ](../../src/commuter.ts)
- [Single-writer cursor](../../src/commuter-store.ts)

No e-commerce or mailing-platform compatibility is promised until the platform and API access have been verified.
