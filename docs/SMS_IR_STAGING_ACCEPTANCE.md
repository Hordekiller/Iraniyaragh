# SMS.ir staging acceptance — Issue #114

Code/tests are not provider or handset acceptance. Keep #114 open until the
operator evidence below is complete. Payment configuration is independent and
must remain unchanged throughout this procedure.

## Provider contract and evidence limits

The vendor's [official Node implementation](https://github.com/IPeCompany/SmsPanelV2.nodejs/blob/master/index.js)
uses HTTPS `api.sms.ir`, `x-api-key`, POST `/v1/send/verify`, and GET `/v1/credit`.
The [official .NET documentation](https://github.com/IPeCompany/SmsPanelV2.DotNet#verify-send)
shows a ten-digit Iranian mobile beginning with 9, verification-template
parameters, and a numeric message ID. The existing canonical `+989…` to `9…`
transformation is preserved. Account credit is numeric in the official SDK.

This does **not** establish the operator's test-key restrictions or whether it
can deliver to a real handset. The official SDK points to
[REST documentation](https://apidocs.sms.ir/) and the authenticated developer
panel for status codes. During the 2026-10-04 audit, REST documentation could not
be fetched with valid TLS; the status-code panel was inaccessible. Do not bypass
TLS validation. Existing recognized error-code mappings remain covered by
regression tests; an undocumented code or generic internal error is uncertain.

No dedicated sandbox endpoint has been verified. Confirm the account/test-key
rules with SMS.ir before sending. Do not invent an endpoint or move vendor
configuration into Auth/domain logic. An HTTP 200 without a valid positive
message ID is not acceptance. A timeout, network/TLS/stream error, unexpected
response, internal provider error, or HTTP 5xx remains `unknown_result`; never
blindly retry it. Only an explicit rate-limit result permits the existing bounded
transactional backoff.

## Private staging prerequisites

Use the existing private `infrastructure/docker/.env.staging` on the VPS. Do not
paste credentials, OTPs or full destinations into tickets, GitHub, commands,
reports or screenshots. Never commit the file or bake values into an image.

| Environment name | Approved definition required |
|---|---|
| `SMS_IR_API_KEY` | Operator-owned test/account key; restrictions verified privately |
| `SMS_IR_OTP_TEMPLATE_ID` | Customer login; exactly `Code` |
| `SMS_IR_ORDER_PAID_TEMPLATE_ID` | Paid order; exactly `Order` |
| `SMS_IR_SHIPMENT_DISPATCHED_TEMPLATE_ID` | Dispatched shipment; exactly `Order` |
| `SMS_IR_SHIPMENT_DELIVERED_TEMPLATE_ID` | Delivered shipment; exactly `Order` |
| `SMS_IR_TIMEOUT_MS` | 5000 |

The four template IDs may instead be entered in the Admin section below; these
environment values are only the fallback until the first database save.

Inspect each actual approved template's Persian copy, parameter spelling and
purpose in the provider panel. A configured ID is not proof of approval. Stop
only the affected path if approval is pending. Never reuse the login template
for transactional notifications.

`SMS_PROVIDER_MODE=disabled` remains fail closed until all required settings and
approvals exist. Set it to `smsir` only in the private configuration during an
authorized release. Do not change `PAYMENT_PROVIDER_MODE` or Zarinpal variables.

For the separately confirmed Admin test send, privately configure
`SMS_IR_TEST_MOBILE` with one operator-owned canonical Iranian destination and
explicitly opt in using `SMS_IR_TEST_SEND_ENABLED=true`. The default is false.
No destination can be supplied in the Admin request. Turn the opt-in off after
acceptance using the deployment configuration/release procedure.

## Enter approved templates in Admin

Open `/admin/settings/sms` → **قالب‌های SMS.ir** with a fresh STAFF_MFA session
and `settings.manage`. Enter the actual four approved IDs; the required parameter
names and proposed Persian copy appear beside each field. IDs are non-secret
configuration. They persist in PostgreSQL, survive reload/restart, and are read
by OTP and transactional dispatch without restarting the API or worker.

A missing field may remain blank while SMS is disabled. Non-null IDs must be
distinct for all four purposes; API, bootstrap and a forward database constraint
reject reuse of one template for different customer-facing messages. Saving does not register
or approve a provider template, send an SMS, enable the provider, or rotate a key.
The first saved database configuration becomes authoritative for all four fields,
including blank values. Before the first save, private environment template IDs
remain the backward-compatible fallback. All four effective IDs are required at
active-provider bootstrap. Clearing an active template is denied until SMS is
disabled through deployment configuration.

The API uses version checks and actor-scoped durable idempotency: replay of the
same request returns its original response, even after later changes; conflicting
payloads or stale versions return 409. After a lost response, retry the same
request. After a version conflict, reload and reapply the intended change.
Only IDs, versions, hashes and safe audit field names are stored, never raw keys,
OTPs or destinations. Invalid/unknown fields are denied by server validation.

## Admin and delivery safety

`/admin/settings/sms` uses the existing live API. Server-side `STAFF_MFA`,
`settings.manage` and fresh authentication govern provider validation/test sends.
Provider activation, timeout and credentials stay environment-managed/read-only;
only approved template IDs are editable through the separate section. No
raw-secret table exists.
The page shows configured-template flags, masked key status and actual account
check results. GET credit checks authentication/account availability without SMS;
it does not validate templates or handset delivery. Diagnostic reads do not send
or probe. Last successful transactional/operator send time comes only from
persisted accepted evidence; no full destination, OTP, key, credit balance or raw
provider body is returned.

A controlled test uses the approved OTP template with a random code that is not
an authentication challenge. The code is never persisted or returned. PostgreSQL
commits a unique hashed idempotency claim before contacting the provider. A crash
or response/evidence loss leaves an uncertain claim that is never re-dispatched,
even after restart. A database advisory lock enforces one global test send per
60 seconds across processes. Reuse the same key after a lost response; changed
private configuration conflicts. Deliberate new tests require new confirmation.

Transactional delivery still flows through domain transaction → OutboxEvent →
OutboxEffect → CustomerSmsDeliveryService → SmsProvider. Persisted FAILED claims
protect ambiguous sends from automatic duplication; re-consuming an acknowledged
event does not create another effect. Provider IDs are stored only for accepted
results. The replay operator command does not reset a consumed effect. Do not
manually change FAILED/unknown claims to PENDING. Reconcile with provider evidence
and an approved system rule first; there is no automatic ambiguity resolver.

## Release scope

The Admin template-entry preparation can be released with `SMS_PROVIDER_MODE=disabled`
and payment configuration unchanged. This does not complete or close #114.
Provider activation and real-delivery release still require the acceptance
sequence below. Pending provider approval must not block preparation of the form,
but it does block sending on the affected template.

## Provider activation and acceptance sequence

1. Fetch/reconcile current main and open PRs; keep this SMS change isolated.
2. Run frozen install, Prisma generation, lint, typecheck, tests, build,
   integration/concurrency/OpenAPI checks and full browser E2E on exact head.
   Required CI/security checks must pass. Review the full diff and secret safety.
3. Before merge, confirm private configuration and approved provider definitions;
   perform one controlled operator provider probe. Record only UTC timestamp,
   correlation ID, purpose, sanitized result and accepted message ID. Never record
   raw request/response, key, OTP or full mobile. If this cannot be done, keep the
   PR and #114 open; do not claim release acceptance.
4. Merge by repository convention only after gates and provider acceptance. Wait
   for official Publish Images for the merge SHA: api, api-migrate, admin, web;
   resolve every exact-SHA tag to a digest.
5. Use the official deploy script. Restore-verify the backup before migration;
   failed backup/migration aborts deployment. No VPS build, `latest`, source copy
   or manual container patch.
6. Verify running SHA/digests, service health, nginx configuration, HTTPS,
   readiness, Admin, storefront and media. Verify active SMS mode from a safe
   boolean/status projection, and verify payment mode stayed unchanged.
7. With fixture auth OFF, request a real OTP in storefront, confirm provider
   acceptance and handset receipt, enter it privately, confirm CUSTOMER_OTP,
   account/profile, reload restoration, logout and no session resurrection.
   Record only outcomes. Check wrong/expired/reused code, cooldown/excessive
   resend, unavailable/rate-limited provider and session expiry without bypass.
8. Through valid normal shipment commands, confirm one dispatched and one
   delivered notification, correct ownership/template, persisted accepted IDs
   and no duplicates under replay/restart. Do not create fake financial states.
9. ORDER_PAID handset acceptance stays blocked if payment is disabled unless an
   existing legitimate isolated domain command can produce authoritative payment
   confirmation. Never create a fake PAID row or fabricate a callback.

The operator may perform handset/browser steps manually. Their results remain
pending until explicitly reported; delegation is not a PASS and does not replace
required CI/security gates. Provider failure simulations belong to isolated test
databases/transports, not fixture authentication or fake sends on staging.

## Closure evidence

- Approved account/test-key behavior and privately configured secret.
- Approved OTP template, authoritative provider message ID, handset receipt and
  successful CUSTOMER_OTP login/session/logout.
- Timeout/rate-limit/failure/replay safety and privacy review PASS.
- Exact scope of three transactional templates and real messages when their
  authoritative domain dependencies exist; identify any remaining dependency.
- All required CI/security gates PASS, reviewed merge SHA, published digests,
  deployed exact SHA and post-deploy acceptance.

Product/customer backlog (#388/#389), ClamAV update operation (#393), payment,
VPN access and video authoring remain independent release gates.
