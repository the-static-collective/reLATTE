# SUPABARDO SB-001 — The Crossing That Survived Its World Between

**Date:** 2026-10-06  
**Status:** executable bounded specimen  
**Canonical architecture seed:** Human-Witness `docs/superpowers/specs/2026-08-25-supabardo-crossing-field-design.md`

## Law

> **SupaBardo owns unresolved existence between release and local constitution.**

A crossing may be shared. Its meaning is not.

This specimen does not promote SupaBardo into a repository, service, event bus, or reLATTE-owned primitive. reLATTE supplies crossing and receipt syntax. SupaBardo remains the temporary field in which a released crossing is present but destination meaning is still unresolved.

## Particular P

SB-001 uses one exact STATIC-OS software-world receipt:

- repository: `the-static-collective/static-os`
- ref: `experiment/witness-to-world-crossing-001`
- commit: `c1f3024e267ecf033e03f7707bcb07e784e1f095`
- path: `examples/world-receipt.independent-contradiction.json`
- Git blob: `2b317402c4769319220cd6bc3e5d20c3978dbfbf`
- exact fixture SHA-256: `56376cad6f1c5f9b3bc671876dddeaf8ad63c90b2f162a11383b68561f51a82f`

Claim limit: this is a real executable STATIC-OS software artifact already produced by the WORLD crossing machinery. It is **not** a physical-boot witness and does not impersonate `FIRST-PHYSICAL-BOOT-001`.

## Crossing X

`fixtures/sb001-signed-crossing.json`

Crossing ID:

`relatte-crossing-v0:337e3ecbe4810e88a517d40ba414cdebb7ee1e35a2aa3d028037af0a29b2db26`

The crossing is signed by the source identity and binds the exact payload hash.

## Ceremony

```text
STATIC-OS A
  P
  |
  | signed X
  | signed RELEASE
  v
---------------- SUPABARDO ----------------
ENTER
FORM
WITNESS
WAIT

state = OPEN
destination disposition = null
semantic effect = none
------------------------------------------------
  |
  v
WORLD B
  independent local key
  R3_ADMIT
  local semantic effect
  |
  v
SUPABARDO EXIT
  acknowledges destination occurrence
  does not inherit destination meaning
  |
  v
durable signed receipts escape
  |
  v
temporary field is destroyed
```

## Durable receipts

| Role | Fixture | Receipt |
| --- | --- | --- |
| source release | `sb001-release-receipt.json` | `relatte-receipt-v0:cc2f84e36cf7b46ac0d8bb4d942e24f34b2a94de7879aa7ac05a5c1b2cd800c7` |
| unresolved interval | `sb001-unresolved-receipt.json` | `relatte-receipt-v0:43e847ecfa5b3f1f70d6867dccfc2739ae84eafb620b8b545bf9247c10532693` |
| B-local admission | `sb001-admit-receipt.json` | `relatte-receipt-v0:9ac46374aeec3516b06ec0560756066ce0349eac42c5e51bfb17203fbdf2fb20` |
| field exit | `sb001-exit-receipt.json` | `relatte-receipt-v0:c29bb41ebe554cfda48a33a50eb65125c33640b58817ac3a5f3c28d753564066` |

Source, SupaBardo, and destination B use three distinct P-256 public identities.

## Live Supabase membrane witness

The existing `WITNESS` Supabase project was restored only for this bounded ceremony.

No existing public WITNESS tables were modified. SB-001 used a new private schema named `sb001_runtime`, revoked from `public`, `anon`, and `authenticated`.

The live row first existed as:

```text
state = OPEN
occurrence_classes = ENTER, FORM, WITNESS, WAIT
destination_disposition_receipt_id = null
```

Only after the independently signed B-local `R3_ADMIT` receipt existed was the field changed to:

```text
state = RESOLVED
occurrence_classes = ENTER, FORM, WITNESS, WAIT, EXIT
destination_disposition_receipt_id =
  relatte-receipt-v0:9ac46374aeec3516b06ec0560756066ce0349eac42c5e51bfb17203fbdf2fb20
```

The schema was then dropped with `CASCADE`.

Post-destruction verification returned:

```text
to_regnamespace('sb001_runtime') = null
to_regclass('sb001_runtime.crossings') = null
```

The Supabase security advisor reported zero security lints after destruction.

The live database is therefore not required to reconstruct the ceremony.

## Executable kill test

`test/supabardo-sb001.test.ts` proves:

1. P hashes to the exact address carried by X.
2. X verifies under the current reLATTE crossing verifier.
3. all four receipts verify under the current reLATTE receipt verifier.
4. RELEASE retains a payload residual, proving `RELEASE != ERASURE`.
5. the Bardo witness has `semantic_effect = none` and a null destination disposition while OPEN.
6. B's ADMIT is signed by a different identity and creates the only destination-local semantic effect.
7. EXIT references B's disposition without adopting its authority.
8. the entire transient Bardo directory can be deleted.
9. reconstruction still succeeds from durable artifacts alone.
10. changing WAIT into ADMIT or rewriting destination authority invalidates the relevant signature.

## Hard invariants

```text
RELEASE != ERASURE
WITNESS != AUTHORITY
OPEN != ADMITTED
EXIT != ADMISSION
RECEIPT != ADMISSION
DESTINATION MEANING REMAINS LOCAL
DURABLE RECEIPT != IMMORTAL BARDO
```

## Result

SB-001 demonstrates one bounded instance of:

> released from A  
> genuinely unresolved  
> independently constituted by B  
> reconstructible after the field dies

It does **not** establish a universal SupaBardo protocol, justify a standalone repository, or prove that every crossing needs Supabase.

The promotion gate remains closed.

One crossing earns existence.

A second meaningfully different crossing is still required before extraction is reconsidered.
