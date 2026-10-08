# Customer checkout readiness

## Reused implementation

Baseline: `4f71f5a02041262002d5d506b241e9c7308ba624`.
The existing cart, customer-self profile/address book, shipping quote, transactional
checkout, stock reservation, Zarinpal initiation/verification/reconciliation,
owned orders and tracking implementations are retained. No historical branch is
copied wholesale and no alternate payment/auth implementation is introduced.

| Customer step | Existing authoritative API |
| --- | --- |
| Login and restore | Customer OTP/session contracts; real SMS.ir remains external acceptance |
| Profile and addresses | `/api/v1/customers/me` and its addresses |
| Guest cart and owned cart | `/api/v1/guest-cart`, `/api/v1/cart`, guest merge |
| Address and shipping review | `POST /api/v1/checkout/preview` |
| Create unpaid order | `POST /api/v1/checkout`, same idempotency key on retry |
| Begin payment | `POST /api/v1/orders/:id/pay`, server-owned integer IRR total |
| Gateway return | `/api/v1/payments/zarinpal/callback`, server verification then neutral/owned result |
| History and shipment tracking | `GET /api/v1/orders` and `GET /api/v1/orders/:id` |
| Cancel an owned unpaid order | `POST /api/v1/orders/:id/cancel`, transactional reservation release |

## Connection and safety corrections

- Checkout displays both guest and customer cart failures with retry. A lost
  checkout response locks the original address/quote and preserves the key for
  explicit replay. Links to owned order history support finding a committed
  order after reload. No address, OTP or access token is added to browser storage.
- Payment and order pages wait for silent session restoration. Their stored
  results reset on customer/login changes, but token rotation preserves drafts.
  A departed payment page cannot redirect after a late provider response.
- The unpaid-order cancellation UI uses the existing customer command, asks for
  confirmation, keeps the key across uncertain retries, and rereads the server.
  Cancellation does not claim a refund. Paid/returned orders do not offer it.
- Initiation sends once per durable pending attempt. Ambiguity is pending,
  including transport failure and provider 5xx. Same/different-key replay and
  process restart cannot issue a second gateway request. Expired reservations
  cannot initiate payment. Legacy ambiguous failures also block a new key.
  After authorization, the shared order lock checks cancellation/expiry again.
  A returned authority is retained for late-payment compensation even when a
  redirect is refused. Unsigned `NOK` remains pending for reconciliation and
  cannot suppress a later verified `OK` callback.
- Zarinpal error parsing follows the official v4 `errors.code` envelope and
  documented negative codes. Verification requires a positive numeric reference;
  credentials, amount mismatch and unknown codes remain reconcilable. The
  staging example callback now matches the controller route.
- Admin `/settings/shipping` configures the existing fixed-tariff shipping
  adapter through staff MFA + `settings.manage`; writes require fresh MFA.
  Create/update/deactivation use integer IRR, versions, durable retry evidence
  and audited policy revisions. No default tariff or free shipping is invented.
  Existing order snapshots stay immutable and old quotes become invalid.

Provider references: [connection/verification](https://www.zarinpal.com/docs/paymentGateway/connectToGateway),
[error codes](https://www.zarinpal.com/docs/paymentGateway/errorList).

## Activation and acceptance gate

Keep `PAYMENT_PROVIDER_MODE=disabled` until merchant approval and controlled
acceptance. Privately configure the approved `ZARINPAL_MERCHANT_ID`, bounded
timeout and HTTPS callback:
`https://iraniyaragh.com/api/v1/payments/zarinpal/callback`.
Never put a merchant credential in Git, tickets, browser code or reports.

Use the official exact-SHA publish/deploy workflow, then an operator-owned
customer session with fixtures OFF. Verify profile/address persistence, available
catalog stock, configured shipping, checkout total and unpaid order history.
The initial read-only VPS audit found 30 purchasable variants and zero active
shipping methods. The operator must enter approved shipping titles/IRR tariffs
in Admin before checkout can create orders. Those business values are not guessed.
After approved gateway activation verify real redirect, successful/cancelled
return, authoritative reference, exactly-once stock consumption and paid SMS;
repeated callback/restart must not duplicate settlement or delivery. Check the
reconciliation queue and late-payment compensation. A disabled provider never
counts as accepted payment. Automated provider test doubles prove local error and
concurrency handling only; they are not provider or handset acceptance.

This work does not close customer account, SMS handset, legal-content approval,
returns/credit or other independent release gates without their own evidence.
