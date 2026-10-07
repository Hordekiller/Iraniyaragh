# Customer UI release evidence

## Delivered source changes for #401

PR #399 merged as `8843b2f1df7dc89f7803363c9faf21f3c7691884` after all
quality, database, browser E2E, Sonar, CodeQL and dependency gates passed.
It restores legal routes and strengthens existing customer profile, addresses,
order pagination, session restoration and checkout navigation. It does not close
#389 or establish handset/payment acceptance.

The subsequent UI slice restores the local homepage hero artwork, adds manual
RTL slide controls and optional rotation with focus/hover/visibility/reduced-motion
pausing, and connects mobile tracking to the existing owned-orders route. All six
mobile destinations remain accessible at 320px with safe-area padding and correct
active-route state. A real 320px browser test exposed header overflow from its
non-shrinking brand/tagline; the compact header now fits without hiding controls.

Validation: Web lint, typecheck, runtime asset policy, build, 364 unit tests, and
four fixture-disabled browser tests (desktop and 320px mobile) passed. Browser
coverage includes artwork decoding, slider controls, accessibility, tracking
entry, legal routes and anonymous account states. Real customer authentication,
profile persistence and shipment acceptance still require staging evidence.

## Release sequence and remaining gates

1. #400: Admin auth error classification, fresh-MFA recovery, cache safety and
   consistent invalid-session UI; preserve server guards and explicit resubmit.
2. #401: merge UI only after complete required CI; publish and deploy exact merged
   SHA through the repository pipeline. Preserve the currently healthy release.
3. #389: real customer OTP -> profile/address persistence -> account orders,
   tracking, reload and logout. Keep unavailable email/consent/export/closure
   contracts explicitly open.
4. #388: staff product/SKU/IRR pricing/description/image -> publish -> storefront
   acceptance; video remains open unless actual worker and authoring support exist.
5. #114: operator reported one received test SMS; retain the issue until real OTP
   login and applicable transactional, duplicate/replay/failure acceptance are
   evidenced. Never change payment mode as part of SMS work.
6. #393: verified automatic ClamAV signature maintenance is an independent gate.
7. #347/#352, #348, #338/#336, #358 and #359 remain separate domain/security
   work: stocktake, returns, credit ledger, reports and role management.
8. #122-#130/#140/#136 remain tracked for content, discovery and operational
   capability. Passing UI tests does not close those broader epics.

Payment provider acceptance and real-money reconciliation remain independent
release gates. Do not mark an issue DONE solely because code exists or an image
boots. Record exact SHA and sanitized acceptance evidence for each supported path.
