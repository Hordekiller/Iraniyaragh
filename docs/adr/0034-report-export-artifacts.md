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
- Storage is operator capacity, not deploy state. A separate `report-export` capacity singleton bounds snapshots plus artifacts
  (byte budget, artifact and pending-job caps, retention). A production activation
  command is still required before release; the provisioning script is test-only.
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
  idempotency key maps to one command replay row, the same actor/key replays its existing job,
  a fresh key always creates fresh evidence (even with identical filters), a failed job returns
  `REPORT_EXPORT_NOT_READY` to its key and only a fresh key opens a new bounded
  attempt (max 5). Failure codes stay bounded (`RENDER_FAILED`,
  `RENDER_TIMEOUT`, `RENDER_UNAVAILABLE`, `STORE_REJECTED`).
- The worker materializes the exact table once in an immutable, SHA-256 checked
  `ReportExportSnapshot`. Retries serialize those bytes without rereading live
  data. `/reports/admin/exports/:id/snapshot` exposes the same private table for
  reconciliation. Truncation fails closed; snapshot bytes share the storage
  budget. Terminal jobs/commands and audit history survive byte cleanup.
- Downloads keep every invoice-PDF read gate: current staff MFA session,
  `reports.export` permission, freshness requirement and requesting-actor ownership, audited access, provenance headers
  (content type, length, filename, `X-Content-SHA256`,
  `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`) and full
  byte/hash/bounds verification before any response.
- Reconciliation stays a database read. After a worker restart, operators
  reconcile from `ReportExportJob` rows (`failureReason`, lease state) and the
  audit log; a recurring bounded Redis wake-up recovers lost deliveries and expired leases.
  The database attempt budget remains authoritative, including worker crashes. Cleanup
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

## Remaining issue acceptance

This slice delivers the backend CSV/XLSX snapshot pipeline. Report PDF rendering,
Admin page integration and browser download acceptance remain under #423; this
candidate must not close that issue or claim production acceptance.
