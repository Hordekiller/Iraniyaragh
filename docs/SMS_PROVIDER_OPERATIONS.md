# SMS Provider Operations Runbook

Last verified against the official SMS.ir REST documentation: 2026-09-08.

This runbook operationalizes ADR-0011. It does not contain credentials, real
mobile numbers, sender lines or account data.

## 1. Supported production boundary

- Initial vendor: SMS.ir.
- Auth depends only on the internal `SmsProvider` port.
- OTP uses `POST https://api.sms.ir/v1/send/verify` with `X-API-KEY` and JSON.
- Bulk, peer-to-peer, arbitrary-text and inbound-message APIs are not part of the
  authentication boundary.
- `templateId` is a positive integer. Template parameter names are configured in
  the SMS.ir panel; parameter values are limited to 25 characters.
- A send is accepted only after HTTP success, vendor `status=1` and a positive
  `data.messageId`. Vendor `cost` is diagnostics only and is never accounting data.

Primary source: <https://sms.ir/rest-api/>.

## 2. Data and secret boundary

- Persist customer mobiles only in the canonical project form
  `+989XXXXXXXXX`. Convert once at the adapter edge to the single format verified
  in Sandbox.
- Never log or audit the API key, OTP, template values, response body, message
  text or full destination.
- Store only a provider message ID where correlation/delivery evidence is needed.
  Any destination lookup uses an existing domain-separated keyed reference.
- Production credentials live in a deployment secret manager. An environment
  backend is read-only: admin rotate/clear operations must be unavailable rather
  than pretending to mutate process environment.
- Secret rotate/clear requires `STAFF_MFA`, fresh authentication,
  `settings.manage`, explicit confirmation, idempotency and safe audit evidence.

## 3. Configuration inventory

Server-bounded, versioned non-secret settings:

- enabled flag;
- runtime-derived environment indicator (not an editable environment switch);
- positive integer verification template ID;
- sender-line identifier for diagnostics only—the Verify request does not accept
  a sender-line field;
- request timeout within the server-approved range;
- delivery-status collection and retention policy;
- fail-closed outage mode and operator-facing maintenance message;
- sanitized failure-window/count alert thresholds.

OTP expiry, resend cooldown, attempt count, hashing, eligibility and identifier/IP
rate limits are security invariants and are never admin-editable.

## 4. Result and error policy

| Evidence                                      | Internal result                 | Automatic retry               |
| --------------------------------------------- | ------------------------------- | ----------------------------- |
| HTTP 2xx + status 1 + positive message ID     | `accepted`                      | no                            |
| HTTP 429 or vendor status 20                  | `rate_limited`                  | no                            |
| Vendor 10–14                                  | rejected authentication/account | no                            |
| Vendor 101/123                                | rejected sender                 | no                            |
| Vendor 102                                    | rejected credit                 | no                            |
| Vendor 104/105/107/115                        | rejected destination            | no                            |
| Vendor 103/106/108/110/114/116–118            | rejected content                | no                            |
| Vendor 113/119                                | rejected template               | no                            |
| Vendor 109/111/112                            | rejected invalid request        | no                            |
| Vendor 0 or known pre-acceptance HTTP 5xx     | `unavailable`                   | bounded by caller policy only |
| Timeout/reset/truncated or unprovable success | `unknown_result`                | never blindly                 |
| Unknown vendor code                           | rejected/unknown, alert safely  | no                            |

No error response may include vendor text. Circuit breaking counts sanitized
unavailable/rate/configuration categories, not raw bodies.

## 5. Sandbox acceptance gate

SMS.ir documents a separate Sandbox key using the same URL and shapes, simulated
responses, no real credit charge and no stored reports. Its default Verify template
is ID `123456` with `#CODE#`.

Before production activation, an operator must privately record:

1. Sandbox key created and injected through the non-production secret backend.
2. A controlled POST Verify request accepted with a positive message ID.
3. The exact mobile representation accepted by Sandbox.
4. Invalid key, invalid template, invalid mobile and rate-limit behavior mapped to
   sanitized internal outcomes.
5. Timeout/connection simulation proves one dispatch attempt and no blind retry.
6. Sandbox evidence contains no credential, OTP or full mobile in GitHub/logs.

The official page currently labels the main Verify operation POST but labels one
Sandbox sample GET. POST is the canonical contract; this discrepancy must remain
noted until verified in the account Sandbox.

## 6. Delivery and diagnostics

- Delivery lookup is `GET /v1/send/{messageId}` and is separate from issuance.
- Vendor delivery states map to delivered, not-delivered, carrier-processing,
  carrier-rejected, carrier-accepted, failed, blacklisted or unknown.
- The vendor delivery response also contains mobile and message text. Discard these
  fields at the adapter boundary; retain only message ID, normalized delivery state
  and timestamps required by the approved retention policy.
- Sandbox stores no delivery reports, so delivery polling is disabled there.
- Credit (`GET /v1/credit`) and sender lines (`GET /v1/line`) are optional,
  permission-gated diagnostics. Credit is informational and never enters project
  accounting. Do not expose account response bodies.
- Diagnostics show only configured state, secret-backend capability, health class,
  circuit state, last accepted send time, last delivery-poll time and sanitized
  error category.

## 7. Network and resilience

- HTTPS only; never place the key in URL/query strings.
- Enforce a bounded request timeout and response-size limit.
- If outbound IP allowlisting is enabled, verify the current primary and failover
  addresses from the official documentation immediately before deployment; do not
  hard-code vendor IPs in application code.
- Alert on sustained authentication/account/sender/template/credit failures,
  rate limiting, circuit opening and unknown results without including customer data.
- OTP delivery fails closed. Provider outage never bypasses authentication or abuse
  controls and never turns a challenge into verified state.

## 8. Production activation checklist

- [ ] SMS.ir account, appropriate plan and service-capable line are provisioned privately.
- [ ] Production Verify template is approved; its integer ID and parameter names match config.
- [ ] Writable production secret manager is configured, or admin rotation is visibly disabled.
- [ ] API key is injected without appearing in shell history, CI output or tickets.
- [ ] Non-secret settings pass optimistic-version validation and audit tests.
- [ ] Provider adapter unit/failure tests, Auth integration, authorization denial,
      idempotency, redaction, OpenAPI drift and browser E2E are green.
- [ ] Controlled operator test send succeeds; customer arbitrary-send remains impossible.
- [ ] Alerts, circuit behavior and fail-closed customer message are exercised.
- [ ] Delivery polling/retention is either verified or explicitly disabled.
- [ ] Rollback operator and verifier are named under the accepted team agreement.

## 9. Rollback

1. Disable provider issuance through versioned settings.
2. Preserve challenges and safe audit/correlation evidence; do not delete history.
3. Restore the previous opaque secret version if the secret manager supports it.
4. Roll back the adapter deployment if configuration rollback is insufficient.
5. Verify Auth remains fail-closed and publish the configured maintenance message.
6. Record incident timestamps, sanitized outcome counts and the independent verifier.

## 10. Remaining delivery ownership

- #114: provider port/adapter, deterministic fake, settings and secret backends,
  Auth integration, delivery/diagnostics boundary, tests and production runbook.
- #115: accepted admin HTTP client and Persian RTL UI after the #114 contract lands.
- Private operations: account/line/template procurement and secret injection.
