# FOUNDATION-OF-TRUST-001

This pass attacks draft PR #67 on `experiment/particularity-crucible-001`, starting at `e250ad4bb1a45b4b30b43a34ff9f0f9fbc4bf6c5`. The baseline was 137 passing tests [C01, OBSERVED]. The unconditional target property is **not established** under arbitrary compromise: malicious compatible signatures, first-observer withholding and complete archive loss are preserved counterexamples [C12, C16, C17, L02]. Nothing is merged; this is a bounded hostile specimen [C34].

The earned conclusion is deliberately small: a replacement verifier can reconstruct compatible, attributable, policy-bound declarations about an edge from a surviving, externally pinned public observation scope. It can verify normalized signing-key distinctness, causal crossing references, exact binding fields and a declared cryptographic quorum. It cannot turn those declarations into historical truth, custody independence, inherited authority or admission [C03, C10, C11, C20, C22–C25, C27, C37].

Every factual claim in this document refers to the [claim matrix](FOUNDATION-OF-TRUST-001-CLAIM-MATRIX.md); its machine-readable counterpart is [claim-matrix.json](../fixtures/foundation-of-trust-001/claim-matrix.json). Vocabulary and rules below are definitions, not factual upgrades [C33].

## What broke and how it was bounded

1. **Same-key metadata fraud:** protocol verification normalizes a JWK to its P-256 coordinates, while two-witness distinctness hashed the entire JWK. Adding `kid` to one witness preserved both signatures and made one key look like two. The frozen baseline returns `CORROBORATED`; the repaired implementation returns `HOLD / WITNESS_KEYS_NOT_DISTINCT`. The fix compares exactly `{kty, crv, x, y}` [C02, C03].
2. **Unsigned custody declarations:** the original verifier compared unsigned runner fingerprints and claimed machine separation and job ordering. Runner declarations are now signed and wrapper tampering fails, but even valid signed fingerprints can be invented by one operator. Public artifacts therefore earn only key corroboration; machine separation and key-creation chronology remain `UNOBSERVED` [C06, C07, C13, C26, C28].
3. **Hash-valid invented paths:** anyone can create a legacy particularity transition with a correct content ID. Legacy `replayParticularity`, `statesShareParticular` and name-path functions reproduce structural declarations. They are not authorization APIs. The hostile specimen retains that successful invention; `assessContinuityPath` consumes only policy-authorized, corroborated signed edges for a consequential claim [C04, C05, N02]. Callers seeking authorized continuity must use the signed assessor, not the legacy boolean [C05].
4. **Pair-local corroboration misses equivocation:** two individually compatible pairs can contradict each other. The new assessor examines the entire pinned observation scope, retains record IDs of both accounts, and emits `EQUIVOCATION / HOLD`. Source and receiver cases survive observer exchange and cold replay [C14].
5. **Conflict withholding has an information limit:** a fresh observer given only a coherent subset cannot discover an unseen rival. An externally selected signed inventory makes known record loss fail closed. A different inventory pin defines a different observation scope and requires an external selection; it is not an upgrade obtainable by deleting evidence [C15, C16, C22]. The frozen withholding specimen keeps both results [C16].

Copying an entire byte-identical constitution receipt does not provide evidence of a second constitution event. Fresh constitution nonces and locally generated signing keys supply new protocol records in the clone specimen; the identity of a real external event is not derived from ID labels. Legacy capability grants likewise remain structural declarations until separately selected local rules authorize them [C38, C39, F01].

## Mechanically separate vocabulary

| Term | Required meaning in this specimen |
| --- | --- |
| UNOBSERVED | This check has no usable observation supporting the claim. |
| CLAIMED | One attributable source account exists; the required receiver/quorum is absent. A signed source can be `status=CLAIMED`, `evidence_level=E2 SIGNED`. |
| SIGNED | Canonical ID and P-256 signature verify under an attributable public curve point. No human/person attribution is implied. |
| CORROBORATED | Compatible source and receiver records bind the same declared edge. |
| CUSTODY-SEPARATED | Some specified separation of custody domains has externally supported evidence. Self-reported fingerprints do not suffice. |
| THRESHOLD-CORROBORATED | Unique admitted key witnesses satisfy the event's signed, versioned quorum policy. This specimen supports `CRYPTOGRAPHIC_KEYS`; independent domain/human thresholds remain unobserved. |
| VERIFIED | A verifier actually reproduced the specified checks on available durable evidence. The assessment output itself is not proof. |
| ADMITTED | A sovereign receiver made a separate local consequential decision. `currently_acceptable=true` is not admission. |
| FINAL | A separately specified bounded finality rule has been satisfied. This specimen supplies none. |

These distinctions are implemented by separate `status`, `evidence_level`, `historically_verified`, `currently_acceptable`, `quorum_kind`, custody facets, `authority`, `admission`, `finality`, `historical_truth` and `trusted_chronology` outputs [C18–C20, C25, C32, C33].

## Evidence ladder: a product of facets, not automatic promotion

| Label | Evidence required | Current bounded result |
| --- | --- | --- |
| E0 UNOBSERVED | No earned supported conclusion | Invalidity, absent roots, incomplete pinned scope, conflict, unavailable required roles/quorum: HOLD; empty declared observed scope: UNRECOVERABLE within that scope. |
| E1 CLAIMED | One attributable noncryptographic witness | Documented vocabulary; not a cryptographic witness input in this assessor. |
| E2 SIGNED | One valid source witness with selected policy/inventory | `CLAIMED / E2 SIGNED`. |
| E3 CORROBORATED-KEYS | Matching source/receiver, distinct normalized curve points | `VERIFIED / E3 CORROBORATED-KEYS`, `DISTINCT_SIGNING_KEYS_ONLY`. |
| E4 CUSTODY-SEPARATED-MACHINE | External bounded evidence of separate ephemeral execution/custody environments | UNOBSERVED from proof artifacts; signed machine declarations alone cannot earn it. |
| E5 CUSTODY-SEPARATED-DOMAIN | Established distinct protection/administrative domains | UNOBSERVED. |
| E6 THRESHOLD | Signed event policy, unique admitted witnesses and declared M-of-N | Implemented for cryptographic key quorum only. It does **not** imply E4, E5, human independence or non-collusion. |
| E7 SURVIVOR-VERIFIED | Fresh reconstruction after explicitly selected original infrastructure removal | Locally observed harness facet for the FatherHand specimen; a bundle-only verifier emits survivor verification UNOBSERVED because death is external evidence. |

The numeric labels are not a scalar proof that all lower facets were observed. `confidence` is a conservative conclusion score: zero on HOLD, two for a bounded single-source SIGNED claim, and the satisfied declared quorum for verified edges. It is used to test evidence-loss monotonicity, not to estimate probability of truth [C15, C20, C33, F04, F05]. `signature_valid_ids` remains a separate record of reproduced signature checks; a HOLD can contain valid malicious signatures [C32].

## Evidence contract and root selection

A `relatte.foundation-bundle/v0` contains a signed policy receipt, a signed observed-inventory receipt and an array of public crossing/receipt records. P-256 and reLATTE's existing identity/signature domains are retained [C10, C23].

The caller supplies three external pins: `policy_key` (normalized key fingerprint), `policy_id`, and `inventory_id`. The caller also supplies the exact `crossing_id` being assessed. These inputs cannot be inferred as trustworthy merely because they arrive next to a bundle. Policy membership defines bounded SOURCE, RECEIVER and OBSERVER roles, worlds, particulars, unique key identities, quorum, and a version [C20, C22].

The inventory commits every observed record ID, including conflicting accounts. Missing, duplicate or unlisted records fail closed. It does not claim to enumerate all events in the world. An observer who learns an additional record must retain it and select an expanded observation scope before claiming the expanded scope is verified; a broker cannot silently replace an already selected pin [C14–C16, C22].

Historical verification uses the signed policy bound into the event. Current acceptability uses a separate, explicitly local policy input: version label, world, exact historical policy pin, retired key set and accepted crossing IDs. Version labels have no wall-clock ordering semantics. Rotation/retirement changes current acceptability, never old IDs or signatures [C18–C20, C32]. No global registry, expiry or universal finality is supplied [C33].

The machine-readable root graph must be acyclic. A mutually dependent trust community may be declared as one ASSUMED root; a circular chain cannot masquerade as derivation. Root selection, cryptographic/runtime correctness, at least one correct verifier, observation-scope completeness and adequate archive survival are explicit roots [C22, C23, C37].

## Signed semantics and payload boundary

The foundation binding declares `CONTINUITY`, `LINEAGE` or `CUSTODY`, endpoints, event-policy ID and `BYTE_IDENTITY`. Source and receiver must sign the same binding. LINEAGE/CUSTODY endpoint direction must agree with source/receiver roles; CONTINUITY requires the same declared particular and an explicitly traversable signed surface path [C05, C10].

`BYTE_IDENTITY` binds a `sha256:` payload **reference** in this specimen. Actual payload bytes are not in the proof bundle, so `payload_material=UNOBSERVED`; this proves compatible digest references, not that a real object arrived. Semantic identity and declared semantic equivalence are unsupported and fail specifically. A canonical JSON identity of a signed record is separate from the byte identity of handed material [C10, C30].

Quorum verification counts one source plus distinct RECEIVER/OBSERVER accounts, with a required receiver. The declared quorum can be 2-of-2, 2-of-3, 3-of-5 or larger. An authorized conflicting minority causes HOLD; this is a conservative observation policy, not a Byzantine-majority truth or availability guarantee [C14, C20, C21].

## Hostile campaign and failure oracles

| Campaign | Actual specimen/oracle | Claim IDs |
| --- | --- | --- |
| A pointer/forged transition | No path: `NO_WITNESSED_CONTINUITY_PATH`; invalid signature: `INVALID_WITNESS_SIGNATURE`; valid outsider: `UNAUTHORIZED_SOURCE_ROLE`; preserve hash-only invented legacy edge | C04, C05 |
| B perfect clone | Equal seed bytes/ancestry and independently generated constitution nonces; divergent cold states, killed child supplies no grant to survivor | F01, C25 |
| C false split | All seven surface dimensions change; both signed edges support path; missing or incomplete B→C cannot bridge the gap | C05 |
| D same-key fraud | `kid`, `use`, `key_ops`, imported key, alternate identity serialization: `WITNESS_KEYS_NOT_DISTINCT` | C02, C03 |
| E two keys/one custodian | Positive cryptographic verification, `DISTINCT_SIGNING_KEYS_ONLY`, higher custody facets UNOBSERVED | C08 |
| F machine claims | Private A material in B, reuse, identical fingerprints, mixed run, absent source, unsigned metadata, C private leak; fabricated signed machine declarations remain a successful bounded attack on E4 | C06–C08, C26, C28 |
| G broker | Delete/substitute/replace/mix/replay/truncate, unknown fields, extra files, file/directory symlinks, malformed/duplicate-key JSON, reordering, signed-byte change, duplicate witness | C10, C15, C25, C30 |
| H equivocation | Source/receiver signed rival accounts; cross-observer union; conflict minority/quorum; frozen scope record withholding | C14–C16 |
| I payload | Isolated signed payload mismatch: `HANDOFF_BINDING_DISAGREEMENT`; semantic identity: `UNSUPPORTED_IDENTITY_BASIS` | C10 |
| J role swaps | Valid crypto with SOURCE/RECEIVER/OBSERVER swaps; authority escalation and reversed lineage roles fail semantically | C10, C25, C32 |
| K replay | Same/fresh world, rotation, retirement, restart, source death, policy change; isolated causal-crossing replay: `CROSSING_ID_DISAGREEMENT` | C11, C18–C20 |
| L clock | Seconds/hours/days, future/ancient/reversed/identical; no trusted time source supplied, no inferred chronology | C11, C13 |
| M source key | Backdated valid claim can't enter pinned inventory; new selected scope stays attributable but current retirement rejects; A+B matching forgery does not prove truth | C12, C18, C19, C32 |
| N receiver key | Valid backdated receipt succeeds cryptographically; trusted chronology remains UNOBSERVED | C13, C32 |
| O verifier | False assessment field rejected; altered evidence rejected; fresh independent verifier recomputes | C24, C25 |
| P witness death | A store removal, B restart, B/C2 store removal, primary/secondary fresh processes from only public evidence | F03–F05 |
| Q archive loss | Exhaustive bounded deletion subsets, conflict-removal subsets, single-source/empty scope; 16-set frozen loss matrix | C15–C17 |
| R thresholds | 2/2, 2/3, 3/5; insufficient, duplicate signature/key, compromised/minority/quorum conflicts, membership/removal/threshold changes | C14, C20 |
| S Sybil | One process generates 1,000 keys; 667-of-1,000 is cryptographic quorum only | C09, C20, C21 |
| T roots | External pins, compromised policy signer, duplicate roots, circular/unfounded derivations | C22, C23, C37 |
| U bootstrap | Public evidence replay with explicit required root pins; untrusted supplied root rejected | C16, C22, C37 |
| V second verifier | Separate native signature path, identity-body reconstruction and canonical serializer; same frozen specimens and mutations | C24 |
| W canonicalization | JSON duplicate names, object order, Unicode, whitespace, numbers, omitted/null, unknown fields, arrays, slash/backslash, prototypes/accessors, non-enumerables/symbols, base64url padding | C30 |
| X seeded graphs | 2,048 deterministic cases with states, particularities, names/controllers/access, random graph gaps, capabilities, key choices, local retirements, witness/archive loss and replay; conflict graph fixtures tested separately | C15, C18, C31 |
| Name/FatherHand | Provisional name attack dimensions; independent A/B/C2 topology without donated authority | N01, N02, F01–F06 |

Hostile tests assert exact statuses and reason codes. Valid signatures are checked before semantic rejection where those semantics are the target; parser rejection is never used as evidence for role, payload, continuity or authority resistance [C10, C30, C32].

## Canonicalization contract

Object key order and JSON whitespace/escapes preserve signed identity. Arrays are ordered. Unicode is not normalized; composed and decomposed forms differ. Lone surrogates, unsafe/nonfinite numbers, accessors, custom prototypes, symbol properties and hidden properties fail canonicalization. Numeric spelling `1.0` and `1` has the same JSON number meaning; encoded slash and slash have the same JSON string meaning, while backslash differs [C30].

The existing protocol explicitly defaults omitted nullable fields to null and optional arrays to empty arrays; the foundation schema itself requires its own declared fields. Unknown root/signing fields are rejected. Signed extension fields remain part of identity, but foundation-specific semantic extension shapes are exact. JWK metadata is excluded from cryptographic identity; the curve point, not that metadata, is counted. Signature/coordinate encodings must be canonical unpadded base64url [C03, C30].

Duplicate JSON names, including escape-equivalent names, are rejected before `JSON.parse` can erase them. Public directories have exact allowlists and reject file/directory symlinks; surviving signatures and inventory pins are still required even if the broker races or controls storage [C15, C25, C30].

## Reproduction

```sh
npm install --ignore-scripts
npm run verify
npm run trust:replay
node --experimental-strip-types scripts/foundation-of-trust-mutations.mjs /tmp/mutation-report.json
node --experimental-strip-types scripts/foundation-of-trust-specimen.mjs /tmp/fresh-fatherhand-public
```

The full default verification runs regression tests, the hostile tests (including the seeded/Sybil campaigns), assertion-killed mutation checks and TypeScript build. Frozen fixtures have public evidence only. Regeneration goes to a fresh directory; keys/signatures are freshly generated, so regenerated bytes differ and frozen bytes stay reviewable [C23, C29, C31, C35, F03].

`scripts/foundation-of-trust-independent.mjs` imports no high-level assessor, canonical identity-body builder or signature verifier. It independently rebuilds those operations using native `node:crypto` P1363 verification. It shares the low-level strict ingress parser, JSON semantics, protocol specification and Node runtime/cryptographic ancestry. This is implementation diversity, not full independence [C24].

Existing CI already supplies an actual three-job A→B→C boundary, while the default verify workflow executes local hostile/mutation tests. No additional workflow simulates independence with local jobs. Any current SHA CI observations must be reported separately from the artifact-only E3 assessment [C26, C36].

## Mutation protection and remaining ceiling

The [mutation report](../fixtures/foundation-of-trust-001/mutation-report.json) names the exact implementation substitution, original source digest and assertion that kills each of twenty-one mutants: same-key counting, pointer continuity, donated authority, missing signed edge, causal replay, payload mismatch, trusted verifier output, both equivocation directions, withholding upgrade, event-policy replacement role membership, duplicate signer counting, retirement, root pins, parser duplicate names, canonical accessors, unsigned job metadata, key-to-machine promotion, missing name paths and circular trust [C29].

The full target property stops at explicit roots: availability of enough public history/pins, external root/scope selection, key attribution rather than truth, and at least one correct replacement verifier. A key compromise can fabricate attributable claims; both endpoint keys can fabricate compatible testimony; a compromised policy selector can choose a malicious policy; a compromised sole verifier can lie; total public evidence loss cannot be recovered by cryptography [C12, C16, C17, C22–C25, C37, L02].

**Next single hardest test:** independently administered observers exchange incompatible histories while a malicious policy signer tries to give a fresh verifier different but valid bootstrap/observation roots. The test should require an externally attributable root-selection decision and preserve equivocation across observer exchange. No algorithm in the present public bundle establishes that decision or global completeness [C16, C21, C22, C37].
