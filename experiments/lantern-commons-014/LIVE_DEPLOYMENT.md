# LANTERN 014 — Public Solo Desk deployment

## One-file service boundary

Source: `experiments/lantern-commons-014/Lantern_014_The_Solo_Desk.html`.
The deployment job publishes only that standalone HTML as `index.html`. JAR;VIS Step 03 can execute four real LOCAL operations: append checklist, download CSV tracker, download portable HTML work card, and audit the draft. It does not run cloud models, contact people, modify GitHub or browse sites.

## Free public site (no Vercel)

Proposed site: https://the-static-collective.github.io/reLATTE/

The workflow `.github/workflows/lantern-014-github-pages.yml` validates source, checks Pages setup, avoids overwriting an unrelated site, and deploys using official Pages actions, then independently tests the HTTPS response.

**First deployment requires a one-time GitHub Pages owner setting if Pages is disabled:** https://github.com/the-static-collective/reLATTE/settings/pages → Build and deployment → Source = GitHub Actions. Standard `GITHUB_TOKEN` cannot enable the Pages service by itself.

No abundent.org DNS, other site or email setting is changed. A future separately authorized domain could be solo.abundent.org.

## Privacy

The page source is publicly hosted but notes live in each visitor's browser localStorage; no server-side data or automatic upload. Export backup if it matters. Do not store secrets in public/shared browser localStorage, particularly under shared github.io origin.

**Never call this live until the independent GitHub Actions HTTPS verification passes.**
