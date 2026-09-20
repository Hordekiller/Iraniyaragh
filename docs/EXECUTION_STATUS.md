# Execution Status and Handoff

Last reviewed: 2026-09-20

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
- Use the complete three-lane wave map and `D/C/P/A/W/I/O` merge train in
  `AGENT_WORKSTREAMS.md`; Platform, Admin and User UI never share a dirty worktree.

## Current position

| Gate                  | State                                 | Current evidence                                                                                                                                                  | Exit blocker                                                                            |
| --------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `0.1` Foundation/Auth | Acceptance closed                     | Auth runtime merged (#48/#49/#74/#50); #50/#91 closed 2026-09-11; #78 working agreement closed 2026-09-12 via #172                                                | private #114 acceptance                                                                 |
| `0.2` Catalog         | Integrated foundation                 | Catalog/Admin/public discovery plus Product Media M1–M5 are merged through #240, including the real-infrastructure API publish-to-discovery E2E                   | Admin-UI publish acceptance, video processing and production storage/scanner acceptance |
| `0.3` Inventory       | Protected HTTP foundation             | #222 inventory HTTP, #231 availability, #232 expiry batching and #246/#237 Checkout allocation are merged                                                         | Admin operator UX, compensation/reconciliation UI and worker rollout                    |
| `0.4` Commerce        | Server Cart + live customer lifecycle | #235/#239/#241–#244/#251 authenticated Cart, #270/#269 Guest Cart, #246/#237 Checkout-to-reserved-Order, #247/#238 Order reads and #268 authenticated Web binding | Anonymous Web handoff, commands, Payment and compensation                               |
| `0.5+`                | Not started as integrated gates       | Payment/Fulfillment persistence foundations only                                                                                                                  | Application workflows, provider evidence and all production operations                  |

## Active issue queue

| Priority | Work                                   | State                                                                                                 | Required reviewer focus                                                                                            | Exit action                                                                        |
| -------: | -------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
|        1 | Guest Cart Web binding                 | #270 closes #269 with the merged API/data/security runtime; #268 authenticated Web commerce is merged | Bind anonymous ownership and low-friction OTP recovery in Web                                                      | Keep the Web follow-up independently reviewable; Cart exit needs browser evidence  |
|        2 | Issue #237 / PR #246                   | Complete/merged                                                                                       | independently approved serializable Checkout, privacy-safe contracts, DB constraints, rollback and replay evidence | Closed by protected squash merge `b53de29`                                         |
|        3 | Issue #238 / PR #247                   | Complete/merged                                                                                       | independently approved ownership/IDOR, staff permission, bounded queries and persistence-safe DTOs                 | Closed by protected squash merge `b220e01`                                         |
|        4 | Issue #114                             | Private production acceptance                                                                         | adapter/runtime exists; no secret/PII exposure and mutations fail closed                                           | Provision account/line/template/key; controlled provider-backed evidence           |
|        5 | Discovery #126/#129 and telemetry #136 | Ready/backlog                                                                                         | server-rendered pages, sitemap/robots/IndexNow and telemetry                                                       | Parallel work only when it does not displace the commerce critical path            |
|        6 | Issue #213                             | External admin confirmation open                                                                      | current PRs execute real Sonar scans and Quality Gates; `sonar` is not a required branch-protection context        | SonarCloud admin clears/confirms organization suspension, then protect the context |

## Resolved since the 2026-09-14 review

- The 2026-09-16 integration wave merged #229 (`0a7faba`) for Admin Catalog
  detail/attributes/variants/import, #231 (`e49444f`) for the public variant
  availability summary, and #232 (`40399b4`) for bounded, serializable
  reservation-expiry batching with race-safe rechecks. CI, database, E2E and
  SonarCloud gates are green for these merges.

- `main` advanced from `0091808` to `e67b26e`. The protected inventory
  balance/adjustment API (#217, `5e34936`) is joined by the declared error-code
  wiring and real `getRequestId()` binding shipped via #219 (`f7eb9a7`),
  resolving the five declared-but-unemitted code follow-ups tracked on #215.
- The catalog attribute-detail endpoint split PR #214 was merged to `main` at
  `0091808` (variant-contract typing parity + `GET /catalog/admin/attributes/:id`,
  OpenAPI regenerated and drift-clean); the admin UI slice under #166 can now
  rebase on `main`.
- Closure wave on 2026-09-15: #212 (SonarCloud workflow truthfulness) merged at
  `44d2262`; #211 (media M1 plan) merged at `c8790b6`; #216 (storefront coverage
  gate) closed as delivered with #207 evidence; #186/#188 closed via #190/#195;
  #189 closed via #199/#200; #218 (`e67b26e`) reconciled `PROJECT_STATUS.md` and
  `REPOSITORY_WORKFLOW.md` to current `main` (incl. #217/#219/#213) after
  independent review. #213 remains open for SonarCloud organization-admin
  suspension confirmation; repository scans themselves are currently operational.
- The 2026-09-11/13 review items (Auth acceptance, catalog P-wave, #217 API) were
  already reflected in the previous snapshot; the latest one is `e67b26e`.

## Reconciliation — Product Media and Cart slices (2026-09-17)

Merged `#227` (`d4d8a95`) was docs-only despite its title. The actual M4 gallery,
player and structured data plus the M5 real-infrastructure journey subsequently
merged through #240 at `ce04cce`; they are now on `main`.

Verified for the merged slice: web 343/343 tests, API 690 tests, `api-http` M5 E2E 6/6
against real PostgreSQL, Redis, MinIO and the BullMQ media worker; the CI `e2e`
job now starts MinIO, provisions the bucket and runs the worker. Evidence and the
open contract gaps (video pipeline, `catalog.publish`, 15 vs 30-minute TTL,
publish readiness weaker than spec §9) are recorded in `docs/MEDIA_M5_EVIDENCE.md`.
A real runtime defect is also fixed there: missing `esModuleInterop` made
`sharp`/`exceljs` default imports `undefined`, so no image upload could reach
`READY`.

Cart contracts (#235), explicit User↔Customer ownership (#239), persistence
(#241), authenticated read/add (#242), remove (#243) and absolute set (#244) are
joined by #251 authenticated Cart correctness. #270 closes #269 with opaque-token
Guest Cart ownership, rolling expiry, abuse limits, bounded cleanup and audited
OTP-login merge. #268 binds the authenticated Web Cart, Checkout and customer Order
lifecycle to the live APIs; anonymous Web ownership and OTP merge recovery remain.
Address/shipping quote,
reservation/Order creation and outbox persistence are delivered by #246/#237;
dispatch and compensation are not.

## Team disposition ledger — 2026-09-08 (updated 2026-09-11)

| Item      | Disposition                | Accountable / reviewer     | Next action                                                         | Closure condition                                                      |
| --------- | -------------------------- | -------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| PR #112   | Complete/merged            | Hordekiller / Maddyrampant | Use the merged status/roadmap baseline                              | Independent approval and protected merge completed                     |
| Issue #79 | Complete/closed            | Hordekiller / Maddyrampant | Implement #114, then #115; provision account/line/key privately     | ADR-0011 accepted via merged #116                                      |
| Issue #78 | Complete/closed 2026-09-12 | Hordekiller / Maddyrampant | Merged #172 records the accepted agreement with effective date      | #78 closed; milestone sizing uses the lower confirmed capacity         |
| Issue #51 | Complete/closed            | Hordekiller / Maddyrampant | Routine dependency maintenance only                                 | Already satisfied by merged #52 and protected supply-chain gates       |
| Issue #91 | Complete/closed 2026-09-11 | Hordekiller / Maddyrampant | DoD 7/7 ticked with merge evidence; close-out recorded in the issue | Remaining Sprint 1 outcomes have merged evidence, now all met          |
| Issue #50 | Complete/closed 2026-09-11 | Maddyrampant (product)     | Screenshot/a11y evidence #160 merged; issue closed                  | All 8 acceptance items met and verified                                |
| PR #11    | Complete/merged            | Hordekiller / Maddyrampant | Continue residual admin hardening only in its assigned later gates  | #9/#10 review and ADR-0004 acceptance already provide closure evidence |

Blocked decision issues do not authorize guessed business choices. They block the
related release/production gate while deterministic local implementation may proceed.

## Superseded 2026-09-11 ten-day plan (historical)

The following dated plan is retained as delivery history and is not the active
queue. Its Catalog/Media/Inventory tasks have since advanced as recorded above.

> **Checkpoint 2026-09-11:** the Days 1–4 items below that concerned #50/#91
> acceptance (password-denial order, rotation/other-family revocation, single
> bootstrap, OpenAPI/AUTH_CONTRACT reconcile and deliberate #49 splitting) are
> completed — both issues were closed with 7/7 DoD merge evidence. The
> provider-backed customer happy path stays gated on private #114 activation, now
> the sole remaining Auth acceptance item.

### Days 1–2 — close Auth acceptance and coordination

- Treat merged PR #109 and closed #49 as the privileged-Auth evidence baseline.
- Verify password change never logs/persists raw credentials.
- Verify fresh-auth denial order, current-family rotation and other-family revocation.
- Verify two concurrent bootstrap attempts yield one administrator.
- Reconcile OpenAPI and `AUTH_CONTRACT.md` against actual endpoint behavior.
- Keep any work beyond closed #49 in separate, sized issues; do not reopen its
  completed scope implicitly under a broad “Auth complete” statement.

Exit: remaining #50/#91 gaps are closed or split into owned follow-ups. The
provider-backed happy path stays explicitly gated on private #114 activation.

### Days 2–4 — close Sprint 1 acceptance

- Map #50 and #91 acceptance checkboxes to a commit/test/PR; retain #49 as closed evidence.
- Run clean-main quality, database and E2E gates.
- Confirm customer OTP fixture tests and live API tests are described separately.
- Decide #78; treat accepted ADR-0011 and closed #79 as the provider baseline.
  #115/#151 UI and #114/#154 read-only environment projection are merged; #114 now
  owns private provider-bound acceptance. A writable secret manager requires a named
  deployment-backend decision and is not inferred by application code.
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

## Current 10 working-day direction

1. Treat #251 as the merged customer Cart correctness baseline, #270/#269 as the
   merged Guest Cart API/security baseline and #268 as the authenticated Web
   baseline; bind anonymous Cart plus OTP merge with ownership, expiry and
   failure-recovery evidence.
2. Treat merged #246/#237 as the atomic Checkout → reservation → immutable
   Order/outbox-persistence baseline.
3. Treat merged #247/#238 customer Order queries and permissioned Admin queue/detail
   as the read baseline; track expiry/cancellation compensation as a separate
   critical mutation slice.
4. Keep production SMS acceptance (#114), media storage/scanner acceptance and
   Inventory operator/worker readiness as explicit parallel acceptance work.
5. Do not start Payment implementation until merged #246/#237 and #247/#238
   establish Order authority and the provider/verification/refund decision is recorded.

## Ready queue after the checkpoint

1. #251 closes operation-scoped retention, side-effect-free reads and concurrent
   quantity/line-limit safety for authenticated Cart mutations.
2. Use merged #270/#269 as the guest token/TTL and explicit login-merge authority.
3. Bind anonymous Web Cart and the OTP merge handoff; authenticated Cart is already
   live through #268 and fixtures remain explicit test/development adapters only.
4. #246/#237 is merged: address validation, server shipping quote, Checkout
   repricing, deterministic allocation/reservation, immutable Order snapshot and
   transactional outbox persistence have PostgreSQL evidence.
5. #247/#238 is merged: customer Order list/detail and permissioned Admin
   queue/detail/timeline are the read baseline; keep expiry/cancellation
   compensation separately scoped.
6. Then start one verified Payment provider, Fulfillment and transactional
   notifications; do not infer these from persistence tables.
7. Run production media/storage/scanner acceptance and Inventory worker/operator UX
   in parallel without displacing the commerce dependency chain.

## Reconciliation — live catalog discovery slice (2026-09-16)

`main` now contains Product Media M1–M5 and the storefront catalog
provider is wired to the public Catalog HTTP API by default. The explicit
`VITE_FIXTURE_CATALOG=true` flag remains available for deterministic local/E2E
fixtures only. Public product list/detail projections expose a nullable
`startingPrice` derived from active variants and the live adapter maps media and
prices without fabricating stock; public Inventory availability is integrated and
fails closed. The API-level real-infrastructure publish → discovery journey is
merged via #240. An Admin-UI-driven publish acceptance journey remains open. The
server Cart API and #246/#237 authenticated Checkout preview plus atomic
reserved-Order creation are merged. #268 binds authenticated Web Cart/Checkout/
Orders to those APIs; anonymous Cart/OTP merge remains the next Web slice.
#247/#238 Admin Order reads are merged; their live Admin consumer remains open.

## Explicitly not ready

- Payment implementation before provider/verification/refund decisions.
- Checkout UI before the merged server-owned #246/#237 runtime is consumed through
  a real client and its failure states are designed.
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

## Handoff — Admin catalog slice (2026-09-14)

```text
Issue / branch / base SHA: #166 / feat/admin-catalog-crud @ 602c5ae (historical
  local handoff, not pushed); coordination on #166/#178. `main` at that handoff
  was 5e34936 (incl. #217).
Owned files and shared hotspots: apps/admin catalog views/routes/lib (see the #166
  note); shared: packages/contracts/src/catalog.ts (ProductVariant attributeValues →
  VariantAttributeValue[]; ProductVariantUpdateRequest flat dimensions),
  apps/api catalog controller/service/spec + openapi.json (GET /admin/attributes/:id)
  — carried identically on the open split PR #214 (rebased to bcf3864).
Contract or decision used: packages/contracts catalog types; serialization checked
  against catalog.service variantResponse/productVariantPrivateDetail.
Implemented and intentionally excluded: attribute list/create/edit/options UI,
  import upload/dry-run/commit UI, product detail + variant generate/edit/price.
  Excluded: pricing, media, live storefront.
Migration/data impact: none (no Prisma/migration change).
Security/authorization/audit impact: permission gates canReadCatalog/canWriteCatalog
  on every catalog route; import commit requires canWrite; DialogCloseButton gained
  optional disabled (a11y). New endpoint guarded by MFA + catalog.read.
Commands run and exact result: contracts typecheck pass; admin lint+build+400 tests
  pass; web lint+build pass; api lint+build pass; api catalog unit + openapi
  drift/regenerate spec 18/18 pass. Isolated post-#214-base verification re-confirmed
  contracts/admin typecheck, admin lint and 400 admin tests.
Manual scenarios checked: variant-generation axis load / selection / preview
  2000-cap; attribute options add/toggle; import upload → dry-run report → guarded
  commit.
Known failures or follow-ups: #214 merged first (owner), then rebase slice on main
  (routine conflict-free, verified ahead) and open the admin UI PR. Division of
  docs handled here: EXECUTION_STATUS/PROJECT_STATUS via #194; the admin PR carries
  apps/admin code only.
Reviewer focus: ProductVariant typing parity, ProductVariantUpdateRequest shape,
  OpenAPI for GET /admin/attributes/:id, no Prisma exposure.
```

## Release blockers

- Live production staff/customer Auth acceptance through private provider-bound
  #114 evidence; the provider/admin runtime boundary itself is merged.
- Server-side permission enforcement for every business command.
- Live Web Cart/Checkout plus customer/Admin Order and Payment journeys; the
  authenticated Checkout-to-reserved-Order API is merged but has no live client,
  and the merged #247/#238 API still has no live Web/Admin read clients.
- Verified/idempotent payment and reconciliation.
- Transactional outbox dispatch and production worker operations; merged #246/#237
  persists `ORDER_CREATED` atomically and reservation-expiry batching is
  merged.
- Production deploy/rollback, monitoring/alerts, backup/restore and RPO/RTO evidence.
