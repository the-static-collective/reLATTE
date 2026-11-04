# FIRST CIRCLE 001 — the self-forking pocket world

**Status:** experimental, unsigned local-first interaction specimen. **Not** the canonical reLATTE R1/R2/R3 implementation, not a signed crossing, and not evidence of a real-world aid outcome.

## The wager

Can a **single HTML file** be a tiny, self-reproducing community instrument without requiring a server, login, global ledger, token, or deployment?

The file contains its own CSS, JavaScript, journal, proof bench, and HTML-child generator. No package installation, API key, CDN, Vercel, Supabase, or connectivity is required for the experiment.

```text
one conversational claim
   → local PROPOSE / RECEIVE
   → HOLD (no semantic effect)
   → owner-local ADMIT or REFUSE
   → optional RELEASE
   → selected pocket packet
   → another world: RECEIVE → HOLD
   → independently ADMIT / REFUSE

parent HTML
   → selected RELEASED claims only
   → generated child HTML + fresh world ID
   → each inherited claim held for fresh local review
```

**The striking part:** the UI can generate a working **child copy of itself**. It passes claimed history, not the parent's admission or authority.

## Try it in under two minutes

1. Double-click [First_Circle_001.html](First_Circle_001.html) in a browser; no command line or deployment. In **The Circle**, click **TRY A SYNTHETIC EXAMPLE**.
2. **ADMIT HERE** one card, then explicitly **RELEASE TO SHARE** it. The release requires confirmation because text becomes exportable.
3. In **PROOF LAB**, run **THE PARADOX**. One identical synthetic offer reaches World B and World C; B admits, C refuses. They keep different replayable projections without a master ledger.
4. Run **VERIFY MY JOURNAL** and **ATTACK A COPY**. The former replays events; the latter alters a cloned record and watches verification reject it.
5. In **HAVE A CHILD**, click **DOWNLOAD A CHILD WORLD**. Open the downloaded HTML. Its selected released card starts **HOLD**, not admitted. You can refuse it without changing the parent.
6. Optional: copy/download a released card's JSON packet. Open another independently initialized copy of the instrument, paste it in **THE MAILBOX**, and observe the idempotent RECEIVE/HOLD boundary.

**No worksheets:** four card-type buttons, one conversational entry box, and a practical Consequence Desk. Every local decision is explicit.

## Consequence 001 — work produces a return, not another invitation

The same standalone HTML now includes a **Consequence Desk** with separate return packets. One manually shared NEED or OFFER may move through:

```
WORLD A: PROPOSE → ADMIT → RELEASE → share card
WORLD B: RECEIVE → HOLD → ADMIT
WORLD B: PLEDGE STEP → share work-return
WORLD A: RECEIVE → ACCEPT / DECLINE / DISCUSS → share decision
WORLD B: RECEIVE decision
WORLD B: REPORT WHAT I DID → share work-return
WORLD A: RECEIVE → CONFIRM LOCALLY / DO NOT CONFIRM / DISCUSS
WORLD B: RECEIVE decision
```

Pledging is optional. A respondent can report a completed action directly, and the origin can independently confirm or dispute the claim. A decision never mutates the other world's history by itself. The work ledger is a separate append-only unsigned SHA-256 chain in the same HTML; a PRIVATE WORK AUDIT is available for the operator. Work packets, decisions, and receipts are byte-checkable but unauthenticated, and cannot establish an actual delivered benefit.

The November 4 two-world Chromium test exercised this flow through independent browser page contexts without JavaScript errors. Node tests check sequence enforcement, duplicate rejection, invalid stage/outcome combinations, tampered work/decision contents, and independent return decisions.

**Next gate:** a real two-device, consented low-risk assistance loop followed by independent human confirmation of whether anything was delivered. A self-reported action or a local origin acknowledgement must never be counted as a verified Full Measure deed.

## Executable checks

```sh
node experiments/first-circle-001/verify.mjs
```

The standalone Node test uses only built-in modules. It checks UTF-8 SHA-256 against Node crypto, deterministic replay, changed-byte rejection, duplicate/conflicting disposition rejection, packet validation, child admission non-inheritance, independent opposite decisions, and the two-world pledge/report/decision-return loop.

A headless Chromium interaction smoke test was run separately by loading the HTML via `page.set_content` (the test environment blocks local file and loopback navigation). It exercised card creation, local admission, release, the three Proof Lab buttons, child HTML generation, and child refusal without JavaScript exceptions. **Real `file://` behavior on macOS Mojave/Safari and multi-device human trials remain untested.** Where browser storage is disallowed, the UI explicitly says **MEMORY ONLY**.

## Authority and safety boundaries

- The SHA-256 chain **is not a signature**. An attacker with write access can replace and re-hash the whole unsigned journal. Only comparison with a *separately trusted older head* helps catch that replacement. No human identity is authenticated.
- RECEIVED ≠ ADMITTED; ADMITTED ≠ TRUE; RELEASED ≠ AUTHORIZED ELSEWHERE.
- A synthetic card is marked **SYNTHETIC** and must not be mistaken for a real event.
- A public pocket packet carries **one explicitly released claim**. By design, child HTML contains **only explicitly released claims**; unreleased, held, and refused cards do not cross.
- The **PRIVATE AUDIT JSON** export includes all local events (potentially sensitive). Do not publish it or type personal identifying data into experiments.
- File-origin localStorage behavior varies by browser. The page falls back to an explicit in-memory session if persistence is unavailable.
- A packet's claimed origin is **not authenticated**. A passing hash establishes internal byte consistency of the presented claim, not authorship, consent, context, human benefit, or truth.
- Manual share/copy of text packets is available, but no real human exchange or operational deployment has been verified. No matchmaking, monetary value, capabilities, cryptographic key custody, signature, or provider integration is established.

## Relation to canonical reLATTE

This is an **interface/specimen** built alongside, not replacing, [Local Receiver 001](../../docs/LOCAL-RECEIVER-001.md), [Composition Pulse 001](../../docs/COMPOSITION-PULSE-001.md), and the signed identity/profile work on main. In the canonical receiver, receipt/disposition signatures and durable independently verified journals are essential; First Circle does **not** claim those guarantees.

A future bridge could make each pocket packet a signed reLATTE CrossingEnvelope under the existing source-owned identity contract. Such a bridge must be verified independently before it may claim interoperability.

## Falsifiable field proof still owed

The next meaningful test is **two people on two ordinary phones**, in airplane mode, carrying one manually transferred card, with one owner admitting and the other refusing. Record device/browser/version, persistence after restart, source claim bytes, both resulting journal heads, and explicit nonclaims. Do not treat a browser screenshot or the synthetic paradox as that field test.

**FIRST CIRCLE IS A DEMONSTRATION OF LOCAL CHOICE AND REPRODUCIBLE SOFTWARE, NOT A CERTIFICATE OF REAL-WORLD RELIEF.**
