# Useful Work Field Test 002 — Crossing the Wire

The ten-kernel trade runs through autonomous world services. A renders and serves;
B publishes its offer, collects evidence and locally ACCEPTS 12 field credits;
a separate Python ledger changes B/A from 100/0 to 88/12; C replays settlement;
D values the same context at 5. The original diagnostic mathematical disagreement
and second expired service slot remain in the accepted evidence.

No trade controller invokes remote semantic commands. Each world advances a local
state machine from signed messages and its own timers. A lifecycle/network exerciser
may start processes and disrupt routes; it has no world keys or decision endpoint.
Each world exports its own signed local cut. There is no required merged archive,
global ordering, all-world completion barrier, or reconstruction authority.

```text
RECEIVED ≠ APPLIED
ACKNOWLEDGED ≠ AGREED
RETRY ≠ A SECOND ECONOMIC TRANSFER
MISSING DEPENDENCY ≠ INVALID EVIDENCE
LATE EVIDENCE ≠ RETROACTIVE ACCEPTANCE
SHARED MESSAGES ≠ SHARED HISTORY
LOCAL REPLAY ≠ GLOBAL RECONSTRUCTION
```

## Execution surfaces

Three drivers exercise the same role-local protocol:

| Driver | Execution boundary | What it demonstrates |
| --- | --- | --- |
| `local` CLI / regular test suite | Five processes, one user/host/network namespace | Fast live HTTP composition and local replay; it retains the Field 001 host caveat. |
| `containers.py` | Five separate non-root users, private volumes, PID/mount/network/UTS namespaces; a separate keyless proxy | Real bridge-network traffic, independent filesystems and world restart; containers share a kernel. |
| `field-wire-002` workflow | Five separately scheduled GitHub-hosted runner jobs, one world per runner VM | Cross-machine HTTPS exchange, local reconstruction and recovery without a trade controller. |

The hosted workflow uses a temporary Cloudflare quick tunnel for each peer's HTTP
surface. The tunnel binary is version/digest pinned. Only public peer cards,
endpoints and surface descriptions use GitHub artifact rendezvous; artifact storage
does not relay the trade or collect world state. After rendezvous, signed world
messages and native service proofs travel over HTTP/HTTPS. Each job uploads only
its own public local view and network diagnostics. Private keys/state are excluded.
The workflow records hostnames but requires distinct runner identities and kernel
boot IDs: hosted VM images may reuse a hostname. It fails if these checks or a tunnel
startup fail. It never downgrades to the local driver while reporting cross-machine
success. Runner/container metadata are execution observations, not hardware or
geographical attestations. The protocol continues to claim no verified physical
geography, objective clock, organizational independence, or network path.

## Run it

Linux, Node 22.18+, Python 3.10+ and `getconf` are required for live execution.
Install the locked dependency and run normal checks:

```sh
npm ci
npm run verify
npm run useful-work-field-002 -- local examples/useful-work-001/julia-001.json output/field-002-local
```

Use a fresh output directory. The local run usually waits approximately a minute
for real service expiry and D's offline interval; runtime depends on host load.
Live tests exercise the local driver. Docker validation is separate:

```sh
python3 examples/useful-work-field-002/containers.py output/field-002-containers
```

The Docker driver uses the local managed socket explicitly, a small Python/Node
runtime image, an internal bridge network, read-only root filesystems, no added
capabilities, distinct UIDs, and one private named volume per world. It mounts only
public bootstrap files; no container sees another world's keys or state. It checks
all five namespace sets and UIDs, preserves each public local view and process log,
then removes its containers/network. Private world volumes remain, with their names
in `execution-surfaces.json`. No other containers, images or volumes are removed.
The build copies the installed locked runtime dependency, with no networked install
step inside the image. Registry pulls use the configured Docker daemon networking.

The `field-wire-002` GitHub workflow runs on the field branch and can be dispatched
after it is registered in the repository. Each matrix job bootstraps and supervises
only its own world. A/B/C/D/adapter never share a key store, state volume, controller
or runner filesystem. Five job artifacts are five independent local histories.

## Put a world on your own machine

Each role can be deployed independently. Run `init` on that role's host:

```sh
npm run useful-work-field-002 -- init A /var/lib/relatte/world-A
```

Exchange only `public-card.json` with the other operators. Build `peers.json`
mapping `A`, `B`, `C`, `D`, `adapter` to their public cards; build `endpoints.json`
mapping those roles to HTTP/HTTPS base URLs. Pin these cards locally before traffic;
they identify this experiment's keys and do not establish real-person ownership.

```sh
npm run useful-work-field-002 -- configure A /var/lib/relatte/world-A peers.json endpoints.json examples/useful-work-001/julia-001.json 8080
npm run useful-work-field-002 -- serve /var/lib/relatte/world-A/config.json
```

Repeat locally for each role. Use a unique shared `run_id` in each config to bind the
session and exclude traffic from other experiments. Configure routable endpoints,
the measured network interface, scheduling windows, timeouts and offline interval
for the actual deployment. The three drivers pin public cards and endpoints before
protocol traffic; no daemon dynamically adopts keys announced by an incoming peer.
Reusing the field-001 role/card schema and domain helpers keeps the exact original
economic profile; every run generates fresh keys and adds the field-002 wire scope.

World HTTP exposes only `/wire`, `/native` on A, and a small `/health` response.
There is no remote render/sign/ACCEPT/transfer command or filesystem-path API.
Wire requests authenticate the sender and intended recipient before durable receipt;
native requests authenticate the scheduled service challenge. Direct HTTPS, a TLS
reverse proxy or the hosted test tunnel can front these endpoints. Redirects fail.

## Real transport faults

`fault_proxy.ts` forwards actual requests; it does not manufacture world receipts.
Its own journal is diagnostic and is not a global reconstruction of the worlds.

| Fault | Action | Preserved local consequence |
| --- | --- | --- |
| Latency | Hold requests before forwarding | Sender attempts and receiver-local observed times; no objective time claim. |
| Out-of-order delivery | Delay A's artifact packet to B while its dependent notice overtakes it | B records the notice as PENDING; it applies after observing the dependency. |
| Duplicate delivery | Forward A's packet twice to C | Two arrival events, one first receipt/application. |
| Disconnect | Forward B's ACCEPT to the ledger adapter, then destroy the connection before returning its ACK | B retains an unknown/failed transport outcome and retries. The adapter retains the duplicate arrival. |
| Retry | Durable outboxes retry without replacing the signed packet | Same message identity and exact body; multiple attempts and acknowledgements remain visible. |
| Temporary partition | Destroy adapter-to-C ledger-record requests for a bounded interval | The adapter retains failures and later delivery; C can observe settlement after connectivity returns. |
| Unavailable world | D's worker actually exits after its fault receipt reaches B; its local supervisor waits and restarts it | D retains its journal and keys across process restart. A/B/C/ledger proceed without waiting for D's value. |
| Late evidence | Delay A's presentation for a separate short offer beyond B's cutoff | B issues a signed HOLD with `within_offerer_observed_window = false`; the original ACCEPT and ledger entry stay separate. |

The second service slot is still intentionally unanswered and expires in real time.
Fresh audit/service slots retain C-signed randomness events. The published primary
offer explicitly permits the mathematical disagreement and requires one timely
service slot. B does not relax a failed policy after seeing the faults. Domain
service retries retain failed observations as well as successful chunk/proof replies.

Finite recovery requires a retry path eventually to become available. A world that
remains unavailable has a replayable prefix; other worlds retain pending deliveries
and their own observations. A missed deadline does not become success through retry.
This trial demonstrates recovery for the declared fault schedule, not universal
liveness under permanent partition or every latency/clock pattern.

## Durable receipt, application and recovery

Every wire packet contains a core signed opaque crossing plus exact inline body.
The crossing binds run ID, sender, recipients, topic, dependency message IDs and
the domain-separated body hash. Twelve distinct P-256 keys are retained from the
original role profile; primary world keys sign wire packets and local cuts. Local
domain subprocesses can access only their own world's key store.

The receiver authenticates and writes the packet and arrival event through to disk
before returning a signed RECEIVED acknowledgement. That ACK promises a local
durable record, not completed application or agreement. Domain application follows
only after the required messages have been locally observed; observing a dependency
does not infer another world applied it. Each message ID can be locally applied
once. Duplicate arrivals remain in the journal and do not run the handler twice.

Inbox events, outbox intents, attempts, interrupted attempts, ACKs, failures,
PENDING/APPLIED/DOMAIN_FAILURE events and process restarts form a per-world hash
chain. There is no global sequence. A process lock prevents concurrent writers in
one world root. File replacement fsyncs data and its directory. Cached local domain
outputs and signed send intents survive restart; an interrupted send remains an
unknown remote outcome until a later ACK. This is local application idempotency,
not exactly-once network delivery or a transaction spanning the network and ledger.

The separate Python ledger owns one idempotent entry. Its operator configuration
permits one explicit request with 12 credits and opaque ACCEPT/evidence references;
the ledger does not parse protocol policy. Its atomic local update can be replayed
after an interrupted record export without a second debit. The adapter imports the
actual local record and signs a scoped observation; C's replay executes no transfer.
No financial payment, rights transfer, exclusive resource causation, global ledger,
discharge guarantee or universal finality is established. CPU/file/interface
observations remain separate; absent energy stays unknown.

## Replay one world's view

```sh
npm run useful-work-field-002 -- verify output/field-002-local/C/public-local-view.json output/C-reverified.json
```

Only Node, the public view and the standard crypto/canonicalization dependency are
required. The compiled CLI also supports `local`, `serve` and `verify` after
`npm run build`. `verify` has no dependency on actors, collectors, the live server,
Python, ledger state, other worlds' journals, or mathematical checker/worker code.
It authenticates retained messages/ACKs/cut, replays the local sequence and causal
dependencies, and reconstructs typed observations from locally applied or generated
packets. A retained failed application remains a failure; an authenticated malformed
domain body is not promoted to verified evidence. Replaying mathematics means
replaying signed predictions/proofs as observations, not choosing the true verifier.

The view retains exact original messages, its event chain and a rebuilt summary.
Every exported prefix is also retained in `cuts/`; a resumed world's later cut
does not overwrite the earlier signed prefix.
The world's preservation crossing binds the exact view ID and local chain head.
Rehashing a summary cannot erase duplicate/failure/expiry evidence, upgrade late
HOLD to ACCEPT, invent global agreement, or substitute another world's signed cut.
There is no requirement that A/B/C/D have identical received sets or cut times.
For example D never sees the late-HOLD probe, and the adapter need not see D's price.
An unavailable world's missing observations stay missing.

The three drivers retain public bootstrap, per-world local views and local network
diagnostics. Read each `public-local-view.json` independently. Its claim boundary is
its retained authenticated messages, local domain outputs, and attributed attempts;
it does not assert that it captured every packet, every world, or every causal fact.

The tests cover the full trade, every fault above, D restart, one ledger entry after
duplicate ACCEPT delivery, distinct local cuts, failed applications, missing
dependencies, body/run/key/topic substitution, wrong-peer ACKs, signed-cut binding,
and relocation after removing all live execution machinery.
