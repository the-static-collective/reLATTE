# POLYGLOT-CROSSING-001

## Status

Adapter-only experiment stacked on draft PR #67.

The normative reLATTE core is frozen at:

```text
commit: f5cb7488bebc1a6e27fd458ad40af9b9b6f9e858
src tree: c0e4d2c59481e0fb2a4bf4bb294f373907fd2b76
```

The crucible fails if the current `src/` tree differs from that frozen Git tree object.

## Question

Can one unchanged crossing grammar mediate several incompatible native identity models without learning their ontology?

The current six substrates are:

| substrate | native identity model |
| --- | --- |
| Git | commit / tree / blob DAG |
| filesystem | local file object plus exact bytes |
| SQLite | database file plus table row |
| HTTP | resource representation plus response metadata |
| signed JSON | canonical signed declaration |
| printable carrier | QR-compatible / printable carrier surface |

The final carrier is **not** physical custody evidence. No actual printing, scanning, human possession, or physical transfer has occurred.

## Hard laws

```text
INTERNAL MODEL != CROSSING MODEL
CONTENT IDENTITY != PARTICULAR IDENTITY
ADAPTER CLAIM != CORE AUTHORITY
LOCAL ADMISSION != DOWNSTREAM ADMISSION
TRANSPORT != CROSSING
SHARED BYTES != SHARED PARTICULAR
```

## Success condition

One exact byte payload is independently observed through all six native substrate models.

Each observation receives a different native identity.

Each hop then uses the already-existing reLATTE crossing envelope and signed receipt grammar.

Expected shape:

```text
Git
  |
  v
Filesystem
  |
  v
SQLite
  |
  v
HTTP
  |
  v
Signed JSON
  |
  v
Printable / QR-compatible carrier
```

For every edge:

- exact content digest is preserved;
- the local native identity is explicit;
- ancestry is the prior crossing ID;
- local disposition can differ from prior worlds;
- authority scope stays receiver-local;
- no capability is inherited merely from ancestry;
- the adapter-specific model lives in the crossing extension, not the normative core.

## Hostile cases

The initial crucible attacks:

1. adapter byte substitution;
2. native particular substitution under equal bytes;
3. receipt replay against another substrate crossing;
4. one-character printable carrier corruption;
5. source substrate deletion followed by public-only route reconstruction;
6. admission propagation by deliberately using different dispositions at adjacent hops;
7. normative-core accommodation by pinning the exact `src/` Git tree.

## Claim boundary

A passing local run may establish:

```text
six native substrate observations
one unchanged crossing grammar
zero normative src mutations
exact content preservation
distinct local native identities
signed hop evidence
public-only route reconstruction after local source deletion
```

It does not establish:

```text
universal interoperability
semantic equivalence across substrates
physical custody
independent administrators
human identity
global authority
all future adapters will fit
```

The meaningful empirical claim is narrower:

> Six materially different substrate identity models were adapted to one frozen reLATTE crossing core without adding substrate-specific normative primitives.
