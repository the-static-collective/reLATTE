# WEBZ-005 — FatherHand / FounderNode Root Trust

**Status:** Human-approved architecture with an executable **synthetic, network-free root-kernel specimen** on PR #66. Not production authority and not yet direct HTTPS.

## Primitive split

### FatherHand

**FatherHand is the human-held cryptographic root of sovereignty.**

It is a deliberately cold, rarely used **seed constitution**. Its private material is not a server key, browser key, reLATTE receiver key, daily signature key, account password, or transport credential.

FatherHand may found or replace a FounderNode, recognize a remote FounderNode for a bounded trust scope, authorize recovery/succession, and issue new recovery lineages.

FatherHand private material must never be available to ordinary Workbench, webZ, reLATTE receiver, HTTP server, CI job, or always-on runtime.

### FounderNode

**FounderNode is the durable cryptographic identity of one world.**

A FounderNode is independently generated key material plus a FatherHand-signed founding statement. It may delegate shorter-lived operational identities for webZ transport, reLATTE receiving, invitations, and future world services.

A FounderNode is not the human, not the current server, not a DNS name, and not a particular machine.

    FATHERHAND
    human-held cold root
            |
            | signs founding / succession
            v
    FOUNDERNODE
    durable world identity
            |
            | bounded delegation
            +-------------------+
            |         |         |
            v         v         v
       HTTPS key  reLATTE key  session key

## The seed kernel

FatherHand genesis begins from high-quality 256-bit random secret material produced offline by a reviewed cryptographic implementation.

The design must not invent a novel deterministic curve-derivation algorithm.

For v0:

- generate a standard signing key using a reviewed runtime cryptographic primitive;
- represent FatherHand publicly by a canonical public-key fingerprint and generation identifier;
- encode the recoverable private/root material into a bounded recovery payload;
- threshold-split that recovery payload with a reviewed, auditable secret-sharing implementation;
- never derive ordinary operational private keys directly from a recovery share.

A compromise of any single child must not enable derivation of FatherHand or any sibling private key.

**CHILD != PARENT.**

## Two kinds of children

### Generative children

These are independently generated keys whose public identities are signed/delegated by their parent authority.

Examples:

- FatherHand -> FounderNode
- FounderNode -> webZ operational identity
- FounderNode -> reLATTE receiver identity

Possession of a child private key cannot reconstruct the parent private key.

### Recovery children: FatherKids

These are threshold shares of the FatherHand recovery payload.

Recommended first specimen:

    FatherHand generation 0
    5 recovery lineages
    threshold = 3

    Kid-A  Kid-B  Kid-C  Kid-D  Kid-E
       \     |      |      |     /
          any 3 DISTINCT lineages
                  |
                  v
          reconstruct FatherHand-0
          only inside recovery ceremony

A FatherKid carries the FatherHand public fingerprint **and public key**, FatherHand generation, recovery-set identifier, unique lineage identifier, the actual Shamir coordinate encoded by its share, threshold parameters, encoded share material, SHA-256 integrity metadata, a **FatherHand signature over all non-secret share metadata plus the share checksum**, and explicit RECOVERY_ONLY scope.

No one FatherKid contains the whole root.

## Kid descendants

A FatherKid may itself be made recoverable, but descendants of one FatherKid remain **one FatherHand-level vote**.

    FatherHand
       |
       +-- Kid-A
       |     +-- A1
       |     +-- A2
       |
       +-- Kid-B
       |     +-- B1
       |
       +-- Kid-C
             +-- C1
             +-- C2

A1 and A2 may reconstruct Kid-A's share. They do not become two independent FatherHand shares.

**DESCENDANTS OF ONE KID = ONE LINEAGE VOTE.**

## Recovery ceremony

Normal runtime must never reconstruct FatherHand.

Recovery requires an explicit human ceremony:

1. collect the minimum number of distinct FatherKid lineage IDs;
2. validate same FatherHand fingerprint, generation and recovery-set ID;
3. reconstruct root material only in bounded volatile process memory;
4. prove the recovered public fingerprint equals the expected FatherHand identity;
5. use the recovered key only for a bounded recovery act;
6. prefer immediate succession to a freshly generated FatherHand generation;
7. issue new FounderNode continuity/delegation as required;
8. create a fresh recovery set;
9. erase reconstructed legacy private material.

**RECOVERY != CONTINUATION.**

## Succession

FatherHand identity is a lineage, not a single eternal private file.

    FatherHand-0
       |
       | signs fatherhand.succession/v0
       v
    FatherHand-1
       |
       +-- fresh recovery set
       +-- confirms / replaces FounderNode

A succession statement binds old and new FatherHand fingerprints/generations, reason code, lineage head, retained/revoked FounderNode authorities, bounded metadata, old-root signature, and new-root countersignature.

**RECONSTRUCTED != SILENTLY CONTINUED.**

## Founding a world

FatherHand creates a FounderNode by signing a founding statement over the FounderNode public key, never by giving the FounderNode the FatherHand secret.

The founding statement binds:

- FatherHand fingerprint and generation;
- world ID;
- FounderNode public key and fingerprint;
- allowed delegation scopes;
- constraints and creation metadata;
- statement ID;
- FatherHand signature.

A stolen FounderNode cannot generate a valid new FatherHand. FatherHand can revoke/supersede the FounderNode.

## Operational delegation

FounderNode signs bounded delegation statements for replaceable online keys.

Every delegation binds exact public-key fingerprint, scope, generation/serial, validity window, endpoint constraints where applicable, replacement/revocation lineage, and FounderNode signature.

Runtime validates the chain. It does not infer authority from a hostname or TLS certificate alone.

**DELEGATION != SOVEREIGNTY.**

## FatherHand peer recognition

WEBZ-005's strongest bootstrap is a **FatherHand-signed recognition of another world's FounderNode**.

A peer-trust statement binds:

- local FatherHand identity;
- remote world ID;
- exact remote FounderNode fingerprint;
- permitted peer scopes;
- expiry / optional invitation identifier;
- TRUST decision;
- local FatherHand signature.

The runtime receives this public trust statement and public keys only. It never receives FatherHand private material.

A remote operational key is trusted only when its FounderNode delegation verifies and that FounderNode exactly matches the local FatherHand trust mark.

TLS secures the pipe; FatherHand/FounderNode answers **who the intended world is**.

## Revocation and compromise

**Operational key compromised:** FounderNode revokes/replaces it. World identity survives.

**FounderNode compromised:** FatherHand revokes/supersedes it and founds a replacement. Human root survives.

**FatherHand suspected compromised:** use recovery only if the expected recovery lineages remain trustworthy; reconstruct solely to authorize succession/revocation, then retire the compromised generation.

A new key alone never proves compromise resolution.

## Constitutional laws

    FATHERHAND != DAILY KEY
    FATHERHAND != SERVER
    FATHERHAND != FOUNDERNODE
    FOUNDERNODE != HUMAN
    FOUNDERNODE != CURRENT MACHINE
    FOUNDERNODE != TLS CERTIFICATE

    CHILD != PARENT
    DERIVATION != RECOVERY
    ONE CHILD != FATHERHAND
    DESCENDANT REDUNDANCY != INDEPENDENT RECOVERY AUTHORITY

    RECOVERY QUORUM != DAILY AUTHORITY
    RECOVERY != CONTINUATION
    RECONSTRUCTION != SUCCESSION
    NEW KEY != AUTHORIZED SUCCESSOR

    KEY PRESENTED != KEY TRUSTED
    NETWORK CONTACT != FATHERHAND
    TLS VALID != SOVEREIGN PEER TRUST
    TRUST MARK != ADMISSION
    TRUSTED PEER != TRUSTED PAYLOAD
    SESSION != CROSSING
    CROSSING != ADMISSION

## First executable specimen

Before remote HTTPS, the branch implements a **network-free root kernel** that must:

1. create FatherHand-0 offline in an isolated temporary directory;
2. create an independently generated FounderNode;
3. sign and verify a founding statement;
4. generate five FatherKids at threshold 3-of-5;
5. prove one or two shares cannot reconstruct;
6. reconstruct from three distinct lineages and match the genesis fingerprint;
7. create descendant backups for one FatherKid and prove multiple descendants still count as one lineage vote;
8. generate FatherHand-1 during a recovery ceremony;
9. have FatherHand-0 sign succession and FatherHand-1 countersign;
10. prove FounderNode/operational child private keys cannot reveal FatherHand material;
11. redact all private key/share material from receipts and logs;
12. reject corrupt, mixed-generation, mixed-set and duplicate-lineage shares;
13. cold-verify all public statements;
14. leave no root private material in ordinary runtime state after the ceremony.

Only after this kernel passes review and is explicitly merged should WEBZ-005 proceed to remote peer enrollment and authenticated transport.

## Cryptographic engineering constraints

- Use established runtime/library primitives; no hand-written curve arithmetic or home-grown threshold crypto.
- Root/share payload formats are versioned and length-bounded.
- Public fingerprints are canonical hashes of canonical public-key encodings.
- Domain-separate every statement type.
- Private values never enter ordinary receipts, GitHub artifacts, browser storage, telemetry or logs.
- Tests detect accidental private JWK fields, raw secret shares, seed material and environment-secret leakage.
- Compare fingerprints and statement IDs exactly; never fuzzy-match world names.
- Failure to collect enough distinct valid lineages is a REFUSE, not permission to weaken threshold.
- Real recovery shares must be physically or administratively separated.

## Non-claims

This design does not yet establish a hardware wallet, HSM, enclave, mnemonic standard, production social-recovery scheme, remote key ceremony, legal identity, guardianship relationship, or direct authenticated WEBZ network. The first implementation is an auditable cryptographic specimen only.

The words FatherHand and FatherKid are protocol/project terms for this human-root and recovery-lineage model; they do not infer biological or legal family relationships.

> **The seed survives through its children without living whole inside any one child.**
