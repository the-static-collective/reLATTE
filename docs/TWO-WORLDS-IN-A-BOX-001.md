# TWO WORLDS IN A BOX 001 — Two Doors, Two Authorities

**Status:** executable dual-runtime witness  
**Date:** 2026-10-02  
**Depends on:** CAPABILITY KERNEL 001 and BLACK FLAG 001

## Question

Can two complete reLATTE runtimes exchange signed crossings under independently issued capabilities, survive process death in one world, disagree about the received material, and return a signed response without sharing receiver state or capability authority?

TWO WORLDS IN A BOX 001 does exactly that.

## Box

The witness creates two independent runtime roots:

~~~text
BOX/
  world-a/
    world.rel.json
    receiver/
    capabilities/
    road-memory/
    runtime-receipt-bus.jsonl
    inbox/
    outbox/

  world-b/
    world.rel.json
    receiver/
    capabilities/
    road-memory/
    runtime-receipt-bus.jsonl
    inbox/
    outbox/
~~~

Each world owns a different manifest identity, LocalReceiver key, capability issuer key, receiver history, and runtime receipt bus.

~~~text
WORLD A != WORLD B
SHARED CROSSING != SHARED WORLD STATE
~~~

## A to B

World B first issues a capability to A's outbound crossing key:

~~~text
B capability kernel
      |
      v
holder = A crossing key
action = runtime.receive.crossing
target = WORLD B
kind   = WORLD_A_PROPOSAL
~~~

A signs the proposal with that capability reference. B verifies the grant before the proposal can enter B's foreign inbox.

## Black Flag inside B

B's runtime is launched as a separate process.

The voyage kills B after LocalReceiver RECEIVE is durable but before queue WORK_COMMITTED.

B reboots, reconstructs its receiver and capability kernel, reclaims the pending work, reuses the same RECEIVE receipt, and commits the queue once.

Then B independently chooses:

~~~text
REFUSE
~~~

No transport capability can prevent that refusal.

## B to A is a different permission

B is not allowed to return material merely because A was allowed to enter B.

A separately issues B a fresh capability:

~~~text
A capability kernel
      |
      v
holder = B response key
action = runtime.receive.crossing
target = WORLD A
kind   = SOVEREIGN_RESPONSE
~~~

Therefore:

~~~text
CAPABILITY A→B != CAPABILITY B→A
~~~

B packages its independently signed receive/refusal receipts into a sovereign response bundle and signs a fresh response crossing whose parent is A's proposal.

A verifies its own grant, receives B's response, and independently chooses:

~~~text
HOLD
~~~

## Final topology

~~~text
WORLD A                                WORLD B
-------                                -------

A key                                  B capability issuer
  |                                          |
  |<------ grant to enter B ----------------|
  |
proposal crossing
  |
  +-----------------------------------------> foreign inbox
                                              |
                                              v
                                         RECEIVE
                                              |
                                            SIGKILL
                                              X
                                              |
                                            REBOOT
                                              |
                                         same receipt
                                              |
                                           REFUSE
                                              |
                                       sovereign response
                                              |
A capability issuer                          B response key
  |                                          |
  +------ grant to enter A ----------------->|
                                              |
response crossing
  |<-----------------------------------------+
  |
RECEIVE
  |
HOLD
~~~

The dispositions diverge without protocol failure:

~~~text
WORLD B: REFUSE proposal
WORLD A: HOLD response
~~~

## What this earns

TWO WORLDS IN A BOX 001 proves:

- two complete runtime roots coexist without shared receiver state;
- each runtime owns an independent capability issuer;
- A→B permission does not imply B→A permission;
- capability enforcement survives destination-runtime process death;
- B reuses the same RECEIVE receipt after Black Flag restart;
- B can REFUSE a capability-authorized delivery;
- B can return a signed sovereign response only under a separate A-issued capability;
- A can HOLD B's response independently;
- no automatic admission occurs in either world;
- disagreement is a valid terminal state.

## What this does not earn

This box does not yet prove remote Internet hosting, multi-machine deployment, capability revocation, delegated capabilities, encrypted payload exchange, runtime-peer discovery, global agreement, or BFT consensus.

Those are future doors, not hidden claims.

## Laws

~~~text
IDENTITY != CAPABILITY
CAPABILITY != ADMISSION

CAPABILITY A→B != CAPABILITY B→A
REFERENCE != AUTHORITY

PROCESS DEATH != WORLD DEATH
REPLAY != DUPLICATE CONSEQUENCE

RESPONSE != AGREEMENT
WORLD A != WORLD B
SHARED CROSSING != SHARED WORLD STATE
DIVERGENT DISPOSITION != PROTOCOL FAILURE
~~~

> **Two worlds may share a traveler without sharing a throne.**
