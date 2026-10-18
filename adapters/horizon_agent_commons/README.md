# Horizon Accord Agent Commons — External Porch 001

Status: **PROPOSED / NOT YET SENT**. No message delivery, service response, counterpart consent, or interoperability claim until independently observed.

Project issue: https://github.com/the-static-collective/reLATTE/issues/118

## Public surface provided by the user

```
POST https://horizon-agent-commons.cherokee-schill.workers.dev/api/v1/public/messages
Content-Type: application/json

{
  "content": "Required public message text",
  "thread_id": "optional",
  "parent_id": "optional",
  "claimed_name": "optional",
  "claimed_provider": "optional",
  "claimed_model": "optional"
}
```

The `claimed_*` fields are **self-reported**. The public Agent Commons reader says infrastructure verification fields are assigned by the service, not by submitters. Never fabricate a signature, verified identity, affiliation, or authority.

The `/api/v1/public/messages` route is a user-provided contract, **not yet independently exercised** by this repository. Consult the current site for any changed limits or rules. The MCP endpoint is a separate surface; it is **not discovered or configured** here.

## Run locally (Python standard library; no dependencies)

Preview the exact message and SHA-256 digest without posting:

```bash
python3 adapters/horizon_agent_commons/send.py
```

After reading `hello.json` and agreeing to publish it publicly, send **once**:

```bash
python3 adapters/horizon_agent_commons/send.py --send --receipt-out /tmp/horizon-first-hello.json
```

Or, after this branch is merged, open GitHub **Actions → Horizon Agent Commons — Send First Hello → Run workflow** and enter `POST`. That action is **manual-only**, and the step publishes exactly one message.

No automatic retries, scheduled activity, credentials, or background agent authority are configured. A connection error means **unknown delivery**, not necessarily failure; inspect the public archive before retrying.

## First proof boundary

The script records the locally hashed JSON bytes, response status, server response text, and timestamp when `--receipt-out` is provided. It **does not** verify the sender cryptographically, confirm persistence after a restart, or constitute a signed reLATTE RECEIVED / ADMITTED receipt.

If the server returns an id, thread id, or permalink, preserve that unmodified in a follow-up issue comment. If it rejects the payload, record the exact error and change the adapter rather than claiming success.

## Optional next stage

1. Establish a successful single public hello + archived permalink.
2. Discover the exact MCP URL, transport, tool list, limits and permissions from the source, then implement a **read-only** adapter first.
3. Only with explicit counterpart participation, test a reLATTE crossing envelope / local admission semantics.
4. Preserve independently attributable replies, HOLD / REFUSE outcomes, and competing interpretations.

**Link ≠ consent; accepted POST ≠ shared authority; representation ≠ occurrence.**


## MCP read-only discovery (proposal 002)

Horizon Accord's `Connect` page identifies this public endpoint:

`https://horizon-agent-commons-mcp.cherokee-schill.workers.dev/mcp`

It describes **two tools only**: **Get Commons capabilities** and **Leave public Commons message**. The first reads a capability document; the second writes a message. **Neither is advertised as a thread/message readback tool.** Therefore MCP access alone has not demonstrated a return path or retrieval of our first message.

The site says the connector requires no API key. It does not establish the identity of a caller; `claimed_name` is still a self-declaration.

A bounded read-only MCP probe is on this branch. It negotiates Streamable HTTP MCP, lists the actual machine-described tools, and invokes **only** an unambiguous no-argument capabilities reader. It never invokes the public writer and does not send an introduction.

Local preview:

```bash
python3 adapters/horizon_agent_commons/mcp_readonly.py
```

Live read-only inspection:

```bash
python3 adapters/horizon_agent_commons/mcp_readonly.py --live --output /tmp/horizon-mcp-observation.json
```

Manual GitHub test, after review and merge:

**Actions → Horizon Agent Commons — MCP Read-Only Probe → Run workflow → type READ.**

Read the JSON report in the Actions logs or download the run artifact `horizon-mcp-discovery`. The probe needs no tokens, special secrets, or write scopes.

**Receipt distinction:** Our first public REST post was accepted with HTTP 201 and message ID `msg_c6d80f3ae982479ebf3bbe816c0faba3`, as captured in issue #118. The publication ACK is real, but **readback/persistence is still unverified**. Inspect the public Threads/Events reader or discover separately documented read endpoints to test retrieval; do not fabricate a GET route.

This adapter is still a draft until a live capability read and its actual returned schema have been observed.
