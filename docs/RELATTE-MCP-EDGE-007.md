# RELATTE-MCP-EDGE-007 — First Real Door, release held

**Status: GitHub draft only. NOT publicly deployed. No ChatGPT OAuth link or OpenAI plugin approval.**

## Observed connected Vercel scope, 2026-10-09

- Available team: `theotherlucasv-1250s-projects` (`team_A6mP6EYc1iOBxsd7jYsniIox`).
- Existing unrelated projects include `webz-field-porch` and `gro-field-scout`; do not recycle them as the reLATTE identity host.
- **No reLATTE Vercel project** linked to the GitHub reLATTE repository in the available project listing.
- **No domain registrations** returned for the connected team.
- Therefore NO owned production resource URL was inferred, purchased, routed, or published.

## Implemented edge surface

- `vercel.json` specifies only two stable routes: `/mcp` → `/api/mcp` and `/.well-known/oauth-protected-resource` → `/api/protected-resource`, with no-store cache headers.
- Existing `api/mcp.ts` and `api/protected-resource.ts` use Web-standard Vercel Node functions. No receiver admission API is exposed.
- `src/mcp-edge-readiness.ts` assesses RFC9728 protected resource and issuer OAuth metadata: exact URLs/issuer, S256 PKCE, code flow, scope, issuer-owned JWKS/introspection and CIMD or DCR.
- `scripts/mcp-edge-probe.ts` optionally fetches only public metadata over HTTPS, with no redirect, 3s timeout and 16KiB streaming cap. No OAuth tokens or credentials are read.
- `src/mcp-oauth-resource.ts` now emits the ChatGPT `mcp/www_authenticate` tool-result metadata *only* for explicitly approved read-only tool names and unauthenticated calls, alongside `WWW-Authenticate` and per-tool `securitySchemes`.
- A missing identity/revocation configuration still yields HTTP 503 at the Vercel boundary; the server never silently runs in anonymous verification mode.

## Repeat offline checks

Run `npm ci --ignore-scripts --no-fund`, `npm run deps:policy`, `npm run audit:all`, and `npm run verify`. The test suite checks edge routing, metadata contradictions and ChatGPT linking challenges.

## First real HTTPS release checklist

1. Select an owned and verified stable HTTPS hostname, such as `mcp.<owned-domain>`, or a verified Vercel host for private smoke testing. Do not invent a domain. Ensure team/project alignment.
2. Provision an **external** identity provider with MCP-compatible OAuth 2.1 metadata, client registration (prefer CIMD with `none` or `private_key_jwt`, or DCR), S256 PKCE, authorization-code flow and exact RFC8707 `resource` propagation into access token `aud`.
3. Confirm the provider supports **our stricter RFC7662 profile**: `active`, `iss`, `aud`, `sub`, `iat`, `exp`, `jti`, and `scope` on introspection. Not every compliant RFC7662 provider emits these optional claims; missing fields MUST cause HOLD, not an auth bypass.
4. Configure protected Vercel secret-managed environment settings on the reviewed project (never paste secrets into chat, source or CI logs):

   - `RELATTE_MCP_RESOURCE` — exact HTTPS resource URL ending `/mcp` (JWT audience).
   - `RELATTE_OAUTH_ISSUER` — exact external OAuth issuer.
   - `RELATTE_OAUTH_JWKS_URI` — issuer-hosted HTTPS JWKS location.
   - `RELATTE_OAUTH_SCOPE` — `relatte:verify` (or explicitly reviewed equivalent).
   - `RELATTE_OAUTH_INTROSPECTION_URI` — issuer-origin RFC7662 endpoint.
   - `RELATTE_OAUTH_INTROSPECTION_CLIENT_ID` — resource-server introspection client.
   - `RELATTE_OAUTH_INTROSPECTION_CLIENT_SECRET` — secret-manager only.
   - Optionally `RELATTE_OAUTH_METADATA_URI` for public-only readiness probing.

5. Run public-only probe with the five NONSECRET resource/issuer/JWKS/introspection/scope variables set:

       npm run mcp:edge:probe

6. Run live inspector with *provider-authorized test account*, verify linking UI and actual token exchange. Confirm issuer response `iss`, callback URL registration, token `aud`, required scope, refresh/revocation, invalid token and stale signing key handling.
7. Review TLS and OpenAI managed mTLS attestation at ingress. Vercel HTTPS termination is NOT by itself evidence of ChatGPT client-certificate validation. Do not claim client-authentication enforcement unless verifiable at the edge.
8. Install rate limits and observability without logging raw bearer tokens, sensitive tool arguments, private receipts, JWT subjects or introspection client credentials.
9. Require a protected release review on an exact Git commit. Deploy staging only after authorizing a project+domain+environment and proving all gates green. Do not let `create_git_project` auto-deploy the unrelated default `main` branch while the stacked PR chain is under review.
10. Only then consider independent ChatGPT custom MCP connection and later verified OpenAI plugin submission with privacy policy, terms, support, reviewer demo user and owner verification.

## Critical HOLD distinctions

- **Green metadata probe != domain ownership.** Metadata may be syntactically coherent at an attacker-controlled test host.
- **HTTP 200 with tool OAuth challenge != authenticated tool result.** The content is an error; no verification is performed.
- **Bearer JWT != sender-constrained possession.** Replay protection is limited without verified DPoP-capable client and durable shared replay store.
- **OAuth signed token != verified human legal/receiver authority.** The three exposed tools remain read-only.
- **Public HTTPS access != OpenAI mTLS client attestation.** Verify client chain separately.
- **Verified signature != actual event. RECEIVED != ADMITTED.**

## Primary published references

- https://developers.openai.com/plugins/build/auth
- https://developers.openai.com/plugins/build/mcp-server
- https://developers.openai.com/plugins/deploy/app-review
- https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization
- https://vercel.com/docs/functions/runtimes/node-js
