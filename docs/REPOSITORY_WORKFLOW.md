# Canonical PR, Review and Merge Workflow

Reviewed: 2026-09-25
Applies to: all contributors and agents

## Repository protection and merge policy

On 2026-09-25 the GitHub API returned 404 (`Branch not protected`) for
`/branches/main/protection` and an empty list for `/rules/branches/main`.
The protection settings observed on 2026-09-15 are therefore historical, not
currently enforced. Until protection is restored, apply the following checks
and review gates manually for every PR and do not push directly to `main`:

- Required checks are exact contexts: `quality`, `database`, `e2e`,
  `dependency-review`, `Analyze (actions)`, `Analyze (javascript-typescript)`
  and `production-audit`. Sonar is also a manual merge gate for internal PRs;
  #212 is merged and these PRs run real scans and Quality Gates. Issue #213
  remains open for SonarCloud organization-admin confirmation.
- The checks listed above must be green on the exact head, including a real
  Sonar scan for an internal PR; a skipped check is not evidence of success.
- Resolve every review conversation, obtain the independent review required for
  sensitive work, and use a squash merge after confirming no conflicts.
- Restoring enforced branch protection with these gates is an operations gap;
  no PR may claim that GitHub enforced them while the API reports no protection.

Do not self-approve sensitive work or merge a skipped check as if it passed.

### Single-developer review handoff

The delivery owner implements one product PR at a time. Independent review for
critical domains still applies; the reviewer does not implement a parallel
product slice. For each sensitive PR:

1. The implementer makes the final push and waits for every required check.
2. A qualified independent reviewer examines the exact head and records approval
   or actionable findings. The implementer does not self-approve sensitive work.
3. Freeze the branch after final approval; if changes are needed, rerun CI and
   review on the new head.
4. Do not use empty commits or repeated rebases to repair attribution.

This independent-review requirement is a repository workflow policy, even if
GitHub does not enforce an approving review. If a reviewer is unavailable,
leave the PR open and do not start the next product slice.

## PR state machine

```text
DRAFT → IMPLEMENTATION → LOCAL VERIFICATION → PUSH → CI
  → INDEPENDENT REVIEW → (changes? fix/push/CI/review latest SHA)
  → APPROVED LATEST SHA → FREEZE → MERGE
```

Approval is valid only for the final reviewable SHA. Any new reviewable push
(including a rebase) must be treated as requiring fresh approval and fresh
checks. After final approval, make no code push. If a change is unavoidable,
reopen the review cycle explicitly.

## Roles and dependencies

Every PR declares OWNER, IMPLEMENTER, REVIEWER and INTEGRATION OWNER. Auth,
RBAC, migrations, money, inventory, checkout, orders, payment and financial
changes require an independent code-owner review.

Dependent PRs must state `Depends on #N` in the body. Review early if useful but
label it preliminary. Merge the dependency first, update the dependent branch
once, resolve semantic conflicts, run all checks, freeze and request final review
on that exact SHA. Do not repeatedly rebase while dependencies are moving.

## SonarCloud truthfulness

The Sonar workflow must expose `SONAR_TOKEN` at job scope so its condition can
read it. Trusted pushes/internal PRs must fail when the secret is absent; fork PRs
may skip because GitHub withholds secrets, but that skip must be visible and must
not be a successful required context. A scan is successful only when the scanner
uploads the exact commit/PR and reports Quality Gate status. Distinguish scanner,
account/org suspension and Quality Gate failures. Never change application code,
coverage thresholds or valid PostgreSQL to hide an infrastructure problem.

#212 (Sonar token at job scope) is merged and trusted internal PR scans now upload
the exact head and enforce the Quality Gate. #213 remains open until an organization
admin confirms the suspension banner is cleared. Restore branch protection with
the listed contexts, including `sonar` after account confirmation, and verify the
rules on a test PR. The current absence of required contexts is a protection gap;
a failing `sonar` run must still be investigated, not ignored.

## Final review checklist

- latest head and merge base recorded;
- dependency and changed-file ownership confirmed;
- required checks completed on that head (not an older run);
- migration/OpenAPI drift checked where applicable;
- authorization, idempotency, failure and concurrency evidence attached for
  critical mutations;
- reviewer is eligible and independent of the implementer for sensitive work;
- no unresolved conversations or changes requested;
- no push after final approval.

## Current merge-train policy

Recently merged: Inventory through #222/#231/#232, Product Media M4/M5 #240 and
Cart contracts/runtime #235/#239/#241–#244. No PR was open at the reviewed
baseline. A branch is called READY only when the final SHA is approved and every
required context is green.
