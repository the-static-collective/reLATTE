# TRANSLATE.THROUGH 001

**Status:** executable v0  
**Protocol posture:** first-class signed crossing attachment, not a new transport envelope

`translate.through` makes the route of transformation a durable part of a reLATTE crossing.

It is not equivalent to `translate.to`.

```text
translate.to
  source -> endpoint

translate.through
  source -> intermediate -> ... -> endpoint/return
             |
             +-- survives as an addressable descendant
```

## Why this is an attachment

`CrossingEnvelopeV0` already has three properties needed by this operation:

- `payload_refs` for source artifacts;
- `requested_effect` for the requested operation;
- signed `extensions` for typed protocol attachments.

The core crossing identity and signature already include `extensions`. TRANSLATE.THROUGH therefore does not require a new envelope version.

The crossing carries:

```text
declared_kind: TRANSLATE_THROUGH
payload_refs:
  - exact source artifact
requested_effect:
  kind: translate.through
extensions:
  translate_through:
    relatte.translate-through/v0
```

The attachment itself has a stable `operation_id` derived from:

- exact source reference;
- exact ordered route;
- exact route policy;
- exact law set.

Changing the route creates another operation identity.

## Founding laws

```text
THROUGH != TO
ROUTE != ENDPOINT
INTERMEDIATE != TEMPORARY
RETURN != ORIGINAL
DRIFT != FAILURE
TRANSLATION != ADMISSION
EXECUTOR != AUTHORITY
SOURCE SURVIVES ROUTE
EACH OBSERVED STAGE MUST BE ADDRESSABLE
RECEIPT != SEMANTIC EQUIVALENCE
ROUTE CHANGE != SAME OPERATION
```

## Route model

A route has at least three declared representations:

```text
source -> through -> target
```

or:

```text
source -> through -> return
```

Every route point declares:

- `stage_id`
- `domain`
- `representation`
- `role`
- optional `policy_ref`

The substrate does not enumerate domains or representations.

This works for language:

```text
en -> ja -> en
```

but the same operation shape can carry other representation routes:

```text
typescript -> typescript-ast -> wasm
photo -> manga -> prose
audio -> midi -> notation
```

The substrate does not learn how those representations work.

## Policy

v0 requires:

```json
{
  "preserve_intermediates": true,
  "require_stage_receipts": true,
  "semantic_equivalence_claim": "none",
  "route_change": "new-operation",
  "outputs_are_descendants": true
}
```

The most important refusal is:

> **RECEIPT != SEMANTIC EQUIVALENCE**

reLATTE may prove that a declared source crossed a declared route and produced exact addressable descendants.

It does not certify that two representations mean the same thing.

## Stage receipts

Every observed route transition may emit a normal signed `ReceiptV0` carrying:

```text
extensions.translate_through_stage
```

A stage receipt binds:

- operation id;
- stage index + stage id;
- exact from/to route points;
- exact input ref;
- exact output ref, when one exists;
- stage state;
- prior stage receipt id;
- semantic-equivalence claim = none.

States:

```text
COMPLETE
HELD
REFUSED
FAILED
```

A completed stage creates one addressable descendant.

A non-complete stage creates no hidden output.

## Route receipts

A route summary is another normal signed `ReceiptV0` with:

```text
extensions.translate_through_route
```

Route states:

```text
COMPLETE
PARTIAL
HELD
REFUSED
FAILED
```

The summary preserves:

- all stage receipt ids;
- all completed intermediate output refs;
- expected transition count;
- completed transition count;
- last addressable artifact.

A route may therefore stop at Japanese and still retain the Japanese descendant even if the attempted English return is HELD or REFUSED.

```text
EN source
   |
   v
JA descendant -- COMPLETE
   |
   v
EN return ------ HELD

route state: HELD
last addressable ref: JA descendant
source: survives
```

## Founding specimen

`fixtures/translate-through-en-ja-en-spec.json` uses the LemonPRESS THE LAST STOP MOVED source identity as the founding route declaration:

```text
language:en
   ->
language:ja
   ->
language:en (return)
```

The Japanese stage points at the Japanese-edition profile boundary. The return stage points at the drift-preserving return-voice boundary.

The fixture declares the route only. Tests create fresh signing keys and prove:

1. the route is part of signed crossing identity;
2. route mutation changes `operation_id`;
3. extension mutation breaks crossing verification;
4. Japanese and returned-English outputs receive independent signed stage receipts;
5. a complete route receipt retains both intermediate and final descendant refs;
6. a HELD return preserves the completed Japanese descendant;
7. receipt mutation fails verification;
8. the same substrate works for a non-language representation route.

## Authority boundary

`translate.through` owns:

- route declaration;
- route identity;
- exact artifact references;
- signed observations of stage passage;
- stage-chain verification;
- route-state receipt.

It does **not** own:

- translation generation;
- semantic equivalence;
- quality judgment;
- source truth;
- editorial admission;
- publication;
- destination authority.

Organs may perform transformations.

Worlds may admit or refuse descendants.

reLATTE carries the journey without collapsing it.

## Schemas

- `schemas/translate-through-spec-v0.schema.json`
- `schemas/translate-through-v0.schema.json`
- `schemas/translate-through-stage-receipt-v0.schema.json`
- `schemas/translate-through-route-receipt-v0.schema.json`

## Executable surface

`src/translate-through.ts` exports:

- `createTranslateThroughAttachment`
- `sealTranslateThroughCrossing`
- `verifyTranslateThroughCrossing`
- `sealTranslateThroughStageReceipt`
- `verifyTranslateThroughStageReceipt`
- `sealTranslateThroughRouteReceipt`
- `verifyTranslateThroughRouteReceipt`

## The larger primitive

The point is not translation software.

The primitive is:

> **the path through representations can itself be an attributable consequential relation.**

That makes `through` reusable without making reLATTE the sovereign of any representation it carries.
