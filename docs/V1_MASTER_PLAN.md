# V1.0 Master Plan — ایران‌یاراغ

Last updated: 2026-09-07

Owners: Hordekiller (Platform/API/Data) and Maddyrampant (Product/Web/Admin/E2E).
Dates are sequencing estimates for two consistently available contributors, not
commitments. Re-estimate after each release gate using actual capacity.

## 1. V1 outcome

V1 is complete when a customer can authenticate, browse live products, receive a
server-priced cart, submit a validated address/order, pay through a verified gateway
and track fulfillment; authorized staff can manage catalog, stock, orders, payments
and shipments with audit history; operators can deploy, observe, back up, restore and
roll back the system.

Native mobile, loyalty, reviews, complex promotions, marketplace, full accounting
and dedicated search infrastructure are excluded from V1.

## 2. Current baseline

- `0.1` foundation is near closure; privileged Auth lifecycle is merged via #109 and #49 is closed.
- `0.2` has started: catalog contracts and API foundation are merged via #103.
- Inventory has a strong transactional service foundation but no protected HTTP or UI.
- Order/payment/fulfillment persistence states exist; business services do not.
- Web and admin are prototypes/foundations, not integrated commerce applications.
- Deployment, provider integrations, monitoring and disaster recovery remain unproven.

See `PROJECT_STATUS.md` for the detailed evidence ledger. Open PR code is never
counted as delivered until it is on `main`.

## 3. Delivery method

Each release gate follows the same order:

1. Resolve policy and external dependency.
2. Merge public contract and migration, if required.
3. Implement backend behavior with authorization/audit/failure evidence.
4. Implement clients against accepted fixtures.
5. Integrate one end-to-end journey with the real API.
6. Run package, database, browser and operational acceptance.
7. Update status and only then close the release gate.

Issue size: `S` ≤ 1 focused day, `M` = 2–3 days, `L` = 4–5 days. Split larger
items. Maintain at most one primary implementation per contributor.

## 4. Gate map and dependency chain

| Gate                      |       Estimated duration | Integrated outcome                                     | Depends on                            |
| ------------------------- | -----------------------: | ------------------------------------------------------ | ------------------------------------- |
| `0.1` Foundation/Auth     |        1 checkpoint week | Reviewed production-shaped Auth foundation             | Team/SMS decisions                    |
| `0.2` Catalog             |              2–3 sprints | Publish-to-discovery using live data                   | `0.1`, variants/media/pricing policy  |
| `0.3` Inventory           |                2 sprints | Traceable stock operations and transfers               | `0.1`, catalog SKU, allocation policy |
| `0.4` Selling             |                2 sprints | Server-priced cart, checkout and orders                | `0.2`, `0.3`, shipping quote policy   |
| `0.5` Payment/Fulfillment |                2 sprints | Verified payment, shipment and notifications           | `0.4`, provider decisions             |
| `0.6` Warehouse+          |                2 sprints | Purchasing, stocktake, returns and reports             | `0.3`–`0.5`, return policy            |
| `0.8` Integrated beta     |              1–2 sprints | Complete client journeys and production data rehearsal | All domain gates                      |
| `0.9` Hardening           |                2 sprints | Deployable, observable and recoverable staging         | Deployment/RPO/RTO decisions          |
| `1.0` Launch              | 1 sprint + stabilization | Signed production release                              | UAT and go/no-go                      |

Critical path:

```text
team/provider decisions
  -> Auth acceptance
  -> catalog publish-to-discovery
  -> inventory allocation/reservation
  -> server-priced checkout/order
  -> verified payment/fulfillment/outbox
  -> returns/reconciliation
  -> data rehearsal/UAT
  -> deploy/observe/restore/rollback
  -> launch
```

## 5. Detailed work plan

### Gate `0.1` — Foundation and Auth closure

#### Policy and coordination

- [ ] Accept #78: weekly capacity, review SLA, decision owner and release authority.
- [ ] Accept #79: production SMS provider, sandbox, delivery status and outage policy.
- [x] Close #49 against merged privileged-Auth evidence; reconcile #50/#91 so every remaining criterion has evidence or a named
      follow-up; close obsolete coordination text.

#### Platform/Auth

- [x] Review and merge PR #109: password change, fresh-auth guard, family revocation,
      recovery regeneration, logout-all and concurrent bootstrap.
- [ ] Verify no raw password/TOTP/recovery/OTP/token enters logs, audit or artifacts.
- [ ] Verify development Auth paths fail closed in staging/production.
- [ ] Validate endpoint/error/cookie behavior against `AUTH_CONTRACT.md` and OpenAPI.

#### Product integration

- [ ] Classify every Auth UI path as live, fixture-only or absent.
- [ ] Wire accepted live endpoints for customer/admin paths selected for `0.1`.
- [ ] Prove anonymous, invalid, throttled, expired, replayed, forbidden, logout and
      revoked-session behavior on desktop/mobile.
- [ ] Confirm access token and MFA challenge remain memory-only.

#### Exit evidence

- clean-main lint, typecheck, tests, build, database integration and E2E;
- allow/deny/replay/rate-limit/bootstrap failure evidence;
- merged OpenAPI/Auth/security/operations documentation;
- no unexplained carry-over hidden under the word “complete”.

### Gate `0.2` — Catalog, pricing, media and public discovery

#### Contract and policy

- [ ] Decide category depth/cycle/archive behavior.
- [ ] Decide product attributes, variants, required SKU fields and import format.
- [ ] Define price history, effective dates, discount/rounding and public money shape.
- [ ] Define media types, byte/dimension limits, validation, ordering, alt text,
      presigned expiry and orphan cleanup.
- [ ] Define public product detail, availability summary and SEO contract.

#### API/data

- [x] Review/merge PR #103 Category/Brand/Product/SKU foundation.
- [ ] Add missing SKU lifecycle and product-detail behavior.
- [ ] Implement price history/effective-price service with snapshot-ready output.
- [ ] Implement media metadata and presigned upload confirmation/cleanup boundary.
- [ ] Add public detail/search/filter/pagination and query-driven indexes.
- [ ] Add validated import dry-run, row errors, idempotency and audit.

#### Admin/web

- [ ] Category and brand list/form/archive screens.
- [ ] Product draft wizard with SKU, price and media steps.
- [ ] Publish/unpublish/archive confirmation and permission states.
- [ ] Replace sellable fixture data with typed API reads.
- [ ] Product listing/detail, URL-restorable search/filter/pagination, empty/error states.
- [ ] Metadata, structured product basics and responsive image policy.

#### Required tests

- hierarchy cycle/depth; slug/SKU uniqueness; archive/reference behavior;
- allow/deny and actor audit; draft/cost/internal-field opacity;
- BigInt boundaries and price effective-date/rounding cases;
- malicious/oversized media and abandoned upload;
- pagination/filter/sort bounds and query-count review;
- draft → SKU/price/media → publish → public discovery E2E.

#### Exit

An authorized operator publishes a valid SKU with effective price/media and a
customer discovers the same live data. No production sellable path uses fixtures.

### Gate `0.3` — Warehouse, ledger, reservations and transfers

#### Policy/contract

- [ ] Define warehouses/locations, inactive behavior and operator permissions.
- [ ] Define reason codes and approval rules for receipts/adjustments.
- [ ] Decide reservation TTL, allocation order, backorder rule and clock ownership.
- [ ] Define transfer request/approve/dispatch/receive/cancel transitions.
- [ ] Define reconciliation fields, filters and export limits.

#### API/data

- [ ] Protected warehouse/location CRUD.
- [ ] Protected balance/movement reads using safe projections.
- [ ] Receipt/adjustment commands mapped to authenticated actor and request ID.
- [ ] Reservation expiry batching (#81), worker, retry and dead-letter behavior.
- [ ] Transfer state machine with source/in-transit/destination ledger effects.
- [ ] Reconciliation/exception query and bounded export boundary.

#### Admin

- [ ] Warehouse/location and permission-aware navigation.
- [ ] Balance and immutable movement views with filters.
- [ ] Receipt/adjustment forms with reason, confirmation and conflict recovery.
- [ ] Reservation visibility and transfer activity timeline.
- [ ] Operator exception/reconciliation view.

#### Required tests and exit

- allow/deny, missing reason, idempotent replay/conflict, stale version and rollback;
- parallel receipt/reserve/transfer/expiry without negative or duplicate effects;
- exact ledger/reference/audit reconciliation;
- E2E operator receipt, adjustment and complete transfer.

Exit: every physical change is immutable, authorized, idempotent where retryable and
reconcilable to actor and business reference.

### Gate `0.4` — Cart, checkout and order operations

#### Policy/contract

- [ ] Decide guest cart/account merge and cart expiry.
- [ ] Define supported address fields and Iranian validation/postal policy.
- [ ] Define shipping quote ownership and unavailable-service behavior.
- [ ] Define price/stock-change customer messaging and checkout idempotency.
- [ ] Define cancellation windows and reservation compensation.

#### API/data

- [ ] Cart persistence and add/change/remove commands.
- [ ] Server repricing; ignore client totals and stale prices.
- [ ] Address CRUD with ownership/privacy rules.
- [ ] Checkout orchestration: reprice, recheck, reserve, snapshot, create exactly once.
- [ ] Order service over accepted state machines and append-only transitions.
- [ ] Cancellation/timeout compensation and transactional outbox foundation.
- [ ] Customer order and admin queue/detail/action APIs.

#### Web/admin

- [ ] Cart drawer/page, quantity validation and price/stock conflict recovery.
- [ ] Address book and accessible checkout stepper.
- [ ] Confirmation, history, detail and status timeline.
- [ ] Admin queue, filters, detail, timeline and permission-aware commands.

#### Required tests and exit

- manipulated totals, duplicate/offline retry, expired session, stale price/stock;
- parallel checkout for scarce stock; illegal state changes; cancel compensation;
- immutable historical product/customer/price snapshots;
- live browse → cart → checkout → order and admin processing E2E.

Exit: one client submission produces at most one correctly priced order and
reservation, with controlled and auditable transitions.

### Gate `0.5` — Payment, fulfillment, shipping and notifications

#### Decisions

- [ ] Select payment provider/sandbox and document signature, verify and refund APIs.
- [ ] Select shipping methods/geography/pricing and tracking ownership.
- [ ] Define notification events/templates/consent and provider outage policy.

#### Platform

- [ ] Provider interface, deterministic fake and one sandbox adapter.
- [ ] Initiation/return/callback/server verification with amount/order matching.
- [ ] Idempotent duplicate callback handling and manual reconciliation command.
- [ ] Full/partial refund boundary with remaining-limit and audit evidence.
- [ ] Shipment/package/tracking lifecycle linked to fulfillment, not order state.
- [ ] Transactional outbox + BullMQ workers, bounded retry, dead letter and replay tool.

#### Product

- [ ] Redirect/result/retry customer experience.
- [ ] Accounting evidence/reconciliation/refund admin UI.
- [ ] Pick/pack/ship and tracking admin workflow.
- [ ] Customer tracking and notification status/preferences.

#### Security/failure tests and exit

- forged signature, wrong amount/order, duplicate and reordered callbacks;
- provider timeout/unknown result/reconciliation and duplicate refund;
- shipment transition and notification retry/dead-letter behavior;
- sandbox purchase → payment → pick/pack/ship → tracking E2E.

Exit: duplicates and forged callbacks create no financial effect; payment, inventory
and fulfillment reconcile independently.

### Gate `0.6` — Purchasing, stocktake, returns and reporting

- [ ] Supplier lifecycle/permissions and purchase order approval.
- [ ] Partial receipt connected to the inventory ledger.
- [ ] Stocktake snapshot, count, review, approve and adjustment.
- [ ] Return inspection with restock/damaged/reject outcomes.
- [ ] Refund linkage without collapsing payment and return states.
- [ ] Low-stock, order-aging, payment and inventory exception reports.
- [ ] Queued, bounded, permission-checked exports with expiry and PII controls.
- [ ] Admin workflows and barcode/keyboard operator boundary.

Exit: purchase, count and return effects reconcile to immutable stock and financial
references; historical records cannot be destructively deleted.

### Gate `0.8` — Integrated beta and launch data

- [ ] Remove/disable prototype-only behavior from production routes.
- [ ] Complete customer profile/address/order/return journeys.
- [ ] Complete admin user/role/permission/audit/settings/system-health journeys.
- [ ] Cover loading, empty, error, conflict, retry and success states.
- [ ] WCAG 2.2 AA manual + automated audit; RTL/Jalali/currency/browser matrix.
- [ ] SEO/crawl/sitemap/content/image/performance pass.
- [ ] Catalog/customer/stock import dry-run, validation and reconciliation.
- [ ] Operator/customer help, UAT scripts and support escalation.

Exit: representative staging users complete all critical journeys with approved
production-like data and no fixture dependency.

### Gate `0.9` — Production hardening and recovery

- [ ] Production images, immutable artifacts and staging/prod isolation.
- [ ] Automated deploy and rollback with migration forward-fix procedure.
- [ ] Bounded trusted-proxy, CORS, rate/request/file/secrets/PII controls.
- [ ] Query/index/load tests and web performance budgets.
- [ ] Structured metrics, error tracking, queue/database dashboards and alerts.
- [ ] Backup schedule/retention/encryption and recorded restore drill against RPO/RTO.
- [ ] Payment/inventory incident and reconciliation runbooks.
- [ ] Dependency/license/vulnerability review and provider-failure tests.

Exit: both contributors can independently deploy, diagnose, reconcile, restore and
roll back staging; alerts are deliberately triggered and observed.

### Gate `1.0` — Launch and stabilization

- [ ] Business UAT with severity triage and signed acceptance.
- [ ] Final import rehearsal and signed stock/catalog counts.
- [ ] Domains, TLS, secrets, providers, monitoring and contacts configured.
- [ ] Release notes, freeze scope, go/no-go and rollback triggers recorded.
- [ ] Production deploy, migrations and read-only/controlled smoke.
- [ ] First supervised order/payment/fulfillment with full reconciliation.
- [ ] Daily payment/inventory/order reconciliation during stabilization.
- [ ] Backup freshness and post-launch restore evidence.
- [ ] Close severity-1/2 defects; triage growth work separately; tag `1.0`.

## 6. Global Definition of Done

Every applicable work item needs:

| Concern           | Required evidence                                          |
| ----------------- | ---------------------------------------------------------- |
| Behavior          | Acceptance scenario linked to issue/PR                     |
| Contract          | DTO/shared type/OpenAPI and stable errors                  |
| Authorization     | explicit allow and deny tests                              |
| Validation        | invalid, empty, boundary and hostile input                 |
| Data              | forward migration/data impact and recovery plan            |
| Transaction       | boundary, rollback and partial-failure proof               |
| Retry/concurrency | idempotency and race tests for critical mutations          |
| Audit/privacy     | safe actor/action/reference; no secret/PII leakage         |
| Observability     | useful redacted context and operational signal             |
| UX                | loading/empty/error/conflict/success, responsive and RTL   |
| Accessibility     | keyboard, focus, labels, semantics and contrast            |
| Verification      | narrow checks, affected-package checks and integrated test |
| Documentation     | status, domain contract and runbook updated                |

## 7. Decision register

Resolved:

- modular monolith; ledger-based inventory; integer Rial; self-hosted admin assets;
- one `User` principal/Customer profile boundary;
- separate order/payment/fulfillment states;
- Auth browser transport/security contract;
- current admin table/form strategies.

Open before dependent work:

- SMS, payment and shipping providers/policies;
- reservation/allocation/backorder;
- guest checkout and identity merge/privacy;
- product variants/import and pricing/tax/invoice detail;
- staff approvals/four-eyes; returns/damaged stock;
- deployment/RPO/RTO/retention/budget; team capacity/release authority.

## 8. Progress and governance

At every weekly checkpoint record main SHA, merged outcomes, open-PR outcomes,
carried work/reason, verification, blockers/owners, actual capacity and confidence.
At every gate close, the non-author independently verifies the integrated exit
scenario. Scope may be reduced only from deferred V1 features; correctness,
authorization, audit, payment/inventory reconciliation and recovery gates are not
negotiable schedule buffers.
