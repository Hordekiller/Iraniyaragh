# ADR-0035: Preserve bounded product-description presentation

Date: 2026-10-29. Status: implements the owner's explicit request to retain Jodit
inline styling and the supplied responsive product-description HTML after save.
Amends the initial presentation allowlist in ADR-0016; authentication, media
ownership, immutable document data and server-side sanitization remain unchanged.

The previous server allowlist discarded font size, line height, spacing, dimensions,
layout, classes, IDs and style blocks. A successful save therefore returned stripped
formatting. Jodit source transport and successful persistence alone did not establish
visual preservation.

The API now parses styles with PostCSS and HTML with htmlparser2. A bounded
presentation profile keeps grid/flex, spacing, typography, borders, gradients and
width-based responsive media rules. It preserves semantic article/section and
native details/summary markup. IDs and fragment links use the reserved `iyc-`
namespace. Stylesheets are rebuilt from approved declarations and selectors under
`[data-rich-text="true"]`; raw styles are still discarded by the HTML sanitizer.
Repeated write/read sanitization is idempotent. Existing create/import and media
projection paths share this boundary; the 100,000 UTF-16 input/output cap remains.

CSS URLs/imports, font sources, custom properties, escapes, executable values,
arbitrary at-rules, attribute selectors other than public `[open]`, functional
pseudo selectors, important overrides, fixed/sticky positioning and z-index are
unsupported. Presentation numeric values are bounded; large repeat counts are
rejected. No request Host, external stylesheet or runtime CDN supplies styling.
The original image-ownership/rendition checks remain authoritative; the supplied
example's external image must be uploaded/selected through Product Media.

Storefront, Admin saved preview and the editable Jodit surface provide the same
scope and layout/paint containment. Styled descriptions own their typography
instead of inheriting the storefront's generic table/block formatting. Plain-text
metadata and JSON-LD continue to omit stylesheet contents. Layout support does not
approve any marketing, guarantee or policy claim in supplied content.

Regression evidence includes the exact owner-supplied HTML as a test-only fixture,
safe/unsafe CSS cases, repeated sanitizer reads, actual database save/reload, native
Jodit source/save/reload and desktop/mobile computed layout. Existing stored HTML
whose formatting was previously removed needs its original source saved again;
the system cannot infer deleted declarations.
