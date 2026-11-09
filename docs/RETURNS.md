# Order returns (policy `returns-v1`)

Status: implemented in source (migration `20261109120000_order_returns`). Not
deployed or accepted: see [Acceptance](#acceptance-still-required). This document
is the contract for general returns of **paid orders**. Credit-sale returns remain
a separate flow ([ADR-0023](adr/0023-customer-credit-and-receivable-ledger.md)).

A return records **goods received back**. It never moves money. The refund is
executed by staff in the payment gateway panel first (Zarinpal v4 has no refund
API) and is then recorded as evidence and linked to the return.

## Owner-approved policy

| Rule                    | Value                                                                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Clock starts            | When the order's store invoice was **issued** (day 0 is the Tehran calendar day of issuance).                                                  |
| In-person handover      | 2 **business days** after day 0.                                                                                                               |
| Shipped to another city | 7 **calendar days** after day 0 (Fridays and holidays do not extend it).                                                                       |
| Business day            | Saturday–Thursday and not a listed official holiday. Friday is always off.                                                                     |
| Window end              | 23:59:59.999 `Asia/Tehran` of the last day. Inclusive.                                                                                         |
| Who records             | Staff only (customers cannot request returns in this slice).                                                                                   |
| Outside the window      | Completely blocked; there is no override.                                                                                                      |
| In-person vs other city | By **shipping method** (`ShippingMethod.returnWindowKind`), not by address.                                                                    |
| Excluded                | Custom door orders.                                                                                                                            |
| Refund amount           | Returned lines' price minus each line's share of the order discount. Shipping is refunded only when every unit of the order has been returned. |
| Refund execution        | Manual, in the gateway panel; recorded afterwards.                                                                                             |

Consequences that follow from these rules rather than from a guess:

- An order with **no issued invoice** has no window and cannot be returned
  (`NO_ISSUED_INVOICE`).
- A shipping method that staff have **not classified** blocks returns
  (`METHOD_UNCLASSIFIED`). Nothing is inferred from its name. The staff counter
  policy code `PICKUP` is always in-person.
- Credit sales (`CREDIT_APPROVED`) are outside this flow (not `PAID`).
- Only the in-person window is affected by holidays, and a holiday only affects
  returns recorded **after** it is added: every return stores its own deadline.

## On/off switch

Recording of **new** returns is controlled by an administrator in **Settings →
return window** (`GET`/`PUT /api/v1/returns/admin/settings`, permission
`settings.manage`, fresh MFA, optimistic `expectedVersion`, audited as
`returns.settings.updated`). The switch is stored in `StorefrontFeatureFlag` under
the key `order-returns` and is **off until an administrator turns it on**.

| While the switch is off                                | Behavior                                                                                                                        |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Recording a new return                                 | Refused with `RETURN_NOT_ELIGIBLE` / `RETURNS_DISABLED`; eligibility still reports the window.                                  |
| Reading returns                                        | Unchanged.                                                                                                                      |
| Recording the refund of an **already recorded** return | Unchanged. Money owed to a customer is never locked by a switch.                                                                |
| Retrying an already recorded return with the same key  | Returns the original return.                                                                                                    |
| Storefront terms                                       | The return window is not advertised (`GET /api/v1/returns/public/config` is `false`, unreachable or malformed = not published). |

Switching off while a request is in flight can let that one request finish; this is
a business switch, not a safety invariant.

## Eligibility

`GET /api/v1/returns/admin/orders/:orderId/eligibility` evaluates, in this order,
and reports the first failing reason:

`RETURNS_DISABLED` → `FULLY_RETURNED` → `ORDER_NOT_PAID` → `CUSTOM_DOOR_EXCLUDED` → `PAYMENT_NOT_SETTLED`
→ `AMOUNTS_DO_NOT_RECONCILE` (exactly one settled payment equal to the order's grand
total, and subtotal/discount/shipping must add up) → `NO_ISSUED_INVOICE` →
`METHOD_UNCLASSIFIED` → `WINDOW_CLOSED`.

## Recording a return

`POST /api/v1/returns/admin/orders/:orderId` (fresh MFA, `Idempotency-Key`,
permission `returns.manage`). Each line has a quantity and a disposition:

| Disposition    | Stock effect                                                                                   |
| -------------- | ---------------------------------------------------------------------------------------------- |
| `RESTOCK`      | `RETURN_IN` movement (`referenceType: order-return`) into the named active warehouse/location. |
| `DAMAGED`      | None.                                                                                          |
| `NOT_RETURNED` | None.                                                                                          |

The inventory has no quarantine location, so non-sellable goods are never put back
into sellable stock; tracking damaged goods needs a separate inventory feature.

Everything happens in one serializable transaction under the order advisory lock:
amounts, return header and lines, stock movements, order/fulfillment transitions,
audit and the idempotent replay record. When every unit of the order has been
returned the order moves `PAID → RETURNED` (and fulfillment `DELIVERED → RETURNED`
if it was delivered). Payment status is **not** changed here; it changes only when a
refund is recorded.

## Settling with a manual refund

`POST /api/v1/returns/admin/:id/refund` records the refund through the existing
manual refund command (`payments.refund` + `returns.manage`, fresh MFA). The amount
is capped by what the return is still due and by the payment's remaining refundable
amount. A retry with the same key returns the same refund.

## Database guarantees

Enforced by constraints and triggers, so a write that bypasses the service cannot
break them:

- returns, lines and links are **append-only**;
- a return needs a `PAID` order, that order's own invoice, and no custom door;
- `returnedAt` lies within `[invoiceIssuedAt, deadlineAt]`;
- cumulative returned quantity of an order line never exceeds the quantity sold;
- header totals equal the sum of the lines (deferred);
- linked refunds never exceed `refundDue` and belong to the same order's payment;
- only `RESTOCK` lines carry a stock movement.

## Permissions

| Permission        | Allows                                                                                |
| ----------------- | ------------------------------------------------------------------------------------- |
| `returns.read`    | See eligibility, returns and their refund progress.                                   |
| `returns.manage`  | Record a return; with `payments.refund`, record the settling refund.                  |
| `settings.manage` | The on/off switch, official holidays and the return window kind of a shipping method. |

## Deploying

1. Back up and restore-verify the database, then run the forward migration
   `20261109120000_order_returns` (new tables and one nullable column; no rewrite).
2. Run `pnpm --filter @iranyaragh/api rbac:baseline` so `returns.read` and
   `returns.manage` exist and are granted to the system administrator role. The
   migration also registers both permissions without granting them to anyone.
3. In **Settings → shipping**, classify every active shipping method as in-person
   or other-city. Unclassified methods block returns on purpose.
4. In **Settings → return window**, enter the official holidays.
5. Turn returns **on** in the same page only after the steps above and after the
   acceptance below; until then new returns stay blocked and the storefront does
   not advertise the policy.

## Acceptance still required

Passing CI is not acceptance. Before relying on this in sales: a real in-person
return and a real shipped-order return with an authorized operator, a real manual
gateway refund reconciled against the gateway panel, and a restore-verified backup.

## Known limits

- Staff-only: no customer return request or customer-visible return status yet.
- No linked invoice correction document yet (#421); a return does not edit or cancel
  the issued invoice.
- No notifications to the customer.
- Holiday dates are entered as Gregorian `YYYY-MM-DD` (the Tehran calendar day).
