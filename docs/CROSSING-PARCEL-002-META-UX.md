# Crossing Parcel 002 — Meta UX Trial

**Provider:** Meta (via Meta AI)  
**Trial Type:** bounded transformation, not protocol evaluation  
**Source:** issue #36 body only — treated as entirety of repository-visible payload. README.md, docs/CROSSING-PARCEL-001.md (PR #35), docs/COM5-CAPSULE-001.md, docs/MOMENT-PERSPECTIVE-001.md, docs/REPLACEABLE-TRANSPORT-001.md were listed to inspect but were not included in this relay. No private ChatGPT conversation was assumed or requested.

Laws carried from 001 remain in force:

```text
PROFILE != CORE PRIMITIVE
PROPOSAL != ADMISSION
GIT SURFACE != AUTHORITY
HUMAN DECISION != AGENT INFERENCE
RECONSTRUCTIBLE RECEIPT != PRIVATE MEMORY
TRANSPORT FAILURE != CONTINUITY FAILURE
```

No core reLATTE schemas were redesigned. No centralized account/memory product was created. No provider is treated as authoritative.

## 1. Plain-language scenario

In under one minute:

You are working across two different assistants (e.g., ChatGPT at your desk, Meta on your phone). You want to hand off a piece of work without handing over your whole history, and without letting the second assistant pretend it already knows you.

You write a small handoff note. You get to edit it. The note only carries what you explicitly approve. The next assistant can suggest what to do with it, but cannot decide for you that it is now "remembered."

This is the Crossing Parcel demo: a Carry Card that is not memory.

Concrete scenario used for this trial: You are choosing a portable field recorder. You have told the first assistant you like hands-on knobs, hate menu-diving, want warm sound, budget under $400. You want the second assistant to help narrow options, but you do not want it to inherit all the model chatter from the first session.

## 2. What the user sees

User sees a single card, no reLATTE words:

```text
Carry Card — ready to hand off

I'm carrying forward:
- Budget: under $400
- Preference: hands-on controls, minimal menu diving
- Open question: warm sound vs. clean preamps

I'm NOT carrying:
- Full chat history
- Previous model suggestions

Next assistant may propose, you decide.

[View raw parcel] [ACCEPT / HOLD / REJECT / AMEND] [Edit]
```

No mention of substrate, capsule, perspective. Just: what you are carrying, what you are not, and that you stay in charge.

## 3. What the model sees

Same card plus model-visible metadata:

```text
offered_context: what first assistant saw (human text + session notes)
admitted_context: what human explicitly approved to carry
proposal: what this model thinks should happen next
provenance: human -> ChatGPT -> Git parcel #36 -> Meta -> Git return (human relay)
uncertainty_flags: what was not available (e.g., README and other docs not in relay)
```

Model is instructed: proposal is not admission. Delivery is not admission.

## 4. What crosses between providers

Crosses only if human ACCEPTs or AMENDs:

- Admitted context list (short, human-edited bullets)
- Open questions explicitly marked as open
- Parcel ID and chain of custody (which providers handled it, when)
- Human decision status (still pending until explicit ACCEPT)

Does not cross as authoritative fact:

- Any single provider's internal memory
- Any model's summary presented as truth

Transport is Git-visible file or, on failure, bounded human relay of that same file. Transport mechanism does not change content.

## 5. What does not cross

- Private conversation history from originating ChatGPT session
- Model inferences, embeddings, or hidden state
- Full README / CAPSULE / PERSPECTIVE docs if not in parcel (in this trial they were not in relay, so they do not cross by assumption)
- Authority claim: Git surface shows the parcel exists; it does not make it true or approved
- Human intent beyond what is written: no inference that carrying = wanting to remember forever

Preserved distinctions:

- context offered != context admitted: First assistant saw more than what human admitted to carry.
- model proposal != human decision: Second assistant suggests, human records decision separately.
- delivery != admission: Parcel arriving at Meta does not mean it is admitted into any memory product.
- transport != authority: GitHub or human relay carrying it does not make GitHub or the relay authoritative.

## 6. ACCEPT / HOLD / REJECT / AMEND interaction

This interaction is the only place continuity is decided.

User is presented with parcel and four explicit actions:

- **ACCEPT:** "Yes, carry this forward exactly as written. This does NOT mean remember forever; it means use for this next step."
- **HOLD:** "Not now. Keep parcel visible but do not use yet."
- **REJECT:** "Do not carry this. Archive parcel with receipt showing rejection."
- **AMEND:** "Carry this edited version:" [free text edit field]

System rules:

- No action is inferred from viewing, scrolling, or saying "okay."
- Only the literal string ACCEPT / HOLD / REJECT / AMEND recorded by human counts as decision.
- Model must re-present amended version for second confirmation if AMEND changes admitted context.
- Until ACCEPT or AMEND+ACCEPT, second assistant must treat parcel as proposal.

UI copy avoids reLATTE terms: "You decide what crosses."

## 7. One example parcel

This is a minimal example, not a schema redesign:

```json
{
  "parcel_id": "crossing-parcel-002-meta-ux-001",
  "human_intent": "Continue recorder search with different assistant without giving full history",
  "offered_context": [
    "User said: I hate menu diving, like tape warmth, budget under $400",
    "ChatGPT session suggested: Zoom H5, Sony PCM-M10, Tascam DR-40X",
    "ChatGPT inferred: user may be musician"
  ],
  "admitted_context": [
    "Budget: under $400",
    "Interface preference: hands-on knobs, minimal menu diving",
    "Sound preference: prefers warm, question open on warm vs clean"
  ],
  "not_admitted": [
    "Full chat transcript",
    "Model suggestions Zoom H5 / Sony PCM-M10 / Tascam DR-40X",
    "Inference that user is musician"
  ],
  "model_proposal": "Use admitted context to list 2-3 current options under $400 with hands-on controls, note which are warmer vs cleaner, leave final choice to human",
  "provenance": [
    "human -> ChatGPT",
    "ChatGPT -> Git: the-static-collective/reLATTE issue #36",
    "Git -> Meta (human relay of issue body only)",
    "Meta -> Git: docs/CROSSING-PARCEL-002-META-UX.md via human relay"
  ],
  "transport": "human relay due to blocked Git write — TRANSPORT FAILURE != CONTINUITY FAILURE",
  "authority": "none — parcel is proposal until human records ACCEPT/HOLD/REJECT/AMEND",
  "open_questions": ["Is warm sound worth noisier preamps at this budget?"]
}
```

What user sees from this: only admitted_context + open_questions + action buttons. What model sees: full JSON.

## 8. Failure cases

- **Transport failure (this trial):** Direct Git write blocked. Mitigation: Return complete bounded artifact for human relay. Parcel remains reconstructible. Continuity preserved because receipt is intact.
- **Missing linked docs:** README.md and docs/CROSSING-PARCEL-001.md etc not present in relay. Mitigation: Do not hallucinate them. Note absence in RETURN RECEIPT and RESIDUAL_FOG.
- **Model collapses offered into admitted:** Second assistant treats all offered_context as if human approved it. Mitigation: UI only shows admitted_context by default; model instruction says delivery != admission; human must explicitly ACCEPT.
- **Model treats Git surface as authority:** "It's on GitHub, so it must be approved." Mitigation: Document states GIT SURFACE != AUTHORITY; parcel marked as proposal until human decision.
- **Human decision inferred:** Model assumes "looks good" means ACCEPT. Mitigation: Only explicit ACCEPT / HOLD / REJECT / AMEND string counts; otherwise status remains pending.
- **Profile turned into memory account:** Temptation to create "remember this forever." Mitigation: Refused — parcel is explicitly not a memory product; it is a one-time carry with expiration.

## 9. What this trial proves / does not prove

### Proves (if human ACCEPTs this return)

- A second provider (Meta) can use Crossing Parcel to do useful bounded work (design a user-facing handoff) without needing private ChatGPT history.
- Provenance, uncertainty, and human authority can be preserved in plain language, without teaching reLATTE terminology.
- Transport failure does not equal continuity failure: human relay still yields a reconstructible artifact.

### Does NOT prove

- That README.md or other capsules match this design — they were not available in this relay.
- That the design is final or authoritative — it remains a proposal until human decision.
- That cross-provider memory is solved — this demo explicitly refuses to become a memory product; it is a single carry.
- That any provider is authoritative — Git, ChatGPT, Meta are all treated as non-authoritative transports.
- That reLATTE core schemas should change — no schema change is proposed here.

A later model inspecting only this file should be able to reconstruct: what scenario Meta received, what UX Meta proposed, what distinctions were preserved, what was refused, and what remains foggy.

## 10. RETURN RECEIPT

```text
RECEIVED:
  Issue #36 body via human relay, including purpose, laws, Meta task description,
  list of files to inspect, deliverable spec (docs/CROSSING-PARCEL-002-META-UX.md),
  constraints, success condition, and requirement to use human relay if Git write blocked.
  Explicit instruction to treat relayed body as entirety of repository-visible payload.

INTERPRETED:
  Task is Trial 002 — generality test. Use Crossing Parcel profile to perform bounded
  transformation: design small, under-one-minute user-facing interaction demonstrating
  Crossing Parcel without reLATTE jargon, preserving offered/admitted, proposal/decision,
  delivery/admission, transport/authority distinctions. Prefer Git artifact, fallback to
  complete bounded artifact here.

PROPOSED:
  "Carry Card — ready to hand off" UX: user sees only admitted bullets + open questions +
  ACCEPT/HOLD/REJECT/AMEND; model sees offered vs admitted + provenance + uncertainty;
  what crosses is only human-approved admitted context; what does not cross is history,
  inferences, and authority claims; example parcel for field recorder search; failure cases
  listed; what trial proves / does not prove scoped.

CHANGED:
  From Trial 001 (evaluate protocol) to Trial 002 (use profile for useful work).
  From abstract explanation to concrete 1-minute carry interaction.
  Added explicit UI copy avoiding reLATTE terminology while still preserving laws.

REFUSED:
  To redesign reLATTE core schemas or invent new core primitives
  To turn human-facing profile into centralized account/memory product
  To assume Meta, ChatGPT, GitHub, or any single provider is authoritative
  To infer or request private ChatGPT conversation beyond issue body
  To collapse PROFILE into CORE PRIMITIVE, PROPOSAL into ADMISSION,
  GIT SURFACE into AUTHORITY, HUMAN DECISION into AGENT INFERENCE
  To treat transport failure as continuity failure

RESIDUAL_FOG:
  README.md, docs/CROSSING-PARCEL-001.md, docs/COM5-CAPSULE-001.md,
  docs/MOMENT-PERSPECTIVE-001.md, docs/REPLACEABLE-TRANSPORT-001.md contents not
  present in this relay, so their exact definitions could not be inspected; noted as not assumed
  Exact Git path for parcel storage and ID format in repo not verifiable from issue body alone
  Whether human wants this specific recorder example or different domain — left as example, amendable
  Human decision on this artifact still pending

RETURNED_TO_HUMAN:
  This file — docs/CROSSING-PARCEL-002-META-UX.md — complete bounded artifact,
  ready to commit verbatim. No private Meta conversation included.
  Status: PROPOSAL, awaiting human record of ACCEPT / HOLD / REJECT / AMEND.
```
