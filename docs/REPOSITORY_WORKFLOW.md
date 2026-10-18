# Canonical PR, Review and Merge Workflow

Protection read back: **2026-10-18**. Applies to contributors and agents.
Current source/runtime and release gates: [V1 reconciliation](V1_RECONCILIATION.md).

## Current main protection

The owner explicitly changed account-approval policy on 2026-10-17. Only these
settings changed: required approving reviews **1 → 0**; last-push approval
**enabled → disabled**. The prior independent-account merge blocker is superseded.
This does not establish an independent approval of an author's work.

These controls remain active and were read back:

- Strict up-to-date required checks: `quality`, `database`, `e2e`, `sonar`,
  `dependency-review`, `production-audit`, `Analyze (actions)` and
  `Analyze (javascript-typescript)` bound to GitHub Actions app 15368;
  `CodeQL` bound to GitHub Advanced Security app 57789.
- Administrator enforcement, stale-review dismissal, resolved conversations and
  linear history required. Force pushes to main and branch deletion disabled.
- Every required context must succeed on the final exact PR head. Missing,
  skipped, neutral, pending or failing checks do not authorize a merge.
- Record engineering review of the complete final diff. Use independent review
  when available; do not call self-review independent or fabricate approval.
  Resolve actual review blockers and semantic conflicts before normal squash merge.
- No administrator/check bypass or weakening of security tests. A future policy
  change needs its own explicit operator decision; routine work follows this policy.

## Delivery and review sequence

```text
IMPLEMENT → LOCAL VERIFICATION → PUSH → EXACT-HEAD CI → ENGINEERING REVIEW
  → (findings? FIX / PUSH / NEW CI / REVIEW) → FREEZE → NORMAL SQUASH MERGE
```

Record owner, implementer, integration owner and reviewer/review method honestly.
Auth, RBAC, migrations, money, inventory and payment changes require explicit
review of authorization, privacy, invariants, concurrency, idempotency and recovery.
A new push/rebase requires fresh CI and updated review evidence. Do not use empty
commits to repair attribution or treat older green runs as evidence for a new tree.

Dependent PRs declare `Depends on #N`. Merge the dependency first, retarget/rebase
once against the new main, resolve semantic conflicts and revalidate. After every
2–3 merges in the current train run combined latest-main validation before continuing.
Do not accumulate unrelated new PRs ahead of existing release blockers. The owner's
current cadence is one completed slice, start fresh tests/CI, then pause for review.

## Release boundary

Merge is not deployment proof. Use official Publish Images for the exact merge
SHA, resolve all four image tags to digests, restore-verify a fresh backup before
relying on it, and use the authorized official deployment path. A migration failure
must abort. No latest tag, VPS build, source copy or running-container patch.
Record runtime image/digest/migration/health evidence and actual Admin/customer/
provider acceptance separately. Do not reset or seed live sales data.

## Sonar and security evidence

Trusted internal scans require the secret at job scope and the exact-head quality
gate; forks may visibly lack secrets, but a skip is not a successful required gate.
Never lower coverage or alter application behavior to hide infrastructure failure.
#213 remains open until an organization administrator confirms the historic
suspension banner/account state. Green scans alone do not prove that state.
Production audit passing does not imply that all default-branch advisory alerts
are resolved; the scoped #441/#442 candidates remain distinct until integrated.

## Final merge checklist

- Latest main, final head, base and dependency state recorded.
- Full diff reviewed; migration/contract/OpenAPI drift checked where applicable.
- Required exact-head checks all successful; no unresolved review blocker.
- No secret, customer data, fixture or fabricated provider evidence in artifacts.
- Protection readback accepts the head; merge with the current squash convention.
- After merge: combined CI and official exact-SHA publication/deployment as authorized.

## Historical policy

The owner authorized solo delivery on 2026-09-25. Protection subsequently required
one independent account approval and last-push separation at the Oct 15 checkpoint.
The explicit Oct 17 owner decision supersedes those two settings; other safeguards
remain enforced. Older review requirements in dated plans are historical, not a
reason to demand another account under today's policy. #12 tracks documentation
synchronization; its final documentation criterion completes only when #443 merges.
