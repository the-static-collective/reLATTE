# Composition Pulse 001 — R13 Plan

## Goal

Execute the full roadmap round once using earned primitives from R3–R10 plus a Daily-Slice-shaped slow witness, then close the round with a fresh return crossing.

## Donor law

The Daily Slice:

```text
record what was visible from here, then
do not retroactively become authority for what was observed
```

MEMENTO:

```text
correct with descendants and supersession
do not rewrite old testimony to make the present look inevitable
```

Use donor laws, not donor runtimes as hidden dependencies.

## Required proof

- begin with one valid signed origin crossing with return address;
- durable local receiver RECEIVEs and ADMITs origin;
- R9 field projection incorporates the origin ADMIT;
- local actor creates a fresh signed R13_LOCAL_ACT;
- local act explicitly states field_authorized_action=false;
- local receiver separately RECEIVEs and ADMITs the local act;
- independent slow witness signs R13_SLOW_WITNESS over the observed act/history;
- slow witness fixes source_authority=false and canonical_now=false;
- compositional question is content-addressed, semantic_effect=none, authority=null;
- R10 Cultural Uptake binds explicit variation to origin + admission + field;
- local actor signs R13_ADAPTATION tying question/witness/uptake together;
- adaptation declares fresh-local authority and no field/witness/question authorization;
- descendant is produced through R10 and includes R13 pulse lineage;
- descendant signature uses the same local actor key as adaptation;
- destination B RECEIVEs descendant with no inherited admission;
- destination C may REFUSE the same descendant without breaking the pulse;
- destination B signs R13_RETURN naming descendant as parent and original return address;
- origin world RECEIVEs return with no automatic disposition;
- final content-addressed pulse trace binds every stage ID;
- trace tampering fails verification.

## Non-collapses

```text
FIELD != CAUSE
FIELD != AUTHORITY
ACT != PROJECTION
WITNESS != SOURCE
WITNESS != CANON
QUESTION != AUTHORITY
ADAPTATION != ANCESTOR
ANCESTRY != AUTHORITY
DESCENDANT != ADMISSION
RETURN != ADMISSION
GLOBAL AGREEMENT != PULSE SUCCESS
TRACE != AUTHORITY
```

## Stop condition

Do not turn field pressure into recommendation, slow witness into canon, question into authorization, adaptation into automatic reproduction, return into admission, or R13 completion into a claim that the independent release rule has been satisfied.
