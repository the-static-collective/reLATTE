# LANTERN 014 — THE SOLO DESK

**Status:** Experimental, user-directed offline personal tool. No other people, collaboration, accounts, server, API key or paid compute required. It is deliberately separate from the 013 fictional village and the 010–012 Minecraft saved-world cartridges.

## The problem we are actually testing

Can one person bring an ordinary unresolved problem into LANTERN and, in a few minutes, leave with a **usable first action**, an **editable work product**, and a **local record of what they actually accomplished**?

This is a small utility; it does **not** autonomously repair the underlying problem, provide professional advice, or claim that writing a plan completes the task.

## One-file app

Open `Lantern_014_The_Solo_Desk.html` in a recent local browser; no web requests are sent by the app. No installation, sign-in, or server. Run locally on a phone, Mac or Windows device; save/export your work to files you control.

Choose one of four lanes:
- **Untangle:** turn a vague problem into known facts, unknown questions and the smallest next action.
- **Make:** create an editable practical first-draft scaffold.
- **Decide:** compare two actions and make a reversible trial rather than a false automatic recommendation.
- **Test:** form an expected/observed debug receipt and test one reversible cause.

Describe the issue in plain language; optional fields state a desired outcome and existing constraint. Choose 5, 10, 20 or 40 minutes, or press **I just need a 5-minute start** without filling anything in. The app generates a user-editable note with a finish line; the note itself is the initial deliverable.

The person can explicitly mark the action **completed**, record what changed (including failed attempts), save a snapshot, create a new fork without overwriting the prior snapshot, copy/download the work as a `.txt` file, print it, or import/export the entire shelf as `.json`.

## Boundaries we preserve

1. **No fabricated capability:** the app uses fixed local action templates, not cloud AI, context inference, remote file access, messaging, or a web search. It does not open folders or execute edits on the person's behalf.
2. **Truthful completion:** work starts as a draft; completion is only a **user-reported claim**. There is no false independent verification.
3. **Private by default:** entries are stored in the browser's localStorage when available. It never uploads them. Local storage can be cleared by the browser; use Export shelf for backup, including in private browsing.
4. **Versions are local project snapshots:** the version shelf is not a P-256-signed reLATTE crossing, a Minecraft save cartridge, or a globally verifiable proof of real events. Forks preserve an explicit parent identifier. Snapshots are editable only via new working copies, not by changing old saved snapshots.
5. **No network:** the entire runtime (HTML/CSS/JS) is embedded in one file with no external script, stylesheet, font, endpoint or fetch call. It should work offline in current browsers. Not every older WebKit browser supports the same local storage and download UI.
6. **Caps:** maximum 60 local snapshots; individual notes and fields are length-limited to limit storage failure. A JSON import is locally validated, must be explicitly confirmed and replaces the local shelf only after that confirmation.

## Trial anyone can perform alone

1. Open the single HTML file.
2. Choose **Untangle** and write: `I have hundreds of pictures and don't know which are worth keeping.`
3. Outcome: `Find my first ten good photos.` Constraint: `Only ten minutes and my existing laptop.`
4. Press **Build my next move** and actually write knowns, unknowns, and a first action.
5. Do the action. If you did, mark it complete and write what changed; if you couldn't, leave it incomplete and record the obstacle.
6. Save snapshot, optionally fork to try another method, then download `.txt` or export the shelf.

**Success measure:** user produces one tangible artifact and records a real external action. Neither the tool nor this README asserts any action succeeded simply because a template was generated.

## Repo and test

- App: `experiments/lantern-commons-014/Lantern_014_The_Solo_Desk.html`.
- Local VM tests: `node --test experiments/lantern-commons-014/test_solo_desk.mjs`. They check four work modes, local persistence, version forks, explicit completion, export, untrusted user strings and no remote runtime calls.
- GitHub workflow: `.github/workflows/lantern-014-solo-desk.yml`.

### Next honest frontier

Run a small *real-use* trial: did a user make one genuine change to a physical or digital problem without another person and record it? Only after that evidence should we decide whether to add richer skill cartridges, on-device model assistance, or a bridge to the wider Commons. Do not build the backend before it is needed.
