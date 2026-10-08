# SB-001 Defense Profile — "Pentagon Proud" Without a Compliance Claim

**Status:** bounded hardening profile for the SB-001 specimen  
**Scope:** `experiment/supabardo-sb001-001` / PR #57  
**Nonclaim:** this document does **not** claim DoD authorization, FedRAMP, CMMC, FIPS validation, NIST certification, or any government accreditation.

The goal is narrower:

> Treat every boundary as hostile, every clock as fallible, every signer as potentially compromised within its own authority, every CI dependency as supply-chain material, and every surviving claim as something that must be independently reconstructible.

The profile is informed by zero-trust and secure-software-development principles, especially NIST SP 800-207 and NIST SP 800-218. Those references motivate posture; they are not compliance assertions.

## 1. Assets

SB-001 protects the integrity and attribution of:

- exact particular P;
- crossing X;
- source RELEASE;
- unresolved SupaBardo witness;
- destination-local disposition;
- field EXIT;
- role separation among source, Bardo, and destination;
- the complete durable evidence set after Bardo destruction.

## 2. Trust boundaries

There are three cryptographic roles:

```text
SOURCE A          SUPABARDO FIELD          DESTINATION B
source key        bardo key                destination key
    |                 |                         |
 RELEASE         WAIT / EXIT                    ADMIT
```

No role receives implicit authority from network location, repository location, Supabase presence, Git possession, or another role's signature.

Role laws:

```text
VALID SIGNATURE != TRUE CLAIM
VALID SIGNATURE != AUTHORIZED SEMANTIC EFFECT
SOURCE SIGNATURE != DESTINATION AUTHORITY
BARDO SIGNATURE != DESTINATION AUTHORITY
DESTINATION SIGNATURE != SOURCE RETCON
NETWORK PRESENCE != TRUST
```

## 3. Causality does not trust clocks

Wall-clock timestamps are signed metadata. They are **not** the causal oracle.

A signer can have:

- a wrong clock;
- clock skew;
- an intentionally backdated clock;
- no trustworthy external time source.

SB-001 therefore derives causal order from cryptographic references:

```text
X crossing_id
  ↓
RELEASE.post_state_ref
  ↓
RELEASE.receipt_id
  ↓
WAIT.pre_state_ref
  ↓
WAIT.receipt_id
  ├──────────────→ B disposition ancestry
  └──────────────→ EXIT.pre_state_ref
                        ↓
B disposition.receipt_id
                        ↓
EXIT.post_state_ref
```

A timestamp may disagree with this order without rewriting it.

## 4. Whole-evidence commitment

`fixtures/sb001-evidence-manifest.json` binds the complete surviving specimen.

Pinned evidence set:

`sb001-evidence-v0:cbb5e16c8209e1978d1cc1910c4b5128fa58bdab1bb9bbd7d4112ebd0f6c5174`

The commitment includes:

- P's SHA-256;
- X's crossing ID;
- all four receipt IDs;
- source public-key fingerprint;
- Bardo public-key fingerprint;
- destination public-key fingerprint;
- the declared causal-link graph;
- the explicit claim limit.

The commitment is an integrity anchor, **not authority**.

It prevents a verifier from silently accepting a different lawful ceremony as the historical SB-001 specimen.

## 5. Replay and mix-and-match posture

The bounded verifier refuses:

- receipts from another crossing;
- a disposition referring to another WAIT;
- EXIT referring to another disposition;
- another lawful ceremony substituted for the pinned historical evidence set;
- another payload wearing P's content address;
- another role key substituted into the pinned set.

Offline replay of the exact pinned evidence set is intentionally allowed because reconstruction is the purpose of the archive.

Operational re-execution of the same ceremony is a separate concern and must use local anti-replay state at the receiving membrane.

## 6. Compromised-key model

### One compromised role key

A compromised key can lie **within that role's signed statements**.

It cannot, by itself:

- satisfy another role's key fingerprint;
- rewrite already pinned evidence without changing the evidence-set ID;
- make source and destination authority identical without detection;
- make Bardo meaning become destination meaning without violating the specimen laws.

### Two compromised role keys

Two compromised roles can coordinate lies across their own statements.

The remaining independent role and pinned evidence set still expose identity collapse, ancestry drift, or changed historical material where those constraints are exercised.

### All three role keys compromised before the ceremony

SB-001 cannot prove an honest real-world event against fully colluding authorized keys.

That is an explicit boundary, not a hidden assumption.

Mitigations for a future promoted system would require external trust roots such as hardware-backed keys, independent transparency logs, quorum witnesses, or separately administered checkpoint authorities.

## 7. CI supply-chain posture

The verification workflow:

- grants only `contents: read`;
- pins GitHub Actions by exact commit SHA rather than mutable tags;
- disables persisted checkout credentials;
- has an execution timeout;
- cancels superseded runs;
- suppresses package lifecycle scripts during dependency installation;
- runs type checking, tests, and build.

Current pinned actions:

- `actions/checkout@11d5960a326750d5838078e36cf38b85af677262`
- `actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020`

## 8. BAT threat classes

The BAT includes attacks where hostile claims are freshly and correctly signed.

Covered classes include:

- semantic overreach;
- role impersonation;
- authority inheritance;
- premature destination meaning;
- Bardo-created meaning;
- premature EXIT;
- permanent-retention drift;
- payload substitution;
- valid-receipt substitution;
- mix-and-match histories;
- exact-history replay versus pinned identity;
- role-key replacement;
- dishonest/backdated clocks.

The important rule is:

> A good signature proves attribution. The bounded verifier decides whether that attributed statement is lawful for this ceremony.

## 9. Destruction posture

The live SupaBardo runtime was destroyed after receipts escaped.

Verification does not require:

- Supabase availability;
- the deleted runtime schema;
- a network connection;
- a live destination;
- the private signing keys.

This is deliberate.

```text
LIVE SERVICE != HISTORICAL AUTHORITY
SERVICE DEATH != HISTORY DEATH
ARCHIVE != IMMORTAL RUNTIME
```

## 10. Remaining red-team gaps

SB-001 still does **not** establish:

- hardware-backed private-key custody;
- key rotation or revocation;
- external transparency logging;
- threshold/quorum authorization;
- reproducible dependency installation from a committed lockfile;
- signed release artifacts or provenance attestations;
- OS/hardware measured boot;
- compromise-resistant operator identity;
- confidentiality of payload P;
- availability under denial of service;
- cross-region disaster recovery;
- formal proof of the verifier;
- authorization for classified, CUI, or other regulated government data.

Those are promotion-stage controls, not claims silently inherited by SB-001.

## 11. Promotion gate

Do not call this "government grade."

Call it what is actually demonstrated:

> **A destructible unresolved-crossing specimen with independent role identities, cryptographic causal linkage, a pinned whole-evidence commitment, hostile valid-signature tests, reduced CI privilege, and explicit compromise boundaries.**

Before SupaBardo earns infrastructure status, require at minimum:

1. a second meaningfully different real crossing;
2. independent verifier implementation;
3. committed dependency lock and software-bill-of-materials path;
4. external checkpoint/transparency witness;
5. key lifecycle design;
6. operational replay protection;
7. failure-injection across transport loss, duplicate delivery, and partial archive loss.
