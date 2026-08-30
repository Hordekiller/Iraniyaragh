# Iraniyaragh Product Specification

Status: working specification for team review

Owner: product decisions are joint; backend remains the business source of truth

Last updated: 2026-08-30

## 1. Product statement

Iraniyaragh is a Persian, Iran-ready commerce and warehouse platform for hardware,
tools and fittings retail. It connects a customer storefront with staff operations
so published catalog data, price, sellable inventory, orders, payments and physical
warehouse movements remain consistent and auditable.

“Complete” in this plan means launchable, supportable and recoverable for the agreed
business scope. It does not mean implementing every possible marketplace, ERP or
growth feature.

## 2. Goals and success criteria

### Business goals

- Replace static/manual product selling with a controlled digital ordering flow.
- Prevent overselling and provide location-aware stock traceability.
- Give operators one admin source for catalog, stock, orders and payment evidence.
- Launch cheaply as a modular monolith without blocking future scale/integration.

### Launch success

- A customer can complete a real paid order without staff editing the database.
- Staff can fulfill/cancel/return it only through authorized, audited commands.
- Inventory and payment reconciliation show no unexplained discrepancy.
- Backups, restore, monitoring, deployment and rollback are proven.
- The second team member can operate the system without undocumented knowledge.

### Initial operational indicators

- Checkout/order creation success rate and error reasons
- Payment initiated/verified/failed/reconciliation counts
- Orders by fulfillment state and age
- Inventory reservation expiry and reconciliation exceptions
- API error rate/p95 latency and background-job failure age
- Backup age, restore-test date and deployment failure/rollback count

Numeric SLOs are set after staging load evidence and expected traffic are known.

## 3. Users and permissions

### Customer

Browses/searches products, authenticates by mobile OTP, manages addresses, checks
availability, creates and pays for orders, tracks fulfillment and requests support/
return according to policy.

### Content/catalog operator

Manages category, brand, product content, variants, media and SEO. Cannot alter
physical stock or refund payments unless separately permitted.

### Warehouse operator

Receives, picks, packs, counts and transfers stock. Cannot edit prices or financial
states. Manual adjustments require reason and appropriate permission/approval.

### Sales/support

Reads customer/order context and performs explicitly permitted order actions. PII
visibility is minimized. Support notes never replace audit or state transitions.

### Accounting

Reads payment/refund/reconciliation evidence and performs separately authorized
financial commands. Cannot arbitrarily assign payment status.

### Administrator

Manages users, role/permission composition and non-secret configuration. Sensitive
privilege changes and production operations are audited and protected with 2FA.

### System/worker

Executes idempotent expiry, notification, indexing and retry jobs under a distinct
actor identity with correlation/business references.

## 4. Critical end-to-end journeys

### Publish to purchase

1. Authorized staff creates category/brand/product and one or more SKUs.
2. Price convention, media and required attributes validate before publish.
3. Warehouse receives stock; ledger and balances update transactionally.
4. Customer discovers only active/published products with current sellable status.
5. Cart is repriced by the server; checkout revalidates price and availability.
6. Order creation reserves stock idempotently and snapshots sale-time facts.
7. Gateway payment is initiated and verified server-to-server.
8. Paid order enters fulfillment; reservation is consumed with physical movement.
9. Staff picks/packs/ships; customer sees tracking and receives notifications.
10. Delivery closes fulfillment while immutable financial/inventory history remains.

### Cancellation

- Allowed transition depends on payment and fulfillment state.
- Active reservation is released exactly once.
- Paid cancellation invokes explicit refund workflow; it never simply changes an
  order status.
- Audit timeline records requester, approver where required, reason and references.

### Return

- Return is line/quantity aware and linked to original order item.
- Inspection chooses sellable restock, damaged/quarantine or no physical return.
- Refund and inventory effects are separate, idempotent commands.
- Partial return/refund must preserve totals and evidence.

### Purchase receipt and transfer

- Approved purchase order may be partially received into a location.
- Transfer dispatch decreases source physical stock; receipt increases destination.
- In-transit quantity remains explainable; cancellation rules depend on state.
- Each effect has movement entries, actor, reason and shared reference.

### Stocktake

- Authorized staff opens a count with a defined snapshot/freeze strategy.
- Counters record observations without seeing expected values where policy requires.
- Reviewer approves differences; only approval creates controlled adjustments.
- Completed stocktake and lines cannot be silently rewritten or deleted.

## 5. Functional requirements by domain

### Identity and access

- Normalize Iranian mobile numbers and prevent duplicate identities.
- OTP values are random, short-lived, hashed at rest, attempt/rate limited and never
  logged. SMS provider has a safe local fake.
- Staff password credentials use a modern password hash; privileged users use TOTP.
- Access/refresh sessions rotate, revoke and expose device/session management.
- Permissions are explicit capabilities; all protected API commands enforce them.
- Login, logout, failed abuse events and privilege changes are safely audited.

### Catalog and media

- Hierarchical category, brand, product and SKU/variant lifecycle.
- Unique SKU/barcode/slug policy with stable conflict errors.
- Required attributes and variant rules are configured for initial catalog needs.
- Draft/published/inactive/archived lifecycle; historical references are preserved.
- Images use object storage, validated MIME/size, ordered media and generated sizes.
- Public listing/detail includes SEO metadata and excludes internal/cost data.
- Import validates an entire file and reports row-level failures before commit.

### Pricing

- Canonical IRR storage/calculation convention is decided in an ADR.
- Server calculates all totals; client totals are informational only.
- Base/sale price effective dates and price changes are auditable.
- Order items snapshot SKU/title/unit price/discount/tax if applicable.
- Promotion, coupon and wholesale price-list complexity is post-MVP unless required
  business policy is supplied before catalog implementation.

### Inventory

- Atomic key is SKU + warehouse + location.
- `available = onHand - reserved`; negative availability/on-hand is rejected by
  default.
- Every physical mutation produces one immutable movement in the same transaction.
- Mutations are idempotent and conflicting reuse of a key/payload is rejected.
- Receipts, sale, return, transfer, adjustment, damage and stocktake are distinct.
- Reservation create/consume/release/expire is concurrency safe and retry safe.
- Balance/ledger queries support operational filters and reconciliation reports.
- Manual changes require actor, reason, permission and, where configured, approval.

### Cart and checkout

- Decide guest vs authenticated cart and merge semantics before implementation.
- Cart holds SKU and requested quantity, never trusted unit totals.
- Server response explains unavailable/changed-price/quantity-limit lines.
- Address supports required Iran postal/contact fields and server validation.
- Checkout uses an idempotency key and creates at most one logical order.
- Reservation duration/allocation policy is explicit and visible to the customer.
- Shipping quotes/options originate from backend/provider adapters.

### Orders and fulfillment

- Order, payment and fulfillment states are separate explicit transition tables.
- Commands enforce actor, source state, destination state and side effects.
- Order number is user-friendly and unique; internal ID remains separate.
- Historical snapshots protect invoices/order views from product/customer edits.
- Admin queue supports safe filters, timeline and only valid contextual actions.
- Pick, pack, shipment and delivery references are traceable per order/line.
- Cancellation, timeout and failure compensation are tested.

### Payments

- Provider interface isolates gateway-specific initiation/verification/refund.
- Browser callback is not proof of payment; server verifies signature/reference,
  amount, merchant and provider status.
- Duplicate initiation/callback/verification/refund never duplicates money effects.
- Store safe evidence for reconciliation; never store card secrets.
- Accounting can find mismatches and trigger controlled reverification.
- Refund supports full/partial policy and remains distinct from return/stock effect.

### Shipping

- Address snapshot, package, carrier/service, cost, tracking and status history.
- MVP may begin with manual carrier/tracking entry behind a provider interface.
- Shipment creation cannot precede required payment/allocation policy.
- Delivery webhook/manual command is verified/idempotent and audited.

### Purchasing, suppliers and stocktake

- Supplier lifecycle uses deactivate/archive rather than destructive deletion.
- Purchase order has approval policy, expected date, lines/cost and partial receipt.
- Receipt reconciles ordered/received quantity and creates inventory movements.
- Stocktake supports full/cycle scope, count lines, review and approved correction.
- Reorder threshold and low-stock report are per SKU/warehouse where appropriate.

### Returns and support

- Return request, authorization, receipt/inspection and resolution states.
- Reason codes and safe notes; customer-visible and internal notes are distinct.
- Sellable/damaged/quarantine outcomes create correct physical movements.
- Refund/store-credit decision is policy-driven and linked, not embedded as a stock
  edit.
- Support access to customer PII and manual actions is permissioned/audited.

### Notifications

- Queue-based SMS/email/push abstraction; MVP uses required SMS events only.
- Templates are versioned and variables validated; OTP is handled separately.
- Jobs use outbox/idempotency and expose retry/dead-letter status.
- Customer preferences apply to marketing, never required transactional/security
  messages where legally/business appropriate.

### Admin application

- Dashboard emphasizes actionable orders, low stock, failed jobs and payment issues.
- Tables have server pagination/filter/sort and URL-restorable state.
- Forms have accessible labels/errors, dirty-state protection and optimistic use
  only when safe.
- Dangerous actions state exact effect and require reason/confirmation/approval.
- Permission-denied is distinct from hidden navigation; API remains authoritative.
- Audit timeline and actor/reference context are available where operators need it.

### Customer web

- Persian RTL, responsive mobile-first experience and accessible keyboard/focus.
- Home/category/search/product/cart/checkout/account/order/payment result routes.
- Loading, empty, partial, offline/retry and stable error states.
- SEO: canonical URLs, metadata, sitemap/robots policy and product structured data.
- Images and JavaScript obey performance budgets established before launch.
- No production journey depends on the current hardcoded prototype arrays.

### Mobile

- React Native/Expo begins only after auth/catalog/cart/order contracts stabilize.
- Shares API behavior/contracts, not UI business logic or database models.
- Secure token storage, deep-link/payment return and notification permissions.
- Mobile is post-MVP unless business explicitly trades web/admin launch scope for it.

### Reporting and audit

- Operational reports: stock balance/ledger, low stock, order aging, payment status,
  purchase receipt and reconciliation exceptions.
- Exports are authorized, bounded/queued for size and protect PII.
- Audit captures actor/action/entity/before-or-change summary/time/request/reference,
  with redaction and retention policy.
- Analytics never becomes the source of financial or inventory truth.

## 6. Non-functional requirements

### Security and privacy

- Follow OWASP-oriented boundary validation, least privilege, secure headers, CORS
  allowlist, rate/request limits and dependency scanning.
- Secrets live in environment/secret manager and rotate without source changes.
- Encrypt transport, protect backups/object storage and minimize/log-redact PII.
- Threat-model auth, checkout, payment callback, admin privilege and file upload.
- Security events and suspicious abuse are observable without logging credentials.

### Reliability and data integrity

- Critical mutations are transactional, idempotent and bounded-retry safe.
- Outbox bridges committed business state to background side effects.
- Health, readiness and dependency degradation are distinguishable.
- Backups are outside the app host; restore tests meet agreed RPO/RTO.
- Schema migrations are forward, reviewed and rehearsed with recovery strategy.

### Performance and scale

- Start with measured modular monolith performance; no premature service split.
- Define staging p95 budgets for catalog/search/cart/checkout before launch.
- Index from observed queries and explain plans; avoid unbounded endpoints/exports.
- Stateless web/API nodes, externalized sessions/queues/storage and cache invalidation.
- Images use responsive sizes/CDN-compatible object URLs.

### Accessibility and localization

- WCAG 2.2 AA target for critical customer/admin journeys.
- Full keyboard operation, visible focus, semantic labels, contrast and error links.
- Store timestamps UTC; display Iran timezone/Jalali only at presentation/reporting.
- Persian text/RTL and Latin identifiers/phone/SKU input behave correctly together.
- Currency labels explicitly distinguish rial/toman presentation.

### Operability

- Structured logs with request/job/business references and no secrets.
- Error tracking, metrics, dashboards and actionable alerts with owners/runbooks.
- Reproducible Docker deployment, version/release notes and tested rollback.
- Staging is production-like but isolated from production credentials/data.

## 7. Data lifecycle

- Orders, payments, movements and audit are not hard-deleted in normal flows.
- Product/SKU/supplier/staff use explicit inactive/archive states when referenced.
- Customer deletion requests use policy-based anonymization while preserving lawful
  financial/order integrity.
- Define retention for OTP attempts, sessions, audit, logs, exports and backups.
- Production data is never copied to development without approved sanitization.

## 8. Environments and external dependencies

- Local: Docker PostgreSQL/Redis/MinIO, fake SMS/payment and deterministic seed.
- Test: isolated ephemeral database/storage and controlled clock/providers.
- Staging: real deployment topology and provider sandboxes; synthetic/sanitized data.
- Production: isolated credentials, backups, monitoring and least-privilege access.

Dependencies requiring owner/date/contingency: domain/DNS, VPS/cloud, object storage,
SMS provider, payment gateway, shipping/carrier policy, error monitoring, email and
business catalog/stock import.

## 9. Product decisions still required

Before their dependent sprint, business owners must decide:

- rial/toman canonical money and rounding/tax/invoice rules;
- product attribute/variant/barcode/import shape;
- warehouse allocation, reservation duration and backorder policy;
- shipping zones/methods/cost/free-shipping thresholds;
- payment/SMS providers and refund/cancellation policy;
- guest checkout, customer merge and address rules;
- roles/approvals, return/damaged goods and price-change authority;
- launch catalog size, expected traffic, RPO/RTO and support hours.

Unanswered policy is not silently invented in code. Create `needs:decision` issues
with a deadline and record durable results in docs/ADR as appropriate.

## 10. Product completion checklist

Product scope is release-complete only when every included journey has accepted
behavior, API and UI; permission/audit/failure handling; migration/data plan;
unit/integration/E2E evidence; operator/customer documentation; observability and
recovery procedure. The detailed ownership and sequencing is in
`EXECUTION_BACKLOG.md` and release gates are in `DEVELOPMENT_PLAN.md`.
