# Vuexy Adoption Matrix

Reference: licensed local Vuexy 10.11.1 package at
`/home/solo/development/admin html/vuexy-admin-v10.11.1`.

Vuexy is a design/pattern reference, not the application architecture. Iraniyaragh
keeps its existing Next.js, MUI, RTL, Auth, API and domain boundaries. Commercial
template source/assets are not republished as a standalone template.

## Adopted foundation

| Vuexy pattern               | Iraniyaragh implementation                                            |
| --------------------------- | --------------------------------------------------------------------- |
| vertical/horizontal layouts | `AdminShell` driven by validated preferences                          |
| mini/collapsed navigation   | persisted non-secret `navCollapsed` preference                        |
| light/dark/system modes     | server-seeded preference plus OS mode listener                        |
| default/bordered skin       | MUI theme component variants                                          |
| fluid/boxed content         | logical-direction responsive workspace styles                         |
| customizer                  | accessible settings drawer with reset                                 |
| global search               | keyboard-accessible page command/search surface                       |
| notification dropdown       | visibly fixture-only until a live contract lands                      |
| user/profile dropdown       | authenticated identity and idempotent sign-out                        |
| responsive mobile drawer    | focus trap, Escape close, focus return and scroll lock                |
| menu authorization          | presentation filtered by principal permissions; API remains authority |
| tables/forms/dialogs/status | repository-owned MUI primitives and behavioral tests                  |
| RTL/local typography        | Persian root direction and self-hosted font assets                    |

## Domain pages to implement from project contracts

Vuexy ecommerce/logistics/user/role/FAQ/editor examples may inform composition only.
Real pages follow `docs/ADMIN_PANEL_PLAN.md` and `docs/PAGE_RELEASE_MATRIX.md`:
catalog, pricing/media, warehouses/inventory/transfers/stocktake, orders/payments/
shipping/returns, customers/support, dynamic content/FAQ, notifications, users/RBAC,
audit, diagnostics/logging, jobs/DLQ and safe settings.

Each page requires a typed port, permission and state matrix. A fixture is clearly
labelled and disabled in production; Vuexy mock databases and fake ecommerce records
are never copied as commerce truth.

## Deliberately not imported

- Vuexy Prisma/SQLite schema, Auth.js and API routes: the NestJS API and canonical
  Auth/RBAC model remain authoritative.
- Redux solely because the template uses it: add state infrastructure only with a
  demonstrated cross-feature need.
- calendar, chat, email, kanban, academy, pricing/SaaS and front-page applications:
  outside the accepted commerce/admin scope.
- remote fonts, demo images, fake customers/orders, analytics IDs or credentials.
- the template lockfile, broad dependency bundle, custom icon generator and parallel
  navigation/theme frameworks.
- client-side permission enforcement, financial calculations or inventory state
  transitions.

## Deferred until a real page needs them

- chart library selected from measured dashboard requirements and accessible table
  fallback;
- rich-text editor after the governed content schema, sanitizer, revision/reviewer and
  preview contracts land;
- date picker after UTC/Tehran/Jalali input/output behavior is specified and tested;
- upload/dropzone after presigned storage, MIME/size/malware and recovery contracts;
- bulk actions, export and import only with bounded jobs, audit and permission gates.

## Verification contract

At minimum run admin unit tests with CI coverage, lint/runtime-asset policy, typecheck,
production build and desktop/mobile Playwright. Manually verify keyboard order, 200%
zoom/reflow, reduced motion, dark/bordered combinations and permission-denied menus.
