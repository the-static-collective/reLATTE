# CAPABILITY KERNEL 001 — Permission Is Not Admission

**Status:** executable owner-local permission witness  
**Date:** 2026-10-02  
**Depends on:** RUNTIME BOOT 001

## Question

Can a runtime enforce typed permission for a foreign crossing without allowing identity, possession, delivery, or capability reference to become semantic admission?

CAPABILITY KERNEL 001 makes that boundary executable.

## Destination-issued grants

A capability is issued by the destination world's local kernel.

The grant schema is:

~~~text
relatte.capability-grant/v0
~~~

It binds an issuer identity and P-256 public key, one holder P-256 public key, one action, one destination world, an optional declared crossing kind, and an explicit validity window.

Current executable action:

~~~text
runtime.receive.crossing
~~~

A grant authorizes the runtime to place a matching foreign crossing into its durable receive path.

It does **not** authorize ADMIT.

~~~text
CAPABILITY != ADMISSION
~~~

## Holder binding

The crossing's signing public key must exactly match the grant's holder key.

Copying a capability reference into another validly signed crossing is insufficient.

~~~text
REFERENCE != AUTHORITY
POSSESSION != UNIVERSAL PERMISSION
~~~

The capability reference is inside the signed crossing identity, so changing it changes the crossing.

## Local authority

A foreign grant is executable only if the destination kernel actually stores and verifies it under that world's persistent issuer key.

The destination does not trust an arbitrary self-contained capability merely because its signature is internally valid.

~~~text
VALID SIGNATURE != LOCAL AUTHORIZATION
FOREIGN CLAIM != LOCAL GRANT
~~~

## Scope

The kernel enforces:

~~~text
grant.target_world == local world
holder key == crossing signing key
grant.action == requested action
not_before <= observed_at < expires_at
declared_kind matches when scoped
~~~

## Runtime composition

Local enqueue remains a distinct owner-local door.

Foreign enqueue crosses the capability kernel first:

~~~text
foreign signed crossing
        |
        v
capability reference
        |
        v
destination kernel
        |
    verify grant
        |
    verify holder
        |
    verify scope
        |
    verify time
        |
        v
durable inbox
        |
        v
LocalReceiver RECEIVE
        |
        v
still not ADMIT
~~~

## What this earns

CAPABILITY KERNEL 001 proves that destination-local issuer keys and signed grants survive runtime restart; grants bind a holder, destination, action, time window, and optional crossing kind; copied references do not authorize another holder; foreign enqueue can require capability verification; and successful capability use still yields RECEIVE rather than admission.

## What this does not earn

This does not yet provide revocation lists, delegation chains, attenuated child capabilities, quorum-issued capabilities, human identity, legal authority, automatic admission, or universal permissions.

## Laws

~~~text
IDENTITY != CAPABILITY
CAPABILITY != ADMISSION
CAPABILITY != HUMAN IDENTITY

REFERENCE != AUTHORITY
POSSESSION != UNIVERSAL PERMISSION

VALID SIGNATURE != LOCAL AUTHORIZATION
FOREIGN CLAIM != LOCAL GRANT
~~~

> **A key may open one declared door. It does not become the house.**
