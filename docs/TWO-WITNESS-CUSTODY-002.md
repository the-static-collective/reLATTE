# TWO-WITNESS-CUSTODY-002

## Purpose

Upgrade the two-witness model from **key distinctness** to a stronger, bounded custody witness.

The experiment uses three separate ephemeral CI runners:

```text
RUNNER A
  signs source crossing
  exports public evidence only
       |
       | artifact broker
       v
RUNNER B
  receives A's public carrier
  generates fresh receiver key
  signs receiver witness
  exports public evidence only
       |
       | public artifacts
       v
RUNNER C
  possesses neither private key
  re-verifies both signatures
  reconstructs corroboration
  runs hostile mutation checks
```

## What this can establish

Within one CI run, the proof demonstrates:

- distinct sender and receiver machine fingerprints;
- receiver execution occurs after sender completion;
- sender private key never appears in the transported artifact;
- receiver private key never appears in the transported artifact;
- source and receiver signatures bind the same handoff;
- a third process can reconstruct `CORROBORATED` from public evidence alone;
- third-party tampering of either witness falls to `HOLD`.

## What it cannot establish

This is still deliberately narrower than "two independent humans."

```text
SEPARATE RUNNERS != SEPARATE HUMANS
SEPARATE RUNNERS != NON-COLLUSION
HOST FINGERPRINT != HARDWARE ATTESTATION
CORROBORATION != TRUTH
CORROBORATION != ADMISSION
```

GitHub remains the shared orchestration and artifact-broker environment.

The test therefore earns a stronger claim than distinct keys alone:

> **machine-separated, non-transferred signing custody inside one brokered run**

It does not earn social, organizational, or metaphysical independence.

## FatherHand consequence

A founding handoff may now be tested at three evidentiary levels:

```text
1. SOURCE ONLY
   CLAIMED

2. SOURCE + MATCHING DISTINCT SIGNING KEY
   CORROBORATED
   independence basis:
   DISTINCT_SIGNING_KEYS_ONLY

3. SOURCE RUNNER + RECEIVER RUNNER + THIRD-PARTY REPLAY
   CORROBORATED
   custody evidence:
   MACHINE-SEPARATED / PRIVATE KEYS NOT TRANSFERRED
```

The edge remains the witnessed object.

Neither endpoint constitutes the entire relation by itself.
