# AUTOMATIC FAILOVER 001 — Change the Road, Not the Traveler

**Status:** executable ordered-failover witness  
**Date:** 2026-10-02  
**Depends on:** [MORTAL ROAD 001](MORTAL-ROAD-001.md)

## Question

Can local transport policy react to the death of one discovered DWN road, preserve that failure as attributable evidence, move to another advertised road, recover the same signed crossing, and still leave semantic authority entirely with the eventual receiver?

AUTOMATIC FAILOVER 001 makes that path executable.

```text
ordered local policy
      |
      v
try DWN A
      |
      X
failure observation
      |
      v
try DWN B
      |
      v
same signed crossing
      |
      v
LocalReceiver
      |
   RECEIVE
      |
   REFUSE
```

## Policy is explicit

The policy is deliberately narrow:

```text
ordered-first-readable/v0
```

The caller provides an ordered list of already-discovered candidate IDs and the record identity expected on each transport node.

The policy does not rank global truth, quality, trust, or authority.

It answers one local operational question:

> Which declared road should I try next if the previous one cannot return the expected traveler?

## Failure is retained

A failed attempt becomes:

```text
relatte.road-attempt/v0
```

with candidate identity, selection identity, endpoint, record identity, attempt index, failure class, and `semantic_effect = none`.

The failed candidate is not deleted from discovery history.

```text
FAILURE OBSERVED != ROAD ERASED
FAILED ROAD != FAILED HISTORY
```

A future observation could find that road healthy again.

## Integrity failures do not silently fail over

Transport unavailability may trigger the next declared road.

Cryptographic or crossing-identity drift may not.

If a road returns malformed, non-canonical, cryptographically invalid, or unexpected crossing identity, failover stops with:

```text
FAILOVER_INTEGRITY_FAILURE
```

This prevents availability policy from becoming an excuse to route around evidence of possible tampering.

```text
AVAILABILITY FAILURE != INTEGRITY FAILURE
```

## The live witness

The witness:

1. publishes a locator DID advertising DWN A and DWN B;
2. writes one signed crossing to A;
3. replicates the verified crossing to B;
4. physically stops A;
5. invokes automatic failover with ordered policy `[A, B]`;
6. records A as failed;
7. automatically selects B next;
8. recovers the expected crossing from B;
9. hands it to a fresh LocalReceiver;
10. verifies RECEIVE still has no semantic effect;
11. independently REFUSEs the crossing.

## What this earns

AUTOMATIC FAILOVER 001 proves:

- transport policy can be local and explicit;
- one failed road can trigger selection of another advertised road;
- failure remains an attributable observation;
- failover preserves signed crossing identity;
- failover creates no admission;
- road substitution does not transfer authority;
- a fresh LocalReceiver still decides independently after failover;
- integrity mismatch aborts rather than silently continuing.

## What this does not earn

This does not prove:

- latency or reputation based routing;
- probabilistic health scoring;
- automatic mutation of the DID document;
- consensus about which road is best;
- network-wide leader election;
- automatic admission;
- permission to ignore integrity faults.

## Laws

```text
FAILURE OBSERVED != ROAD ERASED
FAILED ROAD != FAILED HISTORY

FAILOVER != CONSENSUS
ROAD CHANGE != CROSSING CHANGE
FAILOVER != AUTHORITY TRANSFER
RECOVERY != ADMISSION

AVAILABILITY FAILURE != INTEGRITY FAILURE
```

> **When a road closes, choose another road. Do not rename the traveler. Do not move the door.**
