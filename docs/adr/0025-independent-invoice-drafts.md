# ADR-0025: Independent proforma workspace

## Scope

#416 implements quotation drafts before final issuance. An Order DRAFT already
reserves stock/becomes pending payment; it is not the editable invoice workspace.
Draft create/edit/requote/cancel never posts an order, payment, stock movement,
receivable or customer SMS. No final number or publication is fabricated.

CATALOG drafts select an existing active customer, active published real SKU,
bounded quantity and explicit integer-IRR requested discounts. Reuse the existing
StaffOrderService catalog snapshot pricing method; clients cannot set sale prices,
titles, status or totals. Reuse the configured shipping adapter through an explicit
cart-independent read-only tariff method. It validates the same Iranian address
and active configured fixed tariff. Pickup reuses the existing staff pickup policy;
no fictitious cart/ShippingQuote row is created. Catalog prices/tariff snapshots
expire after fifteen minutes and require explicit requotation when changed.

ORDER drafts bind the actual original customer, order version, immutable-priced
line snapshots and shipping terms. Staff notes are never copied. Address/notes,
quantity and requested discounts are editable in the quotation only. The response
distinguishes an edited quotation from matching original financial terms. Future
issuance must verify the source version and exact authorized order terms; it may
not issue a conflicting sale document or directly edit the order. Catalog quote
conversion/unsupported tax-discount terms remain dependent authorized domain work.

No policy is invented for drafts. When no active policy exists, the draft is still
stored with bounded validated inputs/prices but has no complete tax quotation.
The response explicitly says POLICY_REQUIRED. A configured quote pins the
append-only policy revision; later changes require explicit requotation. Reading
never silently reprices persisted lines. Issuance separately requires current
active policy and authoritative order reconciliation under #417.

## Persistence and authorization

InvoiceDraft/InvoiceDraftLine hold the current editable workspace. Every command
appends a protected immutable InvoiceDraftRevision including actor/request/action
and snapshot. Audit stores IDs/version only, no buyer/address/notes. Draft history
is staff-only; no customer endpoint exposes unpublished quotations. Registered
invoices.read/invoices.manage require STAFF_MFA; writes/options also require
invoices.read so command responses cannot bypass the read permission.

Actor/scope/key hashes map durably to draft ID and committed version. Replays read
the current workspace but explicitly return the original committedVersion and
replayed flag; this does not claim that a later revision is the original command
payload. Same key/changed canonical payload conflicts. An advisory draft lock and
serializable transactions enforce optimistic versions. One active order-backed
draft per order prevents accidental duplicate workspaces under new create keys.
Cancelled drafts remain retrievable with their complete protected history.

## Acceptance

Use real isolated PostgreSQL to prove original order snapshots survive catalog
repricing, tariffs/discounts/tax are backend-calculated, reload persists the same
workspace, version/concurrent/restart replay works and every financial/stock/event
table is unchanged. HTTP tests enforce current permissions and reject price/status/
actor injections. Admin uses real selection/commands, locked ambiguous requests
and explicit revision/quote review. Final issuance/PDF/publication are separate
acceptance gates; implementing a quotation does not complete Epic #413.
