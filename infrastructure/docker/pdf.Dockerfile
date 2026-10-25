# syntax=docker/dockerfile:1
#
# Dedicated invoice PDF render worker image (ADR-0030).
#
# The worker is the only component allowed to launch a browser engine. It is
# published as its own immutable image, built from the official Playwright base
# image whose exact Chromium revision matches the `playwright` version the API
# compiles against (both pinned to 1.52.0). It never accepts network traffic:
# no port, no HTTP surface, no shell entrypoint beyond the single node command.
#
# Chromium runs WITH its sandbox. The Playwright base image ships
# `chrome-sandbox` with the SUID bit as its documented non-root mode, so the
# worker runs unprivileged and never passes `--no-sandbox` or an equivalent.

# --- build stage: reuse the API build recipe ---------------------------------
FROM node:22-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && openssl version

WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json .npmrc* ./
COPY apps/api/package.json apps/api/
COPY apps/admin/package.json apps/admin/
COPY apps/web/package.json apps/web/
COPY e2e/package.json e2e/
COPY packages/contracts/package.json packages/contracts/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

COPY packages/contracts packages/contracts
COPY apps/api apps/api

RUN set -eu; \
    pnpm --filter @iranyaragh/api prisma:generate; \
    rm -rf /tmp/generated-prisma-client; \
    cp -r /repo/node_modules/.pnpm/@prisma+client@*/node_modules/.prisma /tmp/generated-prisma-client; \
    test -d /tmp/generated-prisma-client/client

RUN pnpm --filter @iranyaragh/api build

# Approved print assets live in the storefront workspace. They are stashed
# before `pnpm deploy --prod /out` below, because that step prunes /repo of
# every tree that is not the API's own dependency closure.
# COPY patterns treat brackets as character classes in the build context, and
# this front-end has no backslash escape for them, so the whole fonts dir is
# copied instead of the single variable-font file (it also brings OFL.txt).
COPY apps/web/public/fonts /tmp/pdf-assets/fonts
COPY apps/web/public/brand/wordmark-print.png /tmp/pdf-assets/brand/wordmark-print.png

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm --filter @iranyaragh/api deploy --legacy --prod /out

RUN set -eu; \
    for dest in /out/node_modules/.pnpm/@prisma+client@*/node_modules; do \
        rm -rf "$dest/.prisma"; \
        cp -r /tmp/generated-prisma-client "$dest/.prisma"; \
    done; \
    test -d /out/node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client

# --- runtime stage: pinned Playwright image with the matching Chromium ------
# The digest resolves a single linux/amd64 manifest, which is the only platform
# this deployment publishes for, so the browser runtime cannot shift underneath
# the pinned playwright JavaScript package.
FROM mcr.microsoft.com/playwright:v1.52.0-noble@sha256:891f067b28ce2b6ee763aca5ec49b16cede0c87eb35bf01c4f2d86d52cbf3af7 AS runtime

# tini reaps zombie browser processes and forwards SIGTERM so an in-flight
# render can settle before close. The base image ships no init, so add it while
# still root and never run the worker itself as root afterwards.
RUN apt-get update \
    && apt-get install -y --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

WORKDIR /app

COPY --from=build --chown=pwuser:pwuser /out/node_modules ./node_modules
COPY --from=build --chown=pwuser:pwuser /repo/apps/api/dist ./dist
COPY --from=build --chown=pwuser:pwuser /repo/apps/api/package.json ./package.json
# The same hash-verified font and wordmark the template binds. Copied as a flat
# tree at runtime assets location, owned by the worker user, read-only in use.
COPY --from=build --chown=pwuser:pwuser /tmp/pdf-assets/fonts ./assets/fonts
COPY --from=build --chown=pwuser:pwuser /tmp/pdf-assets/brand/wordmark-print.png ./assets/brand/wordmark-print.png

# Chromium sandbox stays ON. The base image ships the helper binary (this
# Chromium build names it chrome_sandbox) without its documented SUID mode, so
# set 4755 while root, then drop to the unprivileged worker user and assert the
# bit. A base update that drops the helper or breaks this mode fails the build
# here instead of shipping a browser that would refuse to sandbox at runtime.
RUN set -eu; \
    chromeDir="/ms-playwright/$(ls /ms-playwright | grep '^chromium-' | sort -n | tail -n 1)/chrome-linux"; \
    test -x "$chromeDir/chrome"; \
    chmod 4755 "$chromeDir/chrome_sandbox"; \
    test -u "$chromeDir/chrome_sandbox" || { echo "chrome_sandbox did not accept its SUID mode" >&2; exit 1; }

# Run unprivileged with the base image's dedicated user; never root.
USER pwuser

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/src/pdf-render-worker.js"]
