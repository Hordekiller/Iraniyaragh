# User UI Extraction Map

This is the short handoff map for the archived design source in
`docs/design/user-ui-reference`. It is reference-only; no source here is a
production route or business authority.

| Reference source | Future Web target | Required contract gate |
| --- | --- | --- |
| `src/components/Header.tsx` | `apps/web` layout/header | Accepted route, auth and session contracts |
| `src/components/HeroSlider.tsx` | `apps/web` hero components | Local asset and accessibility review |
| `src/components/CategoriesSection.tsx` | Web catalog category components | Accepted public catalog projection and #126 rendering strategy |
| `src/components/PopularToolsSection.tsx` and `ProductCard.tsx` | Web product components | Accepted product, price and availability projections |
| `src/components/CartDrawer.tsx` and `src/context/*` | Existing Web cart boundary | Server-priced cart/checkout contract; never copy local totals or cart authority |
| `public/images/**` | Reviewed self-hosted Web assets | Asset provenance, alt text, responsive/performance review |

Do not copy the prototype package manifests, lockfile, Vite setup, route tree,
static sellable data, cart context or dependency versions into production.
Contact values such as `021-88776655` are synthetic placeholders.
