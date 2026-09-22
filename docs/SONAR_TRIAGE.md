# SonarQube Triage Standard — Iraniyaragh

Status: active · Owner: platform/tooling lane · Applies to every agent touching this repo.

## Purpose

A single, shared decision policy for SonarQube findings so that agents stop treating the
issue count (340 at last snapshot) as a score to zero out. The goal is:

- **0 unresolved real Security issues**
- **0 unresolved reliability Blockers**
- a clean **Quality Gate on New Code**

…and *not* noise-count zero. Changing behavior, security posture or data migrations purely
to satisfy a linter is forbidden below.

## The hard rule (non-negotiable)

> No agent may refactor behavior, security invariants, PostgreSQL migrations, or business
> logic **just to zero out a Sonar issue**. Code changes only happen after a finding is
> triaged and *then* judged a True Positive.

## Triage buckets

Every finding is placed in exactly one bucket before any change. Unknown issues default to
**Fix Later** until classified.

| Bucket | Meaning |
|---|---|
| Fix Now | True Positive on production code, real risk. Fix in-session. |
| Fix Later | Valid, low-value cleanup (style, readability). Backlog / dedicated wave. |
| False Positive | Sonar is wrong (context). Document why. Do NOT change code. |
| Won't Fix / Intentional | Correctly flagged, deliberate trade-off. Record rationale. |

New findings on **New Code** never use False Positive, Won't Fix, or Fix Later if they are
Blockers — those must be resolved or explicitly risk-accepted by a human.

## Current triage (snapshot, 340 issues)

### 1) Fix Now — real production risk

| Rule | N | Note |
|---|---|---|
| typescript:S2681 (misleading indentation / compound condition) | 15 | real control-flow risk — fix with explicit blocks |
| typescript:S3776 (cognitive complexity) | 14 | **highest: `catalog-import` at 69** — refactor w/ no behavior change |
| typescript:S4030 (constructed collection unused/redundant) | 1 | fix |
| typescript:S6551 ([object Object] risk) | 4 | null-guard template usage — fix |
| typescript:S6323 (regex empty alternative) | 1 | fix |
| typescript:S8786 (expensive regex backtracking) | 3 | fix (see regex list) |
| typescript:S2245 (weak RNG: `Math.random`) | 5 | **idempotency keys + SMS codes — use `crypto.randomUUID`/CSPRNG; never fall back to `Math.random` in production**
| css:S7924 (insufficient contrast) | 14 | UI/A11y wave |
| typescript:S6819/S6845 (invalid/duplicate attr) | several | real — fix |
| typescript:S9011 (button without type) | 1 | fix |

### 2) Fix Later — code-quality backlog (will not block Commerce)

typescript:S6759 (readonly props, 55)· S3358 (nested ternary, 22)· S5906 (test matchers, 18)·
S7763 (re-export style, 12)· S6582 (optional chaining, 11)· S3863 (dup imports, 6)·
S6478 (nested components, 3)· S4782 (redundant optional, 3)· S1874 (deprecated API, 3)·
S4624 (nested template strings, 2)· S9332 (Playwright networkidle, 2)· S7785 (top-level await, 2)·
S6571/S7744/S7760/S7773/S7755 (low value, 1 each).

### 3) False Positive / Won't Fix (body of evidence)

- **All `plsql:*`** (≈77 issues: VarcharUsageCheck 47, S1192 22, CharVarchar 3,
  DeleteOrUpdateWithoutWhere 2, QuotedIdentifiers 1, NullComparison 1, NamingTypes 1):
  our migrations are **PostgreSQL**, not PL/SQL. The two `DELETE`/`UPDATE`
  "blockers" are intentional backfills with documented preflight collision checks.
  **Never rewrite existing/merged migrations to satisfy Sonar.**
- **typescript:S5332** on `redaction.ts`: `new URL(value, "http://redaction.invalid")`
  is a parser base URI, not an insecure network call. → False Positive.
- **typescript:S2871** on canonical/signature sorting: deterministic lexical ordering is
  *intended* for hash identity (locale-aware `localeCompare` would break idempotency
  signatures). Resolved with explicit code-unit comparators (`a < b ? -1 : a > b ? 1 : 0`)
  in `variant-identifiers.ts` and `catalog-idempotency.service.ts` `stableJson`, which
  satisfy the Sonar "explicit comparator" expectation without introducing locale
  dependence. The report-only duplicate-detection sort in
  `catalog-import.report.ts` uses `localeCompare`; it is not a persisted
  canonical identity.
- **Security findings only in fixtures/specs** (fixture-* SMS codes, `fixture-challenge-…`):
  not real credentials, OTPs or sessions. Do not degrade product grade over spec fixtures.

### 4) Design reference — excluded from product grade

~11 issues trace to `docs/design/user-ui-reference/**` (`greng` interactive elements,
`array index as key`, invalid links, regex style…). It is a design archive, not shipped app.
Suggested config (server-side, no code change):

```properties
sonar.exclusions=docs/design/user-ui-reference/**,docs/search/**,_build/**,dist/**,node_modules/**
```

## Execution order (proposed)

1. **P0**: Sonar config — exclude PL/SQL rules + design-reference path (config only).
2. **P0**: Review all 9 Security; mark/confirm False Positives; fix the real ones.
3. **P1**: refactor `catalog-import` (complexity 69) behavior-preserving.
4. **P1**: remove `Math.random` from idempotency keys / SMS codes (CSPRNG only).
5. **P1**: fix super-linear regex backtracking (S8786/S6323).
6. **P1**: parser stringify `[object Object]` (S6551) + SMS regex.
7. **P2**: real contrast (S7924) + React key/component structure.
8. **P3**: readonly props, optional chaining, matchers, syntax cleanup.

## Verification

- Narrowest relevant unit spec after each fix; full affected package before finishing.
- Run `CI=true` for the coverage gate exactly like the pipeline (`AGENTS.md`).
- Report in `docs/PROJECT_STATUS.md`: what was verified, what could not be
  (e.g. integration needs test Postgres/Redis containers).

## AGENTS.md carve-out

This standard overrides `AGENTS.md` only where AGENTS.md could be read as "satisfy the
coverage gate unconditionally"; `AGENTS.md` already states findings must be True Positive
before code changes (`report, do not silently choose`).
