# ADR-0034: Preserve supported dependency families through V1 release

Date: 2026-10-28. Status: applies the owner's explicit V1 scope decision.
Related: #77, #470, #478. Review: after V1 acceptance or 2026-11-28, whichever comes first.

## Decision

Keep Node 22, pnpm 10.15, TypeScript 5.9, Nest 11, Prisma 6, MUI 7,
React 19, Next 16, Vite 7 and Vitest 4 for the current release. Compatible
updates #470/#478 passed required checks and are deployed at `92b23a4`.
This is a bounded delivery freeze, not an assertion that all advisory alerts
are resolved or that dependency upgrades are never necessary.

Breaking upgrade candidates are deferred under #77 rather than merged during
this freeze. This also includes the current 0.x class-validator and
eslint-plugin-react-refresh family changes. The API's Playwright minor upgrades
must be paired with the PDF worker's browser image; E2E Playwright packages
remain a separate matched pair. Compatible patch/minor review continues.

The existing configuration groups compatible minor/patch updates and keeps
Prisma CLI/client together. This decision adds no blanket Dependabot ignore
rule: such rules can also affect security update proposals. New breaking
version PRs must be triaged against #77, while security updates remain visible.

Security alerts, dependency review, production audit, CodeQL and Sonar remain
enabled and required. A demonstrated release-critical vulnerability is handled
through a focused compatible fix or an explicitly reviewed migration with all
required checks; the freeze cannot turn a failed security gate into a pass.

## Separate upgrade work

- Prisma CLI/client migrate together with schema, generator, seed and rollback
  verification; no Prisma 7 CLI against a Prisma 6 schema.
- Nest/Swagger changes need API/OpenAPI/security contract checks. MUI/React UI
  changes need RTL, accessibility and browser acceptance. Vite/Vitest/TypeScript
  changes need decorator/module/coverage verification across all packages.
- API Playwright and the PDF browser image move together, with private render,
  sandbox, artifact and retry tests. They must not silently follow E2E tooling.
- Each independently reversible slice requires clean install, lint, typecheck,
  units, PostgreSQL, build, browser and security checks on its exact head.

Deferred candidates are retained in #77 rather than left as apparently active
V1 release blockers. This decision does not approve their implementation or
invent an independent review; current engineering review is by the implementing agent.

Reference: [GitHub dependency update controls](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/manage-your-dependency-security/controlling-dependencies-updated).
