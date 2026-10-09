# TRANSPORT-COMPOSITION-001 — The Many Roads Machine

**Status:** Executable, simulation-only adapter composition, stacked on the VM-004 branch.  
**Normative reLATTE crossing, signing, LocalReceiver, and VM-004 authority remain unchanged.**

## Core experiment

A single signed reLATTE crossing is canonicalized to UTF-8, split into
bounded independently hash-checked fragments, and transported in arbitrary
order over several **simulated** carrier channels. The receiver retains a
signed, local observation for each arrival, reconstructs only when every
fragment is present and the complete canonical bytes verify, and never
treats a route receipt as a RECEIVE or ADMIT.

This establishes an *application-level transport composer*, not a new
radio modem, Bluetooth stack, Wi-Fi mesh routing system, phone-line
controller or physical network.

```text
 source: reLATTE signed CrossingEnvelope v0
                     |
      canonical JCS bytes + SHA-256
                     |
          signed-crossing manifest
          exact transfer ID
                     |
        bounded fragment packeting
                     |
    +----------------+------------------+
    |                |                  |
  Bluetooth       telephone          Wi-Fi mesh
    |                X                  |
    +----------------+------------------+
                     |
        fragment #1 missing (INCOMPLETE)
                     |
          Wi-Fi Direct recovers #1
                     |
         +-----------+-----------+
         |                       |
     per-route signed       reassemble all
     OBSERVED receipts      canonical bytes
         |                       |
         +-----------+-----------+
                     |
          crossing hash AND
          P-256 crossing signature
                     |
          RECONSTRUCTED
                     |
       only explicit owner-local
          LocalReceiver.receive()
                     |
         RECEIVED != ADMITTED
```

## Exact transport primitive

Source material is a valid, signed `relatte.crossing-envelope/v0`.

`createCrossingFieldManifest(crossing,chunkSize)` binds:

- original signed `crossing_id`;
- SHA-256 of canonical crossing JSON;
- exact byte length, fragment size and count;
- deterministic domain-separated content-addressed `transfer_id`.

`makeCarrierFragment` binds each fragment to transfer ID, carrier type,
claimed route ID, index, count, exact bytes, fragment SHA-256, claimed
send timestamp, and domain-separated packet ID. Route IDs are **not**
trusted cryptographic physical hop attestations. No packet can alter
source `crossing_id`.

The receiver independently checks packet fields, size, content hash,
content-addressed packet ID, transfer binding and caller-specified
allowed-carrier list. It records one P-256 signed owner-local Receipt v0
with `kind: TRANSPORT_FRAGMENT_OBSERVED` and `semantic_effect: none`.
A packet that is received on two different claimed routes gets separate
observation receipts. A duplicate does not count as a new fragment.

Only after all parts arrive does the receiver independently check
complete byte count, canonical SHA-256, JSON canonicality, matching
crossing ID and the original P-256 signature.

`CrossingFieldReceiver.reconstruct()` returns:

- `INCOMPLETE`: a precise list of missing fragment indices;
- `HOLD`: malformed, altered, contradictory or explicitly disallowed data;
- `RECONSTRUCTED`: verified original crossing, still **not** R3 RECEIVE.

The only bridge to local reLATTE authority is explicit
`receiveLocally(LocalReceiver, timestamp)`, which calls the existing
`LocalReceiver.receive()`. R3 disposition is a separate owner-local
decision. A local owner can HOLD a successfully reconstructed crossing.

## Experimental carrier profiles

The profile limits below are **application packet payload maxima in
this experiment**, not physical MTU, real-world throughput guarantees,
regulatory authorization, or claims that a real modem exists.

| Carrier | Maximum fragment bytes | Executed by 001? |
| --- | ---: | --- |
| Bluetooth | 512 | simulated |
| Wi-Fi Direct | 8192 | simulated |
| Wi-Fi mesh | 8192 | simulated |
| Telephone/audio modem | 256 | simulated |
| Cellular SMS | 120 | simulated |
| Unlicensed LoRa | 96 | simulated |
| Internet | 8192 | simulated |
| Removable file courier | 8192 | simulated |
| Amateur radio | **0** | hard-denied for crossing bytes |

The amateur-radio profile intentionally carries **no crossing bytes**:
this experiment cannot decide whether arbitrary source content is lawful
to relay over a licensed service. US amateur radio has non-obscuration,
station-identification, and service-purpose limitations. An eventual
amateur profile requires independent legal/operational review,
explicitly allowed message types, licensed operators and no automated
arbitrary private/commercial traffic. Even unlicensed radio requires
device/regional rules and duty-cycle/airtime constraints.

The caller's `allowed_carriers` list is simulation policy, *not*
physical radio, network or regulatory permission.

## Evidence semantics

Each OBSERVED receipt is cryptographically verifiable against a separately
pinned observer public key and exactly one packet ID, but it only proves
that the named key **reported** an arrival. It does not prove RF hardware
actually received a packet, which frequency carried it, which person
operated the station, or whether an intermediate relay fabricated a
route label.

```text
ROUTE NOTE != MEASURED ROUTE
CARRIER PERMISSION != EXECUTION PERMISSION
TRANSPORT DELIVERY != R3 RECEIVE
R3 RECEIVE != R3 ADMIT
VERIFIED CONTENT != TRUSTED ORIGINATING PERSON
DUPLICATE CONTENT != DUPLICATE AUTHORITY
```

Malformed or contradictory data causes receiver-global HOLD. This
fail-closed demo is intentionally susceptible to denial of service by
an attacker who can inject a bad packet. Future versions need
bounded per-route quarantine, independent trusted identity admission,
and proofs that do not let one untrusted road poison all unrelated work.

The 001 receiver is in-memory only; verified content can be
reconstructed again if its packets are saved, but it does **not** yet
provide crash-safe durable fragment persistence or source-level
retransmission scheduling.

## Run locally

At repo root on Node 22+ with dependencies installed:

```bash
npm install --ignore-scripts
npm run verify
node --experimental-strip-types test/transport-composition.test.ts
node --experimental-strip-types scripts/transport-composition-001.mjs /tmp/transport-composition-001
```

The demo prints `verified:true`, lists simulated carriers and notes
`actual_hardware_transmissions:0`. A public `witness.json` contains
the original crossing ID, transfer ID, signed arrival receipts,
a separate owner-local RECEIVE receipt and an explicit `admitted:false`.
No source or owner private keys leave the demonstration process.

Run the dedicated workflow
`TRANSPORT-COMPOSITION-001 multi-road cold witness` for a reproducible
CI witness artifact.

## Test coverage

- packet carrier switching while preserving one signed crossing ID;
- interrupted fragment with exact missing list and a different recovery road;
- repeated arrival from a second road logged without duplicate authority;
- reconstructed crossing independently verified against the original;
- explicit RECEIVE, then owner-local HOLD, never inferred ADMIT;
- corrupt packet rejected even if other valid paths remain;
- fully self-consistent replacement fragment rejected as conflict;
- false manifest, foreign transfer ID and unauthorized carrier denied;
- per-carrier bounded payload size and amateur-radio payload denial;
- pinned observer-key check; validly signed altered authority claim denied.

## 002 frontier: real adapters

### Phones first

A phone-to-phone version should start with a **single manual local
transport**, using Bluetooth Low Energy for discovery/control or a
supported Bluetooth data channel, and Wi-Fi Direct or a local Wi-Fi
connection for larger signed artifacts. Device-specific Android
permissions, discovery and compatibility must be checked on real
phones. Native apps and real link tests are outside 001.

### Then multi-hop

Add native Wi-Fi mesh/peer relay where actually supported, or route over
existing mesh protocols without assuming Android automatically forwards
traffic. Store-and-forward must persist fragments and receive
observations durably.

### Then real telephony

Experiment with audible data modulation over consenting test phones and
an actual compatible call/audio path. Verify resampling, echo cancellation,
packet loss and rate limits before claiming modem-grade throughput.
Analog POTS and VoIP lines behave differently.

### Then lawful low-rate radio

Introduce approved region-specific unlicensed radio adapter(s) with
explicit channel rules, transmit power, duty limits, measured packet
size and hardware status. Keep licensed amateur radio a separate,
non-general-purpose profile with authorization and message limits.

### VM-004 integration

A reconstructed VM-004 signed OFFER may be forwarded as a crossing
without authorizing the guest. The destination must still carry out
pinned peer key verification, independent R3 RECEIVE / ADMIT, issue
a valid one-use grant, validate its live journal, then witness execution.
A transport fragment or delivery receipt can never mint those capabilities.

The long-term aim is portable identity and signed observable evidence
across many roads—without any route becoming a sovereign authority.
