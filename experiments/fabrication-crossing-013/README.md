# FABRICATION-CROSSING-013 — Three independent owner worlds, not printer control

This experimental reLATTE attachment inherits **DYNAMIC-INTERFACE-FIELD-001** LocalWorld and its real Ed25519 signing, independent door publication/grant/revoke histories, owner freshness checks, and read-only cold verifier. No changes to normative `src/`, `spec/` or `schemas/`. The remote trust anchors and machine owners are simulated, not authenticated printers.

## What this proves

A real native Static OS PRINT-013 proposal comes from:
```text
Native signed CAD crossing (R3_HOLD) → actual PrusaSlicer-held G-code
 → open-world PRINT-012 machine compatibility field
 → exactly three explicitly selected untrusted machine declarations
 → source-owned static-os.fabrication-request/v0, content ID (not signature)
 → this reLATTE local fabrication lab
```

The experiment creates three independent `LocalWorld` instances, each issuing native Ed25519 hash-linked owner history; a fourth independent world incarnates after the third loses its current door.

- **A**: FFF machine declaration, no verified filament → separately signed `R3_HOLD`.
- **B**: resin-family declaration, missing native adapter → separately signed `R3_HOLD`.
- **C**: virtual FFF declaration, local owner-issued one-use **propose-only** grant, door withdrawn → stale grant denied before native operation and separately signed `R3_HOLD`.
- **C reborn**: new independently signed world identity, same descriptive interface ID, new offer identity; only a separately issued fresh **propose-only** grant produces a signed local proposal-operation ticket. Old grant remains unusable. A separate signed `PROPOSAL_ONLY` decision follows.

The decision signer per node is a separately keyed simulated policy principal, not the same signer as `LocalWorld`; both public-key sets are independently pinned in the verification call. This avoids implying that receipt signer equals the native world owner merely because a JSON field labels it as such. A real printer-owner identity mapping, institutional trust, transport and independent remote witness remain unimplemented.

**All grants for machine motion, remote file transfer, heated tool start, filament consumption, actual printing and physical inventory are zero.** The source original reLATTE R3_HOLD remains intact; no new normative RemoteReceiver crossing is claimed for these simulated nodes. This is actual cryptographically signed local-world history, **not remote network transport**.

## To run against a source-owned actual fabricated request

From reLATTE repo root after the verified source crossing packet exists:

```sh
npm ci
node --test experiments/fabrication-crossing-013/tests/*.test.mjs
node experiments/fabrication-crossing-013/run.mjs /path/to/static-os-013-request.json work/fabrication-013
node experiments/fabrication-crossing-013/verify-run.mjs \
  work/fabrication-013/proof.json work/fabrication-013/trust-pins.json
```

A `trust-pins.json` written by the simulator documents the **lab-generated ephemeral signer keys**: it proves internal consistency only. Real node authentication would require externally issued trust anchors, independent identity establishment and a fresh owner-granted capability. A copied or content-hashed source request cannot prove its originating Static OS software ran: use the source-owned native cold verifier against original CAD and signed reLATTE artifacts. The multi-repo Static OS GitHub Actions workflow performs this sequence in one pinned checkout and distinct processes.

`verify-run.mjs` performs no machine connection or execution. It verifies signatures and hash-linked histories, active/withdrawn doors, fresh exact grants/ticket, reborn world identity, selected source and separate signing pins, and zero physical effect. Signatures attest software claims, not physical reality. Demo issued decisions are machine-simulation decisions, not legally or physically valid manufacturing agreements.

**Laws:** `DESCRIPTOR != MANUFACTURING CAPABILITY`; `ROUTE != OWNER SELECTION`; `SIGNED HOLD != GRANT`; `PROPOSE GRANT != PRINT GRANT`; `REINCARNATION != RESTORED GRANT`; `LOCAL TICKET != REMOTE EFFECT`; `SIGNED RECEIPT != PHYSICAL PART`; `JUBILEE INVENTORY != DIGITAL POSSIBILITY`.
