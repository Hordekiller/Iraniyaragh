# ADR-0011: SMS.ir Provider Adapter and Secure Admin Settings

Status: Accepted (PR #116, commit `9b4ba32`, 2026-09-08)

Date: 2026-09-08

## Context

Customer authentication already issues and verifies short-lived OTP challenges, but
production SMS delivery is intentionally absent. The project owner selected SMS.ir
and will obtain the required account and sending line. Cost is not a fixed
architecture constraint: delivery volume and commercial terms may change, so Auth
must not depend directly on one vendor.

Operations also require an admin settings surface. That surface must not turn the
application database or browser into a secret store, and it must not allow operators
to weaken mandatory OTP expiry, attempt, hashing or rate-limit invariants.

## Decision

### Provider boundary

- SMS.ir is the initial production provider behind a vendor-neutral `SmsProvider`
  port owned by the notification/infrastructure boundary.
- Auth supplies a purpose, normalized destination reference, template parameters and
  correlation/idempotency context. It does not import SMS.ir SDK types or interpret
  vendor response models.
- The adapter maps vendor responses into stable accepted, rejected, rate-limited,
  unavailable and unknown-result outcomes. An ambiguous timeout is not blindly
  retried because the provider may already have accepted the message.
- CI, unit, integration and browser tests use a deterministic fake adapter and make
  no external provider request.

### Configuration model

The admin panel may manage these non-secret, versioned settings within server bounds:

- provider enabled/disabled and environment indicator;
- verification template identifier and sender-line identifier;
- bounded request timeout;
- delivery-status collection/retention switch;
- outage mode and operator-facing maintenance message;
- sanitized alert thresholds and channel references.

Mandatory OTP TTL, resend cooldown, attempt limits, identifier/IP rate limits,
cryptographic hashing and eligibility policy remain code/config invariants. Admin
settings cannot relax them.

### Secret boundary

- The SMS.ir API key is held in the deployment secret manager or injected environment,
  addressed by an opaque secret reference.
- The key is write-only at the operational boundary: blank means unchanged; a new
  value replaces/rotates it. No API can read it back.
- Admin shows only configured/not-configured, a fixed mask, last rotation time and
  sanitized validation status.
- Secret replacement/clearing requires a fresh `STAFF_MFA` session, a dedicated
  capability, explicit confirmation and safe audit evidence.
- Raw keys, OTP values and full customer mobiles are forbidden in application tables,
  logs, audit metadata, metrics, traces, support exports and GitHub.

### Diagnostics and failure policy

- Configuration validation must not permit arbitrary-recipient SMS sending.
- A controlled test send, if enabled, targets only an approved operator destination
  reference stored outside GitHub and requires explicit audit evidence.
- Diagnostics expose provider health category, circuit state, last successful send
  time and sanitized error class—not response bodies or secrets.
- Provider outage fails closed for OTP delivery and returns the existing stable
  upstream-unavailable behavior. It never bypasses authentication or abuse controls.
- The adapter supports a later secondary provider or replacement without changing
  Auth domain behavior.

## Delivery split

- #114 implements the provider port, SMS.ir adapter, secret/config boundary, safe
  failure mapping, telemetry and deterministic fake.
- #115 implements the permission-gated Persian RTL settings and diagnostics UI after
  #114 establishes the accepted API contract.
- Buying the SMS.ir account/line and injecting the production key are private operator
  steps covered by the operations runbook, not repository data.

## Consequences

- SMS.ir can be used now without creating vendor lock-in in Auth.
- Admin operators gain controlled configuration and diagnostics without secret readback.
- A secure secret backend is a deployment prerequisite for production activation.
- Provider cost changes affect commercial operations, not the domain/API contract.
- General-purpose or arbitrary-recipient messaging remains out of scope.

## Verification and rollback

Acceptance requires authorization/fresh-auth denial tests, secret non-disclosure and
redaction tests, timeout/429/4xx/5xx/malformed/unknown-result tests, deterministic fake
coverage, bounded configuration validation, audit evidence and full protected CI.

Rollback disables the provider setting and restores the previous secret reference or
adapter deployment. It does not delete OTP/audit evidence or relax authentication.

## References

- Issue #79 (provider decision), #114 (adapter) and #115 (admin settings).
- `docs/AUTH_CONTRACT.md`, `docs/SECURITY.md`, `docs/OPERATIONS.md` and ADR-0007.
- SMS.ir production API documentation must be linked and date-checked in #114 before
  implementation; credentials and account details must remain private.
