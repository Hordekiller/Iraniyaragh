# RBAC and Financial Policy Governance

> Status: team documentation (proposed with ADR-0014)
> Owner: `@Hordekiller` (proposed by), independent reviewer: `@Maddyrampant`
> Date: 2026-09-13
> Companion ADR: `docs/adr/0014-runtime-rbac-administration-and-configurable-financial-policy.md`

This document records (1) the audited current state of role-based access control
and money/financial-policy handling, (2) the Iranian legal and regulatory baseline
that the platform must satisfy, (3) the concrete "what must be configurable in the
admin" catalogue, and (4) the gap analysis and slice plan. Documented invariants
here are treated as requirements; code that contradicts them is a defect to be
raised, not silently resolved.

---

## 1. Audited current state (RBAC)

### 1.1 Data model (`apps/api/prisma/schema.prisma`)

- `User`: `id`, `mobile` (unique) or `email` (unique), `passwordHash`, `status`
  (`PENDING`, `ACTIVE`, `SUSPENDED`, `LOCKED`, `DELETED`).
- `Role`: `key` (unique), `name`, `description`, `isSystem`, `isActive`.
  `isSystem` marks seed/seedlike roles that administration must protect from
  modification.
- `Permission`: `key` (unique, format-checked via DB CHECK constraint), `name`,
  `description`, `group`, `isActive`.
- `UserRole` / `RolePermission`: composite unique keys
  (`@@unique([userId, roleId])` / `@@unique([roleId, permissionId])`), with
  assign/grant metadata (`assignedById`/`assignedAt`/`expiresAt` for `UserRole`;
  `grantedById`/`grantedAt` for `RolePermission`) and revoke metadata
  (`revokedById`/`revokedAt`/`revokeReason`). The composite unique key enforces
  one row per pair, so a "re-grant" reactivates the same row (revoked columns
  cleared) rather than inserting a new one — idempotent semantics already in
  schema.
- CHECK constraints enforce (a) the grant/revoke lifecycle (`revokedAt >=
  assignedAt`/`grantedAt`, a revoked row must carry a non-empty `revokeReason`)
  and (b) the composite unique keys above, so a `userId`/`roleId` pair can have
  at most one assignment row.

### 1.2 Enforcement (server-side, never client-trusted)

- Guard = global `AuthGuard` (`apps/api/src/modules/auth/auth.guard.ts`) using the
  `@RequireAuthentication`, `@RequireFreshAuthentication` and
  `@RequirePermission` decorators; there is no separate
  `@RequireApprovedGuard` — approved-credential access is covered by the above
  decorators and the staff `STAFF_MFA` handshake setup at
  `apps/api/src/modules/auth/staff-auth.controller.ts`.
- `AuthPrincipalService` (`auth-principal.service.ts`) resolves each bearer token
  to a session, checks session/user invariants (status `ACTIVE`, `expiresAt`,
  inactivity deadlines — 7 days customer / 30 min staff), and for
  `STAFF_MFA` sessions computes the effective permission set via
  `AuthPermissionService.effectivePermissionKeys` (role → permission with
  `revokedAt IS NULL`, `assignedAt <= now()`, `expiresAt IS NULL OR > now()`,
  active role + active permission).
- Sessions carry an `authenticationLevel` (`CUSTOMER_OTP | STAFF_MFA`) recorded
  at session start — there is no `sessionTypeId` mapping roles at login.
- Because the effective permission set is recomputed from the DB on every
  request, a grant/revoke change takes effect on the next request without any
  separate session-invalidation watermark; `staff` logins additionally require
  `STAFF_MFA` at session start (ADR-0007).

### 1.3 Writers today (seed-only) and drift

- `apps/api/prisma/seed.mjs` deterministically creates 20 permissions + the
  `system-admin` role + a documented bootstrap `.env` user if absent.
  `apps/api/scripts/bootstrap-admin-core.mjs` returns `BOOTSTRAP_REFUSAL` when an
  **active** system-admin already exists — i.e. it refuses to bootstrap an
  *additional* active system-admin (there is no deletion path today). The
  last-admin *delete/revoke* invariance is the new runtime rule this ADR
  proposes, not current code.
- Admins UI reachable: `role` mapping + `.access` navigation item
  (`apps/admin/src/config/navigation.ts`) planned only. There is **no** staff
  directory page, role-assignment page, revoke/grant flow, or user-status
  management endpoint anywhere.
- Observed drift between UI guard names and the seeded registry:
  - `orders.write` is used by
    `apps/admin/src/lib/orders/orders-permissions.ts` (`ORDERS_WRITE`) and
    consumed in `components/orders/{OrdersView,OrderDetailView}`, but is **not**
    among the 20 seeded permissions;
  - seeded `orders.read`/`orders.manage` exist, UI uses `orders.write`;
  - `admin.dashboard.read` is a fixture role permission in the UI that has no
    registry definition.
  This is exactly the class of defect runtime administration must eliminate: a
  single registry in the DB, seeded deterministically, referenced uniformly.

---

## 2. Audited current state (money / financial policy)

### 2.1 Money model

- Per ADR-0003 (`docs/adr/0003-money-and-time.md`): monetary values are **integer
  Rials stored as BIGINT**, never floats. Public contract type:
  `Money = { amount: string /* non-negative integer Rials */, currency: 'IRR' }`
  in `packages/contracts/src/index.ts`.
- Price numeric handling is deferred to the API core (client-safe string round-trip
  of `irr` integers); rounding/BPS math is documented in ADR-0003 but **not yet
  implemented** anywhere (no `roundToRial`, no tax math).

### 2.2 Pricing

- `VariantPriceRecord` appends a full snapshot row per price change (`variantId`,
  `costPrice`, `salePrice`, `effectiveAt` = time of write, `source`,
  `actorUserId`, `reason`, `requestId`), so price history is **append-only and
  audited**. The "current price" is stored on `ProductVariant.costPrice` /
  `salePrice`; there is no effective-dating window.
- The `(variantId, effectiveAt)` index is **non-unique** — there is no composite
  DB unique guard enforcing a single active price. Single-active-price semantics
  are the caller's responsibility at write time.
- `VariantPriceSource` distinguishes `ADMIN | IMPORT | SYSTEM` mutations.
- `updateVariantPrice` uses optimistic concurrency: the transform payload carries
  `expectedVersion` validated server-side against the current variant version;
  mismatch → 409 (`STALE_VERSION`). [as implemented in `catalog.service.ts`.]

### 2.3 Tax, discounts, payments, settings

- **Tax/VAT:** no implementation (explicitly out of scope for the catalog slice).
  No rate table, no inclusive/exclusive handling, no invoice line.
- **Discounts:** no `Discount` module yet; the `Order` model has one
  `discount BigInt @default(0)` column (`discountBb` does not exist). No policy
  on max discount.
- **Payments/refunds:** the `Order` state machine reserves
  `refunded`/`partially...` states, but no payment/refund service is wired, and
  there is **no `OrderLedger` model** — the only ledger-like record in the
  schema is `InventoryMovement`.
- **Settings:** only the environment-backed SMS provider settings (ADR-0011). No DB
  `Setting` model usable for business policy; the admin "Settings" nav
  (`apps/admin/src/config/navigation.ts`) is planned-only.

Net effect: none of the financial *policy* knobs (tax rate, discount limits,
refund thresholds, rounding) exist, and the ones that exist for RBAC cannot be
changed at runtime. This document closes that gap.

---

## 3. Iranian legal / regulatory baseline

### 3.1 Electronic Commerce Law / `قانون تجارت الکترونیکی` (1382/2004)

| Article | Obligation | Platform requirement |
| --- | --- | --- |
| Art. 33 | Before contract conclusion, the seller must disclose goods specs, its legal identity and full contact data, and **all costs integrated in the total price: price, taxes, shipping, and any other charges**, plus offer validity, payment/delivery terms and cancellation rules. | Pre-checkout line shown live: goods total + tax + shipping + other = final total; disclosed dynamically on the product/cart page. Operator-editable legal/seller disclosure block. |
| Art. 34 | Provide a channel for complaints and to record complaints. | Support/audit trails, complaint workflow in admin (administrative, not billing). |
| Art. 35 | Make contract/data accessible; consumer keeps access. | Orders API must replay a durable record the buyer can re-fetch. |
| Art. 37 | For distance contracts, consumer may **change their mind within 7 working days** without penalty or cause; only return shipping is on the consumer. | Refund/cancel policy honoring ≥ 7-working-day withdrawal, configurable but never below the legal floor. |
| Art. 38 | On withdrawal, the consumer's paid sums must be reimbursed **free of charge** and without delay. | Refund flow that reverses full paid amount (including any collected VAT) on withdrawal. |
| Art. 10 / 21 | Secure electronic signatures/valid electronic documents. | Session/auth and approval records stored with audit integrity (ADR-0007). |
| Art. 58 | Sensitive personal data processed only with the data subject's consent. | Consent handling before collecting sensitive data (health data prohibitions in e-commerce store context → mostly N/A, but must not collect unless consented). |

**e-Namad (`نماد اعتماد الکترونیکی`):** for consumer-facing B2C activity the trust
seal from the Ministry's E-Commerce Center is expected to be displayed; operators
manage and must be able to publish its data in the legal block, and losing it can
block payment gateways. The platform does not obtain it, but must expose the slot.

### 3.2 Permanent VAT Law / `قانون مالیات بر ارزش افزوده` (ratified 1400) + budget acts

- **Standard rate: 9 %** (Art. 7), **raised to 10 %** for 1403 and 1404 by the
  annual budget acts (one percentage point). Effects:
  - As of 1404 (current Persian year) the bookstore's standard product rate is
    **10 % (1000 bp)** if not zero-rated.
  - **Zero rate** applies by law to staple/exempt goods, exports and public
    transport; specifically-vulnerable goods/services may be zero-rated; luxury
    items (e.g. certain luxury imports) are at **12 % / 16 %**.
  - Tax basis is the sale value in the electronic invoice (Art. 5), i.e., the
    platform should compute **VAT on the Rial sales value (goods − discounts)**
    and store it as **integer Rials**, never floats.
- Sellers collect VAT at their point of sale; buyers carry a VAT credit regime
  ("اعتبار مالیاتی"). The store must produce invoices and records compatible with
  the e-invoice regime (below).

### 3.3 Store Terminals and Taxpayer System Law / `قانون پایانههای فروشگاهی و سامانه مودیان` (1398) + Facility-of-Taxpayer-Duties Act (1402)

- Covered taxpayers must **invoice electronically** (`صورتحساب الکترونیکی`) with a
  **unique tax-invoice number**, register in the **سامانه مودیان system**, and
  maintain **tax-memory** data. Paper invoices cease to be a valid taxable
  document from **1 Dey 1404**. Penalties apply on non-issue / non-registration
  (incl. loss of VAT credit and per-invoice penalties).
- **Invoice line structure** the platform must be able to emit: seller economic
  number (`شناسه اقتصادی`)/national ID, buyer identifier (economic number or
  national ID, **required for B2B**), goods/service identifier (`شناسه کالا/خدمت`),
  quantity + unit, unit amount, **discounts**, **VAT amount**, **duties/tolls
  amounts**, line & invoice totals, in Rials.
- `ماده 14 مکرر` (introduced 1402) graduated thresholds: some small businesses
  are below the electronic-invoicing obligation threshold for a period, and POS
  receipts may serve as an e-invoice until end-1404 for single-rate sellers
  (نصاب). The founding team (a small specialty bookstore) may be outside the
  hard obligation initially, but the **capability and rates must exist before any
  sale is recorded**, so a revenue-enabling build never picks tax math ad hoc.

### 3.4 Access-control standards to mirror

- **ANSI/INCITS 359** (RBAC, rev. 2012): Core RBAC; Hierarchical RBAC; Constrained
  RBAC with **static separation of duty (SSD)** — a user cannot be assigned two
  roles whose combined permissions are mutually exclusive (e.g., cannot be both
  purchase initiator and approver).
- **NIST SP 800-53 AC-5 + ISO/IEC 27001 A.5.3 + COSO**: separate the functions of
  authorizing, executing and recording transactions; conflict of interest is
  prevented. In a 2–4 person company, strict four-eyes for every action is
  impractical, so **compensating controls are explicit and documented**: time-boxed
  elevated grants, dual approval above configured (Rial) thresholds, tamper-evident
  audit with periodic independent review, and "no last-admin lockout" checks.

---

## 4. "Must be configurable in the admin" catalogue

### 4.1 RBAC (admin `پنل` → "نقشها و دسترسی")

1. **Staff directory**: list searchable staff, filter by role/status; view each
   user's effective permissions and active grants with expiry.
2. **Role management**: create roles, rename, activate/deactivate; definitions of
   `isSystem` roles are read-only.
3. **Permission management**: browse/toggle the **single registry** (from DB);
   no UI-only permission strings; `orders.write` drift resolved (rename UI to
   `orders.manage` or seed `orders.write` — one source of truth).
4. **Assign/revoke**: grant role → user with optional expiry + reason; direct grant
   revoke; **blocked combos per SoD sets** (reject assignment, explain why).
5. **Safety checks**: cannot demote the last active `system-admin`; every mutation
   requires `STAFF_MFA` + fresh session + audit write; activation of a suspended
   role requires an explicit signal.
6. **Impact preview**: admin sees "who this changes" before confirming.

### 4.2 Financial policy (admin → "تنظیمات مالی")

| Setting | Example/values | Default (1404) | Legal anchor |
| --- | --- | --- | --- |
| VAT rate(s) | per category preset list | `1000` bp (10 %) | Budget acts 1403-1404; VAT Law Art. 7 |
| Tax position | tax-exclusive / tax-inclusive display | exclusive, price excludes VAT (decide by 1st sale) | VAT Law Art. 5 |
| Zero-rated categories | book/paper or undefined | none until classified | VAT Law Arts. 7-9 |
| Rounding method | `ROUND_HALF_UP` to Rial (**locked**) | locked | ADR-0003 |
| Max discount per order / per line | bp or Rials | operator value | ADR-0003 math; EC Law Art. 33 (show net price) |
| Discount approval threshold | Rials four-eyes | operator value ≥ discount cap | SoD/AC-5 |
| Refund automation | max automatable refund; max refund fraction | operator values | EC Law Art. 37-38 (never below floor) |
| Withdrawal window | >= 7 working days, clamped to law | 7 (UI may offer 7/14/30) | EC Law Art. 37 |
| Seller legal block | name, ID, address, e-Namad, contact | operator texts | EC Law Art. 33; e-Namad |
| Invoice/e-invoice | number format?, tax-memory readiness toggles, `شناسه کالا/خدمت` registration | off until service built | QTS-samanehMoadian |
| Currency | **`IRR` only** (not configurable) | IRR | ADR-0003 |

Every settings mutation: `settings.manage` + `STAFF_MFA`, audit row, optimistic
concurrency (`expectedVersion`).

### 4.3 Sensitive-key SoD sets (initial config)

- `pricing.write` + (a future) `finance.approve.pricing` → mutually exclusive.
- originator of an order's discount/refund vs approver → mutually exclusive.
- `roles.manage` + `audit.read` are deliberately **not** both held by one person
  when payroll-like power matters (configurable: the set list lives in DB).

---

## 5. Gap analysis and slice plan

| Slice | Deliverable | Depends on | Exit criteria |
| --- | --- | --- | --- |
| **G1 — Settings store** | DB `Setting` model + admin settings service/endpoint (typed values, audit, optimistic concurrency) | ADR-0014 accepted | GET/PUT settings with `version`; audit rows; UI page (fin + seller block) |
| **G2 — Admin RBAC API** | Staff/Roles/Permissions services + endpoints (list, grant, revoke, expiry, status) w/ migration + seeds | G1 | full CRUD incl. SoD rejection, last-admin guard, idempotent re-grant, audit; 48-file+ suite stays green |
| **G3 — RBAC admin UI** | `نقشها و دسترسی` pages wired to G2; permission registry single-source; fix `orders.write` drift | G2 | UI shows effective permissions & impact preview; e2e not broken |
| **G4 — Taxation math** | BPS round-to-Rial, VAT on Rial price, exclusive/inclusive, zero-rated categories → all integer | G1 | property tests vs handbook Rial expectations; zero float in any column |
| **G5 — Discounts/refunds + approval** | Discount module, refund flow honoring withdrawal floor, `ApprovalRequest` workflow, thresholds | G3, G4 | four-eyes works above configured threshold; auto refund ≤ cap; ≥7-day window enforced |
| **G6 — Orders/checkout taxation + legal block display** | Line-level tax in order totals, disclosure line pre-purchase | G4, G5 | EC Law Art. 33/37/38 satisfied end-to-end (integration test) |
| **G7 — Electronic invoice readiness** | e-invoice payload (numbering, identifiers, line structure, VAT/duties, totals), `شناسه کالا/خدمت` refs | G6 | emit/validate sample vs `سامانه مودیان` schema docs; documented operator runbook for threshold exemptions |
| **G8 — Docs/procedures** | runbook: threshold exemption, zero-rate decisions, e-Namad slot, wallet/POS settlement | — | TEAM updated; legal-note review by owner |

Capability rule: **G4/G5/G6 (integer-Rial tax, discounts, refunds, disclosure)
must land before the first real sale**; G7 can follow revenue launch only if the
store falls under `ماده 14 مکرر` threshold — the owner verifies against the annual
نصاب before launch.

---

## 6. Decision checklist for the team

- [ ] **ADR-0014 accepted.** Schema work (Setting/SoD/ApprovalRequest) starts only
      after acceptance; migrations are forward-only and reviewed (no edits to
      shared migrations).
- [ ] Confirm `orders.write` drift fix direction (rename vs seed).
- [ ] Confirm VAT display position (exclusive vs inclusive) for the storefront —
      decided visibly in the legal block demo, then encoded as the default.
- [ ] Confirm rounding is effectively locked to ADR-0003 by `permission.code` still
      `irr` (no float ever surfaces in an invoice file or API contract).
- [ ] Approver roles implemented against **roles** not ad-hoc emails/chat; SMS
      approvals (ADR-0011 provider) available for `ApprovalRequest` notifications.

## 7. Sources

- `docs/SECURITY.md`, `docs/AUTH_CONTRACT.md`, `docs/OPERATIONS.md`,
  `docs/ADMIN_PANEL_PLAN.md` (§5.11, §5.13), `docs/adr/0003`, `docs/adr/0005`,
  `docs/adr/0007`, `docs/adr/0011`
- ANSI/INCITS 359-2004 (rev. 2012); NIST SP 800-53 AC-5; ISO/IEC 27001:2022 A.5.3;
  COSO Internal Control–Integrated Framework; SOC 2 CC5.1-CC6
- Iran Electronic Commerce Law (1382); Permanent VAT Law (1400); Store Terminals &
  Taxpayer System Law (1398) + 1402 amendment (`ماده 14 مکرر`)
- Authoritative retrieval for current rates: sanctioned-web disclaimer appended.
  (Team re-verifies VAT presets each Persian New Year and on any budget act.)

## 8. Reconciled contradictions

None between code and this doc yet; the flagged **only** discrepancy class is the
permission-registry drift in §1.3 (`orders.write` vs `orders.manage`,
`admin.dashboard.read` fixture). Resolve via G3 single-source-of-truth.