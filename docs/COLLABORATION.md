# Two-Developer Collaboration Guide

## Purpose

Two people must be able to work in parallel without duplicating business logic or
blocking each other. GitHub issues are the task source of truth; repository docs
are the architecture and process source of truth; the API and database are the
business source of truth.

## Default ownership split

Use tracks, not permanent silos. Swap reviewer/implementer roles periodically so
both developers understand critical paths.

| Area | Developer A — Platform track | Developer B — Product track |
| --- | --- | --- |
| Primary | API, domain services, Prisma, migrations, queues, infrastructure | Web/admin UX, routing, state, forms, API integration, E2E |
| Secondary | Review UI architecture and API consumption | Review contracts, acceptance tests and migration effects |
| Shared | Contracts, security-sensitive flows, release, incident response | Contracts, security-sensitive flows, release, incident response |

Until the second GitHub username is known, assignments use `Developer A` and
`Developer B`. Record actual names in the GitHub issue assignee field, not by
hardcoding personal identity throughout source files.

## One issue, one owner, one reviewer

Every implementation issue must have:

- one accountable owner;
- the other developer as reviewer for business-critical changes;
- scope and explicit out-of-scope notes;
- acceptance criteria that can be demonstrated;
- test expectations;
- dependencies and migration/API impact labels.

If both people must code, split it into a contract issue followed by two dependent
issues. Do not have two branches editing the same endpoint or component blindly.

## Contract-first hand-off

For a vertical feature such as product creation:

1. Agree on behavior, permission, stable error codes and acceptance scenarios.
2. Developer A opens a small contract/schema PR if the boundary changes.
3. After contract review, API and UI work proceed in parallel using fixtures or
   mock handlers based on the accepted contract.
4. Integration is completed behind a feature flag when partial rollout is risky.
5. Developer B owns the end-to-end acceptance scenario; Developer A owns data and
   transaction correctness.

Do not share Prisma models directly with clients. `packages/contracts` may share
public types, but the OpenAPI document is the externally testable API contract.

## GitHub flow

- Protected branch: `main`.
- Short-lived branches from current `main`.
- Naming: `feat/123-product-crud`, `fix/245-reservation-race`,
  `docs/88-payment-flow`, `chore/31-ci-cache`.
- Rebase or merge current `main` before final approval if the branch is stale.
- Prefer squash merge so one issue produces one coherent commit on `main`.
- Delete the branch after merge.
- Never mix formatting-wide changes with feature logic.

Recommended PR size is under 400 changed logical lines. Generated migrations,
lockfiles and snapshots are excluded. Larger changes need an explanation and a
review map in the PR description.

## Review rules

The reviewer checks behavior, failure paths and maintainability—not only syntax.

Mandatory second-person approval applies to:

- migrations and data repair scripts;
- authentication, authorization, secrets and PII handling;
- inventory, order and payment state changes;
- CI/CD, production configuration, backup and restore;
- changes to engineering invariants or public API contracts.

Author self-review is required before requesting review. Resolve discussions with
a code/doc change or an explicit decision; do not silently dismiss them.

## Avoiding conflicts

- Announce ownership by assigning the issue before coding.
- Comment on the issue when touching a shared hotspot such as Prisma schema,
  root configuration, shared contracts or the main navigation.
- Merge foundational contract/migration PRs before dependent UI/API branches.
- Keep migrations append-only once shared. Never edit a migration another person
  may already have applied; add a corrective migration.
- Use feature modules and small components; avoid turning root files into shared
  editing bottlenecks.

## Working rhythm

For a two-person part-time/full-time team, keep process lightweight:

- Start of week (30 min): select sprint goal, capacity and dependencies.
- Daily async note: yesterday / today / blocker / contract changes.
- Midweek (20 min): integration check, not a status ceremony.
- End of week (45 min): demo from staging, close accepted issues, update status.
- End of sprint: retrospective with one concrete process improvement.

Blockers affecting the other track are communicated immediately. A blocked issue
should be split or re-scoped within one working day.

## Decision policy

- Reversible local choice: issue/PR discussion is enough.
- Cross-module or long-lived architecture choice: add an ADR.
- Scope/timeline/business-policy choice: record a dated decision in the issue and
  update the development plan if it changes delivery.
- Security or financial ambiguity: stop implementation until resolved.

## Merge and release ownership

The feature author owns it through staging verification, not merely until merge.
For each release, one person is release driver and the other is verifier. Rotate
these roles. The driver prepares notes/deploy/rollback; the verifier runs smoke and
reconciliation checks independently.
