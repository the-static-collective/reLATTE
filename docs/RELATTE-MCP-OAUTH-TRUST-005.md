# RELATTE-MCP-OAUTH-TRUST-005

Status: experimental draft, stacked on dependency-hardening #102. No live OAuth identity provider is configured; no public deployment, login, merge or ChatGPT publication.

## Threat model and explicit divisions

- An OAuth issuer vouches for an access token. A reLATTE receiver alone decides what to RECEIVE, HOLD, ADMIT, REFUSE or RETURN.
- Bearer access tokens can be replayed by whoever steals them. A valid JWT signature, jti and short expiration **do not** prove sender possession or prevent replay.
- JWKS caches may retain signing keys after retirement. Explicit cacheMaxAge=60s, cooldownDuration=5s and fetch timeout=3s bound cache behavior but are NOT immediate universal revocation.
- Even a correct JWT can be revoked later. Production requests must pass a current issuer-owned revocation/introspection check for EACH request; active status is not cached.
- If the issuer status API cannot be reached or its claims conflict with the signed JWT, protected requests fail closed.

## Implemented boundaries

1. JWT verification now requires typ at+jwt, exact resource audience and issuer, jti, issued-at timestamp, expiry, required read-only scope and a short maximum token lifetime (default 15 minutes).
2. Resource server can take AccessTrustPolicy with requireLiveStatus=true and a callback. Without a callback strict startup fails.
3. The Vercel entry point REQUIRES all issuer introspection credentials (in addition to JWT issuer/JWKS). Incomplete deployment secrets return 503. No anonymous fallback.
4. RFC7662 issuer introspection endpoint is configured by operator, must be HTTPS on the configured issuer's origin, and uses Basic authentication from secret-managed client credentials. No redirect, 3s timeout, 8KiB response bound. Status must return active=true and match sub, iss, aud, exp, iat, jti and scope.
5. Optional proof-of-possession DPoP verifier validates ES256 key thumbprint bound by cnf.jkt, htm, htu, ath, iat and jti. Rejects mismatches. A shared atomic DpopReplayStore is required when enabling required mode.
6. Synthetic tests exercise revoked JWTs, issuer outages, claim mismatch, key rollover, DPoP proof reuse, stolen token or wrong URL and no sovereign ADMIT authority.

## Environment gate

All previous RELATTE_MCP_RESOURCE, RELATTE_OAUTH_ISSUER, RELATTE_OAUTH_JWKS_URI and RELATTE_OAUTH_SCOPE env vars, PLUS:

- RELATTE_OAUTH_INTROSPECTION_URI (issuer-origin HTTPS path)
- RELATTE_OAUTH_INTROSPECTION_CLIENT_ID (resource-server client identity)
- RELATTE_OAUTH_INTROSPECTION_CLIENT_SECRET (server secret, never committed or echoed)

If the chosen identity provider's introspection response omits the required subject, timestamps or JWT ID, this adapter rejects it. That identity provider must be evaluated or the trust profile explicitly revised before any hosting attempt; never silently skip status checks.

## Replay boundaries

**Bearer-only ChatGPT client:** Request-by-request status checks, short token lifetime and exact audience reduce risk but do not prevent replay during the valid period. Declare this limitation to reviewers.

**DPoP-capable client (separate future opt-in):** A cryptographic DPoP proof + token binding and a durable atomic shared replay-store claim can reject duplicated proof JWT IDs across workers/restarts. A local Set fixture proves only logic, NOT distributed enforcement; no production DPoP deployment is configured.

Do not silently force DPoP onto a ChatGPT client without proving its protocol support. mTLS at the edge requires an independently attested trust chain and does not itself replace token revocation or receiver-local authorization.

## Remaining gates

- Review issuer trust semantics and revocation guarantees with the actual OAuth provider.
- Configure and secure secrets without exposing them to prompts, Git commits or logs.
- Add a durable, shared atomic DPoP replay backend and client support only if sender-constrained mode will be shipped.
- Key-rollover and compromise drills on real infrastructure, including multi-replica JWKS refresh behavior and emergency key revocation.
- Authenticated host test, rate limits, request/egress safety, publisher domain and privacy requirements.
- All check runs green + human review before considering any merge; never infer production consent.

Spec references:
https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization
https://github.com/panva/jose/blob/main/docs/jwks/remote/interfaces/RemoteJWKSetOptions.md
https://datatracker.ietf.org/doc/html/rfc7662
https://datatracker.ietf.org/doc/html/rfc9449
