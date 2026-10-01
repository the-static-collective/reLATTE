# Groups, Administration, and Cloud Coordination — Early Source Packet

**Status:** research neighbor map / no canon promotion  
**Date:** 2026-09-29  
**Context:** reLATTE Genesis; issue #5; receiver/runtime work remains downstream of the current R1/R2 identity/signature seam.

This note records external systems and research that pressure-test one newly surfaced reLATTE question:

> Can sovereign particulars form administrable groups and use cloud coordination without the group or the cloud becoming sovereign over the particulars?

It does **not** claim that reLATTE implements, extends, replaces, or is endorsed by any source below.

```text
NEIGHBOR != ANCESTOR
ANALOGY != PROOF
PRECEDENT != ADOPTION
REPRESENTATION != AUTHORIZATION
ADMINISTRATION != SOVEREIGNTY
CLOUD COORDINATION != LOCAL ADMISSION
```

---

## 1. Google Zanzibar — relationships, groups, and causal authorization state

**Source:** Ruoming Pang et al., "Zanzibar: Google's Consistent, Global Authorization System," USENIX ATC 2019.  
https://research.google/pubs/zanzibar-googles-consistent-global-authorization-system/

Zanzibar represents access control through relationships rather than by making every application invent its own isolated authorization store. One practical effect is that group-like relations can participate in access decisions without requiring the protected object and the group to become one object.

The more important pressure for reLATTE is causal consistency. Zanzibar was designed so authorization checks respect the causal order of ACL and object changes rather than accidentally combining a newer protected object state with stale authorization state.

reLATTE pressure:

```text
GROUP RELATION != GROUP OWNERSHIP
RELATION EXPANSION != AUTHORITY INHERITANCE
LATEST OBSERVED != GLOBALLY LATEST
DECISION SHOULD NAME THE HISTORY IT CONSULTED
```

reLATTE should not copy Zanzibar's global authorization service. The transferable question is narrower:

> Which membership / administration / policy state did this consequential local decision actually rely upon?

Candidate research-only references:

```text
membership_cut_ref
administration_cut_ref
policy_cut_ref
```

or one future generalized causal-input reference.

No field is proposed for a shared schema here.

---

## 2. RFC 7643 SCIM — group representation without authorization semantics

**Source:** RFC 7643, *System for Cross-domain Identity Management: Core Schema*, September 2015.  
https://www.rfc-editor.org/rfc/rfc7643.html

SCIM defines portable User and Group resources, including direct and indirect group membership. Critically, SCIM explicitly leaves the authorization consequences of group membership to the service provider.

That distinction is highly relevant to reLATTE:

```text
GROUP REPRESENTATION != AUTHORIZATION
MEMBERSHIP FACT != AUTHORIZED CONSEQUENCE
PORTABLE MEMBERSHIP SYNTAX != PORTABLE SEMANTIC LAW
```

A future reLATTE group surface, if one is ever earned, should preserve the same separation even more strongly because different receiver worlds may lawfully interpret the same membership relation differently.

SCIM is precedent for separating representation from meaning. It is not a candidate reLATTE group schema.

---

## 3. ARBAC97 — administration is a distinct authority problem

**Source:** Ravi Sandhu, Venkata Bhamidipati, Qamar Munawer, "The ARBAC97 Model for Role-Based Administration of Roles," ACM TISSEC 2(1), 1999.  
https://doi.org/10.1145/300830.300839

RBAC assigns permissions through roles. ARBAC97 asks the separate question: who may administer those assignments, permissions, and role relations?

Its importance here is structural rather than terminological. Administration of authority is not identical to possession of the underlying authority.

reLATTE pressure:

```text
MEMBER != ADMINISTRATOR
ADMINISTRATOR != OWNER
ADMINISTRATOR != EXECUTOR
ADMINISTRATION OF RELATION != SOVEREIGNTY OVER PARTICULAR
```

This supports a reLATTE design rule: any administrative power should be separately scoped and attributable instead of being inferred from membership, familiarity, or prior admission.

---

## 4. Microsoft Entra administrative units — scope the group object without swallowing member interiors

**Source:** Microsoft, "Administrative units in Microsoft Entra ID."  
https://learn.microsoft.com/en-us/entra/identity/role-based-access-control/administrative-units

Microsoft documents a useful concrete distinction: adding a group to an administrative unit brings the **group itself** into the administrator's management scope, but does not automatically bring the properties of every member into that same scope.

That yields a sharp hostile-control law for reLATTE:

```text
GROUP OBJECT IN ADMIN SCOPE
!=
MEMBER INTERIOR IN ADMIN SCOPE
```

An administrator may be authorized to alter a bounded membership relation while remaining unauthorized to mutate a member's world, keys, local state, unrelated capabilities, or semantic admission rules.

This is a neighboring implementation precedent, not a claim that Entra's directory model should be imported.

---

## 5. Open Policy Agent — decision and enforcement can be separated

**Source:** Open Policy Agent documentation, "How to Deploy OPA."  
https://www.openpolicyagent.org/docs/deploy

OPA explicitly distinguishes the component making a policy decision from the application component enforcing that decision, and recommends keeping decision points close to enforcement when reliability and latency matter.

The transferable reLATTE pressure is:

```text
POLICY DISTRIBUTION != POLICY DECISION
POLICY DECISION != ENFORCEMENT
ADMINISTRATION != ENFORCEMENT
```

For reLATTE, even a remotely administered or cloud-distributed policy should not bypass:

```text
RECEIVE
→ HOLD
→ owner-local Organ Contract
→ ADMIT | REFUSE | RETURN
```

A control plane may carry policy inputs. The receiver still owns consequence.

---

## 6. Local-first software — cloud assistance without cloud existence-ownership

**Source:** Martin Kleppmann, Adam Wiggins, Peter van Hardenberg, Mark McGranaghan, "Local-first software: You own your data, in spite of the cloud," Onward! 2019.  
https://martin.kleppmann.com/2019/10/23/local-first-at-onward.html  
DOI: https://doi.org/10.1145/3359591.3359737

Local-first work treats local operation, user control, collaboration, and long-term preservation as architectural goals rather than conveniences layered on top of a cloud-owned primary copy.

reLATTE already carries a stronger local-sovereignty candidate because receiver histories may remain semantically divergent.

The present pressure:

```text
CLOUD ACCOUNT != WORLD EXISTENCE
SERVER AVAILABLE != HISTORY EXISTS
RELAY AVAILABLE != LOCAL AUTHORITY
```

A cloud outage may pause discovery, relay, or new administrative mutations. It must not retroactively erase retained history or make a sovereign world cease to exist.

---

## 7. SPIFFE Federation — federation across administratively isolated trust domains

**Source:** SPIFFE, "SPIFFE Federation."  
https://spiffe.io/docs/latest/spiffe-specs/spiffe_federation/

SPIFFE defines trust domains as distinct administrative/security boundaries. Federation allows workloads from separate trust domains to validate one another by exchanging the material needed for authentication, while each trust domain remains under its own authority.

The useful reLATTE distinction:

```text
FEDERATION != MERGER
FOREIGN VERIFIABILITY != FOREIGN ADMINISTRATION
TRUST BUNDLE != SEMANTIC AUTHORITY
```

This is especially relevant if future reLATTE worlds or groups exchange verification material through cloud coordination. Learning how to verify a foreign identity does not make the foreign domain locally sovereign.

---

## 8. Macaroons — delegation that can attenuate instead of duplicate

**Source:** Arnar Birgisson et al., "Macaroons: Cookies with Contextual Caveats for Decentralized Authorization in the Cloud," NDSS 2014.  
https://research.google/pubs/macaroons-cookies-with-contextual-caveats-for-decentralized-authorization-in-the-cloud/

Macaroons demonstrate decentralized delegation in which credentials can accumulate caveats restricting where, when, by whom, or for what purpose authority may be exercised.

The transferable idea is not the macaroon token format. It is the direction of authority:

```text
DELEGATION SHOULD BE ATTENUABLE
DELEGATION != DUPLICATION OF SOVEREIGNTY
CAPABILITY FOR X != CAPABILITY FOR EVERYTHING
```

This reinforces reLATTE's existing confused-deputy / least-privilege pressure and gives future group administration a hostile requirement: delegated group administration should be narrower than the administrator's ambient identity.

---

# Cross-source synthesis

The sources converge on several separations without requiring one shared architecture:

```text
group representation
!=
authorization semantics

membership
!=
identity
!=
capability

administration
!=
decision
!=
enforcement

federation
!=
merger

cloud coordination
!=
world existence
!=
local admission
```

That is compatible with the current reLATTE architecture because reLATTE already keeps portable crossing syntax separate from destination meaning.

A candidate conceptual shape is:

```text
                 CLOUD / COORDINATION PLANE

membership declarations     administrative declarations
policy/capability delivery  discovery / relay / mirroring
receipt storage             optional foreign witness

                         |
                  signed crossings
                         |
                         v

                   SOVEREIGN WORLD

                    verify
                      |
                   RECEIVE
                      |
                    HOLD
                      |
          consult attributable local inputs
                      |
             owner-local Organ Contract
                      |
           ADMIT | REFUSE | RETURN
                      |
                local consequence
                      |
                 signed receipt
```

The cloud may help make the doorway reachable and the administrative inputs available.

It does not become the destination's semantic sovereign.

---

# Candidate laws — not promoted

These are research statements to pressure-test, not protocol law:

```text
GROUP REPRESENTATION != AUTHORIZATION
MEMBERSHIP != IDENTITY
MEMBERSHIP != CAPABILITY
ADMINISTRATION != SOVEREIGNTY
GROUP OBJECT IN ADMIN SCOPE != MEMBER INTERIOR IN ADMIN SCOPE
ADMINISTER != DECIDE
DECIDE != ENFORCE
CLOUD COORDINATION != LOCAL ADMISSION
CONTROL PLANE != EXECUTION PLANE
CLOUD PRESENCE != WORLD EXISTENCE
FEDERATION != MERGER
REVOCATION != HISTORY REWRITE
PAST MEMBERSHIP != PRESENT AUTHORITY
```

---

# Why not `GroupV0` yet?

The word `group` carries too many materially different structures:

- social affiliation;
- access-control set;
- administrative scope;
- peer/node membership;
- observer cohort;
- execution pool;
- project team;
- temporary gathering;
- nested relation set.

Promoting a generic shared schema now would risk making accidental equivalence look like protocol law.

The safer candidate is:

```text
PARTICULAR
   |
   +-- typed relation --> GROUP PARTICULAR
```

Then actual semantics remain owned by explicit contracts.

Possible future relation verbs such as these remain **specimens only**:

```text
PROPOSE_MEMBERSHIP
ACCEPT_MEMBERSHIP
END_MEMBERSHIP

DELEGATE_ADMINISTRATION
REVOKE_ADMINISTRATION

ISSUE_CAPABILITY
ATTENUATE_CAPABILITY
REVOKE_CAPABILITY
```

Coffee already showed why a useful relation vocabulary should not be promoted after a single pressure source.

---

# Stale authority is the central hostile question

The sharpest technical problem exposed by this research is not "how do we put groups in the cloud?"

It is:

> What exact administrative history did a receiver rely on when it made a consequential decision?

Suppose:

```text
t0: Bob is in Gardeners
t1: Bob is removed from Gardeners
t2: a crossing arrives that would have been admissible to Gardeners members
```

A receiver that evaluates `t2` against a stale `t0` view may produce a consequence that current local law would not have admitted.

reLATTE does not need one global latest state to make that event inspectable.

It does need enough causal evidence to say which state was consulted.

Candidate future receipt pressure:

```text
decision_inputs:
  membership_cut_ref?
  administration_cut_ref?
  policy_cut_ref?
```

or a more general content-addressed causal-input set.

Nothing here earns those fields yet.

---

# Cloud Without Crown

A reLATTE-compatible cloud layer may eventually provide:

- group discovery;
- signed membership-change transport;
- administrative delegation transport;
- policy/capability distribution;
- asynchronous relay;
- mirror/store/serve functions;
- observability;
- optional checkpoint/witness functions.

It must not silently acquire:

- member private keys;
- semantic admission authority for sovereign receivers;
- ownership of local histories;
- power to rewrite historical membership;
- authority merely because it is online;
- authority to make a dead/unreachable coordinator equivalent to a dead world.

Candidate failure test:

```text
CLOUD DOWN
!=
WORLD GONE
```

---

# Promotion gate

Do **not** add a shared group/admin schema or protocol primitive because this note exists.

Promotion requires at least:

1. pressure from two materially different donor/use families;
2. a concrete hostile fixture where the distinction affects correctness;
3. evidence that the relation cannot remain owner-local or an extension field;
4. explicit authority and replay semantics;
5. a compatibility story for existing v0 crossings/receipts;
6. proof that the primitive does not smuggle semantic sovereignty into the substrate.

Until then:

> **Research the group. Do not crown it.**

