# Staging catalog samples, version 1

Source: the 15 prototype products in
`apps/web/src/services/catalog/fixture-data.ts`, plus the four existing images
from `apps/web/public/images`. This is a separate, explicitly opted-in staging
maintenance dataset, not a fixture client or development seed. No prototype
ratings/reviews/customer identities are imported.

All product/brand/category names carry `[دمو]`, slugs use `demo-v1-`, SKUs and
barcodes use `DEMO-V1-`, and sample stock uses `WH-DEMO-V1`/`DEMO-V1` with an
immutable `staging-demo-v1` inventory reference. Each product has a standard and
plus sample package plus a non-axis display-purpose characteristic. Weights,
cost prices and stock quantities are explicit samples, not real specifications.
Original Toman prototype prices were converted once to integer IRR in the
manifest; the importer accepts only integer IRR and performs no currency guessing.
Images are illustrative and labelled accordingly in alt/caption/description.

`../import-demo-catalog.mjs` requires authenticated SSH maintenance access and an
existing active operator with current domain permissions. It invokes shipped
application services with audit correlation `staging-demo-v1`. It never creates
users/credentials, fake sessions or fake provider results. A restore-verified
backup is an operational prerequisite (see the Docker runbook).

Creation is DRAFT, attribute/configuration writes are versioned, initial prices
are appended through the pricing command, opening stock uses idempotent inventory
adjustments, media uses signed upload/confirm plus the actual worker/scanner, and
publication uses the lifecycle command. Errors stop the import. Reruns reconcile
known samples and refuse changes to unrelated/existing altered records.

`--verify` is read-only. It checks 15 published products/30 SKUs/30 processed image
projections, public HTTP image paths, public attribute flags, IRR prices, price
history and sample stock. Browser/MFA acceptance remains a separate release gate.
