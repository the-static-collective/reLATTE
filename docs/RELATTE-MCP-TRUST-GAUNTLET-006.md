# RELATTE-MCP-TRUST-GAUNTLET-006

Status: **experiment only**; stacked on MCP-005 PR #104. No public OAuth provider, TLS certificate, Vercel deployment, user identity, browser OAuth exchange, or ChatGPT publication exists in this slice.

## The first real crossing of the auth chain

Two separately listening loopback HTTP services form an executable test rig:

1. An independent OAuth-style issuer-status/JWKS fixture exposes `/introspect` and `/.well-known/jwks.json` on localhost.
2. The official `@modelcontextprotocol/client` v2 sends real HTTP requests to a separately listening MCP resource service; the resource calls the issuer over its own HTTP socket and only then permits the native signed-evidence verifier.
3. The test controls simulated issuance, revocation, outage and signing-key publication independently of the MCP client. A mock human claims world ownership and asks for `admit_crossing`; the resource returns an explicit deny **before SDK dispatch**.

**Important:** HTTPS issuer/resource *identifiers* are validated, but this test-only fetch bridge maps the identifiers to loopback HTTP listeners. The gauntlet therefore tests network/process boundaries and protocol routing, **not production HTTPS TLS, public DNS, OAuth login UX, OAuth provider conformance, or actual certificate/mTLS trust.** The issuers and tokens are synthetic.

## Exercises

- Official MCP modern negotiation and real `verify_crossing` invocation with native P-256 signed crossing.
- Token checked on every request; previously admitted bearer rejected immediately when issuer status switches to `active:false`.
- Signing-key rollover: old JWKS signer retires; new kid is discovered through the configured issuer JWKS route.
- Cross-resource audience confusion: valid signed JWT with wrong `aud` denied.
- Issuer outage: closed status source yields fail-closed denial.
- Successful bearer login claiming owner status still cannot invoke `ADMIT`, signing, transfers, money movement or any effectful receiver tool.
- Key and revocation calls use isolated network sockets, not local function replacements for the entire request chain.

## Additional hardening

- JWT `iat` may not be in the future beyond the five-second tolerance, and expired tokens are refused even outside JOSE verification.
- RFC7662 introspection responses now have an 8KiB **streaming** bound; a malicious/compromised issuer cannot induce `response.text()` to buffer an unbounded payload before size validation.
- Existing max bearer lifetime, exact audience/issuer/scope, live status, fixed-origin JWKS and egress URL boundaries remain.

## What this does not solve

- Replay of a stolen **bearer** access token while it remains active. Sender-constrained DPoP requires a compatible client and a shared atomic replay store, neither provided by this gauntlet.
- Full RFC7662 interoperability with all identity providers: the strict profile requires `iss`, `aud`, `sub`, `iat`, `exp`, `jti`, and `scope` in the issuer's live status response, though some are optional in RFC7662 itself. Reject and HOLD unless a provider can supply them.
- Independent HTTPS/mTLS certificate validation, official ChatGPT OAuth client login, identity-provider status guarantees, key-compromise emergency revocation across replicas, physical crossing custody or receiver-local authority.

## Repeat

    npm run deps:policy
    npm ci --ignore-scripts --no-fund
    npm run audit:all
    npm run verify

The full `npm test` suite includes `test/mcp-trust-gauntlet-006.test.ts` alongside native reLATTE and SDK security tests. All code uses synthetic fixtures; no real credentials, resources or keys are emitted.

## Release gates

Review test and code before accepting PR. Do not merge/deploy until checks pass. Choose a real OAuth provider/domain *later*; verify exact RFC7662 claim behavior, supported client auth method and discovered metadata. Configure credentials in a secret manager, not in GitHub source. Perform independent HTTPS and custom ChatGPT OAuth testing with review and explicit deployment authority.

### Laws

**ISSUER AUTHORITY != RECEIVER AUTHORITY**

**JWKS REFRESH != INSTANT REVOCATION**

**INTROSPECTION ACTIVE != PHYSICAL EVENT TRUE**

**MCP TOOL DISCOVERY != DISPOSITION GRANT**

Sources:
https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization
https://www.rfc-editor.org/rfc/rfc7662
https://www.rfc-editor.org/rfc/rfc9449
