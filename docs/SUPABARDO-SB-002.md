# SUPABARDO SB-002 — The Proposal That Was Not Kept

**Status:** executable second-family specimen

SB-002 tests whether the SupaBardo boundary survives a materially different crossing family.

SB-001 carried a STATIC-OS world receipt and ended in destination-local **ADMIT**.

SB-002 carries a Haunted Toaster creative proposal and ends in destination-local **HOLD**.

## Source

Exact Toaster proposal:

- repository: `the-static-collective/the-haunted-toaster`
- PR: `#357`
- commit: `2c86d684138f3008344b18202b81193db0c947c7`
- path: `experiments/supabardo-sb002-001/proposal.json`
- Git blob: `c70db798cbbe19e78d8cbe965d6cbfbac4393de1`
- SHA-256: `b9feba52bf6ca98f26d395d0e637d316600a856d379955c4fa47c36da4dfb545`

The proposal is deliberately not a rendered candidate and contains no KEEP.

The existing Toaster source law is independently older than this experiment: commit `4ecfe391171758cbe1d247787d95b7680e31146b` requires explicit `KEEP` before render handoff.

## Ceremony

```text
HAUNTED TOASTER
  creative proposal P
       |
       | signed X
       | signed RELEASE
       v
--------------- SUPABARDO ---------------
ENTER
FORM
WITNESS
WAIT

state = OPEN
KEEP/HOLD/REFUSE = unresolved
render authority = none
------------------------------------------
       |
       v
CREATIVE DESK
  no human KEEP observed
  no human REFUSE observed
       |
       v
HOLD
  local effect = proposal-held
  render authority = false
       |
       v
SUPABARDO EXIT
       |
       v
durable evidence escapes
       |
       v
temporary membrane DECAYS
```

The experiment is authorized. The artwork is not KEEP-authorized.

```text
RUN THE EXPERIMENT != KEEP THE ART
PROPOSAL != KEEP
HOLD != KEEP
HOLD != REFUSE
EXIT != KEEP
```

## Pinned evidence

Crossing:

`relatte-crossing-v0:0a33b019864dcc754e97ade9fb7d45229b9ef74b0ba11c4f8cfaca92ee8f384a`

Destination HOLD:

`relatte-receipt-v0:397de3219d9f3918b717093ef8dcd81413823eeec068c7329c1b5aece0097394`

Evidence set:

`sb002-evidence-v0:a44ce387493dec11fbd0902a8ca03f090b3d08ee79db89e53084f84195bbd581`

Three separate P-256 identities sign source, Bardo, and destination statements.

## What SB-002 proves if live ceremony + kill test pass

It demonstrates that the same unresolved-crossing law can carry both:

1. a software-world/state specimen whose receiver ADMITs it; and
2. a creative proposal whose receiver HOLDs it without manufacturing KEEP or render authority.

That is the historical second-family extraction gate.

It still does **not** imply that every crossing needs Supabase or that SupaBardo should become a permanent central service.


## Live membrane witness

The existing private WITNESS Supabase project was restored only for the bounded ceremony. SB-002 created a private `sb002_runtime` schema and one `crossings` row.

Before use:

```text
to_regnamespace('sb002_runtime') = null
to_regclass('sb002_runtime.crossings') = null
```

The schema revoked access from `PUBLIC`, `anon`, `authenticated`, and `service_role`; the table had RLS enabled as defense in depth. Direct privilege checks confirmed:

```text
anon schema usage           = false
authenticated schema usage  = false
anon table SELECT           = false
authenticated table SELECT  = false
```

The live row first existed at **2026-10-07 00:23:34.35975+00** as:

```text
state = OPEN
occurrence_classes = ENTER, FORM, WITNESS, WAIT
destination_disposition_receipt_id = null
destination_disposition = null
proposal_sha256 = b9feba52bf6ca98f26d395d0e637d316600a856d379955c4fa47c36da4dfb545
evidence_set_id = sb002-evidence-v0:a44ce387493dec11fbd0902a8ca03f090b3d08ee79db89e53084f84195bbd581
```

At **2026-10-07 00:23:56.954156+00**, only after the independent signed destination receipt existed, the row became:

```text
state = RESOLVED
occurrence_classes = ENTER, FORM, WITNESS, WAIT, EXIT
destination_disposition = HOLD
destination_disposition_receipt_id =
  relatte-receipt-v0:397de3219d9f3918b717093ef8dcd81413823eeec068c7329c1b5aece0097394
```

The entire `sb002_runtime` schema was then dropped with `CASCADE`.

Post-destruction verification returned:

```text
to_regnamespace('sb002_runtime') = null
to_regclass('sb002_runtime.crossings') = null
```

Supabase security advisors reported **zero security lints** after destruction.

The live database is not required to reconstruct SB-002.

```text
MEMBRANE DEATH != EVIDENCE DEATH
EXPERIMENT AUTHORIZATION != CREATIVE KEEP
HOLD SURVIVES AS AN ATTRIBUTABLE LOCAL DISPOSITION
```
