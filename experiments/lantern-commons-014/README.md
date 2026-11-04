# LANTERN 014 — One Useful Thing

An offline-first, single-person tool for turning a messy thought into **one concrete move, an editable work file, and a personal progress record**. It does not depend on collaborators, an API, an account, a deployment, or a network connection.

## Start

1. Open **`Lantern_014_One_Useful_Thing.html`** in a modern browser. The HTML is fully self-contained; no installation or server is required.
2. Choose **Unstick / Sort / Make a note / Choose a test**.
3. Type one sentence or paste a pile of notes, select a two-, five-, fifteen-, or thirty-minute timebox, and click **Make my next move**.
4. Act on the suggested physical/digital next step. Edit your work note and use **Download .md** for a tangible, portable result. Tap **I did something** only for actions you've actually performed.
5. Optionally click **Save snapshot** for a local record. You can fork a snapshot without rewriting its parent. Export your whole shelf as JSON for a separate backup.

**Useful first experiment:** "I have 40 photos scattered in Downloads. I need to pick three worth keeping." Unstick provides a directly actionable folder-and-files move. Do it, record the actual outcome, and download a note. This does not need anyone else.

## Capabilities and honest boundaries

- **Unstick:** finite, inspectable keyword-based next-step recipes. The program does not inspect your filesystem or claim to have carried out actions.
- **Sort:** splits sentences/lines into checkboxes; rough priority flags come from time-sensitive words such as "today" and "later". No claim of sophisticated task understanding.
- **Make a note:** creates an editable structured text note containing **only your supplied facts** plus clearly marked placeholders for missing details.
- **Choose a test:** extracts reversible options from your words when possible, otherwise provides generic alternatives; **does not choose on your behalf**.
- **Timebox:** local timer runs only while this page is open.
- **Work shelf:** localStorage persists up to 100 **self-reported work-card snapshots** (where browser settings allow it); each new save is a copy with a parent identifier. Snapshot IDs are locally generated identifiers, not cryptographic signatures. Export/import uses a checked JSON format. Do not rely on browser storage as your only backup.
- **Privacy:** zero JavaScript network calls, external CSS/fonts, authentication, third-party analytics, or remote models. Processing happens in the active browser. Optional exported files live wherever the user saves them. Browser/device administrators and local file access still have normal access to local files.
- **No external proof:** A completion checkmark is the user's assertion, not independent evidence. The app does not verify a person's identity, completed work, an actual commitment, external authority, or legal/financial facts.
- **Not a game save:** These are small *work-card snapshots*, separate from the cryptographically tracked native Minecraft world cartridges from LANTERN 010–012 and the fictional Living Commons browser simulation from LANTERN 013.

## Build and test

The standalone HTML embeds the exact contents of `engine.js`, `app.js`, and `style.css` so it can be opened directly with no network or local web server. The canonical local build script is `build.py` and tests are `test_engine.cjs` (15 Node built-in unit tests). No npm packages required.

```sh
node --test test_engine.cjs
python3 build.py
```

The local verification also used headless Chromium at 375px mobile width with `page.set_content` (the browser automation environment disallows navigation to `file:`/local HTTP). The test included making a card, saving a snapshot, editing a fork without modifying the parent, checklist completion, selecting one reversible option, rendering a malicious HTML-like note as **text**, downloading Markdown, and exporting a JSON shelf. Local storage was stubbed in that environment; actual origin-specific browser storage remains dependent on the user's device and browser.

## Success definition for real use

**One person, one self-contained task, one observable change, one file they can keep.** If a session ends with only a proposal to make another proposal, it has not demonstrated usefulness. Failure or noncompletion should be recorded without moral judgments or invented outcome claims.