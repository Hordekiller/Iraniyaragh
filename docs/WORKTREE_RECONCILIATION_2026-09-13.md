# Local Work / Worktree Reconciliation — 2026-09-13

Status: active · Owner: lead engineering agent (this session) · Base: `origin/main` @
`cb0e222`

Purpose: prove nothing valuable is stranded on an unknown stale branch, classify every
local branch / worktree / stash, and record where each capability now lives. This is the
answer to "what happened to the old local work?".

Environment note: worktrees live under `~/development/Iraniyaragh-*`, `/tmp/iraniyaragh-*`,
and `~/development/Iraniyaragh` (root worktree). Paths below are machine-specific; treat
the branch names as the durable identifiers.

## Method

Evidence gathered with `git status --short --branch`, `git branch -vv`, `git worktree list`,
`git stash list`, `git rev-list --left-right --count origin/main...<branch>` for every
branch, and per-branch `git diff --stat origin/main...<branch>` for the flagged ones.
Every branch was compared against `git show main:...` (not the working tree, which sits on
a 36-commit-stale branch) and against the PR list (squash merges: commit SHAs differ).

## Dispositions used

- **A — ACTIVE**: live PR branch or consciously continued lane.
- **B — EXTRACT**: unique valid work on a stale base; port slices onto current `main`.
- **C — SUPERSEDED**: delivered differently on `main` or in a newer PR; keep only for record.
- **D — MERGED**: commits/content already on `main` via squash merge (SHA differs).
- **E — REFERENCE ONLY**: usable as reference, never merged as production code.
- **F — ABANDONED/EXPERIMENTAL**: superseded or rejected direction.
- **H — UNCOMMITTED**: preserved this session (see Preservation log).

## Preservation log (executed 2026-09-13)

No branch was deleted, reset, force-pushed, rebased, or merged. Four dirty worktrees were
snapshotted onto dedicated preserve branches; each worktree was then restored to its
original branch, clean and in sync with its remote.

| Snapshot branch | SHA | Source worktree | Contents / classification |
|---|---|---|---|
| `preserve/189-parity-wip-2026-09-13` | 5fe80a3 | `Iraniyaragh-189-catalog-parity` (#199 PR branch) | Three pieces: (1) parser `workbookStatus` MUST-FIX for #199 — **keep**, carry into rebased #199; (2) ASCII-only SKU fold — **duplicate of #200**, do not re-apply; (3) delete-expired-and-re-execute idempotency experiment — **CONTRADICTS contract #168, DO NOT MERGE** |
| `preserve/178-g1-g2-settings-wip-2026-09-13` | 2533a8e | `Iraniyaragh-g1-settings` | **UNIQUE, unmerged ADR-0014 RBAC slice**: `SoDRestriction` model, `RbacModule`, seed baseline, contracts `rbac.ts`, new API error codes, openapi regen. Extract as its own PR after #185 (#185 is the ADR adoption docs PR) |
| `preserve/162-media-wip-2026-09-13` | c6411d7 | `/tmp/iraniyaragh-162` | Superseded drafts on a merged branch: idempotency migration/service == merged #168/#171; catalog service diffs superseded by #184; admin catalog fixture copies == #166/#173; stale media/status docs |
| `preserve/111-public-catalog-wip-2026-09-13` | f67eef3 | `Iraniyaragh-111-api` | Draft public-catalog-cache interceptor + catalog service WIP; superseded by #157/#171/#184 |

Pre-existing preserve snapshots (from 2026-09-11) confirmed still valid and matching disk:

- `preserve/admin-catalog-2026-09-11` (cb342eb) — matches on-disk untracked admin catalog dirs (5+16+6 files, identical file counts).
- `preserve/admin-navigation-2026-09-11` (7ae3ffc)
- `preserve/user-ui-2026-09-11` (7c3758b) — holds the User UI source (53 files); on-disk `User UI/` now contains **only** build residue (`dist/`, `node_modules/`, `.vite-source-tags.js`). Source is fully archived on `main` under `docs/design/user-ui-reference/` via #175.

## Classification

### Root worktree (checked out: `feat/admin-catalog-slice`) — recommended: EXTRACT, then archive

36 behind / 10 ahead of `origin/main`. Unique commits = the **storefront slice**
(`apps/web/src/pages/*`, `services/cart`, `services/catalog`, `state/*`, `lib/routes.ts`,
routed `App.tsx`, `e2e/tests/web-purchase.spec.ts`) plus
`docs/CONTRACT_PROPOSALS/cart-checkout-order.md`. Admin parts (Phase A, orders/settings)
were delivered via #138/#169. Status/coordination docs (PROJECT_STATUS/EXECUTION_STATUS
copies, HANDOFF) are stale duplicates.

**Action**: keep branch for reference; carry only the storefront slice onto current
`main` as the #166 web-wave PRs (re-create against current contracts, do not rebase the
branch wholesale).

Untracked in root worktree:

| Path | Disposition | Evidence |
|---|---|---|
| `User UI/` | C SUPERSEDED | Source archived on `main` (`docs/design/user-ui-reference/`, #175) and snapshot `preserve/user-ui-2026-09-11`; disk holds only build residue |
| `apps/admin/src/app/(dashboard)/catalog/`, `components/catalog/`, `lib/catalog/` | C SUPERSEDED | Catalog admin workflow already on `main` (#166/#173); exact copy preserved in `preserve/admin-catalog-2026-09-11` |
| `docs/SONAR_TRIAGE.md` | E → tracked (this session) | Standalone Sonar triage policy supporting #198; committed to docs/ on `docs/worktree-reconciliation-2026-09-13` |

### Active PR branches (A) — keep; already on current base (0 behind)

| Branch | PR | Note |
|---|---|---|
| `fix/188-refresh-rate-limit-trust-proxy` | #195 | approved |
| `fix/auth-permission-denied-audit` | #196 | approved |
| `fix/auth-password-blocklist` | #197 | approved |
| `fix/admin-csrf-and-docs-index` | #190 | closes #186 |
| `fix/189-catalog-parity-import` | #199 | CHANGES_REQUESTED; worktree cleaned after snapshot — MUST-FIX (parser) carried in preserve snapshot |
| `audit/rbac-financial-policy-config` | #185 | CHANGES_REQUESTED; author must fix factual items |

Remote PR branches with no local checkout (owned on the platform lane's machine):
`ci/import-gap-fixes` #200, `ci/sonarcloud` #198, `fix/admin-csprng-idempotency-keys` #201,
`fix/api-sender-line-regex` #202, `refactor/catalog-import-report` #203,
`feat/admin-staff-auth-http-client` #191, `chore/admin-nav-planned-flags` #192,
`docs/187-execution-reconciliation` #194, `docs/post-wave-0.2a-facts-sync` #174.

### Remaining local branches — grouped by disposition

**D MERGED / C SUPERSEDED (historical PR lanes, delivered on main; keep locally as record,
safe to delete on owner confirmation):**

- Storefront/admin lane: `feat/user-ui-storefront` (D — tip is merged #135 ancestor, no
  unique commits; router WIP only in stash@0), `preserve/user-ui-2026-09-11` (C),
  `preserve/admin-catalog-2026-09-11` (C), `preserve/admin-navigation-2026-09-11` (C),
  `feat/admin-vuexy-foundation` (D #138), `feat/admin-vuexy-commerce-shell` (D #143),
  `feat/admin-form-and-table-primitives` (D), `otpui-review`/`fix/pr65-otp-ui` (D),
  `feat/user-ui...none`.
- Catalog/media/IDP: `feat/111-durable-idempotency-runtime` (D #171),
  `feat/111-public-cache-v2` (D #157), `feat/111-public-catalog-contract` (D),
  `feat/162-product-media` + `-clean` (D #161/#173 + preserve snapshot),
  `feat/163-admin-catalog-reconcile` (D #173), `feat/163-admin-media` (D),
  `feat/164-web-media` (D), `feat/166-admin-reconcile` (D #169),
  `docs/176-catalog-variant-policy` (D #177), `docs/3-product-media-contract` (D #161),
  `docs/166-user-ui-reference` (D #175), `review/admin-current` (D),
  `feat/178-catalog-variants-*` (contracts/schema/services, D #180/#181/#179),
  `feat/178-catalog-configuration` (D #182), `feat/178-catalog-import` (D #183),
  `feat/178-catalog-import-service` (D #184).
- Auth/security: `feat/47-auth-crypto-foundation`, `feat/47-auth-session-rotation`,
  `feat/47-auth-session-runtime`, `feat/49-auth-mfa-persistence`,
  `feat/49-auth-privileged-lifecycle` (D #109/#102 era), `feat/auth-refresh-csrf` (D #102),
  `feat/phase1-auth-controllers` (D), `feat/27-auth-rbac-schema` (D),
  `fix/118-audit-semantics` (D #146), `fix/123-multer-security` (D #134),
  `fix/pr61-auth-http-contract` (D), `pr61-sync` (D), `fix/139-cross-tab-refresh`
  (C — #145 closed; delivered via #139/#147), `safety/accidental-pr61-merge-baac783`
  (F — accidental merge branch), `chore/51-security-gates` (D),
  `security/54-admin-runtime-upgrade` (D).
- SMS/Docs/meta: `docs/13-closeout`, `docs/46-auth-runtime-contract`,
  `docs/70-admin-completion-plan`, `docs/status-38`, `docs/project-status-roadmap-2026-09-08`
  (D #112), `docs/seo-geo-ai-foundation` (D #121), `docs/124-rendering-url-adr` (D #131),
  `docs/140-page-release-matrix` (D #142), `docs/136-logging-agent-coordination` (D #137),
  `docs/commerce-expansion-master-plan` (D #135), `docs/parallel-delivery-map` (D #156),
  `docs/smsir-provider-decision` (D #116), `docs/smsir-acceptance-sync` (D #117),
  `docs/sms-track-status-sync` (C — #132 closed), `docs/status-after-151` (D #152),
  `docs/78-team-capacity` (D #172), `docs/136-logging...` (D), `pr103-finalize` (D),
  `prune` (D), `review/pr29-completion` (D #20), `review/pr-118` (D #118).
- API/infra: `feat/10-admin-foundation` (D), `feat/15-env-cors` (D),
  `feat/16-deterministic-seed` (D #45), `feat/21-api-foundation` (D #21),
  `feat/28-rebuild-contract` (D), `feat/catalog-api` (D #103),
  `feat/commerce-customer-journey` (D), `feat/114-sms-secret-boundary` (D #120),
  `feat/114-auth-sms-dispatch` (D #148), `feat/114-environment-settings` (D #154),
  `feat/114-production-bootstrap` (D #153), `feat/114-smsir-provider-adapter` (D #119),
  `chore/75-pin-postgres-image` (D #80), `ci/money-gate` (D), `chore/ci-hardening` (D).

**E REFERENCE / superseded-adr:**

- `feat/129-dynamic-discovery` (C — 1-line ADR-0012 status flip; already covered by #194
  docs lane; live remote ref with **no PR** — candidate for remote-ref deletion after #194).
- `feat/166-user-ui-reconcile` (E — 1 unique docs commit mapping controlled User UI
  extraction; read into the #166 web wave, do not merge the branch).
- `feat/178-slice-g1-g2-configurable-settings-rbac` (B — unique ADR-0014 RBAC slice in
  the g1-settings worktree; snapshotted this session; extract a PR after #185).
- `fix/133-final-integration`, `fix/138-review-corrections`, `fix/139-cross-tab-refresh`,
  `pr103-finalize`, `pr61-sync`, `otpui-review` (D/C coordination/review branches).

**Detached HEADs (worktrees):** `Iraniyaragh-review-158` (#158 review),
`Iraniyaragh-review-160` (#160), `/tmp/...-review118-v2/v3` (#118),
`/tmp/...-review133`, `/tmp/...-review139` — E, all corresponding PRs merged/closed.

### Stashes

| Stash | Disposition |
|---|---|
| `stash@{0}` feat/user-ui-storefront "wip web react-router-dom (unrelated lane, preserve)" | E/F — alternative router-based storefront WIP; not the committed storefront approach; preserved by stash, leave in place |
| `stash@{1}` feat/50-auth-client-fixtures status update | D — historical docs WIP, delivered |
| `stash@{2}` feat/73-auth-principal-hardening findings | E — draft audit findings; superseded by later auth hardening |
| `stash@{3}` feat/14 order/payment states PROJECT_STATUS docs | D — historical, delivered |

## Do-not-merge warnings (verified)

1. `preserve/189-parity-wip` idempotency change (delete expired → re-execute)
   **violates `docs/CATALOG_IDEMPOTENCY.md` (#168)** and fails #200's expiry-pin tests.
   Merge `main`'s replay-after-expiry semantics only.
2. Untracked idempotency migration `20260911120000_catalog_idempotency` (in the 162
   snapshot) is **already merged on `main`** — never re-add it.
3. `SoDRestriction` must not merge until #185 (ADR-0014 adoption) lands, so the ADR is
   accepted before its implementation.

## Recommended follow-ups

- **#199**: apply the parser MUST-FIX from `preserve/189-parity-wip` (piece 1) rather than
  re-deriving it; drop the gap-3/5 claims (delivered by #200).
- **#194**: also fold the ADR-0012 "Accepted" status (the stale `feat/129-dynamic-discovery`
  line).
- **ADR-0014 RBAC runtime**: extract `preserve/178-g1-g2-settings-wip` as a focused PR
  after #185 merges; re-derive status-doc edits at that time.
- **#166 web wave**: port only the storefront slice listed under the root-worktree section,
  never the branch wholesale.
- Owner decision (not taken this session): pruning historical PR branches/worktrees and
  deleting the `feat/129-dynamic-discovery` remote ref.

## Gaps / risks left open

- `/tmp` is 80% full (tmpfs, 2.8G/3.5G used by historical worktrees); consider moving the
  oldest merged-branch worktrees off `/tmp`.
- Inventory #81 (expireReservations 1+5N batching), #114 state, and the #190–#203 merge
  train are tracked separately (see PROJECT_STATUS and the stabilization plan); this
  document covers only local-work reconciliation.