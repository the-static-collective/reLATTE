# Useful Work Kernel 008 — Proof of Availability / Serving

008 records a host's declared service and independently attributable observations
of native artifact chunks. It uses the existing result identity and Merkle tree;
no new artifact identity, CPU meter, energy meter or hardware attestation is added.

```text
004 result_id + counts_root + native chunk contract
          + host key/world + endpoint + service window
          + signed 006 schedule/randomness policy
                             ↓
                   SIGNED SERVICE COMMITMENT
                             ↓
             observer sees publication before first slot
                             ↓
           signed slot entropy → signed service challenge
                             ↓
           HTTP POST → requested bytes + inclusion proofs
                             ↓
                scoped signed observer receipt
                             ↓
           every planned slot + signed inventory cuts
                             ↓
             portable history → opaque RECEIVE / HOLD
```

## Run and retain it

Node 22.18+; tests additionally use Python 3.10+ with standard library only.

```sh
npm ci
npm run verify
npm run useful-work-008 -- demo examples/useful-work-001/julia-001.json
```

The roughly six-second demo uses a real localhost HTTP endpoint and real scheduled
deadlines. Its four slots retain **three challenges, two verified responses, one
in-window response, an unanswered expired challenge and one unknown unissued slot**.
The second response arrives after expiry: the old signed expired inventory remains
reconstructible, while the later inventory records the answer as late. The endpoint
is closed before the third request; the failed connection is an observer's attempt,
not proof that the host is dead or the artifact is unavailable everywhere.

The local demonstration controls every role key in one process. Distinct host,
challenger, provider and observer keys establish attribution, not different people,
machines, honest entropy or an objectively correct clock. `serve` and `observe`
also run in separate processes with separate keys and files.

Output directories must be new; use `--out <new-directory>` for reruns. Default
`output/useful-work-008/` contains:

- `service-context.json`: public job, signed work, signed plan and host commitment.
- `publication.json`, `slot-*/`: signed transport bundles for publication, events,
  challenges and available responses; raw signed receipts and transport attempt notes.
- `expired-snapshot.json`: portable earlier cut with an expired second challenge.
- `history-input.json`: self-contained evidence inventory plus signed final cut.
- `history/history.json`, `summary.json`, `crossing.json`, `receiver/`: portable
  verified history, readable summary, signed reference and durable RECEIVE/HOLD.
- `artifact.json`, `local-state/`: full native artifact and private demo role keys;
  neither is required for later history verification. Keys have restricted permissions.

```sh
npm run useful-work-008 -- verify output/useful-work-008/history/history.json --crossing output/useful-work-008/history/crossing.json --out output/service-reverified
npm run useful-work-008 -- collect output/useful-work-008/history-input.json --out output/service-collected
```

Saved public histories verify in a fresh Node process after removal of the artifact,
private keys, Python and mathematical rendering implementations. Verification
authenticates signatures and recomputes the chunk checks, byte totals, schedule
accounting, signed inventories and history reference; it does not rerun computation.

## Commitment, native bytes and challenge contract — v1

`useful-work.service-commitment/v1` declares exactly `result_id`,
`work_crossing_id`, `counts_root`, `chunk_rule: "native-pixel-jcs/v1"`, `plan_id`,
`plan_crossing_id`, `declared_at`, `service_window: {starts_at,ends_at}`, `endpoint`
and `host: {world_id,public_key}` alongside its schema. The host signs the crossing;
its crossing ID is the service commitment ID. Both the sole result identity and
root must match the authenticated 004 work/header. The host may differ from the
worker and never needs the worker's private key.

The signed 006 plan is reused for its fixed schedule, sample count, signed external
event rule and challenger/observer identities. Its work/result/job bindings and
all existing policy validations still apply. The service window equals the first
slot start through the final response deadline. Host declaration follows or equals
plan declaration and precedes the first slot. The service schema fixes **008's own
challenge derivation**; the 006 plan's mathematical challenge rule still applies
to 004 mathematical exchanges. Service histories are a separate typed history;
they do not claim to be 006 mathematical audits or observations.

Host, challenger, provider and observer keys must be distinct. Keys are normalized
P-256 public JWKs. The endpoint is an exact normalized HTTP(S) URL with no credentials
or fragment; it is signed attribution, not proof of a network route or machine.
V1's CLI server implements HTTP. HTTPS declarations can be observed with the client
or served by a separate TLS adapter. The client refuses redirects.

The observer signs `useful-work.service-publication/v1`, naming the exact commitment,
plan and plan crossing, with `observed_at` between declaration and the first slot
(exclusive). Issuance requires this observation; a backdated host signature alone
does not provide publication evidence. Publication chronology is attributed.

A chunk is the UTF-8 JCS encoding of exactly `{index,count}` for one ordered native
leaf, carried as strict padded Base64, plus that leaf's bottom-up sibling proof.
It is a native content chunk, **not a contiguous range of the full serialized JSON
artifact**, a rendered-image segment or a transport envelope. Its index, count,
canonical bytes, subtree root and header-derived result identity are checked using
004's domain-separated Merkle profile. Counts must fit the pinned job's iteration
bound. The host verifies the complete stored artifact structure/root before
constructing answers, without recomputing the mathematical job.

Slot windows, inclusive deadlines and sequence rules reuse 006. An external event
must match the pinned stream/key/world and the slot's expected sequence; its claimed
time must fall inside that slot's issue window. All SHA-256 hashes below concatenate
the literal ASCII domain with JCS UTF-8:

```text
nonce = SHA256("UsefulWork-ServiceChallenge-v1|" || JCS({
  commitment_id, plan_id, slot_id, randomness_event_id
}))
```

`useful-work.service-challenge/v1` carries exactly those identifiers, `slot_index`,
`result_id`, `publication_id`, `sample_count` and `nonce`. It uses a fixed opaque
organ envelope from the pinned challenger, with timestamp equal to the event's
claimed `emitted_at`. Every envelope field is reconstructed; extra metadata cannot
grind acceptable samples. That timestamp is a derivation field, not observed
physical issuance time. Indices use 004's SHA-256 rejection sampling and sparse
Fisher–Yates, substituting `(commitment_id, challenge_crossing_id)` for the two
sampling identities. They are sorted, unique and limited to 64 per challenge.

Fresh events make the requests unpredictable **if the event source is honest and
unpredictable and its event was not known before commitment**. V1 authenticates the
source's statement; it cannot prove those assumptions. Provider equivocation and
reused values remain visible, and no receipt sets randomness unpredictability true.

The host signs `useful-work.service-response/v1`: `commitment_id`, `challenge_id`,
`result_id` and `chunks: [{index,bytes_base64,proof}]`. A different mirror signs a
different commitment under its own host identity. Source attribution and result
identity survive serving; serving grants no source authority or ownership.

## What a receipt establishes

The pinned observer signs an ordinary reLATTE receipt under
`contract:useful-work/service-v1`, with `semantic_effect: none`. Its extension
`useful_work_service` names the exact exchange, endpoint, host, requested indices,
slot/deadline and observer's `sent_at`/`observed_at`. A no-response observation names
the challenge and has `response_id: null`; a response observation names the host's
authenticated response crossing. Claimed observation cannot predate sending or the
challenge's derived timestamp. Host timestamps never determine timeliness.

| Field | Meaning and verification boundary |
| --- | --- |
| `artifact_chunk_proof_verified` | Every returned chunk has canonical native bytes and verifies inclusion in the named result. False for an empty response. Later verifiers recompute this. |
| `response_observed` | Observer says it received this authenticated host response. Signature and exchange binding are checked; later replay does not witness the network again. |
| `response_within_observer_window` | Observer says sending occurred on/after slot start and receiving occurred on/before the fixed deadline. Independent replay checks these claimed timestamps, not objective time. |
| `bytes_returned` | Exact sum of decoded native content bytes in this response, including bad bytes with valid transport encoding. Excludes proofs, Base64 expansion, envelopes, HTTP headers and retries. |
| `requested_bytes_matched` | All requested indices occur exactly once, in order, with canonical bytes and valid proofs. Valid proof for an unrequested leaf, partial answers, duplicate leaves and reordering fail this claim. |
| `continuous_storage_verified` | Always `false`. |
| `physical_bandwidth_verified` | Always `false`. No byte/time rate is computed. |
| `network_path_verified` | Always `false`. |
| `host_uptime_verified` | Always `false`. |

Objective time, full computation, ownership, authority, consensus and economic value
also remain false. A `VERIFIED` receipt means the requested chunk contract matched;
a late verified response remains late. `FAILED` denotes a scoped incomplete/negative
observation, including no authenticated response observed. It alleges no computation
failure, intent, fraud or universal unavailability.

Authenticated wrong content produces retained negative evidence. Signature failures,
wrong hosts/exchanges and unsupported/malformed message structures are protocol
validation errors, not accusations against an unbound subject. Later receipt replay
checks all evidence and claims, including the receipt's entire deterministic body;
even validly signed inflated byte counts or stronger resource assertions fail.

An honest host could fetch chunks from somewhere else on demand. A dishonest observer
could assert access without making a request, omit evidence before signing a cut,
or maintain another branch. These receipts prove replayable content checks and
attributed observations; they cannot distinguish caching, persistent storage,
upstream fetching, network location or physical independence.

## Accumulating service history

`useful-work.service-history/v1` embeds the public job, work, plan, commitment,
optional publication, arrays of signed `events`, `challenges`, `responses`,
`receipts`, `prior_cuts`, one signed `cut` and a rebuilt summary. Every planned slot
survives in the denominator, with statuses:

| Status | Meaning within this inventory and signed observer cut |
| --- | --- |
| `PLANNED` | No challenge is present; issue window is still open. |
| `ISSUED` | Challenge present, no response present; response window is open. |
| `ANSWERED` | Authenticated response present, including late, partial or wrong content. This alone is not a serving observation. |
| `EXPIRED` | Challenge present, response absent and observer cut strictly after deadline. |
| `WITHHELD / UNKNOWN` | No challenge present after issue window; absence outside this inventory remains unknown. No intent is inferred. |

Separate totals report planned, issued, answered, verified chunk, observed in-window
and verified in-window slots. Negative/late receipts remain visible. Forks can add
multiple challenges and answers within a slot; they cannot add scheduled slots.
Coverage is the exact union of proof-verified indices, not inferred continuous
availability, a probability score or uptime percentage.

The observer signs `useful-work.service-cut/v1`: exact `commitment_id`, `observed_at`,
`inventory_hash`, `inventory_counts` and `complete_history_asserted: false`.
The inventory is SHA-256/JCS of the job, work/plan/commitment/publication identities
and each ordered evidence ID array, including replays and earlier cut IDs. Counts
bind exact per-array prefixes. All signatures are verified before deduplication.
Copies do not add slots, unique observations or bytes. Byte totals count each
observer-referenced response ID once; identical content in different authenticated
responses counts as separate observed exchanges, never physical throughput.

Appending requires a new signed cut and retains every earlier cut and evidence
record. Earlier inventories are independently reconstructed from monotone prefixes,
with dependencies and claimed observation times checked at their own cuts. A collector
cannot remove an old response, resign a later cut and erase the earlier evidence.
No signed inventory claims that the observer saw the entire world.

```text
history_id = "useful-work-service-history-v1:"
           + SHA256("UsefulWork-ServiceHistory-v1|" || JCS(history without history_id))
```

The history ID addresses an evidence snapshot, not another result. Signed history
crossings bind that ID and scope under the existing opaque organ API. RECEIVE/HOLD
means possession under local law; it confers no admission, entitlement or settlement.
Limits: 1,024 records per array, 1 MB per message, 32 MiB per portable history; chunks
are at most 256 decoded bytes each. No reLATTE core authority changes or 007 resource
claim promotions are introduced.

## Separate process commands

Private keys are ordinary local P-256 JWK files. Input public context files embed
`job_spec`, signed `work`, signed `plan` and (after `commit`) signed `commitment`.
Plan/event bundles can be produced using the existing 006 CLI. Publication/event/
challenge inputs below are ordinary file transport bundles.

```sh
npm run useful-work-008 -- commit <native-context.json> --endpoint <url> --key <host-key.json> --world <host-world> --out <new-dir>
npm run useful-work-008 -- publish <service-context.json> --key <observer-key.json> --out <new-dir>
npm run useful-work-008 -- challenge <service-context.json> <publication-bundle> <event-bundle> --key <challenger-key.json> --out <new-dir>
npm run useful-work-008 -- serve <service-context.json> <canonical-artifact.json> --key <host-key.json>
npm run useful-work-008 -- observe <service-context.json> <publication-bundle> <event-bundle> <challenge-bundle> --key <observer-key.json> --out <new-dir>
```

HTTP POST body is exactly `{publication,event,challenge}`; response is the host's
signed crossing. Requests/responses have a 1 MB limit. The observation command saves
the returned response bundle when present, a raw signed receipt and a transport
attempt note; malformed authentication/context fails explicitly. Network errors
produce an attributed no-response observation. `serve` binds the committed endpoint
and exits on SIGINT/SIGTERM. Only the server needs full artifact bytes and host key.

`snapshot <inventory.json> --key <observer-key>` signs a cut and saves verified
history. Inventory contains the same embedded input fields except `cut`, schema,
history ID and summary. `collect` takes those input fields plus an existing signed
cut. `append <history.json> <additions.json> --key <observer-key>` accepts only
`events`, `challenges`, `responses`, `receipts` arrays of embedded signed records;
absent arrays are empty. It retains the old cut and signs a later inventory.
`commit`, `publish`, `snapshot` and `append` accept `--at <exact-UTC>` for attributed
offline timestamps. These timestamp inputs provide no objective-clock evidence.

The [public golden history](../../fixtures/useful-work-008-golden.json) freezes a
real HTTP demo without private keys. [service_vectors.py](service_vectors.py)
independently derives full challenge envelopes, sampling, native proofs, byte totals,
slot accounting, inventory hash and history ID from the prose profile. Node tests
authenticate every signature, attack substitutions and authority upgrades, preserve
late/missing histories and check portable verification after removing computation.

Future adapters may support other native chunk layouts, authenticated beacon rules,
multiple independently scoped observers, broader storage commitments and new 007
valuation policies consuming this evidence. Each needs a separately versioned
contract; observed serving must not silently become physical resource proof.
