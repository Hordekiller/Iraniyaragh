# Customer transactional SMS delivery (#314)

Scope: the worker sends an SMS.ir verification-template message for three durable
outbox effects: verified payment, staff dispatch and staff-attested delivery.
Each template receives one `Order` variable (the order number, at most 25
characters). Tracking is viewed through the authenticated customer order page;
the message does not include a long tracking code, phone number or address in
the outbox payload. This is provider *acceptance*, not handset delivery proof.

The shipping events are written in the same serializable transaction as the
shipment/fulfillment command. The existing outbox relay projects them into one
effect each. The worker polls pending customer effects in bounded batches and
atomically changes `PENDING` to `FAILED` before calling the provider. This is
intentional: after a crash, timeout, thrown error or ambiguous upstream result,
an automatic resend could duplicate an SMS. An accepted result is `COMPLETED`
with the provider message ID. A definite rate-limit response is retried with
bounded backoff (at most eight attempts). Rejection, unavailable, ambiguous
result or a missing template stays `FAILED` for human investigation. Never
blindly reset `FAILED` to `PENDING`; first check the provider dashboard for
the effect's `providerMessageId`/time and the customer's delivery evidence.

The Admin template section persists non-secret IDs and dispatch reads them live.
Private environment IDs remain fallback only until the first database save.
Staging/production configuration requires distinct approved verification
template IDs: `SMS_IR_ORDER_PAID_TEMPLATE_ID`,
`SMS_IR_SHIPMENT_DISPATCHED_TEMPLATE_ID`, and
`SMS_IR_SHIPMENT_DELIVERED_TEMPLATE_ID`, in addition to the OTP template/key.
Each template must define the `Order` parameter and customer-safe Persian copy.
In development/test the fake provider can be used. Real account, sender,
template, timeout and handset acceptance remain under #114. Keep keys and
personal data out of issues, logs, and test artifacts.

Operator diagnostics: inspect `OutboxEffect` by `kind`, `status`,
`lastResultCode`, `lastAttemptAt`, `attemptCount` and `providerMessageId`;
join `OutboxEvent` to distinguish unprojected from undelivered effects. No
automatic replay of uncertain results is provided. The worker logs aggregate
counts only. A future operations UI can expose masked diagnostics and a
reviewed manual retry policy, but that is not a pretext to resend unknowns.


## Real provider acceptance

See [SMS.ir staging acceptance](SMS_IR_STAGING_ACCEPTANCE.md) for approved private
templates and real handset evidence. Network/TLS/stream failures, HTTP 5xx,
unprovable success and generic/undocumented provider results are `unknown_result`;
no automatic resend follows them. Customer OTP exposes this uncertainty without
invalidating a potentially delivered challenge or bypassing cooldown. A provider
throttle invalidates the undelivered challenge and returns 429 with Retry-After.
Admin account validation uses the non-sending credit endpoint and never projects
credit, secrets, raw responses or full destinations. Controlled operator tests
have a separate durable pre-dispatch claim; they are not login challenges.
