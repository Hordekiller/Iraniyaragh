# ADR 0030 — Private, bounded Persian store invoice PDFs

Status: design before implementation; #419, after immutable issuance #417 and
customer publication #418. This is a store document, not fiscal/Moadian acceptance.

## Source and renderer evaluation

Existing InvoiceDocument is the immutable source of seller/buyer/address/line/tax
and integer IRR snapshots. InvoicePublication authorizes customer visibility
separately. Existing API/media runtime has no production PDF renderer; Playwright
is currently test infrastructure. Existing locally licensed Vazirmatn WOFF2 and
OFL notice can be reused for Persian/Latin text without a CDN.

Chromium supports static HTML A4, print CSS, repeated table headers, tagged PDFs
and embedded fonts ([Page.pdf](https://playwright.dev/docs/api/class-page#page-pdf)).
Use a dedicated unprivileged worker image with the Chromium sandbox enabled and
the narrow namespace seccomp configuration described in the official
[Docker guide](https://playwright.dev/docs/docker). Never make the API image launch
a browser or weaken the live host's global security policy.

A local synthetic 70-row evaluation confirmed three A4 pages, Persian shaping,
RTL table layout and exact 9007199254740993 text. This is renderer selection
**evidence only**: it does not prove invoice ownership, runtime isolation, artifact
retention or deployment acceptance. The local cached browser was blocked by
AppArmor; the already-installed system Chrome ran with its sandbox enabled.
The final pinned worker browser/image must be tested independently. Do not disable
its sandbox to make an acceptance test pass.

## Artifact storage and privacy

For the present staging volume, private bounded PostgreSQL bytea artifacts avoid
introducing a second bucket, public-media policy or signed link. Each immutable
artifact has an opaque id, document/input hash, renderer/template/font revisions,
PDF SHA-256, byte count and creation evidence. Maximum artifact size is 2 MiB;
SQL verifies length/hash/document linkage, rejects update/delete and reconciles
READY job evidence. Existing database backups include the bytes; a release must
restore and verify artifact hashes before relying on a backup with PDF data.
Original issued snapshots/number and financial history are never overwritten.
Capacity and measured artifact growth must be reviewed before wider rollout; no
unbounded on-demand render, automatic public URL or hidden artifact retention job.

## Jobs and runtime

A durable queued/running/ready/failed render job binds an immutable issued input
hash and template/font revisions. Equal-input requests converge on one artifact;
request keys are scoped and fingerprinted, conflicting replay rejects, and current
authorization is rechecked on every retry. SQL lease/version checks and bounded
attempts recover from restart without duplicate issuance. Timeout/failure never
reports ready. Retry concerns private rendering only, never payment/SMS replay.

One render at a time, at most 100 lines, bounded HTML/input bytes, 20-second render
budget, 512 MiB/one CPU/256 PIDs worker limit and bounded database connections.
Render a fixed server template from escaped text; no user HTML/CSS/URL. Inline
licensed font only, JS/service workers off, all outbound browser requests blocked.
The browser/render child gets no database/provider/auth secrets in its environment.
Failure logs contain safe codes/correlation/job identity only, no PDF text or PII.
The worker and API are distinct official exact-SHA images. No VPS build/manual
container patch. Actual worker memory/CPU/restart/isolation tests are release gates.

## API and UI boundaries

STAFF_MFA + current invoices.read for staff; CUSTOMER_OTP + authenticated userId,
ACTIVE customer and current publication for customer. Customer access depends on
accepted #418 rather than a second ownership implementation. Unknown/foreign/
revoked documents share not-found behavior. Queries/body cannot override owner,
source input, renderer/font, private bytes or artifact state.

Authenticated binary download rechecks current document access and stored SHA-256,
uses no-store, nosniff and safe attachment filename; no public/product-media key,
signed URL or share token is returned. Downloaded files cannot be recalled by a
later publication revocation. Print/download UI has explicit pending/failed/retry
states, preserves uncertain request keys and downloads only authoritative READY
bytes. Financial correction remains its own linked document under #421.

## Acceptance

- Real immutable invoice number/lines/totals/tax/source hash match PDF text;
  Persian/Latin/font embedding, A4, multipage/header and glyph inspection.
- Malicious text/remote URLs cannot execute/fetch; no fallback external fonts,
  provider secret, OTP or customer PII in diagnostic evidence.
- SQL transaction/concurrency, equal/different key replay, durable lease/restart,
  stale completion rejection, artifact immutability/hash/byte budgets.
- STAFF_MFA/current permissions/customer ownership and revoke-before-download.
- Admin/customer browser flows, full install/lint/types/unit/build/database/OpenAPI,
  CI/security, official images, backup restore/hash verification, exact-SHA rollout.

This ADR or a synthetic PDF is not completion of #419. Missing live/template/
worker/ownership evidence keeps the relevant acceptance open.
