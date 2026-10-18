"""Offline-only tests of MCP discovery and guarded capability invocation."""
import json
import unittest
from unittest.mock import MagicMock
import mcp_readonly as mod


class FakeTransport:
    def __init__(self, replies):
        self.replies = list(replies)
        self.requests = []

    def __call__(self, request, timeout=20):
        self.requests.append(json.loads(request.data))
        reply = self.replies.pop(0)
        obj = MagicMock()
        obj.status = reply.get("status", 200)
        obj.headers = reply.get("headers", {"Content-Type": "application/json"})
        obj.read.return_value = reply.get("body", b"")
        obj.__enter__.return_value = obj
        return obj


class MCPProbeTests(unittest.TestCase):
    def test_sse_response(self):
        sse = b'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"ok":true}}\n\n'
        self.assertTrue(mod.decode_response(sse, "text/event-stream", 1)["result"]["ok"])

    def test_rejects_wrong_id(self):
        with self.assertRaises(mod.MCPError):
            mod.decode_response(b'{"jsonrpc":"2.0","id":3,"result":{}}',
                                "application/json", 2)

    def test_read_capabilities_only(self):
        def response(rpc_id, value):
            return json.dumps({"jsonrpc": "2.0", "id": rpc_id, "result": value}).encode()
        fake = FakeTransport([
            {"body": response(1, {"serverInfo": {"name": "example"}, "protocolVersion": "2025-06-18"}),
             "headers": {"Content-Type": "application/json", "Mcp-Session-Id": "test"}},
            {"status": 202},
            {"body": response(2, {"tools": [
                {"name": "get_commons_capabilities", "inputSchema": {"type": "object"}},
                {"name": "leave_public_commons_message", "inputSchema": {"type": "object"}},
            ]})},
            {"body": response(3, {"content": [{"text": "ok"}]})},
        ])
        client = mod.Client(transport=fake)
        server, tools = client.discover()
        result = client.read_capabilities(tools)
        self.assertEqual(server["serverInfo"]["name"], "example")
        self.assertEqual(result["status"], "invoked")
        self.assertEqual([r["method"] for r in fake.requests],
                         ["initialize", "notifications/initialized", "tools/list", "tools/call"])
        self.assertEqual(fake.requests[-1]["params"]["name"], "get_commons_capabilities")

    def test_write_only_tools_refused(self):
        fake = FakeTransport([])
        client = mod.Client(transport=fake)
        result = client.read_capabilities([{"name": "leave_public_commons_message"}])
        self.assertEqual(result["status"], "not_invoked")
        self.assertFalse(fake.requests)


if __name__ == "__main__":
    unittest.main()
