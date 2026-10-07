# FATHERHAND-HOSTILE-001

This is the first integrated hostile founding/descendant specimen, bounded to protocol referents and local processes. Its six final claims F01–F06 appear in [the claim matrix](FOUNDATION-OF-TRUST-001-CLAIM-MATRIX.md); machine/domain/human claims are C26–C28 [F01–F06, C26–C28].

```text
independent constitution A
          │
          │ signed source + independent-key receiver
          │ bounded founding LINEAGE declaration
          ▼
independent constitution B
          │
          │ fresh signed source + C2 receiver
          │ descendant LINEAGE declaration, parent = prior crossing
          ▼
independent constitution C2
```

Each participant runs in its own native process, independently creates its own constitution nonce and P-256 key, and retains private material in a separate local store. Identical seed bytes and common declared ancestry do not merge the randomly constituted referents. The policy signer separately binds SOURCE/RECEIVER key roles to those IDs; its selection is an ASSUMED root, not identity truth encoded in fixture labels [F01, C22, C23].

A signs one bounded founding handoff with an exact payload digest reference, declared endpoint relation and event-policy ID. B reads only A's public crossing and signs its own matching receipt. Neither participant's private key is included in public crossing, receipt, policy, inventory or identity metadata [F02, F03]. Actual payload material, trusted arrival time and human identity remain UNOBSERVED [C10, C13, C27].

The harness deletes A's local identity/private-key working directory after A has exited. A fresh B process restarts from B's durable identity and the public AB bundle. B then signs a descendant handoff from **B's** referent/key, and independently constituted C2 signs its receiver account. The BC2 crossing causally cites the AB crossing ID. The harness removes the B/C2 stores as well [F02, F04].

Fresh primary verifier C and independently implemented native verifier D receive public bundles and separately selected policy/inventory roots. Both reproduce the two edges after the original participant stores are gone. This is observed survivor reconstruction of the bounded public record; physical memory erasure, remote platform death and administration/custody independence remain UNOBSERVED [F05, C24, C26–C28].

The archived constitution IDs remain distinct: A remains a historical referent, B remains B, and C2 remains C2. A founder-only capability grant is not present for either child. The signed edges are `LINEAGE`, not `SAME_PARTICULAR`; neither edge is converted into a continuity path or a capability grant. The assessor always leaves authority/admission/finality UNOBSERVED and never infers current acceptability solely from lineage [F06, C05, C18, C19, C25, C33].

This specimen does not earn “B contains A”, “B can use dead A's key”, “A equals B”, “B inherits A's authority”, or “historical continuity currently authorizes an act”. Key distinction and policy-bound roles preserve attribution, while grant/admission remain separate explicit local questions [F01, F06, C03, C19, C25].

## Durable evidence and replay

The frozen artifacts are [fatherhand.json](../fixtures/foundation-of-trust-001/fatherhand.json), [AB/bundle.json](../fixtures/foundation-of-trust-001/AB/bundle.json), [BC2/bundle.json](../fixtures/foundation-of-trust-001/BC2/bundle.json), and the two `*-roots.json` files. Root files record the harness's selected assumptions; transport alongside the bundle does not make them trusted [F02, F03, C22].

```sh
npm run trust:replay
node --test --experimental-strip-types test/fatherhand-hostile.test.ts
node --experimental-strip-types scripts/foundation-of-trust-specimen.mjs /tmp/fresh-fatherhand-public
```

The integrated test also removes or corrupts transported evidence and invokes both verifier implementations on the same frozen fixtures. A lost source/receiver record becomes HOLD under the retained inventory pin; a valid historic signature does not become current authorization. These checks supply bounded architecture inputs for FounderSeed/FatherHand, not a normative theory of personal identity [C15, C18, C24, F05, F06].
