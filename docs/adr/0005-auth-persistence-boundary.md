# ADR-0005: Authentication Persistence and Identity Boundary

Status: Accepted

Date: 2026-08-31

## Context

Iraniyaragh needs one security principal for staff and customer authentication,
fine-grained authorization, revocable sessions, OTP flows and reliable security
audit history. The prototype schema used a single role enum and an `isActive` flag,
and did not model sessions, OTP attempts or permission assignments. A separate
`Customer` commerce model already exists, but its long-term relationship to an
authenticated user has not been decided in #14.

## Decision

- `User` is the canonical authentication and authorization principal. Its primary
  key is an opaque Prisma CUID stored as `String`.
- Mobile and email identifiers are optional individually but at least one is
  required. Mobile uses canonical Iranian E.164 form (`+989XXXXXXXXX`); email is
  trimmed and lowercased. Uniqueness and canonical form are enforced in PostgreSQL.
- User lifecycle and mobile/email verification are explicit states with consistent
  timestamps. Normal application flows soft-delete users with `DELETED` and
  `deletedAt` rather than erasing security history.
- RBAC is many-to-many through `UserRole` and `RolePermission`. Assignment rows keep
  actor, expiry and revocation metadata; backend authorization will evaluate active,
  non-expired assignments and active roles/permissions.
- Sessions store only a refresh-token hash, belong to a token family and record
  expiry, revocation and rotation linkage. OTP records store only destination/code
  hashes plus purpose, channel, expiry, attempt and terminal-state metadata.
- Login attempts and audit logs use safe hashes/metadata. Raw passwords, tokens,
  OTPs and IP addresses are forbidden in persistence and logs.
- Referential actions are explicit: subject-owned ephemeral security data cascades;
  historical actor references become null; referenced role/permission definitions
  are restricted where removal would destroy meaning.
- The initial migration is the database baseline because the repository previously
  had no committed migrations. It therefore creates pre-existing non-Auth tables
  unchanged as well as the new Auth/RBAC structures.

## Customer boundary

`Customer` remains a commerce profile, not a second authentication principal.
Until #14 defines linkage, merge and privacy/anonymization rules:

- do not infer `User`/`Customer` ownership by matching mobile numbers;
- do not authorize customer orders from a caller-supplied customer or user ID;
- do not add an implicit one-to-one foreign key in unrelated feature work.

A forward migration and contract-first PR will implement the accepted #14 decision.

## Consequences

- Auth services can be implemented without changing persistence contracts or
  storing recoverable credentials.
- Database checks defend invariants even when writes bypass Prisma services.
- Reassigning a previously revoked role/permission deliberately updates/reactivates
  its unique assignment row; the immutable audit log preserves the change history.
- Prisma schema generation does not reproduce custom `CHECK` constraints, so future
  migrations must preserve and test the SQL invariants explicitly.
- This ADR does not implement login endpoints, hashing algorithms, token issuance,
  OTP delivery, TOTP or runtime permission enforcement.

## Verification

- `prisma validate`, `prisma generate` and `prisma migrate deploy`
- `apps/api/prisma/tests/auth_constraints.sql` against a clean PostgreSQL database
- API lint, typecheck, tests and build
