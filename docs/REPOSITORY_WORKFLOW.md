# Canonical PR, Review and Merge Workflow

Reviewed: 2026-09-17
Applies to: all contributors and agents

## Repository protection (observed)

`main` currently has no additional ruleset. Classic branch protection is enabled
(observed via the REST API on 2026-09-15):

- Required checks are exact contexts: `quality`, `database`, `e2e`,
  `dependency-review`, `Analyze (actions)`, `Analyze (javascript-typescript)`
  and `production-audit`. Sonar is not yet a required context on `main`; #212 is
  merged and current internal PRs execute real scans and Quality Gates (for
  example #244 passed). Issue #213 remains open only for SonarCloud organization-
  admin suspension confirmation; the gate must not be weakened meanwhile.
- `strict` (up-to-date-before-merge) is disabled so already-green PRs are not
  re-blocked by every concurrent merge; merge conflicts are still detected.
- Required approving reviews: `0`; code-owner review: off; stale-review
  dismissal: off; last-push approval: off.
- Required linear history: on (merge commits are rejected, use squash).
- Required conversation resolution: on. Administrator enforcement: on.
- Force-push and deletion on `main`: off.

These settings are security controls. Do not bypass them, self-approve sensitive
work or merge a skipped check as if it passed. The checks listed above must all
be green on the exact head being merged; disabling `strict` never means merging
with failing or absent required checks.

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
admin confirms the suspension banner is cleared. When that account state is stable,
add the exact `sonar` check context to branch
protection and verify it on a test PR. Until then the absence of the `sonar`
required context is a known protection gap, not evidence of analysis — a failing
`sonar` run must still be investigated, not ignored.

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
