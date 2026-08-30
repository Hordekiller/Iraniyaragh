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
List APIs should converge on a shared pagination/meta format. Errors use stable machine-readable codes.

## Idempotency
Require/support an idempotency key for retriable critical commands such as:
- Order creation where duplicate client submission is plausible
- Payment verification/refund
- External callbacks/webhooks
- Inventory receipts/adjustments imported from external systems

The same key with a conflicting payload must be rejected.

## Correlation IDs
Every request receives a request/correlation ID. Include it in structured logs and error responses.

## OpenAPI
Keep OpenAPI/Swagger current for web, admin and mobile developers.
