# SKYMIRROR-001 — passive optical road

**Status:** local offline software specimen; not an optical field demonstration and **not** an orbital communication link.  
**Owner:** isolated experiment under reLATTE; no modification to normative protocol, LocalReceiver, or transport contracts.

## The proposition

Use physical reflectors as replaceable signal paths. The first test transports opaque bytes by a Manchester-coded *model* of high/low light states. It deliberately keeps an already-signed payload unchanged. The carrier never signs, interprets, admits, or grants authority.

```text
opaque signed payload bytes
  -> SM01 frame + CRC32
  -> Manchester optical symbols
  -> simulated passive reflection + optional faults
  -> decode + CRC32
  -> identical bytes or explicit rejection
  -> upstream cryptographic verification and receiver-local decision (not implemented here)
```

## Execute

Node.js 20+ recommended:

```bash
node --test experiments/SKYMIRROR-001/skymirror.test.mjs
node experiments/SKYMIRROR-001/demo.mjs
```

No installation, network, external light device, or RF emitter required.

## Wire format, model boundaries

- 4-byte ASCII magic `SM01`.
- 4-byte unsigned big-endian payload length (maximum 4096 bytes).
- Raw opaque payload bytes, with no JSON parsing or semantic mutation.
- 4-byte CRC32 of preceding header and payload.
- Most-significant bit first; Manchester pair `0 -> 01`, `1 -> 10`.
- Receiver requires chip timing and byte-frame alignment supplied out-of-band; synchronization acquisition is **not** built.
- The CRC rejects accidental corruption; it is **not** authentication. A signed crossing still needs real cryptographic verification by the owning protocol.
- This is not an implementation of reLATTE's existing `TransportFrame` schema. A future adapter may carry the existing complete, verified canonical crossing bytes without inventing a new crossing identity.
- `propagateChips` models bit flips and polarity inversion only. It does not simulate optics, camera exposure, ambient noise, timing drift, path loss, weather, or orbital tracking.
- The orbital helper is ray geometry only. It has no TLE/ephemeris, pointing model, reflective-area estimate, photon budget, legal clearance, or actual satellite connection.

## What the tested result means

The test signs opaque data with an actual P-256 key, passes the original bytes through the model, and verifies the same signature on recovery. That demonstrates the **transport can preserve a signed traveler**, not that it used reLATTE's own signature profile or completed a LocalReceiver event.

The tests distinguish a corner-cube retroreflector (returns light toward source) from an ideally oriented specular reflector (can send light toward a second destination). An available object is not necessarily an available relay.

**Invariant:** ROAD CHANGE != CROSSING CHANGE; REFLECTION != PERMISSION; CRC != SIGNATURE; DELIVERY != ADMISSION.

## Practical rate warning

The framing overhead is 12 bytes and each data byte uses 16 brightness chips. At **4 chips per second**, a 2-byte payload takes **56 seconds**, assuming perfect sync and no retries; a 20-byte payload takes **128 seconds**. This design prioritizes falsifiable correctness over throughput. A camera-to-screen field decoder, clock acquisition, redundancy/error correction, and short-message transport framing are future steps.

## Safe field progression

1. Complete the offline byte-integrity and fault tests (this specimen).
2. Next: two ordinary phone screens/cameras or an enclosed low-power LED/photodiode pair, with a short local reflected path, local property permission, no sky-directed beam, and no lasers.
3. Measure exposure, ambient illumination, bit timing, losses, retries, and signed crossing replay separately.
4. Model optical pointing, target geometry, motion, photon budget, and applicable permissions before **any** outdoor or orbital illumination.
5. **No satellite targeting or sky-directed optical transmission is authorized by this experiment.**

## Legal / scientific boundary (U.S.)

No broad 'unregulated space channel' has been established. FCC radio rules, laser safety, FAA aircraft-safety concerns, property rights, optical spectrum issues, and spacecraft operator constraints require review for a particular deployment. An unpowered mirror does not make an unlawful transmitter lawful. Local simulations and screen-to-screen tests do not prove orbital permission.

Official reference starting points:
- NASA Project Echo, a **radio-wave** passive satellite communications demonstration: https://www.nasa.gov/image-article/august-1960-project-echo-launched/
- NASA LAGEOS passive reflector, designed for satellite laser ranging and returning light to its origin: https://earth.gsfc.nasa.gov/geo/missions/lageos
- FAA Advisory Circular 70-1B, *Outdoor Laser Operations*: https://www.faa.gov/regulations_policies/advisory_circulars/index.cfm/go/document.information/documentID/1040741

## Exit gate for SKYMIRROR-002

Produce an actual screen/camera capture of an encoded short packet across a safely contained mirror path; archive raw light measurements, decoding uncertainty, and independent reconstruction. If a camera cannot recover the packet repeatably, HOLD. Do not advance directly to satellite illumination.
