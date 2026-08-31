# ADR-0003: Money and Time Representation

Status: Accepted (extended 2026-08-31 — extension proposed by decision #13, pending acceptance)

## Decision

- Money is persisted/calculated using integer-safe representation; JavaScript float
  arithmetic is forbidden for accounting values.
- Timestamps are stored in UTC and localized only at presentation/reporting
  boundaries.
- **Canonical money unit: integer Rial (IRR), resolved by #13.** The Rial is the
  only stored and transported amount unit. Toman is a display-only convenience.

## Extended decision: canonical integer IRR (#13)

### Stored unit

- Every monetary amount is stored as an **integer number of Rials** with no
  fractional subunit anywhere in persistence or business logic.
- Toman (`تومان`, = 10 Rials) is a presentation artifact only. It is computed by
  dividing by 10 at the formatting boundary and never stored, transported or used
  in accounting calculations.

### Persistence

- PostgreSQL money columns migrate from `Decimal(18,2)` to `BIGINT` through one
  reviewed forward migration. There are exactly ten affected columns:

  | Table            | Column       | Notes                          |
  | ---------------- | ------------ | ------------------------------ |
  | `ProductVariant` | `costPrice`  | purchase/landed cost           |
  | `ProductVariant` | `salePrice`  | selling price                  |
  | `PurchaseOrderItem` | `unitCost`| supplier unit cost             |
  | `Order`          | `subtotal`   | pre-discount line sum          |
  | `Order`          | `discount`   | order-level discount, default 0|
  | `Order`          | `shipping`   | shipping fee, default 0        |
  | `Order`          | `grandTotal` | final payable amount           |
  | `OrderItem`      | `unitPrice`  | line unit price                |
  | `OrderItem`      | `total`      | line total                     |
  | `Payment`        | `amount`     | payment amount                 |

- The single migration runs in **one transaction** and performs, in order:
  1. **Fractional preflight**: for each of the ten columns, a guard statement
     (`SELECT 1 FROM <table> WHERE <column> IS NOT NULL
       AND <column> <> trunc(<column>);`) that raises (`RAISE EXCEPTION`) when any
     row matches. `numeric::bigint` rounds silently, so this explicit check is
     mandatory: a non-zero fractional part is data corruption and must abort the
     migration, never round.
  2. **Type change**: only after the preflight has passed, `ALTER COLUMN ... TYPE
     BIGINT USING (<column>)::bigint`.
  The preflight and the alters share one transaction, so a corrupted value aborts
  the whole migration and leaves no partially-converted columns.
- Prisma models map these fields to `BigInt` (`@db.BigInt`).

### API representation

- `Money` in the shared contracts is already
  `{ amount: string; currency: 'IRR' }` (`packages/contracts/src/index.ts`). It is
  unchanged by this decision; the `amount` string is the decimal-string of the
  integer Rial count.
- Servers must serialize `BIGINT` to `string` before JSON. `JSON.stringify` on a
  native `bigint` throws, so serialization is explicit at the API boundary.
- Clients must not parse `amount` as a JSON number; monetary math stays on the
  server.

### Rounding

- Because storage is integer, there is no rounding in persistence.
- Rounding happens at **exactly one conversion edge**: percentage-derived amounts
  (discounts, future VAT), computed once at the last step with
  **ROUND_HALF_UP to the Rial**.
- The Rial→Toman display conversion is **exact, never rounded**: Toman = Rials ÷
  10. When the amount is divisible by 10 the display is an integer Toman count;
  otherwise it shows the exact single decimal (`123,456.7` → `۱۲۳٬۴۵۶٫۷ تومان`).
  Rounding a display conversion would over- or under-state the payable amount;
  canonical Rial (`1,234,567` → `۱٬۲۳۴٬۵۶۷ ریال`) is shown at payment
  boundaries. A later whole-Toman-only product decision is possible but requires
  an explicit multiple-of-10 Rial business constraint and a separate decision;
  it is out of scope here.
- **Percentage math is defined without floating point.** Rates are expressed as
  integer rational units — basis points, `1% = 100 bp`, so `15% = 1500 bp`. For an
  integer amount `N` Rials and a rate of `bps`:
  `result = floor((|N| × bps + 5000) / 10000)`, applied to `|N|` and re-signed
  (round half away from zero). The `|N| × bps` product is computed in arbitrary-
  precision integer (`bigint` in Node, `numeric` in PostgreSQL helpers) so the
  intermediate cannot overflow; the rounded result is validated against the
  target column's `BIGINT` domain at the boundary.
- Discount allocation across line items must satisfy the **sum-of-parts
  invariant**: the per-line discounts always add back to the order-level discount
  to the Rial. Remainder units are distributed with the largest-remainder method
  keyed on a **persisted sort ordinal** (the `OrderItem` line ordinal established
  server-side at order creation), not on transient request/array order; remainder
  ties are broken by the same persisted ordinal, so the allocation is
  replay-stable and auditable.

### Tax and invoice scope (out of scope for this decision)

- VAT/tax bracket calculation, invoice legal structure and toman-denominated
  invoicing are **explicitly out of scope** of #13 and this ADR.
- The future tax/invoice decision MUST reuse the integer-Rial model and the
  ROUND_HALF_UP percentage rule above; no new currency representation may be
  introduced.
- No commerce migration merges before this ADR is accepted and its schema impact
  is applied (gate G0-03/#13).

## Worked examples

1. **Stored integer**: a price written as `1,234,567` Rials is stored as the
   integer `1234567`.

2. **Exact Toman display (never rounded)**: `1,234,567` Rials ÷ 10 = `123456.7`
   Toman → displayed as `۱۲۳٬۴۵۶٫۷ تومان`. An amount divisible by 10, e.g.
   `123,456,780` Rials, is displayed as the integer `۱۲٬۳۴۵٬۶۷۸ تومان`. Payment
   boundaries show canonical Rial. The stored amount remains `1234567`
   throughout.

3. **Exact percentage**: 15% of `1,000,000` Rials = `1,000,000 × 1500 / 10000`
   = `150,000` Rials exactly; no remainder occurs.

4. **Non-divisible percentage consumes its sub-Rial remainder**: 15% of
   `1,000,003` Rials = `1,000,003 × 1500 = 1,500,004,500`; with HALF_UP on the
   Rial, `(1,500,004,500 + 5000) / 10000 = 150,000` (the unrounded value is
   `150,000.45`; the `−0.45` Rial delta is consumed by the rounding itself). No
   reconciliation remnant is produced in persisted amounts; a rounding-adjustment
   policy would be a separate, out-of-scope decision.

5. **Discount allocation preserves the total.** Two lines:
   Line A `2 × 99,999 = 199,998`; Line B `1 × 149,999 = 149,999`; subtotal
   `349,997`. A 10% order discount is `34,999.7` → `35,000` Rials. Largest-remainder
   split: A floor `19,999` (remainder .8), B floor `14,999` (remainder .9) →
   remainders 1 each → A `20,000`, B `15,000`; `20,000 + 15,000 = 35,000` ✓ and
   each discounted line total stays an integer. The method is keyed on persisted
   line ordinals, not request order.

6. **API serialization**: `grandTotal = 349997n` is transported as the JSON
   string `"349997"` (`Money.amount`), never as a native JSON number and never as
   a bare `bigint` literal.

## Consequence

- The ten money columns map to `BigInt` after the one reviewed migration. The
  owning service boundaries are **catalog** (`ProductVariant`), **purchasing**
  (`PurchaseOrderItem`), **orders** (`Order`, `OrderItem`) and **payments**
  (`Payment`). No `Prisma.Decimal` money arithmetic exists in `apps/api/src`
  today, so no existing computation is replaced; the services listed must
  implement integer-only (`bigint`-safe, Rial-denominated) arithmetic per this
  ADR as commerce behavior lands (per the #28 split order).
- `Money` contract stays unchanged, so API consumers see no breakage.
- Unit/property tests must lock the invariant "every money path ends with an
  integer Rial and line totals equal order totals", and the database integration
  runner (`pnpm test:integration`) covers one rounding/distribution example
  against real PostgreSQL once commerce behavior lands.
- UI may display تومان and Jalali dates, but persistence/business calculations
  remain explicit and unambiguous.