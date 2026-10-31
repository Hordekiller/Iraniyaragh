# Storefront navigation release candidate — 2026-10-31

This is local release preparation. No merge, registry publication or VPS rollout
is part of this checkpoint. The deployable release must later be identified by
the full merged commit SHA, using the existing Publish Images workflow.

## Included storefront changes

- Right-side hamburger mega menu with live category hierarchy, category search,
  page shortcuts, keyboard focus containment, Escape/backdrop dismissal and
  reduced-motion support.
- Dedicated `/categories` page with category search, nested discovery and
  loading, empty, failure and retry states. The mobile category button and the
  footer category link navigate there; breadcrumbs provide a route back.
- Responsive header spacing and touch targets; unnecessary homepage/footer
  implementation copy removed. The current homepage ends with the newsletter
  status and does not append a catalog or brand listing below it.
- Existing ProductPage Hook ordering corrected so asynchronous product loading
  does not crash the page.
- Asset policy distinguishes actual resource URLs from schema vocabulary
  identifiers, valid inline JSON-LD and canonical sitemap declarations. Its
  regression checks keep executable/resource URLs under inspection.
- `/categories` is included in the static sitemap. Docker build contexts exclude
  private environment files, backups, local dependencies and prior build output.

These storefront changes introduce no database migration, payment/SMS mode
change, stock mutation or fixture-authentication activation.

## Source identity and release scope

Preparation base: `9e1f4c1` on `feat/v1-completion`, plus the uncommitted
storefront changes. A local candidate tag is not an official release identity.
The branch already contains access-management and SEO commits beyond the local
`origin/main` reference. Confirm their inclusion or isolate the storefront
changes before merging; do not treat this branch as an isolated UI-only release.
Pre-existing edits to project-status/backlog documents are outside this UI work.

## Local validation

Run the Web lint (including asset policy), Web typecheck/build, the complete Web
unit suite and the navigation/category Playwright suite against a non-fixture
production preview. Browser test catalog responses are intercepted inside the
test context; they never seed or connect to a sales database.

The official Web Dockerfile built successfully as
`iranyaragh/web:ui-vps-candidate`. Its local manifest-list digest is
`sha256:d267ce6b7dddc6917ce4ed31cc97b0f11ca7f0a41c8cf04340d0564012e2d3ea`.
Its existing build gates reject fixture authentication/catalog flags, scan the
production bundle for fixture records and validate Nginx configuration; the
fixture scan and Nginx configuration check passed during this build.
The final browser suite uses static files extracted from this exact local image.
This candidate must not be substituted for an image published by the exact-SHA
workflow.

## Later VPS rollout

1. Review and merge the intended source scope; complete required repository CI.
2. Wait for Publish Images to succeed for the merged full SHA and verify digests.
3. Follow `infrastructure/docker/RUNBOOK.md`, preserving existing private server
   configuration and the previous image tag. Use the required backup/restore
   verification before relying on a backup.
4. Run the existing deployment procedure from the reviewed checkout. Do not
   build source on the VPS or upload a development/fixture build.
5. Verify HTTPS, readiness, the homepage, a direct `/categories` refresh and
   `/category/:slug`; test the mobile category button, menu search, nested links,
   Escape dismissal and focus restoration in the published site.

A green UI build does not establish live SMS, payment, storage or end-to-end
sales acceptance. Preserve the existing controlled acceptance requirements.
