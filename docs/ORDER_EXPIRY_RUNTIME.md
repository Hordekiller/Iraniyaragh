# Durable abandoned-order expiry — #450

This integration reuses #454 (locked payment/deadline checks), #455 (system
attribution), #451 (bounded reservation batching) and #453 (payment-page recovery)
on main `f62e633bca74968411a129494066a79952b5a07d`. It adds the missing runtime
to the existing media-worker. It does not declare V1 or live acceptance complete.

## Activation and eligibility

`ORDER_EXPIRY_ENABLED` defaults to `false` and accepts only `true`/`false`.
The existing worker and durable Redis volume host the queue; no new service,
database table, privileged User, HTTP route or provider call is introduced.
Disabling and restarting the worker removes its periodic scheduler and preserves
queued jobs and failure evidence. All worker instances must use the same setting.

Only due `PENDING_PAYMENT` orders with no Payment record enter the automatic
path. Every individual job rechecks current status, deadline and all payment
evidence under the existing order lock and Serializable transaction. Any payment
attempt, including a historical failed attempt, requires explicit reconciliation.
The existing command commits one transition, reservation release, audit facts and
deduplicated `ORDER_EXPIRED` outbox together. It never changes on-hand stock,
creates a paid record or initiates payment/SMS.

## Bounds, recovery and poison handling

- One durable dispatch every 60 seconds, at most 100 selected IDs per dispatch.
- A queue-wide concurrency limit of one includes multiple worker processes.
- A dispatch respects 200 active/waiting/delayed jobs; one order per execution.
- Five attempts with exponential backoff starting at one second. Database
  transaction limits and the command's existing bounded contention retries apply.
  The #451 measurements describe the standalone inventory batch command; they
  are not a claim that a multi-order sweep executes in ten SQL statements.
- Stable hashed job IDs coalesce enqueue retries. A persisted ID cursor advances
  only after successful enqueue and wraps after reaching the end. Retained poison
  jobs cannot monopolize the first page. Queue replay after a retention window
  still rechecks the database and cannot duplicate committed effects.
- Completed and failed histories each retain the latest 1,000 jobs. This bounds
  Redis history; it is not permanent financial history. Terminal failures may be
  eligible again after their queue history ages out. Immutable successful domain
  evidence remains in PostgreSQL. A poison job rolls back its own transaction and
  does not block healthy orders.
- Redis AOF stores schedules/cursor/jobs across Redis restarts. BullMQ renews the
  active job lock and recovers stalled jobs after worker loss; PostgreSQL order
  locks and state/attempt checks fence duplicate delivery. Exactly-once domain
  effects do not depend on a queue delivering only once.
- Logs contain counts and fixed failure labels. Raw exceptions, customer data,
  provider evidence and Redis/DB connection strings are never persisted as job
  failure messages. No automatic job is interpreted as payment failure/refund.

## Operational acceptance

Before production activation: pass exact-head quality/security, real PostgreSQL
and Redis integration, payment/cancel races and Web deadline tests; publish the
official exact-SHA images; restore-verify the release backup; use the official
deployment command. Then enable in the private environment and restart the
existing worker through the normal release path.

Supervise a labelled, isolated-stock unpaid order with zero Payment records.
Observe due deadline, one normal domain expiry, `reserved=1 → 0`, unchanged
`onHand=1`, `available=0 → 1`, one transition/audit/outbox and public storefront
recovery. Separately verify paid/attempted orders stay protected. Test restart and
replay without direct balance writes, deleting history or re-sending providers.

Monitor fixed `selected`, `expired`, `noop`, `backpressure` and `dead_lettered`
log counters and retained queue failures. Reconcile an inconsistent order with
permissioned domain operations before retrying its failed job. Do not fix it by
editing balances. Disable/restart all workers for incident containment; retain
committed financial/stock/audit history. #450 stays open until controlled runtime
acceptance. No `v1.0.0` tag is justified by these source changes alone.

## Local verification — 2026-10-20

- API units: 138 files / 1,768 passed; Web: 57 files / 439 passed.
- Real PostgreSQL/Redis integration: 44 files / 455 passed, zero skips.
  Includes actual dispatch, queued worker restart/replay, payment inserted after
  dispatch, poison-order rollback/redaction and subsequent healthy processing.
- Repository lint and production API/Admin/Web build passed. API/Web types passed;
  repository-wide typecheck and exact-head GitHub gates are recorded with the PR.
- Sixty-three existing migrations applied to the task-owned `_test` database.
  No new migration, applied-history edit or production operation was required.

Retained setup failures: the initial full database run had 453 passes and a
bootstrap suite failure (two unexecuted cases) because the required baseline role
was absent. After running the same guarded seed used by CI in this isolated test
database, the unchanged suite passed 455/455. That seed includes explicitly
labelled demo catalog records, isolated from sales. The initial sandbox API run
failed 26 suites; unchanged execution with local-server permissions passed all
138. The initial sandbox Admin build could not parse TypeScript `--showConfig`
output; the unchanged build outside the sandbox passed. These initial runs are
not counted as successful checks. No timeout, retry policy, assertion or business
rule was weakened to obtain the passes.
