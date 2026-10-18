#!/usr/bin/env python3
"""Read-only Horizon Accord MCP discovery. Never invokes a public-write tool."""
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ENDPOINT = "https://horizon-agent-commons-mcp.cherokee-schill.workers.dev/mcp"
VERSION = "2025-06-18"
MAX_RESPONSE = 100_000


class MCPError(RuntimeError):
    pass


def decode_response(body, mime, rpc_id):
    raw = body.decode("utf-8", "replace")
    if "text/event-stream" in mime.lower():
        events, lines = [], []
        for line in (raw + "\n\n").splitlines():
            if line.startswith("data:"):
                lines.append(line[5:].lstrip())
            elif not line.strip():
                if lines:
                    try:
                        events.append(json.loads("\n".join(lines)))
                    except json.JSONDecodeError:
                        pass
                lines = []
        matching = [e for e in events if isinstance(e, dict) and e.get("id") == rpc_id]
        if not matching:
            raise MCPError(f"No JSON-RPC response for id {rpc_id} in SSE")
        return matching[0]
    try:
        obj = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise MCPError(f"Invalid JSON-RPC response: {raw[:250]}") from exc
    if not isinstance(obj, dict) or obj.get("id") != rpc_id:
        raise MCPError(f"Wrong JSON-RPC response id (expected {rpc_id})")
    return obj


class Client:
    def __init__(self, transport=urlopen):
        self.transport = transport
        self.version = VERSION
        self.session = None
        self.id = 1

    def post(self, method, params=None, notify=False):
        rpc_id = None if notify else self.id
        if not notify:
            self.id += 1
        request_body = {"jsonrpc": "2.0", "method": method}
        if rpc_id is not None:
            request_body["id"] = rpc_id
        if params is not None:
            request_body["params"] = params
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            "MCP-Protocol-Version": self.version,
            "Mcp-Method": method,
            "User-Agent": "reLATTE-horizon-readonly/0.1",
        }
        if self.session:
            headers["Mcp-Session-Id"] = self.session
        if method == "tools/call":
            headers["Mcp-Name"] = params["name"]
        req = Request(ENDPOINT, json.dumps(request_body).encode("utf-8"),
                      headers=headers, method="POST")
        try:
            with self.transport(req, timeout=20) as response:
                self.session = response.headers.get("Mcp-Session-Id", self.session)
                body = response.read(MAX_RESPONSE + 1)
                mime = response.headers.get("Content-Type", "")
                status = response.status
        except HTTPError as exc:
            raise MCPError(f"HTTP {exc.code} on {method}: {exc.read(600)!r}") from exc
        except (URLError, TimeoutError, OSError) as exc:
            raise MCPError(f"{method} request failed: {exc}") from exc
        if len(body) > MAX_RESPONSE:
            raise MCPError("Response exceeded bounded size limit")
        if notify:
            if status not in (200, 202, 204):
                raise MCPError(f"Unexpected notification HTTP status {status}")
            return None
        result = decode_response(body, mime, rpc_id)
        if "error" in result:
            raise MCPError(f"{method} returned JSON-RPC error: {result['error']}")
        if "result" not in result:
            raise MCPError(f"{method} returned no JSON-RPC result")
        return result["result"]

    def discover(self):
        init = self.post("initialize", {
            "protocolVersion": self.version, "capabilities": {},
            "clientInfo": {"name": "relatte-horizon-probe", "version": "0.1"},
        })
        self.version = init.get("protocolVersion", self.version)
        self.post("notifications/initialized", notify=True)
        tools, cursor = [], None
        for _ in range(5):
            page = self.post("tools/list", {"cursor": cursor} if cursor else {})
            tools.extend(page.get("tools", []))
            cursor = page.get("nextCursor")
            if not cursor:
                break
        else:
            raise MCPError("Tool listing too large to review safely")
        return init, tools

    def read_capabilities(self, tools):
        # Exact one unambiguous, no-arguments capability read. Never call write.
        candidates = [x for x in tools if "capabilit" in x.get("name", "").lower()]
        if len(candidates) != 1:
            return {"status": "not_invoked", "reason": "No unique capabilities reader"}
        target = candidates[0]
        name = target["name"].lower()
        for banned in ("write", "leave", "post", "send", "create", "publish", "update", "delete", "submit", "set"):
            if banned in name:
                return {"status": "not_invoked", "reason": "Tool name implies write"}
        if target.get("inputSchema", {}).get("required"):
            return {"status": "not_invoked", "reason": "Reader requires arguments"}
        return {"status": "invoked", "tool": target["name"],
                "data": self.post("tools/call", {"name": target["name"], "arguments": {}})}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live", action="store_true", help="Execute read-only MCP discovery")
    parser.add_argument("--output", type=Path, help="Optional receipt JSON")
    args = parser.parse_args()
    if not args.live:
        print("DRY RUN: no network requests. Pass --live for a read-only MCP probe.")
        return 0
    client = Client()
    try:
        init, tools = client.discover()
        capability = client.read_capabilities(tools)
    except MCPError as exc:
        print(f"MCP probe failed: {exc}")
        return 1
    observation = {
        "type": "external-mcp-capability-observation",
        "observed_utc": datetime.now(timezone.utc).isoformat(),
        "endpoint": ENDPOINT,
        "negotiated_protocol": client.version,
        "server": init.get("serverInfo"),
        "server_capabilities": init.get("capabilities"),
        "tools": tools,
        "capabilities_read": capability,
        "boundary": "NO public-write invocation, NO thread readback, NO verified sender identity.",
    }
    output = json.dumps(observation, ensure_ascii=False, indent=2)
    print(output)
    if args.output:
        args.output.write_text(output + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
