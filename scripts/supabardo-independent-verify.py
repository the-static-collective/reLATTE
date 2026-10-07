#!/usr/bin/env python3
"""Independent SupaBardo verifier for SB-001, SB-002, and SB-003.

No reLATTE TypeScript is imported or executed. No third-party Python package is
required. The verifier implements the bounded JSON profile, SHA-256 object IDs,
and P-256 ECDSA verification needed by the committed specimens.

This is an independent implementation, not a compliance claim and not a
general-purpose RFC 8785/JWK/ECDSA library.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
from pathlib import Path
from typing import Any

# NIST P-256 / secp256r1
P = 0xFFFFFFFF00000001000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFF
A = P - 3
B = 0x5AC635D8AA3A93E7B3EBBD55769886BC651D06B0CC53B0F63BCE3C3E27D2604B
GX = 0x6B17D1F2E12C4247F8BCE6E563A440F277037D812DEB33A0F4A13945D898C296
GY = 0x4FE342E2FE1A7F9B8EE7EB4A7C0F9E162BCE33576B315ECECBB6406837BF51F5
N = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551
G = (GX, GY)

CROSSING_ID_DOMAIN = b"reLATTE-CrossingEnvelope-v0|"
CROSSING_SIGNATURE_DOMAIN = b"reLATTE-CrossingSignature-v0|"
RECEIPT_ID_DOMAIN = b"reLATTE-Receipt-v0|"
RECEIPT_SIGNATURE_DOMAIN = b"reLATTE-ReceiptSignature-v0|"

CROSSING_KEYS = {
    "schema", "crossing_id", "protocol_version", "source_particular",
    "source_world", "source_history_head", "parents", "declared_kind",
    "payload_refs", "requested_effect", "capability_ref", "privacy_policy",
    "audience_policy", "return_address", "created_at", "signing", "extensions",
}
RECEIPT_KEYS = {
    "schema", "receipt_id", "crossing_id", "world_id", "receiver_particular",
    "kind", "semantic_effect", "contract_ref", "pre_state_ref",
    "post_state_ref", "descendant_refs", "residual_refs", "note",
    "created_at", "signing", "extensions",
}
SIGNING_KEYS = {"algorithm", "public_key", "signature", "domain"}


class Refusal(Exception):
    pass


def require(condition: bool, code: str) -> None:
    if not condition:
        raise Refusal(code)


def require_equal(actual: Any, expected: Any, code: str) -> None:
    if actual != expected:
        raise Refusal(code)


def load_bytes(root: Path, name: str) -> bytes:
    return (root / "fixtures" / name).read_bytes()


def load_json(root: Path, name: str) -> dict[str, Any]:
    value = json.loads(load_bytes(root, name).decode("utf-8"))
    require(isinstance(value, dict), "INVALID_JSON_OBJECT")
    return value


def validate_bounded_json(value: Any) -> None:
    if value is None or isinstance(value, (str, bool)):
        if isinstance(value, str):
            for ch in value:
                cp = ord(ch)
                require(not (0xD800 <= cp <= 0xDFFF), "LONE_SURROGATE")
        return
    if isinstance(value, int) and not isinstance(value, bool):
        require(abs(value) <= 9007199254740991, "UNSAFE_INTEGER")
        return
    if isinstance(value, float):
        raise Refusal("FLOAT_OUTSIDE_BOUNDED_PROFILE")
    if isinstance(value, list):
        for item in value:
            validate_bounded_json(item)
        return
    if isinstance(value, dict):
        for key, item in value.items():
            require(isinstance(key, str), "NON_STRING_KEY")
            require(key.isascii(), "NON_ASCII_KEY_OUTSIDE_BOUNDED_PROFILE")
            validate_bounded_json(item)
        return
    raise Refusal("UNSUPPORTED_JSON_TYPE")


def canonicalize(value: Any) -> str:
    validate_bounded_json(value)
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    )


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def b64url_decode_exact(value: Any, size: int, code: str) -> bytes:
    require(isinstance(value, str) and value != "", code)
    require(all(c.isalnum() or c in "-_" for c in value), code)
    padding = "=" * ((4 - len(value) % 4) % 4)
    try:
        out = base64.urlsafe_b64decode(value + padding)
    except Exception as exc:
        raise Refusal(code) from exc
    require(len(out) == size, code)
    require(base64.urlsafe_b64encode(out).decode("ascii").rstrip("=") == value, code)
    return out


def inv(value: int, modulus: int) -> int:
    return pow(value, -1, modulus)


Point = tuple[int, int] | None


def point_add(left: Point, right: Point) -> Point:
    if left is None:
        return right
    if right is None:
        return left
    x1, y1 = left
    x2, y2 = right
    if x1 == x2 and (y1 + y2) % P == 0:
        return None
    if left == right:
        if y1 % P == 0:
            return None
        slope = ((3 * x1 * x1 + A) * inv((2 * y1) % P, P)) % P
    else:
        slope = ((y2 - y1) * inv((x2 - x1) % P, P)) % P
    x3 = (slope * slope - x1 - x2) % P
    y3 = (slope * (x1 - x3) - y1) % P
    return (x3, y3)


def scalar_mult(k: int, point: Point) -> Point:
    result: Point = None
    addend = point
    while k:
        if k & 1:
            result = point_add(result, addend)
        addend = point_add(addend, addend)
        k >>= 1
    return result


def normalized_public_key(value: Any) -> dict[str, str]:
    require(isinstance(value, dict), "INVALID_PUBLIC_KEY")
    require(set(value.keys()) == {"kty", "crv", "x", "y"}, "INVALID_PUBLIC_KEY")
    require(value.get("kty") == "EC" and value.get("crv") == "P-256", "INVALID_PUBLIC_KEY")
    x_raw = b64url_decode_exact(value.get("x"), 32, "INVALID_PUBLIC_KEY")
    y_raw = b64url_decode_exact(value.get("y"), 32, "INVALID_PUBLIC_KEY")
    x = int.from_bytes(x_raw, "big")
    y = int.from_bytes(y_raw, "big")
    require(0 <= x < P and 0 <= y < P, "INVALID_PUBLIC_KEY")
    require((y * y - (x * x * x + A * x + B)) % P == 0, "INVALID_PUBLIC_KEY")
    require(scalar_mult(N, (x, y)) is None, "INVALID_PUBLIC_KEY")
    return {"kty": "EC", "crv": "P-256", "x": value["x"], "y": value["y"]}


def verify_p256(public_key: Any, signature: Any, message: bytes) -> bool:
    try:
        key = normalized_public_key(public_key)
        raw = b64url_decode_exact(signature, 64, "INVALID_SIGNATURE")
        r = int.from_bytes(raw[:32], "big")
        s = int.from_bytes(raw[32:], "big")
        require(1 <= r < N and 1 <= s < N, "INVALID_SIGNATURE")
        q = (
            int.from_bytes(b64url_decode_exact(key["x"], 32, "INVALID_PUBLIC_KEY"), "big"),
            int.from_bytes(b64url_decode_exact(key["y"], 32, "INVALID_PUBLIC_KEY"), "big"),
        )
        z = int.from_bytes(hashlib.sha256(message).digest(), "big")
        w = inv(s, N)
        point = point_add(
            scalar_mult((z * w) % N, G),
            scalar_mult((r * w) % N, q),
        )
        return point is not None and point[0] % N == r
    except (Refusal, ValueError):
        return False


def signing_identity(signing: Any, expected_domain: str) -> dict[str, Any]:
    require(isinstance(signing, dict), "INVALID_SIGNING")
    require(set(signing.keys()) == SIGNING_KEYS, "UNEXPECTED_SIGNING_FIELD")
    require_equal(signing.get("algorithm"), "ECDSA-P256-SHA256", "INVALID_SIGNING_ALGORITHM")
    require_equal(signing.get("domain"), expected_domain, "INVALID_SIGNING_DOMAIN")
    return {
        "algorithm": "ECDSA-P256-SHA256",
        "public_key": normalized_public_key(signing.get("public_key")),
        "domain": expected_domain,
    }


def crossing_identity_body(envelope: dict[str, Any]) -> dict[str, Any]:
    require(set(envelope.keys()) == CROSSING_KEYS, "UNEXPECTED_CROSSING_FIELD")
    require_equal(envelope.get("schema"), "relatte.crossing-envelope/v0", "INVALID_CROSSING_SCHEMA")
    require_equal(envelope.get("protocol_version"), "0", "INVALID_PROTOCOL_VERSION")
    return {
        "schema": "relatte.crossing-envelope/v0",
        "protocol_version": "0",
        "source_particular": envelope["source_particular"],
        "source_world": envelope["source_world"],
        "source_history_head": envelope.get("source_history_head"),
        "parents": envelope.get("parents", []),
        "declared_kind": envelope["declared_kind"],
        "payload_refs": envelope["payload_refs"],
        "requested_effect": envelope.get("requested_effect"),
        "capability_ref": envelope.get("capability_ref"),
        "privacy_policy": envelope.get("privacy_policy"),
        "audience_policy": envelope.get("audience_policy"),
        "return_address": envelope.get("return_address"),
        "created_at": envelope["created_at"],
        "signing": signing_identity(envelope["signing"], "relatte.crossing-signature/v0"),
        "extensions": envelope.get("extensions", {}),
    }


def verify_crossing(envelope: dict[str, Any]) -> None:
    body = crossing_identity_body(envelope)
    computed = "relatte-crossing-v0:" + sha256_hex(
        CROSSING_ID_DOMAIN + canonicalize(body).encode("utf-8")
    )
    require_equal(envelope.get("crossing_id"), computed, "CROSSING_ID_MISMATCH")
    signature_body = {"crossing_id": computed, **body}
    require(
        verify_p256(
            envelope["signing"]["public_key"],
            envelope["signing"]["signature"],
            CROSSING_SIGNATURE_DOMAIN + canonicalize(signature_body).encode("utf-8"),
        ),
        "INVALID_CROSSING_SIGNATURE",
    )


def receipt_identity_body(receipt: dict[str, Any]) -> dict[str, Any]:
    require(set(receipt.keys()) == RECEIPT_KEYS, "UNEXPECTED_RECEIPT_FIELD")
    require_equal(receipt.get("schema"), "relatte.receipt/v0", "INVALID_RECEIPT_SCHEMA")
    return {
        "schema": "relatte.receipt/v0",
        "crossing_id": receipt["crossing_id"],
        "world_id": receipt["world_id"],
        "receiver_particular": receipt["receiver_particular"],
        "kind": receipt["kind"],
        "semantic_effect": receipt["semantic_effect"],
        "contract_ref": receipt.get("contract_ref"),
        "pre_state_ref": receipt.get("pre_state_ref"),
        "post_state_ref": receipt.get("post_state_ref"),
        "descendant_refs": receipt.get("descendant_refs", []),
        "residual_refs": receipt.get("residual_refs", []),
        "note": receipt.get("note"),
        "created_at": receipt["created_at"],
        "signing": signing_identity(receipt["signing"], "relatte.receipt-signature/v0"),
        "extensions": receipt.get("extensions", {}),
    }


def verify_receipt(receipt: dict[str, Any]) -> None:
    body = receipt_identity_body(receipt)
    computed = "relatte-receipt-v0:" + sha256_hex(
        RECEIPT_ID_DOMAIN + canonicalize(body).encode("utf-8")
    )
    require_equal(receipt.get("receipt_id"), computed, "RECEIPT_ID_MISMATCH")
    signature_body = {"receipt_id": computed, **body}
    require(
        verify_p256(
            receipt["signing"]["public_key"],
            receipt["signing"]["signature"],
            RECEIPT_SIGNATURE_DOMAIN + canonicalize(signature_body).encode("utf-8"),
        ),
        "INVALID_RECEIPT_SIGNATURE",
    )


def key_fingerprint(specimen: str, key: Any) -> str:
    normalized = normalized_public_key(key)
    domain = f"SupaBardo-{specimen}-Key-v0|".encode("utf-8")
    return sha256_hex(domain + canonicalize(normalized).encode("utf-8"))


def verify_manifest(
    specimen: str,
    manifest: dict[str, Any],
    expected_body: dict[str, Any],
) -> str:
    lower = specimen.lower().replace("-", "")
    require_equal(
        manifest.get("schema"),
        f"supabardo.{lower}-evidence-manifest/v0",
        f"{specimen}_MANIFEST_SCHEMA",
    )
    require_equal(manifest.get("body"), expected_body, f"{specimen}_MANIFEST_BODY")
    domain = f"SupaBardo-{specimen}-EvidenceSet-v0|".encode("utf-8")
    computed = f"{lower}-evidence-v0:" + sha256_hex(
        domain + canonicalize(expected_body).encode("utf-8")
    )
    require_equal(manifest.get("evidence_set_id"), computed, f"{specimen}_EVIDENCE_ID")
    return computed


def assert_distinct(keys: list[str], code: str) -> None:
    require(len(set(keys)) == len(keys), code)


def verify_sb001(root: Path) -> dict[str, str]:
    particular = load_bytes(root, "sb001-static-os-particular.json")
    crossing = load_json(root, "sb001-signed-crossing.json")
    release = load_json(root, "sb001-release-receipt.json")
    unresolved = load_json(root, "sb001-unresolved-receipt.json")
    disposition = load_json(root, "sb001-admit-receipt.json")
    exit_receipt = load_json(root, "sb001-exit-receipt.json")
    manifest = load_json(root, "sb001-evidence-manifest.json")

    verify_crossing(crossing)
    for receipt in (release, unresolved, disposition, exit_receipt):
        verify_receipt(receipt)

    payload_hash = sha256_hex(particular)
    require_equal(payload_hash, "56376cad6f1c5f9b3bc671876dddeaf8ad63c90b2f162a11383b68561f51a82f", "SB001_PAYLOAD_HASH")
    require_equal(crossing["payload_refs"][0]["address"], f"sha256:{payload_hash}", "SB001_PAYLOAD_BINDING")
    require_equal(crossing["declared_kind"], "STATIC_OS_WHOLE_BODY_PARTICULAR", "SB001_KIND")
    require_equal(crossing["requested_effect"]["destination_disposition"], "local", "SB001_GLOBALIZED_REQUEST")

    require_equal(release["kind"], "SB001_RELEASE", "SB001_RELEASE_KIND")
    require_equal(release["semantic_effect"], "crossing-released", "SB001_RELEASE_EFFECT")
    require_equal(release["post_state_ref"], crossing["crossing_id"], "SB001_RELEASE_LINK")
    require_equal(unresolved["kind"], "SB001_UNRESOLVED_INTERVAL", "SB001_WAIT_KIND")
    require_equal(unresolved["semantic_effect"], "none", "SB001_WAIT_MEANING")
    require_equal(unresolved["pre_state_ref"], release["receipt_id"], "SB001_WAIT_LINK")
    require_equal(unresolved["extensions"]["supabardo"]["state"], "OPEN", "SB001_WAIT_STATE")
    require_equal(unresolved["extensions"]["supabardo"]["destination_disposition"], None, "SB001_PREDECIDED")
    require_equal(disposition["kind"], "R3_ADMIT", "SB001_NOT_ADMIT")
    require_equal(disposition["semantic_effect"], "sb001-local-constitution", "SB001_ADMIT_EFFECT")
    require_equal(disposition["extensions"]["local_receiver"]["disposition"], "ADMIT", "SB001_ADMIT_DISPOSITION")
    require_equal(
        disposition["extensions"]["local_receiver"]["supabardo_unresolved_receipt_id"],
        unresolved["receipt_id"],
        "SB001_ADMIT_ANCESTRY",
    )
    require_equal(exit_receipt["kind"], "SB001_EXIT", "SB001_EXIT_KIND")
    require_equal(exit_receipt["semantic_effect"], "none", "SB001_EXIT_MEANING")
    require_equal(exit_receipt["pre_state_ref"], unresolved["receipt_id"], "SB001_EXIT_WAIT_LINK")
    require_equal(exit_receipt["post_state_ref"], disposition["receipt_id"], "SB001_EXIT_DISPOSITION_LINK")

    source_fp = key_fingerprint("SB001", crossing["signing"]["public_key"])
    release_fp = key_fingerprint("SB001", release["signing"]["public_key"])
    bardo_fp = key_fingerprint("SB001", unresolved["signing"]["public_key"])
    exit_fp = key_fingerprint("SB001", exit_receipt["signing"]["public_key"])
    destination_fp = key_fingerprint("SB001", disposition["signing"]["public_key"])
    require_equal(source_fp, release_fp, "SB001_SOURCE_RELEASE_KEY_SPLIT")
    require_equal(bardo_fp, exit_fp, "SB001_BARDO_EXIT_KEY_SPLIT")
    assert_distinct([source_fp, bardo_fp, destination_fp], "SB001_ROLE_COLLAPSE")

    body = {
        "schema": "supabardo.sb001-evidence-set/v0",
        "specimen": "SB-001",
        "particular_sha256": payload_hash,
        "crossing_id": crossing["crossing_id"],
        "release_receipt_id": release["receipt_id"],
        "unresolved_receipt_id": unresolved["receipt_id"],
        "disposition_receipt_id": disposition["receipt_id"],
        "exit_receipt_id": exit_receipt["receipt_id"],
        "source_key_sha256": source_fp,
        "bardo_key_sha256": bardo_fp,
        "destination_key_sha256": destination_fp,
        "causal_chain": [
            "crossing_id -> release.post_state_ref",
            "release.receipt_id -> unresolved.pre_state_ref",
            "unresolved.receipt_id -> disposition.extensions.local_receiver.supabardo_unresolved_receipt_id",
            "unresolved.receipt_id -> exit.pre_state_ref",
            "disposition.receipt_id -> exit.post_state_ref",
        ],
        "claim_limit": "Integrity commitment only; does not elevate any signer, receipt, or timestamp into universal authority.",
    }
    evidence_id = verify_manifest("SB001", manifest, body)
    return {"specimen": "SB-001", "outcome": "ADMIT", "evidence_set_id": evidence_id}


def verify_sb002(root: Path) -> dict[str, str]:
    proposal_bytes = load_bytes(root, "sb002-toaster-proposal.json")
    proposal = json.loads(proposal_bytes.decode("utf-8"))
    crossing = load_json(root, "sb002-signed-crossing.json")
    release = load_json(root, "sb002-release-receipt.json")
    unresolved = load_json(root, "sb002-unresolved-receipt.json")
    disposition = load_json(root, "sb002-hold-receipt.json")
    exit_receipt = load_json(root, "sb002-exit-receipt.json")
    manifest = load_json(root, "sb002-evidence-manifest.json")

    verify_crossing(crossing)
    for receipt in (release, unresolved, disposition, exit_receipt):
        verify_receipt(receipt)

    proposal_hash = sha256_hex(proposal_bytes)
    require_equal(proposal_hash, "b9feba52bf6ca98f26d395d0e637d316600a856d379955c4fa47c36da4dfb545", "SB002_PROPOSAL_HASH")
    require_equal(proposal["state"]["proposal_only"], True, "SB002_NOT_PROPOSAL_ONLY")
    require_equal(proposal["state"]["source_selected_candidate"], False, "SB002_SOURCE_SELECTED")
    require_equal(proposal["state"]["destination_disposition"], None, "SB002_PREDECIDED_PROPOSAL")
    require_equal(proposal["state"]["render_authority"], False, "SB002_RENDER_AUTHORITY")
    require_equal(crossing["payload_refs"][0]["address"], f"sha256:{proposal_hash}", "SB002_PAYLOAD_BINDING")
    require_equal(crossing["declared_kind"], "HAUNTED_TOASTER_CREATIVE_PROPOSAL", "SB002_KIND")

    require_equal(release["kind"], "SB002_RELEASE", "SB002_RELEASE_KIND")
    require_equal(release["post_state_ref"], crossing["crossing_id"], "SB002_RELEASE_LINK")
    require_equal(unresolved["kind"], "SB002_UNRESOLVED_INTERVAL", "SB002_WAIT_KIND")
    require_equal(unresolved["semantic_effect"], "none", "SB002_WAIT_MEANING")
    require_equal(unresolved["pre_state_ref"], release["receipt_id"], "SB002_WAIT_LINK")
    require_equal(unresolved["extensions"]["supabardo"]["destination_disposition"], None, "SB002_WAIT_PREDECIDED")
    require_equal(disposition["kind"], "TOASTER_HOLD", "SB002_NOT_HOLD")
    require_equal(disposition["semantic_effect"], "proposal-held", "SB002_HOLD_EFFECT")
    local = disposition["extensions"]["local_receiver"]
    require_equal(local["disposition"], "HOLD", "SB002_HOLD_DISPOSITION")
    require_equal(local["render_authority"], False, "SB002_HOLD_RENDER")
    require_equal(local["human_keep_observed"], False, "SB002_FALSE_KEEP")
    require_equal(local["human_refuse_observed"], False, "SB002_FALSE_REFUSE")
    require_equal(local["supabardo_unresolved_receipt_id"], unresolved["receipt_id"], "SB002_HOLD_ANCESTRY")
    require_equal(exit_receipt["semantic_effect"], "none", "SB002_EXIT_MEANING")
    require_equal(exit_receipt["pre_state_ref"], unresolved["receipt_id"], "SB002_EXIT_WAIT_LINK")
    require_equal(exit_receipt["post_state_ref"], disposition["receipt_id"], "SB002_EXIT_HOLD_LINK")
    require_equal(exit_receipt["extensions"]["supabardo"]["destination_disposition"], "HOLD", "SB002_EXIT_RETCON")

    source_fp = key_fingerprint("SB002", crossing["signing"]["public_key"])
    release_fp = key_fingerprint("SB002", release["signing"]["public_key"])
    bardo_fp = key_fingerprint("SB002", unresolved["signing"]["public_key"])
    exit_fp = key_fingerprint("SB002", exit_receipt["signing"]["public_key"])
    destination_fp = key_fingerprint("SB002", disposition["signing"]["public_key"])
    require_equal(source_fp, release_fp, "SB002_SOURCE_RELEASE_KEY_SPLIT")
    require_equal(bardo_fp, exit_fp, "SB002_BARDO_EXIT_KEY_SPLIT")
    assert_distinct([source_fp, bardo_fp, destination_fp], "SB002_ROLE_COLLAPSE")

    body = {
        "schema": "supabardo.sb002-evidence-set/v0",
        "specimen": "SB-002",
        "proposal_sha256": proposal_hash,
        "crossing_id": crossing["crossing_id"],
        "release_receipt_id": release["receipt_id"],
        "unresolved_receipt_id": unresolved["receipt_id"],
        "disposition_receipt_id": disposition["receipt_id"],
        "exit_receipt_id": exit_receipt["receipt_id"],
        "source_key_sha256": source_fp,
        "bardo_key_sha256": bardo_fp,
        "destination_key_sha256": destination_fp,
        "causal_chain": [
            "crossing_id -> release.post_state_ref",
            "release.receipt_id -> unresolved.pre_state_ref",
            "unresolved.receipt_id -> disposition.extensions.local_receiver.supabardo_unresolved_receipt_id",
            "unresolved.receipt_id -> exit.pre_state_ref",
            "disposition.receipt_id -> exit.post_state_ref",
        ],
        "destination_disposition": "HOLD",
        "claim_limit": "Creative proposal crossing only; no KEEP, REFUSE, render authority, or universal SupaBardo promotion.",
    }
    evidence_id = verify_manifest("SB002", manifest, body)
    return {"specimen": "SB-002", "outcome": "HOLD", "evidence_set_id": evidence_id}


def verify_sb003(root: Path) -> dict[str, str]:
    ark_bytes = load_bytes(root, "sb003-ark.json")
    ark = json.loads(ark_bytes.decode("utf-8"))
    crossing = load_json(root, "sb003-signed-crossing.json")
    release = load_json(root, "sb003-release-receipt.json")
    unresolved = load_json(root, "sb003-unresolved-receipt.json")
    acceptance = load_json(root, "sb003-successor-acceptance-receipt.json")
    disposition = load_json(root, "sb003-successor-admit-receipt.json")
    exit_receipt = load_json(root, "sb003-exit-receipt.json")
    manifest = load_json(root, "sb003-evidence-manifest.json")

    verify_crossing(crossing)
    for receipt in (release, unresolved, acceptance, disposition, exit_receipt):
        verify_receipt(receipt)

    ark_hash = sha256_hex(ark_bytes)
    require_equal(ark["schema"], "supabardo.sb003-ark/v0", "SB003_ARK_SCHEMA")
    require_equal(ark["successor_policy"], "fresh-identity-required", "SB003_SUCCESSOR_POLICY")
    require_equal(crossing["payload_refs"][0]["address"], f"sha256:{ark_hash}", "SB003_ARK_BINDING")
    require_equal(crossing["declared_kind"], "SB003_SUCCESSION_ARK", "SB003_KIND")
    require_equal(crossing["requested_effect"]["successor_identity"], "fresh-required", "SB003_FRESH_IDENTITY_REQUEST")
    require(crossing["source_world"] != crossing["audience_policy"]["destination"], "SB003_SOURCE_DESTINATION_COLLAPSE")

    require_equal(release["kind"], "SB003_RELEASE", "SB003_RELEASE_KIND")
    require_equal(release["post_state_ref"], crossing["crossing_id"], "SB003_RELEASE_LINK")
    require_equal(unresolved["kind"], "SB003_UNRESOLVED_INTERVAL", "SB003_WAIT_KIND")
    require_equal(unresolved["semantic_effect"], "none", "SB003_WAIT_MEANING")
    require_equal(unresolved["pre_state_ref"], release["receipt_id"], "SB003_WAIT_LINK")
    require_equal(unresolved["extensions"]["supabardo"]["destination_disposition"], None, "SB003_PREDECIDED")

    succession = acceptance["extensions"]["succession"]
    require_equal(acceptance["kind"], "SB003_SUCCESSOR_ACCEPTANCE", "SB003_ACCEPTANCE_KIND")
    require_equal(acceptance["semantic_effect"], "none", "SB003_ACCEPTANCE_CREATED_MEANING")
    require_equal(acceptance["pre_state_ref"], unresolved["receipt_id"], "SB003_ACCEPTANCE_WAIT_LINK")
    require_equal(succession["authority"], "fresh-local", "SB003_INHERITED_AUTHORITY")
    require_equal(succession["inherited_private_key"], False, "SB003_INHERITED_KEY")
    require_equal(succession["inherited_admission"], False, "SB003_INHERITED_ADMISSION")
    require_equal(succession["predecessor_world_id"], "world:sb003-a", "SB003_PREDECESSOR_WORLD")
    require_equal(succession["successor_world_id"], "world:sb003-b", "SB003_SUCCESSOR_WORLD")

    local = disposition["extensions"]["local_receiver"]
    require_equal(disposition["kind"], "SB003_SUCCESSOR_ADMIT", "SB003_NOT_FRESH_ADMIT")
    require_equal(disposition["pre_state_ref"], acceptance["receipt_id"], "SB003_ADMIT_ACCEPTANCE_LINK")
    require_equal(local["disposition"], "ADMIT", "SB003_ADMIT_DISPOSITION")
    require_equal(local["successor_acceptance_receipt_id"], acceptance["receipt_id"], "SB003_ADMIT_ANCESTRY")
    require_equal(disposition["descendant_refs"], ["capability:sb003-successor-descendant"], "SB003_DESCENDANT")
    require_equal(exit_receipt["semantic_effect"], "none", "SB003_EXIT_MEANING")
    require_equal(exit_receipt["pre_state_ref"], unresolved["receipt_id"], "SB003_EXIT_WAIT_LINK")
    require_equal(exit_receipt["post_state_ref"], disposition["receipt_id"], "SB003_EXIT_DISPOSITION_LINK")

    source_fp = key_fingerprint("SB003", crossing["signing"]["public_key"])
    release_fp = key_fingerprint("SB003", release["signing"]["public_key"])
    bardo_fp = key_fingerprint("SB003", unresolved["signing"]["public_key"])
    exit_fp = key_fingerprint("SB003", exit_receipt["signing"]["public_key"])
    successor_fp = key_fingerprint("SB003", acceptance["signing"]["public_key"])
    disposition_fp = key_fingerprint("SB003", disposition["signing"]["public_key"])
    require_equal(source_fp, release_fp, "SB003_SOURCE_RELEASE_KEY_SPLIT")
    require_equal(bardo_fp, exit_fp, "SB003_BARDO_EXIT_KEY_SPLIT")
    require_equal(successor_fp, disposition_fp, "SB003_SUCCESSOR_DISPOSITION_KEY_SPLIT")
    assert_distinct([source_fp, bardo_fp, successor_fp], "SB003_ROLE_COLLAPSE")

    body = {
        "schema": "supabardo.sb003-evidence-set/v0",
        "specimen": "SB-003",
        "ark_sha256": ark_hash,
        "crossing_id": crossing["crossing_id"],
        "release_receipt_id": release["receipt_id"],
        "unresolved_receipt_id": unresolved["receipt_id"],
        "successor_acceptance_receipt_id": acceptance["receipt_id"],
        "disposition_receipt_id": disposition["receipt_id"],
        "exit_receipt_id": exit_receipt["receipt_id"],
        "source_key_sha256": source_fp,
        "bardo_key_sha256": bardo_fp,
        "successor_key_sha256": successor_fp,
        "causal_chain": [
            "crossing_id -> release.post_state_ref",
            "release.receipt_id -> unresolved.pre_state_ref",
            "unresolved.receipt_id -> successor_acceptance.pre_state_ref",
            "successor_acceptance.receipt_id -> disposition.pre_state_ref",
            "unresolved.receipt_id -> exit.pre_state_ref",
            "disposition.receipt_id -> exit.post_state_ref",
        ],
        "destination_disposition": "ADMIT",
        "claim_limit": "Succession continuity only; successor remains a fresh local identity and does not inherit predecessor key or admission.",
    }
    evidence_id = verify_manifest("SB003", manifest, body)
    return {
        "specimen": "SB-003",
        "outcome": "FRESH_LOCAL_ADMIT",
        "evidence_set_id": evidence_id,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
        help="repository root",
    )
    args = parser.parse_args()
    root = args.root.resolve()

    try:
        results = [verify_sb001(root), verify_sb002(root), verify_sb003(root)]
    except (Refusal, KeyError, IndexError, json.JSONDecodeError, OSError, ValueError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, separators=(",", ":")))
        return 1

    print(json.dumps({
        "ok": True,
        "verifier": "python-stdlib-p256/v0",
        "imports_relattes_typescript": False,
        "results": results,
    }, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
