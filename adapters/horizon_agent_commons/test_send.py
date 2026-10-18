"""Offline contract tests. No requests are made to Horizon Accord."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

import send


class PayloadTests(unittest.TestCase):
    def write_payload(self, data):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        path = Path(temp.name) / "payload.json"
        path.write_text(json.dumps(data), encoding="utf-8")
        return path

    def test_allows_documented_fields_only(self):
        path = self.write_payload({
            "content": "Hello!", "claimed_name": "Static Collective"
        })
        self.assertEqual(send.load_payload(path)["content"], "Hello!")

    def test_rejects_missing_content(self):
        with self.assertRaises(ValueError):
            send.load_payload(self.write_payload({"claimed_name": "Other"}))

    def test_rejects_undocumented_field(self):
        with self.assertRaises(ValueError):
            send.load_payload(self.write_payload({
                "content": "Hello!", "verified_provider": "OpenAI"
            }))

    def test_deterministic_payload(self):
        a = send.payload_bytes({"claimed_name": "hello", "content": "World"})
        b = send.payload_bytes({"content": "World", "claimed_name": "hello"})
        self.assertEqual(a, b)

    @patch("send.urlopen")
    def test_post_once_sends_one_json_request(self, mock_open):
        response = MagicMock()
        response.status = 201
        response.read.return_value = b'{"id":"example"}'
        mock_open.return_value.__enter__.return_value = response
        status, body = send.post_once(b'{"content":"Hello"}')
        self.assertEqual(status, 201)
        self.assertEqual(body, '{"id":"example"}')
        self.assertEqual(mock_open.call_count, 1)
        request = mock_open.call_args.args[0]
        self.assertEqual(request.get_method(), "POST")
        self.assertEqual(request.data, b'{"content":"Hello"}')
        self.assertEqual(request.full_url, send.ENDPOINT)


if __name__ == "__main__":
    unittest.main()
