# Canonical PR, Review and Merge Workflow

Reviewed: 2026-09-14  
Applies to: all contributors and agents

## Repository protection (observed)

`main` currently has no additional ruleset. Classic branch protection is enabled
with strict up-to-date branches, one approving review, code-owner approval,
stale-review dismissal, approval from someone other than the latest pusher,
required conversation resolution, linear history, administrator enforcement and
no force-push/deletion. Required checks are exact contexts: `quality`,
`database`, `e2e`, `dependency-review`, `Analyze (actions)`, `Analyze
(javascript-typescript)` and `production-audit`. Sonar is not yet a required
context on `main`; merge #212 and verify the real scan before adding it.

These settings are security controls. Do not bypass them, self-approve sensitive
work or merge a skipped check as if it passed.

## PR state machine

```text
DRAFT → IMPLEMENTATION → LOCAL VERIFICATION → PUSH → CI
  → INDEPENDENT REVIEW → (changes? fix/push/CI/review latest SHA)
  → APPROVED LATEST SHA → FREEZE → MERGE
```

Approval is valid only for the final reviewable SHA. With stale-review dismissal
and last-push approval enabled, any new reviewable push (including a rebase) must
be treated as requiring fresh approval and fresh checks. After final approval,
make no code push. If a change is unavoidable, reopen the review cycle explicitly.

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

After #212 is merged and the Sonar organization is operational, add the exact
`sonar` check context to branch protection and verify it on a test PR. Until then
the absence of a Sonar check is a known protection gap, not evidence of analysis.

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

The active Auth/catalog train is `#190 → #191`; #200 is independent of Auth after
its contract/migration review; #207 remains blocked until Sonar new-code coverage
passes; #212 must land before Sonar can become a truthful protected check. A
branch is called READY only when the final SHA is approved and every required
context is green.
