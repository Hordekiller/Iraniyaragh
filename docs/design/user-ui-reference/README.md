# User UI Reference

This directory contains the archived User UI design source for teammate access.
It is reference material only and is not a workspace package or production code.

## Boundary

- `src/` contains visual components and design references.
- `public/` contains reviewed local visual assets.
- No `package.json`, `package-lock.json`, Vite config or node_modules is included
  here. Prototype-only data and cart context may remain inside `src/` so the
  visual source stays inspectable, but they are explicitly non-production.
- Do not import this directory from `apps/web` or `apps/admin`.
- Do not treat prices, stock, product identities or cart behavior in the source
  as business truth.

## Controlled transfer

Selected visual patterns may be ported into `apps/web` through a separate Web
lane PR after the accepted public catalog/rendering contracts are available.
The target must use existing workspace dependencies, `@iranyaragh/contracts`,
the existing route/session boundaries and explicit fixture gating where needed.

The extraction plan is documented in `docs/UI_EXTRACTION_MAP.md` on the Web
lane. The archived source was linted and audited before being placed here.
