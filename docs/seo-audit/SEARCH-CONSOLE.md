# Search Console and technical SEO audit — 2026-11-15

Property: `sc-domain:iraniyaragh.com`. Observations below come from the authenticated Search Console UI on 2026-11-15 and a limited public-site crawl. Search Console reports are snapshots and can lag a deployment or recrawl. Code changes in this worktree are not production evidence until deployed.

## Verified Search Console state

| Report | Observation |
| --- | --- |
| Sitemap | `/sitemap.xml` was successful, last read 2026-11-14, with 28 discovered URLs. Public sitemap index and four gzip shards parsed successfully: 5 static, 11 product, 3 category, 9 brand URLs. |
| Page indexing | Last update 2026-11-09: 100 indexed, 100 not indexed. Excluded buckets: 67 blocked by robots.txt, 26 duplicates without user-selected canonical, 3 not found, 3 redirects, 1 `noindex`. These are historical Google classifications, not 100 confirmed current defects. |
| Indexed URL sample | Of 100 listed rows, 94 use the legacy `/category/` prefix; one legacy `/product/demo-v1-...` is listed. Only one `/categories/` URL appears. Public checks found `/category/concealed-cabinet-hinges` redirects once to the live `/categories/` URL with HTTP 200, while `/category/wood-sliding-door-hardware` and the demo product return HTTP 404. `/privacy` redirects once to the live policy page. Recrawl and canonical consolidation are needed to clear old entries. |
| Product URL inspection | `/products/kolity-k63-soft-close-overlay-hinge` was "Discovered - currently not indexed". Live test said "URL is available to Google" and identified 1 valid Product snippet, 1 valid Merchant listing, and 1 valid Breadcrumb. An indexing request was accepted for this URL on 2026-11-15; this is not a promise of indexing. |
| Product enhancements | The live Merchant listing reported optional warnings for invalid `category`, absent `hasMerchantReturnPolicy`, and absent `shippingDetails`. Code removes the optional category string. Shipping/returns need approved factual policy before markup. |
| Other enhancements | Breadcrumbs: 3 valid, 0 invalid. HTTPS: 4 valid, 0 non-HTTPS. Product snippets report: 0 valid/0 invalid; the inspected merchant product nevertheless passed its live Product snippet test. |
| Site health | Manual actions and Security issues showed no issues. Core Web Vitals reports lacked sufficient usage data, so no pass/fail conclusion is possible. |
| Validation | "Validate fix" was started for both the 67 robots-blocked and 26 duplicate-canonical buckets on 2026-11-15. Their future results depend on Google's recrawl and cannot be declared fixed yet. |
| Exclusion examples | The robots-blocked examples include historical `/category/mirror-sensors` and `/product/unihopper-95g-jet-base-overlay-hinge-16mm` crawls from 2026-11-06; duplicate examples likewise use `/category/` and were last crawled in late October. Today's public `robots.txt` allows `/` and disallows only `/api/`, so these reports do not prove a current robots block. The lone `noindex` URL is `/search` (intentional). The three redirect examples are protocol/host canonicalization. The three 404 examples are retired category slugs without a confirmed replacement. |
| Analytics link | A new `Irani Yaragh` GA4 account/property (`iraniyaragh.com`, property 564394906) and HTTPS web stream (`G-ERHW21LZXZ`) were created. The `iraniyaragh.com` domain Search Console property was linked successfully on 2026-11-15. Analytics has not received live site data yet because the consent-gated tag in this worktree is not deployed. |

## Implemented in this worktree

- Product JSON-LD reflects published SKU, price, stock, brand, images and entered variant attributes, with a `ProductGroup` only for distinguishable sellable variants. Review/rating markup requires real public verified-purchase reviews. Variant query URLs select the corresponding visible variant while the base product retains one canonical URL.
- Contact, About, help index/topics, policy and article pages have page-appropriate schema. Contact data is emitted only when configured; no phone, profile, opening hour, return term or shipping charge is invented.
- Sitemap discovery includes Contact, About and the 11 indexable help topics and removes the 10,000-article sitemap cap. Empty collections remain excluded from indexing.
- Product brand links use stored brand slugs, improving internal discovery. Merchant schema image URLs are deduplicated by gallery image.
- GA4 page views require visitor consent and are limited to public paths with query parameters removed. The stream's enhanced measurement is disabled to avoid automatic collection of form/search values. The privacy page offers a way to revise the choice.

## Deployment and recrawl checks

1. Deploy and verify the generated `/sitemap.xml` and shards show Contact, About and help topics. Submit the existing sitemap again only if Search Console fails to pick up the new last-modified content.
2. Inspect a real single-variant product, a real multi-variant product, Contact, About, a category and a help topic after deployment. Compare Google-selected canonical, live rendered HTML, robots status and enhancements with the actual page content.
3. Check whether currently listed `/category/` URLs redirect to their real `/categories/` counterpart when it exists, and whether obsolete categories return a truthful 404/410. Do not redirect unrelated old categories to generic pages. Monitor the 94 legacy listings as Google recrawls; the Search Console snapshot alone does not identify present redirect behavior for every URL.
4. The owner clarified on 2026-11-15 that only goods handed over in person qualify for a new return. Source policy revision `returns-v2` now blocks new shipped-order returns and the conditional storefront terms match it. The feature remains off by default and unaccepted in production. Confirm the complete public conditions before adding `hasMerchantReturnPolicy`; shipping charges and timing still depend on the actual checkout method, so `shippingDetails` is not fabricated. Retest Merchant listings after release.
5. Obtain real field data for Core Web Vitals before making a performance claim. Content and GEO opportunities that require factual editorial input are detailed in [content-geo.md](findings/content-geo.md).
6. After deploying the storefront, accept analytics on a public page and verify the GA4 Realtime report or Tag Assistant receives a sanitized page view. Verify no tag request before consent, after rejecting consent, or on private paths. The property uses Dubai reporting time (UTC+04:00) at the owner's choice and USD reporting currency because IRR was unavailable in the property form; do not send monetary ecommerce events until currency reporting is resolved.

Google's [AI feature guidance](https://developers.google.com/search/docs/appearance/ai-features) states that ordinary indexability, snippet eligibility and useful content matter; no separate AI schema or `llms.txt` is required. Structured data helps Google understand supported facts but cannot guarantee a rich result, ranking or a 100% SEO score.

## Origin TLS incident and prevention

On 2026-11-15, the direct origin at `185.211.59.93` served a certificate that had expired at 13:41:59 UTC, while Cloudflare's proxied public endpoint still returned HTTP 200. The host's twice-daily `iranyaragh-certbot-renew.service` had failed because `ensure-certificate.sh` rejected installed Certbot 5.10.0 with a version check that only matched 5.4–5.9. This was an origin renewal defect, not evidence of a Cloudflare certificate failure. Cloudflare's encryption mode was not visible in this audit.

The version check now compares numeric components; the corrected script was installed on the origin and its service was run successfully. A direct `curl --resolve` check confirmed HTTP 200 with a verified hostname and chain. The served certificate covers the root domain, `www`, and the origin IP, and is valid until 2026-11-19 00:30 UTC. `certbot renew --dry-run --cert-name 185.211.59.93` completed with exit code 0. The new six-hour GitHub workflow probes the origin directly and fails when the certificate is invalid or has fewer than 48 hours remaining. That workflow starts monitoring after this change reaches the default branch; the host renewal timer is already active.
