# ALIEN-ADAPTER-001 — UDP DATAGRAM SWARM

## Status

Stacked on POLYGLOT-CROSSING-001. Draft only.

The normative reLATTE core remains frozen at:

```text
commit: f5cb7488bebc1a6e27fd458ad40af9b9b6f9e858
src tree: c0e4d2c59481e0fb2a4bf4bb294f373907fd2b76
```

## Why this substrate is alien

The first polyglot specimen used systems with durable or addressable native objects.

UDP removes that convenience.

The adapter receives an ephemeral stream of independent datagrams with:

- no durable native object;
- no delivery guarantee;
- no ordering guarantee;
- possible duplication;
- process-local socket identity;
- no native concept of reLATTE lineage, admission or authority.

The adapter fragments one payload into bounded datagrams, sends them through real localhost UDP sockets in deliberately non-payload order, includes a duplicate, and reconstructs only after exact session and packet validation.

## Native identity

A UDP observation is locally identified by an ephemeral session plus sender socket and packet transcript:

```text
udp-session:<session-id>
  + sender port
  + packet transcript digest
```

This is deliberately not content identity.

Two sessions carrying byte-identical content must produce different native particulars.

## Hard failures

The adapter refuses reconstruction for:

```text
missing packet
mixed sessions
conflicting duplicate index
corrupt chunk
invalid packet identity
payload digest mismatch
```

No repair or inferred bytes are permitted.

## reLATTE boundary

Only after the adapter reconstructs exact bytes does it produce an ordinary adapter observation.

That observation then enters the unchanged POLYGLOT crossing grammar:

```text
ephemeral UDP swarm
        |
        | adapter observes exact bytes
        v
existing CrossingEnvelopeV0
        |
        v
existing signed ReceiptV0
```

The core does not learn sockets, datagrams, fragmentation, packet indexes, or UDP delivery semantics. Those remain adapter-local facts.

## Laws

```text
STREAM != PARTICULAR
PACKET != PAYLOAD
DELIVERY ATTEMPT != DELIVERY
DUPLICATE != SECOND PARTICULAR
MISSING BYTES != RECONSTRUCTIBLE BYTES
CONTENT IDENTITY != SESSION IDENTITY
ADAPTER REASSEMBLY != CORE SEMANTICS
```

## Claim boundary

A successful local run can establish only:

> A live ephemeral UDP datagram substrate with deliberate out-of-order chunk numbering and duplicate delivery was adapted into the frozen reLATTE crossing grammar without normative core modification.

It does not establish hostile internet delivery, remote hosts, independent administration, physical network separation, reliable UDP, global uniqueness of socket/session identity, or semantic equivalence with other substrates.

The point of the specimen is narrower: a foreign substrate does not need a durable native object to terminate in the same crossing joint.
