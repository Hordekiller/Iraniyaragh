# Catalog attributes, variants, SKU and import contract

Status: proposed implementation contract for #176 / #178
Policy: `docs/adr/0013-product-variants-attributes-and-sku-identity.md`
Owner: `@Hordekiller` (platform contract lead); independent reviewer: `@Maddyrampant`
Last reviewed: 2026-09-12

This document is the contract contract-first source for the `C` wave. Platform
implementation (`P1`–`P3`) and client binding (`A`/`W`) must conform to the exported
types in `packages/contracts/src/catalog.ts` and the rules below. No Prisma model is
part of the public contract.

## 1. Attribute model

An attribute is configured once and reused by any product. Codes are the machine
identity and never change; names/labels are Persian presentation and may change
without affecting any variant identity.

- `AttributeDefinition`: `code` (immutable; grammar in the "Code grammar" paragraph
  below), `name`, optional
  `description`, `status` (`ACTIVE|INACTIVE`), `version`.
- `AttributeOption`: belongs to one attribute; `code` (immutable) + `label` (mutable),
  unique per attribute, `status`, `version`.
- `ProductAttributeConfiguration`: per product, `attributeCode`, `isVariantAxis`,
  `isRequired`. Spec-only (`isVariantAxis=false`) attributes never generate SKUs.
- `VariantAttributeValue`: a variant's selected `optionCode` per axis `attributeCode`.

Code grammar (attributes and options): NFC, trim, ASCII lowercase, `[a-z0-9]+` runs
separated by single `-`; 2–40 chars; reserved words rejected (`new`, `edit`, `all`).
Titles are never keys and never participate in identity.

## 2. Variant identity and combination

- The server derives `combinationSignature = sha256(sorted("attributeId:optionId"))`
  over the variant's axis values. Labels, order, product name and slug are excluded.
- `(productId, combinationSignature)` is unique at the database. A simple product has
  one variant with the empty-set signature.
- Axis set is fixed while active variants depend on it; removing an axis in use
  returns `409 AXIS_IN_USE` (remap flow deferred).
- Generation: `optionSelection: { attributeCode: optionCode[] }` produces the
  Cartesian product of the product's configured variant axes. Preview is read-only;
  persistence is a separate idempotent command with a hard cap
  (`COMBINATION_LIMIT_EXCEEDED` beyond 2000 combinations).
- Generated variants receive a server-owned SKU of
  `{product.slug}-{optionCode}-{optionCode}...`, using configured axis order; the
  client cannot provide or override generated SKU identity. `titlePattern` may use
  `{attributeCode}` placeholders for display titles only.
- With zero configured axes, preview returns one `Default` empty-set combination;
  generation creates the product-slug SKU and an existing base variant is rejected
  by the normal duplicate SKU/combination guards.

## 3. SKU and barcode

- `sku` display string plus canonical `skuKey` (NFC → trim → uppercase ASCII →
  collapse internal whitespace). `skuKey` is globally unique; leading zeros and
  non-ASCII characters are preserved after normalization.
- SKU is always a string in transit; never parsed as a number. Ordinary
  Product/Variant PATCH never changes `sku`. Any update or import body that
  contains a `sku` field is **rejected with `409 SKU_CHANGE_NOT_ALLOWED`, never
  silently stripped or ignored** — the request type also excludes `sku`
  structurally (`ProductVariantUpdateRequest`), but the runtime guard is the
  authoritative defence so the error code stays reachable. A controlled
  SKU-correction command is out of scope this wave.
- `barcode` is a trimmed string (leading zeros preserved), unique when present,
  empty ⇒ `null`. Barcode is absent from public projections.
- Internal references always use `variantId`, never SKU.

## 4. Pricing

- Authoritative price is per Variant: `costPrice`, `salePrice` as `Money` (integer
  IRR). `Product` has no sell price.
- Every accepted price mutation appends a `VariantPriceRecord`
  (`costPrice`, `salePrice`, `effectiveAt`, `source`, `actorUserId`, `reason`,
  `requestId`, `createdAt`) inside the same transaction as the variant update and
  audit entry. History is append-only.
- PATCH price requires `expectedVersion`; stale ⇒ `409 STALE_VERSION`.
- Scheduled/promotional pricing is G10 and excluded.

## 5. Concurrency and lifecycle

- Versioned entities: Product, ProductVariant, AttributeDefinition, AttributeOption.
- PATCH commands carry `expectedVersion`; mismatch ⇒ `409 STALE_VERSION`. Create and
  status POST commands keep the `Idempotency-Key` contract from
  `docs/CATALOG_IDEMPOTENCY.md`.
- `VariantStatus` = `ACTIVE|INACTIVE|ARCHIVED`; `isActive` is retained during the
  migrate/contract phase. No hard delete. Product publish requires ≥1 `ACTIVE`
  variant; otherwise `422 UNPROCESSABLE` with a stable catalog code.

## 6. Error-code matrix

| Situation                                    | HTTP | `code`                          |
| -------------------------------------------- | ---- | ------------------------------- |
| stale `expectedVersion`                      | 409  | `STALE_VERSION`                 |
| SKU canonical collision                      | 409  | `DUPLICATE_SKU`                 |
| barcode collision                            | 409  | `DUPLICATE_BARCODE`             |
| axis combination collision                   | 409  | `DUPLICATE_VARIANT_COMBINATION` |
| SKU change via ordinary PATCH                | 409  | `SKU_CHANGE_NOT_ALLOWED`        |
| attribute/option invalid for product or axis | 422  | `ATTRIBUTE_OPTION_INVALID`      |
| removing an axis in use                      | 409  | `AXIS_IN_USE`                   |
| combination count over cap                   | 422  | `COMBINATION_LIMIT_EXCEEDED`    |
| workbook structural/row error                | 422  | `IMPORT_VALIDATION`             |
| workbook over size/row/time bounds           | 413  | `IMPORT_TOO_LARGE`              |

Granular catalog codes are additive to `API_ERROR_CODES`; generic `CONFLICT` remains
valid when no granular code applies.

## 7. Excel workbook v1

Sheet name and order are fixed. Persian labels are never keys. All cells are read as
values; formulas are never evaluated and no macro/external link is honored.

### `Products`

| Column         | Key | Notes                                           |
| -------------- | --- | ----------------------------------------------- |
| `slug`         | yes | stable product identity, immutable after create |
| `name`         |     |                                                 |
| `description`  |     | optional                                        |
| `brandSlug`    |     | optional, must exist                            |
| `categorySlug` |     | optional, must exist                            |
| `status`       |     | `DRAFT` / `PUBLISHED` / `ARCHIVED`              |

> **Status reconciliation:** the workbook validates against contract
> `CatalogStatus` (`DRAFT|PUBLISHED|ARCHIVED`). At `P1`, the platform maps contract
> `PUBLISHED` ⇄ schema `ProductStatus.ACTIVE/INACTIVE` exactly as the #173 status
> flow does; the import contract and the DB enum never silently drift.

### `Variants`

| Column        | Key | Notes                               |
| ------------- | --- | ----------------------------------- |
| `productSlug` | yes | must match `Products.slug`          |
| `sku`         | yes | canonical identity; change rejected |
| `barcode`     |     | text, leading zeros preserved       |
| `title`       |     | optional                            |
| `costPrice`   |     | integer string, IRR                 |
| `salePrice`   |     | integer string, IRR                 |
| `weightGrams` |     | optional integer                    |
| `status`      |     | `ACTIVE                             | INACTIVE | ARCHIVED` |

### `Attributes`

| Column        | Key | Notes             |
| ------------- | --- | ----------------- |
| `code`        | yes | stable, immutable |
| `name`        |     | Persian label     |
| `description` |     | optional          |
| `status`      |     | `ACTIVE           | INACTIVE` |

### `AttributeOptions`

| Column          | Key | Notes                        |
| --------------- | --- | ---------------------------- |
| `attributeCode` | yes | must match `Attributes.code` |
| `code`          | yes | stable, immutable            |
| `label`         |     | Persian label                |
| `status`        |     | `ACTIVE                      | INACTIVE` |

### `VariantAttributeValues`

| Column          | Key | Notes                                |
| --------------- | --- | ------------------------------------ |
| `sku`           | yes | must match `Variants.sku`            |
| `attributeCode` | yes | must be configured as a variant axis |
| `optionCode`    | yes | must belong to the attribute         |

The parser rejects unknown headers/sheets, duplicate keys within a sheet and empty
key cells. Unknown columns are an error, not silently ignored, in v1.

## 8. Staged import flow

1. `POST /api/v1/catalog/admin/imports` (`multipart/form-data`, `Idempotency-Key`,
   `x-iranyaragh-catalog-version: 1`) → validate structure → return
   `CatalogImportUploadResponse` with storage reference only (raw file never stored
   long-term in the report).
2. `GET /api/v1/catalog/admin/imports/:id` → current `CatalogImportDryRunReport`.
3. `POST /api/v1/catalog/admin/imports/:id/dry-run` → recompute domain diff with
   **zero mutations**; returns summary + bounded issues/items (`truncated` flag).
4. `POST /api/v1/catalog/admin/imports/:id/commit` (`Idempotency-Key`) → single
   transaction; per-row outcomes; result report. Replaying the same key returns the
   stored result.
5. `GET /api/v1/catalog/admin/export` → streamed workbook, same schema, filters via
   `CatalogExportQuery`.

Import is an upsert keyed by `slug`/`sku`/`code`; it never deletes rows, never writes
inventory, and never changes an existing `sku`. Commit applies creates first, then
updates, then attributes/options before variants, in a deterministic order. Any
`error` row aborts the whole commit (all-or-nothing).

For every product that references an attribute through a `VariantAttributeValues`
row, commit auto-configures that attribute as `isVariantAxis: true,
isRequired: true` on the product (`ProductAttributeConfiguration` upsert). This is
intentional for migration — a workbook expresses the axis set simply by using
values, and import is the only bulk path that (re)asserts the axis set for an
existing product. Attributes referenced only as descriptive metadata (no values
rows in this workbook) are never reconfigured. A re-import of an unchanged catalog
must report zero changes and rewrite no variant rows.

## 9. Bounds and safety

- Workbook ≤ 10 MB, ≤ 10 000 data rows total, bounded sheet/cell counts, bounded
  parse/commit time. Over bound ⇒ `IMPORT_TOO_LARGE`.
- A 10 MB byte bound on the archive is enforced. The parser runs `exceljs` after
  that byte check; the OOXML archive is decompressed in memory during parse, so a
  small archive that expands mid-parse is limited only by the post-parse row-count
  bound and the node per-process memory ceiling. Shared-string and single-cell
  bounds are applied after materialisation, not before: a decompression-time guard
  is the remaining follow-up before this authenticated endpoint can face
  untrusted/oversized input at scale.
- `CatalogImportRecord` persists only import ID, actor, version, status, counts,
  bounded issues, summary and timestamps — never the raw workbook. **The parsed
  workbook is held in bounded process-local memory** (32 imports, 24 h TTL,
  FIFO eviction ⇒ `IMPORT_NOT_AVAILABLE`). This is a real availability limitation
  for the staff-facing staged flow: an upload and its commit must reach the same
  instance, and any deploy or restart between them loses the parsed payload. A
  durable parsed-payload storage reference is the intended next step.
- The API parser uses the exact-pinned `exceljs@4.4.0` package for OOXML workbook
  values and exports; formulas are rejected as data, and the pnpm `uuid@11.1.1`
  override removes the vulnerable transitive `uuid@8` range required by the
  dependency security gates.

## 10. OpenAPI example bodies

Create a configurable multi-variant product:

```json
{
  "name": "تی‌شرت نخی",
  "slug": "cotton-tee",
  "attributeConfig": [
    { "attributeCode": "color", "isVariantAxis": true, "isRequired": true },
    { "attributeCode": "size", "isVariantAxis": true, "isRequired": true }
  ],
  "variants": [
    {
      "sku": "TEE-RED-M",
      "costPrice": { "amount": "2500000", "currency": "IRR" },
      "salePrice": { "amount": "3900000", "currency": "IRR" },
      "attributeValues": [
        { "attributeCode": "color", "optionCode": "red" },
        { "attributeCode": "size", "optionCode": "m" }
      ]
    }
  ]
}
```

Price change with optimistic concurrency:

```json
{
  "costPrice": { "amount": "2600000", "currency": "IRR" },
  "salePrice": { "amount": "4100000", "currency": "IRR" },
  "reason": "supplier increase",
  "expectedVersion": 3
}
```

Conflict response:

```json
{
  "code": "STALE_VERSION",
  "message": "version conflict",
  "requestId": "…",
  "statusCode": 409,
  "details": { "expected": 3, "actual": 4 }
}
```

## 11. Verification gates

- Contract types compile and are consumed by API/admin without Prisma leakage.
- Rename tests: changing `name`/`label`/`slug` changes no SKU or signature.
- Concurrency tests: two writers with one `expectedVersion` succeed once; duplicate
  SKU/barcode/combination creation yields one winner.
- Ledger isolation: import never mutates inventory balances.
- Round-trip: export → import of an unchanged catalog reports zero changes; leading
  zeros, large IRR values and Persian labels survive.
- Public projection omits `costPrice`, barcode and internal signatures; publish is
  refused without an active variant.
