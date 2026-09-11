# Independent Agent Workstreams

Status: active coordination contract; reviewed 2026-09-11.

This file keeps three implementation lanes independently productive without allowing
UI branches to redefine business truth or silently collide in shared hotspots.

## Lanes

| Lane             | Owns                                                                                                  | Must not own                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Platform/current | API services, persistence, contracts, workers, providers, discovery runtime, telemetry and operations | Admin/customer presentation                                                  |
| Admin agent      | `apps/admin` pages, components, accessible operator states and contract adapters                      | API policy, Prisma, migrations, provider secrets, audit/log storage          |
| User UI agent    | `apps/web` presentation, responsive/accessibility behavior and contract adapters                      | Price/stock/order authority, API policy, admin surfaces, telemetry internals |

Each lane works from its own issue, branch and worktree. UI lanes may remain fixture-
backed, but fixtures must implement an explicit port matching an accepted contract and
must fail closed in production. Fixture behavior is never reported as delivered live
capability.

## Current three-lane assignment

| Lane             | Current owned outcome                                                                               | Branch/worktree boundary                                                           | Integration dependency                                                                     |
| ---------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Platform/current | #111 Catalog hardening after this coordination PR; #114 private acceptance remains externally gated | API, data, contracts and operations only; new worktree from current `main`         | Publish an accepted contract before either UI switches from fixtures                       |
| Admin agent      | Catalog/operator UI already present as local untracked work                                         | `apps/admin/**`; one named owner alone edits `apps/admin/src/config/navigation.ts` | Compile fixtures against `packages/contracts`; live wiring follows the API merge           |
| User UI agent    | Routed responsive storefront and purchase UX already present as local-only work                     | `apps/web/**`; one named owner alone edits web routing/layout                      | Keep sellable data fixture-gated until public API and pricing/availability contracts merge |

The root `feat/admin-catalog-slice` worktree is owned by the UI lanes and remains dirty.
The platform lane must use a separate worktree and must not stage, reformat, move or
delete those files. A local commit is handoff evidence, not merged capability.

## End-to-end parallel delivery map

Each row is a merge wave. Work within a wave may run in parallel only after its
contract gate is merged. The integration row is a separate PR based on then-current
`main`; it is never appended to either UI implementation branch.

| Wave                        | Contract/platform lane                                                                                | Admin lane                                                                        | User UI lane                                                                 | Integration and exit                                                                    |
| --------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `0.1` Auth closure          | Reconcile #50/#91; retain #114 as private SMS.ir acceptance; no invented secret backend               | Verify live staff session, MFA, permission denial and SMS read-only states        | Verify live customer OTP states, refresh/revoke and cross-tab recovery       | Clean-main Auth E2E; close/split #50/#91; #78 remains a named governance blocker        |
| `0.2-A` Catalog contract    | #111 idempotency, public cache/projection and barcode decision; then variants/pricing/media contracts | Finish category/brand/product/SKU fixture screens without editing domain rules    | Finish discover/list/detail fixture pages with canonical URL state           | Contract parity tests; no live switch before #111 and public DTOs merge                 |
| `0.2-B` Catalog services    | Effective-price history, SKU lifecycle, media metadata/upload confirmation and import dry-run         | Bind draft wizard, media ordering and publish/archive commands                    | Bind public search/list/detail, responsive images and metadata               | Draft → SKU/price/media → publish → anonymous discovery on current `main`               |
| `0.3-A` Inventory contract  | Warehouse/location, reason, allocation, reservation TTL and transfer transition contracts             | Build ports/fixtures for locations, balance, movements, adjustments and transfers | Consume only public availability summary; never expose ledger/cost           | Schema/contract PR first; migration reviewed independently                              |
| `0.3-B` Inventory runtime   | Protected APIs, actor mapping, ledger commands, #81 expiry worker and transfer state machine          | Bind operator commands and conflict/reconciliation states                         | Bind availability/out-of-stock states                                        | Receipt → reserve → transfer → expiry/consume concurrency E2E and ledger reconciliation |
| `0.4-A` Selling contract    | Cart ownership/merge, address, shipping quote, repricing, reservation and order command contracts     | Keep order queue/detail fixture-only; prepare command views from accepted states  | Build cart/address/checkout ports and full recovery states                   | Contract PR before schema/API/UI live work; no client totals are authoritative          |
| `0.4-B` Selling runtime     | Server cart, address, checkout orchestration, idempotent order creation, transitions and outbox       | Bind queue/detail/timeline and permitted order commands                           | Bind live cart/checkout/order history                                        | Browse → cart → checkout → one order/reservation → admin processing E2E                 |
| `0.5-A` Provider decisions  | Payment ADR/adapter contract, shipping policy, notification/outbox policy                             | Build accounting, reconciliation, refund and shipment ports after contracts       | Build redirect/result/retry/tracking states after contracts                  | Sandbox credentials stay private; deterministic fakes remain CI defaults                |
| `0.5-B` Payment/fulfillment | Verified initiation/callback, reconciliation/refund, shipment lifecycle and workers                   | Bind payment/refund/reconciliation plus pick/pack/ship                            | Bind payment result, retry, tracking and notification preferences            | Forged/duplicate/timeout tests plus sandbox purchase → ship → track E2E                 |
| `0.6` Warehouse+            | Supplier/PO/receipt, stocktake, returns/refund linkage and bounded reporting/export                   | Build all operator workflows with keyboard/barcode and permission states          | Build customer return request/status where in V1 scope                       | Purchase/partial receipt, count correction and return effects reconcile to ledgers      |
| `0.8-A` Content/discovery   | Dynamic page/content/tag contracts, #129/#127 runtime, feed and crawler controls                      | Build governed editors, preview, SEO/noindex/nofollow and revision states         | Complete SSR/canonical pages, FAQ/content, structured data and responsive UX | Sitemap/feed/schema parity and crawler/AI-answer audits on staging-like data            |
| `0.8-B` Beta completion     | Import rehearsal APIs, RBAC/audit/system-health gaps and fixture kill switches                        | Complete users/roles/audit/settings/health and empty/error/conflict states        | Complete account/address/order/return and remove production fixtures         | Representative UAT journeys; accessibility/RTL/Jalali/browser matrix                    |
| `0.9` Hardening             | Images/deploy/rollback, telemetry, performance, backups/restore, security and incident tooling        | Operational dashboards and support runbooks; no raw secrets/PII                   | Core Web Vitals, error recovery and production asset verification            | Load/security/failure drills; two-person deploy, restore and rollback evidence          |
| `1.0` Launch                | Migration execution, provider/secrets/monitoring, release and reconciliation                          | Operator smoke, first-order handling and incident verification                    | Customer smoke and critical-journey verification                             | Joint go/no-go, supervised first order, daily stabilization reconciliation and tag      |
| `1.1.0` Expansion           | #141 multi-SMS/payment orchestration, provider health/routing and forward-compatible configuration    | Multi-provider configuration and diagnostics                                      | Provider-neutral customer messages only                                      | Provider failure/failover tests; no V1 critical path dependency                         |

## Per-wave issue split

Every implementation wave is split into these independently reviewable issues/PRs:

1. `D` — decision/ADR when policy, provider, security or money is unresolved;
2. `C` — contract/schema/OpenAPI examples and compatibility notes;
3. `P` — platform service/API/worker with unit, DB and failure-path evidence;
4. `A` — admin port/fixture/view with accessibility and responsive evidence;
5. `W` — customer-web port/fixture/view with accessibility and responsive evidence;
6. `I` — live adapters plus cross-lane E2E on current `main`;
7. `O` — production operations, observability, rollback and acceptance evidence.

`A` and `W` may start after `C` merges and run in parallel with `P`. `I` starts only
after `P` and the relevant client PRs merge. `O` may prepare runbooks earlier but
cannot certify production before `I` passes.

## Exclusive hotspot ownership

| Hotspot                                            | Exclusive editor for a wave          | Consumer rule                                                                      |
| -------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------- |
| `apps/api/prisma/schema.prisma`, new migrations    | Platform                             | UI agents review generated contract impact; never edit shared migrations           |
| `packages/contracts/**`, `apps/api/openapi.json`   | Contract PR owner, normally Platform | UI agents rebase after merge and update ports/fixtures in their own apps           |
| root manifests, lockfile, Turbo/CI/workflows       | Platform/operations issue owner      | Dependency changes are isolated; no feature PR carries opportunistic upgrades      |
| `apps/admin/src/config/navigation.ts`              | Admin lane                           | Merge navigation as the last small admin commit after route ownership is known     |
| web router, app shell and canonical route manifest | User UI lane                         | Discovery/platform consumes the published route manifest; it does not edit layouts |
| shared design tokens/runtime assets                | One named UI owner per PR            | The other UI lane consumes after merge; no simultaneous token rewrite              |
| deployment/secrets/provider configuration          | Platform release driver              | UI receives only capability/status contracts, never raw credentials                |

Before editing a hotspot, the owner posts issue, branch, base SHA, files and expected
merge order. Silence does not imply ownership. If two branches already changed the
same hotspot, stop both integrations and land a small reconciliation PR first.

## Branch and merge train

- Branches use `docs/<issue>-...`, `feat/<issue>-...`, `fix/<issue>-...` from a
  freshly fetched `origin/main`; each agent uses a separate worktree.
- Stacked PRs are allowed only when the dependency is explicit in the PR base and
  description. They are rebased onto `main` after the parent merges.
- Maximum active work per lane: one implementation PR plus one review/unblock task.
- Maximum logical PR size: 400 lines excluding generated artifacts; larger outcomes
  split at service/adapter/integration boundaries.
- Merge train: `D → C → P/A/W (independent order) → I → O`. Protected checks and a
  non-author current-head approval are mandatory; no admin bypass.
- After every merge, the next branch fetches `main`, resolves generated OpenAPI or
  lockfile changes in one owner branch, reruns affected checks and updates factual
  status. Never mark branch-local or fixture behavior as delivered.

## Integration cadence and stop conditions

- Daily async handoff: exact head, files owned, completed checks, blocker and next
  merge dependency.
- At least once per merge wave: compile both UI ports against current contracts and
  run the narrow live adapter tests.
- At gate exit: clean-main lint/typecheck/test/build, DB migration/drift, browser E2E,
  authorization and the domain-specific failure/concurrency/security matrix.
- Stop immediately for an unapproved schema/contract change, secret/PII exposure,
  inventory bypass, arbitrary state assignment, client-authoritative money, payment
  ambiguity, or overlapping hotspot ownership.
- A failing integration does not get patched independently in three lanes. The owner
  first classifies it as contract, platform, admin, web or environment; only that
  lane changes the source of truth and all consumers rebase afterward.

## Integration boundaries

1. Platform publishes DTO/error/state examples before either UI binds a live feature.
2. Admin and user UI depend on `packages/contracts`; they do not import API source or
   Prisma types and do not reproduce domain state machines in components.
3. A UI branch may add a local port/fixture before its API exists. Live wiring is a
   later integration commit/PR after the contract is accepted.
4. The platform may change a contract only with compatibility notes, fixture updates
   and a named migration path for both consumers.
5. Shared hotspots require a visible coordination note before editing:
   `packages/contracts`, root package/lock/config/workflows, `schema.prisma`, migrations,
   OpenAPI, admin navigation, web routing/layout and cross-app design tokens.
6. One PR has one primary lane. A UI PR does not mix API implementation; a platform PR
   does not restyle or restructure UI.

## Predicted collision controls

| Likely collision                                         | Prevention                                                                                                                                            |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin SMS work #133 vs platform SMS contract #118        | Keep #133 stacked/fixture-backed until #118 is corrected and merged; then rebase and run contract parity tests                                        |
| User UI Next.js migration #126 vs discovery runtime #129 | #126 owns rendered pages/routes; #129 owns sitemap projection, robots policy, cache/outbox and IndexNow; coordinate only the canonical route manifest |
| Logging UI vs logging platform #136                      | Platform lands schema, permissioned query API and retention first; admin renders aggregates/search only; user UI exposes at most safe `requestId`     |
| Navigation edits by multiple UI agents                   | Separate admin and web navigation; within each app appoint one branch owner and merge navigation in a final small commit                              |
| Root dependency/lockfile churn                           | No UI-driven major upgrade; isolate dependency alignment in one coordinated PR and rebase both lanes after merge                                      |
| Shared DTO drift                                         | Contract tests and generated examples are the handoff; fixtures compile against the same exported types                                               |

## Required handoff from every UI agent

- issue and exact branch/head SHA;
- screens/routes owned and shared files touched;
- contract version and fixture/live mode;
- loading, empty, validation, forbidden, conflict, offline/upstream, retry and success
  states covered;
- accessibility, responsive and test evidence;
- known API gaps stated as dependencies, not implemented locally as business rules;
- no secrets, sellable fixture facts or production-only endpoints enabled by default.

## Merge order

Contract and policy PRs merge first. Independent admin and user UI PRs can then merge
in either order when they touch separate apps. Live integration follows with focused
contract-parity and E2E PRs. Cross-lane end-to-end acceptance happens only after API,
admin and user behavior are all present on current `main`; branch-local screenshots or
fixtures do not satisfy the integrated gate.
