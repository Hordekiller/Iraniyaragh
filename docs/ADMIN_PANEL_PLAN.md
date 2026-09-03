# Production Admin Panel Program

Status: proposed for joint review in GitHub Issue #70

Owners: product/UX lead `@Maddyrampant`; runtime/security/integration lead
`@Hordekiller`

Last researched: 2026-09-01

## 1. Outcome and meaning of complete

The Iraniyaragh admin application is the operational control plane for catalog,
inventory, orders, payments and fulfillment. It is not a themed demo and it is not
the source of business truth. The backend owns permissions, state transitions,
pricing, inventory, idempotency and audit invariants.

For the agreed `1.0` scope, **complete** means:

- every included operator journey is executable without database edits;
- every protected read and command is enforced by the API and represented honestly
  in the UI;
- critical mutations are permissioned, validated, idempotent, audited and recoverable;
- loading, empty, partial, offline, rate-limited, forbidden, conflict and failure
  states are deliberately designed;
- critical journeys meet WCAG 2.2 Level AA and work in Persian RTL on the supported
  browser and viewport matrix;
- the production build has no external runtime asset dependency, known high/moderate
  production vulnerability, severity-1/2 defect or unexplained payment/inventory
  discrepancy;
- another team member can deploy, operate, diagnose and recover the system from
  documented evidence.

No engineering process can guarantee that software will never contain a defect.
The release gate is therefore measurable: zero known severity-1/2 defects, zero
known critical-journey regression, and explicit time-bounded acceptance for any
lower-severity residual issue.

## 2. Current baseline and gaps

Implemented today:

- Next.js App Router, strict TypeScript, MUI, Emotion RTL cache and CSS Modules;
- Persian RTL shell with responsive sidebar/drawer and keyboard focus handling;
- local Noto Sans Arabic font, bundled Lucide icons and a runtime-asset scanner;
- one honest dashboard shell with placeholder values instead of fabricated business data;
- desktop/mobile Playwright smoke coverage and a zero-external-asset network gate;
- a declarative navigation map whose permission keys are placeholders for the backend
  permission registry.

Not implemented today:

- staff sign-in, TOTP challenge, session refresh/revocation and permission-aware shell;
- a real typed API client, generated/validated contracts and domain fixtures;
- operational module routes, tables, forms, commands, notifications and audit timelines;
- dashboard metrics, work queues, global search or operator task inbox;
- reusable production primitives for grids, filters, forms, uploads, exports and
  destructive/sensitive commands;
- automated admin component/a11y/visual-regression suites;
- CSP nonce/hash enforcement for the final MUI/Next.js render path.

The current admin is therefore a sound **foundation shell**, not an operational panel.

## 3. Non-negotiable architecture

1. Keep the accepted stack: Next.js App Router + TypeScript + MUI + Emotion RTL.
2. Vuexy v10.11.1 is a local structural reference only. Never bulk-copy the full
   template, fake database, demo branding, authentication, Prisma schema, route tree,
   icon bundle or unused dependencies.
3. No new framework, state platform, grid/chart/editor suite or broad dependency set
   without a scoped issue, license/security review and accepted ADR when architectural.
4. Never expose Prisma entities to the admin. Public/admin DTOs are versioned contracts
   derived from OpenAPI or explicitly maintained in `packages/contracts`.
5. UI components render state and collect intent. Domain services own calculations,
   validation, authorization and transitions.
6. Use server pagination/filter/sort for operational collections. URL query state is
   canonical for shareable views; do not load unbounded collections into the browser.
7. Access tokens remain memory-only. Refresh/CSRF cookies and session lifecycle follow
   `docs/AUTH_CONTRACT.md` and ADR-0007 after those changes land on `main`.
8. All runtime fonts, icons, scripts, styles and static media are bundled or same-origin.
   API/object-storage/monitoring origins are explicit reviewed CSP exceptions.
9. Prefer server components for stable page composition and client islands only for
   interaction. Do not turn the whole admin shell into a client application by default.
10. Every page has one accountable domain issue and small reviewable PRs. Shared shell,
    navigation, theme, contracts and root dependency files require coordination first.

## 4. Operator roles and least-privilege views

| Role               | Primary work                                                           | Must not gain implicitly                             |
| ------------------ | ---------------------------------------------------------------------- | ---------------------------------------------------- |
| Catalog operator   | Category, brand, product, SKU, media, SEO and publish workflow         | Stock mutation, refund, role management              |
| Warehouse operator | Receipt, pick, pack, count, transfer and controlled adjustment         | Price edit, payment state edit, role management      |
| Sales/support      | Customer/order context and explicitly permitted order commands         | Full PII export, inventory rewrite, arbitrary refund |
| Accounting         | Payment/refund/reconciliation evidence and approved financial commands | Catalog publish, physical stock adjustment           |
| Administrator      | Staff, role/permission composition and non-secret configuration        | Bypass of audit, state machines or four-eyes policy  |
| Auditor/read-only  | Searchable immutable operational/security evidence                     | Any mutation                                         |
| System/worker      | Idempotent jobs with explicit actor identity                           | Interactive login or unrestricted human permissions  |

Navigation is a convenience view of live permissions from `/me`; it is never an
authorization boundary. Forbidden deep links render a stable `403` experience and
the API remains authoritative. Sensitive fields and actions require distinct
capabilities, not broad role-name checks.

Secret rotation, provider credentials, webhook signing keys and other secret-manager
operations stay in controlled operations runbooks; the admin panel only exposes
validated non-secret configuration and safe metadata about secret health/rotation.

## 5. Information architecture and required modules

### 5.1 Operations dashboard and task inbox

- actionable cards for aged orders, fulfillment backlog, low stock, payment mismatch,
  failed jobs, reservation expiry and reconciliation exceptions;
- every metric shows definition, time range, timezone, freshness and link to the
  filtered source list;
- no decorative KPI or number without a trusted query contract;
- role-specific dashboard composition and saved layout only after the permission and
  metric registries exist;
- alert acknowledgement/assignment uses backend commands and audit, not local state.

### 5.2 Catalog, SKU, media and pricing

- categories: hierarchy, ordering, active/archive state, slug conflict handling;
- brands: identity, media, active/archive state and referenced-history preservation;
- products: title/content, SEO, category/brand, lifecycle and preview;
- variants/SKUs: attributes, unique SKU/barcode, physical properties and availability;
- media: validated upload, progress, retry, ordering, alt text, generated sizes and
  orphan cleanup visibility;
- pricing: canonical Rial input/display, optional Toman presentation, effective dates,
  sale/base price and immutable price-change history;
- draft validation, publish readiness checklist, explicit publish/unpublish commands;
- bulk edit/import with dry-run, row-level errors, result summary and rollback/forward-fix
  instructions where applicable.

### 5.3 Warehouses, locations and inventory

- warehouse/location lifecycle and fulfillment capability;
- balance view by SKU × warehouse × location with on-hand, reserved, available,
  unavailable/quarantine and incoming states where supported by the domain;
- immutable movement ledger with actor, reason, reference, request ID and correlation;
- controlled receipt/adjustment/damage commands with exact effect summary;
- reservation search, age, consume/release/expire evidence;
- transfer request/approve/dispatch/receive/cancel timeline;
- stocktake create/scope/count/review/approve and variance reconciliation;
- low-stock thresholds, reorder report and barcode/scanner-friendly input boundary;
- damaged, unavailable and quarantine quantities must use the accepted inventory
  ledger/state model; a child domain decision must pin that model before UI work and
  the admin must never expose a parallel editable quantity;
- never provide a generic editable quantity field that bypasses the ledger.

### 5.4 Orders and fulfillment

- server-filtered queue with saved views for actionable state and age;
- order detail: snapshots, customer/address, lines/totals, payment, fulfillment,
  shipment, notes and immutable activity timeline;
- separate order/payment/fulfillment/return badges; never flatten them to one status;
- only valid contextual commands returned or confirmed against backend capabilities;
- cancellation and compensation preview showing stock/payment consequences;
- pick/pack workflow, packing slip/invoice print baseline and partial fulfillment;
- stale-version conflict handling that refreshes and explains changed state instead
  of overwriting another operator.

### 5.5 Payments, refunds and reconciliation

- payment attempts and provider evidence with sensitive data minimized;
- verification/reverification, mismatch queue and provider outage states;
- full/partial refund command with amount, reason, original payment and remaining limit;
- step-up authentication and optional four-eyes approval for configured thresholds;
- duplicate/idempotency outcome displayed as the existing result, not a second success;
- daily totals and discrepancy reports link to immutable evidence;
- browser callback or operator input never directly marks an order paid.

### 5.6 Shipments and delivery

- package/line allocation, carrier/service, cost, tracking and address snapshot;
- manual and provider-backed creation through one contract boundary;
- dispatch/delivery/failure/return-to-sender history and idempotent provider events;
- print labels/documents only from reviewed same-origin/generated resources;
- exceptions queue for invalid address, carrier failure and stale tracking.

### 5.7 Customers and support

- customer profile, identity linkage state, addresses, orders, returns and safe notes;
- PII masking by default with explicit permission for reveal/export;
- customer merge/anonymization/export/delete-request workflows only after policy and
  backend support; no implicit join by mobile/email;
- internal notes distinct from customer-visible content and audit history;
- support actions show reason, effect, permission and downstream state.

### 5.8 Suppliers and purchasing

- supplier lifecycle, contacts, terms and safe archival;
- purchase order draft/approve/cancel with lines, expected date and cost;
- partial receipt against PO with location and inventory movement evidence;
- ordered/received/outstanding reconciliation and late-purchase views;
- approval thresholds and cost visibility follow explicit permissions.

### 5.9 Returns and after-sales

- request/authorize/receive/inspect/resolve workflow per line and quantity;
- reason codes, customer-visible/internal notes and evidence attachments;
- sellable restock, damaged/quarantine and no-return outcomes;
- refund/store-credit remains a linked financial command, not an inventory edit;
- exchange and partial-return behavior only after accepted product policy.

### 5.10 Reports, exports and reconciliation

- stock balance/ledger, low stock, order aging, payment/refund status, purchase receipt,
  return outcomes and reconciliation exceptions;
- each report states source, filters, timezone, currency unit and freshness;
- saved views and deep-linkable filters; charts always have a textual/table fallback;
- exports are permissioned, bounded and queued, with owner, expiry, download audit and
  PII classification; never export an unbounded live query in the request cycle;
- analytics is read-only evidence and never becomes inventory/financial truth.

### 5.11 Users, roles, permissions and sessions

- staff invite/bootstrap/status, role assignment and effective-permission preview;
- role composition with affected-user preview before privilege changes;
- TOTP enrollment/recovery, forced reauthentication and safe recovery handling;
- active session/device list, revoke-one/revoke-all and security event history;
- login attempt/lockout visibility without raw secrets or unhashed identifiers;
- privilege changes require TOTP, exact effect confirmation and audit.

### 5.12 Audit and security operations

- immutable searchable audit events by actor/action/entity/reference/request/time;
- entity timelines embedded in relevant domain pages plus a privileged global search;
- safe before/change summary with secrets and sensitive PII redacted;
- exports, log access and audit access are themselves audited;
- suspicious auth/access/state-order attempts surface in security queues;
- audit, security, operational and transaction logs remain purpose-separated.

### 5.13 Settings, imports, jobs and system health

- non-secret, typed, versioned configuration with validation and change audit;
- feature flags show environment, owner and expiry; secrets never render in UI;
- imports provide upload, validation, dry-run, confirmation, progress and result report;
- background jobs show type/state/attempts/age/error class and safe retry/dead-letter
  commands; payloads are redacted;
- dependency/service health, backup age, last restore drill and deploy version are
  visible read-only with links to runbooks;
- production environment has a persistent visual identity to prevent wrong-environment
  operations without relying on color alone.

## 6. Shared UX system

### 6.1 Design tokens

Create three layers: primitive values, semantic roles and component tokens. At minimum:

- color: surface/text/border/action/focus plus info/success/warning/error and all states;
- typography: Persian body/heading/numeric/SKU treatment with tabular numbers;
- spacing: 4/8-based scale; density modes only if tested, never ad-hoc per page;
- shape, elevation, icon size/stroke, z-index and motion duration/easing;
- light theme first; dark/high-contrast themes are separate acceptance work and must
  not be inferred by swapping a few colors.

Use local Persian-capable fonts. Do not adopt Google Fonts or the Fira recommendation
from generic dashboard tooling. Status meaning is never color-only.

### 6.2 Shell and navigation

- skip link, landmarks, page title, breadcrumbs and one visible primary heading;
- permission-aware grouped navigation with active/expanded state and responsive drawer;
- global command/search only after a scoped searchable-resource contract exists;
- operator profile, active role/context, session expiry and environment indicator;
- notification/task inbox only for actionable server-backed items;
- keyboard operation, focus trap/restore, Escape and reduced-motion behavior.

### 6.3 Data table/list primitive

- server pagination, sort and filter as one consistent request model;
- URL-restorable query, debounced search, cancellation and stale-response protection;
- column labels/units, row identity, responsive overflow/card alternative and sticky
  controls that never obscure keyboard focus;
- row selection and bulk actions with explicit scope (`selected` versus `all matching`);
- loading skeleton, initial empty, filtered empty, partial error, retry and stale-data states;
- saved views/column visibility only when persisted behavior is specified;
- sticky pinning for operational identity/status columns may be added as an
  enhancement only after keyboard, focus, RTL, narrow-viewport and grid-license
  behavior is verified; it is not a baseline requirement;
- export uses the same authorization/filter contract but executes asynchronously;
- grid cells follow one managed tab sequence and documented arrow-key behavior.

MUI X Data Grid Community, a licensed MUI X tier or a smaller in-house MUI Table
abstraction must be decided in a dependency/license ADR before implementation. Do not
copy Vuexy's TanStack table stack implicitly.

### 6.4 Form and command primitive

- real labels, descriptions, required/optional state and field-level errors;
- server errors map to fields or an announced form summary with a recovery action;
- Persian/Arabic digits normalize only where the contract allows; SKU/barcode/IDs
  preserve exact Latin semantics;
- dirty-state navigation guard and explicit discard; no surprise autosave on critical forms;
- loading buttons prevent double submit; idempotency keys survive safe retries;
- draft workflows may autosave only with visible state and a documented conflict policy;
- successful commands show result/reference, not only a disappearing toast.

### 6.5 Sensitive/destructive action primitive

Every critical command shows:

- object and current state;
- exact requested effect and irreversible/financial/stock consequences;
- reason input and optional evidence;
- permission and reauthentication/approval requirement;
- idempotency/request reference and conflict behavior;
- success result, audit link and safe recovery path.

Deletion confirmations never substitute for archive/deactivate/state transitions.
High-risk authorization is generated and enforced server-side, time-bound and tied to
the specific action.

### 6.6 Feedback and error contract

Provide standard representations for:

- initial loading, background refresh and long-running queued work;
- no data, no search result and permission-filtered data;
- offline, timeout, upstream unavailable and rate limit with retry time;
- validation, not found, forbidden, stale/CAS conflict and idempotency conflict;
- session expired, revoked, replay detected and reauthentication required;
- partial success and eventual-consistency state;
- unexpected failure with request ID and support/retry guidance.

Never display raw backend messages, stack traces or secrets. Localization keys derive
from stable error codes, with a safe fallback.

## 7. Security, privacy and audit gates

- Target OWASP ASVS 5.0 Level 2 for the admin surface and explicitly map relevant
  authentication, session, access-control, validation, logging, data-protection,
  API and configuration requirements.
- Deny by default on missing/unknown permission or unavailable security configuration.
- Enforce object-level and command-level authorization server-side; test horizontal
  and vertical access failures.
- Require recent TOTP proof for privilege assignment, sensitive configuration,
  refunds and policy-selected high-risk inventory/payment commands.
- Protect all state-changing cookie-authenticated endpoints with the accepted CSRF
  policy; never weaken public challenge endpoints or session commands ad hoc.
- Do not store credentials, tokens, raw OTP/TOTP, sensitive identifiers or unrestricted
  PII in local/session storage, logs, analytics, errors, URLs or cached page state.
- Mask PII by default. Reveals, exports and sensitive searches require narrow permission
  and audit where policy requires it.
- Keep audit trails append-only and reconstructable. Sanitize log/audit display against
  injection and never allow the UI to alter original evidence.
- Tighten Next.js/MUI CSP using nonce/hash guidance when the authenticated render path
  is stable; keep connect/image origins explicit and test the browser network.
- Protect against clickjacking, open redirect, CSV injection, unsafe file preview,
  formula injection, unbounded export and malicious upload cases.
- Sensitive errors expose request/reference IDs, not internal topology or provider secrets.

## 8. Accessibility, Persian RTL and localization gates

Target WCAG 2.2 Level AA for all critical operator journeys:

- semantic headings/landmarks, skip navigation and logical DOM/focus order;
- all actions available by keyboard; composite grids/menus follow defined key patterns;
- visible focus is never hidden by sticky headers/drawers and targets meet WCAG 2.2
  minimum size/spacing;
- dialogs/drawers trap focus, close predictably and restore the invoker;
- labels, instructions, errors and async status are announced; color/icon is never the
  only signal;
- contrast is verified in every supported theme/state, including disabled/read-only;
- reduced motion, zoom/reflow and high text scaling do not lose content or actions;
- drag/drop always has a single-pointer/keyboard alternative;
- authentication does not impose an unnecessary cognitive-function test;
- mixed-direction mobile, email, SKU, barcode, tracking and request IDs isolate LTR text;
- timestamps are stored UTC and shown with explicit Iran timezone; Jalali is presentation;
- all money labels explicitly state Rial or Toman and calculations stay integer Rial.

Automated checks are necessary but insufficient. Each milestone requires manual keyboard,
screen-reader spot checks and desktop/mobile RTL review by the non-author.

## 9. Performance, resilience and operability

- define route JS, interaction latency and API p95 budgets from a production-like baseline;
- keep high-cardinality collections server-side, bounded and indexed from real query shapes;
- cancel superseded requests and prevent race/stale-response overwrites;
- virtualize only when measured; preserve accessibility and printable/exportable alternatives;
- lazy-load charts/editors and never ship Vuexy demo dependencies to routes that do not use them;
- use responsive images from controlled object storage with fixed dimensions;
- show stale/fresh timestamps and degradation without presenting stale values as current;
- instrument route errors, web vitals, command latency/failure and client request IDs without PII;
- connect serious UI failures to owned alerts/runbooks; a dashboard that nobody monitors is not done;
- support safe refresh/back/retry and provider/job failure without duplicating commands;
- keep production build/install reproducible and production dependency audit clean.

## 10. Verification matrix

### 10.1 Per primitive

- unit tests for normalization, formatting, reducers/state machines and permission views;
- component tests for keyboard, focus, validation, loading and error recovery;
- automated a11y checks plus manual semantics/focus review;
- responsive and RTL visual-regression baselines for stable primitives;
- runtime network assertion for no third-party asset request.

### 10.2 Per read journey

- allowed and forbidden role;
- initial/loading/empty/filtered-empty/error/retry/stale/partial states;
- pagination/filter/sort URL restoration and back/forward behavior;
- slow, aborted, duplicated and out-of-order responses;
- mobile/desktop, keyboard and mixed RTL/LTR values;
- large realistic dataset and bounded export behavior.

### 10.3 Per critical command

- permission allow/deny and object-level authorization;
- validation and illegal source-state rejection;
- duplicate idempotency key and conflicting-payload rejection;
- double click, refresh/back, timeout and retry;
- stale version/concurrent operator conflict;
- partial provider/job failure and documented recovery;
- recent-auth/four-eyes approval where required;
- safe audit evidence with actor/action/entity/reference and no secret/PII leak.

### 10.4 Release suites

- lint, typecheck, unit/component, production build and runtime-asset scan;
- OpenAPI/contract drift and representative fixture validation;
- PostgreSQL integration/concurrency tests owned by the API domain;
- Playwright role × critical journey × desktop/mobile matrix;
- axe or equivalent automated WCAG checks plus manual keyboard/screen-reader evidence;
- dependency review, production audit, CodeQL and secret scanning;
- staging UAT, provider failure drills, deploy/rollback and backup/restore evidence.

Flaky critical tests are release blockers; retrying CI until green is not acceptance.

## 11. Delivery sequence and two-person split

### Phase A — identity and admin UI foundation (`0.1`)

1. Land the accepted Auth contract/runtime stack in dependency order.
2. Implement staff password → TOTP → session flow, expiry/revocation and forbidden UX.
3. Validate navigation permission keys against the backend registry.
4. Establish design tokens and the first primitives: page frame, status/error, form,
   table/filter and sensitive-command confirmation.
5. Decide the grid dependency/license and CSP nonce approach through scoped decisions.

### Phase B — publish-to-discovery (`0.2`)

1. Category/brand management.
2. Product/SKU/attribute/media workflow.
3. Price history/effective price UI.
4. Publish readiness, preview and audit timeline.
5. Import dry-run and real storefront discovery E2E.

### Phase C — inventory operations (`0.3`)

Warehouse/location, balance/ledger, receipt/adjustment, reservations, transfers,
stocktake, low-stock and reconciliation in dependency order.

### Phase D — orders, payment and shipping (`0.4`–`0.5`)

Order queue/detail/commands, pick/pack, payment evidence/reconciliation/refund,
shipment/tracking and customer/support context. Preserve separate state machines.

### Phase E — purchasing, returns and reporting (`0.6`)

Suppliers/PO/partial receipt, returns/inspection/restock, operational reports and
bounded queued exports.

### Phase F — experience and production completion (`1.0`)

Users/roles/sessions/audit/config/jobs/health completeness, WCAG/cross-browser/RTL
audit, performance/security/load tests, UAT, help/runbooks, data migration and launch.

For every slice:

- Platform lead publishes/updates contract and implements backend invariants.
- Product lead builds fixtures/UI/E2E after contract review.
- The non-author verifies permissions, failure paths and operational evidence.
- Shared hotspots use a contract/design PR before parallel code.

Do not create every page at once. Pull small child issues from the current milestone;
one vertical journey must be fully accepted before multiplying similar screens.

## 12. First child issues after this plan is accepted

1. Admin staff login/TOTP/session/forbidden contract and UI.
2. Admin design tokens and semantic status/feedback primitives.
3. Data-grid/license ADR plus server query/filter/pagination contract.
4. Accessible form/dirty-state/server-error primitive.
5. Sensitive command/reason/reauth/audit-result primitive.
6. Catalog category/brand vertical slice.
7. Product/SKU/media/price publish vertical slice.

Do not open implementation PRs for items 2–5 while the Auth/admin-session slice owns
the shell/navigation without an explicit checkpoint from `@Maddyrampant`.

> **Branch note (2026-09-03):** a development-only staff sign-in slice (ADR-0010)
> now exists on the admin-primitives branch — `/auth/dev/signin`, `/auth/me`,
> `/auth/logout` plus an admin `/login` page, memory-only token store and shell
> logout. It is gated to development/test (startup fails in staging/production) and
> exists specifically to unblock operational/testing work. It does NOT satisfy item 1
> (full staff password+TOTP/session/forbidden contract), which remains required and
> still requires the §12 checkpoint from `@Maddyrampant` before the shared
> shell/navigation is considered owned.

## 13. Definition of Done for an admin module

A module is done only when all applicable evidence exists:

- accepted behavior, permission matrix and stable API contract;
- no business rule duplicated in UI;
- all routes, states and critical commands implemented;
- loading/empty/error/offline/conflict/forbidden/session-expired recovery;
- responsive Persian RTL, keyboard and WCAG 2.2 AA evidence;
- authorization, audit, idempotency and concurrency/failure tests;
- no external runtime asset or sensitive storage/log leak;
- bounded server queries and measured performance budget;
- operator help, support/runbook and request/reference diagnostics;
- full affected-package checks and critical Playwright journeys green;
- independent review by the other developer and `PROJECT_STATUS.md` updated.

## 14. Research basis

The plan is grounded in the repository invariants and these current primary/official
references. They are benchmarks, not dependencies or permission to copy another
product's UX:

- [WCAG 2.2](https://www.w3.org/TR/WCAG22/) and
  [new 2.2 criteria](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/)
- [OWASP ASVS 5.0](https://owasp.org/www-project-application-security-verification-standard/),
  [transaction authorization](https://cheatsheetseries.owasp.org/cheatsheets/Transaction_Authorization_Cheat_Sheet.html)
  and [logging guidance](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
- [Next.js CSP guidance](https://nextjs.org/docs/app/guides/content-security-policy)
- [MUI Data Grid accessibility](https://mui.com/x/react-data-grid/accessibility/),
  [server-side data](https://mui.com/x/react-data-grid/server-side-data/) and
  [pagination](https://mui.com/x/react-data-grid/pagination/)
- [Shopify product operations](https://help.shopify.com/en/manual/products),
  [inventory states](https://help.shopify.com/en/manual/products/inventory/fundamentals/inventory-states),
  [order operations](https://help.shopify.com/en/manual/fulfillment/managing-orders),
  [staff permission granularity](https://help.shopify.com/en/manual/your-account/users/roles/permissions/store-permissions)
  and [analytics/report drill-down](https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports)
- local licensed Vuexy v10.11.1 Next.js TypeScript starter, inspected only as the
  selective reference allowed by ADR-0004.
