# Admin session recovery (#400)

## Supported outcomes

The API keeps its five-minute fresh-authentication window for sensitive commands.
Normal access-token rotation does not advance the original authentication time.
The Admin distinguishes the following authoritative responses:

| Response | Admin behavior |
| --- | --- |
| `AUTH_SESSION_INVALID` with expired access | One shared refresh, followed by at most one replay with unchanged body/idempotency key |
| Terminal `AUTH_SESSION_INVALID` or `AUTH_SESSION_REPLAYED` | Clear the current identity; the shell redirects to login |
| `AUTH_REAUTHENTICATION_REQUIRED` | Keep the session and mounted draft; request real password + TOTP in a dialog |
| `FORBIDDEN` on the operation | Keep the identity and report the permission denial |
| CSRF/network failure | Report the failure; do not claim logout or successful mutation |

Fresh authentication uses the existing staff HTTP client, login controller and
form components. It never uses the staff fixture. Cookie issuance is serialized
with refresh/logout using the same origin-wide Web Lock as the storefront.
The returned `STAFF_MFA` principal must match the current staff user; a different
identity ends the local session rather than applying the previous user's draft.
Late responses cannot clear or replay a newer login. Passwords, challenge tokens,
TOTP codes and access tokens stay in memory.

After MFA, the user must explicitly resubmit the original operation. Closing the
dialog keeps the draft and a banner allows reopening it. SMS template editing
and settings remain mounted, and their blocked UI states are released without
saving or sending SMS. Session management may refresh its read-only list; no
revoke/logout-all command is automatically repeated.

## Cache policy

Admin API calls use `cache: 'no-store'`. API middleware sets `no-store` and
`Pragma: no-cache` before auth guards for bearer requests and auth routes. The
exception filter applies the same policy to errors, including anonymous guard
failures. Express automatic weak ETags are disabled. The public catalog's
explicit strong ETags/conditional-revalidation interceptor is preserved.
Headless application contexts (media worker) do not require an HTTP adapter.

Cookie names/attributes, Origin validation, CSRF, inactivity limits, rate limits,
RBAC and the freshness window are not changed.

The real browser test reproduced one additional stale-shell case: revoking the
current device clears the server-issued CSRF cookie; a subsequent invalid bearer
previously caused an impossible refresh, received `AUTH_CSRF_INVALID`, and kept
navigation mounted. Recovery now fails closed as invalid session when its CSRF
proof is absent. A CSRF rejection with the cookie still present remains a
recoverable error rather than confirmed logout.

## Verification and release

Unit/HTTP tests cover fresh authentication, explicit resubmit, draft retention,
terminal revocation/replay, different identity, delayed failures, CSRF/network
errors, refresh coalescing and auth error cache headers. PostgreSQL integration
tests cover session rotation, replay, ownership and concurrency. The browser
journey uses real password/TOTP, settings commands, reload and session revocation.
Only an isolated loopback `*_test` database can age its own test session to
exercise the boundary without a five-minute sleep. The API and UI contain no
test-only time or authentication endpoint.

Release requires green CI/security checks, official exact-SHA images, verified
backup and deployment through `scripts/deploy/deploy.sh`. Issue #400 remains
open until the operator's real staging login/reload/MFA/logout acceptance has
evidence. Local or CI tests do not substitute for that staging evidence.

### Database gate repair

CI run `37619618045` exposed a pre-existing catalog concurrency failure:
`catalog-authoring.integration-spec.ts` / `serializes concurrent edits, with one
version winner and no mixed values`. A raw row-lock query surfaced PostgreSQL
`40001` through Prisma `P2010`; catalog idempotency only retried `P2034`, leaking
the aborted transaction instead of reaching the existing `STALE_VERSION` rule.
Eight local race runs passed before the fix, so occurrence depends on scheduling;
three deterministic regression tests failed on the captured error envelope.

The catalog now recognizes only authoritative transaction conflicts (`P2034` or
raw `P2010` with `40001`/`40P01`) and reruns the complete rolled-back transaction,
with the same payload/key and the existing three attempts/backoff. Exhaustion is
a stable conflict, never success. Syntax/permission/unique/network raw errors
are not blindly retried. No concurrency assertion was removed or weakened.
Twenty-seven unit tests and 21 real catalog/idempotency integration tests passed.
The helper is used by catalog idempotency; SMS/payment send retry rules are not
changed.

References: [Prisma error envelopes](https://docs.prisma.io/docs/orm/reference/error-reference),
[PostgreSQL transaction retry rules](https://www.postgresql.org/docs/18/mvcc-serialization-failure-handling.html).
