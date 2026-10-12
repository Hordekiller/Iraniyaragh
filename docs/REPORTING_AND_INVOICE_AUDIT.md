# Reporting and invoice management — source audit and implementation plan

Audit date: 2026-10-12. Audited origin/main: **5bb3a52fc1864d23b2f4ddac42ee58c6fbbb6c60**.
Status: **design proposal and verified source inventory; no invoice/report runtime implemented by this document**.

## 1. Audit boundary and conclusion

Origin was fetched before inspection. Main remains the stocktake/Enamad release #411.
Open PRs at inspection: #404/#398/#396 dependency updates and #386 status/navigation documentation.
None is an invoice implementation; do not mix this work into them. Separate worktree,
no VPS operation, database write, provider change or production export during this audit.

Inspected Orders/Checkout/Payments/Refunds, staff sales, Customers, Inventory,
Purchasing, Shipping, Reports/Dashboard, Prisma, shared contracts, OpenAPI,
RBAC/auth, audit, idempotency, Web/Admin routes, fonts and existing tests.
Searched runtime sources/schema/contracts/dependencies for invoice, receivable,
credit account/note, PDF and operational reporting. No invoice/receivables module
or PDF generation endpoint was found in the audited main. Remote branch names and
commit-message history were checked; this is not a claim that every historical
blob has been exhaustively searched.

The existing commerce foundation should be reused. The independent invoice
module and operational reports require new bounded functionality. Customer Web
is **React/Vite**, Admin is **Next.js/MUI**, backend is **NestJS/Prisma**;
do not introduce a second Web framework or rewrite commerce to match a role label.

Evidence below establishes source capabilities, not new runtime or live-provider acceptance.
Issue #358 and credit #336/#338 remain OPEN. Returns #348 is OPEN.
#13 is CLOSED: its accepted money ADR explicitly excludes tax/invoice policy.
ADR-0014 is still Proposed; its historical VAT examples are not approved current rates.

## 2. Source index (permalinks pinned to audited SHA)

- [S1: Reports module](https://github.com/Hordekiller/Iraniyaragh/blob/5bb3a52fc1864d23b2f4ddac42ee58c6fbbb6c60/apps/api/src/modules/reports/reports.module.ts#L5): only DashboardController/Service registered.
- [S2: Dashboard queries](https://github.com/Hordekiller/Iraniyaragh/blob/5bb3a52fc1864d23b2f4ddac42ee58c6fbbb6c60/apps/api/src/modules/reports/dashboard.service.ts#L33): nine real queries, RepeatableRead, grossOrderValue, 90-day bounds, Tehran presentation.
- [S3: Dashboard guard](https://github.com/Hordekiller/Iraniyaragh/blob/5bb3a52fc1864d23b2f4ddac42ee58c6fbbb6c60/apps/api/src/modules/reports/dashboard.controller.ts#L30): STAFF_MFA, reports.read, no-store.
- [S4: Admin navigation](https://github.com/Hordekiller/Iraniyaragh/blob/5bb3a52fc1864d23b2f4ddac42ee58c6fbbb6c60/apps/admin/src/config/navigation.ts#L75): /reports planned, no reports/invoices page in route inventory.
- [S5: Order snapshots](https://github.com/Hordekiller/Iraniyaragh/blob/5bb3a52fc1864d23b2f4ddac42ee58c6fbbb6c60/apps/api/prisma/schema.prisma#L1187): Order/OrderItem BigInt totals, customer/order versions and address/price/shipping snapshots; no tax column or invoice model.
- [S6: Checkout pricing](https://github.com/Hordekiller/Iraniyaragh/blob/5bb3a52fc1864d23b2f4ddac42ee58c6fbbb6c60/apps/api/src/modules/orders/checkout.service.ts#L142): validated shipping quote, server-priced lines, discount=0, pending-payment transition/reservations.
- [S7: Staff sale](https://github.com/Hordekiller/Iraniyaragh/blob/5bb3a52fc1864d23b2f4ddac42ee58c6fbbb6c60/apps/api/src/modules/orders/staff-order.service.ts#L61): durable actor-scoped idempotency, integer pricing, discount=0, pickup shipping=0, reservations; order DRAFT immediately becomes PENDING_PAYMENT.
- [S8: Staff inputs/options](https://github.com/Hordekiller/Iraniyaragh/blob/5bb3a52fc1864d23b2f4ddac42ee58c6fbbb6c60/apps/api/src/modules/orders/staff-order.controller.ts#L54): STAFF_MFA/orders.manage; masked customer/SKU options, no client amounts. DTO accepts customer/lines/address/note, not negotiated tax/discount.
- [S9: Customer ownership](https://github.com/Hordekiller/Iraniyaragh/blob/5bb3a52fc1864d23b2f4ddac42ee58c6fbbb6c60/apps/api/src/modules/orders/order-read.service.ts#L181): own order lookup joins customer.userId. [Customer self](https://github.com/Hordekiller/Iraniyaragh/blob/5bb3a52fc1864d23b2f4ddac42ee58c6fbbb6c60/apps/api/src/modules/customers/customer-self.controller.ts#L11) uses CUSTOMER_OTP/live session and no-store.
- [S10: Verified settlement](https://github.com/Hordekiller/Iraniyaragh/blob/5bb3a52fc1864d23b2f4ddac42ee58c6fbbb6c60/apps/api/src/modules/payments/payment-verification.service.ts#L235): provider verification, payment/order amount equality, PAID transition; settlement after cancellation has a separate reconciliation path.
- [S11: Recorded refunds](https://github.com/Hordekiller/Iraniyaragh/blob/5bb3a52fc1864d23b2f4ddac42ee58c6fbbb6c60/apps/api/src/modules/payments/admin-payment-refund.service.ts#L97): locks, gateway evidence, remaining cap, immutable evidence/idempotency and transitions. [Refund model](https://github.com/Hordekiller/Iraniyaragh/blob/5bb3a52fc1864d23b2f4ddac42ee58c6fbbb6c60/apps/api/prisma/schema.prisma#L1430) records an externally performed refund; it is not an automatic gateway refund or return workflow.
- [S12: Inventory quantities](https://github.com/Hordekiller/Iraniyaragh/blob/5bb3a52fc1864d23b2f4ddac42ee58c6fbbb6c60/apps/api/prisma/schema.prisma#L739): balances/movements have quantity but no cost layers. [Purchasing receipt](https://github.com/Hordekiller/Iraniyaragh/blob/5bb3a52fc1864d23b2f4ddac42ee58c6fbbb6c60/apps/api/src/modules/purchasing/purchasing.service.ts#L212) links real receipt movements to purchase lines/unitCost.
- [S13: Shipping](https://github.com/Hordekiller/Iraniyaragh/blob/5bb3a52fc1864d23b2f4ddac42ee58c6fbbb6c60/apps/api/src/modules/orders/shipping-quote.port.ts#L14): existing quote is customer/cart/version/address bound. [Dispatch](https://github.com/Hordekiller/Iraniyaragh/blob/5bb3a52fc1864d23b2f4ddac42ee58c6fbbb6c60/apps/api/src/modules/orders/shipment-dispatch.service.ts#L51) requires paid order, valid fulfillment/picks and consumed reservations.
- [S14: Auth/permissions](https://github.com/Hordekiller/Iraniyaragh/blob/5bb3a52fc1864d23b2f4ddac42ee58c6fbbb6c60/apps/api/src/modules/auth/auth.guard.ts#L85): authoritative levels/permissions/fresh auth. [Principal](https://github.com/Hordekiller/Iraniyaragh/blob/5bb3a52fc1864d23b2f4ddac42ee58c6fbbb6c60/apps/api/src/modules/auth/auth-principal.service.ts#L69) checks inactivity and current effective grants. [Registry](https://github.com/Hordekiller/Iraniyaragh/blob/5bb3a52fc1864d23b2f4ddac42ee58c6fbbb6c60/apps/api/prisma/rbac-baseline.mjs#L23) includes reports.read, no invoice permissions.
- [S15: Audit](https://github.com/Hordekiller/Iraniyaragh/blob/5bb3a52fc1864d23b2f4ddac42ee58c6fbbb6c60/apps/api/src/modules/audit/audit-log.service.ts#L24): transactional audit writer stores caller-supplied JSON; it does not automatically redact arbitrary invoice snapshots. Use explicit safe projections.
- [S16: Money decision](https://github.com/Hordekiller/Iraniyaragh/blob/5bb3a52fc1864d23b2f4ddac42ee58c6fbbb6c60/docs/adr/0003-money-and-time.md#L55): IRR string transport, BigInt, integer basis points, half-up rounding, stable discount allocation; tax/invoice policy excluded at L96.
- [S17: Financial policy proposal](https://github.com/Hordekiller/Iraniyaragh/blob/5bb3a52fc1864d23b2f4ddac42ee58c6fbbb6c60/docs/adr/0014-runtime-rbac-administration-and-configurable-financial-policy.md#L1): not an implemented/accepted tax or SoD service.
- [S18: Export requirements](https://github.com/Hordekiller/Iraniyaragh/blob/5bb3a52fc1864d23b2f4ddac42ee58c6fbbb6c60/docs/ADMIN_PANEL_PLAN.md#L219): permissioned bounded queued exports, ownership/expiry/audit/PII classification; read-only analytics.
- [S19: Assets/dependencies](https://github.com/Hordekiller/Iraniyaragh/blob/5bb3a52fc1864d23b2f4ddac42ee58c6fbbb6c60/apps/api/package.json#L26): ExcelJS already exists for catalog import, no PDF runtime. Admin has local NotoSansArabic TTF/NOTICE; Web local Vazirmatn WOFF2/OFL. Dashboard uses accessible CSS bar charts/table fallback in StatusBreakdownCard, not an assumed third-party chart package.
- [S20: Existing test harness](https://github.com/Hordekiller/Iraniyaragh/blob/5bb3a52fc1864d23b2f4ddac42ee58c6fbbb6c60/.github/workflows/ci.yml#L86): database migration/drift/constraints/integration and full browser jobs. Existing dashboard, staff-order, payment/refund, customer ownership and inventory integration suites are reusable baselines.

## 3. Existing versus missing matrix

| Capability | Audited state | Reuse / real missing work |
| --- | --- | --- |
| Customer/cart/checkout/order | Implemented [S5,S6,S9] | Reuse ownership, snapshots and commands; not an editable invoice |
| Staff customer/SKU selection and sale | Implemented [S7,S8] | Reuse safe selection/authorized conversion; proforma must not reserve stock merely by being drafted |
| Server prices, IRR, shipping | Implemented [S6,S7,S13,S16] | General proforma quoting and approved discount/tax policy missing |
| Verified payments/reconciliation | Implemented code [S10] | No provider acceptance inferred from source; invoice never settles payment |
| Manual refund evidence | Implemented [S11] | Reuse; does not implement customer returns or credit notes |
| Warehouse/ledger/receipt/stocktake | Implemented [S12,#411] | Reporting read models; no invoice-driven stock editing |
| Financial inventory valuation | Not implemented [S12] | Approved costing policy/opening cost/adjustment/transfer/return attribution required |
| Operational dashboard | Implemented [S1–S3] | Existing grossOrderValue is all created order value, not cash received or recognized revenue |
| /reports + sales/top products/order/payment reports | Missing [S1,S4] | Bounded backend projections and integrated Admin views |
| Invoice draft/edit/create from order | Missing [S5] | New independent module and immutable source binding |
| Issue/number/publish/revoke/history | Missing | New transactional commands, sequence, visibility and evidence |
| Customer invoice ownership | Missing invoice surface [S9] | Reuse userId→Customer; protect list/detail/download individually |
| Corrections/credit/return documents | Missing | Append-only linked documents; financial effects depend on #336/#338/#348 |
| Persian A4/PDF/print/download | Missing runtime [S19] | Self-hosted assets + bounded rendering worker/secure document delivery |
| Secure link delivery | Missing invoice surface | Authenticated owner link; notifications via outbox only, no raw-PDF/public bucket exposure |
| CSV/Excel/PDF report exports | Missing [S18,S19] | Reuse ExcelJS safely; bounded queued jobs, snapshot/owner/expiry/download audit |
| RBAC/audit/idempotency/versioning | Foundation implemented [S7,S14,S15] | Invoice-specific registry, commands, redacted audit, DB immutability constraints missing |
| Customer credit/debtors | Missing implementation; #336/#338 open | Never derive a receivable ledger from unpaid orders |
| Official tax invoice/Moadian | No implementation [S16,S17] | Separate approved scope, legal/accountant policy and external acceptance |

Absence conclusions refer to the searched/registered runtime, route/schema and
contract inventory at the pinned SHA. No tests were run for nonexistent features.

## 4. Corrections to the requested design

1. Keep **financial document lifecycle** and **customer visibility** orthogonal.
   “Published” is a display condition, not a financial transition. Revocation
   cannot undo an invoice, refund money or resurrect stock.
2. Existing Order DRAFT is not a proforma workspace: creation immediately reserves
   inventory and transitions to pending payment. New quotation drafts have no stock/payment effects.
3. Editing a proforma copied from an order cannot silently rewrite that order or
   issue a conflicting final sales document. Validate the source version and exact
   authorized terms at issue. Changed commercial terms require an approved order
   command/pricing extension, or a clearly separate quotation; not direct updates.
4. A commercial PDF does not prove official tax-invoice compliance. Operator scope,
   legal seller data, verified tax treatment/rates and fiscal number requirements
   must be decided; never adopt the historical default in Proposed ADR-0014.
5. Specify gross ordered value, issued document value, verified collections,
   recorded refunds and net collections separately. Recognized accounting revenue,
   profit/COGS and receivables require their own accepted policies/evidence.
6. Financial valuation needs an accepted cost basis. Current SKU costPrice is a
   mutable catalog price, not a complete cost ledger. An estimate must be explicitly
   named an estimate and cannot fulfill authoritative valuation acceptance.

## 5. Proposed module and data model — before runtime code

`InvoicesModule` owns quotation drafts, immutable issued documents, publication
and rendering requests. Orders/Payments/Inventory/Customers remain authoritative.
Use their explicit query/command ports; no cross-module direct financial writes.
Extend `ReportsModule` rather than create another dashboard/reporting backend.
Shared contracts stay in `packages/contracts`, OpenAPI in the existing API generator.

| Proposed model | Purpose and constraints |
| --- | --- |
| InvoiceDraft / DraftLine | Editable bounded customer/real SKU inputs, notes/address, requested discount, version, actor; no final number or stock movement. Optional sourceOrderId/sourceOrderVersion. Order-backed price snapshots preserve original price; catalog quotations carry price revision/expiry. |
| InvoiceFinancialPolicyRevision | Approved immutable tax/discount/treatment/seller-policy revision with effective interval, approval evidence and typed bounds; active-pointer changes versioned and audited. Missing configuration fails closed. Shared calculation port; no secret store or silent change to existing order totals. |
| InvoiceDocument / DocumentLine | Append-only issued snapshot: kind SALE/CORRECTION/CREDIT_NOTE, customer/order references, source versions, seller/buyer/address snapshots, line ordinals/quantity/unit/price/discount/tax, IRR totals, policy revisions, issuedAt/issuedBy, number/series/period, canonical payload hash. FKs Restrict; no issued payload update/delete. |
| InvoiceSeriesCounter | Unique series+period, transactional next counter/format revision; no MAX(number)+1. Fiscal scheme remains a separate decision. |
| InvoiceEvent | Append-only issued/cancelled/correction-linked/publication lifecycle evidence, actor/reason/requestId/time; original document remains retrievable. Financial payload not duplicated into audit JSON. |
| InvoicePublication | Visibility PRIVATE/PUBLISHED/REVOKED with version and event evidence, separate from issued content. Changes never affect payment/order/stock. |
| InvoiceCommandRecord | Durable actor+scope+key hash/payload hash/result reference; no deletion horizon that permits duplicate financial issue; current authorization rechecked on every replay. |
| InvoiceRenderJob / DocumentArtifact | Issued document/hash+template/font revision, queued/running/ready/failed, private artifact key/hash/size, bounded failure/retention. Do not use public product-media projection. |
| ReportExportJob / ReportSnapshot | Owner/principal, normalized filters/currency/timezone/definitions, snapshot generation time, row/byte bounds, status, private artifact hash/expiry and safe audited downloads. |

Final schema names/SQL and indexes are reviewed in the first contract slice.
Invoice snapshots necessarily contain authorized buyer/address data; keep it only
in protected storage and customer/staff projections, never logs/issues/audit metadata.

### Lifecycle and publication

| Command | Preconditions | Authoritative result |
| --- | --- | --- |
| Create/edit quotation | invoices.manage, active permitted customer/SKUs; version/key | DRAFT; backend quote; no reservation or financial effect |
| Issue | invoices.issue + fresh STAFF_MFA; valid policy/terms/source version | Atomically allocate unique number, write immutable document/lines/events/command result; Issued/private |
| Publish | invoices.publish, issued eligible document, expectedVersion | Publication event + PUBLISHED visibility; financial payload unchanged |
| Revoke | invoices.publish, expectedVersion/reason | REVOKED visibility; later requests denied, existing downloaded bytes cannot be recalled |
| Cancel draft | invoices.manage, draft version/reason | Terminal draft cancellation, no final number |
| Cancel issued | invoices.cancel + fresh MFA; accepted cancellation/reconciliation policy | Append cancellation evidence only; never delete original or infer financial refund |
| Correct | invoices.correct + fresh MFA; target issued document/version | Separate correction draft/document links to original; no financial payload overwrite |
| Credit/return document | approved #336/#338/#348 command/evidence, remaining caps | Separate linked CREDIT_NOTE; no fake refund, no automatic stock effect |

UI “Draft → Issued → Published” is derived from lifecycle+publication. Corrected
status is a projection of linked issued corrections, not replacement/deletion of
the original. Revoke/cancel/correct are different actions with different evidence.
The proposed correction stores full replacement terms plus a backend-calculated
signed delta against the prior effective document. Reports count original plus
correction deltas minus accepted credit notes, never sum full replacements again.
Financial correction/credit issuance stays blocked until its order/receivable/refund
reconciliation rule is accepted. Nonfinancial corrections also preserve provenance.

### Financial invariants

- All amounts BigInt IRR, wire Money.amount decimal string. Rates integer bps;
  percentages follow ADR-0003, checked signed-64-bit output bounds.
- Backend: subtotal=sum(unitPrice×quantity); allocated discount sum is exact;
  taxable base/tax/treatment/shipping are derived from explicit policy revisions;
  total=sum accepted components. No unapproved tax rate, hidden zero-tax assumption
  or client-supplied payable total. Tax-inclusive/exclusive policy must reconcile.
- For order-backed sales documents, issued total/lines reconcile to the authoritative
  order snapshot. A display-only address or description change must never alter shipment history.
- Proposed discount permissions/caps/approval thresholds require business configuration;
  no threshold invented here. Reprice on changed source and require explicit confirmation.
- Drafting/issuing/publishing does not change Order/Payment/Fulfillment states or stock.
- Original documents, assigned numbers, lines and financial links remain immutable.
  Corrections/cancellations use append-only events/documents, not balance overwrites.
- At most one original sales document for an order under the accepted policy;
  correction graph cannot cycle; cumulative credit quantities/amounts cannot exceed
  accepted remaining evidence. Distinct idempotency keys must not bypass uniqueness/caps.
- Atomic number/document/event/idempotency commit; concurrent issue wins once.
  Drafts get opaque IDs; cancelled numbers never reused. No claim of fiscal gapless
  numbering until that policy is explicitly approved.
- Receivable effects, if enabled by #336, are posted once through its authoritative
  ledger command with a unique document reference. Invoice module has no editable
  receivable balance and never creates a PAID Payment.

## 6. Proposed API contracts and frontend integration

All paths below are **proposed**, not existing OpenAPI routes. Mutation DTOs are
strict allowlists, Idempotency-Key required, optimistic expectedVersion required
after create, current authorization before replay; opaque IDs, bounded lists.
Use existing ApiSuccess/ApiErrorEnvelope/Money and actual API client timeout/abort,
refresh, CSRF and ambiguous-submit behavior; do not weaken auth for downloads.

| API family | Operations | Server authorization |
| --- | --- | --- |
| /api/v1/invoices/admin | GET list, POST draft, GET/PATCH :id | STAFF_MFA + invoices.read/manage respectively |
| /api/v1/invoices/admin/options | GET masked customers/real SKU options | invoices.manage; pricing/PII projection approved explicitly, no accidental pricing.read bypass |
| /api/v1/invoices/admin/:id/quote | POST backend quote for current draft | invoices.manage; quote/source/policy/version expiry evidence |
| /api/v1/invoices/admin/:id/issue | POST expectedVersion/quote reference | invoices.issue + fresh MFA |
| /api/v1/invoices/admin/:id/publication | PUT visibility command/version/reason | invoices.publish |
| /api/v1/invoices/admin/:id/cancel | POST reason/version | invoices.cancel + fresh MFA |
| /api/v1/invoices/admin/:id/corrections | POST linked correction draft | invoices.correct; final financial issue gated by dependencies |
| /api/v1/invoices/admin/:id/history | GET bounded safe events | invoices.read; no raw audit metadata |
| /api/v1/invoices/admin/:id/render-jobs | POST render request; GET owned status | invoices.read + invoices.download as applicable; queued bounded work |
| /api/v1/invoices/admin/:id/pdf | GET authorized ready artifact | invoices.download; no-store, private, safe attachment filename |
| /api/v1/customers/me/invoices | GET list/detail :id / :id/pdf | CUSTOMER_OTP/live session; join customer.userId + eligible publication on every access |
| /api/v1/invoices/admin/:id/deliver-link | POST controlled authorized notification | invoices.publish; recipient derived from document customer; outbox, no arbitrary URL/phone |
| /api/v1/reports/admin/* | GET bounded read-only projections | STAFF_MFA + reports.read; explicit pricing.read when disclosing cost |
| /api/v1/reports/admin/exports | POST job, GET owned status/download | reports.export + corresponding read/cost permission, current grants at download |

Customer default sharing is an authenticated `/account/invoices/:id` link;
opening it still requires ownership/live session. No anonymous bearer link or
mobile/PII in URL. If guest sharing is later required, a separately reviewed
revocable expiring capability is needed; do not add one implicitly. Link delivery
uses the existing outbox/effect framework, requires an approved notification
template/channel, and cannot reuse unrelated SMS templates or fake delivery.

Proposed error cases: INVALID_REQUEST, NOT_FOUND (foreign/invisible customer
document), FORBIDDEN, VERSION_CONFLICT, IDEMPOTENCY_CONFLICT, INVOICE_STATE_CONFLICT,
INVOICE_SOURCE_CHANGED, FINANCIAL_POLICY_UNAVAILABLE, INVOICE_TOTAL_MISMATCH,
INVOICE_CORRECTION_BLOCKED, DOCUMENT_RENDER_PENDING/FAILED and export limit errors.
New codes are registered in shared contracts/OpenAPI with correct HTTP status,
sanitized message and requestId. Never return ambiguous commands as success.

Admin: new /invoices list/new/detail, source-order entry point, real safe pickers,
backend quote breakdown, draft forms/version conflict, issue confirmation,
publication/revocation, corrections/history, print/download/job states. Reuse
DataTable/dialogs/permissions/feedback; no UI calculation of authoritative totals.
Web: AccountNavigation + invoice list/detail/download, no staff endpoints,
empty/unpublished/error/session-recovery states. Existing order pages remain intact.
Persian RTL, mobile layouts, keyboard/focus/labels, textual chart fallback, exact IRR.

### PDF and resources

Add a dedicated bounded document worker behind the existing queue architecture;
do not assume media worker can render PDFs. Evaluate self-hosted Chromium HTML
printing against Persian shaping/embedding/A4/accessibility tests before accepting
a runtime dependency. Existing Playwright test dependency is not a production PDF engine.
Reuse reviewed local TTF fonts with their licence/NOTICE; copy to the document
image rather than fetch a CDN. No arbitrary HTML, user CSS, remote image/font URL,
file access or network fetch from the renderer: text-escape approved snapshots,
embed local vetted assets, restrict network/process resources and concurrency.
Persist issued artifacts keyed by immutable content/template/font revision and hash;
retries do not create another financial document. Failed rendering is visibly failed,
never a success message; issuance state and render state remain separate.
Draft print must be clearly watermarked proforma; final PDF numbers/totals match stored
issued evidence. Authenticated private delivery rechecks grants/ownership/publication.

## 7. Reporting definitions and dependency gates (#358)

| Report | Definition/source | Acceptance dependency |
| --- | --- | --- |
| Daily/weekly/monthly sales | Orders/OrderItems snapshot, separate counts and gross/net ordered values per status; explicitly select event time and inclusion rules | Calendar/week boundaries and cancellation rules defined in contract slice |
| Order/payment status | Orders and payment attempts separately; no attempt count masquerading as paid order count | Reuse order filters/selectors, don't join fanout totals |
| Collections/refunds | First authoritative PAID PaymentTransition per payment ID for gross collections; Refund.createdAt for recorded external refunds; net=collections−refunds | Include partial/fully refunded settled payments; canceled-order settlements reported as exceptions; not provider-live proof |
| Issued/cancelled/corrected invoices | Immutable documents/events + correction deltas, visibility reported separately | Invoice module; no double counting originals/full replacements |
| Top products | OrderItem quantities/server line amounts with explicit status set/time basis; returns as separate adjustments when supported | Historical snapshots, stable sorting; no catalog current-price multiplication |
| Inventory quantities | Consistent live balances by WH/location/SKU, reserved/available and freshness | Existing Inventory module; read-only |
| Inventory valuation | Accepted cost layers/attribution including opening, receipts, transfers, consumption, stocktakes and returns; disclose unvalued quantities | Costing-policy/data slice; not fulfilled by current catalog cost |
| Debtors/aging/statement | #336 immutable receivable ledger/allocations/terms | #338 accepted ADR + #336 implementation/reconciliation; unpaid orders are not debtor balances |

Range semantics: from inclusive/toExclusive UTC; presentation/grouping timezone
Asia/Tehran. Select explicit calendar (Persian/Gregorian) and agreed week start;
monthly reports cannot silently mean Gregorian months in a Jalali UI. Retain the
current 90-day request bound initially unless separately reviewed. Empty buckets
are real zero aggregates, not fake KPI data. Include generatedAt, filters, time
basis, currency, definition/cost revision, freshness and limitations on every response.

Use indexed, bounded SQL/Prisma aggregates, stable pagination and consistent
RepeatableRead snapshots; avoid N+1, hydrations of all orders, and payment/refund
join multiplication. Verify plans/indexes with representative isolated data.
Graphs may map exact backend values for display; never convert BigInt to Number
and label rounded chart coordinates as authoritative financial totals.

Exports: async bounded jobs with filter/definition snapshot, owner, row/byte caps,
expiry, private artifacts and current-permission download audit. CSV/Excel escaping
must resist formula injection; Excel financial decimal strings preserve precision
above 2^53, no executable formulas/macros or hidden PII. Exported totals and pages
must reconcile to the same materialized snapshot; a later live query is not the
same snapshot just because it uses the same date filter. Reports do not mutate data.

## 8. Small issue/PR breakdown and order

Dedicated Invoice Management Epic tracks these dependent slices; #358 retains
ownership of reporting, #336/#338 receivables and #348 returns retain their domains.
Each issue has its own acceptance/tests and one coherent implementation PR;
contract/schema/runtime/UI tests ship together where necessary, never an unusable
schema-only deployment. First PR is this audit/design, without runtime changes.

1. **I0 — Accepted policy/ADR/contracts**: document kind, seller/buyer data,
   official-tax scope, tax/discount treatment, numbering/calendar, cancellation,
   correction delta and order reconciliation, RBAC projection and bounded PDF/export
   resources. Mark undecided business/fiscal inputs explicitly; no runtime tax defaults.
2. **I1a — Approved financial policy/calculation** (I0): typed versioned revisions,
   configured tax/discount treatment/caps and seller data, fresh-MFA policy activation,
   integer calculation/overflow/allocation tests. No historical rate defaults and
   no silent checkout/payment change; changed commerce contracts need a separate review.
3. **I1b — Draft and backend quote** (I0, I1a): real selection, version/idempotency,
   original-order snapshots vs catalog quote, neutral stock/payment behavior,
   approved money policy and cart-independent shipping adapter if needed.
4. **I2 — Issue/number/immutable evidence** (I1b): transactional counter,
   document constraints, duplicate-key/different-key concurrent uniqueness,
   source-version check, event/audit consistency, issue/read API.
5. **I3 — Publication and customer ownership** (I2): publish/revoke,
   principal-derived reads, history and authenticated secure links.
6. **I4 — Persian private PDF pipeline** (I2): local assets/font embedding,
   A4/RTL/shaping, bounded worker, safe private artifacts and failure/restart tests.
7. **I5 — Integrated Admin/Web invoice journeys** (I1b–I4): original order entry,
   create/edit/quote/issue/publish/account/PDF/print, conflict/retry/responsive a11y.
8. **I6 — Corrections/cancellation/credit documents** (I2, I0; financial paths
   additionally #336/#338/#348 as applicable): preserve originals, cumulative caps,
   separate document and monetary events; no invented refunds/stock movements.
9. **R0 — #358 operational reports API/Admin** (I0 report definitions, existing commerce):
   sales/orders/payment/refunds/top-products/live quantities can proceed without credit;
   invoice report waits I2/I6. Do not block unrelated bounded reports on debtor gates.
10. **R1 — Costing policy and valuation evidence** (#358, accepted costing/opening policy):
   choose FIFO/WAC/other through review, cover unattributed ledger movements and historical
   data without fabricated costs. Its approved implementation unlocks financial valuation.
11. **R2 — Secure CSV/Excel/PDF report exports** (R0; PDF also I4): job ownership,
    snapshot/expiry/download audit, injection/PII/precision/resource tests.
12. **R3 — Debtors reporting dependency** (#336/#338): attach criteria to #358;
    no duplicate credit module or issue pretending it exists.
13. **G — Integrated acceptance/release** (enabled I/R slices): evidence matrix,
    complete required gates, migration/backup restore and exact-SHA rollout plan;
    deployment requires explicit approval for this task.

## 9. Test and acceptance checklist

The following are required **future tests**, not pass claims from this audit.

- Unit: exact BigInt arithmetic/overflow, discount allocation/remainder ties,
  approved tax inclusive/exclusive treatment, stale quote/version, line bounds,
  state transition and error-code/contract parity; no float or client amount injection.
- PostgreSQL: real isolated migrations/schema drift/SQL constraints; issue numbering
  across concurrent sessions/periods, same/different key duplicates, transaction abort,
  concurrent source changes, correction/credit caps, restart replay and immutable update/delete rejection.
- Reconciliation: issued snapshots equal order terms, drafts/publication/render leave
  order/payment/stock unchanged, canceled-order settlement exceptions retained, multiple
  attempts/partial refunds don't multiply cash, correction totals don't double count.
- Security: anonymous/wrong auth level/current revoked role denied; customer A cannot
  list/read/download B or bypass via body/path/job IDs; unpublished/revoked hidden,
  expired session denied; audit/log/exception PII redaction; CSRF/current-permission replay preserved.
- PDFs: Persian text extraction and glyph shaping, embedded licensed fonts, RTL/mixed
  numerals, exact invoice number/IRR totals, multi-page A4/header/footer, no clipping,
  print/screenshot comparison; XSS/SSRF/file/network rejection; failed/restarted worker
  cannot publish false artifact readiness or duplicate issuance.
- Reports: Tehran/calendar/range boundary fixtures, leap/month/week grouping, null/zero,
  canceled/paid/refunded inclusion, historical price, huge integer precision, consistent
  snapshot/page/export reconciliation, cost coverage/unvalued handling, index/query budget.
- Exports: formula-injection strings, malicious filenames, unauthorized/shared/revoked
  access, expiry/retention, byte/row/job/concurrency limits, no unbounded query/provider secret/PII leak.
- Admin/Web browser desktop/mobile: real isolated staff password/TOTP and customer auth,
  catalogue/customer selection, draft edits/backend quote/reload, issue/repeated submit,
  publish/revoke/ownership, PDF download/print, correction provenance and report filters;
  loading/empty/validation/conflict/network/abort/retry/focus/keyboard behavior. No fake
  provider success; real staging OTP depends on provider/handset acceptance.
- Final code PR: frozen install, Prisma generation, lint/typecheck/test/build,
  database/integration/concurrency, OpenAPI generation + zero drift, complete browser suite,
  diff-check/conflict scan; GitHub quality/database/E2E/SonarCloud/CodeQL/Dependency Review/
  Production Dependency Audit all green at exact reviewed head.
- Release: explicit deployment approval, verified restoreable backup, reviewed forward
  migrations, official merge → Publish Images → four exact-SHA digests → official deploy;
  no latest/VPS builds/source copy/seeds; verify readiness/services/nginx/HTTPS and
  operator invoice/report acceptance without touching real stock/payment to manufacture success.

## 10. Closure and unresolved inputs

Do not close #358 while its operational API/UI/exports and applicable valuation
acceptance are missing. Keep debtor report explicitly dependent on #336; scope
changes require recorded agreement, not a fake zero table. Do not close the invoice
Epic on PDF existence alone. Every child records exact head, tests and accepted scope.

Inputs still unconfirmed: commercial vs official fiscal scope; approved seller
identity/buyer identifiers; verified tax treatment/rates/exemptions; discount caps
and approvals; numbering/period/week/calendar choices; costing/opening attribution;
financial cancellation/correction/credit allocation; approved notification template
for invoice links; PDF resource budget/retention. Technical architecture can be
reviewed now; affected financial commands stay gated until their decisions are accepted.
This is not legal advice or a claim of current tax/Moadian compliance.
