# Early Source Packet — Authority, Replay, Witness, and Sovereign Histories

**Status:** research neighbor map / no canon promotion
**Date:** 2026-09-29
**Context:** reLATTE Genesis, Slice 001, and the "Creepy Charlie" hostile-control thought experiment.

This note records older and adjacent technical work that constrains or clarifies reLATTE's current ideas.

It does not claim that reLATTE is an implementation of any one source below, that the sources endorse reLATTE, or that similar vocabulary proves shared architecture.

NEIGHBOR != ANCESTOR
ANALOGY != PROOF
PRECEDENT != ADOPTION
SOURCE != reLATTE AUTHORITY

---

## 1. Norman Hardy — The Confused Deputy (1988)

**Source:** Norman Hardy, "The Confused Deputy (or why capabilities might have been invented)," ACM SIGOPS Operating Systems Review 22(4), 1988, pp. 36–38.
DOI: https://doi.org/10.1145/54289.871709
Accessible copy: https://pdos.csail.mit.edu/6.828/2009/readings/hardy-confused-deputy.html

Hardy's compiler held authority of its own and accepted caller-supplied designations. The failure occurred when those two authority sources were confused.

The capability-oriented correction is structural: the authority used for an action should be explicitly designated and attributable to the request that authorizes it.

reLATTE pressure:

WHO IS ASKING?
!=
WHAT MAY THIS CALLER CAUSE?
!=
WHAT AUTHORITY DOES THE RECEIVER ITSELF POSSESS?

Candidate law:

SOURCE IDENTITY != ACTION AUTHORITY

### Creepy Charlie control

Charlie may be recognizable, familiar, previously admitted, and carrying historical keys.

None of those facts should let the receiving system spend its own ambient authority on Charlie's behalf.

VALID CHARLIE
+ INVALID CURRENT CAPABILITY
→ REFUSE

---

## 2. Saltzer & Schroeder — Protection Principles (1975)

**Source:** Jerome H. Saltzer and Michael D. Schroeder, "The Protection of Information in Computer Systems," Proceedings of the IEEE 63(9), 1975, pp. 1278–1308.
DOI: https://doi.org/10.1109/PROC.1975.9939
Author bibliography: https://www.mit.edu/~Saltzer/publications/pubs.html
Readable university mirror: https://www.cs.virginia.edu/~evans/cs551/saltzer/

Several classic principles are directly relevant:

- fail-safe defaults — base access on explicit permission;
- complete mediation — check authority on every access;
- least privilege — grant only the authority needed;
- separation of privilege — do not let one weak condition silently imply broad access;
- least common mechanism — avoid unnecessarily shared mechanisms;
- open design — security should not depend on secrecy of the design.

reLATTE pressure:

PAST ADMISSION != PRESENT ADMISSION
FAMILIARITY != PERMISSION
SUCCESSFUL PRIOR USE != STANDING AUTHORITY

The receive/admit boundary should fail closed.

---

## 3. NIST SP 800-207 — Zero Trust Architecture (2020)

**Source:** Scott Rose et al., Zero Trust Architecture, NIST SP 800-207, August 2020.
https://csrc.nist.gov/pubs/sp/800/207/final
DOI: https://doi.org/10.6028/NIST.SP.800-207

NIST's model reduces implicit trust zones and separates authentication from authorization. Access decisions are intended to be granular and tied to the particular resource/action.

reLATTE pressure:

AUTHENTICATED != AUTHORIZED
AUTHORIZED FOR X != AUTHORIZED FOR Y
AUTHORIZED BEFORE != AUTHORIZED NOW

This supports reLATTE's owner-local admission rule without requiring reLATTE to adopt NIST's enterprise architecture.

---

## 4. RFC 9421 — HTTP Message Signatures (2024)

**Source:** RFC 9421, HTTP Message Signatures, IETF Standards Track, February 2024.
https://www.rfc-editor.org/rfc/rfc9421.html

RFC 9421 is useful because it separates several things that are easy to collapse:

- which message components were actually signed;
- key identification;
- application-specific signature requirements;
- freshness metadata;
- nonces;
- replay handling.

It explicitly warns that a valid signature can still be unsafe when important message components were not covered, and that replay remains possible unless applications add suitable freshness/uniqueness checks.

reLATTE pressure:

VALID SIGNATURE != VALID WHOLE MESSAGE
VALID SIGNATURE != FRESH REQUEST
FRESH REQUEST != AUTHORIZED CONSEQUENCE

Candidate hostile controls:

- mutate an unsigned field that affects execution;
- reuse an old signed crossing;
- reuse the signature against another world;
- remove expiration/freshness data;
- duplicate delivery.

---

## 5. RFC 9449 — OAuth DPoP (2023)

**Source:** RFC 9449, OAuth 2.0 Demonstrating Proof of Possession (DPoP), IETF Proposed Standard, September 2023.
https://www.rfc-editor.org/rfc/rfc9449.html

DPoP binds proof to a key and request context, including target URI/method, and defines replay defenses using identifiers, timestamps, and optional server-provided nonces.

The transferable idea is context-bound authority proof.

A bearer-like artifact should not be freely replayable into another target/world/action.

Candidate reLATTE capability bindings:

issuer
subject/bearer rule
target world
target organ/contract
allowed action
crossing kind
nonce / unique use id
not-before?
expiry?
revocation reference?
signature

This does not mean reLATTE should implement OAuth or DPoP directly.

---

## 6. Ethereum EIP-155 — Domain / Chain Replay Protection (2016)

**Source:** Vitalik Buterin, EIP-155, Simple replay attack protection.
https://eips.ethereum.org/EIPS/eip-155

EIP-155 binds signed Ethereum transactions to a chain identifier so that a valid transaction intended for one chain is not automatically valid on another.

reLATTE pressure:

SIGNED FOR WORLD A != VALID FOR WORLD B

A reLATTE crossing should not be replayable merely because another world accepts the same envelope schema.

---

## 7. Ethereum EIP-712 — Typed Structured Data Signing (2017)

**Source:** Remco Bloemen, Leonid Logvinov, Jacob Evans, EIP-712, Typed structured data hashing and signing.
https://eips.ethereum.org/EIPS/eip-712

EIP-712 addresses a problem reLATTE also faces: signing meaningful structured objects rather than opaque byte strings. Its domain separator lets otherwise similar message structures remain distinct across applications/contracts/versions.

EIP-712 also explicitly says it does not itself provide replay protection; applications must handle repeated signed messages safely.

reLATTE pressure:

CANONICAL TYPED STRUCTURE
+ DOMAIN SEPARATION
+ SIGNATURE

Possible domain inputs:

protocol = reLATTE
schema = CrossingEnvelopeV0
source world
target world?
contract id?
contract major version
purpose / crossing class

The exact canonical encoding remains a Project0/reLATTE design question; EIP-712 is precedent, not the chosen format.

---

## 8. Certificate Transparency — RFC 9162 (2021)

**Source:** RFC 9162, Certificate Transparency Version 2.0.
https://www.rfc-editor.org/rfc/rfc9162.html

Certificate Transparency uses append-only Merkle-tree logs so interested parties can detect unexpected issuance and obtain inclusion/consistency proofs.

Crucially, the log does not itself decide what humans or institutions should do about a bad certificate.

reLATTE pressure:

PUBLIC CHAIN / TRANSPARENCY LOG = FOREIGN WITNESS
FOREIGN WITNESS != INTERIOR AUTHORITY

A checkpoint can prove that some commitment entered an append-only witness structure by a given stage without turning the external log into the semantic owner of the underlying history.

It also provides a useful warning: a log can equivocate by showing inconsistent views unless additional mechanisms detect it.

---

## 9. Saltzer, Reed & Clark — End-to-End Arguments (1984)

**Source:** J. H. Saltzer, D. P. Reed, D. D. Clark, "End-to-End Arguments in System Design," ACM Transactions on Computer Systems 2(4), 1984.
MIT copy: https://web.mit.edu/saltzer/www/publications/endtoend/endtoend.pdf

The end-to-end argument asks whether a function can be correctly and completely implemented only with knowledge available at the endpoints. Lower layers may assist but cannot replace endpoint responsibility for some guarantees.

reLATTE pressure:

Relays can carry, cache, mirror, checkpoint, and verify structural signatures.

They should not decide what the crossing means to the receiving world.

TRANSPORT CAN HELP
TRANSPORT CANNOT COMPLETE LOCAL ADMISSION

---

## 10. Kleppmann et al. — Local-First Software (2019)

**Source:** Martin Kleppmann, Adam Wiggins, Peter van Hardenberg, Mark McGranaghan, "Local-first software: You own your data, in spite of the cloud," Onward! 2019.
https://martin.kleppmann.com/2019/10/23/local-first-at-onward.html
DOI: https://doi.org/10.1145/3359591.3359737

Local-first work treats local ownership, offline operation, collaboration, and long-term preservation as architectural goals rather than conveniences added to a cloud-owned source of truth.

reLATTE pressure:

SERVER AVAILABLE != WORLD EXISTS
RELAY AVAILABLE != HISTORY EXISTS
CLOUD ACCOUNT != LOCAL OWNERSHIP

reLATTE's stronger candidate remains separate: local histories may preserve divergent semantic state rather than merely converge a shared document.

---

# Creepy Charlie as a sourced hostile fixture

The song exposes several security mistakes that the literature already recognizes in other forms.

Charlie:

- knocks once;
- is recognizable;
- has historical continuity;
- may possess an old key;
- has entered before;
- looks procedurally familiar.

None establishes current authority.

The hostile fixture can therefore test:

1. Confused deputy — can Charlie cause the receiver to spend authority Charlie does not possess?
2. Fail-safe default — does missing current permission refuse by default?
3. Complete mediation — is authority checked again on re-entry?
4. Least privilege — is the capability scoped narrowly enough?
5. Replay — can an old signed crossing or capability be reused?
6. Domain separation — can a valid credential for World A be replayed in World B?
7. Signed coverage — can an attacker alter an execution-relevant field outside the signed surface?
8. Foreign witness restraint — does an external log/checkpoint merely witness, or does the implementation accidentally treat it as admission?
9. Endpoint sovereignty — can a relay/hub cause local consequence without receiver-local admission?
10. Divergent receivers — can B admit while C refuses without either result being rewritten as global consensus?

Expected safe path:

KNOCK
→ identify source
→ verify signed crossing
→ check freshness / anti-replay
→ check target/domain
→ check capability
→ RECEIVE
→ HOLD
→ owner-local admission decision
→ ADMIT / REFUSE / RETURN
→ signed receiver receipt

The door opening is not proof that opening the door was authorized.

EFFECT != LAWFUL EFFECT

---

# What appears genuinely reLATTE-shaped

None of the sources above, by itself, appears to supply the whole current composition:

many sovereign local histories
+ signed typed crossings
+ receiver-local semantic admission
+ divergent lawful consequences
+ durable lineage/residual
+ optional foreign append-only witness
+ cultural / developmental descendants
+ no required universal state

That composition remains a reLATTE candidate.

The source packet should constrain implementation without erasing novelty.

## Working research rule

> Borrow old proofs for old problems. Spend novelty only where the relation is actually new.
