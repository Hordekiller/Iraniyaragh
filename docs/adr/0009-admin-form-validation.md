# ADR-0009: Admin Form Validation Strategy

Status: Proposed for joint review; implemented as an in-house validation layer
pending registry connectivity

Date: 2026-09-03

## Context

`ADMIN_PANEL_PLAN.md` §6.4 requires consistent form handling (validation, error
mapping, submit state) for the admin panel and §10 mandates browser-tested component
behavior. The build environment cannot resolve `registry.npmjs.org` (intermittent
`getaddrinfo EAI_AGAIN` / `ECONNRESET`), so `react-hook-form` / `zod` / `valibot`
cannot be added to the lockfile right now; only cached/frozen-lockfile installs
succeed.

The repository must not silently copy a third-party validation stack without a
scoped decision, and must not embed raw RTL validation logic scattered across every
screen.

## Decision

Adopt a **minimal in-house form-validation layer** (`useInHouseForm` +
`validateField`/`validateForm` + reusable rules in
`src/components/ui/useInHouseForm.ts`), shaped deliberately to mirror the
react-hook-form field API so the swap is contained:

- call sites consume `values`, `errors`, `handleChange`, `handleSubmit`, `reset`
  and `getFieldProps` only; no screen reaches into the validation internals;
- a type-safe `FormSchema<TValues>` maps each field to an ordered list of pure rules
  (`required`, `min`, `max`, `minLength`, `maxLength`, `pattern`, `email`,
  `matches`) plus an optional cross-field `validate`;
- error messages are localized (Fa) and surfaced through `FormField`/MUI
  `FormHelperText` with `role="alert"` so required/invalid state is announced;
- `FormField` (MUI `FormControl`/`FormLabel`/`FormHelperText`) owns the consistent
  label + `*` required marker + helper/error block, mirroring Vuexy's field styling
  as a structural reference only.

Do not:
- add `react-hook-form`, `zod`, or `valibot` until the ADR is re-opened on registry
  restore (the `rules`-array schema is chosen to map 1:1 onto a zod object schema);
- embed validation logic or bespoke error rendering inside business screens;
- use `react-hook-form`'s transient/shareable scope or zod transforms for anything
  other than pure value coercion.

## Consequences

- Zero new dependencies now; fully verifiable offline with vitest.
- On registry restore we re-open this ADR to evaluate `react-hook-form` + `zod`
  (which add subscription-based re-render control and richer schema coercion).
  Because the public `useInHouseForm` API is already RHF-shaped, migration is
  confined to the hook internal and does not require touching the screens built on
  it.
- All field rules and their Fa error strings are unit-tested
  (`useInHouseForm.test.tsx`) so behavior is pinned before generalization.
