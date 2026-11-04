# SPAWN 020 — Imagination Loom
## A world-building engine that cannot hallucinate completed work

**Main file:** Lantern_020_Imagination_Loom.html
**Composes:** SPAWN 017 (one operator/many hats), 018 (gleaning), 019 (bounded maximum-action search).

### What changes
SPAWN 019 compared a finite catalogue of actions. The Loom builds **new hypothetical actions by recombination of existing user operations, known constraints, and explicit transformation rules**. It asks: **What else could these same ingredients become?**

An operator can request:
- **Grounded:** stay close to a test the operator can try locally, and penalize unknown resources.
- **Surprising:** favor lateral connections between two hats that do not normally share a workflow.
- **Wild:** favor cooperative and replicable designs while still specifying one falsifiable first test.
- Define largest impact as lasting **capacity**, wider **reach**, or **cross-hat bridges**.
- Enter a private **north-star vision** and/or **what-if premise** as hypothesis generators. No assumption is accepted as fact simply because it appears in an input.
- Browse additional deterministic batches, avoiding repeated cards.
- Expand any scenario into three more testable forks: remove an expensive dependency, package it for independent repetition, or invert the resource/request flow.
- Explicitly stage a chosen first physical/digital test on the existing operation's TODO board; **never complete the task automatically**.
- Export a printable local hypothesis card with assumptions, material questions, provenance, the first disconfirmable test, and a blank space to record what actually happened. No external publication is called.

### Generative machinery and provenance
Suggestions are created with an **inspectable offline possibility grammar**, not a remotely hosted AI:
1. **One hat**: reverse an offer into needs discovery; subtract money/people/venue dependencies; create a portable method; imagine independent copies without treating them as real.
2. **Two hats**: hand off an output from one project into another; simulate a two-role transaction by one person; piggyback onto a real, separately permissioned occasion; check if an actual spare from one operation might fill another operation's gap.
3. **Three hats**: braid a reversible demonstration station; draft a repeatable multi-hat kit.
4. **Grounded signals**: a reported *blocked* task can produce a redesigned test; a recorded same-category offer and need can suggest a compatibility question. **Category overlap is not proof of suitability.**
5. **Counterfactuals**: the operator's own goals or what-if premise suggest additional first tests. Their truth and feasibility remain unknown.

The interface shows each idea's **source, roles, unknown ingredients, reason for consideration, alternative hypothesis, falsification condition, and exact first test**. It never assigns new people, creates stock, assumes attendance, declares a sale, or accesses someone's garage without explicit inputs.

No single algorithm can produce every idea or establish a mathematically maximal outcome from incomplete knowledge. The Loom's possibilities are **conditional thought experiments** from the hats currently recorded. It can still miss a strong idea; the operator can submit another provocation and generate new combinations.

### Try a field test
1. Open the HTML locally in a recent browser. Seed the community organizer, grower and artist hats.
2. In **Gleaning**, record one actual resource you've checked; mark unknown and missing materials accurately.
3. In **Imagination Loom**, try **Surprising / Bridges** first. Type a real north star (for example, a single person operating an affordable resource exchange).
4. Select **Weave possible worlds**, then **Show another batch**. Compare a cross-hat output-input experiment, a tabletop simulation, and a portable kit. Notice their different assumptions and resource questions.
5. Try **Wild / Reach** and supply an explicit what-if premise such as "what if we needed no new venue or money?" This becomes a hypothesis, not an assertion of feasibility.
6. Pick one candidate, click **Expand this possibility**. Choose a counterfactual child and stage one observable first proof.
7. Perform the test in the real world without inferring permission, capacity, food/equipment safety, outside collaborators or guaranteed outcomes. Record what actually happened using the original operation's task interface.
8. Export a hypothesis card for a review or a separate demonstration. **A hypothesis card is not an evidence report.** The test result must be entered by the actual operator.

### Limits
- This is still a **deterministic source-owned generator**, not a language model, open-web searcher, background scanner, community matchmaker, predictive impact optimizer or autonomous physical executor.
- Generation selects at most twelve existing hats and a bounded set of pairs and matches. The browser does not become an infinitely expanding search engine; it exposes interpretable exploratory branches that are intentionally inexpensive to run offline.
- The Loom and existing desk share the **SPAWN 018 localStorage key**, so all prior 018/019 data is only available on the same origin. Nothing is silently synchronized to Supabase. Preserve a **private backup** as necessary.
- External actions involving venues, people, access, food distribution, money, publication or rights still require distinct permission/verification; a generative output is never such permission.
- User-entered hats, goals and counterfactuals may contain sensitive details. Avoid entering private names, addresses, secrets or credentials on a third-party preview. A **downloaded hypothesis card includes the relevant user-entered titles/assumptions**: review before sharing.
- Reusing a found resource from another hat still requires an explicit check of capacity, compatibility, ownership, safety and availability. No self-reported check is independent proof.

### Evidence
**Automated**: Run the local Node test with the command: node --test experiments/lantern-commons-014/test_imagination_020.mjs . It reuses inherited cases and generator invariants: unique hypotheses, two- and three-hat constraints, no false resources, disconfirmable tests, actual blocked tasks, recorded category overlaps, counterfactual input status, expansion forks, accurate TODO-only staging, duplicate refusal, and local export.

**Unproven**: Whether the Loom finds materially novel, unexpectedly useful ideas in a real-world field test; suitability of proposed logistics; accessibility across browsers; measured savings or community impact.

**Source state:** draft stacked PR, not merged or deployed to the live Supabase Commons or the main GitHub Pages site.
