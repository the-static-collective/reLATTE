# SKYMIRROR-002 — two-phone passive optical bench

**Status:** IMPLEMENTED / SOFTWARE-VERIFIED / FIELD-UNVERIFIED. This is not a satellite link, laser experiment, or reLATTE admission proof.

This second experiment begins the first *physical* road toward SKYMIRROR: one phone displays a short data packet in deliberately slow black/white light, a passive household mirror redirects an image of the screen, and a second phone's camera samples the brightness at the center of the reflection and attempts to recover a checksum-valid payload.

It can run without cellular data, Wi-Fi, Bluetooth, servers, or any RF messaging **after both browser pages have loaded**. It uses cameras and screens already attached to the two phones. Whether a particular phone and browser can support the timing and brightness contrast is explicitly an empirical field question.

## Launch

These are static files, no dependencies, build tools, external APIs, trackers, uploads, or backends.

- **Two phones:** host this folder over **HTTPS** (any HTTPS-capable static host with these relative files unchanged). Load its `index.html` URL on both phones; you can then disconnect both phones' mobile data and Wi-Fi after the pages and modules have fully loaded, leaving the two browser tabs open. Select `Receive` on phone B and `Transmit` on phone A.
- **One local computer:** from this folder run `python3 -m http.server 8765`, then open `http://localhost:8765` in a browser on the *same computer*. This tests the interface but is not a two-phone field experiment.
- Browsers may restrict camera access in insecure origins. The MediaDevices camera API is normally available in HTTPS, localhost, and some file-origin contexts, but opening ES modules directly as `file://` can be restricted. **Do not rely on a copied `index.html` opened as a file**. See [MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).
- Keep both browser tabs **foregrounded and awake**. The app requests a screen wake lock where supported. It cannot control your device's automatic brightness, exposure, camera focus, or OS suspension.

## Physical setup

1. Place a normal mirror in a darkened room on a stable surface. Place **phone A** and **phone B** so B's camera clearly sees A's screen **reflected in the mirror**. This is safe indoor household mirror use, not sky-directed illumination.
2. Manually increase phone A's display brightness. On B select `Receive`, select the same timing (default **600 ms per chip**), allow rear-camera permission, and center the targeting crosshair on the large reflected screen rectangle.
3. Start camera capture on B. Next, on A enter a **very short** message such as `HI`, select `Transmit`, and keep both phones still throughout the whole flash sequence. A short packet is already slow: `HI` takes ~70 seconds plus a black lead-in.
4. On B, wait for `VALID CRC / <message>` or stop and export the capture. `VALID CRC` means optical framing and accidental-error check passed; **it does not authenticate a person, sender, device, signed reLATTE crossing, or local receiver admission**.
5. If it fails, examine recorded raw brightness values and chart. Move the camera closer to the reflected screen image, improve contrast, avoid changing lighting, and/or select slower matched timing. Every test should record failure as well as success, not silently reinterpret it.

**Safety:** no lasers, sky-directed beams, aircraft/satellite illumination, or radio transmission. The screen flashes approximately 1–2 times per second. Do not use around viewers with light sensitivity or photosensitive seizure risk. The experiment does not determine communications-law compliance for other implementations.

## Protocol — `skymirror.short-frame/v0`

Independent from normative reLATTE `TransportFrame`:

```
     visible leader = 20 fixed high/low chips
     byte[0]       = 0xA6 (magic)
     byte[1]       = 1..24 payload UTF-8 bytes
     byte[2..]     = payload bytes
     final 2 bytes = CRC-16/CCITT-FALSE of magic, length and payload

     each byte MSB first
     Manchester: bit 0 => chips 0,1; bit 1 => chips 1,0
     default chip duration 600 ms; selected 500, 600, 800 or 1000 ms
```

The receiver samples the mean luminance in the centered 16% camera crop at approximately 22 frames/sec, estimates a dark/light threshold from observed camera values, searches symbol phase against the 20-chip leader, then decodes the length, Manchester bits, and CRC. Inverted brightness polarity is supported. Sampling/threshold recovery is experimental, not a guaranteed clock recovery design. Random brightness patterns can occasionally appear to match a leader; CRC16 is an integrity check with nonzero accidental collision risk.

No actual signed reLATTE CrossingEnvelope is sent at this stage. Future signed-crossing optical adapters must transport the *whole* canonical bytes and invoke the existing signature verifier and LocalReceiver in their normal authority positions; CRC cannot substitute for signatures.

## Tests

```
node --test experiments/SKYMIRROR-002/protocol.test.mjs
node --check experiments/SKYMIRROR-002/app.mjs
```

12 executable Node tests include: known CRC vector, byte-exact encoding, UTF-8, sampling jitter, polarity inversion, different chip timing, truncated/weak signals, CRC tampering, malformed Manchester symbols, and bit rate estimates. A synthetic demo is available in the `Simulate` browser tab.

The tests simulate pixel brightness and sampling timing; **they do not prove phone camera, real mirror, browser camera permissions, display timing, or RF-free field delivery**. No real hardware was available to execute that field test.

## Evidence to preserve for first field specimen

The receiver's `Export measurement log` button saves a JSON file containing:

- UTC timestamp of export;
- local monotonic sample times and measured luminance only (not photos, audio, or video);
- configured chip duration;
- decoder status, byte array and decoded message if valid;
- statistics including contrast and leader errors.

For a substantive claim of physical receipt, retain **both phone models, browser/OS versions, conditions, visible mirror-path setup, transmitter text, settings, capture log, and any failure traces**. The log alone is self-reported and does not certify the optical path.

## Future gates

- **002A — physical packet:** camera receives a short checksum-valid packet through a mirror with raw light measurements archived and independent reproduction.
- **002B — signed bytes:** carry a real canonical signed reLATTE crossing, account for slow channel capacity via fragments and error correction, verify signature using the existing protocol, and obtain a receiver-local RECEIVE or HOLD receipt. Do not conflate carrier CRC with source authority.
- **003 — feasibility:** derive real mirror/retroreflector ray geometry, object orientation, aperture, photon budget, atmospheric losses, orbital ephemeris, tracking feasibility, and permission requirements before considering any skyward illumination.

**NON-COLLAPSE:** SCREEN != SATELLITE; RECEIVED LIGHT != ACCEPTED PACKET; CRC != SIGNATURE; TRANSPORT != AUTHORITY; SOFTWARE GREEN != HARDWARE GREEN.