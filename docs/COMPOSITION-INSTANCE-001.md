# COMPOSITION-INSTANCE-001 — bounded worlds as composition runtimes

## Thesis

reLATTE does not merely carry artifacts into and out of foreign systems.

It may instantiate a bounded composition world, admit that instance for execution, allow composition to occur entirely inside it, then expose the resulting particular only as a fresh candidate crossing.

Minecraft vanilla is the first concrete runtime.

## Governing snapshot

This experiment is governed by the exact reLATTE snapshot that already survived the alien-substrate series:

```text
core commit:
f5cb7488bebc1a6e27fd458ad40af9b9b6f9e858

normative src tree:
c0e4d2c59481e0fb2a4bf4bb294f373907fd2b76
```

This is a snapshot address, not a permanent freeze.

Future composition-instance snapshots may evolve. Old instances remain replayable against the snapshot that governed them.

## Lifecycle

```text
CompositionInstanceSpec
        |
        | crossing
        v
INSTANCE
R3_ADMIT
        |
        | execute only within bounded runtime
        v
COMPOSITION WORLD
        |
        | author session
        | actions
        | runtime-local consequences
        v
FINAL RUNTIME STATE
        |
        | fresh distinct observer
        v
OBSERVED STATE
        |
        | candidate crossing
        v
R3_HOLD
```

The result cannot admit itself.

## Generic instance contract

The instance declares:

- runtime id
- base snapshot reference
- high-level goal
- admitted input references
- capability set
- resource / world limits
- observer policy
- requested output class
- governing reLATTE snapshot

The runtime may use any internal ontology.

The outer contract does not know Minecraft blocks, Linux syscalls, WASM instructions, Blender scenes, LemonPRESS pages, or any future runtime-specific primitive.

## Durable result evidence

A completed instance preserves:

- instance id
- launch crossing id
- runtime id
- author session id
- observer session id
- action-trace reference
- observed-state reference
- observed-state digest
- candidate content digest
- candidate byte length
- runtime claims
- forced result disposition: R3_HOLD

## First runtime: minecraft-vanilla

The existing VANILLA-WORLDBUILDER-006 is now executed inside CompositionInstance.

The instance admits bounded capabilities:

```text
minecraft.operator
minecraft.creative
minecraft.command.fill
minecraft.command.setblock
minecraft.command.summon
```

The runtime itself owns:

- Mojang server process
- server seed
- chunks
- OP state
- command semantics
- generated districts
- world blocks
- Mineflayer sessions

reLATTE owns none of those semantics.

After authorship, the OP author disconnects. A fresh non-OP client independently loads the world and scans the final bounded field.

That observed state becomes the candidate.

## Laws

```text
INSTANCE ADMISSION != RESULT ADMISSION
EXECUTION != ADMISSION
CAPABILITY != AUTHORITY
AUTHOR != OBSERVER
PLAN != OBSERVED STATE
OUTPUT != ADMISSION
INSTANCE DEATH != CANDIDATE DEATH
RUNTIME ONTOLOGY != RELATTE ONTOLOGY
COMPOSITION != SELF-ADMISSION
SNAPSHOT != FREEZE
CURRENT RULES != HISTORICAL RULES
```

## Claim boundary

A successful run may establish:

> A bounded executable world was instantiated under an addressable reLATTE snapshot, admitted only for execution, composed a new particular internally, was observed through a distinct fresh session, and exposed that result only as a held candidate crossing.

It does not establish:

- that every runtime can fit the contract
- open-ended AGI
- human-equivalent authorship
- trusted hardware isolation
- independent administration
- non-collusion
- global finality

Those remain outside the earned claim.
