# Slice 003 — The Group Does Not Own the Member

**Status:** hostile research specimen / non-normative  
**Date:** 2026-09-29  
**Issue:** #5  
**Research neighbor:** [Groups, Administration, and Cloud Coordination — Early Source Packet](../docs/research/GROUPS-ADMINISTRATION-CLOUD-SOURCE-PACKET.md)

## Claim under pressure

A sovereign particular may participate in an administrable group without the group or its administrator becoming sovereign over that particular.

This slice does not add a group protocol, schema, runtime, cloud service, or authorization model.

It is a test specimen for future receiver work.

```text
GROUP != MEMBER
MEMBERSHIP != IDENTITY
MEMBERSHIP != CAPABILITY
ADMINISTRATION != SOVEREIGNTY
```

---

## The Gardeners

Assume four particulars:

```text
Gardeners   — a group-like particular with its own history
Alice       — delegated administrator of Gardeners membership
Bob         — a member of Gardeners; owner of World B
Carol       — candidate member
```

Assume a cloud coordination service:

```text
Cloud C
```

Cloud C can relay signed crossings, mirror addressed artifacts, distribute declarations, and surface receipts.

It does not own Gardeners, Alice, Bob, Carol, or World B.

---

## Event 1 — delegated administration

Gardeners has local law stating that Alice may propose or perform a bounded membership mutation.

Conceptually:

```text
Gardeners
  grants
Alice
  capability:
    administer membership relation
```

The capability does **not** imply:

```text
act as Bob
sign as Bob
mutate World B
inspect Bob's unrelated private state
rewrite Bob's local history
admit crossings into World B
delegate Bob's capabilities
```

Candidate law:

```text
ADMINISTRATION OF RELATION
!=
AUTHORITY OVER RELATED PARTICULARS
```

---

## Event 2 — Carol joins

Alice uses her bounded administrative authority to create or admit a change in the Gardeners membership history.

One possible future relation shape:

```text
Carol
  --member-of-->
Gardeners
```

That relation may become attributable.

It does not merge Carol into Gardeners.

```text
MEMBERSHIP != ABSORPTION
```

Carol retains her own identity, keys, local history, capabilities, and authority boundaries.

---

## Event 3 — Bob receives a Gardeners crossing

A crossing arrives at World B.

It carries enough information for Bob's receiver to identify the relevant group relation or policy input.

The safe path remains:

```text
crossing
  ↓
verify structural identity/signature
  ↓
RECEIVE
  ↓
HOLD
  ↓
resolve attributable membership/admin/policy inputs
  ↓
World B owner-local Organ Contract
  ↓
ADMIT | REFUSE | RETURN
  ↓
local consequence
  ↓
signed World B receipt
```

Gardeners does not get a secret bypass around `HOLD`.

Alice does not get one either.

Cloud C does not get one either.

```text
GROUP MEMBERSHIP != FORCED ADMISSION
ADMINISTRATION != FORCED ADMISSION
CLOUD DELIVERY != FORCED ADMISSION
```

---

## Event 4 — Bob leaves

At time `t0`, Bob is a member.

At time `t1`, Bob's membership ends.

The correct result is not:

```text
erase all evidence that Bob was ever a member
```

The historical relation remains reconstructible.

New decisions may treat it as ended.

```text
REVOCATION != HISTORY REWRITE
PAST MEMBERSHIP != PRESENT AUTHORITY
```

A receipt describing a consequence at `t0` may still validly name the then-current membership history.

A new consequence at `t2` must not silently pretend that old membership remains current if the receiver's declared causal inputs include the later revocation.

---

## Event 5 — stale administrative state

Now introduce the dangerous ordering:

```text
t0  Bob is a Gardeners member
t1  Bob membership ends
t2  Gardeners emits a crossing meant for current members
t3  World B evaluates the crossing
```

Suppose World B can see the `t2` crossing but its available group projection is still at `t0`.

There are several locally legitimate policies:

```text
A. refuse until membership state reaches a required cut
B. HOLD until newer evidence arrives
C. admit under an explicitly declared stale-tolerant policy
D. return for clarification
```

What is not acceptable is hiding the dependency.

A reconstructible receipt should eventually be able to answer:

> Which exact membership / administration / policy history did this decision consult?

Research-only candidate:

```text
decision causal inputs
  ├─ membership_cut_ref
  ├─ administration_cut_ref
  └─ policy_cut_ref
```

No global latest cut is required.

Attribution is.

```text
GLOBAL LATEST != REQUIRED
DECLARED CAUSAL INPUT != OPTIONAL
```

The second line is a candidate pressure, not yet protocol law.

---

## Event 6 — cloud outage

Cloud C goes offline.

What may stop:

- fresh relay;
- discovery;
- cloud-hosted mirrors;
- cloud-hosted administrative UI;
- propagation of new membership changes;
- remote observability.

What must not automatically disappear:

- World B;
- Bob's retained local history;
- already retained crossing bytes;
- locally retained verification material;
- locally reconstructible receipts;
- Gardeners history retained outside Cloud C;
- the distinction between old facts and unavailable new facts.

```text
CLOUD DOWN
!=
WORLD GONE

UNAVAILABLE CURRENT EVIDENCE
!=
PERMISSION TO INVENT CURRENT EVIDENCE
```

A receiver may HOLD or REFUSE when required current administrative evidence is unavailable.

That is safer than treating coordinator availability as sovereignty.

---

## Event 7 — cloud resurrection

Cloud C returns with newer information.

The receiver may discover:

```text
membership cut M2
administrative cut A4
policy cut P7
```

Those inputs may change future local decisions.

They do not retroactively rewrite what World B actually knew and did under earlier cuts.

```text
NEW INFORMATION
!=
RETROACTIVE DIFFERENT HISTORY
```

A later interpretation can say an earlier decision was made under stale information.

It cannot truthfully say the earlier receiver consulted evidence it did not possess.

---

## Nested-group trap

Suppose:

```text
Gardeners
  contains relation to
Orchard Crew

Bob is in Orchard Crew
```

Do not automatically infer that every semantic effect attached to Gardeners propagates through every nesting relation.

SCIM can represent direct and indirect memberships, but it deliberately does not define authorization semantics for them.

reLATTE should preserve the stronger rule:

```text
NESTING != AUTHORITY INHERITANCE
TRANSITIVE MEMBERSHIP != TRANSITIVE CAPABILITY
```

If a receiver chooses transitive semantics, that is owner-local law unless and until a shared primitive is independently earned.

---

## Administrative-scope trap

Alice may manage the Gardeners membership relation.

That does not make the following valid:

```text
Alice → reset Bob's keys
Alice → alter Bob's World B admission law
Alice → mutate Bob's unrelated artifact history
Alice → sign a crossing as Bob
Alice → delegate Bob's personal capabilities
```

The distinction is analogous to systems where a group object can fall within an administrative scope without each member's full interior becoming administratively scoped.

Candidate law:

```text
GROUP OBJECT IN ADMIN SCOPE
!=
MEMBER INTERIOR IN ADMIN SCOPE
```

---

## Delegation trap

Suppose Gardeners delegates Alice authority to manage membership, and Alice delegates a narrower task to Carol.

The safe direction is attenuation:

```text
Gardeners admin capability
        ↓
Alice: add/remove members
        ↓
Carol: propose additions only
```

not amplification:

```text
Carol receives one delegated task
→ Carol becomes Gardeners sovereign
```

Candidate law:

```text
DELEGATION MAY NARROW
DELEGATION MUST NOT SILENTLY AMPLIFY
```

Macaroons are one neighboring precedent for contextually attenuated delegation, but this slice does not choose a credential format.

---

# Cloud Without Crown

The cloud role in this specimen is useful precisely because it is **not** sovereign.

Cloud C may eventually provide:

```text
DISCOVER
RELAY
MIRROR
STORE
SERVE
DISTRIBUTE POLICY
DISTRIBUTE MEMBERSHIP DECLARATIONS
DISTRIBUTE VERIFICATION MATERIAL
REPORT HEALTH
CHECKPOINT RECEIPTS
```

It may not derive:

```text
therefore ADMIT
therefore MEMBER INTERIOR IS MINE
therefore CLOUD HISTORY IS GLOBAL HISTORY
therefore OFFLINE WORLD DOES NOT EXIST
```

The architecture remains:

```text
coordination plane
      ↓
portable attributable inputs
      ↓
sovereign receiver
      ↓
local consequence
```

not:

```text
cloud control plane
      ↓
global semantic state
      ↓
obedient clients
```

---

# Hostile assertions

A future implementation touching group/admin semantics should be able to survive fixtures equivalent to these:

1. Alice is a valid Gardeners administrator but cannot mutate World B.
2. Carol is a valid Gardeners member but receives no unrelated Bob capability.
3. Bob's old membership proof cannot be replayed as present membership after a locally recognized revocation.
4. A crossing received under stale membership state cannot conceal which state informed the decision.
5. Cloud C can deliver a valid crossing but cannot turn `RECEIVED` into `ADMITTED`.
6. Cloud C outage does not erase locally retained history.
7. Nested group membership does not automatically imply transitive semantic authority.
8. Federation allows verification across domains without merging administrative authority.
9. Revocation changes future authority without rewriting historical occurrence.
10. A delegated administrator cannot spend the receiver's ambient authority merely because the administrator is recognized.

---

# What this slice earns

This slice earns one research conclusion:

> **A group should initially be treated as a particular with explicit typed relations, not as a container whose administration implies ownership of member interiors.**

It also earns one design question for R3–R7:

> **How does a receipt identify the causal administrative inputs actually consulted by a local admission decision without creating a required global state?**

It does **not** earn:

- `GroupV0`;
- membership verbs in a shared protocol;
- a capability format;
- a cloud service;
- transitive group semantics;
- a universal authorization model;
- a new receipt field.

Promotion remains gated by multiple independent donor/use pressures and executable hostile proof.

> **The group may coordinate the members. It may not consume them.**
