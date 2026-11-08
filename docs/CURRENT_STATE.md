# Current implementation and release boundaries

Reviewed against the SEO release source on **2026-11-07**. This is the current
capability entry point; older dated status/issue registers preserve historical
checkpoints. The user's current instructions determine scope and priority.

## Evidence levels

| Level                                   | What it proves                                                                                            |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Local source / open PR                  | A candidate exists; merge, runtime and provider outcomes remain unproven                                  |
| Required PR checks                      | The exact head passed its configured automated checks                                                     |
| Merged main + Publish Images            | Exact-SHA release artifacts exist when publication succeeds                                               |
| VPS deployment verification             | Selected/running image SHA, migrations, readiness and real HTTPS were checked                             |
| Controlled operator/provider acceptance | Real authentication, external delivery/payment and reconciliation were exercised with authorized evidence |

A green build does not prove handset delivery, paid money, correct warehouse
counts or successful editorial writes. Publish Images can fail even when PR CI
passes: the container context must include build-time test imports.

## Implemented source capabilities

| Capability         | Current behavior / reference                                                                                                                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public storefront  | Next server rendering, fixed canonical origin, real catalog projections, scroll reset, RTL/mobile layouts and configured branding/contact surfaces                                                             |
| Branding/contact   | Verified deployment configuration drives public contacts. The wordmark is used on identity surfaces such as header/footer; descriptive/legal business text and SEO identity remain meaningful text             |
| Help               | `/help` and topic pages, contextual page helper and protected Admin enable/disable setting                                                                                                                     |
| Custom doors       | Editable catalog/materials; Decofix configuration; manufacturing choices and four custom hole distances; full final-balance payment; [contract](CUSTOM_DOOR_ORDERS.md)                                         |
| Promotions         | Campaign/coupon rules, server repricing, reservation/confirmation/release/refund accounting; [contract](PROMOTIONS.md)                                                                                         |
| Sessions           | Separate staff/customer cookies, encrypted bounded same-attempt refresh recovery, live revocation/permissions and staff activity keep-alive; [contract](AUTH_CONTRACT.md)                                      |
| Blog               | Draft/review/publication/archive, scheduling, revisions, redirects, protected editor, real image metadata, RSS, public structured data and conditional header/drawer/home/footer discovery links; [contract](BLOG.md)                                                 |
| SEO                | Canonicals, Organization/WebSite, Product/Offer, collection/breadcrumb/article data, image metadata, dynamic sitemaps and page/discovery checkers; [plan and implemented slices](SEO_GEO_AI_DISCOVERY_PLAN.md) |
| Commerce/inventory | Existing server-priced checkout, immutable stock/financial movements, verified provider reconciliation and owned order/invoice/report surfaces; domain contracts remain authoritative                          |
| Newsletter         | Unavailable UI only. Backend subscription, verified consent, delivery and welcome-coupon workflow are [planned](NEWSLETTER_PLAN_FA.md)                                                                         |

No first article is automatically authored. An empty blog is deliberately a real
404 with no footer/sitemap listing; the feed can return an empty RSS document.
The requested public test article remains planning scope, not a publication claim.

## Runtime evidence and indexing

A verified historical deployment checkpoint for PR #517 is
`d7f19c247cdb0b2d83a486f3b19f922f1a630b46`: fresh database/media backups were restored
in isolated scratch targets, the blog migration/baseline were applied, all 10
application/infrastructure services were healthy and public HTTPS passed. Five
public SEO pages and browser checks passed with no page-check errors/warnings.

That full sitemap audit then found missing seller Organization URLs in three
sampled product pages (11 pages, four shards, 19 URLs). PR #518 supplies the
canonical seller identity and regression; PR #519 supplies the checker file
needed by container typechecking. Their acceptance requires successful exact-main
image publication, deployment and a repeated full discovery audit. The historical
checkpoint above must not be used as a live release pointer.

Read the current VPS checkout, configured IMAGE_TAG and selected/running images
using the [operations procedure](OPERATIONS.md). Private operator release records
contain the actual backup/restore, runtime and audit evidence; never commit their
secrets, customer data or database/object exports.

`APP_ENVIRONMENT=production` enables eligible public discovery. The `.staging.yml`
filename does not force noindex. Account/cart/payment and Admin pages retain their
private/noindex behavior; protected actions still require server authorization.
Changing indexing does not prove or replace real payment/SMS acceptance.

## Open acceptance and planned scope

- Complete and record full discovery acceptance on the actual deployed seller fix.
- Set `PRODUCTION_WEB_ORIGIN` and enable the existing scheduled GitHub production
  audit only after that full audit passes; an unset variable means it is inactive.
- Exercise the editorial workflow with a real authorized operator before claiming
  production authoring acceptance. The public test article remains a plan.
- Newsletter: decide channel, consent flow, offer constraints and send budget;
  implement and verify the real backend/provider flow before enabling the UI.
- General paid-order returns, linked invoice corrections, remaining Merchant/feed
  and IndexNow/content-lifecycle work and applicable field/provider acceptance
  remain separate from the delivered foundations.
- Local/unmerged work, including files in another agent's worktree, is not main
  or runtime evidence. Read current GitHub state before reconciling those features.

## Documentation map

- [Index](README.md) and [maintenance policy](DOCUMENTATION_MAINTENANCE.md)
- [Operations](OPERATIONS.md), [deployment runbook](../infrastructure/docker/RUNBOOK.md)
- [Testing](TESTING.md), [security](SECURITY.md), [domain invariants](FOUNDATION.md)
- [Newsletter/test-article plan in Persian](NEWSLETTER_PLAN_FA.md)
- [Local MCP guide in Persian](../MCP_GUIDE_FA.md)
