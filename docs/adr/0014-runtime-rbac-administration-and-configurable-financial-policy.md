# ADR-0014: Runtime RBAC administration and configurable financial policy

Status: Proposed for review (#66-family governance slice)
Date: 2026-09-13
Owner: `@Hordekiller` (platform contract lead); independent reviewer: `@Maddyrampant`
Related: `docs/adr/0005-auth-persistence-boundary.md`, `docs/adr/0007-auth-runtime-security-and-http-contract.md`,
`docs/adr/0003-money-and-time.md`, `docs/adr/0011-sms-provider-and-admin-settings.md`,
`docs/RBAC_AND_FINANCIAL_GOVERNANCE.md`

## Context

Role and permission storage already models grant/revoke metadata, expiry and actor
attribution (`apps/api/prisma/schema.prisma`: `Role`, `Permission`, `UserRole`,
`RolePermission`), and the global `AuthGuard` recomputes effective permissions
server-side per request. However the only writers today are the deterministic seed
(`apps/api/prisma/seed.mjs`) and the TTY first-admin script. There is:

1. **No runtime RBAC administration.** No controller/service can list staff, assign
   or revoke a role, grant or revoke a permission, or manage a user's lifecycle
   status. The admin `/access` navigation item (`نقشها و دسترسی`,
   `apps/admin/src/config/navigation.ts`) is marked `planned` and has no page.
2. **No separable financial-policy surface.** Price mutation is audited and
   versioned (`apps/api/src/modules/catalog/catalog.service.ts`), the integer-Rial
   money model is enforced (ADR-0003), but tax, discount limits, refund thresholds
   and rounding policy are documented as out of scope and are not configurable. The
   only persisted settings store today is the environment-backed SMS one
   (ADR-0011).
3. **No separation-of-duty or approval-threshold mechanism.** Nothing prevents one
   staff member from being able to both initiate and approve a high-risk financial
   action (price edit, refund, discount grant, role grant), and no four-eyes
   threshold is enforceable or configurable.

`docs/SECURITY.md` already lists a permission taxonomy and requires that
"role and permission assignments preserve grant/revoke metadata" with every
privilege change audited. This ADR turns that contract into a runtime, admin-owned
capability and gives financial policy a persistence-backed, audited,
operator-configured home.

Major/minor influence: this is the platform slice needed before the admin
Orders/Finance operational workflows and before the Iranian VAT + electronic
invoice obligations (see `docs/RBAC_AND_FINANCIAL_GOVERNANCE.md`) can be met.

## Decision

### A. Runtime RBAC administration (admin-configurable)

- Add a `RolesService`/`StaffService`/`PermissionsService` behind an
  admin API surface under `/api/v1/admin/` (or `/api/v1/auth/roles` where
  appropriate), guarded by `STAFF_MFA` + `RequireFreshAuthentication` and the
  existing `roles.manage`/`users.manage` permissions. Every mutation:

  - is idempotent where the schema demands it (one row per `userId_roleId` /
    `roleId_permissionId`; a re-grant reactivates `revokedAt` rather than
    duplicating a row);
  - records `assignedById`/`grantedById`, optional `expiresAt`, `revokeReason`
    and audit rows (`SECURITY.md` "Audit");
  - returns effective permission state so the admin UI can show impact before and
    after a change.

- `system-admin` is a `isSystem` role: immutable definition, and the last active
  `system-admin` assignment can never be revoked/deactivated (mirrors the
  first-admin bootstrap invariant in `bootstrap-admin-core.mjs`).

- Permission registry management is allowed at runtime, but seed-owned
  permissions remain a reviewed, canonical baseline; runtime additions must pass
  the DB `Permission_key_format_check` and be documented.

### B. Configurable financial policy (persistence-backed settings)

- Introduce a DB-backed settings store (`Setting`/`SystemSetting` model:
  `key`, typed `value` JSON, `description`, `isSecret`, `updatedById`,
  `updatedAt`, `version`) replacing the ad-hoc environment projection for
  business policy (environment remains for secrets and infra config per
  `docs/OPERATIONS.md`).

- Admin-configurable financial policy surface (all integer-Rial, per ADR-0003):

  | Policy | Default | Notes |
  | ------ | ------- | ----- |
  | VAT rate(s) | `1000` bp (10 %) — enacted by the 1403 budget act, continued in 1404 | rate per goods/service category; `0`/`900`/`1000`/`1200`/`1600` bp presets |
  | VAT treatment | exclusive/inclusive of displayed price | must satisfy EC Law Art. 33 disclosure |
  | Max discount per order / line | configurable `bp`/amount | 
  | Approval thresholds | auto < threshold, four-eyes ≥ threshold | separate for price edit, discount, refund |
  | Refund automation | max auto-refund amount, max refund fraction | four-eyes above threshold |
  | Rounding method | `ROUND_HALF_UP` to Rial (locked) | ADR-0003; not operator-selectable to avoid silent drift |
  | Seller/legal disclosure block | legal name, address, e-Namad, return text | EC Law Art. 33-35, Art. 37-38 |

- Settings changes require `settings.manage` + `STAFF_MFA` + fresh auth, write an
  audit row, and carry `expectedVersion` (optimistic concurrency as in catalog).

### C. Separation of duty and four-eyes enforcement

- Add a `SoD`/`ApprovalPolicy` model: static separation-of-duty sets (a user may
  not hold roles that jointly contain conflicting permissions, e.g.
  `pricing.write` + a future `finance.approve`) and per-action approval
  thresholds (amount-based four-eyes). Enforcement:

  - role assignment rejects combos that violate an active SSD set (INCITS 359
    constrained RBAC);
  - high-risk commands above the configured threshold require a `UserRole`
    assignment distinct from the requesting actor (`ApprovalRequest` workflow
    with `requestedBy`/`approvedBy` and audit), fail-closed when threshold
    metadata is missing;
  - compensating controls for small teams are explicitly modeled (post-hoc
    independent review) and documented, not silent (ISO/IEC 27001 A.5.3).

### D. Iranian legal compliance surface (scoped, future slices)

Platform must reserve the capability to satisfy, at or before launch:

- Electronic Commerce Law (1382/2004) Art. 33-38: full pre-purchase price
  disclosure (goods, tax, shipping, charges), supplier identity and contact, and
  the ≥ 7-working-day distance-contract withdrawal right with free-of-charge
  reimbursement (+ return shipping).
- Permanent VAT Law (1400) + budget-law rate changes (9 % base, 10 % from 1403)
  via configurable rates above.
- Store Terminals & Taxpayer System Law (1398): electronic invoice
  (`صورتحساب الکترونیکی`) payload with unique tax invoice number, tax memory
  data, seller/ (B2B) buyer identifiers, `شناسه کالا/خدمت`, line amounts,
  discounts, VAT and duties amounts, total — and a deterministic integer-Rial
  calculation path (ADR-0003 basis points) so emitted invoices reconcile to the
  Rial.
- e-Namad trust seal display and the operator-managed disclosure block.

Coverage standards: `docs/RBAC_AND_FINANCIAL_GOVERNANCE.md` maps each obligation to
a capability and slice.

## Consequences

- RBAC moves from seed-owned to runtime-administered; enforcement stays server-side
  per ADR-0007 and never trusts client snapshots.
- Financial policy becomes data, auditable and operator-changed without a deploy;
  secrets and infra config stay out of it.
- SoD/approval flow prevents a single operator from both initiating and approving
  high-risk money actions, and the small-team reality is handled with documented
  compensating controls rather than silent grants.
- The schema gains `Setting`, `SoDConstraint`/`ApprovalRequest` and reference data;
  each requires a forward-reviewed migration (no edits to shared migrations).
- The VAT and electronic-invoice obligations remain gated behind their own slices
  (they need the orders/payments/taxes services, per ADR-0003 scope), but the
  configurable-rate and invoicing-data capability must exist before any sales
  code ships.

## Required review

- Customer/money/invoice reviewer: `@Maddyrampant` approves the admin UX, the
  settings contract and the compliance mapping.
- No `schema.prisma` change merges before this ADR is accepted.

## References

- `docs/SECURITY.md`, `docs/AUTH_CONTRACT.md`, `docs/adr/0005`, `docs/adr/0007`
- `docs/ADMIN_PANEL_PLAN.md` §5.11, §5.13
- ANSI/INCITS 359-2004 (Role-Based Access Control; revised 2012) — Core,
  Hierarchical, Constrained (SSD/DSD)
- NIST SP 800-53 AC-5; ISO/IEC 27001:2022 A.5.3; COSO Internal Control framework
- Iran Electronic Commerce Law (1382/2004), esp. Arts. 33-38, 58
- Iran Permanent VAT Law (1400/03/02), Art. 5-7; budget-law rates 1403-1404
- `قانون پایانههای فروشگاهی و سامانه مؤدیان` (1398), incl. `ماده 14 مکرر`
- The full audit with citations: `docs/RBAC_AND_FINANCIAL_GOVERNANCE.md`