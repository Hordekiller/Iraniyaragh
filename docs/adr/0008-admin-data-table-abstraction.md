# ADR-0008: Administrative Data Table Abstraction

Status: Proposed for joint review; implemented as in-house MUI abstraction pending
dependency/license review and registry connectivity

Date: 2026-09-03

## Context

`ADMIN_PANEL_PLAN.md` §6.3 requires a consistent data table/list primitive (server
pagination, sort, filter, row selection, loading/empty/error states) and explicitly
demands a decision between MUI X Data Grid Community, a licensed MUI X tier, or a
smaller in-house MUI `Table` abstraction before implementation. It also forbids
implicitly copying Vuexy's TanStack Table stack.

Two constraints force the current design:

- The build environment cannot resolve `registry.npmjs.org` (intermittent
  `getaddrinfo EAI_AGAIN` / `ECONNRESET`), so MUI X (`@mui/x-data-grid`) cannot be
  added to the lockfile right now. Only cached/frozen-lockfile installs succeed.
- The repository must not bind a licensed commercial grid tier without a scoped
  decision, and must not copy Vuexy's third-party table stack implicitly.

## Decision

Adopt a **small in-house MUI `Table` abstraction** as the baseline admin grid
primitive. It is a thin, typed wrapper over `@mui/material/Table` that owns the
operational behaviors listed below and exposes a stable contract that can later swap
to MUI X Data Grid Community without rewriting every page.

The abstraction:

- is presentational and state-borrowing only: it collects sort, filter, pagination
  and selection *intent* but performs no business logic, authorization or mutation;
- accepts columns with `id`, `label`, `align`, `render` and `sortable` metadata plus
  `sortFn`/`filterFn` as an explicitly injected adapter (not captured by default);
- supports loading skeleton, initial-empty, filtered-empty, error, and stale-data
  presentation per §6.3;
- supports row selection and bulk-actions scope display;
- uses client-side sorting/filtering/pagination for the current foundation work ONLY
  as an interim convenience; production operational collections MUST move to the
  server pagination/filter/sort contract (§3 item 6) once the API client contract
  exists. The component API is shaped so `dataSource` is a simple
  `(request: {page, pageSize, sort?, filters?}) => Promise<Page<T>>` and can be
  backed by client or server implementation without UI changes.

Do not:
- add `@tanstack/react-table` (Vuexy's implicit stack) or a licensed MUI X tier;
- load unbounded collections into the browser for operational screens;
- expose Prisma entities as a public grid contract.

## Consequences

- Zero new dependencies now; the primitive is fully verifiable offline.
- When registry connectivity returns, we re-open this ADR to compare MUI X Data Grid
  Community Community/Pro licensing and accessibility against the in-house layer
  before any swap; changing the adapter is a non-author-reviewable migration.
- Interim client-side collection handling is acceptable only for small, clearly
  bounded admin reference data (e.g. category/brand lists), never for orders,
  inventory, payments or audit which are server-paginated.
- The non-author reviews keyboard/focus, RTL, narrow-viewport and empty/error
  behavior for the primitive before it generalizes to multiple screens.
