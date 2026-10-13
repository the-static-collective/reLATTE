# RELAY-001: native GHoT evidence through reLATTE RECEIVE and HOLD

This branch proves the third organ in the Great Static Relay without transporting or publishing the original MP3.

## Exact workflow
- LOADOUT `BIND` gates `media.probe` through its explicit `filesystem.read` / `process.spawn.ffprobe` effect fence.
- GHoT emits a local `ghot.task` and unsigned `ghot.receipt`.
- The new adapter checks all five donor records, their exact bytes, task lineage, GHoT's own output hash, LOADOUT parameter digest, and optional source MP3 SHA-256 **before** creating a crossing.
- Native reLATTE `runOpaqueOrganRoundTrip` signs the crossing, carries a file bundle, signs a `RECEIVED` receipt, and signs a receiver-local `R3_HOLD` disposition.
- Fresh-process verification validates signatures, file-transport integrity, all donor hash addresses, and absence of admission. Idempotent replay keeps the same exact crossing and disposition receipts.

## Local runner (pinned source checkouts)

```sh
node --experimental-strip-types scripts/relay001-ghot-hold.mjs \
  /path/to/native-song-evidence /tmp/relay001-relatte \
  '/path/to/Blue Night Morning Bloom.mp3'

node --experimental-strip-types scripts/relay001-ghot-hold.mjs \
  verify /path/to/native-song-evidence /tmp/relay001-relatte/public
```

The output directory divides public artifacts from `private-receiver` storage. **Never publish private-receiver**: it contains a local signing key and receiver journal. The `public` directory contains only records/receipts and source addresses; note that the public receipts and local original donor files may expose source file paths and metadata and should be inspected before distribution.

GitHub Actions runs three pinned source checkouts against a synthesized 0.25-second WAV; no user music or private evidence is uploaded.

## Strict distinction
- ReLATTE signatures authenticate the new sender and receiver instance generated for this experiment. They do **not** establish human identity, external authorization, source truth, ownership, or deployment.
- A GHoT receipt is not automatically signed merely because its derivative is carried in a signed envelope.
- `RECEIVED` and `HOLD` both have `semantic_effect: none`; no media is published, admitted to canon, or executed by the receiver.
- The user-provided Blue Night Morning Bloom audio stays local.

The source song digest is `sha256:6ae3a6916c6214f7582da048246596d36a6cf355effe1dd68c47d685fef3acc6` and should be independently verified when running locally.

The public CI source carrier (native reLATTE runtime and installed canonicalization dependency) can support an exact-song local replay without network access.
