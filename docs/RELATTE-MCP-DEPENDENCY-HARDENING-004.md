# RELATTE-MCP-DEPENDENCY-HARDENING-004

Status: experimental review slice stacked on RELATTE-CHATGPT-MCP-003. No deployment or plugin submission.

## Trigger and verifiable diagnosis

MCP-003 pinned @modelcontextprotocol/client at 2.0.0 (dev-only, used for the independent official MCP-client test).
GHSA-6qxp-vccf-f47h / CVE-2026-104850 covers MCP client versions >=2.0.0 <2.2.0.
It describes potential OAuth credential redirection when certain client auth helpers use an authorization server selected by a malicious or compromised MCP server.
The user-facing MCP plugin is not deployed; reLATTE's test client uses synthetic credentials and was not exercising this exploit.

Official advisory: https://github.com/advisories/GHSA-6qxp-vccf-f47h
Upstream release: https://github.com/modelcontextprotocol/typescript-sdk/releases/tag/v2.3.1

## Change set

1. Exact-pin both @modelcontextprotocol/client (dev) and @modelcontextprotocol/server (runtime) to 2.3.1; keep both matched.
2. Record npm-generated package-lock v3 with integrity and resolved package URLs for full tree.
3. CI uses npm ci --ignore-scripts --no-fund and pins GitHub Actions by reviewed SHAs. Third-party install lifecycle scripts do not execute.
4. CI runs production and full-tree npm audit with audit-level moderate, failing on moderate/high/critical findings.
5. scripts/check-dependency-policy.mjs rejects absent/altered lock, version ranges, SDK downgrades, untrusted registries, missing sha512 integrity or accidental production MCP test-client dependency.
6. Dependabot schedules weekly npm and GitHub Actions PRs; review remains human-controlled.

## Checks and interpretation

- npm audit 0 vulnerabilities means no known issues were reported against the scanned resolved tree and current advisory feed. It does NOT guarantee code safety or that future advisories will not emerge.
- Verification of signatures under embedded public keys is independent from the safety of npm distribution and is not source authorization.
- npm ci requires package and lockfile agreement; this prevents unreviewed dependency drift between runs.
- Exact pins do not automatically upgrade: Dependabot PRs and active review are the path for intentional updates.
- Development dependencies still matter because CI and developers execute them. We therefore audit the full tree, not just production.
- Use GitHub branch protections to make the verify check required before integration.

## Gates not crossed

No public host, customer authorization, OAuth credentials, receiver key custody, plugin approval, or merge is inferred.
Do not use npm audit fix --force on an unreviewed branch. Review upstream releases and reproduce tests after each dependency update.

## Release sequence

npm run deps:policy
npm ci --ignore-scripts --no-fund
npm run audit:prod
npm run audit:all
npm run verify

Only after all pass, review changed code and commit/lockfile differences. A successful npm audit is one witness, not the authority to deploy.
