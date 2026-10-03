# Product entry and lifecycle

## Reference data policy

Brand and category are optional at product creation. The Admin and API accept an
empty brand or category consistently; if either is selected, its ID is sent and
must resolve to a valid reference. Operators can create a brand or category from
the product form, and the new item is selected when the dialog closes.

An empty catalog remains empty. Do not seed demo brands, categories, products,
variants, prices, or media into staging or production. For a new store, an
authorized operator should create the real brand and category records in Admin
or validate and commit a real catalog file through the catalog import dry-run
workflow before entering products.

## Product creation sequence

1. Create a product as a draft with its name, unique slug, optional brand/category,
   and sanitized description.
2. Open the saved product detail. Configure attributes and create variants with
   their SKU, identifiers, and integer IRR prices.
3. Save the description with the versioned description action and add/select
   product media from the product media screen. Only ready media can be promoted
   to the primary image.
4. Publish through the product lifecycle action. The API checks for an active
   variant and exactly one ready primary image before changing the product state.

Product creation cannot directly set `PUBLISHED` or `ARCHIVED`. Those states
require their authorized lifecycle actions, which are audited and idempotent.
Failed or ambiguous submits retain the same idempotency key until the operator
changes the draft or receives a confirmed success.
