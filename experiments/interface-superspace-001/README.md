# INTERFACE-SUPERSPACE-001

**Existing doors first; synthesize lawful routes without teaching the core their names.**

This non-normative experiment addresses interface particulars independently of their participants. A bounded planner composes explicit, locally attested relations using representation contracts, available observations, capacity, order, loss, witness availability, live availability, and scoped permissions. A separate executor uses existing boundary operations. A plan never supplies execution authority or receiver admission.

The normative core is frozen at `f5cb7488bebc1a6e27fd458ad40af9b9b6f9e858`, with `src/` tree `c0e4d2c59481e0fb2a4bf4bb294f373907fd2b76`. This experiment changes no `src/`, stable `schemas/`, or `spec/` file. Donor SHAs are pinned in [fixtures/donors.json](fixtures/donors.json).

## Run

Node 24, Python 3.12, and sibling checkouts of the pinned TranchNOSE and GHoT commits are sufficient for the non-world proofs:

```sh
npm ci
TRANCHNOSE_ROOT=../tranchNOSE GHOT_ROOT=../GHoT npm run superspace:test
TRANCHNOSE_ROOT=../tranchNOSE GHOT_ROOT=../GHoT npm run superspace:proof
node experiments/interface-superspace-001/verify-run.mjs work/interface-superspace-001/proofs.json
npm run verify
```

`TRANCHNOSE_ROOT` and `GHOT_ROOT` select provisioned donor checkouts. They do not tell the planner which route to take. The workflow checks out those donors at exact SHAs.

For the live vanilla proof, Java 25 and the same pinned external clients used by ALIEN-MINECRAFT-VANILLA-005 are required:

```sh
npm install --no-save --ignore-scripts mineflayer@4.39.0 mineflayer-pathfinder@2.4.5 rcon-client@4.2.5 vec3@0.2.0 minecraft-data@3.114.0
python3 experiments/interface-superspace-001/setup-minecraft.py
cd work/minecraft/server
java -Xms512M -Xmx2G -jar server.jar nogui
```

From another terminal, after the server reports `Done`, run from the repository root:

```sh
node experiments/interface-superspace-001/run.mjs --minecraft
node experiments/interface-superspace-001/verify-run.mjs work/interface-superspace-001/proofs.json --require-minecraft
```

The existing specimen uses an isolated local survival world, a payload-independent wool quarry, actual mining and inventory acquisition, client placement, client reconstruction, and independent RCON block queries. It stops its disposable server after completion. The setup verifies the official Mojang 26.1.1 jar SHA1 `49c8195703ad0ba4f0a4efbccfd85a4a8ca57431`; it does not install server mods. The original vanilla CLI still emits its existing evidence shape. Its existing phases are exposed by `vanillaStages`, which pauses at actual boundaries; they are not retrospective labels on one opaque invocation.

## Experimental grammar

The JSON Schemas in [schemas/](schemas/) require every distinction. The registry currently contains 30 interface particulars and 26 relations. Human-readable filenames never reach the planner. Interface and relation IDs are already opaque; the hostile test renames them again, including participant references and permission scopes, and compares graph isomorphism before executing a renamed route.

An interface declares participant reference, plane, direction, protocol, accepted/emitted representations, capabilities, operations, authority ceilings, payload capacity with units, timing, ordering, delivery, loss profile, native dimensions, retention, replayability, evidence, constraints, and availability. A capability is discoverable affordance. It is not a grant.

An explicit relation declares source/destination, input/output contracts, operation, pre/postconditions, removed facts, preservation dimensions, possible losses, reversibility, loss cost, dependencies, and an execution binding reference. The graph joins only these declarations. There is no inferred relation merely because two systems have compatible types.

`preserves.bytes` refers to the carried **payload bytes**, not equality of native carrier representations. MIDI encoding changes its representation and introduces native event timing. UDP emission does not guarantee delivery; a source-byte reference is not receiver observation. Only validated complete reassembly produces the reconstructed payload. Native evidence retains actual arrivals and duplicate count. `order` and `timing` refer to declared evidence dimensions; neither implies universal physical timing fidelity.

Analytical request → result is a declared derivation with fresh identity, rather than a byte-preserving transport claim. The separately tested irreversible prefix projection consumes payload bytes, retains only eight, incurs loss cost 1, and explicitly loses bytes, semantics, source representation, and reversibility. Two different suffixes produce the same projected bytes. The descendant has a new particular ID, an explicit parent, inspectable transformation evidence, and an empty authority set.

Local implementation contracts in `fixtures/binding-contracts.json` and `fixtures/surface-contracts.json` constrain descriptors independently of routing. They are inspected implementation attestations for these provisioned specimens, not a global trust service. A newly provisioned primitive needs a descriptor, relation declarations, a local implementation contract, and an independently installed binding; it does not require planner changes or a route sequence. The planner never loads implementation code, checks participant names, or selects bindings by system name.

## Discovery, selection, permission, execution, admission

```mermaid
flowchart LR
  D[Declared doors and relations] --> P[Candidate plans]
  P --> S[Explicit selection]
  S --> G[Independent scoped grants]
  G --> X[Observed boundary execution]
  X --> R[Receiver-local decision]
```

GHoT's existing `external_executor_records` supplies discovery evidence. The founding manifest remains donor-owned and declares `analysis.tranchnose.field-lab`, `stdin-json/stdout-json-v0`, `network: false`, and `arbitrary_shell: false`. GHoT's existing `execute_external_adapter` executes its bounded command after separate selection and grants. The experiment verifies exit status, stdout JSON, receipt text, and its advertised content address. These are declared/provisioned process limits, not a new operating-system isolation claim.

The executor receives a separate binding table and scoped grants of the form `interface:…/operation`. Proposal permissions alone cannot execute a route. Each boundary rechecks grants, network policy, state/witness availability, and declared observations. Composing boundaries creates no new grants. Every occurrence and descendant has a fresh ID and an empty inherited authority set.

The receiver uses unchanged core sealing/verifying functions. The experimental ancestry, route, plan, native claims, and observed relation receipts live in an existing `extensions` surface. A separately installed receiver policy decides HOLD/REFUSE/ADMIT; the planner has no admission property. Tests demonstrate successful transport with local REFUSE, and denial of forged ADMIT. All supplied proof runs use local HOLD.

## Executable proofs

The runner synthesizes its paths before selecting them:

| Proof | Independently traversed doors | Native evidence |
|---|---|---|
| FIELD LAB | JSON request → stdin → bounded donor process → stdout → addressed receipt → observation → receiver | Actual GHoT manifest discovery, process exit, stdout digest, invariants, trajectory result, addressed receipt |
| UDP | Payload → indexed fragments → emission → receipt → reassembly → observation → receiver | Live loopback sockets, endpoints, reversed indexes, duplicate arrivals, datagram identities, complete reconstruction |
| MIDI | Payload → event encoding → event observation → reconstruction → observation → receiver | Real binary SMF0, two channels, note events, delta ticks, tempo, division, native file digest |
| Vanilla Minecraft | Payload → provisioned client → world mutation → client observation → server verification → receiver | Official jar/version, connection, mined and acquired inventory, placements, action transcript, independent server block queries |
| Irreversible | Payload → eight-byte projection → observation → receiver | Parent ID, input/output digests, projection specification, lost suffix residual, no recovery claim |
| Hostile final question | Source + observable goal + all registered doors, then first previously unexecuted candidate | Additional discovered route; no system hint or named sequence in the query |

The generic `synthesize(registry, request)` API accepts a source interface/state, a goal interface or emitted property, and constraints. It enumerates bounded simple paths; cycles cannot add progress. It returns proposals and per-interface/per-relation blockers with their path prefix. A complete unsuccessful search reports `NO_ROUTE`. A bounded incomplete search reports `SEARCH_LIMIT`, never a proof of impossibility. The planner claims neither exhaustive infinite-state reachability nor optimality.

For example, asking for ordered received datagrams with no reassembly relation reports `ordering_requirement_unsatisfied` at the receiver, with actual facts and the missing ordered requirement. Other blockers distinguish protocol mismatch, capacity, missing observations, mutation denial, network denial, missing authority, missing witness, unavailable state/participant, ancestry, loss budget, and irreversible edges.

TranchNOSE's modeled controller, body, topology, field, observable, latent, history, and coordination surfaces are separately addressable. These descriptive nodes have no invented executable connections and are marked unavailable as live control participants. Their different representation contracts and planes prohibit equating history with operative state, topology with body, coordination with field, or witness with state definition. The executable analytical specimen reuses the donor's actual robotics model; it earns no physical robotics causality claim.

## Receipts and hostile tests

Every candidate records route ID, source, goal, interfaces, relations, all constraints, satisfied/rejected route constraints, planner version, registry digest, and plan digest. Search-level rejected alternatives remain attributable in search output; a valid candidate has no rejected constraint on its own path.

Every execution records a separate occurrence ID, actual traversal prefix, observed relation receipts, native refs, crossing refs, source/descendant particulars, result, residuals, and failures. Signed crossings and receiver receipts are saved alongside the records. `verify-run.mjs` checks registry and plan bindings, receipt digests, ancestry, actual traversal, core signatures, payload addresses, local disposition, and the freeze. A partial failure retains its observed prefix without claiming the planned suffix occurred. Hash and signature verification establish binding and attribution; they do not make native assertions universally true.

Tests attack fake compatibility, authority and observe→mutate escalation, capability→permission escalation, admission bypass, hidden system switches, cycles and infinite routes, unsupported information widening, false lossless/reversible claims, false retention/replayability, witness/source confusion, history/operative confusion, field/coordination confusion, mutable registries, runtime payload substitution, collapsed particulars, and tampered plans/receipts. They also exercise equal bytes across distinct routes, two MIDI timings, irreversible descendants, opaque execution, useful why-not results, and local receiver refusal.

The workflow [INTERFACE-SUPERSPACE-001](../../.github/workflows/interface-superspace-001.yml) runs hostile tests, the existing full verification suite, all real proofs including vanilla, and independent saved-evidence verification.

## Earned claim

A heterogeneous set of already-existing software, world, transport, analytical, and control boundaries can be represented as independently addressable interface particulars. Bounded lawful candidate routes across the provisioned executable boundaries can be synthesized from declared affordances and constraints rather than named adapter-specific routing glue. Those routes execute through existing reLATTE crossing semantics without enlarging the normative core or inheriting authority across interfaces.

This specimen does not establish universal interoperability, automatic semantic understanding, general device control, global discovery, physical causality, perfect route optimality, or a universal interface ontology. Declaration and local attestation remain explicit trust inputs. Discovery remains separate from selection; selection from execution; execution from local admission; and receipt from truth.
