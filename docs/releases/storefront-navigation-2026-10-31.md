# Storefront navigation release candidate — 2026-10-31

This candidate includes all changes from `feat/v1-completion` and integrates
mainline `36b2dad`. No registry publication or VPS rollout is part of this
checkpoint. The deployable release must later be identified by the full merged
commit SHA, using the existing Publish Images workflow.

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

The owner authorized sending every current change, including access-management
commit `301bdf3`, SEO commit `9e1f4c1`, navigation and status documentation.
Newer mainline implementations supersede overlapping discovery/SEO code. The
current storefront retains Next server rendering, canonical plural entity paths,
the protected private-journey boundary and the product purchase dock fixes.
`/categories` is server-rendered using current public category data. The old
catalog/brand row below the newsletter is removed from the actual Next homepage.
A local candidate tag is not an official release identity.

## Local validation

Run the Web lint (including asset policy), Web typecheck/build, the complete Web
unit suite and the navigation/category Playwright suite against a non-fixture
production preview. Browser test catalog responses are intercepted inside the
test context; they never seed or connect to a sales database.

Before mainline integration, the Vite Web Dockerfile built successfully as
`iranyaragh/web:ui-vps-candidate`. Its local manifest-list digest is
`sha256:d267ce6b7dddc6917ce4ed31cc97b0f11ca7f0a41c8cf04340d0564012e2d3ea`.
Its existing build gates reject fixture authentication/catalog flags, scan the
production bundle for fixture records and validate Nginx configuration; the
fixture scan and Nginx configuration check passed during this build.
The pre-integration browser suite used files extracted from that local image.
That historical image is superseded by the Next integration and must not be
deployed for this source. Current CI must validate and rebuild the official
`storefront.Dockerfile` and Nginx `web.Dockerfile` topology before publication.

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

## CI integration fixes

- The access schema's user version is completed by forward migration
  `20261031190000_access_user_version`; earlier migration files are unchanged.
- The committed OpenAPI artifact is regenerated for the access routes.
- Existing PDF v1/v2 print bytes are retained separately from the corrected UI
  wordmark. The loader and renderer share the same asset hashes; no stored PDF,
  pending job identity or template revision is rewritten.
- The unused regex HTML extractor is removed in favor of the existing parsed
  text projection. Asset-policy tests assert the exact retained document markup
  rather than appearing to validate hostnames with unanchored regexes.
