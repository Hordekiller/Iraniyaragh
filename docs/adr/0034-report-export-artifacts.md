# ADR-0034: Report export artifacts under the DB-authoritative render pipeline

Status: Proposed — implementation candidate; independent review pending

Date: 2026-10-25

Issue: #423. Reuses the ADR-0030 invoice-PDF storage pattern and its reviewer
decisions.

## Context

Operational reports (#29, ADR-0029) are produced on demand from live database
evidence: every read rebuilds its answer from the committed facts. Operators
asked for exportable snapshots (CSV/XLSX) of the same bounded report surface
(summary, orders, debtors). Rendering a large snapshot inside an HTTP request
would either blow the request budget or tempt us into streaming unverified
bytes from a background process. The invoice-PDF slice (ADR-0030) already
solved this shape: a database-authoritative job and artifact pipeline with a
dedicated worker, operator-approved storage capacity and integrity-verified
downloads.

## Decision

- Report export rendering reuses the ADR-0030 pipeline exactly: `ReportExportJob`
  leases in Postgres are the only execution authority, the BullMQ queue is a
  wake-up signal (`jobId` payload only), `ReportExportArtifact` rows store
  verified bytes (`bytea`) whose `id` equals the job id and whose
  `contentSha256`/`byteCount` are CHECK-verified against the stored bytes, and
  the dedicated `pdf-render-worker` process multiplexes a second BullMQ worker
  that claims, renders (CSV or XLSX via the shared format writers), persists
  and finalizes jobs. Redis carries no job state; a lost or duplicated delivery
  cannot render anything the lease does not already authorize.
- Storage is operator capacity, not deploy state. The shared admin settings
  command that approves invoice-PDF capacity also settles the `report-export`
  capacity singleton (byte budget, artifact and pending-job caps, retention).
  The worker starts inert: requests fail with `REPORT_EXPORT_DISABLED` until an
  operator approves storage. Cleanup always runs as bounded database
  maintenance, never as a file-reaper cron.
- Product surface is bounded and evidence-preserving. The exporter covers the
  three ADR-0029 snapshot kinds (`operations-summary`, `orders`, `debtors`)
  with hard row caps, money as exact integer strings, IDs instead of personal
  identifiers and no cost columns, matching the disabled-inventory-cost policy.
  CSV cells beginning with `=`, `+`, `-`, `@`, tab or CR are inert-field
  escaped so spreadsheets cannot interpret them as formulas.
- Requests are idempotent and bounded the same way as invoice PDFs: one
  idempotency key maps to one command replay row, an in-flight job attaches,
  a completed READY artifact within retention replays, a failed job returns
  `REPORT_EXPORT_NOT_READY` to its key and only a fresh key opens a new bounded
  attempt (max 5). Failure codes stay bounded (`RENDER_FAILED`,
  `RENDER_TIMEOUT`, `RENDER_UNAVAILABLE`, `STORE_REJECTED`).
- Downloads keep every invoice-PDF read gate: current staff MFA session,
  `reports.export` permission, freshness requirement, provenance headers
  (content type, length, filename, `X-Content-SHA256`,
  `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`) and full
  byte/hash/bounds verification before any response.
- Reconciliation stays a database read. After a worker restart, operators
  reconcile from `ReportExportJob` rows (`failureReason`, lease state) and the
  audit log; there is no message replay and no unbounded retry churn. Cleanup
  sessions (`app.report_export_cleanup = 'on'`) are the only path that may
  remove expired artifact bytes and free the byte budget.

## Consequences

- One worker image now serves two duty cycles (invoice PDFs and report
  exports); it still owns no port and stays single-purpose per queue
  (`concurrency 1` each).
- Report exports, like invoice PDFs, trade a little write amplification
  (artifact bytea + audit rows) for verifiable, non-repudiable snapshots that
  survive restarts and restore cleanly with the database.
- The export surface intentionally excludes the receipt/other-statement kinds
  and cost columns; widening requires a new renderer revision and capacity
  re-review, so old artifacts can be reconciled against the exact code path
  that produced them.
