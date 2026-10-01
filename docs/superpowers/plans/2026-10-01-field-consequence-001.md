# Field Consequence 001 — R9 Plan

## Goal

Earn R9 by deriving owner-local susceptibility from admitted history without letting field projection mutate or authorize history.

## Required proof

- create one owner-local Field Lens;
- baseline empty history produces baseline weather;
- signed R3 ADMIT history changes susceptibility;
- signed R8 Perspectives on an admitted crossing can change plurality/ambiguity features;
- Perspective on an unadmitted crossing is rejected;
- non-ADMIT receipt is rejected;
- same history under two lenses keeps the same history root while changing weather;
- input ordering does not change projection;
- projection leaves source receipts, Perspectives, and Moment unchanged and still verifiable;
- projection has semantic_effect=none;
- projection has authorization=null;
- projection has recommended_action=null;
- projection cannot verify as receipt or crossing;
- projected-value tampering breaks projection identity.

## Non-collapses

```text
HISTORY != WEATHER
LENS != HISTORY
WEATHER != TRUTH
WEATHER != AUTHORITY
WEATHER != RECOMMENDATION
SUSCEPTIBILITY != INSTRUCTION
PLURALITY != VOTE
```

## Stop condition

Do not add recommendations, rankings, automated actions, predictive claims, truth scoring, or R10 descendant reproduction.
