# Decofix glass demonstrations

The owner requested a Decofix-only initial catalog, 4 mm glass and
10,000,000 toman per square metre (100,000,000 integer IRR/M2).
The 16 initial options are an editable starting palette, not a claim to enumerate
all manufacturable colors. Physical availability, cutting rules, final technical
approval and deposit policy are deliberately not invented.

`sample-grid.png` is a generated 4×4 photographic-style illustration, not a photo
of inventory. All 240×240 WebP crops are visibly labelled synthetic/test samples.
`node scripts/prepare-door-glass-assets.cjs --check` verifies exact source/crop hashes
and both app copies. A READY media-library image selected by the operator takes
precedence over a synthetic sample. Sample selection does not alter prices.

Admin: `/admin/custom-doors/models` edits the model, selectable glass IDs, formula,
technical limits and approval policy. `/admin/custom-doors/glass` edits colors,
thickness, M2 rates, activity, sample choice and a READY library image. Original
upload dimensions are displayed separately from served rendition dimensions.
Glass cards use 1:1; recommended uploads are 480×480 or larger at 1:1. Model cards
use 4:3; recommended uploads are 1200×900 or larger at 4:3. No image is stretched.

`apps/api/scripts/provision-decofix-catalog.cjs` is an explicit owner-authorized
SSH maintenance command, not a dev seed or fixture authentication path. It requires
one currently active operator with both catalog.write and pricing.write, validates
the deployed DTO contract, and calls domain catalog commands in one serializable
transaction with immutable revisions/audit attribution. Use --plan first; --apply
requires DECOFIX_CATALOG_AUTHORIZED=true and a freshly restored/verified backup.
--verify reconciles material data and 1m2, 0.5m2 and multi-door estimates. Repeating
--apply does not duplicate rows and refuses to overwrite operator edits.

Deployment evidence for the initial catalog: backup restored privately on VPS;
import rehearsed and repeated on the restored database, then applied to live;
public API returned one DECOFIX model and 16 active 4mm choices, all at the owner
rate. A public 800×2000mm preview calculated 16,000,000 toman. No live customer
order, payment or paid outcome was manufactured. Technical approval remains
required; final payable amount and deposit are null until approved.

The customer form chooses an available published door type on catalog load and
only offers types with active models, so a Decofix-only catalog does not open on
an empty Formlex tab. Color cards and the existing native select stay synchronized;
incompatibility is enforced both in the UI and by server quoting.
