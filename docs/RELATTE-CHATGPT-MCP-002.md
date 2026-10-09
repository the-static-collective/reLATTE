# RELATTE-CHATGPT-MCP-002 — external-client interoperability and staging gate

Status: **experimental; stacked on MCP-001; NOT an approved or deployed ChatGPT plugin.**

MCP-002 repairs issues revealed by the published
[MCP 2026-07-28 specification](https://modelcontextprotocol.io/specification/2026-07-28):
the first prototype had no server/discover, omitted mandatory per-request
metadata, and lacked typed protocol-version and header mismatch errors.

## Executable proof

~~~sh
npm install
npm run verify
RELATTE_MCP_PORT=8787 npm run mcp:local
~~~

Example independent client:

~~~sh
curl -sS http://127.0.0.1:8787/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'MCP-Protocol-Version: 2026-07-28' \
  -H 'Mcp-Method: server/discover' \
  --data '{"jsonrpc":"2.0","id":"d1","method":"server/discover","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientInfo":{"name":"local-demo","version":"1.0"},"io.modelcontextprotocol/clientCapabilities":{}}}}'
~~~

The server returns resultType=complete, discovery identity and three
read-only tools. tools/list and tools/call require matching version/method
headers and body metadata. tools/call also requires Mcp-Name.

test/mcp-wire-client.test.ts starts a SEPARATE Node process, talks only over
HTTP and exercises real discovery, listing, signed fixtures, tampering,
unauthorized ADMIT attempt, version mismatch, unsafe Origin, and unknown RPC.
This is a process-separated HTTP test, not yet an official MCP SDK or
Inspector certification or a live ChatGPT host connection.

## Optional staging credential: still localhost

RELATTE_MCP_STAGING_TOKEN enables fail-closed HTTP bearer-token checking on
the loopback server; require at least 32 UTF-8 bytes. For equal-length token
values, comparison is constant-time. Never commit or put secrets in prompts.
An optional shared secret is NOT OAuth, per-user authorization, or a public
production-grade authentication design. The server binds to 127.0.0.1 and
rejects nonlocal Host headers and browser Origins.

## HTTPS deployment — deliberate HOLD

The adapter is deliberately loopback-only and cannot be reached directly by
ChatGPT. It should not be exposed by a reverse proxy without a separately
reviewed authenticated ingress implementation.

Proposed release sequence:

1. Secure an HTTPS publisher-owned domain and stable /mcp endpoint; enforce
   TLS, redacted logging, bounded body sizes, rate limits, and monitoring.
2. Use OpenAI-managed mTLS to authenticate ChatGPT as client where relevant,
   and OAuth 2.1 for human user authentication when required. Bind scopes,
   tenant identity, audience and issuer; never infer owner permission from
   an embedded receipt key.
3. Forbid arbitrary path and URL parameters, unvetted downloads, execution,
   payment, signing-key custody, or unilateral ADMIT/deliver tools.
4. Run current official MCP SDK/Inspector tests and verify authenticated
   HTTPS clients; do not infer actual host compatibility from a local test.
5. Complete publisher verification, privacy, terms, support, five positive
   and three negative recorded review cases, demo, plugin package, domain
   verification, submission and independent OpenAI approval.

Official references:
- https://developers.openai.com/plugins/build/mcp-server
- https://developers.openai.com/plugins/deploy/submission
- https://modelcontextprotocol.io/specification/2026-07-28/server/discover
- https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http

## Admission firewall

Self-contained signed evidence is not independently authenticated human
identity, nor proof of a complete current receiving-world journal.
MCP tooling reports cryptographically verified claims and refuses to
convert them into external authority.

**ChatGPT may inspect an assertion. It cannot make that assertion sovereign.**
