# WORLD-FORGE-005 — The Cartridge That Learns (bounded)

**Status:** owner-approved experimental *candidate* on top of [WORLD-FORGE-004 draft #142](https://github.com/the-static-collective/reLATTE/pull/142), itself stacked on [WORLD-FORGE-001/CRATER-SMASH-002 draft #138](https://github.com/the-static-collective/reLATTE/pull/138). No normative reLATTE core changes. The program does not perform unconstrained machine learning or automatically import third-party instructions.

## The testable cross

1. Two **fresh official Mojang Java 26.1.1** GitHub runners independently host ALPHA and BETA. Each operator executes world build, meteor impact, and visual station repair. Separate Mineflayer **non-OP** client processes inspect the actual blocks after each stage; their operator-socket environment excludes the RCON password. Exact operator command trace plus non-OP block observations are preserved.
2. `src/forge.mjs` refuses malformed origins, wrong author-vs-observer separation, duplicate or missing stages, changed source fixture, extra/forged Minecraft operator commands, wrong seeds, absent raw bytes, unsupported donor materials, and bad source versions. It extracts a tiny **declarative two-verb candidate** from the two distinct worlds: `REPLACE original material → impact`, `RESTORE impact → original material`, with source evidence/trace byte digests, material slots, preconditions, and an explicit `HOLD` status.
3. A fresh Godot 4.4.1 sandbox receives the **candidate as JSON data**, not as executable GDScript. A hardcoded, strictly bounded interpreter applies the extracted operations to a new GOLD surface at previously unused coordinates in GAMMA. Unlike the preceding experiment, the three stages are **driven by the extracted candidate**, rather than individually preset in the Godot author script.
4. A **different Godot engine process** reads three separately serialized actual 3D `BoxMesh` scene snapshots, classifies the observed materials, and produces a reader report.
5. `src/verify-replay.mjs` independently re-derives the candidate from the original raw Minecraft donor files, verifies the candidate, inspects the Godot operator/observer reports and distinct scene snapshots, compares all three *intermediate* stages and source ancestry, and issues a **held, non-authoritative** bounded rehearsal report.

## Run it

```sh
node --test experiments/world-forge-005/tests/forge.test.mjs
```

The runtime workflow `.github/workflows/world-forge-005-learn-and-rehearse.yml` runs the test in separate official Minecraft and pinned Godot engine jobs. Inspect the **exact commit, logs, artifacts, report and engine versions**; unit tests are not proof of in-engine execution. The Minecraft test is confined to throwaway offline-mode loopback CI worlds, and only their specific CI instances accept the server EULA. No valued game worlds should be used.

## Where evidence ends

- Source attestations are from one CI operator under one infrastructure trust domain; Minecraft observers are unprivileged protocol clients, **not independent humans/institutions**.
- Godot observer reads scene snapshot files after the author process ends; **not live independently networked gameplay**.
- Byte digests establish local consistency of the supplied files; **not source-native verified reLATTE signatures** or identity. The older official-Minecraft PR #101 signature and ancestry importer remains unimplemented here.
- It demonstrates one small, allowlisted **repair transition grammar** across two Minecraft materials and a third Godot material. It does **not** learn arbitrary build skills, infer real construction from pixels, transfer full Minecraft physics, or establish inventory/salvage/economic parity.
- The Godot target is a **pre-authorized sandbox rehearsal**, not automatic admission or an offer to an actual receiving community. The emitted candidate and report stay `HOLD`; no tokens, finances, real-world equipment, hosting commands, or third-party consent are involved.

> WITNESS != GENERALIZATION != REPRODUCTION != PERMISSION

## Next honest gate

Add a native raw signed source importer pinned to the official two-world Minecraft PR #101, explicitly preserving observer/operator distinction, and then demonstrate a second independent engine whose action sequence can be reconstructed from the portable candidate without author intervention. Keep receiving-world permission separate.
