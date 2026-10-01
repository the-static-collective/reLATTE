# Sovereign Nodes 001 — R4/R5 Plan

## Goal

Earn the two-node and divergent-receiver proofs without introducing a shared mutable database.

## Required proof

- A creates one signed crossing.
- B independently verifies and receives it.
- B emits signed RECEIVE and disposition receipts.
- A independently verifies B's returned response.
- B and C use separate receiver roots, keys, journals, state refs, and histories.
- The exact same crossing is sent to B and C.
- B ADMITs.
- C REFUSEs.
- Both responses remain valid.
- Both histories reconstruct after restart.
- Source verification does not require receiver journal access.
- Cross-wired or mutated response bundles fail verification.

## Response boundary

Return only signed receipts plus declared receiver identity.

Do not make the response bundle a new semantic authority.

## Stop condition

Do not implement HTTP, relay discovery, transport replacement, shared persistence, or consensus. Those belong to later milestones.
