# Zero-to-Production Execution Backlog

Status: proposed baseline pending both developers' onboarding review

Developer A: [@Hordekiller](https://github.com/Hordekiller)

Developer B: [@Maddyrampant](https://github.com/Maddyrampant)

## 1. How to use this document

This is a work-breakdown map, not a substitute for GitHub issues. Create small
issues from the rows for the current milestone, assign one accountable owner and
link dependencies. A range reaches 100% only when its exit evidence is accepted;
“code written” alone is not completion.

The percentages describe delivery gates, not effort or a claim that software can
be permanently finished. They define the path to a production-operable `1.0` for
the agreed scope in `PRODUCT_SPEC.md`.

## 2. Completion map

| Gate | Delivery range | Integrated outcome | Accountable lead | Independent verifier |
| --- | ---: | --- | --- | --- |
| G0 | 0–5% | Team/product decisions and reproducible repository | A | B |
| G1 | 5–12% | Runtime foundation, contracts, tests and environments | A | B |
| G2 | 12–20% | Authentication, sessions, RBAC and audit baseline | A | B |
| G3 | 20–30% | Admin catalog and public catalog integrated | B | A |
| G4 | 30–43% | Correct warehouse ledger, availability and transfers | A | B |
| G5 | 43–55% | Server-priced cart, checkout and order lifecycle | A | B |
| G6 | 55–65% | Verified payment, shipping and notifications | A | B |
| G7 | 65–74% | Purchasing, stocktake, returns and reporting | A | B |
| G8 | 74–84% | Complete admin/customer UX and data migration | B | A |
| G9 | 84–94% | Security, performance, observability and recovery | A | B |
| G10 | 94–100% | UAT, production launch and stabilization sign-off | Joint | Rotating |

## 3. Detailed work packages

### G0 — Alignment and repository (0–5%)

| ID | Deliverable | Owner | Depends on | Acceptance evidence |
| --- | --- | --- | --- | --- |
| G0-01 | Both members accept invitation/onboarding and weekly capacity | Joint | — | `TEAM.md` agreement and onboarding issue response |
| G0-02 | Confirm MVP/non-MVP and critical user journeys | B | G0-01 | Product-spec review comments resolved |
| G0-03 | Decide money unit/rounding/tax/invoice policy | A | Business input | Accepted ADR and examples |
| G0-04 | Select SMS/payment/shipping/deployment providers | Joint | Business input | Decision issue with sandbox/access/contingency |
| G0-05 | Configure labels, milestones, issue/PR templates and main protection | A | Repo access | GitHub settings and sample issue/PR validated |
| G0-06 | Verify clean-clone setup on second machine | B | Lockfile/docs | Timed setup notes; corrections merged |
| G0-07 | Threat/PII/data classification workshop | Joint | Product journeys | Threat model and data inventory issues |
| G0-08 | Define launch traffic, catalog size, RPO/RTO and support hours | B | Business input | Measurable non-functional targets |

Exit: both members can build the repo, understand scope and have no unresolved
decision blocking Sprint 0/1.

### G1 — Engineering foundation (5–12%)

| ID | Deliverable | Owner | Verifier |
| --- | --- | --- | --- |
| G1-01 | Typed environment validation and dev/test/stage/prod matrices | A | B |
| G1-02 | Initial reviewed Prisma migration and deterministic seed | A | B |
| G1-03 | Request ID, structured logs, stable errors/envelopes | A | B |
| G1-04 | Swagger/OpenAPI generation and compatibility check | A | B |
| G1-05 | Unit/integration test harness with isolated PostgreSQL | A | B |
| G1-06 | Playwright E2E harness and web/admin smoke tests | B | A |
| G1-07 | Web feature/route decomposition with prototype visual parity | B | A |
| G1-08 | Custom RTL admin shell/tokens on self-hosted Vuexy technical baseline | B | A |
| G1-09 | API client, auth/error/loading conventions and OpenAPI-validated fixtures | B | A |
| G1-09A | Runtime external-asset scan, CSP and local font/icon verification | A | B |
| G1-10 | Production Dockerfiles, local compose profiles and CI artifacts | A | B |
| G1-11 | Live/readiness endpoints and dependency failure behavior | A | B |
| G1-12 | Dependency/license/security scan baseline | A | B |

Exit: CI passes from clean/frozen install; migrations and tests run predictably; web,
admin and API have stable boundaries.

### G2 — Identity, permissions and audit (12–20%)

| ID | Platform/API owner A | Product/E2E owner B |
| --- | --- | --- |
| G2-01 | User/session/OTP schema and lifecycle | Login/session user journeys and fixtures |
| G2-02 | Mobile normalization, hashed OTP, abuse limits | OTP input, resend timer, errors and accessibility |
| G2-03 | Staff password, refresh rotation/revocation | Admin login/logout/expiry/session screens |
| G2-04 | Permission registry, roles and backend guards | Permission-aware navigation and forbidden UX |
| G2-05 | Privileged TOTP/2FA and recovery policy | Enrollment/challenge/recovery UX |
| G2-06 | Auth/privilege audit events and security logs | E2E allow/deny/revoke/abuse scenarios |
| G2-07 | Initial admin seed/bootstrap process | Operator onboarding documentation |

Exit: protected APIs cannot be reached by UI manipulation; token/OTP/session abuse
and revocation tests pass; audit contains safe actor/action evidence.

### G3 — Catalog, pricing and public discovery (20–30%)

| ID | Deliverable | Owner | Key dependency/acceptance |
| --- | --- | --- | --- |
| G3-01 | Category/brand/product/SKU domain services | A | G0-03; lifecycle/unique conflicts tested |
| G3-02 | Price service/history/effective rules | A | ADR examples and snapshot tests |
| G3-03 | Media model/presigned upload/validation | A | Object storage and malicious-file cases |
| G3-04 | Admin category/brand management | B | Permission/forms/table E2E |
| G3-05 | Admin product/SKU/price/media workflow | B | Draft-to-publish demo and audit |
| G3-06 | Public listing/detail/category/search APIs | A | Publication/data-leak/query tests |
| G3-07 | Storefront API integration and route decomposition | B | No static sellable data in prod path |
| G3-08 | Search/filter/pagination/empty/error UI | B | URL-restorable responsive behavior |
| G3-09 | SEO metadata/sitemap/structured product data | B | Validation and crawl policy |
| G3-10 | Validated catalog import with dry-run report | A | B verifies sample/error report |

Exit: an authorized operator publishes/imports a SKU and a customer discovers the
real content/price through API-backed responsive pages.

### G4 — Warehousing and inventory integrity (30–43%)

| ID | Deliverable | Owner | Required proof |
| --- | --- | --- | --- |
| G4-01 | Warehouse/location CRUD and permissions | A | API integration allow/deny tests |
| G4-02 | Balance/movement actor/reference/schema constraints | A | Migration review and reconciliation query |
| G4-03 | Idempotent receipt and adjustment commands | A | duplicate/conflicting-key tests |
| G4-04 | Serializable bounded retry/concurrency policy | A | parallel mutation tests |
| G4-05 | Reservation create/consume/release/expire | A | exact-once expiry/consume tests |
| G4-06 | Reservation expiry worker/outbox behavior | A | clock/retry/dead-letter tests |
| G4-07 | Transfer request/approve/dispatch/receive/cancel | A | transition and dual-ledger reconciliation |
| G4-08 | Warehouse/location/balance admin views | B | filters/loading/error/accessibility E2E |
| G4-09 | Receipt/adjustment operator workflows | B | reason/confirm/conflict UX |
| G4-10 | Transfer workflow and activity timeline | B | illegal/partial-failure E2E |
| G4-11 | Inventory reconciliation/exception report | A | B independently reconciles fixtures |

Exit: all physical changes are immutable and explainable; oversell races, retries
and transfer/reservation lifecycles reconcile exactly.

### G5 — Cart, checkout and order (43–55%)

| ID | Platform/API owner A | Product/E2E owner B |
| --- | --- | --- |
| G5-01 | Cart/guest/merge policy and persistence | Cart drawer/page/merge UX |
| G5-02 | Server repricing and quantity validation | price/stock-change recovery messaging |
| G5-03 | Address model and Iran validation | address book and accessible forms |
| G5-04 | Shipping quote contract | method selection and unavailable states |
| G5-05 | Idempotent checkout + reservation | double-submit/offline/retry E2E |
| G5-06 | Historical order snapshots/totals | confirmation/detail display |
| G5-07 | Separate order/payment/fulfillment machines | customer status/timeline language |
| (G5-07 foundation landed) | ADR-0006 + transition tables + guarded `state-machine.ts` helper | n/a — services that drive the machines are the remaining work |
| G5-08 | Cancel/timeout compensation and audit | cancel confirmation/result UX |
| G5-09 | Admin order queue/detail/commands | admin operational workflow/E2E |
| G5-10 | Transactional outbox for side effects | UI handles eventual notification state |

Exit: untrusted client values cannot alter totals; one checkout produces one order
and reservation; valid/invalid state transitions and compensation are proven.

### G6 — Payment, shipping and notifications (55–65%)

| ID | Deliverable | Owner | Required proof |
| --- | --- | --- | --- |
| G6-01 | Payment adapter and sandbox configuration | A | provider contract/fake tests |
| G6-02 | Initiation/return/verified callback flow | A | forged/duplicate/wrong-amount cases |
| G6-03 | Full/partial refund and reconciliation command | A | exact-once evidence and audit |
| G6-04 | Payment result/retry customer UX | B | refresh/back/offline E2E |
| G6-05 | Accounting payment/reconciliation admin UI | B | permissions/evidence/error recovery |
| G6-06 | Shipment/package/carrier/tracking lifecycle | A | transition/idempotency tests |
| G6-07 | Admin shipment and customer tracking UI | B | manual/provider scenario E2E |
| G6-08 | BullMQ/outbox notifications and templates | A | safe retry/dead-letter/observability |
| G6-09 | Transactional SMS customer states | B | content/RTL/provider failure review |

Exit: sandbox end-to-end payment and refund reconcile under duplicates/failures;
shipment and required notifications remain retryable and observable.

### G7 — Strong warehouse and after-sales (65–74%)

| ID | Platform/API owner A | Product/E2E owner B |
| --- | --- | --- |
| G7-01 | Supplier lifecycle and permissions | supplier list/form/history |
| G7-02 | PO approve/partial receive/cancel | purchase and receipt workflow |
| G7-03 | Stocktake scope/count/review/approve | count/review operator UX |
| G7-04 | Return/inspection/restock/damage state | return/support workflow |
| G7-05 | Refund link without state coupling | customer/admin outcome visibility |
| G7-06 | Low-stock/order-aging/ledger reports | dashboards/filter/export UX |
| G7-07 | Queued bounded export and PII controls | download/error/expiry E2E |
| G7-08 | Barcode input boundary | keyboard/scanner operator test |

Exit: partial purchases, counts and returns connect to correct immutable ledger and
financial references; operator reports expose discrepancies.

### G8 — Experience completion and launch data (74–84%)

| ID | Deliverable | Owner | Verifier |
| --- | --- | --- | --- |
| G8-01 | Customer profile/address/order/return completeness | B | A contract/security review |
| G8-02 | Admin role/permission/user/audit/config UX | B | A authorization review |
| G8-03 | All critical loading/empty/error/success states | B | A smoke/UAT review |
| G8-04 | WCAG 2.2 AA audit and fixes | B | automated + manual evidence |
| G8-05 | Responsive/cross-browser/RTL/Jalali/currency pass | B | device/browser matrix |
| G8-06 | SEO/content/image/performance optimization | B | budgets and validators |
| G8-07 | Catalog/customer/stock import tools and validation | A | B dry-run/UAT |
| G8-08 | Operator/customer help and support scripts | B | A operational review |
| G8-09 | Production feature flags/config inventory | A | B verifies behavior |

Exit: no critical journey relies on prototype behavior; approved production data can
be imported with dry-run, reconciliation and rollback/forward-fix procedure.

### G9 — Production hardening (84–94%)

| ID | Deliverable | Owner | Independent verification |
| --- | --- | --- | --- |
| G9-01 | Threat-model actions and security remediation | A | B retests journeys |
| G9-02 | CORS/rate/request/file/secret/PII controls | A | negative security tests |
| G9-03 | Query/index/load/performance tests | A | B checks UX budgets |
| G9-04 | Production images/deploy/staging/prod isolation | A | B clean deploy |
| G9-05 | Metrics/logs/errors/queue dashboards and alerts | A | B triggers test alerts |
| G9-06 | Backups/retention/restore and RPO/RTO drill | A | B performs restore |
| G9-07 | Migration rehearsal and rollback/forward-fix | A | B records results |
| G9-08 | Incident, payment, inventory and support runbooks | Joint | role-swap tabletop |
| G9-09 | Dependency/license/vulnerability review | A | findings resolved/accepted |
| G9-10 | Full regression, concurrency and provider-failure suite | Joint | CI/staging evidence |

Exit: both developers independently deploy, diagnose, reconcile, restore and roll
back; actionable alerts and high-risk security/data findings are resolved.

### G10 — Launch and stabilization (94–100%)

| ID | Deliverable | Driver | Verifier |
| --- | --- | --- | --- |
| G10-01 | Business UAT and severity triage | B | A |
| G10-02 | Final migration/import rehearsal and signed counts | A | B |
| G10-03 | Domain/TLS/secrets/provider production configuration | A | B |
| G10-04 | Release notes, change freeze and go/no-go review | Joint | Joint |
| G10-05 | Production deploy, migrations and smoke | A | B |
| G10-06 | First supervised real order/payment/fulfillment | B | A reconciliation |
| G10-07 | Daily payment/inventory/order reconciliation | Rotating | Other member |
| G10-08 | Stabilization incident/defect review | Joint | Metrics/business |
| G10-09 | Backup verification and post-launch restore evidence | A | B |
| G10-10 | `1.0` tag/release and post-MVP backlog reset | Joint | Both sign off |

Exit: agreed production scope operates without severity-1/2 defects, unexplained
inventory/payment variance or undocumented recovery dependency.

## 4. Dependency order

The main critical path is:

```text
Policies/providers
  -> environment/migration/test/contract foundation
  -> identity/RBAC
  -> catalog/pricing + warehouse stock
  -> cart/reservation
  -> order state machines
  -> payment/shipping/outbox
  -> returns/purchasing/stocktake
  -> data import/UAT
  -> hardening/recovery
  -> launch/reconciliation
```

UI work can start from accepted contracts/fixtures, but a feature gate cannot close
until it is integrated with real API behavior. Payment cannot close before order
idempotency; fulfillment cannot close before reservation consumption; returns cannot
close before payment refund and inventory outcome are independently modeled.

## 5. Parallel work rule

At sprint planning, select at most one integrated sprint goal and split it into:

- Contract/policy slice (joint, small, merged first)
- Platform slice owned by A
- Product/E2E slice owned by B against accepted fixtures
- Integration/acceptance slice owned by the feature's customer-facing lead

Each developer should have no more than one primary in-progress issue plus one small
review/unblock task. Start work is limited by review/integration capacity, not by the
size of the backlog.

## 6. Estimation and replanning

Use issue sizing `S` (≤1 focused day), `M` (2–3 days), `L` (4–5 days). Split anything
larger than `L` before commitment. Provider research, policy decisions and unknown
legacy data receive time-boxed spikes with a decision output, not indefinite coding.

Every sprint close updates:

- accepted vs deferred work and cause;
- new data/security/contract risks;
- critical-path change;
- actual weekly capacity;
- next gate confidence and product-status document.

If delivery slips, reduce post-MVP scope or change date/capacity. Never remove tests,
authorization, audit, idempotency, reconciliation, backup or recovery gates to make
the percentage appear higher.

## 7. After `1.0`

Run a stabilization period before growth work. Then prioritize from measured user/
operator value: promotions/wholesale pricing, richer content/SEO, wishlist/reviews,
accounting/logistics integrations, analytics and mobile. Each becomes a new product
spec/release gate; `1.0` does not imply unattended maintenance is complete.
