# Iraniyaragh

Pre-release commerce and warehouse platform for Iranian hardware/fittings retail.

> Status: pre-release commerce integration. Auth, live Catalog/Media discovery,
> protected Inventory HTTP, an authenticated server Cart API, Checkout, Order
> application, Zarinpal Payment with audited manual refund, Fulfillment pick /
> dispatch / tracking, the Admin inventory operations, and the merged Supplier,
> Purchase Order, Purchase Receiving, Audit-log and Shipments read surfaces are
> implemented. Customers Admin is also merged. Staff-created Orders, Stocktake,
> Returns, customer credit accounts (#336), reports/roles, SEO/content routes,
> real SMS.ir and Zarinpal acceptance, production operations and full UAT are
> still open. The current user priority is to integrate what already exists,
> with VPS deployment later. See [`docs/MVP_INTEGRATION.md`](docs/MVP_INTEGRATION.md)
> for the exact scope/gaps and [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md)
> for merged evidence; historical issue #363 is not the current instruction.

## Workspace

- `apps/web` — customer storefront (existing visual prototype preserved here).
- `apps/admin` — custom Persian RTL Next.js/MUI operations application, selectively
  based on the locally licensed Vuexy technical starter with self-hosted assets.
- `apps/api` — NestJS modular-monolith business API.
- `packages/contracts` — shared API/domain contracts.
- `infrastructure/docker` — local PostgreSQL, Redis and MinIO.
- `e2e` — Playwright smoke suite covering the storefront (`web`) and the admin
  panel shells on desktop + mobile viewports, with a strict zero-external-asset
  network gate for both apps.
- `docs` — architecture and delivery roadmap.

## Core architecture

The backend begins as a **modular monolith**. Web, future mobile app and admin panel consume the same versioned API. Domain boundaries are explicit so hot modules can be split later without a rewrite.

The inventory foundation is SKU-based and includes warehouse locations/bins, balances, immutable movements, reservations, inter-warehouse transfers, suppliers, purchase orders and stocktakes.

## Local development

Prerequisites: Node.js 22+, pnpm 10+, Docker.

```bash
cp .env.example .env
docker compose -f infrastructure/docker/docker-compose.yml up -d
pnpm install
pnpm --filter @iranyaragh/api prisma:generate
pnpm --filter @iranyaragh/api prisma:migrate
pnpm dev
```

Run the storefront + admin smoke suite (Playwright, Chromium; builds both apps first):

```bash
pnpm e2e:install   # first time only: download the Chromium browser
pnpm e2e
```

## Engineering baseline

- TypeScript strict mode
- PostgreSQL + Prisma
- Redis for cache/locks/queues
- S3-compatible object storage
- REST `/api/v1` with validated DTOs
- auditability and idempotency for critical operations
- no business logic in controllers/UI
- Docker-first deployability

Start with [`docs/MVP_INTEGRATION.md`](docs/MVP_INTEGRATION.md) and
[`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md). The standing agent rules
are limited to security/data safety in [`AGENTS.md`](AGENTS.md); domain
invariants in `docs/FOUNDATION.md` still protect existing business records.

## Working on the project

The user sets current product and UI priorities. [`CONTRIBUTING.md`](CONTRIBUTING.md)
has local setup notes; `docs/COLLABORATION.md`, `docs/DEVELOPMENT_PLAN.md`
and earlier sprint/agent plans are historical references, not current work rules.
GitHub's protected-branch checks still apply to repository changes.
