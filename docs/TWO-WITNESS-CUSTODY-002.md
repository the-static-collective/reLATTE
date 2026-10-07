# TWO-WITNESS-CUSTODY-002

FOUNDATION-OF-TRUST-001 corrects the original custody claim. Separate ephemeral CI jobs can be externally observed through platform execution records; public artifacts alone do not demonstrate separate actual machines, key-creation chronology, administrative independence or absence of hidden key export [C06, C07, C26–C28, C36]. All IDs refer to the [claim matrix](FOUNDATION-OF-TRUST-001-CLAIM-MATRIX.md).

The existing A → B → C workflow remains a real transport/execution boundary: A creates a source key locally and exports a public crossing; B requires A's artifact, creates its receiver key locally and exports a matching receipt; C possesses only intended public evidence and re-verifies both records [C10, C11, F03]. Private fields, unexpected files, symlinks, duplicate JSON names, mixed runs, identical claimed fingerprints and unsigned runner-metadata substitutions fail with specific reasons [C03, C15, C30].

The signed records now bind job declarations. Changing an unsigned artifact wrapper no longer changes those signed declarations unnoticed. Malicious valid participants can still fabricate different fingerprints from one process, so the artifact-only result is:

```text
E3 CORROBORATED-KEYS
cryptographic independence = DISTINCT_SIGNING_KEYS_ONLY
machine separation = UNOBSERVED_FROM_SELF_REPORTED_FINGERPRINTS
receiver job ordering = UNOBSERVED_FROM_ARTIFACTS
custody/administrative/human separation = UNOBSERVED
```

These are bounded key-attribution and binding conclusions, not historical truth or authority [C03, C08, C10, C12, C25]. C's observed ability to reconstruct records from public artifacts is separate from externally observed facts about how CI scheduled A/B [C24, C36].

Receiver receipt binding to the source crossing establishes a causal reference, but cannot prove B's key was freshly created after A or that a malicious participant never copied a private key through another channel. The intended code path and transported schema can be inspected; universal non-export cannot be inferred [C11, C13, C28].

The earlier stronger prose claiming “machine-separated, non-transferred signing custody inside one brokered run” is superseded by this bounded classification. The signed-machine-spoofing hostile case intentionally succeeds cryptographically and must keep E4/E5/human independence UNOBSERVED [C07, C26–C28].
