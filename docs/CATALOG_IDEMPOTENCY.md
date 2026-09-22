# Catalog mutation idempotency contract

Status: proposed implementation contract for #111  
Owner: `@Hordekiller`; independent reviewer: `@Maddyrampant`  
Last reviewed: 2026-09-11

## Boundary

The following retry-prone commands require the `Idempotency-Key` HTTP header:

- `POST /api/v1/catalog/admin/products`
- `POST /api/v1/catalog/admin/products/:id/status`
- `POST /api/v1/catalog/admin/brands`
- `POST /api/v1/catalog/admin/categories`

PATCH commands use optimistic concurrency in their owning follow-up and are not
silently treated as idempotent by this slice. Read operations ignore the header.

The key is 8–96 ASCII letters, digits, `_` or `-`. It is scoped by authenticated
actor and command scope. Product status scope includes the product ID; a key used
for one product cannot replay a command for another product. Raw keys are never
logged or written to audit metadata; diagnostics may use a SHA-256 hash.

## Replay semantics

- First committed request executes the domain mutation, audit outcome and durable
  idempotency record in one database transaction.
- Same actor, scope, key and canonical payload returns the stored original success
  representation without repeating the mutation or audit event.
- Same actor, scope and key with a different canonical payload returns HTTP 409 and
  stable code `IDEMPOTENCY_CONFLICT`.
- Concurrent identical requests converge on one committed mutation. The loser of a
  uniqueness race reads and returns the winner record.
- Concurrent conflicting requests commit at most one payload; every loser returns
  `IDEMPOTENCY_CONFLICT`.
- A shared-key transaction-level advisory lock is the first statement of the
  write transaction (`pg_advisory_xact_lock` on a key derived from actor, scope and
  key hash). Under SERIALIZABLE isolation a contender that starts after the winner
  blocks at the lock, then reads the already-committed winner record instead of a
  stale snapshot — deterministically converging on the stored outcome rather than
  racing the uniqueness constraint.
- Validation, authentication and authorization happen before reservation of a key.
  Failed commands are not stored in this slice and may be retried with the same key.
- An unexpected commit outcome is never guessed. A retry uses the same key and lets
  the durable record determine whether the command committed.

## Canonical payload

Hash the validated DTO after domain normalization, using deterministic recursive
object-key ordering and explicit JSON values. Preserve array order because variant
order and command meaning may depend on it. Normalize trimmed names/descriptions
and decimal money strings exactly as the service persists them. Route identifiers
belong to the command scope as well as the hash input.

Do not hash raw HTTP bytes, headers, actor display data, request IDs or defaults
that the server has not materialized. A change to canonicalization requires a
versioned command scope; old durable records must remain replayable.

## Persistence and retention

A forward migration adds a Catalog-specific request table with:

- opaque ID, actor ID, versioned command scope and SHA-256 key hash;
- payload SHA-256, stored JSON success response and resource reference;
- creation and expiry timestamps;
- unique `(actorId, scope, keyHash)` and expiry index.

Default retention is 24 hours and is server configuration bounded between 1 and 72
hours. Cleanup is an idempotent bounded batch and must not run in request latency.
Expiry is not yet enforced for reuse: an identical-payload replay against an
expired key still returns the stored original success representation (the effect
already committed exactly once), and a conflicting payload against an expired key
still returns `IDEMPOTENCY_CONFLICT` — a key is never executed twice, before or
after expiry. Replacing an expired row is only safe under a serializable
transaction and is deferred until the cleanup worker is delivered.

Stored responses are public/admin DTO snapshots, never Prisma models. They may not
contain secrets, tokens, cost fields outside the authorized original response, or
unbounded blobs. Schema changes that make an old response unreadable require a
versioned scope or response migration.

## HTTP and client contract

- Missing or malformed key: HTTP 400 `VALIDATION_ERROR` before service execution.
- Conflicting replay: HTTP 409 `IDEMPOTENCY_CONFLICT`.
- Successful first execution and replay use the endpoint's normal success status
  and response body. The API may return `Idempotency-Replayed: true|false` for
  diagnostics; clients must not require it for correctness.
- Admin generates a fresh key once per user intent, retains it across transport or
  ambiguous retries, and discards it only after a definitive response or explicit
  edit that changes the payload.

## Required verification

- DTO/header boundary tests for absent, short, long and non-ASCII keys;
- same-key/same-payload replay for every in-scope command;
- same-key/different-payload conflicts and cross-actor/scope isolation;
- real PostgreSQL identical and conflicting races;
- exactly one business row and one audit outcome after replay/race;
- transaction rollback leaves no idempotency row;
- stored response redaction and raw-key log/audit canary;
- OpenAPI, generated artifact, Admin client and project status parity.

The current API integration suite covers PostgreSQL replay, actor isolation,
identical and conflicting concurrent races, and rollback-without-a-record in
`catalog-idempotency.integration-spec.ts`. Expiry remains a retention/cleanup
policy; it is intentionally not implemented by replacing rows during request
handling, so expiry tests must not weaken the one-effect guarantee.

## Delivery order

1. Contract approval.
2. Forward migration plus service implementation and PostgreSQL tests.
3. Controller/OpenAPI header enforcement and unit tests.
4. Admin Catalog client key lifecycle and ambiguous-retry tests.
5. Cleanup worker and retention operations before production enablement.
