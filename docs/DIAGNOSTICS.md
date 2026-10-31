# Operational diagnostics

This extends the existing redacted logger, request context, exception envelope,
Docker logs and business audit. It adds no public log reader, customer telemetry
collector, external analytics destination or diagnostic database table.

The shared contracts package now builds a CommonJS runtime for the API/workers;
browser bundlers keep transpiling its typed source. Turbo builds this dependency
first, and each Docker build explicitly includes it. For a standalone API build
outside Turbo, run `pnpm --filter @iranyaragh/contracts build` first. The API
artifact check actually loads the runtime exports so a typecheck-only success
cannot hide a missing or incompatible package in production.

## Follow one failure

Product creation and description-save errors display **کد پیگیری**. The same
opaque reference is sent in `X-Request-ID`, returned by the API and proxy even on
HTTP errors, and written to structured server logs. Offline failures retain the
client-generated ID in the error and a metadata-only browser console record;
when the request never reached the server, there is no server entry to retrieve.

On the VPS, from `/opt/iranyaragh`:

```sh
./scripts/deploy/logs.sh --request-id SUPPORT_CODE --since 2h -n 1000
./scripts/deploy/logs.sh --level error --since 30m --no-follow
./scripts/deploy/logs.sh --follow --event http.request.completed api
./scripts/deploy/logs.sh --area catalog --since 2h -n 1000 api
./scripts/deploy/logs.sh --operation catalog.product.create --level error --no-follow api
```

The first command joins `requestId` and `correlationId` across services. Session
recovery retains the root correlation while each attempt has its own request ID.
Identifiers are diagnostic references, never authentication or idempotency keys.
The existing same-key mutation/reconciliation rules remain authoritative.

`-n` selects finite history and disables follow; `--follow` can explicitly restore
it. History defaults to one hour/200 lines per service; tail is bounded to 10,000.
Filters stream input with a bounded line buffer. Docker/operator access is required;
`audit.read` is not permission to read arbitrary host/container output.

## What is recorded

- API: every rejected/aborted request, every write completion and reads taking
  at least two seconds, plus fast Admin reads. Healthy quick public reads stay quiet. UTC timestamp, release,
  service, request/correlation IDs, registered route template, method, HTTP status,
  duration, stable error code and approved source coordinates are included.
- Admin operations include fixed area/operation labels. Product creation, description
  saves, status changes, attribute configuration, variant generation/prices, media
  upload preparation/transfer/confirmation, and workbook upload/validation/commit
  can be filtered independently. Labels are derived from known routes; product IDs,
  search/filter values and signed URLs are never copied into them. Other Admin
  areas retain coarse read/write labels. Browser failures use the same labels;
  client reports remain browser-local and never establish a business outcome.
- Validation: registered field paths and constraint names, bounded to 16 findings
  and five nested levels. Unknown extra field names are masked. No submitted field
  value, product HTML, file, body, query or credential is recorded.
- Edge: status, coarse surface, opaque IDs, total/upstream timings and upstream
  status. Request URI, IP, cookies, user agent, referer, headers and signed query
  strings are absent. Native per-request Nginx error text is disabled because it
  cannot be redacted; structured access errors remain, and startup/configuration
  errors still use the container's global startup error stream.
- Admin/storefront: failed HTTP/network/timeout/parse attempts have metadata-only
  browser records. Next server error hooks add release, route template and safe
  error classification; the request and raw exception are never serialized by
  these hooks. Public SSR catalog calls retain their own attempt IDs and forward the incoming
  correlation ID to API.
- Media/PDF/report/outbox workers: distinct service identity, connection failures,
  retries and exhausted deliveries. Job references are SHA-256 prefixes, not job
  payloads. Existing private domain job evidence remains the source of final
  business state; a queue event does not prove payment or SMS acceptance.

Unhandled API failures keep safe type/code/source coordinates; SQL/provider error
messages, request bodies and arbitrary exception values are omitted. Production
and staging stacks are disabled by default. Existing recursive redaction remains
in force, including short credential assignments and credentials/queries in URLs.

## Retention and rollout

Compose uses Docker's local logging driver, 10 MB segments, five files and
compression for each service. Rotation is size-based, not a guaranteed number of
days. The official deploy/rollback captures a private compressed metadata archive before
replacing containers. Archives live in `/var/log/iranyaragh/diagnostics`, retain up
to 30 files for at most 14 days, and cap each snapshot at 10,000 records from finite
24-hour/2,000-line-per-service input. Archive directories are mode 0700 and files
0600. A second allowlist removes arbitrary messages, request bodies and unknown
payload fields, retaining approved failure codes, validation rules and coordinates.
Archive creation must succeed before replacement; temporary partial files are
removed on failure. These are local operator archives, not an external alerting
service. Never commit incident exports.

To look up a code from an older release on the VPS:

```sh
zcat /var/log/iranyaragh/diagnostics/diagnostics-*.jsonl.gz | python3 scripts/deploy/diagnostic-log-filter.py --request-id SUPPORT_CODE
```

Changing the logging driver recreates containers, including data services on the
first rollout. Use the official deployment, restore-verified backup and readiness
checks; retain all named data volumes. No database migration or business/provider
mode change is required. Runtime `SERVICE_NAME` and `APP_VERSION` identify the
actual component/release. Reverting source does not restore discarded log history.

Acceptance must include a synthetic rejected request without fixture login or
product/customer mutation, matching browser/proxy/API IDs and operator lookup,
validating the active logging driver/rotation options, and checking that synthetic
secret markers and request URLs are absent from the matching records.
