# SB-001 Research BATs

**Purpose:** convert external security research into bounded adversarial tests against SB-001.

**Nonclaim:** this is not a claim of NIST, DoD, CMMC, FedRAMP, SLSA, Sigstore, TUF, in-toto, OWASP, or CISA compliance/conformance. The cited work supplies attack ideas and control questions. SB-001 remains its own bounded specimen.

## Research set

### NIST SP 800-207 — Zero Trust Architecture
https://csrc.nist.gov/pubs/sp/800/207/final

Useful pressure:
- network location is not a trust grant;
- resource access should depend on explicit identity and policy;
- affiliation or ownership does not automatically authorize an action.

SB-001 translation:
- source, Bardo, and destination use distinct role identities;
- Supabase presence grants no semantic authority;
- source ownership does not grant destination authority.

### NIST SP 800-218 — Secure Software Development Framework
https://csrc.nist.gov/pubs/sp/800/218/final

Useful pressure:
- protect software and development infrastructure;
- preserve provenance and integrity;
- reduce the likelihood and impact of supply-chain compromise;
- record and address residual risk rather than hiding it.

SB-001 translation:
- CI permissions are reduced;
- external action dependencies are commit-pinned;
- unresolved supply-chain gaps remain explicit OPEN findings.

### SLSA v1.2
https://slsa.dev/spec/v1.2/

Useful pressure:
- provenance should identify outputs by cryptographic digest;
- provenance should describe how artifacts were produced;
- stronger levels require stronger hosted-build and build-environment guarantees.

SB-001 translation:
- P, X, receipt IDs, role-key fingerprints, source commit/path/blob, and whole evidence-set ID are pinned.
- This is **not** a SLSA provenance attestation.
- Builder identity and hardened hosted-build provenance remain open.

### in-toto
https://in-toto.io/docs/getting-started/

Useful pressure:
- a supply-chain layout defines expected steps;
- authorized functionaries sign link metadata;
- material and product rules protect step boundaries;
- link reuse is a real attack class.

SB-001 translation:
- signed roles are independent;
- receipt ancestry forms a bounded causal chain;
- lawful receipts from another ceremony cannot be mixed into the pinned SB-001 history.

### Sigstore threat model
https://docs.sigstore.dev/about/threat-model/

Useful pressure:
- a valid signature proves attribution, not goodness;
- compromised identity providers/accounts are distinct threats;
- transparency logs make unexpected identity use externally auditable.

SB-001 translation:
- cryptographic verification and semantic-policy verification are separate;
- freshly signed semantic lies are BAT inputs;
- external transparency witnessing remains OPEN.

### The Update Framework (TUF)
https://theupdateframework.io/docs/security/

Useful pressure:
- rollback;
- freeze;
- fast-forward;
- mix-and-match / metadata substitution.

SB-001 translation:
- rollback/history substitution maps cleanly to the pinned evidence-set identity;
- mix-and-match maps cleanly to receipt ancestry;
- **freeze does not directly transfer**: SupaBardo WAIT may legitimately remain unresolved, so a mandatory freshness timeout would change the domain semantics rather than harden them.

### OWASP CI/CD Security Cheat Sheet
https://cheatsheetseries.owasp.org/cheatsheets/CI_CD_Security_Cheat_Sheet.html

Useful pressure:
- mutable third-party integrations are supply-chain material;
- dependency confusion and dependency drift matter;
- immutable dependency references and least privilege reduce risk.

SB-001 translation:
- CI action references are exact commit SHAs;
- token permission is read-only;
- checkout credentials are not persisted;
- package lifecycle scripts are suppressed;
- direct npm dependency versions are exact;
- transitive dependency resolution is still OPEN because no committed lockfile currently exists.

### CISA 2025 Minimum Elements for an SBOM
https://www.cisa.gov/sites/default/files/2025-08/2025_CISA_SBOM_Minimum_Elements.pdf

Useful pressure:
- identify components;
- include software identifiers and hashes;
- describe dependency relationships;
- record known unknowns;
- support machine-readable automation.

SB-001 translation:
- component/dependency completeness remains OPEN because there is no committed machine-readable SBOM yet.
- The research ledger treats that absence as a finding, not as implied completeness.

## Executable research BAT families

The research pass extends the earlier BAT with:

```text
RBAT-ZT
  role/location/ownership authority collapse

RBAT-POLICY
  valid signature + invalid meaning
  extension smuggling
  law-array smuggling
  claim-limit escalation

RBAT-LINK
  cross-ceremony link reuse
  receipt mix-and-match
  wrong destination ancestry

RBAT-ROLLBACK
  lawful history substitution
  pinned evidence-set replacement

RBAT-PROV
  repository/ref/commit/path/blob substitution
  destination-route substitution
  return-route substitution
  role-key replacement

RBAT-CLOCK
  intentionally dishonest timestamps
  verify causality from cryptographic references instead

RBAT-CI
  mutable Action references
  write-capable token assumptions
  persisted checkout credentials
  package lifecycle execution

RBAT-DEPS
  floating direct dependency versions
  absent lockfile is a durable OPEN finding

RBAT-SBOM
  absent machine-readable component inventory is a durable OPEN finding
```

## Exact semantic closure

Because this is one bounded specimen, policy verification is deliberately stricter than generic reLATTE verification.

The SB-001 verifier refuses:

- unknown semantic fields inside the specimen's bounded extension objects;
- contradictory additional law strings;
- additional occurrence classes;
- extra residuals;
- extra descendants;
- escalated claim limits.

This is intentional.

reLATTE remains extensible.

SB-001 is reconstructible because its one historical meaning is narrow enough to verify exactly.

## Findings that stay OPEN

The research pass does not paper over the following:

1. **Dependency lock:** no committed `package-lock.json` or `npm-shrinkwrap.json`.
2. **SBOM:** no machine-readable SPDX/CycloneDX inventory.
3. **Independent transparency witness:** no external immutable/logged checkpoint.
4. **Hosted-builder provenance:** no independent SLSA-style builder attestation.
5. **Repository protection:** GitHub returned no repository rulesets; branch-protection status was not readable by this integration.
6. **Key lifecycle:** no rotation/revocation/hardware-backed custody.
7. **Total signer collusion:** if all three authorized role keys collude before the ceremony, SB-001 cannot prove an honest external reality.
8. **Availability:** denial-of-service and regional failure are not proved away.
9. **Confidentiality:** SB-001 is an integrity/authority experiment, not a confidentiality system.

## Promotion rule

Research BATs do not earn a SupaBardo repo by accumulation.

They make the first specimen harder to lie about.

Promotion still requires another meaningfully different real crossing and should then attack the *difference* between specimens rather than simply replaying SB-001's assumptions.

## Current compact claim

> SB-001 is a destructible unresolved-crossing specimen whose historical evidence is cryptographically linked, whole-set pinned, policy-verified independently of signature validity, hostile to cross-role authority collapse and cross-ceremony substitution, and explicit about the security properties it does not yet possess.
