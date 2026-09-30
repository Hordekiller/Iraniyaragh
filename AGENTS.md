# Security and Data-Safety Rules for Coding Agents

These are the repository's standing agent rules. Product scope, priority, UI
direction and delivery workflow come from the user's current instructions, not
from old sprint or agent-allocation plans.

- Never commit or disclose credentials, OTPs, tokens, real customer data or
  production database/object-storage exports. Use environment secrets and
  redact diagnostic evidence.
- Enforce authentication and current permissions on the server for every
  protected action. UI hiding is not authorization. Preserve CSRF, rate limits,
  session revocation and audit redaction.
- Preserve money and inventory correctness: integer monetary units, immutable
  stock/receivable movements, transactional state changes, verified payment
  callbacks, idempotent retries, and explicit order/payment/fulfillment states.
  Never fabricate a paid payment or successful provider response.
- Do not turn a failed or uncertain request into a success message. Reconcile
  external payment, SMS and stock outcomes before claiming completion.
- Demo/fixture identities, products, prices and stock must be clearly labelled
  and isolated from production sales. Never run development seed or fixture
  authentication against the live sales database.
- Keep production data recoverable: use forward database migrations; do not
  rewrite an applied migration or delete financial/audit history. Verify a
  backup by restoring it before relying on it.
- A build or deployed page is not evidence that real SMS, Zarinpal, storage or
  end-to-end sales have been accepted. Do not enable live customer payments
  until the controlled acceptance and reconciliation gates pass.

`docs/SECURITY.md` and the domain invariants in `docs/FOUNDATION.md` describe
the existing system behavior. Historical roadmaps are context, not standing
instructions to agents.
