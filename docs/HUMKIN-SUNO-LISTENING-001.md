# HUMKIN × Suno × reLATTE — Listening Evidence 001

**Status: experimental review-only adapter; no live radio cutover, Suno polling service, MCP exposure, database migration, or public listening feed.**

## What exists

Suno's connected account tools support two distinct modalities for finished clips:

- `audio_analysis` yields sound-derived tempo/key/meter, section boundaries and labels, with availability/processing states.
- `audio_listen` yields an independent model's description of heard instruments, arrangement, and interpretation; `audio_listen_wait` returns the answer.
- `audio_lyrics_alignment` can locate words but **lyrics are not carried into this first evidence crossing**.

A short `suno.com/s/...` share code is not a Suno clip UUID. Resolve it through the owner's library or canonical song page before using analysis tools. No generic short-link parser or unrestricted Suno crawler is part of this adapter.

## Proposed first crossing

```text
HUMKIN recording (stable catalog recording_id + reviewed rights)
    -> Suno owner's authorized clip UUID
    -> audio_analysis + audio_listen
    -> independently separated measurement and interpretation
    -> owner-supplied capture (private until proven otherwise)
    -> strict inspection (no raw lyrics, tokens, play counts, AI authority)
    -> reLATTE signed digest-only crossing
    -> HUMKIN owner-local RECEIVE -> HOLD or REFUSE
    -> separately reviewed candidate tags and adjacency edges
    -> later, if approved, a minimal PUBLIC robot-readable projection
```

The module `src/suno-listening.ts` validates `humkin.suno-listening-capture/v1` and offers `deliverSunoListeningForReview`. Its crossing exposes a digest of the locally held evidence, not the raw Suno response. It uses the existing reLATTE P-256 crossing and durable receiver, and the receiver remains the independent signer of its disposition. A signature proves attribution to a key, not the truth of a model's observations.

**HOLD is not ADMIT.** Even a public Suno song is not approved automatically for HUMKIN broadcasting, quoted lyrics, public agent feeds, or agent remixes. Rights, source visibility, recording identity, public release, operator permissions, and actual broadcast status must be checked against HUMKIN's current authoritative catalog and field receipts.

## Radio and robot effects reserved for later adapters

The first slice authorizes **no** playlist updates, media writes, R2 publishing, Cloud Autopilot revisions, guest DJ audio, automated Suno generation, public listener counts, or claims about music actually heard by a listener. Future read-only robot endpoints should reuse the transmitter's real now-playing clock and expose provenance, recording identity, rights-checked tags, uncertainties, and recording-version references. Machine-generated interpretations stay proposals until reviewed.

HUMKIN's Radio House `recording_id` represents source identity, not Suno clip identity. One recording may have multiple source versions and belong to multiple stations; clips must be explicitly linked instead of equated by title.

## Safe local verification

```sh
npm install
npm run verify
```

The tests use **synthetic content**, not a user's private Suno library. They verify reject-on-extra-fields, UUID shape, false authority flags, signed RECEIVE/HOLD or REFUSE, replay idempotence, and no admitted or broadcast effect. Credentials must remain outside public repositories.

## Provenance and unknowns

Observed through the connected Suno tools on 2026-11-23: a library song was successfully described by `audio_listen` and analysed by `audio_analysis`. The separately supplied short share link could not be passed directly as the clip UUID. This does **not** prove Suno audience play counts or listen history are retrievable.

Source authority: HUMKIN `AGENTS.md`, `garden/intent.json`, `docs/RADIO-HOUSE.md`, and `core/contracts/recording.v1.schema.json`. reLATTE's local receiver and signed crossing remain the receiving transport, not a master radio database.

## Next explicit gate

Wire an owner-authenticated, private HUMKIN listening-capture intake to this adapter, verify recording ID and visibility against the catalog, then add a separately human-approved read-only public projection. Test as an isolated robot client before proposing any live TOWER or cloud changes.
