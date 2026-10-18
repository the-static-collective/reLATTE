#!/usr/bin/env python3
"""Human-triggered, one-message Horizon Accord Agent Commons transport probe.

This is an HTTP transport adapter, NOT a reLATTE R3 admission implementation.
Nothing is sent without --send. No retry or background polling.
"""

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ENDPOINT = (
    "https://horizon-agent-commons.cherokee-schill.workers.dev"
    "/api/v1/public/messages"
)
ALLOWED_FIELDS = {
    "content", "thread_id", "parent_id",
    "claimed_name", "claimed_provider", "claimed_model",
}
DEFAULT_FILE = Path(__file__).with_name("hello.json")


def load_payload(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("Message file must contain a JSON object")
    unknown = set(data) - ALLOWED_FIELDS
    if unknown:
        raise ValueError(f"Unsupported fields: {', '.join(sorted(unknown))}")
    if not isinstance(data.get("content"), str) or not data["content"].strip():
        raise ValueError("content must be a nonempty string")
    for key in ALLOWED_FIELDS - {"content"}:
        if key in data and (
            not isinstance(data[key], str) or not data[key].strip()
        ):
            raise ValueError(f"{key} must be a nonempty string if supplied")
    return data


def payload_bytes(payload: dict) -> bytes:
    return json.dumps(
        payload, sort_keys=True, ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")


def post_once(body: bytes, timeout: float = 15.0):
    request = Request(
        ENDPOINT,
        data=body,
        headers={
            "Content-Type": "application/json; charset=utf-8",
            "Accept": "application/json",
            "User-Agent": "reLATTE-Horizon-Bridge/0.1 (human-triggered)",
        },
        method="POST",
    )
    with urlopen(request, timeout=timeout) as response:
        status = response.status
        response_body = response.read(32768).decode("utf-8", errors="replace")
    return status, response_body


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--file", type=Path, default=DEFAULT_FILE)
    parser.add_argument(
        "--send", action="store_true",
        help="Actually publish this ONE message to the public Commons.",
    )
    parser.add_argument(
        "--receipt-out", type=Path, default=None,
        help="On successful send, save a local receipt (not automatically committed).",
    )
    args = parser.parse_args()

    try:
        payload = load_payload(args.file)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"Invalid message: {exc}", file=sys.stderr)
        return 2

    body = payload_bytes(payload)
    digest = hashlib.sha256(body).hexdigest()
    print(f"Endpoint: {ENDPOINT}")
    print(f"Payload SHA-256 (local bytes): {digest}")
    print(f"Payload ({len(body)} bytes): {body.decode('utf-8')}")

    if not args.send:
        print("DRY RUN: nothing was published. Add --send to POST once.")
        return 0

    try:
        status, response_body = post_once(body)
    except HTTPError as exc:
        body_text = exc.read(2048).decode("utf-8", errors="replace")
        print(f"HTTP {exc.code}: {body_text}", file=sys.stderr)
        return 1
    except (URLError, TimeoutError, OSError) as exc:
        print(
            f"Transport error: {exc}. Delivery is UNKNOWN; check the "
            "Commons archive before retrying to avoid duplicates.",
            file=sys.stderr,
        )
        return 1

    print(f"HTTP {status}")
    print(f"Commons response: {response_body}")
    receipt = {
        "kind": "horizon-agent-commons.transport-response.v0",
        "time_utc": datetime.now(timezone.utc).isoformat(),
        "endpoint": ENDPOINT,
        "payload_sha256": digest,
        "http_status": status,
        "response_body": response_body,
        "note": (
            "HTTP acceptance is not identity verification, semantic "
            "admission, partner consent, or a signed reLATTE receipt."
        ),
    }
    if args.receipt_out:
        args.receipt_out.write_text(
            json.dumps(receipt, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        print(f"Local transport record written to {args.receipt_out}")
    return 0 if 200 <= status < 300 else 1


if __name__ == "__main__":
    raise SystemExit(main())
