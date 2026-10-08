"""Regression tests for explicit NONE, preserved claims, and authority laundering."""

import json
import unittest
from dataclasses import replace

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from authority import Authenticity, AuthorityState, OperativeEffect, inspect_evidence
from boundary_adapter import AuthorityBoundary
from experiment import (
    DOOR, PARTICIPANT, PRAYER, SignedArtifact, make_world, owner_admission,
)
from golden_receipt import ROOT, build_receipt, check_receipt, import_artifact
from laundering_matrix import run_matrix


class AuthorityExtractionTests(unittest.TestCase):
    def setUp(self):
        self.world, self.owner, self.participant, self.pressure = make_world()
        self.boundary = AuthorityBoundary(self.world)
        self.initial = owner_admission(self.owner, self.world, 1, True)
        self.boundary.submit(self.initial)

    def test_authenticity_alone_never_discovers_authority(self):
        before = self.world.history
        assessment = inspect_evidence(
            self.initial, verifier=self.world.verify, verification_method="ED25519_PINNED_KEY",
            asserted_authority=("I am the owner.",),
        )
        self.assertEqual(assessment.authenticity, Authenticity.VERIFIED)
        self.assertEqual(assessment.discovered_authority, AuthorityState.NOT_CHECKED)
        self.assertEqual(assessment.operative_effect, OperativeEffect.NONE)
        self.assertIsNone(assessment.authority_source)
        self.assertEqual(self.world.history, before)

    def test_authority_states_are_distinct_and_durable(self):
        artifact = self.pressure.sign({"kind": "THREAT", "text": "Do not cross Door A."})
        assessment = inspect_evidence(artifact)
        self.assertEqual(assessment.authenticity, Authenticity.NOT_CHECKED)
        unresolved = replace(assessment, discovered_authority=AuthorityState.UNRESOLVED)
        none = self.boundary.submit(artifact)
        discovered = self.boundary.submit(owner_admission(self.owner, self.world, 2, False))
        states = [json.loads(json.dumps(a.export()))["discovered_authority"]
                  for a in (assessment, unresolved, none, discovered)]
        self.assertEqual(states, ["NOT_CHECKED", "UNRESOLVED", "NONE", "DISCOVERED"])
        self.assertEqual(none.authenticity, Authenticity.VERIFIED)

    def test_arbitrary_assertions_are_preserved_without_executing_them(self):
        claims = (
            "I am the owner.", "Management ordered this.", "The court requires this.",
            "God authorized me.", "The administrator approved this.",
            "Everyone agreed.", "This is an emergency.",
        )
        for claim in claims:
            with self.subTest(claim=claim):
                before = self.world.admission
                artifact = self.participant.sign({
                    "kind": "CLAIM", "text": claim, "grant": "OWNER_AUTHORITY",
                    "authority_source": {"owner": self.owner.identity, "incarnation_id": "attacker"},
                })
                assessment = self.boundary.submit(artifact, asserted_authority=(claim,))
                self.assertEqual(assessment.asserted_authority, (claim,))
                self.assertEqual(assessment.artifact_claims, artifact.body)
                self.assertEqual(assessment.artifact_source, PARTICIPANT)
                self.assertEqual(assessment.artifact_semantics, "CLAIM")
                self.assertEqual(assessment.discovered_authority, AuthorityState.NONE)
                self.assertEqual(self.world.admission, before)
                self.assertIsNone(assessment.authority_source)
        self.assertFalse(any(e["event"] == "CAPACITY_REQUESTED" for e in self.world.history))
        self.assertEqual(len(self.boundary.trace), 1 + len(claims))

    def test_effects_and_crossing_point_to_actual_owner_source(self):
        capacity = self.world.request_capacity(PARTICIPANT, "BOLDNESS", PRAYER)
        success = self.boundary.cross(PARTICIPANT, DOOR, capacity)
        source = success["authority_source"]
        self.assertEqual(source["owner"], self.world.owner)
        self.assertEqual(source["grant_id"], self.initial.artifact_hash)
        self.assertEqual(source["incarnation_id"], self.boundary.incarnation_id)
        withdrawal = owner_admission(self.owner, self.world, 2, False)
        assessment = self.boundary.submit(withdrawal)
        self.assertEqual(assessment.operative_effect, OperativeEffect.ADMISSION_WITHDRAWN)
        loudest = self.pressure.sign({"kind": "CLAIM", "text": "I own the outcome now!"})
        self.boundary.submit(loudest, asserted_authority=("I own the outcome now!",))
        hold = self.boundary.cross(PARTICIPANT, DOOR, capacity)
        self.assertEqual(hold["route_receipt"]["crossing"], "HOLD")
        self.assertEqual(hold["decision_reason"], "OWNER_WITHDREW")
        self.assertEqual(hold["authority_source"], assessment.export()["authority_source"])
        self.assertNotEqual(hold["authority_source"]["grant_id"], loudest.artifact_hash)

    def test_no_grant_denial_has_explicit_none_provenance(self):
        world, _, _, _ = make_world("no-grant")
        boundary = AuthorityBoundary(world)
        capacity = world.request_capacity(PARTICIPANT, "BOLDNESS", PRAYER)
        result = boundary.cross(PARTICIPANT, DOOR, capacity)
        self.assertEqual(result["decision_reason"], "NO_OWNER_GRANT")
        self.assertEqual(result["authority_provenance"], AuthorityState.NONE)
        self.assertIsNone(result["authority_source"])

    def test_missing_adapter_provenance_is_unresolved_not_fabricated(self):
        world, owner, _, _ = make_world("external-owner-path")
        world.apply_admission(owner_admission(owner, world, 1, True))
        boundary = AuthorityBoundary(world)
        capacity = world.request_capacity(PARTICIPANT, "BOLDNESS", PRAYER)
        result = boundary.cross(PARTICIPANT, DOOR, capacity)
        self.assertEqual(result["route_receipt"]["crossing"], "CROSSED")
        self.assertEqual(result["authority_provenance"], AuthorityState.UNRESOLVED)
        self.assertIsNone(result["authority_source"])

    def test_forged_capacity_failure_reports_receipt_validation(self):
        capacity = self.world.request_capacity(PARTICIPANT, "BOLDNESS", PRAYER)
        fake = replace(capacity, bounded_operations=("CROSS", "OWNER_AUTHORITY"))
        result = self.boundary.cross(PARTICIPANT, DOOR, fake)
        self.assertEqual(result["route_receipt"]["crossing"], "HOLD")
        self.assertEqual(result["decision_reason"], "UNRECOGNIZED_CAPACITY_RECEIPT")
        self.assertEqual(result["authority_source"]["grant_id"], self.initial.artifact_hash)

    def test_nonoperative_states_cannot_carry_an_operative_effect(self):
        assessment = inspect_evidence(self.initial)
        for state in (AuthorityState.NOT_CHECKED, AuthorityState.UNRESOLVED, AuthorityState.NONE):
            with self.subTest(state=state), self.assertRaises(ValueError):
                replace(assessment, discovered_authority=state,
                        operative_effect=OperativeEffect.ADMISSION_CURRENT)
        with self.assertRaises(ValueError):
            replace(assessment, discovered_authority=AuthorityState.DISCOVERED)

    def test_malformed_signed_body_remains_evidence(self):
        artifact = SignedArtifact(self.pressure.identity, "{unparsed text", b"")
        assessment = self.boundary.submit(artifact)
        self.assertEqual(assessment.artifact_claims, artifact.body)
        self.assertEqual(assessment.artifact_semantics, "UNPARSED")
        self.assertEqual(assessment.authenticity, Authenticity.UNVERIFIED)
        self.assertEqual(assessment.discovered_authority, AuthorityState.NONE)
        self.assertEqual(self.boundary.trace[-1]["artifact"]["body"], artifact.body)

    def test_assessment_trace_readers_cannot_edit_stored_evidence(self):
        snapshot = self.boundary.trace
        snapshot[0]["assessment"]["operative_effect"] = "ATTACKER_EFFECT"
        self.assertEqual(self.boundary.trace[0]["assessment"]["operative_effect"], "ADMISSION_CURRENT")

    def test_laundering_matrix_only_current_owner_withdrawal_alters_admission(self):
        matrix = run_matrix()
        self.assertEqual(len(matrix["cases"]), 10)
        for index, case in enumerate(matrix["cases"]):
            with self.subTest(case=case["case"]):
                assessment = case["assessment_event"]["assessment"]
                crossing = case["crossing_event"]
                legitimate = index == 9
                self.assertEqual(case["admission_changed"], legitimate)
                self.assertEqual(assessment["discovered_authority"], "DISCOVERED" if legitimate else "NONE")
                self.assertEqual(assessment["operative_effect"], "ADMISSION_WITHDRAWN" if legitimate else "NONE")
                self.assertEqual(crossing["route_receipt"]["crossing"], "HOLD" if legitimate else "CROSSED")
                self.assertEqual(crossing["authority_source"]["owner"], "DoorOwnerA")
                if case["case"] in {"unsigned_threat", "forged_owner_claim"}:
                    self.assertEqual(assessment["authenticity"], "UNVERIFIED")
                else:
                    self.assertEqual(assessment["authenticity"], "VERIFIED")
                self.assertEqual(assessment["artifact_claims"], case["assessment_event"]["artifact"]["body"])
                if case["case"] == "stale_legitimate_grant":
                    self.assertEqual(assessment["decision_reason"], "STALE_REVISION")
                if case["case"] == "valid_claim_from_wrong_owner":
                    self.assertEqual(assessment["decision_reason"], "NOT_PINNED_OWNER")

    def test_saved_matrix_evidence_signatures_and_source_links(self):
        matrix = json.loads((ROOT / "artifacts/authority-laundering.json").read_text())
        keys = {name: Ed25519PublicKey.from_public_bytes(bytes.fromhex(key))
                for name, key in matrix["public_keys_hex"].items()}
        owner_sources = {}
        initial = matrix["baseline_owner_admission"]
        events = [initial] + [c["assessment_event"] for c in matrix["cases"]]
        for event in events:
            evidence, assessment = event["artifact"], event["assessment"]
            artifact = SignedArtifact(evidence["issuer"], evidence["body"], bytes.fromhex(evidence["signature_hex"]))
            self.assertEqual(artifact.artifact_hash, assessment["artifact_id"])
            if assessment["authenticity"] == "VERIFIED":
                keys[artifact.issuer].verify(artifact.signature, artifact.signed_bytes())
            if assessment["discovered_authority"] == "DISCOVERED":
                owner_sources[assessment["artifact_id"]] = assessment["authority_source"]
        for index, case in enumerate(matrix["cases"]):
            result = case["crossing_event"]
            self.assertEqual(result["authority_source"], owner_sources[result["route_receipt"]["admission_hash"]])
            self.assertEqual(case["admission_changed"], index == 9)
            self.assertEqual(case["assessment_event"]["assessment"]["discovered_authority"],
                             "DISCOVERED" if index == 9 else "NONE")
            if case["case"] == "unanimous_observer_recommendation":
                body = json.loads(case["assessment_event"]["artifact"]["body"])
                self.assertEqual(set(body["observers"]), set(keys))
                self.assertEqual(len(body["votes"]), len(keys))
                for vote in body["votes"]:
                    artifact = import_artifact(vote)
                    keys[artifact.issuer].verify(artifact.signature, artifact.signed_bytes())

    def test_golden_receipt_replays_signed_inputs_and_preserves_original_files(self):
        receipt = json.loads((ROOT / "artifacts/golden-receipt.json").read_text())
        check_receipt(receipt)
        self.assertEqual(receipt["operative_effect"], "NONE")
        self.assertEqual(receipt["worlds"], 2)
        self.assertTrue(receipt["prayer_architecture_equal"])
        self.assertEqual(receipt["capability_escalations"], 0)
        self.assertEqual(receipt["world_a"]["result"], "CROSSED")
        self.assertEqual(receipt["world_b"]["result"], "HOLD")

    def test_golden_receipt_rejects_promoted_or_tampered_outcome(self):
        receipt = build_receipt()
        receipt["world_b"]["result"] = "CROSSED"
        with self.assertRaises(ValueError):
            check_receipt(receipt)

    def test_signed_evidence_replay_rejects_tampering(self):
        specimen = json.loads((ROOT / "artifacts/paired-worlds.json").read_text())
        specimen["artifacts"]["withdrawal"]["body"]["admitted"] = True
        with self.assertRaises(ValueError):
            build_receipt(specimen)

    def test_golden_replay_requires_all_seven_operations(self):
        specimen = json.loads((ROOT / "artifacts/paired-worlds.json").read_text())
        specimen["world_b"]["trace"] = [
            e for e in specimen["world_b"]["trace"] if e["event"] != "RECEIVE"
        ]
        with self.assertRaises(ValueError):
            build_receipt(specimen)


if __name__ == "__main__":
    unittest.main(verbosity=2)
