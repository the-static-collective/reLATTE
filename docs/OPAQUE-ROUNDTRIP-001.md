# OPAQUE ROUND TRIP 001

**Status:** generic substrate aperture candidate  
**Scope:** one signed opaque-organ crossing through file transport into LocalReceiver, followed by one receiver-local disposition.

## Purpose

This surface exists so donor systems can exercise a complete reLATTE crossing without importing reLATTE semantics into the donor and without adding donor-family branches to the substrate.

```text
opaque donor spec
      ↓
sealOpaqueOrganCrossing
      ↓
durable PREPARED checkpoint
      ↓
file transport frame
      ↓
bundle write/read + verification
      ↓
LocalReceiver RECEIVE
      ↓
signed RECEIVE receipt
      ↓
receiver-local disposition
      ↓
signed disposition receipt
      ↓
durable round-trip result
```

## Prepared checkpoint

The signed crossing and transport frame are durably written before delivery.

If execution stops after preparation, RECEIVE, or disposition but before the final result is stored, a retry reloads the same prepared crossing. LocalReceiver's idempotence then returns the original receipts where applicable.

```text
RETRY != NEW CROSSING
PREPARED != DELIVERED
DELIVERED != RECEIVED
RECEIVED != ADMITTED
```

## CLI bridge

`scripts/opaque-roundtrip.ts` accepts one JSON request on stdin and writes one JSON result on stdout.

The bridge contains no donor-specific vocabulary. Callers supply an ordinary `relatte.opaque-organ-spec/v0`, receiver identity, local paths, timestamps, route note, and requested receiver-local disposition.

## Result

The durable result contains:

- request identity;
- signed crossing;
- transport frame;
- signed RECEIVE receipt;
- signed disposition receipt;
- receiver snapshot;
- explicit substrate laws.

No receiver private key is returned.

## Non-claims

This helper does not make a donor artifact meaningful to the receiver. It does not imply admission, execution, semantic compatibility, or authority transfer.

```text
DONOR SEMANTICS != SUBSTRATE SEMANTICS
TRANSPORT != CROSSING
DELIVERY != ADMISSION
RECEIPT != AUTHORITY
GENERIC != UNIVERSAL
```
