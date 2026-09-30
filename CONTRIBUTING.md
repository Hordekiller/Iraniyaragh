# Working with Iraniyaragh

The current product priority and UI direction are set by the user. Older sprint,
issue-order and contributor-lane documents are historical context; they do not
override a newer request. The factual implementation record is
`docs/PROJECT_STATUS.md`.

## Local setup

Requirements: Node.js 22+, pnpm 10+, Docker with Compose.

```bash
cp .env.example .env
docker compose -f infrastructure/docker/docker-compose.yml up -d
pnpm install
pnpm --filter @iranyaragh/api prisma:generate
pnpm --filter @iranyaragh/api prisma:migrate
pnpm dev
```

The Compose file is for local development. Its example passwords, published
database/cache ports and `minio:latest` are not a VPS production deployment.
The development seed is intentionally blocked outside development/test and
includes demo data; it must not be run on a live sales database.

## Security and verification

The standing agent rules are in `AGENTS.md`; detailed identity and financial
safety requirements are in `docs/SECURITY.md` and `docs/FOUNDATION.md`.
Available checks include `pnpm lint`, `pnpm typecheck`, `pnpm build`, package
tests and the PostgreSQL-backed API integration suite. Record what actually
passed; do not describe an untested provider, browser journey, backup or VPS
deployment as accepted.
