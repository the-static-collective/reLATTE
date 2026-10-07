# FOUNDATION-OF-TRUST-001 — threat model

All claims below are classified in [the claim matrix](FOUNDATION-OF-TRUST-001-CLAIM-MATRIX.md). The model supplies consistency/reconstruction within explicit roots, not generic security or truth [C10, C22, C23, C37, L02].

## Adversary and observation scope

The attacker may independently compromise source, receiver, verifier, any one signing key, broker, mutable storage, clock, network order, CI configuration, one archive, one mirror, DNS/route, cached state or replay bundle; combinations follow. Participants may intentionally sign false or conflicting claims with valid keys. Artifact possession and runtime labels are never authority; valid signatures remain valid attribution even when semantics or current policy reject their claim [C12, C25, C32].

Scope is an externally selected, signed inventory of **observed** records. The verifier reproduces checks without producer memory and without trusting a prior assessment. The inventory is an observation commitment, not a globally complete ledger. First-observer withholding remains a successful attack if the observer selects the attacker's smaller inventory pin [C14–C16, C22, C24, C37].

## Trust boundaries

| Boundary | Required observation | Failure behavior | Classified basis |
| --- | --- | --- | --- |
| Raw public artifact → parsed record | bounded size, ordinary JSON, no duplicate names/private fields, allowed files, no symlinks | HOLD with parser/filesystem reason | C30 DERIVED; F03 OBSERVED |
| Parsed record → signature attribution | recomputed canonical ID; P-256; canonical encodings | HOLD / invalid witness signature | C03, C10, C32 DERIVED |
| Attributed signer → witness role | externally pinned signed event policy, normalized key, exact role/world/particular | HOLD / unauthorized role | C20 DERIVED; C22 ASSUMED |
| Witnesses → matching edge | causal crossing receipt, payload digest reference, same handoff/endpoints/relation | HOLD / binding disagreement | C10, C11 DERIVED |
| Matching edge → quorum | unique eligible key witnesses, source and receiver roles, signed quorum version | HOLD / duplicate or insufficient quorum | C20 DERIVED; C21 UNOBSERVED for domain quorum |
| Known record set → coherent scope | all inventory records retained; no authorized conflicting account | HOLD / missing evidence or equivocation | C14, C15 DERIVED; C16 REFUTED for global scope |
| Old edge → current acceptability | separate explicit local current policy/world/retirements/accepted IDs | historical result retained, current false | C18, C19 DERIVED |
| Current acceptability → admission/authority/finality | separate local consequential rule | UNOBSERVED in this assessor | C25 REFUTED as automatic inference; C33 DERIVED |
| Producer output → replacement verifier | durable public records plus separately selected roots | replay checks; assessment output rejected as extra evidence | C24 OBSERVED; C25 REFUTED as proof |

## Compromise matrix

“Historical evidence remains” below always means surviving immutable **receipt content and selected pins**, not an ability to prove when that content was signed or whether it was truthful [C10–C13, C18, C22, C37]. HOLD has zero earned conclusion confidence; attributable signatures can remain in `signature_valid_ids` [C15, C32].

| Compromise | Attacker can forge/manipulate | Cannot establish under retained honest roots | Reconstructible prior evidence | Earned ceiling / degradation | Recovery | New human decision? |
| --- | --- | --- | --- | --- | --- | --- |
| A key | New valid source claims, backdates, competing child accounts | B's signature, original pinned receipt bytes, new accepted inventory pin | Existing A/B signatures and bindings, not reliable signing time | Source-only E2; known equivocation/inventory injection HOLD; old complete coherent scope remains E3 | Retire key in local policy; retain old receipts; new source membership/edge | Local retirement may be automated by already adopted policy; choosing a new trust root requires external decision |
| B key | New valid receiver accounts, arrival backdates, refusal/reception equivocation | A's signature or trusted arrival chronology | Existing source/receipt content under old pins | Old complete scope E3; new conflicting scope HOLD; chronology UNOBSERVED | Retire B key; retain history; new receiver key and fresh receipts | Same boundary as A |
| A+B keys | Fully compatible forged testimony, backdated pair, malicious lineage declaration | Historical truth; old selected inventory/policy mutation without breaking pins | Original receipt bytes and their key attribution | New selected forged scope can earn E3 **consistency only**; truth and trusted time UNOBSERVED | Independent observation/admission; retire both; externally reselect membership if continuing | Yes for selecting replacement trust/admission unless a prior local rule explicitly authorizes it |
| Broker/DNS/route/order | Delete, delay, reorder, truncate, replay, substitute, mix runs, replace transport | Manufacture a compatible authorized signed edge under retained pins | All surviving public records, independent of transport | Complete unchanged scope retains E3/quorum; incomplete/substituted scope HOLD | Retrieve exact public records from surviving archive/mirror; preserve external pins | No for retrieving identical evidence; yes if replacing roots/scope |
| Verifier C | Arbitrary assessment output; suppress local evidence | Make D's fresh computation pass altered records | Entire surviving public bundle | C's report supplies no evidence; D may reproduce E3/quorum | Replace executable/runtime/configuration and replay with independent path | No new identity decision when existing roots survive; establishing a new trusted execution root is external |
| One archive/mirror | Withhold known rival, lose record, alter bytes | Change pinned inventory/signatures; prove absence of unseen rivals | Any redundant exact record and externally retained pins | Known missing record HOLD; coherent complete mirror preserves prior level; unknown withheld conflict is undetectable from subset | Restore missing records; union observed conflicts; select expanded inventory | No for same records/pins; external decision for new inventory scope |
| Clock | All timestamps and apparent age/expiry | Causal crossing digest; true arrival time or signature creation time | Signed contents and causal receipt reference | No change to E3 solely for clock disagreement; chronology remains UNOBSERVED | Use causal references; require separately specified trusted-time evidence if time matters | Required only to adopt a new time dependency/root |
| Policy signer | Sign new membership, quorum, inventory and false administration claims | Rewrite an exact previously selected policy/inventory pin | Old signed policy, inventory and witness bytes | Old pinned coherent scope retains E3; replacement rejected HOLD; accepting attacker-selected new pins removes the membership assurance | Retire root; independently select new policy; preserve historical pin | Yes for new root selection unless a prior external governance rule supplies it |
| One witness record lost | Deny access to source/receiver/quorum or conflict record | Recreate missing signed evidence; upgrade known scope | Remaining attributable records, and inventory proof that required evidence is absent | HOLD on incomplete frozen scope; source-only E2 requires a separately selected source-only scope | Exact recovery from mirror; otherwise retain HOLD | No for exact restoration; external decision for different scope |
| All original processes dead | Prevent new acts; erase producer working stores/keys | Erase surviving public record content merely by process death | Public signatures/policy/inventory and declared lineage | Local tested public replay retains E3; machine/domain/death claims not learned from bundle | Fresh verifier, surviving public archives and pins; B restart uses its own durable local identity | No to replay existing roots; new acts/keys require the declared local selection process |
| All usable public archives/pins lost | Make reconstruction impossible | Recover absent content or choose authentic bootstrap from nothing | Nothing usable in supplied scope | E0; empty declared scope UNRECOVERABLE; uncertainty of retrieval remains HOLD | Obtain an independently retained copy or begin a newly selected history | Yes if starting/selecting a new root; no invented historical repair |
| CI job configuration | Fabricate signed fingerprints, change executable, leak keys outside intended transport, make verifier lie | Earn honest external machine/domain/human evidence from self-report | Old pinned public records can still be replayed by an honest external verifier | Public evidence E3 consistency only; external machine/death claims UNOBSERVED | Independently inspect pinned workflow/job execution; isolate administration and replace verifier | New external/platform trust decision if its root was compromised |

Matrix basis: endpoint/key attacks [C12, C13, C18, C19, C32]; broker/archive/clock attacks [C11, C14–C17, C25, C30]; policy/verifier roots [C22–C24, C37]; process loss [F03–F05]. Human-decision entries describe the explicit **ASSUMED** root-selection boundary, not proof of human governance [C21, C22, C27].

## Trust domains and observation discipline

The provisional ordering “key < process < runtime/machine < custody < administration < human decision” is not a universal independence theorem. The assessor reports facets separately; none imply non-collusion [C08, C09, C21, C26–C28].

```json
{
  "signing_identity": "OBSERVED",
  "distinct_key": "OBSERVED",
  "distinct_process": "UNOBSERVED",
  "distinct_runtime": "UNOBSERVED",
  "distinct_machine": "UNOBSERVED",
  "distinct_custody_domain": "UNOBSERVED",
  "distinct_administrative_domain": "UNOBSERVED",
  "distinct_human": "UNOBSERVED",
  "non_collusion": "UNOBSERVED"
}
```

The FatherHand harness separately observes local process separation and store removal; it does not place those observations into a stronger cryptographic custody conclusion. Existing three-runner CI can provide external job observations, but shared orchestration/administration and unverifiable self-reported hardware prevent promotion to independent human/custody domains [C26–C28, C36, F04].

## Root compromise and bootstrap paradox

The complete graph is [trust-root-graph.json](../fixtures/foundation-of-trust-001/trust-root-graph.json). Roots terminate in declared **ASSUMED** cryptographic correctness, external policy/inventory selection, an honest replacement verifier and sufficient durable survival. Signature/role/edge conclusions are **DERIVED**. Local harness process/store removal is **OBSERVED**. No circular justification is accepted [C22, C23, C37, F04].

A new verifier can learn which roots are required and reproduce internal checks without hidden creator memory. It cannot discover which of two valid roots a sovereign receiver ought to choose. If its root selector, both endpoint keys or sole executing verifier are malicious, the public proof cannot authenticate the selector's own trustworthiness [C12, C16, C22–C25, C37, L02].

The model therefore preserves the distinction between historical attributable evidence and current authority. It does not supply human independence, global completeness, non-collusion, universal expiry or universal finality [C13, C16, C18–C22, C27, C33].
