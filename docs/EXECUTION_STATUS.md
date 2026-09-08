# Execution Status and Handoff

Last reviewed: 2026-09-08

This is the short-horizon board. `PROJECT_STATUS.md` owns factual capability,
`V1_MASTER_PLAN.md` owns the integrated delivery sequence, and GitHub issues/PRs own
day-to-day assignments.

## Operating rules

- One integrated outcome at a time per release gate.
- Contract/policy first, then API and fixture-backed UI in parallel, then integration.
- `main` is delivered truth; open PRs and local files are reported separately.
- Shared contracts, schema/migrations, root configuration and navigation require
  explicit ownership before editing.
- Critical work requires failure, authorization, idempotency/concurrency, audit and
  contract evidence as applicable.
- Limit each contributor to one primary implementation plus one review/unblock task.

## Current position

| Gate                  | State                              | Current evidence                                             | Exit blocker                                               |
| --------------------- | ---------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------- |
| `0.1` Foundation/Auth | Closing                            | Core Auth and privileged lifecycle are merged; #49 is closed | #50/#91 reconciliation; #78/#79 decisions                  |
| `0.2` Catalog         | Started                            | Contracts and Catalog API foundation are merged via #103     | Media/pricing, admin CRUD, storefront live integration     |
| `0.3` Inventory       | Foundation available               | Transactional ledger/reservation service                     | HTTP/RBAC, warehouse/location, transfers, worker and admin |
| `0.4+` Commerce       | Not started as an integrated slice | Schema/state helper only                                     | Policies and all application/client workflows              |

## Active merge/review queue

| Priority | Work                              | State         | Required reviewer focus                                                       | Exit action                                                   |
| -------: | --------------------------------- | ------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------- |
|        1 | Issue #91 — Sprint 1 coordination | In progress   | every accepted Auth requirement has merged evidence or explicit deferral      | Close/roll forward with named owner and reason                |
|        2 | Issue #50 — Auth UX/E2E           | In progress   | separate fixture coverage from live integration; list remaining client states | Close only after accepted product evidence or split follow-up |
|        3 | Issues #78/#79                    | Decision work | capacity/review/release authority; SMS provider/outage contract               | Accepted written decision with owner and effective date       |

## Next 10 working-day plan

### Days 1–2 — close Auth acceptance and coordination

- Treat merged PR #109 and closed #49 as the privileged-Auth evidence baseline.
- Verify password change never logs/persists raw credentials.
- Verify fresh-auth denial order, current-family rotation and other-family revocation.
- Verify two concurrent bootstrap attempts yield one administrator.
- Reconcile OpenAPI and `AUTH_CONTRACT.md` against actual endpoint behavior.
- Keep any work beyond closed #49 in separate, sized issues; do not reopen its
  completed scope implicitly under a broad “Auth complete” statement.

Exit: remaining #50/#91 gaps are closed or split into owned follow-ups.

### Days 2–4 — close Sprint 1 acceptance

- Map #50 and #91 acceptance checkboxes to a commit/test/PR; retain #49 as closed evidence.
- Run clean-main quality, database and E2E gates.
- Confirm customer OTP fixture tests and live API tests are described separately.
- Decide #78 and #79, or assign an owner/date and declare which later gate they block.
- Update Auth/API/security/operations docs only where merged behavior changed.

Exit: `0.1` either closes with evidence or has a short explicit carry-over list.

### Days 3–5 — build on the merged catalog backend foundation

- Use merged PR #103 as the baseline for permission boundaries, draft opacity,
  public projection, conflict mapping, category cycles and BigInt money.
- Confirm no cost/internal inventory data appears in public DTOs/OpenAPI.
- Verify migration impact is absent or reviewed; do not alter shared migrations.
- Confirm clean-main checks and turn remaining Catalog scope into bounded issues.

Exit: remaining `0.2` scope is re-estimated from the merged Catalog API baseline.

### Days 5–7 — contract/policy closure for remaining catalog work

- Decide product attribute/variant rules and import columns.
- Specify price history/effective-price rules and rounding examples.
- Specify media metadata, file validation, size/type limits and presigned lifecycle.
- Specify public product detail, availability summary and SEO fields.
- Split API/admin/web work into `S`/`M` issues with dependencies.

Exit: no UI or storage work relies on an invented contract.

### Days 7–10 — first integrated catalog journey

- Platform: complete the smallest missing API slice selected above.
- Product: build category/brand/product admin screens against accepted fixtures.
- Integration: wire one real end-to-end journey—create draft → add SKU/price →
  publish → discover publicly—without static sellable data for that journey.
- Add allow/deny, failure, audit, accessibility and browser evidence.

Exit: one thin vertical journey is demonstrable; broad CRUD breadth is secondary.

## Ready queue after the checkpoint

1. Catalog media/price contract and API.
2. Catalog admin draft-to-publish flow.
3. Public product detail and storefront integration.
4. Inventory HTTP contract with authenticated actor mapping.
5. Warehouse/location CRUD and read-only balances/movements.
6. Reservation expiry batching (#81), then worker design.
7. Transfer policy/state contract.
8. Cart/guest/merge and reservation-allocation decisions before `0.4` coding.

## Explicitly not ready

- Payment implementation before provider/verification/refund decisions.
- Checkout before server pricing, availability and reservation contracts.
- Shipping/notifications before outbox/job retry policy.
- Returns before refund and stock-outcome policy.
- Production launch claims before deploy, monitoring and recovery drills.

## Handoff template

Every branch handoff must include:

```text
Issue / branch / base SHA:
Owned files and shared hotspots:
Contract or decision used:
Implemented and intentionally excluded:
Migration/data impact:
Security/authorization/audit impact:
Commands run and exact result:
Manual scenarios checked:
Known failures or follow-ups:
Reviewer focus:
```

## Release blockers

- Live production staff/customer Auth acceptance and SMS provider decision.
- Server-side permission enforcement for every business command.
- Integrated catalog, inventory, cart, checkout, order and payment journeys.
- Verified/idempotent payment and reconciliation.
- Outbox/workers and reservation expiry.
- Production deploy/rollback, monitoring/alerts, backup/restore and RPO/RTO evidence.
