# Contributing to Iraniyaragh

## Before coding

1. Read `docs/FOUNDATION.md`, `docs/PROJECT_STATUS.md` and the relevant domain doc.
2. Work from a GitHub issue with acceptance criteria, owner, priority and area.
3. Confirm no other branch owns the same schema/contract/hotspot.
4. For architecture-invariant changes, agree on an ADR before implementation.

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

Never commit `.env`, credentials, customer information or production exports.

## Branch and commit conventions

Branch format: `<type>/<issue>-<short-topic>` where type is `feat`, `fix`, `docs`,
`chore`, `refactor` or `test`.

Use Conventional Commit subjects:

```text
feat(inventory): add idempotent stock receipt
fix(auth): revoke rotated refresh token
docs(orders): record cancellation policy
```

Keep commits reviewable. Do not rewrite or edit a shared/applied migration; create a
new forward migration.

## Required checks

Run the checks relevant to changed work before opening a PR:

```bash
pnpm lint
pnpm typecheck
pnpm build
```

Run unit/integration/E2E tests as those harnesses are introduced. A missing test
script is current technical debt, not permission to merge critical logic untested.

## Pull requests

- Link the issue using `Closes #123` when merge should close it.
- Explain behavior, design decisions, test evidence and migration/API impact.
- Include screenshots/video for UI changes.
- Mark risk areas and provide rollback/forward-fix instructions where relevant.
- Self-review the diff before requesting the other developer's review.
- Keep docs, OpenAPI/contracts and migrations in sync with behavior.

Draft PRs are encouraged for early contract/design feedback. They are not merged.

## Definition of Done

A change is done only when acceptance criteria pass, CI is green, required review
is complete, tests cover important behavior/failures, authorization/audit/
idempotency are addressed where applicable, documentation is current, and the
author verifies the merged result in the target environment.

See `docs/DEVELOPMENT_PLAN.md` for the complete acceptance matrix and release gates.
