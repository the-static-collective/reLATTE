# RELATTE-CHATGPT-MCP-001 — read-only evidence aperture

Status: **experimental, local, not approved, not deployed, not a public ChatGPT plugin**.

This slice introduces an MCP *developer prototype*, not a new reLATTE authority.
The implementation uses the existing \`src/protocol.ts\` functions: signatures and
canonical IDs are checked by the project-owned native implementation, without
inventing a second verifier.

## The usable surface

- \`verify_crossing\`: validate an arbitrary supplied native signed v0 crossing.
- \`verify_receipt\`: validate an arbitrary supplied native signed v0 receipt.
- \`inspect_crossing_evidence\`: verify a crossing, exactly one RECEIVED receipt,
  and optionally one R3 disposition receipt. Require stable crossing identity,
  claimed receiving world, receiving particular, and receipt signing key.
  Return **disposition_claim**, never "authorized effect".
- Transport: local-only \`POST http://127.0.0.1:8787/mcp\`, protocol revision
  \`2026-07-28\`, methods \`tools/list\` and \`tools/call\`.
  This is a bounded subset and **not yet certified for interoperability with
  ChatGPT**. Validate against the official MCP SDK/Inspector before any remote use.

\`\`\`sh
npm install
npm run verify
npm run mcp:local
\`\`\`

Example read-only list request, from the same machine:

\`\`\`sh
curl -sS http://127.0.0.1:8787/mcp \
  -H 'Content-Type: application/json' \
  -H 'MCP-Protocol-Version: 2026-07-28' \
  -H 'Mcp-Method: tools/list' \
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
\`\`\`

For \`tools/call\`, also send \`Mcp-Name: verify_crossing\` (or the corresponding tool name) matching \`params.name\`.

This process deliberately binds only to 127.0.0.1, checks localhost Host and peer
address, denies browser Origin headers, limits request bodies to 256 KiB, exposes
no filesystem read paths, receives no user private keys, and exposes no action
with a local side effect. **Do not put it behind a public reverse proxy or
tunnel.** There is no authentication or per-user authorization in this slice.

## Reused law / independent boundaries

\`\`\`
SIGNATURE != HUMAN IDENTITY
SIGNED != TRUE
RECEIVED != ADMITTED
PROPOSAL != ADMISSION
TOOL DISCOVERY != CAPABILITY GRANT
CHATGPT REQUEST != RECEIVER AUTHORITY
\`\`\`

Verification of a self-contained signature under the *embedded public key*
is not proof that the signer is the claimed human, authorized receiver, or
trusted world. Additional trust anchoring is required for those claims.

The inspection tool verifies the supplied record's internal consistency, not
its completeness: a caller can omit a later receipt, or present an independent
synthetic receiver key. The result deliberately calls the observed disposition
a *claim*. No receiver journal is accessed and no receipt is generated.

## Explicit nonfeatures

This branch has no \`create_crossing\`, \`deliver_crossing\`,
\`get_crossing_status\`, or \`review_crossing\` tools.
Those names must not be advertised until they have real, capability-bounded
implementations. No key custody, hosting, OAuth, user accounts, payments,
cryptocurrency transfers, public submission, or approval is implied.

## Path to an approvable plugin

1. **Protocol conformance gate.** Replace or validate the limited HTTP
   adapter against the current official MCP server SDK, test header validation,
   tool metadata, discovery, error responses, structured content, supported
   protocol versions, and Inspector interoperability.
2. **Identity gate.** Create a universal HTTPS URL and production-grade
   authentication (with OAuth where applicable), tenant isolation, bounded
   input, network limits, audit trails, monitoring, and secure operations.
   Do not load owner signing keys into a tool-serving process.
3. **Real-world value gate.** Only after operator-authorized external delivery
   and locally governed disposition are available, add action tools with
   explicit authorization and owner-side confirmation. A ChatGPT proposal is
   never itself a grant.
4. **Publication gate.** Supply developer/business identity verification,
   website, terms, privacy policy, support, demo, exactly five successful
   and three negative public-review cases, hosting/domain verification,
   current tool scans, and a verified plugin package ZIP. Submit through the
   official plugin directory workflow; publication follows approval.

Reference docs:
- https://developers.openai.com/plugins/deploy/submission
- https://developers.openai.com/plugins/deploy/app-review
- https://developers.openai.com/plugins/deploy/submission-errors
- https://blog.modelcontextprotocol.io/posts/2026-07-28/

## Initial review case inventory (not yet recorded as live runs)

Positive:
1. Valid native crossing -> verified with stable crossing ID.
2. Valid native RECEIVED receipt -> verified, no admission claimed.
3. Valid signed HOLD evidence -> coherent disposition *claim*.
4. Correctly signed REFUSE evidence -> preserves local refusal *claim*.
5. Multiple independent native crossing-verification invocations -> stable IDs.

Negative:
1. Tamper with one signed byte -> reject invalid signature.
2. Mix a receipt from another crossing or receiver -> reject mismatch.
3. Ask ChatGPT to ADMIT, fabricate missing receipt, or read a private
   receiver path -> tool unavailable or invalid arguments; no side effect.

All case runs and demo recordings remain **TO DO**. Do not represent the
inventory above as successful ChatGPT integration testing.

## Acceptance target

A hostile client asks for ADMIT while presenting only a signed RECEIVE/HOLD.
The adapter returns only a verified RECEIVED/HOLD **claim** and refuses to
invent an admission or exercise the receiver's signing authority.
