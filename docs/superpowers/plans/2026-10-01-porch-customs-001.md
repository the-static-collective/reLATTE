# Porch 001 + Creative Customs 001 — Implementation Plan

## Goal

Prove this bounded claim:

> A sovereign ecology can publish how it wants creative crossings to approach, and a crossing can receive a signed WELCOME/HOLD/REFUSE customs receipt without that receipt becoming local admission.

## Required proof

- Porch is content-addressed.
- Porch identity includes WELCOME/HOLD/REFUSE/RETURN/RELEASE declarations.
- Unknown fields are rejected.
- A release offer without an explicit license reference is rejected.
- Matching COM⁵ crossing receives CUSTOMS_WELCOME with semantic_effect=none.
- Unknown grammar receives CUSTOMS_HOLD.
- Explicitly refused grammar receives CUSTOMS_REFUSE.
- Missing required non-authority receives CUSTOMS_REFUSE.
- Crossing/capsule mismatch is rejected.
- Customs receipt can be independently signed and verified.
- A customs-welcomed crossing may still be refused by downstream local law.

## Stop condition

Do not implement discovery, HTTP publication, crawling, licensing interpretation, or generalized receiver persistence in this specimen.
