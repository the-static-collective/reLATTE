# SOVEREIGN-BOOTSTRAP-EXTERNAL-001 — operator ceremony

**Status: external execution NOT_EXECUTED.** This is the reviewable ceremony for the missing external inputs, not a record that the administrations have participated [S01, S33]. Claims and assumptions are in the [claim matrix](SOVEREIGN-BOOTSTRAP-EXTERNAL-001-CLAIM-MATRIX.md).

## Required before the experiment

Each administrator independently supplies the existing public P-256 root/genesis/history evidence, retains its own selected key/genesis/history head outside the transport broker, and identifies external evidence that its administration/root existed before the experiment. Each retains its own observation log and pins its head. The coordinating reviewer receives only public records. Common orchestration authority and access to both key stores must be examined externally; two key files or two CI jobs do not establish separation [S02–S03, S26–S29, S33, S37].

The current root/history format is `relatte.bootstrap-journal/v0`. A local public view contains the unchanged original history, a public signed-record archive and a separate observation log. Initially the observation log can be empty and its pin null. The existing bounded P delegation and original policy selection are retained. The operator adapter does not create a genesis or generate a key [S03–S04, S14].

```json
{
  "root": {
    "admin_id": "existing-local-admin",
    "key": "normalized-existing-P-256-point-fingerprint",
    "genesis_id": "original-selected-genesis-receipt-id",
    "head_id": "original-selected-history-head"
  },
  "observation_head": null
}
```

This example is a schema illustration, not an external observation. Obtain values from the operator’s previously selected local evidence, not an untrusted incoming packet [S03, S26–S27].

## Independent local discovery

P issues incompatible signed rules for the same global slot/version. B signs two competing versioned activation claims or sends a public subset omitting a known branch. Each operator receives only public records in `incoming.json` and inspects them against its independently retained selection/view [S04–S09, S37].

```sh
node --experimental-strip-types scripts/sovereign-bootstrap-external.mjs \
  inspect own-selection.json own-view.json incoming.json
node --experimental-strip-types scripts/sovereign-bootstrap-external.mjs \
  checkpoint own-selection.json own-view.json incoming.json \
  /operator-private/existing-root-jwk.json new-local-checkpoint
```

`checkpoint` requires the private key to match the previously selected own root. It writes a new public view and selection into a new output directory, preserving the original files. The operator independently retains the new observation-head pin and public counterevidence; the output becomes that operator’s next own selection/view. Publishing a checkpoint attributes claims; it does not grant foreign sovereignty [S03, S06–S07, S10, S25].

## Fresh policy proposal and exact local choice

Exchange the public views. One operator can propose a new edge. `public-views.json` has only `{"views": [A_public_view, B_public_view]}`. A proposer supplies its own retained view separately; a mismatched candidate is rejected [S13–S14, S37].

```sh
node --experimental-strip-types scripts/sovereign-bootstrap-external.mjs \
  propose own-selection.json own-view.json public-views.json \
  /operator-private/existing-root-jwk.json new-public-proposal
```

The resulting `proposal-bundle.json` binds the exact old choices, knowledge heads, archives and contradictions. It is a proposal only. Each operator separately chooses ADMIT or REFUSE for its exact proposal ID [S14, S16, S25].

```sh
node --experimental-strip-types scripts/sovereign-bootstrap-external.mjs \
  decide own-selection.json own-view.json proposal-bundle.json \
  /operator-private/existing-root-jwk.json EXACT_PROPOSAL_RECEIPT_ID \
  ADMIT new-local-decision
```

Use `REFUSE` to preserve rejection. No coordinating process decides or signs for both operators. This workflow boundary alone is not proof that no common administrator controls the machines or keys; that remains an external requirement [S02–S03, S16, S26–S27, S32].

## Freeze the encounter and replace the verifier

Publicly collect both `local-decision.json` records into the proposal bundle’s `decisions` array; `closures` is initially empty. Each operator independently verifies and signs closure over that exact core [S14, S19].

```sh
node --experimental-strip-types scripts/sovereign-bootstrap-external.mjs \
  close own-selection.json own-view.json both-decisions-bundle.json \
  /operator-private/existing-root-jwk.json new-local-closure
```

Collect both public `local-closure.json` records into `closures`. Each side can reproduce the same new edge while retaining both old policies and the known contradictions [S14–S15, S22, S39].

```sh
node --experimental-strip-types scripts/sovereign-bootstrap-external.mjs \
  verify own-selection.json own-view.json complete-public-bundle.json
node --experimental-strip-types scripts/sovereign-bootstrap-external-independent.mjs \
  own-selection.json complete-public-bundle.json own-view.json
```

A cold historical verifier can omit the last `own-view.json` native argument only if the complete public bundle and externally supplied pins remain available. An operating sovereign supplies its separately retained own view to prevent peer reconstruction from replacing it. All private paths stay local; do not include them in proof packets [S13, S22–S23, S29, S37].

## Actual external report

Record which independently authenticated sources establish each root’s pre-existence, domain control and pin retention; classify each exact observation, derived signature/binding claim and external assumption. Report active-B equivocation, evidence subsets each observer actually saw, the delayed encounter, refusal outcomes and final signed decisions/closures. Preserve both raw histories and all counterevidence. A malicious B need not cooperate; failed consent is a valid HOLD result, not permission to fabricate a successful external edge [S01, S05–S11, S14–S16, S26–S33].
