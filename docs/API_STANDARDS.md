# API Standards

## Versioning

Public application API is namespaced under `/api/v1`.

## Resource conventions

Use consistent REST semantics where suitable:

- `GET /api/v1/products`
- `GET /api/v1/products/:id`
- `POST /api/v1/cart/items`
- `POST /api/v1/orders`

Business commands that are not natural CRUD operations may use explicit action endpoints, e.g. inventory transfer dispatch/receive.

## Validation

Every request boundary is validated. Never pass unvalidated external objects directly into persistence/business services.

## Response consistency

Business API successes use `{ "data": ... }` with optional top-level `meta` for
pagination or similar response metadata. Health/operational probes retain their
documented minimal probe shape. List APIs should converge on one shared pagination/
meta format. Errors use the flat stable envelope below; the deprecated
`{ success, error }` wrapper is not a public contract.

## Idempotency

Require/support an idempotency key for retriable critical commands such as:

- Order creation where duplicate client submission is plausible
- Payment verification/refund
- External callbacks/webhooks
- Inventory receipts/adjustments imported from external systems

The same key with a conflicting payload must be rejected.

## Correlation IDs

Every request receives a request/correlation ID. Include it in structured logs and error responses.

`x-request-id` is honoured when supplied by a client (and normalized/validated); otherwise a
fresh ID is generated. The value is echoed back in the `X-Request-ID` response header and used
as the fallback correlation identifier. `x-correlation-id` may be supplied as an alternative.

Browser cookie-authenticated Auth endpoints also require `X-CSRF-Token`; production
CORS configuration must allow that exact header only for trusted credentialed origins.

## Error envelope

Non-2xx responses use a stable envelope so clients and monitoring can key off machine-readable
codes rather than message text:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "A short, stable, non-leaking summary.",
  "requestId": "<request id>",
  "statusCode": 400,
  "details": { "...": "optional, always redacted" }
}
```

Stable codes include `INVALID_REQUEST`, `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`,
`NOT_FOUND`, `CONFLICT`, `ORDER_STATE_CONFLICT`, `PAYMENT_STATE_CONFLICT`,
`FULFILLMENT_STATE_CONFLICT`, `HEALTH_NOT_READY`, `RATE_LIMITED`, `UNPROCESSABLE`,
`UPSTREAM_UNAVAILABLE`, `METHOD_NOT_ALLOWED`, `NOT_ACCEPTABLE`, `REQUEST_TIMEOUT`,
`PAYLOAD_TOO_LARGE`, `INTERNAL_ERROR`, `AUTH_INVALID_CREDENTIALS`,
`AUTH_CHALLENGE_INVALID`, `AUTH_CHALLENGE_EXPIRED`, `AUTH_SESSION_INVALID`,
`AUTH_SESSION_REPLAYED`, `AUTH_REAUTHENTICATION_REQUIRED` and `AUTH_CSRF_INVALID`.

Auth endpoints deliberately use generic public codes where a more specific result
would reveal account existence or lifecycle state. See `AUTH_CONTRACT.md` for the
normative code/state matrix.

Unexpected errors map to `INTERNAL_ERROR` with a generic message; original error names, stacks,
secrets (tokens/OTP/PII) and private connection strings are never surfaced to the caller. Prisma
unique-constraint violations map to `CONFLICT`. Framework validation errors use `VALIDATION_ERROR`.

## Logging

Structured JSON logs are emitted on stdout/stderr. Every entry carries `level`, `message`,
`timestamp` and `requestId`. Sensitive values (secrets, tokens, OTP codes, phone numbers, email
addresses) are redacted before anything is written or returned outward.

## OpenAPI

Keep OpenAPI/Swagger current for web, admin and mobile developers. The generated document is
committed at `apps/api/openapi.json`; a CI drift test regenerates it and fails the build if it
diverges from the committed artifact. The interactive UI is served at `/api/docs` (disable with
`ENABLE_SWAGGER=false`).
