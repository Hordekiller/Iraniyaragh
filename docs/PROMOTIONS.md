# Promotions, coupons and campaigns

Server-side only: the storefront never sends or trusts prices, discounts, usage counts or eligibility.

## Model
- `Promotion` (kind: percentage / fixed cart / fixed item / free shipping; mode: coupon / automatic), `PromotionTarget` (include/exclude product, SKU, category incl. descendants, brand), `Coupon` (normalized unique code, optional per-code limit and customer), `CartCouponIntent`, `PromotionRedemption` (immutable order-time snapshot + lifecycle), `PromotionCommand` (idempotent admin commands). Audit rows use the existing `AuditLog`.
- Money is integer IRR (`bigint`); percentages are basis points, rounded half-up once per promotion. Order invariant is unchanged: `subtotal - discount + shipping = grandTotal`; a free-shipping discount is part of `discount`.
- Eligibility is individual-customer based today (`Promotion.customerId`, `Coupon.customerId`, per-customer limits, first purchase). **Customer groups are an explicitly deferred, separate module**: the repository has no group/membership or group-pricing model, and none is faked here. A future group target would be one more `PromotionTargetType`-style rule evaluated by the same server-side engine and the same public-scope resolver; no hard-coded membership exists.

## Lifecycle (capacity)
| Event | Effect |
| --- | --- |
| Checkout | Serializable transaction reprices; the shipping quote's `promotionDiscount` must equal the recomputed value (else `QUOTE_CHANGED`); capacity reserved with conditional `UPDATE … WHERE usedCount < maxRedemptions`; redemption `RESERVED`. |
| Verified payment | `RESERVED → CONFIRMED` (idempotent; replayed callbacks change nothing). |
| Customer/staff cancel, reservation expiry | `RESERVED → RELEASED`, capacity returned once. Orders with any payment attempt are never expired, so uncertain payments keep their reservation. |
| Failed payment attempt | Order stays `PENDING_PAYMENT`; reservation is held until the order is cancelled or expires. |
| Payment verified after cancellation | Redemption stays `RELEASED`; the existing reconciliation event is the signal for operations. |
| Partial refund | Usage stays consumed; `refundedDiscount` records the proportional share of the discount. |
| Refund of the whole paid amount (cumulative across evidenced refunds) | `CONFIRMED → REFUNDED`, usage restored exactly once. Further refund commands cannot exceed the paid amount, so capacity cannot be restored twice. |
| Refund after the campaign ended or was disabled | Usage is restored, but `isActive` and `endsAt` are never touched: a refund never reactivates a campaign. |
| Refund of a payment settled after cancellation | Redemption stays `RELEASED`; capacity does not move. |
| Late cancel of a `CONFIRMED` redemption | No-op (money-backed). |

Reservation release (cancel/expiry, unpaid) and redemption reversal (refund, paid) are separate paths: cancel/expiry only ever touches `RESERVED` rows, refund only `CONFIRMED` rows. Refunds are evidenced records of money moved outside the system (no gateway refund API is called); replaying a refund command with the same idempotency key returns the original result and applies nothing twice. Refunds, payment verification and order cancellation share the existing per-order advisory lock.

## Financial consistency
The order stores `subtotal`, `discount` (item + free-shipping), `shipping`, `grandTotal` with `subtotal - discount + shipping = grandTotal`; payment initiation authorizes exactly `grandTotal` and verification rejects an amount mismatch; refunds are bounded by the paid amount. All arithmetic is `bigint`; percentages round half-up once and per-line allocation uses largest remainder so line shares sum exactly. The sale invoice reuses the invoice policy and mirrors the order's discount and shipping (issuance is validated by the existing database trigger).

Known limitation (fail-closed): a free-shipping discount larger than the goods subtotal (goods cheaper than the shipping charge) cannot be represented by the immutable invoice evidence, which requires `document.discount = order.discount` and a goods-only discount. Creating a sale invoice for such an order is refused with a 4xx; no wrong invoice is produced. Supporting it needs a deliberate change to the invoice evidence trigger (new migration), which is out of scope here.

Invoice policy `discountCapBps` also applies to promotion discounts on the sale-invoice path: an order whose promotion discount exceeds the configured cap is refused at draft creation rather than invoiced inconsistently. Keep the cap at 10000 (100 %) if campaigns may discount more than the policy cap.

Stacking: stackable promotions apply in `(priority, id)` order on the remaining amounts; non-stackable ones are exclusive and compete with the stacked set — the larger total discount wins. Custom-door orders never create redemptions.

## Storefront display
`GET /promotions/public` lists only active, automatic, non-customer-specific, non-first-purchase campaigns (including those scheduled within 14 days, labelled «به‌زودی»). Scope is resolved **server-side** against the live catalog with the same eligibility rule as pricing: brand, category (with subcategories), SKU and exclusions are applied, and a product is badged only when **every** sellable variant of it is eligible. The response carries `scope: { all, exceptProductIds } | { productIds }` (never rules, coupon codes or customer ids), is cached in-process for 15 s and invalidated by any admin change. A scope larger than 500 products is omitted rather than guessed. Badges show the administrator's text only: no invented percentage or previous price. Eligibility for a coupon is always decided by the server at cart/checkout time.

## Permissions
Dedicated canonical permissions (group `promotions`) are in `apps/api/prisma/rbac-baseline.mjs`:

| Permission | Grants |
| --- | --- |
| `promotions.read` | list/read campaigns and coupon codes; Admin page and navigation entry |
| `promotions.manage` | create/edit/enable/disable campaigns, generate/enable/disable coupons — each mutation also needs fresh MFA (`STAFF_MFA`) and an `Idempotency-Key` |
| `reports.read` (existing, unchanged) | usage history and performance report — kept explicit and separate |

`settings.manage` no longer opens the promotions API. The `system-admin` role receives both new permissions through the canonical baseline; other roles must be granted them explicitly. Managing roles keeps the existing ceilings and last-admin protections (PR #491's access administration reads the same registry; nothing here duplicates it).

### RBAC rollout (avoid an access lockout)
1. Deploy the migrations and the API/Admin build **together with** the baseline reconcile for the target environment, using the official guarded path only: `pnpm --filter @iranyaragh/api rbac:baseline -- --check` (drift report), then `-- --apply` (creates the two permissions and grants them to `system-admin`; idempotent, audited, no user or credential created). Never run the dev seed against staging/production.
2. Until step 1 has run, no one can open the promotions page (the pre-existing `system-admin` role simply lacks the new keys), but nothing else is affected.
3. Then grant `promotions.read` (+ `promotions.manage` for editors, `reports.read` for analysts) to the intended roles through the access administration screen or an audited operator change. An editor needs `promotions.read` as well, because the list is read-gated.

## Deployment
1. Deploy migrations `20261105130000_promotions_and_coupons` and `20261105131000_promotion_commands` (forward-only, additive; existing rows unaffected, `ShippingQuote.promotionDiscount` defaults to 0).
2. Deploy API, then Admin and Web. Nothing is active until an administrator creates and enables a campaign.
3. Take a database backup and verify it restores before applying migrations in production (project rule).
3a. Apply the RBAC baseline (see above). The reservation-expiry worker (durable order-expiry jobs) must be running: it is what returns capacity for abandoned unpaid checkouts.
3b. Smoke on staging: create a coupon, apply it in a cart, check preview → checkout → order → invoice amounts agree, cancel and confirm capacity returns.
4. Coupon validation is rate limited per customer in Redis (15 attempts / 10 min) and fails closed if Redis is down.

## Rollback
- Disable campaigns from Admin (immediate). Orders already created keep their discount and snapshot.
- Rolling the application back to a build without promotions is safe: `Order.discount`/`grandTotal` are already authoritative and the new tables are only read by the new code. Do **not** drop the tables or delete `PromotionRedemption`/audit rows (financial history).
- Reservations of in-flight pending orders are returned by cancel/expiry only when the new code is running; after a rollback, release them manually (`status = 'RESERVED'` rows of cancelled/expired orders) before re-enabling.

## Validation evidence
- Real-service PostgreSQL integration (`promotions.integration-spec.ts`, `promotions-payments.integration-spec.ts`): checkout, concurrent one-use coupon (exactly one winner, no 500, no orphan reservation), verified/duplicate/uncertain/failed payment through the real `PaymentVerificationService`, cancel/expiry/late-payment, partial/full/replayed/concurrent refunds, refund after expiry, repricing conflicts, order↔payment↔invoice totals, public scope projection. The gateway is the only simulated component; this is **not** live Zarinpal acceptance.
- Playwright: admin promotions journey (desktop and mobile, real API and staff MFA), storefront coupon box at 1440, 375 and 430 px, public/unauthenticated API checks. A real customer-session coupon journey in a browser is not automated: customer sign-in needs a real SMS OTP that tests cannot legitimately observe; that path is covered by the integration tests above.
- Controlled external acceptance (real SMS, Zarinpal sandbox/live settlement, backup restore) remains a separate authorized step.
