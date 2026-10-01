# syntax=docker/dockerfile:1
#
# API image: compiled NestJS output plus the production dependency tree and the
# generated Prisma client. The image runs the compiled `main.js` and the media
# worker; it does not run migrations. Migrations are a separate one-shot service
# in the compose file so that they always complete before the API accepts
# traffic (see `migrate`).

# --- build stage -------------------------------------------------------------
FROM node:22-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

# Prisma shells out to `openssl version` to decide which query-engine binary to
# generate. The slim base ships the OpenSSL 3 runtime library that Node links
# against, but not the `openssl` binary, so detection silently falls back to
# "openssl-1.1.x" and generates an engine the image cannot load. The symptom is
# confusing because generation succeeds and the failure only appears at runtime
# as "could not locate the Query Engine for runtime debian-openssl-3.0.x".
# Installing the binary makes detection correct and is Prisma's documented fix
# for Docker.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && openssl version

WORKDIR /repo

# Install with the lockfile first so dependency layers cache independently of
# application source.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json .npmrc* ./
COPY apps/api/package.json apps/api/
COPY apps/admin/package.json apps/admin/
COPY apps/web/package.json apps/web/
COPY e2e/package.json e2e/
COPY packages/contracts/package.json packages/contracts/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# `@iranyaragh/contracts` is a type-only workspace package (it ships no runtime
# build output), so the API compiles against its source and never requires it at
# runtime. Copying the workspace sources here is therefore only needed for the
# compiler's type resolution.
COPY packages/contracts packages/contracts
COPY apps/api apps/api

# `prisma generate` writes the client into node_modules, and a generated client
# is not part of the lockfile. Snapshot it first, because `pnpm deploy` below
# prunes /repo and would take the generated client with it. A missing glob makes
# `cp` fail, so an ungenerated client stops the build here.
RUN set -eu; \
    pnpm --filter @iranyaragh/api prisma:generate; \
    rm -rf /tmp/generated-prisma-client; \
    cp -r /repo/node_modules/.pnpm/@prisma+client@*/node_modules/.prisma /tmp/generated-prisma-client; \
    test -d /tmp/generated-prisma-client/client

RUN pnpm --filter @iranyaragh/api build

# Re-resolve the dependency tree for the runtime stage only, so devDependencies
# and the other workspaces stay out of the shipped image. `--legacy` is required
# because this workspace does not use injected workspace packages.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm --filter @iranyaragh/api deploy --legacy --prod /out

# Put the generated client back into the deployed tree. Without this the image
# builds fine and then throws MODULE_NOT_FOUND on the first query, so a missed
# match fails here instead. The destination is the pnpm store path because both
# trees come from the same lockfile.
RUN set -eu; \
    for dest in /out/node_modules/.pnpm/@prisma+client@*/node_modules; do \
        rm -rf "$dest/.prisma"; \
        cp -r /tmp/generated-prisma-client "$dest/.prisma"; \
    done; \
    test -d /out/node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client

# --- runtime stage -----------------------------------------------------------
FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
# `tini` reaps zombies and forwards SIGTERM, so `docker stop` reaches Nest and
# lets in-flight requests finish instead of being cut off.
RUN apt-get update \
    && apt-get install -y --no-install-recommends tini ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=build /out/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/prisma ./prisma
COPY --from=build /repo/apps/api/package.json ./package.json
COPY --from=build /repo/apps/api/scripts ./scripts

# The Prisma query engine is a native binary linked against OpenSSL, and the
# only way to know the image actually ships a loadable engine is to resolve the
# engine for this platform the way Prisma does. Checking that the client class
# merely exports is not enough: that passed while the image was still broken.
#
# Prisma maps the OpenSSL major version found on the host to a binary target
# named debian-openssl-<major>.0.x, so derive the expected file from the libssl
# that is actually installed and require an exact match. If generation silently
# falls back to a different OpenSSL, the build fails here instead of the
# container crash-looping on the first query.
COPY --chown=node:node infrastructure/docker/verify-prisma-engine.mjs ./verify-prisma-engine.mjs
RUN node ./verify-prisma-engine.mjs && rm ./verify-prisma-engine.mjs

# Run unprivileged. The `node` user ships with the base image (uid 1000).
RUN chown -R node:node /app
USER node

EXPOSE 4000

# Liveness only: the API process is up. Readiness (which also checks Postgres
# and Redis) is verified by the compose healthcheck against /health/ready.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||4000)+'/api/v1/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/src/main.js"]

# --- migrate stage -----------------------------------------------------------
# `prisma migrate deploy` needs the Prisma CLI, which is a devDependency, and the
# runtime image is deployed with production dependencies only -- it has no
# node_modules/.bin at all. Running `npx prisma` there would try to download an
# unpinned CLI from the registry on the host, which fails on an isolated host and
# is not reproducible even when it works.
#
# This one-shot stage reuses the already-built `build` stage, so it costs no
# extra build work, and keeps the CLI out of the long-running runtime image.
FROM build AS migrate
WORKDIR /repo/apps/api
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]
