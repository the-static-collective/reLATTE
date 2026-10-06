# Useful Work Field Test 003 — The Door Market

Worlds publish their own conditional offers. A locally computed discovery view can
describe compatibility with evidence A possesses. Discovery emits no presentation,
recommendation, selection, or external transfer. There is no central matcher.

```text
B ── signed credit offer / PB ──────┐
E ── signed storage offer / PE ─────┼── A's local discovery view
F ── signed compute offer / PF ────┘              ↑
G ── signed empty local listing             A's signed descriptor
                                                + exact evidence

discovery → explicit A choice → explicit A crossing
         → B's local ACCEPT/HOLD/REJECT
         → separately configured ledger → C's settlement replay
```

The laws are:

- DISCOVERY ≠ RECOMMENDATION
- RECOMMENDATION ≠ SELECTION
- DOOR ≠ CROSSING
- MATCH ≠ ACCEPTANCE

## Independently published doors

| World | Offer | Local evidence policy | Expected discovery observation |
| --- | --- | --- | --- |
| B | 12 local field credits | The full bounded policy from Field Test 002 | Appears compatible |
| E | 1,048,576 byte-windows of storage service | Named storage observation and one timely serving slot | Appears compatible |
| F | 1,000 milliseconds of compute time | Named energy-meter observation with device telemetry provenance | Missing evidence |
| G | No offer in its signed listing | No policy published | Empty local listing observed |

B retains its own valuation of 12; D retains its valuation of 5. Storage units,
compute time, and credits are preserved separately. Discovery does not convert
them into one price or rank them. E/F's offers do not attest resource capacity or
delivery. This example configures the external crossing/settlement path for B;
E/F publish offers but have no live resource transfer adapter configured.

Each offer uses Kernel 010's signed, data-only policy, local cutoff, eligible
presenter, and named settlement adapter. A door adds a signed routing hint,
binding the exact offer and experiment scope to the same publisher identity.
An endpoint declaration does not prove endpoint control or availability.
Listing signatures bind exact door inventories, including an empty inventory.
G's empty listing establishes no global absence of offers.

## Discovery is a local view

A signs a descriptor binding the exact result, native work, evidence bundle,
audit/service/resource inventories, and valuation references. Discovery replays
that bundle and each offer's policy using the caller's local public-key pins.
It reports policy PASS/FAIL/MISSING, target and presenter compatibility, and
whether the offer is open at the supplied local observation time. A PASS is
about attributed evidence under that particular policy, not shared mathematical
truth, future availability, offerer receipt, or acceptance.

`discover()` is pure: it accepts data and returns data, with no network access,
signing key, command callback, or mutable marketplace state. It preserves invalid
sources and duplicates. Mechanical ordering uses door IDs only. Pins express
the caller's identity bindings; they do not establish universal identities.
The reported clock is a local claim, not an attested global clock.

A retains both its full discovery view and a second local query omitting E.
These views differ without either becoming the complete market. Listing-fetch
failures remain local observations and do not establish remote death or absence.
Public descriptors and evidence are deliberately disclosed in this example;
there is no private discovery or selective disclosure claim.

## Two explicit local actions

`choose` signs A's exact descriptor, evidence, discovery view, door, offer, and
local reason. It creates no presentation. A may even choose a negative hint;
the offerer's conditions still govern acceptance.

`cross` is a separate command binding that signed choice to a new Kernel 010
presentation. Only then does A's local wire service send the presentation to B.
B evaluates the actual evidence again and uses its own durable inbox observation
for the deadline. It can HOLD or REJECT even when discovery reported PASS.
External transfer remains a separate, explicitly configured demonstration ledger
action after B's ACCEPT. Duplicate network delivery cannot debit the ledger twice.

The live test checks that discovery and a signed choice each leave the ledger
unchanged. It then explicitly crosses B's door. It preserves Field Test 002's
network faults, retained mathematical contradiction, expired serving slot,
unavailable/restarted D, dissenting valuation, and separate late-evidence HOLD
probe. That scripted regression probe is distinct from the Door Market discovery
and selection path, and authorizes no second transfer.

## Run

Requires Node 22+, Python 3, and Linux for the live resource adapters. In one
terminal, start a fresh experiment:

```sh
npm run useful-work-field-003 -- run examples/useful-work-001/julia-001.json output/field-003
```

The process prints `DOOR_MARKET_WAITING` with A's discovery ID and each door ID.
It pauses. Read `output/field-003/trade/A/market/discovery.json`, then explicitly
choose the B door in another terminal, substituting the exact printed IDs:

```sh
npm run useful-work-field-003 -- choose output/field-003/trade/A \
  'useful-work-door-discovery-v1:<hex>' 'relatte-crossing-v0:<B-door-hex>' \
  'I choose this specific local-credit offer under B policy.'
```

This prints the signed choice ID and leaves the ledger untouched. To cross:

```sh
npm run useful-work-field-003 -- cross output/field-003/trade/A \
  'useful-work-door-discovery-v1:<hex>' 'relatte-crossing-v0:<choice-hex>'
```

Choices and crossings use exclusive local files; accidental repeat commands do
not replace them. IDs are mandatory and there is no first-door or best-price
default. This driver supports the B crossing adapter; choosing E or F does not
configure or execute an external resource transfer. The library can construct
presentations for any observed door, including a negative hint.

Offers and the experiment expire after approximately five minutes. If no explicit
crossing arrives, the run times out without selecting a fallback. Start another
run in a new directory to try again. Keep private `state/` directories local.

After the run completes:

```sh
npm run useful-work-field-003 -- verify output/field-003/trade/A/market/public-local-view.json
npm run useful-work-field-002 -- verify output/field-003/trade/C/public-local-view.json
```

The market verifier needs only A's public delivery: its independently signed wire
view, retained source listings, both discovery queries, choice, crossing intent,
presentation, and observed economic evidence. It checks that the actual outgoing
wire presentation and subsequent ACCEPT concern that exact chosen offer. It does
not read other world journals, private keys, live actors, or the ledger program,
and never constructs a merged market history.

An independent consumer can run `discover <discovery-input.json>` to recompute a
local view without starting actors or issuing a choice. The public library is
exported as `doorMarket` from `src/useful_work/index.ts`.

## Execution scope and validation

E, F, and G run as separate Node processes, each creating its own private key and
serving its own signed publication over HTTP. The A/B/C/D/ledger wire experiment
also uses autonomous local processes and private stores. The lifecycle driver
shares only public bootstrap cards/endpoints and invokes no choice or crossing
command. It does not read private provider keys.

This Field Test 003 driver shares one host, OS user, and kernel. It builds on the
wire protocol validated across five hosted runner VMs in Field Test 002; it does
not claim a new cross-machine market trial, physical geography, enforced private
filesystem isolation, organizational independence, or universal network survival.
The transferable observation is bounded cooperation under local evidence and
explicit choice, not a complete marketplace or guaranteed resource economy.

Run its focused tests with:

```sh
node --test --experimental-strip-types test/useful-work-field-003.test.ts
```
