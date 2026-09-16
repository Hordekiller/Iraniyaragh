# Execution Status and Handoff

Last reviewed: 2026-09-16

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

| Gate                  | State                              | Current evidence                                                                                                                                                                                                                                                                                                                                                                                          | Exit blocker                                                                                                                             |
| --------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `0.1` Foundation/Auth | Acceptance closed                  | Auth runtime merged (#48/#49/#74/#50); #50/#91 closed 2026-09-11; #78 working agreement closed 2026-09-12 via #172                                                                                                                                                                                                                                                                                        | private #114 acceptance                                                                                                                  |
| `0.2` Catalog         | Integrated foundation              | Catalog/media, public discovery and admin authoring merged through #223–#229 | Final publish-to-discovery E2E and operational acceptance |
| `0.3` Inventory       | Protected HTTP foundation          | #222 warehouse/location, balances, movements, adjustments and transfers; #231 availability; #232 expiry batching | Checkout allocation, reconciliation UI and worker rollout |
| `0.4+` Commerce       | Not started as an integrated slice | Schema/state helper only                                                                                                                                                                                                                                                                                                                                                                                  | Policies and all application/client workflows                                                                                            |

## Active merge/review queue

| Priority | Work                                 | State                                                                                                                                                         | Required reviewer focus                                                                                                                                                                                                             | Exit action                                                                                                                |
| -------: | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
|        1 | Issue #78                            | Closed 2026-09-12                                                                                                                                             | agreement recorded in `TEAM.md`, effective 2026-09-11                                                                                                                                                                               | Merged #172 delivers the accepted agreement; #78 closed                                                                    |
|        2 | Issue #114                           | Private acceptance                                                                                                                                            | #154 merged with no secret/PII exposure and fail-closed mutations                                                                                                                                                                   | Provision account/line/template/key; controlled sandbox/live evidence                                                      |
|        3 | Issue #111 (mutation idempotency)    | Merged                                                                                                                                                        | contract #168 + runtime #171 + admin workflow #173 merged                                                                                                                                                                           | Bounded cleanup worker remains on #81 before production                                                                    |
|        4 | Issue #176/#178 (variants/import)    | `C` + `P1` + `P2` + `P3` merged                                                                                                                               | policy ADR-0013 (#177) + `C`-wave contract (#179) + P1 schema/migration (#180) + P2 mutation services (#181) + P2 configuration/generation (#182) + P3 parser/exporter (#183) + P3 staged import service (#184) merged; #176 closed | A/W/I binding, each ≤400 lines and reviewed; P3 follow-ups (durable parsed-payload storage, decompression-time size guard) |
|        5 | Discovery ready items #126/#129/#136 | Backlog (platform)                                                                                                                                            | server-rendered pages, sitemap/robots/IndexNow and telemetry                                                                                                                                                                        | Pick up as platform capacity opens and wave 0.2-A is delivered                                                             |
|        6 | Admin catalog slice (#166)           | Merged via #229 (`0a7faba`) with catalog detail, attributes, variants and import management | Continue only with bounded publish/E2E follow-ups; no duplicate admin rewrite | Bind publish controls to live media/catalog contracts |

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
  independent review. #213 (SonarCloud external-bucket definition) remains open
  on the GitHub side.
- The 2026-09-11/13 review items (Auth acceptance, catalog P-wave, #217 API) were
  already reflected in the previous snapshot; the latest one is `e67b26e`.

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

## Next 10 working-day plan

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

## Ready queue after the checkpoint

1. Accept the image/video policy decisions in `PRODUCT_MEDIA_SPEC.md`, then deliver
   its conflict-safe M1–M5 slices; media remains planned until runtime evidence exists.
2. Catalog price contract and API.
3. Catalog admin draft-to-publish flow.
4. Public product detail and storefront integration.
5. Inventory HTTP contract with authenticated actor mapping.
6. Warehouse/location CRUD and read-only balances/movements.
7. Reservation expiry batching (#81), then worker design.
8. Transfer policy/state contract.
9. Cart/guest/merge and reservation-allocation decisions before `0.4` coding.

## Reconciliation — live catalog discovery slice (2026-09-16)

`main` now contains the Product Media M1–M4 runtime and the storefront catalog
provider is wired to the public Catalog HTTP API by default. The explicit
`VITE_FIXTURE_CATALOG=true` flag remains available for deterministic local/E2E
fixtures only. Public product list/detail projections expose a nullable
`startingPrice` derived from active variants and the live adapter maps media and
prices without fabricating stock; availability remains `UNKNOWN` until Inventory
HTTP is integrated. The remaining exit gap is the end-to-end Admin publish →
public discovery verification against a running API, followed by Inventory
availability and server-side Cart/Checkout.

## Explicitly not ready

- Payment implementation before provider/verification/refund decisions.
- Checkout before server pricing, availability and reservation contracts.
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
Issue / branch / base SHA: #166 / feat/admin-catalog-crud @ 602c5ae (local tree,
  not pushed); coordination on #166/#178. main is now 5e34936 (incl. #217).
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

- Live production staff/customer Auth acceptance and delivery of the accepted SMS
  provider/admin boundary through #114/#115.
- Server-side permission enforcement for every business command.
- Integrated catalog, inventory, cart, checkout, order and payment journeys.
- Verified/idempotent payment and reconciliation.
- Outbox/workers and reservation expiry.
- Production deploy/rollback, monitoring/alerts, backup/restore and RPO/RTO evidence.
