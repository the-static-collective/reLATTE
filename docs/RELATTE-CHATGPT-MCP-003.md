# RELATTE-CHATGPT-MCP-003 — OAuth resource and official SDK gate

**Status: experimental; NOT deployed, NOT connected to ChatGPT, NOT OpenAI-approved.**
Stacked on MCP-002, which is stacked on MCP-001.

## Implemented

- src/mcp-oauth-resource.ts uses the official @modelcontextprotocol/server v2 SDK and delegates exactly three read-only tools to existing native verification.
- Bearer JWT access tokens validated with JOSE against an operator-configured issuer-origin HTTPS JWKS, issuer, exact resource audience, expiration, nonempty subject, allowed algorithm and a read-only scope.
- RFC 9728 OAuth protected-resource metadata, WWW-Authenticate challenge and OAuth securitySchemes on tools/list.
- Host/origin/query rejection and 256 KiB per-request application budget.
- src/mcp-vercel.ts and api/mcp.ts + api/protected-resource.ts are platform entry points which fail closed without configured OAuth.
- Official @modelcontextprotocol/client v2 test, PINNED to 2026-07-28, with signed crossing fixtures and invalid token cases.

## Required environment (secret manager)

- RELATTE_MCP_RESOURCE: canonical published HTTPS URL ending in /mcp, including resource audience.
- RELATTE_OAUTH_ISSUER: issuer identifier for an external OAuth 2.1 authorization server.
- RELATTE_OAUTH_JWKS_URI: issuer-origin HTTPS JSON Web Key Set URL.
- RELATTE_OAUTH_SCOPE: least-privileged read-only scope, e.g. relatte:verify.

An authorization server MUST implement the MCP OAuth auth code + PKCE discovery and resource-indicator flow, client identification (CIMD / DCR / registered client as applicable), secure refresh/revocation practices, and produce appropriately signed access tokens. Do not create your own authorization server for this slice.

## Hosting is still HOLD

1. Select and verify a domain. A hypothetical https://mcp.example.org/mcp is NOT a live URL.
2. Create an owned Vercel project with protected preview environments, review gates and secret-managed OAuth configuration. None has been created here.
3. Route /mcp to the api/mcp function and /.well-known/oauth-protected-resource to api/protected-resource. These route rewrites still require an authorized deployment configuration.
4. Enforce TLS, exact hostname, trusted proxy topology, edge rate/body limits, timeouts, audit metrics, JWKS rotation and revocation behavior, secret rotation and rollback.
5. Authenticate ChatGPT as the MCP CLIENT using verified OpenAI-managed mTLS where the ingress supports it; OAuth validates the human account. An IP allowlist alone does not authenticate either.
6. Exercise a real deployed domain with MCP Inspector and a ChatGPT custom MCP connection, review five positive and three negative cases, verify publisher identity/privacy/terms/support and submit for approval.

## Run evidence

    npm install
    npm run verify
    npm run mcp:oauth:check

Tests include official SDK modern client discovery and tool call; JWT wrong issuer, audience, expiration, missing scope; unauthenticated HTTP denial; public resource metadata; synthetic signed-crossing verification; fail-closed Vercel configuration.

## Nonclaims

- JWT VERIFIED != SOVEREIGN OWNER.
- SIGNED RECEIPT != TRUE EVENT.
- OAUTH LOGIN != RECEIVER DISPOSITION PERMISSION.
- SIGNATURE UNDER EMBEDDED PUBLIC KEY != TRUSTED HUMAN IDENTITY.
- GREEN TEST != LIVE DEPLOYMENT OR PLUGIN APPROVAL.

No signing, transfers, financial transactions, owner-local ADMIT, receiver journal reconstruction, private data access, or real-world custody effects are exposed. A model cannot invent a receiver's authority.

References:
https://github.com/modelcontextprotocol/typescript-sdk
https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization
https://developers.openai.com/plugins/build/auth
https://developers.openai.com/plugins/build/mcp-server
https://vercel.com/docs/functions/runtimes/node-js
