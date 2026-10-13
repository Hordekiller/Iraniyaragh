# ADR-0024: Operator-managed store invoice policy

## Decision and scope

The operator chose store invoices/Persian PDF first; official fiscal invoices and
Moadian integration remain separate. Seller identity and tax/discount treatment
are managed in Admin rather than inferred from historical proposals or hard-coded
rates. This first slice supplies the policy boundary; issuance/PDF remain dependent
work under #413. Existing order/payment/checkout snapshots are unchanged.

`InvoicePolicyRevision` is append-only. A current STAFF_MFA principal with
`settings.manage` and fresh authentication may create a revision, supplying the
complete seller name/address/public contact, explicit EXCLUSIVE/INCLUSIVE/EXEMPT
tax treatment, integer basis-point rate, exemption reason when exempt, discount
cap, shipping tax treatment, activation switch and change reason. No revision is
seeded. Missing/inactive policy blocks issuance; an editable draft may exist.

Versions are sequential under a transaction-level advisory lock and optimistic
expectedVersion. Actor-scoped durable idempotency maps a canonical payload hash
to the immutable revision. Replaying a successful command returns that same
revision, even after later activation; changed payload conflicts. No expiry can
turn an old ambiguous submit into a second activation. Both revision and command
evidence reject update/delete in PostgreSQL. Audit holds revision/version only;
public seller fields and private change reason are not copied into logs/audit.

GET/PUT `/api/v1/settings/admin/invoice-policy` use shared typed contracts. GET
returns the latest revision or null. PUT requires `Idempotency-Key`, a reason and
the expected current version (null only before the first revision). No customer
endpoint exposes this operational configuration. Future issuance takes an
authoritative current revision inside its transaction and stores its reference
and printable immutable snapshot; a later setting edit cannot alter an issued
document. This slice does not claim that issuance exists yet.

## Exact quotation boundary

The internal calculator accepts trusted catalog/order line snapshots; no public
request may set a sale price through it. All amounts are canonical nonnegative
integer IRR strings, processed with BigInt and bounded to signed BIGINT. Quantities
and basis points are bounded integers. Line discounts plus global discount may
not exceed the configured cap. Global discount is allocated proportionally to
remaining line gross amounts using largest remainders, ties by stable line order.
Allocation is exact and cannot exceed a line's remaining gross value.

Tax is calculated after discounts, per line, with half-up rounding. Exclusive:
tax = round(net * bps / 10000), total = net + tax. Inclusive: base =
round(gross * 10000 / (10000 + bps)), tax = gross - base. Exempt: tax zero,
explicit rate zero and a nonempty operator-approved exemption reason. Shipping is
taxed only when the operator explicitly configures it. Totals sum persisted line
components, never recompute a percentage of the final aggregate. Overflow fails
closed. Discounts never change stock or payment evidence. Corrections require
separate immutable documents in a later slice.

## Migration and acceptance

Forward additive migration creates empty tables, check constraints, actor/revision
foreign keys and append-only triggers. It does not edit existing orders, payments,
inventory or tax configuration. Tests cover exact allocation/rounding/overflow,
HTTP authorization/whitelisting/fresh MFA, transaction concurrency/replay, immutable
history, missing/inactive policy and redacted audit. Admin freezes an ambiguous
submit and retries the identical payload/key only after reading server state.
Issuance/PDF integration and staging acceptance are still explicit release gates.
