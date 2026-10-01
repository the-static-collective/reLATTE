# Mirror / Store / Serve 001 — R7 Plan

## Goal

Earn the bounded R7 proof by killing a source after independent mirrors have retained its signed crossing and publication claim.

## Required proof

- source signs one crossing;
- source signs a distinct PUBLISHED claim with the same key;
- two independent mirrors retain the same canonical crossing object;
- each mirror signs its own STORED claim;
- both mirrors converge on the same object address without shared mutable state;
- mirror-local STORED receipts remain cryptographically distinct;
- source directory is deleted;
- one mirror is also deleted;
- surviving mirror reopens from disk and verifies retained material;
- surviving mirror reconstructs the original signed crossing;
- surviving mirror signs SERVED;
- fresh receiver signs RECEIVED;
- reconstructed crossing still names the dead source;
- mirror never becomes source;
- all four claim kinds remain distinct.

## Non-collapses

```text
PUBLISHED != STORED
STORED != SERVED
SERVED != RECEIVED
MIRROR != SOURCE
RETENTION != OWNERSHIP
RECONSTRUCTION != SUCCESSION
```

## Stop condition

Do not claim source-key recovery, dead-node authority inheritance, quorum replication, remote discovery, or R12 mortality completion.
