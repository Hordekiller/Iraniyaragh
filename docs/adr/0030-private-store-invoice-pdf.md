# ADR 0030 — Private, bounded Persian store invoice PDFs

Status: fixed-template and private persistence slices implemented on candidate
branches; jobs/worker/download/runtime remain proposed;
#419, after immutable issuance #417 and
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
The persistence candidate SQL verifies length/hash/document linkage and rejects
update/delete. READY job reconciliation remains unimplemented. Database backups must include the bytes; a release must
restore and verify artifact hashes before relying on a backup with PDF data.
Original issued snapshots/number and financial history are never overwritten.
Capacity and measured artifact growth must be reviewed before wider rollout; no
unbounded on-demand render, automatic public URL or hidden artifact retention job.
Before enabling requests, a transactionally enforced global storage reservation
and pending-job cap are required, including concurrent API instances/restarts.
Per-file bounds alone do not cap accumulated storage or retained backup growth.
Capacity exhaustion must reject new work explicitly; no destructive financial
artifact cleanup or unbounded queued work. Exact deployment budgets and backup
headroom remain runtime acceptance, not an invented current operator setting.

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

## Implemented fixed-template boundary

`invoice-pdf-template.ts` accepts only the customer-safe immutable issued
projection, prints stored integer IRR strings without repricing, escapes all text,
and pins the existing approved print wordmark and OFL Vazirmatn bytes by SHA-256.
No client HTML/CSS/URL is interpolated into executable markup; static CSP denies
scripts, remote images/fonts, navigation bases and form submission. Private staff
notes, audit/provider fields and internal identifiers are never serialized.
Input is bounded to 128 KiB/100 rows, HTML to 1 MiB; malformed data/assets produce
one sanitized error without reflecting customer content. Each line uses an item
row plus four readable amount columns so long IRR values do not cross cells.
The generated HTML fingerprint covers the actual template/assets/date rendering.

Unit and real Chromium template tests cover exact amounts above 2^53, local
asset integrity, malicious markup, loaded Persian glyph font, no external
requests, multipage A4 and output-size bounds. The browser test writes only a
labelled synthetic PDF; no production export or live DB fixture is used.

The fixed-template slice adds no production dependency, endpoint, schema, worker or button.
It does not claim a durable render queue, private download, final worker image,
512 MiB sandbox/resource acceptance or staging PDF acceptance. Those remain
required before exposing generated PDF functionality.

## Private persistence foundation (candidate; not deployed)

The dependent persistence slice adds `InvoicePdfArtifact` and
`InvoicePdfStorageCapacity` in a forward-only transactional migration. It seeds
neither a capacity budget nor activation. An operator-approved byte budget and
artifact-count budget must exist before any insert; absence/disabled/exhausted
capacity fails explicitly. These are private database storage limits, not an
approved retention or production capacity policy.

SQL validates the issued document's immutable `payloadHash`, lowercase SHA-256
identities, exact byte count/hash, PDF signature and 2 MiB limit. Signature/hash
checks are storage integrity checks, not a PDF parser or renderer acceptance.
The immutable artifact cannot be updated/deleted through ordinary DML. Its unique
document/input/renderer/template/font identity preserves the original output on
retry. The internal store returns metadata only, never bytes or a public URL.
There is no registered route, customer download or render request in this slice.

Every insert locks the singleton capacity row before checking both budgets, then
charges only an actual successful insert. Concurrent different inputs cannot
overbook the final byte/slot; `ON CONFLICT DO NOTHING` does not consume capacity.
Counter edits are limited to the nested artifact-insert trigger; versioned budget
changes cannot undercut retained evidence. Database-owner privileges can always
alter schema/triggers: these invariants do not replace server authorization.
The internal store commits redacted audit evidence in the same serializable
transaction. A failed audit rolls back bytes and counters; an unclassified driver
error returns sanitized uncertainty, never a READY result. Reconciliation of the
same immutable input returns the original artifact even when new storage is
disabled/full. This is internal DB idempotency, not the future authorized job
request/idempotency contract.

Real isolated PostgreSQL acceptance extends genuine order → draft → issuance
fixtures. Tests cover concurrent service/independent SQL writers, exact size
bounds, SQL bypass attempts, restart replay, immutable evidence, capacity and
audit rollback, without changing stock, payments or invoice amounts. Synthetic
PDF-signature bytes exercise storage constraints only, not rendering acceptance.

Still required before activation: globally bounded queued-job reservations,
fenced leases/attempts and restart recovery, trusted rendering input binding,
dedicated sandboxed worker/image/resource proof, current-authority request and
download contracts, customer revocation checks, Admin/customer UI, operator
capacity approval, restored-backup artifact hash verification and exact-SHA
runtime acceptance. Issue #419 remains open.
