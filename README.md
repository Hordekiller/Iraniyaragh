# Iraniyaragh

Persian commerce, warehouse and custom-door ordering platform.

The source includes the public Next storefront, protected Admin, catalog/media,
SKU inventory and order/payment foundations, campaigns/coupons, custom-door
configuration with full final payment, isolated customer/staff sessions and governed
blog publishing. Newsletter subscription/delivery remains a **plan**, with an honest
unavailable state in the storefront.

Start with [current state](docs/CURRENT_STATE.md), the [documentation index](docs/README.md),
[operations](docs/OPERATIONS.md) and [testing](docs/TESTING.md). A merged change, a green
CI run and a published image do not independently prove deployment or real provider
acceptance. Read the actual runtime SHA and release evidence before making that claim.
Historical issue/branch snapshots and sprint plans remain available for traceability.

## Workspace

- `apps/web` — customer React storefront with accepted Next.js public rendering;
  the Nest API remains the sole catalog/commerce authority.
- `apps/admin` — custom Persian RTL Next.js/MUI operations application, selectively
  based on the locally licensed Vuexy technical starter with self-hosted assets.
- `apps/api` — NestJS modular-monolith business API.
- `packages/contracts` — shared API/domain contracts.
- `infrastructure/docker` — PostgreSQL, Redis and object storage (local MinIO; deployed RustFS).
- `e2e` — Playwright smoke suite covering the storefront (`web`) and the admin
  panel journeys on desktop + mobile viewports, with self-hosted runtime assets
  and the explicitly approved Enamad trust-seal request exception.
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
