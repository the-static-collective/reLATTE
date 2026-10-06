# DOOR POST 001

**Status:** executable cross-project postal specimen  
**Stack:** Three World Post Office 001 → DOOR POST 001  
**Purpose:** carry one authority-free Upper Room Scripture door to three sovereign receiver worlds, accept three bounded replies, and preserve them without automatic merger.

## Shape

```text
Upper Room
  static.door-packet/0.1
          |
          v
  Door Post edge adapter
          |
          v
reLATTE Carry Card RELEASE
          |
      SAME PARCEL
          |
   +------+------+ 
   |      |      |
Revival  DVOTE   GrO
 cover   cover   cover
   |      |      |
 HOLD    HOLD    HOLD
   |      |      |
 one bounded reply each
   +------+------+ 
          |
          v
 Upper Room postbag
 HOLD ALL / RANK NONE
```

The packet remains the inner letter. reLATTE owns the outer transport, cryptographic cover, capability boundary, RECEIVE receipt, local disposition, and bounded return door.

```text
ENVELOPE != LETTER
DOOR PACKET != ROOM EXPORT
PACKET != AUTHORITY
RELEASE != ADMISSION
RECEIVE != ADMIT
ONE REPLY DOOR != SHARED SESSION
POSTBAG != MERGER
```

## Source privacy

The source card may contain source-local context that never leaves Upper Room. DOOR POST 001 selects only the canonical `static.door-packet/0.1` JSON into the released carrying set.

The witness plants:

- a private Upper Room note;
- a room-presence string.

It asserts both are absent from every portable artifact.

This composes the Carry Card privacy law rather than widening the Door Packet schema.

## Receiver semantics remain receiver-local

The three synthetic receiver worlds return deliberately different result vocabularies:

- Revival-shaped held external candidate;
- DVOTE-shaped candidate with no life crossing;
- GrO-shaped local admission with a local affordance.

reLATTE does not interpret these receiver result objects. DOOR POST wraps each response only with:

```json
{
  "schema": "static.door-post-reply/0.1",
  "packetRef": "...",
  "receiverSystem": "...",
  "receiverResult": {},
  "authority": null
}
```

The wrapper correlates a bounded return to the originating packet. It does not normalize the receiver vocabularies.

## Distinct covers

All three recipients receive the same inner Carry Parcel identity but under distinct:

- crossing ids;
- encrypted payloads;
- recipient capabilities;
- return envelopes;
- portable ids.

Therefore:

```text
SAME PARCEL != SAME CIPHERTEXT
RECIPIENT COVER != GLOBAL BROADCAST
PARALLEL DELIVERY != CONSENSUS
```

## Returns

Each receiver:

1. RECEIVE;
2. decrypt;
3. recover the exact Door Packet;
4. HOLD the inbound crossing;
5. compose one receiver-local result;
6. use its one bounded Return Envelope;
7. send a reply whose crossing names the outbound crossing as parent.

Upper Room then:

1. RECEIVE each return;
2. decrypt;
3. verify packet correlation;
4. HOLD each returned crossing;
5. build one `relatte.static-postbag/v0`.

No compositor runs in DOOR POST 001.

That omission is deliberate.

```text
THREE RETURNS != AGREEMENT
RETURN ORDER != RANKING
COLLECTION != ADMISSION
POSTBAG != MERGER
NO COMPOSITOR != LOST HISTORY
```

## Executable witness

```bash
npm run witness:door-post
```

The witness uses three synthetic local runtimes named for the intended receiver roles. It does **not** claim live network contact with the Revival, DVOTE, or GrO repositories.

The proof is about the transport and sovereignty shape.

## What this earns

DOOR POST 001 proves that the newly defined Door Packet can use the existing reLATTE postal substrate without putting reLATTE semantics into the packet and without putting Scripture semantics into reLATTE core.

It establishes a bounded candidate architecture for:

```text
Upper Room selection
      ↓
Door Packet
      ↓
reLATTE postal crossing
      ↓
Revival / DVOTE / GrO
      ↓
bounded receiver-local returns
      ↓
Upper Room postbag
```

## What it does not earn

This does not yet prove:

- live integration with the three donor repositories;
- authenticated remote internet delivery between those applications;
- automatic Revival enrichment;
- automatic DVOTE action;
- automatic GrO consequence;
- human UI for release/customs decisions;
- AIHYPER integration;
- consensus, truth, theology, or global authority.

The specimen intentionally stops before composition.

> One door can visit three worlds without becoming three worlds' common mind.
