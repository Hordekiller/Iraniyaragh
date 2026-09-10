# Independent Agent Workstreams

Status: active coordination contract; reviewed 2026-09-09.

This file keeps three implementation lanes independently productive without allowing
UI branches to redefine business truth or silently collide in shared hotspots.

## Lanes

| Lane | Owns | Must not own |
| --- | --- | --- |
| Platform/current | API services, persistence, contracts, workers, providers, discovery runtime, telemetry and operations | Admin/customer presentation |
| Admin agent | `apps/admin` pages, components, accessible operator states and contract adapters | API policy, Prisma, migrations, provider secrets, audit/log storage |
| User UI agent | `apps/web` presentation, responsive/accessibility behavior and contract adapters | Price/stock/order authority, API policy, admin surfaces, telemetry internals |

Each lane works from its own issue, branch and worktree. UI lanes may remain fixture-
backed, but fixtures must implement an explicit port matching an accepted contract and
must fail closed in production. Fixture behavior is never reported as delivered live
capability.

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

| Likely collision | Prevention |
| --- | --- |
| Admin SMS work #133 vs platform SMS contract #118 | Keep #133 stacked/fixture-backed until #118 is corrected and merged; then rebase and run contract parity tests |
| User UI Next.js migration #126 vs discovery runtime #129 | #126 owns rendered pages/routes; #129 owns sitemap projection, robots policy, cache/outbox and IndexNow; coordinate only the canonical route manifest |
| Logging UI vs logging platform #136 | Platform lands schema, permissioned query API and retention first; admin renders aggregates/search only; user UI exposes at most safe `requestId` |
| Navigation edits by multiple UI agents | Separate admin and web navigation; within each app appoint one branch owner and merge navigation in a final small commit |
| Root dependency/lockfile churn | No UI-driven major upgrade; isolate dependency alignment in one coordinated PR and rebase both lanes after merge |
| Shared DTO drift | Contract tests and generated examples are the handoff; fixtures compile against the same exported types |

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
