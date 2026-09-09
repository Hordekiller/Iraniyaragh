# Observability Contract

Status: L0/L1 baseline for issue #136; reviewed 2026-09-09.

## Evidence classes

Diagnostic logs, telemetry and AuditLog are separate. Diagnostic output is
best-effort and may be sampled or unavailable; it must never block a commerce
operation. AuditLog remains the immutable business/security record and keeps the
failure semantics required by its owning domain. Neither is a substitute for the
other.

## Diagnostic event envelope

Production output is one JSON object per line on stdout (error/fatal use stderr):

| Field                            | Rule                                                           |
| -------------------------------- | -------------------------------------------------------------- |
| timestamp                        | UTC ISO-8601                                                   |
| severity / level                 | bounded logger level; level remains for compatibility          |
| service, environment, version    | server-derived resource identity                               |
| event                            | stable low-cardinality dotted name                             |
| message                          | bounded, redacted diagnostic text                              |
| requestId, correlationId         | safe correlation identifiers                                   |
| traceId, spanId                  | optional server-controlled W3C identifiers                     |
| outcome                          | optional success, failure or unknown                           |
| durationMs                       | optional non-negative measured duration                        |
| errorCode                        | optional stable application error code                         |
| actorRef, entityRef, businessRef | optional opaque safe references                                |
| data                             | optional bounded and recursively redacted allowlisted metadata |

Raw HTTP bodies, query maps, header maps, cookies, URLs with query/fragment, OTPs,
credentials, access/refresh/CSRF tokens, API keys, payment data, full destinations
and unrestricted PII are forbidden. Production errors never include stack traces.

## Defensive limits

- strings: 2,048 characters;
- objects: 64 own data properties;
- arrays: 64 items;
- nesting: eight levels;
- accessors are never invoked;
- cycles, invalid dates, functions, symbols and serialization failures degrade to a
  safe marker;
- logger serialization/output failures are swallowed without retry or recursion.

These are containment limits, not permission to log arbitrary objects. Producers
must still provide explicit safe metadata and stable event names. User-controlled
values must not become event names, metric labels or resource attributes.

## Delivery boundary

This baseline supplies event shape, request-context fields, redaction and safe
emission only. HTTP completion instrumentation, W3C parsing, Prisma/Redis/queue and
provider spans, collector/storage, retention enforcement, SLO alerts and the
permissioned admin diagnostics API remain later #136 slices. No admin or customer UI
may read logger internals or a storage backend directly.

## Verification

Unit canaries cover sensitive keys and values, raw HTTP containers, URL scrubbing,
depth/size/cardinality, circular values, hostile getters, Error causes, JSON safety,
production stack suppression, trace correlation and broken output streams. Later
instrumentation/export slices must repeat the canaries at every exporter boundary.
