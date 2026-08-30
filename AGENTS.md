# Repository Instructions for Coding Agents

These rules apply to all automated coding agents working in this repository.

## Read first

Before business-critical changes, read:

- `docs/FOUNDATION.md`
- `docs/PROJECT_STATUS.md`
- `docs/DEVELOPMENT_PLAN.md`
- the relevant domain/security/API document

Treat documented invariants as requirements. If code and docs disagree, report and
resolve the discrepancy; do not silently choose one.

## Work boundaries

- Work from one scoped issue/goal and preserve unrelated user changes.
- Do not introduce microservices, a new framework, or broad dependency changes
  without an accepted ADR.
- Keep business logic out of controllers and UI components.
- Never expose Prisma models as public API contracts.
- Never bypass inventory ledger, order/payment state machines, permission checks,
  audit requirements or idempotency rules for convenience.
- Do not generate or commit secrets, real personal data or production dumps.

## Coordination for two contributors

- Before editing shared hotspots (`schema.prisma`, root configs, shared contracts,
  navigation), check the active issue/branch ownership and communicate the change.
- Prefer a contract PR before parallel API/UI implementation.
- Do not edit already-shared migrations; add a forward migration.
- Keep changes small enough for the other contributor to review reliably.

## Verification

Run the narrowest relevant checks during development and the full affected package
checks before completion. Critical inventory/order/payment/auth changes require
failure-path, authorization, idempotency and concurrency coverage as applicable.

Update docs and `docs/PROJECT_STATUS.md` when actual capabilities or known gaps
change. State clearly what was verified and what could not be verified.
