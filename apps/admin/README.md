# Iraniyaragh Admin

Persian RTL operations application for catalog, warehouse, orders, payments,
customers, roles and audit.

## Design baseline

The application selectively adopts the Next.js + TypeScript + MUI architecture of
the locally purchased Vuexy v10.11.1 starter. Iraniyaragh owns the information
architecture, visual tokens, RTL behavior, navigation, components and workflows.
Vuexy demo branding, content, remote links and full-version feature bulk are not
copied into the product.

See `docs/adr/0004-admin-ui-and-self-hosted-assets.md`.

## Runtime asset policy

Production runtime must not fetch fonts, CSS, JavaScript, icons, images or telemetry
from third-party domains. Fonts are stored under `public/fonts`; icons are bundled
from package source; application assets use same-origin paths. API and controlled
object-storage origins are configured explicitly by environment/CSP.

```bash
pnpm --filter @iranyaragh/admin dev
pnpm --filter @iranyaragh/admin check:runtime-assets
pnpm --filter @iranyaragh/admin lint
pnpm --filter @iranyaragh/admin typecheck
pnpm --filter @iranyaragh/admin build
```

The initial dashboard is an application-shell foundation, not final business data.
Operational screens are implemented milestone-by-milestone against accepted API
contracts.
