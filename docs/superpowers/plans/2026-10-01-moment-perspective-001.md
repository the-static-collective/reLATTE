# Moment / Perspective 001 — R8 Plan

## Goal

Earn the bounded R8 proof with a stable shared Moment and immutable signed observer accounts.

## Required proof

- derive one content-addressed Moment from one signed crossing;
- two independent observers sign divergent Perspective accounts;
- both accounts bind the same Moment and carrier hash;
- two replicas begin with different accounts;
- sync in both directions preserves both;
- duplicate sync is idempotent;
- restart replay reconstructs both;
- account mutation fails signature verification;
- Moment carrier mutation fails anchor verification;
- Perspective from Moment A cannot attach to Moment B;
- no winner/current-truth field is introduced.

## Non-collapses

```text
MOMENT != PERSPECTIVE
PERSPECTIVE != TRUTH
SYNC != OVERWRITE
PERSPECTIVE SET != CONSENSUS
REPLAY != LAST WRITE WINS
ACCOUNT != CARRIER MUTATION
```

## Stop condition

Do not add consensus, ranking, reputation, truth adjudication, moderation, or R9 field consequence.
