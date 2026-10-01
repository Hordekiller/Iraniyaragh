# syntax=docker/dockerfile:1
#
# Admin image: the Next.js standalone server. `next.config.ts` already sets
# `output: 'standalone'`, so the server runs from `.next/standalone/server.js`
# rather than `next start` (which is incompatible with standalone output and
# warns about it in the build logs).

# --- build stage -------------------------------------------------------------
FROM node:22-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json .npmrc* ./
COPY apps/admin/package.json apps/admin/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY e2e/package.json e2e/
COPY packages/contracts/package.json packages/contracts/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

COPY packages/contracts packages/contracts
COPY apps/admin apps/admin

# Fail the image build if a fixture-backed Admin would be shipped. The Admin has
# a fixture staff client behind `NEXT_PUBLIC_FIXTURE_AUTH`; a production image
# that enables it would render a fake operator instead of a real one, so this
# guard turns a silent misconfiguration into a failed build.
#
# Declared as an ARG only so the guard can observe it (BuildKit drops an
# undeclared `--build-arg`), and deliberately never promoted to ENV so the Next
# build cannot consume it.
ARG NEXT_PUBLIC_FIXTURE_AUTH
RUN node -e "\
  if (process.env.NEXT_PUBLIC_FIXTURE_AUTH === 'true') { \
    console.error('NEXT_PUBLIC_FIXTURE_AUTH must not be set for a production Admin image.'); \
    process.exit(1); \
  }"

# NEXT_PUBLIC_* values are inlined into the client bundle at build time, so they
# are build args and must be supplied by the deploy, not at run time.
ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_MEDIA_ORIGIN
# The staging proxy mounts the Admin on /admin. Next reads this while building to
# emit asset URLs under that prefix; passing it only at run time is too late.
ARG NEXT_PUBLIC_BASE_PATH=
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_MEDIA_ORIGIN=$NEXT_PUBLIC_MEDIA_ORIGIN
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH

RUN pnpm --filter @iranyaragh/admin build

# --- runtime stage -----------------------------------------------------------
FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV PORT=3001
ENV HOSTNAME=0.0.0.0
RUN apt-get update \
    && apt-get install -y --no-install-recommends tini ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# The standalone output is nested because the app lives at `apps/admin` inside
# the monorepo, so its server entry is `apps/admin/server.js` and its
# `node_modules` sits at the image root. Copying the whole standalone directory
# keeps that relative layout, which is what the server resolves dependencies
# against.
#
# Standalone does not include `public/` or the default `.next/static`, so both
# are copied alongside, at the paths the nested server expects.
COPY --from=build --chown=node:node /repo/apps/admin/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/admin/.next/static ./apps/admin/.next/static
COPY --from=build --chown=node:node /repo/apps/admin/public ./apps/admin/public

# Fail the image build if the entrypoint the container runs is not actually
# present, rather than discovering it as a crash loop on the host.
RUN test -f apps/admin/server.js && test -d apps/admin/.next/static && test -d apps/admin/public

USER node

EXPOSE 3001

# The base path is not a secret and is already baked into the bundle, so it is
# repeated here for the healthcheck to find. Without it the probe would request
# /login, which is a 404 once the app is built with basePath=/admin, and the
# container would never report healthy. The ARG has to be declared again because
# it does not carry across stages, and it is given a default so the image still
# builds when the deploy does not set one.
ARG NEXT_PUBLIC_BASE_PATH=
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH

# Probes a real page rather than `/` so a base-path misconfiguration is caught
# here instead of by a user hitting a blank Admin.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "const b=process.env.NEXT_PUBLIC_BASE_PATH||'';fetch('http://127.0.0.1:'+(process.env.PORT||3001)+(b||'')+'/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "apps/admin/server.js"]
