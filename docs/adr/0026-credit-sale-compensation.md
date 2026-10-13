# ADR 0026 — Credit-sale cancellation, physical returns and refund liabilities

Status: implementation proposal, acceptance required before release.

## Existing and missing capabilities

Main 385f127 already has immutable receivables, allocated receipts, staff credit
approval and proof-gated fulfillment. Inventory supports RETURN_IN, but there is
no atomic order-return command. Generic credit notes do not prove goods returned.
Gateway refunds remain separate and cannot refund a credit sale with no Payment.

## Commands and states

- Staff cancellation before dispatch compensates every consumed reservation into
  its original warehouse/location; it cancels fulfillment and the commercial order.
- After DELIVERED, staff records physically received, sellable returned quantities
  against original OrderItem IDs and an active destination warehouse/location.
  Partial returns leave CREDIT_APPROVED/DELIVERED; all quantities returned advances
  order and fulfillment to RETURNED. No shipped-but-unreceived restocking.
- Original prices are authoritative; V1 staff-sale shipping/discount must be zero.
  Later catalog prices never affect return amounts. Non-sellable/damaged goods need
  a separate quarantine/disposition contract and are not silently restocked.
- Each immutable return records original lines, RETURN_IN movements, gross amount,
  debt reduction and a separate customer refund liability. No original financial
  record is rewritten. Debt reduction is min(return gross, outstanding debt).
  Customer statements derive net principal from debt credits plus refund liabilities;
  a fully compensated receivable is CREDITED, not falsely described as cash-paid.
  The remainder is money owed back to the customer, not a completed payout.
- Cash/bank refund payout is recorded only from an actual staff-performed transfer
  with bounded private evidence. Append-only payouts may settle the liability
  partially; they never create a gateway Payment or claim provider success.
- Existing unrelated financial adjustments require reconciliation before returns;
  do not infer allocation of historical adjustments. A receipt with a return refund
  liability cannot be reversed without a separate refund-compensation decision.

## Transactions and security

Current STAFF_MFA plus credit.adjust/orders.manage/inventory.adjust is mandatory
for compensation; cash/bank payout additionally requires credit.receive. Fresh MFA
is required. Read views require credit.read. Customer-self projections expose only
owned amounts/status/quantities; no bank evidence, reasons, actors or audit internals.
Order lock -> account lock -> sorted inventory locks. Versions are mandatory.
Durable actor/resource idempotency survives process restart; a changed payload
conflicts. Evidence hashes and cumulative quantities prevent fresh-key duplication.
All writes, movements, debt note, state transitions and audit commit together.
SQL deferrable guards enforce identity, amount/quantity bounds and immutable evidence.
No seed, fixture authentication, payment activation or production financial writes.

## Acceptance

Real PostgreSQL tests: cancellation/full/partial returns, partial receipts, refund
liabilities and evidenced payout, wrong ownership/versions, duplicate keys/evidence,
concurrent receipt/return/payout, rollback, changed catalog price, terminal financial
proof, forbidden SQL mutation and complete existing paid-order regression coverage.
Strict HTTP RBAC/DTO tests, Admin ambiguity/reload states and real browser commands.
Required CI/security passes and exact-SHA deployment with restored backup precede
release; operator financial acceptance remains explicit.
