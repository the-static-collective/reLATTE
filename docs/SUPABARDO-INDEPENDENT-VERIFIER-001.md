# SupaBardo Independent Verifier 001

**Status:** executable cross-implementation verifier  
**Branch:** `experiment/supabardo-independent-verifier-001`

## Question

Can a second implementation, without importing or executing reLATTE's TypeScript protocol/verifier code, read only the durable JSON evidence and independently reach the same bounded conclusions for SB-001, SB-002, and SB-003?

## Implementation

`scripts/supabardo-independent-verify.py` uses only the Python standard library.

It independently implements the bounded profile required by the current specimens:

- JSON canonicalization for the fixture profile;
- safe-integer and surrogate rejection;
- SHA-256 crossing and receipt identifiers;
- base64url decoding;
- NIST P-256 point arithmetic;
- raw `r || s` ECDSA verification;
- public-key validation and role fingerprints;
- evidence-set commitment reconstruction;
- specimen-local semantic checks.

It does **not** import:

- `src/protocol.ts`;
- `src/canonical.ts`;
- `scripts/sb001-verify.ts`;
- `scripts/sb002-verify.ts`;
- any compiled JavaScript from reLATTE;
- any third-party Python cryptography or JSON-canonicalization package.

## Results

The verifier independently derives:

```text
SB-001 -> ADMIT
SB-002 -> HOLD
SB-003 -> FRESH_LOCAL_ADMIT
```

Pinned evidence sets:

```text
SB-001
sb001-evidence-v0:cbb5e16c8209e1978d1cc1910c4b5128fa58bdab1bb9bbd7d4112ebd0f6c5174

SB-002
sb002-evidence-v0:a44ce387493dec11fbd0902a8ca03f090b3d08ee79db89e53084f84195bbd581

SB-003
sb003-evidence-v0:706d1f95a15e11435c3d770886243b78a225677bde7926f02ed07d49bd6afb27
```

## SB-003 archive note

PR #59 remains the executable mortality test that literally deletes the predecessor receiver root/persisted key and later deletes the Bardo runtime.

This verifier branch adds a frozen public SB-003 evidence archive with the same bounded laws:

```text
SUCCESSOR != PREDECESSOR
RECONSTITUTION != RESURRECTION
ANCESTRY != AUTHORITY
ARK != INHERITED ADMISSION
```

The frozen crossing/receipts are generated independently and then cross-checked by the TypeScript protocol verifier. They are not claimed to be byte-for-byte artifacts emitted by the ephemeral runtime occurrence in PR #59.

That distinction is intentional:

```text
SAME LAW FAMILY != SAME OCCURRENCE
INTEROPERABLE EVIDENCE != RETCONNED HISTORY
```

## CI cross-check

`test/supabardo-independent-verifier.test.ts` performs three checks:

1. Python independently verifies all three specimen archives and derives the expected outcomes.
2. reLATTE's TypeScript protocol verifier accepts the frozen SB-003 crossing and receipts, proving cross-implementation wire compatibility.
3. one byte of the frozen SB-003 EXIT signature is changed; the Python verifier must fail closed with an invalid-signature result.

Current repository verification:

```text
tests 168
pass  168
fail  0
```

## What this proves

There are now two executable implementations that agree on the committed crossing/receipt wire representation and bounded specimen outcomes:

```text
TypeScript implementation
        |
        | same durable evidence
        v
Python standard-library implementation
```

The Python verifier does not need the live Supabase membrane, the original runtime processes, or reLATTE's TypeScript verifier implementation.

## What this does not prove

This is **implementation independence**, not organizational or auditor independence.

Both implementations live in the same project and were constructed from the same public protocol semantics. A genuinely independent audit would require a separately authored implementation or external verifier.

The Python canonicalizer is also deliberately bounded to the current fixture profile. It rejects floats and non-ASCII object keys instead of claiming to be a general RFC 8785 implementation.

No claim is made of:

- formal verification;
- universal JSON/JCS interoperability;
- FIPS validation;
- government accreditation;
- third-party security review;
- proof against collusion of all authorized signer keys.

## Threshold crossed

The meaningful result is narrower and stronger than another specimen:

> A crossing history is no longer dependent on one implementation to remain intelligible.

That is the first executable evidence that SupaBardo's surviving history is portable across implementations rather than merely replayable inside one codebase.
