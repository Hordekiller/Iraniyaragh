# ADR 0031 — Configurable cost method, valuation disabled

Operator decision (2026-10-14): offer cost-method selection in Admin and leave
financial inventory valuation disabled. This is a preparation slice of #422,
not historical cost attribution or valuation acceptance.

Reuse InventoryModule, current STAFF_MFA/settings.manage/fresh-auth guards,
shared contracts, durable idempotency commands and append-only policy revisions.
The method is explicitly null (undecided), FIFO, or MOVING_WEIGHTED_AVERAGE.
Missing opening/receipt costs always require evidence. Neither catalog costPrice
nor zero may be substituted for missing historical cost.

The API accepts only method, expectedVersion and reason. There is no activation
field or command. The server reports valuationEnabled=false and
activationGate=COST_LEDGER_ACCEPTANCE_REQUIRED for every configuration, including
an empty configuration. Selecting a method cannot enable calculation or rewrite
stock/financial history. A future independently reviewed activation command must
verify attribution, rounding, opening/transfer/return/stocktake treatment and an
effective policy revision before use. #422/#358 remain open.

Revisions and actor-scoped command hashes append atomically with redacted audit.
A matching replay returns its historical revision, never changes the current
head. Version conflicts reject; server and SQL serialize revision numbering.
The UI distinguishes a saved method from activation, retains uncertain request
keys, reconciles before retry and rechecks the actual head after historical replay.
Request failures never become a zero valuation or a configuration success.

Acceptance: current permission/fresh-auth/strict body tests; real PostgreSQL
same-key/different-key concurrency, restart/replay, immutable evidence and audit
rollback; Admin loading/empty/validation/conflict/uncertain retry and reload;
browser navigation/select/save/reload; full CI/security and official release.
No live cost ledger, stock or payment mutation belongs to this slice.
