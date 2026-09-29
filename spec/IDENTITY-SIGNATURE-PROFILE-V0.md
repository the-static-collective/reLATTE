# reLATTE Identity + Signature Profile v0

**Status:** bounded executable witness  
**Date:** 2026-09-29  
**Scope:** `CrossingEnvelopeV0` and `ReceiptV0` identity + ECDSA P-256 verification only

This profile fixes the byte-level ambiguity that the v0 JSON Schemas intentionally left open.

It does not define receiver admission, transport, persistence, global ordering, human identity, or semantic truth.

```text
IDENTITY != SIGNATURE
SIGNATURE != HUMAN IDENTITY
SIGNED != TRUE
RECEIVED != ADMITTED
```

## 1. Canonicalization authority

reLATTE adopts the current Project0 canonicalization profile rather than promoting Formation Trace's local sorted-JSON helper into shared protocol law.

For structured semantic bodies this profile uses:

- RFC 8785 / JSON Canonicalization Scheme through `json-canonicalize`;
- UTF-8 bytes;
- Project0-compatible pre-canonicalization rejection rules;
- maximum traversal depth `100`, where the root is depth `0`;
- strict timestamps matching `YYYY-MM-DDTHH:MM:SSZ` or exactly three fractional millisecond digits followed by `Z`.

The executable validator rejects at least:

```text
undefined
NaN / +/-Infinity
unsafe integers
bigint / symbol / function
lone Unicode surrogates
cycles
sparse arrays
custom prototypes
symbol-keyed properties
accessor properties
non-enumerable data properties
```

This is conformance, not ownership transfer. Project0 remains authoritative for its own canonical-addressing law.

## 2. Public signing-key normalization

The portable P-256 public key identity is exactly:

```json
{
  "kty": "EC",
  "crv": "P-256",
  "x": "<base64url coordinate>",
  "y": "<base64url coordinate>"
}
```

Runtime/export metadata such as `ext` or `key_ops` is not identity-bearing here because different conforming runtimes may serialize it differently.

Both `x` and `y` MUST be the canonical unpadded base64url encoding of exactly 32 coordinate bytes. Alternate textual encodings of the same bytes are rejected rather than normalized, so key identity has one portable textual form.

A JWK containing private member `d` is rejected.

```text
PUBLIC KEY MATERIAL != PRIVATE KEY MATERIAL
KEY CONTINUITY != HUMAN IDENTITY
```

## 3. Crossing identity body

`CrossingIdentityBodyV0` is constructed explicitly from the envelope. It never deletes fields generically.

Included fields:

```text
schema
protocol_version
source_particular
source_world
source_history_head
parents
declared_kind
payload_refs
requested_effect
capability_ref
privacy_policy
audience_policy
return_address
created_at
signing.algorithm
signing.public_key { kty, crv, x, y }
signing.domain
extensions
```

Excluded self-referential fields:

```text
crossing_id
signing.signature
```

Absent optionals normalize as follows:

```text
source_history_head -> null
parents -> []
requested_effect -> null
capability_ref -> null
privacy_policy -> null
audience_policy -> null
return_address -> null
extensions -> {}
```

Therefore omission of one of those optionals and its explicit normalized value do not create different identities.

## 4. Crossing ID equation

Domain separator:

```text
reLATTE-CrossingEnvelope-v0|
```

Equation:

```text
crossing_digest = SHA-256(
  UTF8("reLATTE-CrossingEnvelope-v0|")
  || RFC8785(CrossingIdentityBodyV0)
)

crossing_id =
  "relatte-crossing-v0:" || lowercase_hex(crossing_digest)
```

This textual ID is a reLATTE protocol identifier. It is not presented as a Project0 `SemanticAddress`, because reLATTE is not silently registering a new Project0 semantic type.

## 5. Crossing signature equation

The crossing ID is derived first. The signature body then binds that derived ID without circularity:

```text
CrossingSignatureBodyV0 = {
  crossing_id: derived_crossing_id,
  ...CrossingIdentityBodyV0
}
```

Signature domain separator:

```text
reLATTE-CrossingSignature-v0|
```

Signed bytes:

```text
UTF8("reLATTE-CrossingSignature-v0|")
|| RFC8785(CrossingSignatureBodyV0)
```

Signature profile:

```text
algorithm field: ECDSA-P256-SHA256
curve: P-256
hash: SHA-256
portable signature encoding: canonical unpadded base64url of the 64 raw P-256 ECDSA signature bytes
signing.domain field: relatte.crossing-signature/v0
```

Verification requires all of the following:

1. the envelope contains no unknown root fields and its `signing` object contains no unknown fields;
2. the stored `crossing_id` exactly equals a fresh derivation from the envelope;
3. public-key coordinates and signature text use their single canonical base64url forms; and
4. the public key verifies the signature over the exact signature bytes above.

The same closed-field guard applies to receipts. This is deliberately narrower than full JSON Schema validation: nested payload/reference semantics and the rest of R1 structural validation remain separate work.

Changing only `crossing_id` therefore fails verification even though the ID is not part of its own hash preimage.

## 6. Receipt identity + signature

`ReceiptIdentityBodyV0` includes:

```text
schema
crossing_id
world_id
receiver_particular
kind
semantic_effect
contract_ref
pre_state_ref
post_state_ref
descendant_refs
residual_refs
note
created_at
signing.algorithm
signing.public_key { kty, crv, x, y }
signing.domain
extensions
```

Excluded:

```text
receipt_id
signing.signature
```

Absent optionals normalize to `null`, `[]`, or `{}` according to their schema role.

Receipt ID domain:

```text
reLATTE-Receipt-v0|
```

Receipt signature domain:

```text
reLATTE-ReceiptSignature-v0|
```

Textual ID:

```text
relatte-receipt-v0:<64 lowercase sha256 hex>
```

Receipt signing uses `ECDSA-P256-SHA256`, field domain `relatte.receipt-signature/v0`, and the same derive-ID-first / sign-ID-plus-body construction as crossings.

A receiver may use a different key from the crossing source. That difference is expected and does not imply a shared identity or authority.

## 7. Executable proof surface

The v0 witness currently proves:

- object insertion order does not change crossing/receipt identity;
- normalized optional omission does not fragment crossing identity;
- ID/signature self-reference is explicit;
- source-world mutation changes crossing identity;
- semantic mutation fails signature verification;
- wrong public key fails verification;
- wrong signing domain fails verification;
- crossing and receipt may be signed by distinct P-256 keys;
- serialized crossings and receipts verify in fresh Node processes using only portable public material;
- unknown root/signing fields cannot ride beside a valid signature as unsigned data;
- non-canonical P-256 coordinate or signature text is rejected;
- fixed signed crossing/receipt fixtures verify without committed private keys.

The fixtures live at:

```text
fixtures/genesis-signed-crossing.json
fixtures/genesis-signed-receipt.json
```

## 8. What this does not prove

This profile does not establish:

```text
human identity
human intent
truth of payload
semantic admission
capability legitimacy
receiver consequence
transport authenticity
global ordering
global consensus
legal authority
```

It also does not complete all of Roadmap R1. Structural schema validation, parent existence/ancestry checks, payload-address resolution, and receiver anti-replay remain later work.

R2's cryptographic mechanism now has a bounded executable witness, but it remains subordinate to the wider R1/R3 protocol gates.

## 9. Compatibility rule

The existing v0 JSON Schemas are unchanged by this profile.

The executable profile is intentionally narrower than the schema's generic signing strings: this witness recognizes only `ECDSA-P256-SHA256` with the exact crossing/receipt signing domains above.

A future algorithm or identity profile must be versioned or explicitly migrated. It must not silently reinterpret receipts already produced under this profile.

> **The ID names the exact canonical particular. The signature proves possession of the corresponding private key at signing time. Neither statement decides what the particular means.**
