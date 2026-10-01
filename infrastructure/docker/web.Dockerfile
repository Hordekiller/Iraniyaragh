# syntax=docker/dockerfile:1
#
# Web image: the built Vite storefront served as static files by the same Nginx
# image that terminates public traffic. The storefront is a client-side app, so
# there is no Node process in the runtime stage; Nginx only needs the `dist/`
# output and the `public/` assets that Vite copies into it.

# --- build stage -------------------------------------------------------------
FROM node:22-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
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

# Fail the image build if a fixture-backed storefront would be shipped.
# `VITE_FIXTURE_CATALOG` serves hand-authored products instead of the real
# catalog and `VITE_FIXTURE_AUTH` fakes customer sign-in. Both are legitimate
# for local dev and the Playwright `fixture-e2e` build, and neither may reach a
# deployed image, so the build refuses rather than trusting the deploy config.
#
# These are declared as ARGs purely so the guard can see them: an undeclared
# `--build-arg` is dropped by BuildKit and the check below would silently pass.
# They are deliberately never promoted to ENV, so `vite build` cannot see them
# either. Declared-and-rejected is stronger than merely undocumented.
ARG VITE_FIXTURE_CATALOG
ARG VITE_FIXTURE_AUTH
RUN node -e "\
  for (const flag of ['VITE_FIXTURE_CATALOG', 'VITE_FIXTURE_AUTH']) { \
    if (process.env[flag] === 'true') { \
      console.error(flag + ' must not be set for a production Web image.'); \
      process.exit(1); \
    } \
  }"

# The browser talks to the API through the public Nginx origin, so the API base
# URL is a build arg. Contact details are unconfirmed business data: they default
# to null and are only published when the deploy supplies verified values.
ARG VITE_API_BASE_URL
ARG VITE_SITE_PHONE
ARG VITE_SITE_POSTAL_CODE
ARG VITE_SITE_ADDRESS
ARG VITE_SITE_EMAIL
ARG VITE_INSTAGRAM_HANDLE
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_SITE_PHONE=$VITE_SITE_PHONE
ENV VITE_SITE_POSTAL_CODE=$VITE_SITE_POSTAL_CODE
ENV VITE_SITE_ADDRESS=$VITE_SITE_ADDRESS
ENV VITE_SITE_EMAIL=$VITE_SITE_EMAIL
ENV VITE_INSTAGRAM_HANDLE=$VITE_INSTAGRAM_HANDLE

RUN pnpm --filter @iranyaragh/web build

# Prove the shipped bundle cannot contain fixture data. The fixture module is
# annotated `@__PURE__` so Rollup drops it from a non-fixture build; this check
# fails the image build if any of it survived, which would mean a deployment
# could show fabricated products.
RUN node -e "\
  const fs = require('node:fs'), path = require('node:path'); \
  const dir = 'apps/web/dist/assets'; \
  const markers = ['ronix-2210-hammer-drill', 'cat-garden', 'FIXTURE-', 'fixture-quote', 'CatalogFixtureClient']; \
  const hits = []; \
  for (const f of fs.readdirSync(dir)) { \
    if (!f.endsWith('.js')) continue; \
    const body = fs.readFileSync(path.join(dir, f), 'utf8'); \
    for (const m of markers) if (body.includes(m)) hits.push(f + ': ' + m); \
  } \
  if (hits.length) { console.error('Fixture data shipped in the Web bundle:\n  ' + hits.join('\n  ')); process.exit(1); } \
  console.log('Web bundle verified free of fixture data.');"

# --- runtime stage -----------------------------------------------------------
FROM nginx:1.27-alpine AS runtime

# Replace the stock config with the project vhost. The conf also proxies the API
# and Admin, so this container is the only one that publishes a host port.
COPY infrastructure/nginx/storefront.conf /etc/nginx/conf.d/default.conf
# Shared `add_header` set; see the file for why it cannot live inline only.
COPY infrastructure/nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html

# The config names upstream hosts that only exist on the Compose network, so it
# cannot be verified verbatim during the build. This checks the whole file with
# only the `resolver` address pointed somewhere harmless, which validates every
# directive, the `include` path and the copied snippet -- the things a typo
# would break. Whether the real upstream names resolve at runtime is covered by
# the healthcheck and the Compose health gate.
#
# The substitution is deliberately narrow. An earlier version rewrote the three
# upstream `server` lines, which stopped matching the moment the config switched
# to variable-based upstreams, so the check silently degraded into testing a file
# it had partly rewritten rather than the real one.
RUN set -eu; \
    mkdir -p /tmp/conf.d /tmp/nginx-check; \
    sed 's#resolver 127.0.0.11#resolver 127.0.0.1#' \
        /etc/nginx/conf.d/default.conf > /tmp/conf.d/default.conf; \
    sed 's#include /etc/nginx/conf.d/\*.conf#include /tmp/conf.d/*.conf#' /etc/nginx/nginx.conf > /tmp/nginx-check/nginx.conf; \
    nginx -t -c /tmp/nginx-check/nginx.conf; \
    rm -rf /tmp/conf.d /tmp/nginx-check

EXPOSE 80

# The Compose health gate is what `deploy.sh` waits on before reporting success,
# so the container needs to be able to report on itself.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://127.0.0.1/nginx-health || exit 1
