# RIFF-RAFT-MINECRAFT-007 — TWO-LOCATION CUSTODY TEST

**Goal:** use two Git-tracked copies of actual signed 004 + 005 Minecraft results to test whether either remaining local source can independently reconstruct the signed crossing while the other evidence directory is absent.

## The concrete two-copy trial

- reLATTE primary Git file: `fixtures/riff-raft-minecraft-006/signed-005-return.bundle.json` (006 archived original).
- GHoT peer Git file: `fixtures/riff-raft-007/signed-005-return.bundle.json` (007 copied exact bytes).
- Shared complete source file SHA-256: `da6c556051f197e1d07578b5e435ae3b7132538c7c098a4add9e4acfd4572d42`.
- Original signed 004 and 005 source chain preserved, including real Mojang 26.1.1 game observations: A 3→5 powered lamps, B 6→2.
- Every native source crossing/receipt signature and state hash is independently rechecked using **reLATTE's own TypeScript P-256 verifier** in `experiments/riff-raft-minecraft-007/custody-audit.mjs` (alongside GHoT's independent Python OpenSSL-backed verification in the GHoT test).

### Three separate GitHub Actions jobs

`.github/workflows/riff-raft-minecraft-007.yml`:

1. **Both copies present:** read reLATTE + GHoT files from two real Git checkouts, require exact byte equality, recompute the fixed full-bundle hash, check both signed portable returns, independently replay native signed 004/005 source worlds and verify original observed causal traces.
2. **reLATTE data only:** do not check out the GHoT peer repository. Verify the full original signed source from reLATTE's surviving file.
3. **GHoT data only:** sparse-checkout reLATTE *verification code* without its primary evidence fixture; fetch GHoT peer evidence and replay the original signed worlds.

The GHoT peer's complementary workflow also creates two different ephemeral P-256 local receipts and deliberately partitions disposable local copies of one store or the other. This checks failure locality rather than inventing a successful remote outage.

## Strict limits

**The two GitHub repositories are under the same organization.** This tests two storage *locations*, not independently controlled administrators or power/network failure domains. CI does **not** take any GitHub repository offline. It only starts isolated runners without the other repository's evidence data or removes disposable local trial copies. No claims of ecological restoration, fresh Minecraft server execution, real land consent, organizational trust roots, physical custody of the bus, token issuance, financial ownership, or remote hardware actuation.

Cryptographic integrity must not be silently promoted to authority. Both old and current real-world dispositions remain **HOLD**.

```text
COPIES != INDEPENDENT ADMINISTRATORS
ABSENT LOCAL DATA != REMOTE SERVICE FAILURE
VERIFIED REPLAY != NEW PHYSICAL OBSERVATION
SIGNED HOLD != AUTOMATIC ADMISSION
```

The next genuine step is a separate administrator/provider or explicitly user-selected offline medium with separately authorized possession and receipts, not another automated signature in the same account.
