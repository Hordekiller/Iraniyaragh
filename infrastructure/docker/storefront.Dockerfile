# syntax=docker/dockerfile:1
# The public Next App Router renderer. Nginx remains the web image/entry point;
# this image has no published host port and receives only public runtime config.
FROM node:22-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json .npmrc* ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY apps/admin/package.json apps/admin/
COPY e2e/package.json e2e/
COPY packages/contracts/package.json packages/contracts/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile
COPY packages/contracts packages/contracts
COPY apps/web apps/web

# Declared-and-rejected: BuildKit silently drops unknown build args. Never turn
# fixture authentication or fixture catalog data into a publishable release.
ARG VITE_FIXTURE_CATALOG
ARG VITE_FIXTURE_AUTH
ARG NEXT_PUBLIC_FIXTURE_CATALOG
ARG NEXT_PUBLIC_FIXTURE_AUTH
RUN node -e "for(const flag of ['VITE_FIXTURE_CATALOG','VITE_FIXTURE_AUTH','NEXT_PUBLIC_FIXTURE_CATALOG','NEXT_PUBLIC_FIXTURE_AUTH']){if(process.env[flag]==='true'){console.error(flag+' must not be enabled in a deployed storefront.');process.exit(1)}}"
ENV VITE_FIXTURE_CATALOG=false
ENV VITE_FIXTURE_AUTH=false
ENV NEXT_PUBLIC_FIXTURE_CATALOG=false
ENV NEXT_PUBLIC_FIXTURE_AUTH=false

# All browser traffic uses this origin's /api proxy. Canonicals, environment
# indexability and the internal API address are runtime-only server settings.
RUN pnpm --filter @iranyaragh/contracts build && pnpm --filter @iranyaragh/web build
RUN node -e "const fs=require('node:fs'),p=require('node:path');const hits=[];function scan(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=p.join(dir,e.name);if(e.isDirectory())scan(f);else if(e.name.endsWith('.js')){const b=fs.readFileSync(f,'utf8');for(const m of ['ronix-2210-hammer-drill','cat-garden','FIXTURE-','fixture-quote','CatalogFixtureClient'])if(b.includes(m))hits.push(f+': '+m)}}}scan('apps/web/.next/static');if(hits.length){console.error('Fixture data shipped in storefront browser bundle:',hits);process.exit(1)}"

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN apt-get update \
    && apt-get install -y --no-install-recommends tini ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
RUN test -f apps/web/server.js && test -d apps/web/.next/static && test -d apps/web/public
USER node
EXPOSE 3000
# Liveness of the renderer is separate from API readiness and edge TLS health.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "apps/web/server.js"]
