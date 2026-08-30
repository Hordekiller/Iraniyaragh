# Iraniyaragh

Startup-ready commerce and warehouse platform for Iranian hardware/fittings retail.

> Status: foundation/prototype. The storefront is currently a static visual prototype;
> most business APIs and the admin application are not implemented yet. See
> [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md) before starting work.

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

Start with `docs/README.md`. The engineering rules in `docs/FOUNDATION.md` are mandatory for future business-critical development.

## Working on the project

This repository is designed for a two-developer team. Before opening a branch:

1. Read [`CONTRIBUTING.md`](CONTRIBUTING.md).
2. Pick or create a GitHub issue with acceptance criteria.
3. Check the ownership and hand-off rules in [`docs/COLLABORATION.md`](docs/COLLABORATION.md).
4. Follow the sprint sequence in [`docs/DEVELOPMENT_PLAN.md`](docs/DEVELOPMENT_PLAN.md).

For the complete product behavior and work breakdown, also read
[`docs/PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md) and
[`docs/EXECUTION_BACKLOG.md`](docs/EXECUTION_BACKLOG.md). Team identities and the
current proposed ownership split are recorded in [`docs/TEAM.md`](docs/TEAM.md).

All changes go through pull requests. Direct pushes to `main` are reserved for
repository recovery only.
