# Canonical PR, Review and Merge Workflow

Protection/review controls reconciled: 2026-10-15
Applies to: all contributors and agents

## Repository protection and merge policy

Verified 2026-10-15: main protection is enforced and was read back from GitHub.
The earlier unprotected checkpoint below is superseded; no historical solo-review
exception bypasses the active rules. See [V1 reconciliation](V1_RECONCILIATION.md).

- Strict up-to-date checks: `quality`, `database`, `e2e`, `sonar`,
  `dependency-review`, `production-audit`, `Analyze (actions)`,
  `Analyze (javascript-typescript)` (GitHub Actions app 15368), and `CodeQL`
  (GitHub Advanced Security app 57789).
- One approving review, last-push approval separation, stale approval dismissal,
  resolved conversations and administrator enforcement. Linear history required;
  force pushes and branch deletion disabled.
- These checks must pass on the exact head; a skipped/neutral/unavailable result
  is not a successful required gate. Resolve conflicts and blockers before squash merge.
- A self-review documents engineering findings but cannot approve the author's PR.
  Current REVIEW_REQUIRED is an external review dependency, not permission to
  lower protection or merge with administrator bypass.
- #213 remains open for organization-admin confirmation. A real green Sonar scan
  establishes scan/quality evidence, not the state of an account suspension banner.

### Review handoff

The delivery owner implements one product PR at a time. Independent review is required by current protection; the reviewer does not implement a parallel
product slice. For each sensitive PR:

1. The implementer makes the final push and waits for every required check.
2. A qualified independent reviewer examines the exact head and records approval
   or actionable findings. If none is available, continue independent implementation
   work and keep the PR unmerged; active protection must remain enforced.
3. Freeze the branch after final approval; if changes are needed, rerun CI and
   review on the new head.
4. Do not use empty commits or repeated rebases to repair attribution.

Historical record: the owner authorized documented solo delivery on 2026-09-25.
That record was not independent approval and does not override the protection
verified on 2026-10-15. Never bypass a required check, review or release approval.

## PR state machine

```text
DRAFT → IMPLEMENTATION → LOCAL VERIFICATION → PUSH → CI
  → REVIEW (independent approval on final head)
  → (changes? fix/push/CI/review latest SHA) → FREEZE → MERGE
```

Review evidence is valid only for the final reviewable SHA. Any new reviewable
push (including a rebase) requires fresh checks and updated review evidence.
After final review, make no code push. If a change is unavoidable, reopen the
review cycle explicitly.

## Roles and dependencies

Every PR declares OWNER, IMPLEMENTER, REVIEWER and INTEGRATION OWNER. Auth,
RBAC, migrations, money, inventory, checkout, orders, payment and financial
changes require qualified independent review and the active GitHub approval
controls; self-review is supporting evidence only.

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
admin confirms the suspension banner is cleared. The protection verified on
2026-10-15 already requires `sonar` and the other eight contexts; do not remove
those checks based on the earlier unprotected checkpoint.

## Final review checklist

- latest head and merge base recorded;
- dependency and changed-file ownership confirmed;
- required checks completed on that head (not an older run);
- migration/OpenAPI drift checked where applicable;
- authorization, idempotency, failure and concurrency evidence attached for
  critical mutations;
- reviewer is eligible and independent, current approval is recorded, and active
  GitHub protection accepts the final head;
- no unresolved conversations or changes requested;
- no push after final approval.

## Historical merge-train checkpoint — 2026-09-25

Recently merged: Inventory through #222/#231/#232, Product Media M4/M5 #240 and
Cart contracts/runtime #235/#239/#241–#244. No PR was open at the reviewed
baseline. A branch is called READY only when the final SHA has completed the
applicable review path and every required context is green.
