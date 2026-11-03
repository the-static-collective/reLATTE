# WORLD-FORGE-006 — Native Signed Offer × Owner-Local HOLD/REFUSE

**Owner approved 2026-11-03.** Experimental, stacked on [005 draft PR #144](https://github.com/the-static-collective/reLATTE/pull/144). **No core reLATTE mutation.** The native P-256 and local-receiver APIs are imported unchanged from `src/`.

This deliberately separates four different propositions:

1. `WITNESS`: two official Minecraft worlds, each with actual author command traces and separate non-OP Mineflayer block observations.
2. `FORGE`: the bounded 005 extractor re-derives the two-verb candidate from exact raw donor evidence and the 005 Godot serialized scene report.
3. `SIGNED OFFER`: a fresh **ephemeral CI P-256 key** seals a native `relatte.crossing-envelope/v0` using the existing `sealOpaqueOrganCrossing` profile. A canonical reLATTE transport frame carries it as **review-only data**, with SHA-256 payload and ancestry references.
4. `RECEIVING WORLD`: two **separately provisioned fresh CI owner-local receivers** verify the native crossing and transport, re-derive the entire 005 evidence chain, and separately exercise local **HOLD** and **REFUSE**. Each has its own P-256 receiver signing key and verifies its three receipts: `RECEIVED`, `R3_HOLD` or `R3_REFUSE`, and `PAYLOAD_BYTES_VERIFIED`. The HOLD world quarantines exact bytes. The REFUSE world verifies then retains **no payload**. Both replay their own event journals after restart. A final aggregator verifies signatures and distinct local choices and explicitly refuses a global disposition.

**The receiving world does not run arbitrary code, grant execution, issue money/tokens, or admit the cartridge.** The `HOLD/REFUSE` decisions are test-configured local choices in two **synthetic owner worlds**. These tests do not claim that any third-party person consented.

## Run

```sh
npm install
node --experimental-strip-types --test experiments/world-forge-006/tests/cross.test.mjs
```

The full end-to-end GitHub Actions workflow is `.github/workflows/world-forge-006-native-offer-receiver.yml`:

- 005 unit/hostile checks plus 006 native crypto and receiver tests;
- two official, disposable Minecraft Java 26.1.1 servers and non-OP observers;
- 005 source-driven candidate extraction;
- 005 Godot 4.4.1 fresh sandbox reproduction and readback;
- 006 **separate** signing job, then separate receiver jobs for HOLD and REFUSE;
- 006 final two-receiver signed-receipt verification.

The CI jobs use Node 24 and the existing project's `src/protocol.ts`, `src/organ.ts`, `src/transport.ts`, and `src/receiver.ts`, unmodified. The outgoing source signer uses an ephemeral key that is **not exported**. Receiving-world private keys and quarantined bytes are stored in each runner's private workspace and **never uploaded** as artifacts. The public artifacts contain offer, public source key, source payload, receipt signatures, and summary reports.

## Crucial boundaries

- **No independently pinned real-world donor signer:** the **006** native signature proves cryptographic consistency of a *fresh CI-issued* crossing, not that PR #101's native original two-world source signatures were verified. The demo's sender key is self-attested, not a trusted third-party identity. No private key should be committed to Git.
- **No third-party real-world receiver permission:** the two new recipient instances in CI are locally controlled test worlds. Their HOLD and REFUSE decisions are generated from explicit per-job test policy, not real human choices.
- **No general skill learning:** the 005 cartridge knows only `REPLACE` and `RESTORE` within a strictly bounded visual-state material palette. Its reproduction uses a Godot saved-scene reader, not a live independent human witness or external act.
- **No global authority:** crossing verification != payload truth != admission; distinct local receivers may disagree without one overwriting the other's history.
- **No normative core transfer or automatic merge.** This PR must be reviewed along with stacked #144, #142 and #138 before any merge.

## Next source-native identity gate

Pin and validate the actual signer/source chain (including independent observer receipts) in [draft #101](https://github.com/the-static-collective/reLATTE/pull/101) instead of merely re-signing derived 005 evidence with a transient CI key. Introduce receiver-owned key policy with human attestation, while keeping HOLD/REFUSE private and free from automatic execution.

```
SIGNED != TRUE
RECEIVED != ADMITTED
HOLD != ADMIT
REFUSE != DELETE
WITNESS != GENERALIZATION != REPRODUCTION != PERMISSION
```
