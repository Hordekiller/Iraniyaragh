# ADR 0032 — Represent unknown catalog purchase cost explicitly

Status: proposed for review with the catalog unknown-cost change.

The operator requested that catalog rows without a verified purchase cost keep
their other known fields and receive their source SKU. A blank purchase cost is
therefore represented as SQL `NULL` and API `null`; it is never replaced with
zero, estimated, rounded, or converted from another currency. Sale price remains
required integer IRR and remains the only price exposed in public catalog
projections.

Existing `ProductVariant.costPrice` and `VariantPriceRecord.costPrice` values
remain unchanged. A new price-history entry may record an unknown cost as null.
An omitted cost in an update preserves the current value; an explicit null marks
the current cost unknown. In catalog import, a blank cost creates a new variant
with null cost, while a blank cost on an existing SKU preserves its recorded
cost. The admin labels null as «ثبت نشده».

This decision does not activate inventory financial valuation, infer historical
cost, change order/payment/refund calculations, change stock movements, or
weaken lifecycle publication requirements. Valuation remains disabled under
ADR-0031 until the independent cost-ledger acceptance is complete.

The forward migration only drops `NOT NULL` from the two catalog cost columns,
uses bounded lock and statement timeouts, and preserves all historical values.
