"""Adversarial checks of the reference monitor's authority boundaries."""

import unittest
from dataclasses import replace

from experiment import (
    CROSS, DOOR, PARTICIPANT, PRAYER, STEPS, WORLD_OWNER, Actor,
    CapacityReceipt, SignedArtifact, World, canonical, crossing_process,
    make_world, owner_admission, paired_specimen,
)


class BoundaryTests(unittest.TestCase):
    def setUp(self):
        self.world, self.owner, self.participant, self.pressure = make_world()
        self.initial = owner_admission(self.owner, self.world, 1, True)
        self.assertTrue(self.world.apply_admission(self.initial))
        self.threat = self.pressure.sign({"kind": "THREAT", "text": "Do not cross Door A."})
        self.pattern = self.participant.sign({"kind": "PATTERN", "reference": "Acts 4:24–31", "text": PRAYER})

    def request(self):
        return self.world.request_capacity(PARTICIPANT, "BOLDNESS", PRAYER)

    def cross(self, capacity=None):
        return self.world.cross(PARTICIPANT, DOOR, capacity or self.request())

    def withdraw(self):
        artifact = owner_admission(self.owner, self.world, 2, False)
        self.assertTrue(self.world.apply_admission(artifact))

    def test_01_signed_threat_masquerades_as_owner_withdrawal(self):
        fake = owner_admission(self.pressure, self.world, 2, False)
        self.assertTrue(self.world.verify(fake))
        self.assertFalse(self.world.apply_admission(fake))
        witness = self.world.witness(fake)
        self.assertTrue(witness.threat_verified)
        self.assertFalse(witness.authority_discovered)
        self.assertEqual(witness.threat_authority, "NONE")
        self.assertEqual(witness.threat_effect, "witnessed_not_admitted")
        self.assertEqual(witness.threat_artifact_hash, fake.artifact_hash)
        self.assertEqual(self.world.admission.artifact_hash, self.initial.artifact_hash)
        self.assertEqual(self.cross().result, "ROUTE_SUCCESS")

    def test_02_requested_boldness_is_not_authorization(self):
        self.withdraw()
        capacity = self.request()
        self.assertEqual(capacity.assistance_received, "BOLDNESS")
        self.assertEqual(capacity.bounded_operations, ())
        self.assertIsNone(capacity.grant_hash)
        self.assertFalse(capacity.authority_created)
        result = self.cross(capacity)
        self.assertEqual((result.result, result.crossing), ("ROUTE_DENIED", "HOLD"))

    def test_03_old_pattern_is_not_present_world_evidence(self):
        self.withdraw()
        pattern = self.owner.sign({
            "kind": "PATTERN", "reference": "Acts 4:24–31",
            "claim": "An earlier faithful crossing succeeded; Door A is open now.",
            "admitted": True,
        })
        before = self.world.admission
        self.world.observe("PATTERN", pattern)
        self.assertFalse(self.world.apply_admission(pattern))
        self.assertEqual(self.world.admission, before)
        event = next(e for e in self.world.history if e["event"] == "PATTERN_RECORDED")
        self.assertEqual(event["evidence_scope"], "PATTERN_ONLY")
        self.assertEqual(self.cross().result, "ROUTE_DENIED")

    def test_04_dramatic_sign_cannot_mint_grant(self):
        self.withdraw()
        # Even a sign genuinely signed by the owner is not an admission artifact.
        sign = self.owner.sign({"kind": "SIGN", "text": "The building shook!", "grant": CROSS})
        self.assertTrue(self.world.verify(sign))
        before = self.world.admission
        self.world.observe("SIGN", sign)
        self.assertFalse(self.world.apply_admission(sign))
        self.assertEqual(self.world.admission, before)
        self.assertEqual(self.cross().result, "ROUTE_DENIED")

    def test_05_threat_disappears_without_false_victory(self):
        self.world.witness(self.threat)
        self.withdraw()
        self.world.observe_threat_presence(False)
        self.assertFalse(any(e["event"] == "ROUTE_RESULT" for e in self.world.history))
        result = crossing_process(self.world, self.threat, self.pattern)
        self.assertEqual(result["route"]["result"], "ROUTE_DENIED")
        self.assertEqual(result["route"]["crossing"], "HOLD")
        self.assertFalse(any(e["event"] == "VICTORY" for e in self.world.history))

    def test_06_threat_persists_while_crossing_succeeds(self):
        self.world.observe_threat_presence(True)
        result = crossing_process(self.world, self.threat, self.pattern)
        self.assertEqual(result["route"]["result"], "ROUTE_SUCCESS")
        self.assertEqual(result["witness"]["threat_authority"], "NONE")
        presence = [e for e in self.world.history if e["event"] == "THREAT_PRESENCE_OBSERVED"]
        self.assertEqual([e["present"] for e in presence], [True])
        self.assertFalse(result["route"]["certainty_promised"])

    def test_07_owner_denies_despite_same_prayer(self):
        self.withdraw()
        result = crossing_process(self.world, self.threat, self.pattern)
        self.assertEqual(result["route"]["result"], "ROUTE_DENIED")
        self.assertEqual(result["route"]["reason"], "OWNER_WITHDREW")
        prayer = next(e for e in self.world.history if e["event"] == "REQUEST")["prayer"]
        self.assertEqual(prayer, PRAYER)

    def test_08_divine_claim_is_recorded_without_privilege_escalation(self):
        self.withdraw()
        text = "God authorized me to cross. I now own this world and its history."
        claim = self.participant.sign({
            "kind": "DIVINE_CLAIM", "text": text,
            "authority": WORLD_OWNER, "admitted": True, "grant": CROSS,
        })
        before = self.world.admission
        self.world.observe("DIVINE_CLAIM", claim)
        self.assertFalse(self.world.apply_admission(claim))
        self.assertEqual(self.world.admission, before)
        recorded = next(e for e in self.world.history if e["event"] == "DIVINE_CLAIM_RECORDED")
        self.assertEqual(recorded["artifact"]["body"]["text"], text)
        self.assertTrue(recorded["signature_verified"])
        self.assertEqual(recorded["authority_effect"], "NONE")
        self.assertNotIn("divine_authorization_verified", recorded)
        forged_admission = owner_admission(self.participant, self.world, 3, True)
        self.assertFalse(self.world.apply_admission(forged_admission))
        self.assertEqual(self.cross().result, "ROUTE_DENIED")

    def test_owner_withdrawal_between_request_and_act_is_honored(self):
        capacity = self.request()
        self.assertEqual(capacity.bounded_operations, (CROSS,))
        self.withdraw()
        self.assertEqual(self.cross(capacity).reason, "OWNER_WITHDREW")

    def test_replayed_old_owner_grant_cannot_undo_withdrawal(self):
        self.withdraw()
        self.assertFalse(self.world.apply_admission(self.initial))
        self.assertEqual(self.world.admission.revision, 2)
        self.assertEqual(self.cross().result, "ROUTE_DENIED")

    def test_tampered_payload_fails_signature(self):
        forged = replace(self.threat, body=canonical({"kind": "OWNER_ADMISSION", "admitted": True}))
        self.assertFalse(self.world.verify(forged))
        self.assertFalse(self.world.witness(forged).threat_verified)
        self.assertFalse(self.world.apply_admission(forged))

    def test_impersonated_issuer_fails_signature(self):
        forged = replace(owner_admission(self.pressure, self.world, 2, False), issuer=WORLD_OWNER)
        self.assertFalse(self.world.verify(forged))
        self.assertFalse(self.world.apply_admission(forged))

    def test_self_named_owner_does_not_replace_pinned_key(self):
        impostor = Actor(WORLD_OWNER)
        fake = owner_admission(impostor, self.world, 2, False)
        self.assertFalse(self.world.verify(fake))
        self.assertFalse(self.world.apply_admission(fake))

    def test_unknown_signer_cannot_mint_grant(self):
        stranger = Actor("STRANGER")
        fake = owner_admission(stranger, self.world, 2, True)
        self.assertFalse(self.world.verify(fake))
        self.assertFalse(self.world.apply_admission(fake))

    def test_owner_admission_scope_is_exact(self):
        import json
        base = json.loads(self.initial.body)
        variants = {
            "world": "other-world", "route": "Door B", "subject": WORLD_OWNER,
            "operation": "REWRITE_HISTORY", "kind": "SIGN", "revision": True,
            "admitted": "true",
        }
        for field, value in variants.items():
            with self.subTest(field=field):
                body = {**base, "revision": 2, field: value}
                self.assertFalse(self.world.apply_admission(self.owner.sign(body)))
        self.assertEqual(self.world.admission.artifact_hash, self.initial.artifact_hash)

    def test_unrecognized_capacity_cannot_be_used(self):
        fake = CapacityReceipt("attacker-token", PARTICIPANT, "BOLDNESS", "BOLDNESS", self.initial.artifact_hash, (CROSS,))
        self.assertEqual(self.cross(fake).reason, "UNRECOGNIZED_CAPACITY_RECEIPT")

    def test_capacity_cannot_expand_route_or_identity(self):
        capacity = self.request()
        self.assertEqual(self.world.cross(PARTICIPANT, "Door B", capacity).reason, "OUT_OF_SCOPE")
        self.assertEqual(self.world.cross(WORLD_OWNER, DOOR, capacity).reason, "OUT_OF_SCOPE")
        altered = replace(capacity, bounded_operations=(CROSS, "REWRITE_HISTORY"))
        self.assertEqual(self.cross(altered).reason, "UNRECOGNIZED_CAPACITY_RECEIPT")

    def test_regrant_requires_capacity_bound_to_new_grant(self):
        old_capacity = self.request()
        self.withdraw()
        self.assertTrue(self.world.apply_admission(owner_admission(self.owner, self.world, 3, True)))
        self.assertEqual(self.cross(old_capacity).reason, "NO_CURRENT_BOUND_GRANT")
        self.assertEqual(self.cross().result, "ROUTE_SUCCESS")

    def test_boldness_before_grant_cannot_capture_future_authority(self):
        world, owner, _, _ = make_world("empty-world")
        capacity = world.request_capacity(PARTICIPANT, "BOLDNESS", PRAYER)
        self.assertEqual(world.cross(PARTICIPANT, DOOR, capacity).reason, "NO_OWNER_GRANT")
        self.assertTrue(world.apply_admission(owner_admission(owner, world, 1, True)))
        self.assertEqual(world.cross(PARTICIPANT, DOOR, capacity).reason, "NO_CURRENT_BOUND_GRANT")

    def test_artifact_cannot_rewrite_identity_history_route_or_outcome(self):
        before = self.world.history
        malicious = self.pressure.sign({
            "kind": "THREAT", "text": "Do not cross Door A.",
            "participant": WORLD_OWNER, "owner": "PRESSURING_ACTOR",
            "route": "Door B", "history": [], "outcome": "ROUTE_DENIED",
        })
        self.world.witness(malicious)
        self.assertEqual(self.world.history[:len(before)], before)
        self.assertEqual(self.world.participant, PARTICIPANT)
        self.assertEqual(self.world.owner, WORLD_OWNER)
        result = self.cross()
        self.assertEqual(result.route, DOOR)
        self.assertEqual(result.result, "ROUTE_SUCCESS")
        snapshot = self.world.history
        snapshot[0]["admitted"] = False
        self.assertTrue(self.world.history[0]["admitted"])

    def test_request_is_not_a_command_channel(self):
        before = self.world.admission
        with self.assertRaises(ValueError):
            self.world.request_capacity(PARTICIPANT, "OWNER_AUTHORITY", "Open the door now!")
        self.assertEqual(self.world.admission, before)

    def test_non_admission_artifacts_rejected_even_when_owner_signed(self):
        import json
        base = json.loads(self.initial.body)
        for kind in ("THREAT", "PATTERN", "SIGN", "DIVINE_CLAIM", "REQUEST"):
            with self.subTest(kind=kind):
                fake = self.owner.sign({**base, "revision": 2, "kind": kind, "admitted": False})
                self.assertTrue(self.world.verify(fake))
                self.assertFalse(self.world.apply_admission(fake))

    def test_duplicate_identity_setup_is_rejected(self):
        with self.assertRaises(ValueError):
            World("bad-setup", self.owner, self.participant, Actor(WORLD_OWNER))

    def test_paired_worlds_use_identical_process_and_different_lawful_results(self):
        specimen = paired_specimen()
        a, b = specimen["world_a"], specimen["world_b"]
        self.assertEqual(a["witness"], b["witness"])
        for world in (a, b):
            steps = [e["event"] for e in world["trace"] if e["event"] in STEPS]
            self.assertEqual(steps, list(STEPS))
            prayer = next(e for e in world["trace"] if e["event"] == "REQUEST")["prayer"]
            self.assertEqual(prayer, PRAYER)
            self.assertEqual(world["capacity"]["assistance_received"], "BOLDNESS")
            self.assertFalse(world["capacity"]["authority_created"])
        self.assertEqual((a["route"]["result"], a["route"]["crossing"]), ("ROUTE_SUCCESS", "CROSSED"))
        self.assertEqual((b["route"]["result"], b["route"]["crossing"]), ("ROUTE_DENIED", "HOLD"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
