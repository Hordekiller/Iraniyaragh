# ADR-0013: Product variants, attributes and SKU identity

- Status: Proposed; becomes Accepted after independent review and merge
- Date: 2026-09-12
- Owners: Platform contract lead implements; Product/Admin lead reviews and verifies contracts
- Parent: #3
- Decision issue: #176

## Context

An operator requirement (forwarded 2026-09-12) states that a product must support
multiple sellable variations — for example color, size and length — that are
configurable and kept distinct from the shared product identity. Every variation
owns its own inventory, price, barcode and SKU. Prices are ultimately SKU-based,
must be unique, and must not change arbitrarily. Bulk Excel import/export must
understand the same Product → Attribute → Variant/SKU structure.

The current catalog (`ADS` merge #103 + #111 hardening) is flat: `Product` holds
shared content only, and `ProductVariant` carries `sku` (unique), `barcode?`
(unique), `title?`, `costPrice`/`salePrice` (BigInt), `weightGrams` and `isActive`.
There are no attribute or option entities, no variant combination identity, no
price-history persistence and no import capability. There is no SKU normalization
policy: `ABC-10` and `abc-10` are treated as different SKUs today. Inventory,
orders, purchases, transfers and stocktakes all reference `variantId` and must keep
doing so. This ADR closes the open decision-register row "product
attributes/variants/import → blocks G2–G4" and the V1 gate item "Decide product
attributes, variants, required SKU fields and import format."

## Decision

### Attribute model — fully configurable

Introduce normalized, database-level attribute entities. No `color`/`size`/… column
is hardcoded; a new attribute requires configuration, not a schema change.

- `AttributeDefinition`: stable machine `code` (e.g. `color`, `size`, `length`) that
  is immutable once created, plus a mutable Persian display `name`, optional
  description, active flag and optimistic-version counter.
- `AttributeOption`: belongs to one attribute; stable `code` (immutable) plus a
  mutable display `label`; unique per attribute. Leading/structural normalization
  keeps codes deterministic. Options are never hard-deleted; inactive options never
  silently invalidate existing variant history.
- `ProductAttributeConfiguration(productId, attributeId)`: per-product declaration
  that an attribute applies and whether it is a variant axis (`isVariantAxis`),
  required, or spec-only. Spec-only attributes never create SKUs.
- `ProductVariantAttributeValue(variantId, attributeId, optionId)`: the concrete
  option(s) of a variant; `(variantId, attributeId)` is unique, so one attribute
  cannot appear twice on the same variant. The selected option must belong to the
  declared attribute; required axes must have exactly one option.

### Variant identity — server-computed combination signature

- The server computes `combinationSignature` deterministically from the stable
  Attribute/Option IDs of a variant's axis values, sorted by stable identity, then
  hashed (SHA-256). Translated labels, display order and titles never participate.
- Uniqueness is enforced at the database: `@@unique([productId, combinationSignature])`.
- A client never submits a signature; the server always derives it.
- Renaming an attribute `name`, an option `label`, the product name or its slug
  never changes any variant identity, SKU or signature.
- A simple product with no variation axes is still represented by exactly one
  sellable variant with an empty axis combination (signature of the empty set); its
  price and stock live there, never on `Product`.

### SKU is a stable business identity

- `sku` remains the displayed human SKU; a `skuKey` column holds the canonical form
  used for uniqueness.
- Canonicalization: Unicode NFC → trim → uppercase ASCII letters → collapse runs of
  internal whitespace to a single character; all other characters are preserved.
  Leading zeros are preserved (SKU is always a string, never an integer).
- `skuKey` is globally unique. The migration backfills `skuKey` and runs a duplicate
  preflight that must be clean before the unique index is applied (the database is
  never assumed empty).
- Ordinary Product or Variant PATCH commands never change `sku`. A controlled,
  elevated, fully-audited SKU-correction command is explicitly out of scope for this
  wave; if the business later requires corrections, that command becomes a separate
  decision covering alias/reservation history.
- Internal relationships continue to use `variantId`, never SKU.

### Barcode

- Barcode belongs to the Variant, stored as a string with leading zeros preserved.
- Unique when present; normalization trims and treats empty as null (an empty string
  never becomes a synthetic barcode). Barcode is not exposed by public projections.

### Pricing and price history

- Authoritative price remains on the Variant: `costPrice` and `salePrice` as integer
  Rial `BigInt` per `ADR-0003`. `Product` never owns a sell price.
- An append-only `VariantPriceRecord` history captures each accepted price change
  (`costPrice`/`salePrice`, `effectiveAt`, source, actor, request, reason). Current
  price stays on the Variant; history is a forward-compatible foundation for
  scheduled price/wholesale lists, which remain G10 behavior.
- Every price mutation identifies the affected Variant/SKU, is transactionally
  audited and uses optimistic concurrency.
- Admin UI never computes an authoritative checkout price.

### Inventory

- No inventory redesign: balances, movements, reservations, purchase items,
  transfers and stocktakes continue to target `variantId`.
- `Product` exposes no writable stock field; product-level stock is a derived summary
  owned by a later G4 availability contract.
- Excel import never writes physical inventory balances; any future inventory import
  must use the accepted ledger command semantics.

### Excel import/export (Option A — catalog/attribute/SKU/pricing only)

- A versioned workbook contract (`iranyaragh_catalog_import_version=1`) normalized
  into `Products`, `Variants`, `Attributes`, `AttributeOptions`,
  `VariantAttributeValues` sheets.
- `Products` rows are keyed by `slug` (stable, unique identity); variants by `sku`;
  attributes/options by their stable codes. Persian titles are never import keys.
- SKU and barcode columns are explicitly text (leading zeros and large IRR values
  never pass through floating point).
- Staged flow: upload/parse → structural validation → domain validation → dry-run
  diff → operator confirmation → idempotent commit → result report. The dry-run
  reports creates/updates/unchanged rows, warnings/errors, SKU conflicts, barcode
  conflicts, duplicate combinations and unknown references. Dry-run mutates nothing.
- Import is a safe upsert (never a destructive sync) and is safe to retry with the
  same logical key. Bounds: workbook ≤10 MB, ≤10 000 rows, bounded sheet/cell counts
  and execution time; spreadsheet formulas are never evaluated; the workbook is
  parsed as data only (zip/parse-bomb protections included).
- `CatalogImportRecord` stores only bounded identifiers/counts/reports, never the raw
  workbook or sensitive data.

### Concurrency and lifecycle

- `version` counters on `Product`, `ProductVariant`, `AttributeDefinition` and
  `AttributeOption`. PATCH commands require `expectedVersion` and return
  `409 STALE_VERSION` on stale writes, per the accepted idempotency/optimistic
  concurrency guidance (`CATALOG_IDEMPOTENCY.md`: PATCH is not silently idempotent).
- Create/status POST commands continue to require the `Idempotency-Key` header under
  the accepted Catalog idempotency contract.
- `VariantStatus` (`ACTIVE|INACTIVE|ARCHIVED`) replaces boolean-only activity, with
  `isActive` retained through `expand/migrate/contract` until clients consume the new
  contract. Variants with historical references are never recreated or hard-deleted.
- Publish readiness requires at least one `ACTIVE` sellable variant.
- Changing a product's variant axes when active variants depend on an axis is
  blocked (`409 AXIS_IN_USE`); an explicit remap flow is deferred.
- Variant-generation requests are bounded (default cap 2000 combinations) and show a
  preview before persistence.

## Alternatives considered

### Keep `title` as the only variant identity

Rejected: display text is not stable identity. Renaming a label would silently split
or merge sellable variants and break inventory/order history.

### Normalize by persisted labels instead of stable IDs

Rejected: translated labels are mutable presentation. Identity computed from
Attribute/Option IDs survives any rename.

### Treat SKU canonicalization as display-only

Rejected: without a canonical unique key, `ABC-10`/`abc-10` collisions can corrupt
sellable identity. Unique `skuKey` is the DB-level guarantee.

### One row = one Product in Excel (product price and stock)

Rejected: it would move price/stock authority to product level and bypass the
ledger. The normalized workbook preserves Product/Variant separation and price stays
per-SKU.

### Include inventory balances in the first imports

Rejected for this wave (Option A). Combining catalog import with physical-inventory
writes risks bypassing `InventoryMovement`; inventory commands remain ledger-owned.

### Cast SKU/barcode to numeric import columns

Rejected: leading zeros and large/long identifiers require string cells.

## Migration plan

1. Forward migration adds the new attribute/option/configuration/value tables,
   `VariantPriceRecord`, `CatalogImportRecord`, and `skuKey`, `status`, `version`
   and optional dimension columns on `ProductVariant`.
2. Backfill `skuKey` for every existing variant with a deterministic normalization;
   run a duplicate preflight and fail loudly with a report rather than silently
   merging rows.
3. Backfill `combinationSignature`: empty-set signature for single legacy variants
   without axes; a deterministic `legacy:<variantId>` signature when a product has
   multiple attribute-less variants, preserving every existing `variantId` and SKU.
4. Backfill `status` from `isActive`; keep `isActive` in sync (contract/migrate
   phase) until unified projections land.
5. Add `skuKey` and `(productId, combinationSignature)` uniqueness after data is
   verified clean; never apply uniqueness to unverified data.
6. Rollback/recovery: forward-only migration; recovery is a forward-fix migration or
   restore from backup — existing SHARED_KEYS and variant identities are preserved so
   downstream references remain valid and ordering can be replayed.

## Verification gates

- One product with one SKU; multi-color; color × size — all produce correct
  combinations and identities.
- Duplicate SKU (case/whitespace/canonical), duplicate barcode, leading-zero barcode
  and duplicate combination are rejected; renames change neither SKU nor identity;
  ordinary updates cannot change SKU; concurrent same-SKU/same-combination creation
  yields exactly one winner.
- Public projection never leaks `costPrice`, barcode, internal signatures or
  warehouse facts; publish is rejected without an active sellable variant.
- Price history: each change is recorded append-only with actor/reason; stale admin
  writes return `STALE_VERSION`; audit records are bounded.
- Excel: malformed/oversized workbook rejected; row errors deterministic; dry-run
  performs zero mutations; same-logical-key retry is idempotent; unchanged
  export→import produces zero changes; Persian labels, leading-zero barcodes, large
  IRR values and SKU/combination identity survive round-trip.
- Integration tests on real PostgreSQL cover the DB invariants and races above.

## Consequences

- SKU, barcode, combination and stale-edit correctness is enforced at the database
  and service layer, not by UI validation.
- `Product` stays content-only; price/stock authority remains per-Variant/SKU.
- The Excel boundary keeps inventory and pricing authority in the platform, and the
  versioned workbook is forward-compatible for later inventory/availability columns.
- A future SKU-correction or axis-remap feature is a separate decision, not silently
  invented here.

## Primary references

- `docs/FOUNDATION.md` (money, inventory, orders, authorization)
- `docs/CATALOG_IDEMPOTENCY.md` (idempotency scope + optimistic-concurrency PATCH)
- `docs/COMMERCE_EXPANSION_PLAN.md` G2/G3 (attribute/variant/import requirements)
- `docs/AGENT_WORKSTREAMS.md` (`D→C→P→A/W→I` train, hotspot ownership)
- Issue #176 (decision register) and #3 (Epic 0.2)