# Promotions, coupons and campaigns

Server-side only: the storefront never sends or trusts prices, discounts, usage counts or eligibility.

## Model
- `Promotion` (kind: percentage / fixed cart / fixed item / free shipping; mode: coupon / automatic), `PromotionTarget` (include/exclude product, SKU, category incl. descendants, brand), `Coupon` (normalized unique code, optional per-code limit and customer), `CartCouponIntent`, `PromotionRedemption` (immutable order-time snapshot + lifecycle), `PromotionCommand` (idempotent admin commands). Audit rows use the existing `AuditLog`.
- Money is integer IRR (`bigint`); percentages are basis points, rounded half-up once per promotion. Order invariant is unchanged: `subtotal - discount + shipping = grandTotal`; a free-shipping discount is part of `discount`.
- Customer groups are not modelled in the repository, so they are not supported.

## Lifecycle (capacity)
| Event | Effect |
| --- | --- |
| Checkout | Serializable transaction reprices; the shipping quote's `promotionDiscount` must equal the recomputed value (else `QUOTE_CHANGED`); capacity reserved with conditional `UPDATE … WHERE usedCount < maxRedemptions`; redemption `RESERVED`. |
| Verified payment | `RESERVED → CONFIRMED` (idempotent; replayed callbacks change nothing). |
| Customer/staff cancel, reservation expiry | `RESERVED → RELEASED`, capacity returned once. Orders with any payment attempt are never expired, so uncertain payments keep their reservation. |
| Failed payment attempt | Order stays `PENDING_PAYMENT`; reservation is held until the order is cancelled or expires. |
| Payment verified after cancellation | Redemption stays `RELEASED`; the existing reconciliation event is the signal for operations. |
| Partial refund | Usage stays consumed; `refundedDiscount` records the proportional share. |
| Refund of the whole paid amount | `CONFIRMED → REFUNDED`, capacity restored. |
| Late cancel of a `CONFIRMED` redemption | No-op (money-backed). |

Stacking: stackable promotions apply in `(priority, id)` order on the remaining amounts; non-stackable ones are exclusive and compete with the stacked set — the larger total discount wins. Custom-door orders never create redemptions.

## Permissions
No new RBAC permission was introduced (the baseline role definitions are pinned by tests): management uses `settings.manage` (+ fresh MFA for mutations), history/report use `reports.read`.

## Deployment
1. Deploy migrations `20261105090000_promotions_and_coupons` and `20261105091000_promotion_commands` (forward-only, additive; existing rows unaffected, `ShippingQuote.promotionDiscount` defaults to 0).
2. Deploy API, then Admin and Web. Nothing is active until an administrator creates and enables a campaign.
3. Smoke on staging: create a coupon, apply it in a cart, check preview → checkout → order → invoice amounts agree, cancel and confirm capacity returns.
4. Coupon validation is rate limited per customer in Redis (15 attempts / 10 min) and fails closed if Redis is down.

## Rollback
- Disable campaigns from Admin (immediate). Orders already created keep their discount and snapshot.
- Rolling the application back to a build without promotions is safe: `Order.discount`/`grandTotal` are already authoritative and the new tables are only read by the new code. Do **not** drop the tables or delete `PromotionRedemption`/audit rows (financial history).
- Reservations of in-flight pending orders are returned by cancel/expiry only when the new code is running; after a rollback, release them manually (`status = 'RESERVED'` rows of cancelled/expired orders) before re-enabling.
