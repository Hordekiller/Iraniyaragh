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
- Resolve every review conversation, apply the sensitive-work review rule below,
  and use a squash merge after confirming no conflicts.
- Restoring enforced branch protection with these gates is an operations gap;
  no PR may claim that GitHub enforced them while the API reports no protection.

Do not claim that a self-review is independent, or merge a skipped check as if it passed.

### Single-developer review handoff

The delivery owner implements one product PR at a time. Independent review for
critical domains is preferred; the reviewer does not implement a parallel
product slice. For each sensitive PR:

1. The implementer makes the final push and waits for every required check.
2. A qualified independent reviewer examines the exact head and records approval
   or actionable findings. If no reviewer is available and the repository owner
   explicitly directs solo delivery, the implementer performs and records a
   self-review on the exact head instead. The record must state that independence
   was waived, list findings and fixes, and include critical failure-path,
   authorization, idempotency and concurrency evidence as applicable. GitHub does
   not permit a PR author to approve their own PR; a self-review is not an approval.
3. Freeze the branch after final approval; if changes are needed, rerun CI and
   review on the new head.
4. Do not use empty commits or repeated rebases to repair attribution.

The repository owner explicitly directed solo self-review on 2026-09-25 because
no independent reviewer is currently available. This is a documented risk
acceptance, not an assertion of independent assurance. Never bypass a failing or
pending check, an unresolved review finding, or a required operational approval.

## PR state machine

```text
DRAFT → IMPLEMENTATION → LOCAL VERIFICATION → PUSH → CI
  → REVIEW (independent, or owner-authorized documented self-review)
  → (changes? fix/push/CI/review latest SHA) → FREEZE → MERGE
```

Review evidence is valid only for the final reviewable SHA. Any new reviewable
push (including a rebase) requires fresh checks and updated review evidence.
After final review, make no code push. If a change is unavoidable, reopen the
review cycle explicitly.

## Roles and dependencies

Every PR declares OWNER, IMPLEMENTER, REVIEWER and INTEGRATION OWNER. Auth,
RBAC, migrations, money, inventory, checkout, orders, payment and financial
changes require independent code-owner review when available, or the explicit
owner-authorized solo exception and evidence above.

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
- reviewer is eligible and independent for sensitive work, or the owner-authorized
  self-review exception and its risk/evidence are recorded;
- no unresolved conversations or changes requested;
- no push after final approval.

## Current merge-train policy

Recently merged: Inventory through #222/#231/#232, Product Media M4/M5 #240 and
Cart contracts/runtime #235/#239/#241–#244. No PR was open at the reviewed
baseline. A branch is called READY only when the final SHA has completed the
applicable review path and every required context is green.
