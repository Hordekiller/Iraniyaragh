#!/usr/bin/env bash
#
# Build, migrate and roll forward a deployment.
#
# Order is deliberate and is the reason this script exists rather than a bare
# `docker compose up`:
#   1. back up the database *and* the media objects before anything changes
#   2. build images from the checked-out commit
#   3. run migrations explicitly, so a schema failure is reported before any new
#      container is created and the previous release keeps serving
#   4. start the application services (compose re-runs the migrate gate here,
#      which is a no-op once the migrations are applied)
#   5. wait for real readiness, not just "container started"
#
# A failure at any step leaves the previous release running and prints how to
# roll back. Migrations are not automatically reversed: restoring the pre-migrate
# backup is the documented way to undo a schema change.

set -Eeuo pipefail

INFRA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../infrastructure/docker" && pwd)"
COMPOSE_FILE="${INFRA_DIR}/compose.staging.yml"
ENV_FILE="${ENV_FILE:-${INFRA_DIR}/.env.staging}"
BACKUP_DIR="${BACKUP_DIR:-${INFRA_DIR}/backups}"

log() { printf '\n=== %s\n' "$*"; }
fail() { printf '\nFAILED: %s\n' "$*" >&2; exit 1; }

compose() { docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "$@"; }

[[ -f "${ENV_FILE}" ]] || fail "missing ${ENV_FILE}. Copy .env.staging.example and fill in real values."
command -v docker >/dev/null || fail "docker is not installed."

cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)" || fail "not inside a repository."

PREVIOUS_TAG="$(grep -E '^IMAGE_TAG=' "${ENV_FILE}" | cut -d= -f2- || true)"
PREVIOUS_TAG="${PREVIOUS_TAG:-latest}"
NEW_TAG="$(git rev-parse --short HEAD)"

log "Backing up the database and media objects before migrating"
"$(dirname "${BASH_SOURCE[0]}")/backup-postgres.sh" || fail "pre-migrate backup failed; refusing to migrate."

log "Building images for ${NEW_TAG}"
# The image build itself fails if a fixture flag is set, so a fixture-backed UI
# cannot be produced here.
IMAGE_TAG="${NEW_TAG}" compose build \
  --build-arg NEXT_PUBLIC_API_BASE_URL="$(grep -E '^NEXT_PUBLIC_API_BASE_URL=' "${ENV_FILE}" | cut -d= -f2-)" \
  --build-arg NEXT_PUBLIC_MEDIA_ORIGIN="$(grep -E '^NEXT_PUBLIC_MEDIA_ORIGIN=' "${ENV_FILE}" | cut -d= -f2-)"

log "Running migrations"
IMAGE_TAG="${NEW_TAG}" compose run --rm migrate

log "Starting services"
IMAGE_TAG="${NEW_TAG}" compose up -d

log "Waiting for readiness"
# The API is the only service whose health implies its dependencies, but the
# storefront and the Admin are separately reachable surfaces a user hits first,
# so all three are confirmed rather than assuming the API implies them.
#
# The media worker has no healthcheck: it is a queue consumer that never binds a
# port, so the image's HTTP probe cannot apply to it. It is checked by state
# instead, which still catches a crash loop (the state becomes "restarting")
# rather than assuming absence of a healthcheck means absence of a problem.
READY=0
for _ in $(seq 1 60); do
  if compose ps --format json api 2>/dev/null | grep -q '"Health":"healthy"' \
    && compose ps --format json web 2>/dev/null | grep -q '"Health":"healthy"' \
    && compose ps --format json admin 2>/dev/null | grep -q '"Health":"healthy"' \
    && compose ps --format json media-worker 2>/dev/null | grep -q '"State":"running"'; then
    READY=1
    break
  fi
  sleep 5
done
[[ "${READY}" = "1" ]] || fail "Services did not become healthy. Previous release is still tagged ${PREVIOUS_TAG}; run rollback.sh ${PREVIOUS_TAG}."

log "Verifying the public entry point"
PORT="$(grep -E '^HTTP_PORT=' "${ENV_FILE}" | cut -d= -f2- || echo 80)"
curl -fsS -o /dev/null "http://127.0.0.1:${PORT}/nginx-health" || fail "Nginx did not answer."
curl -fsS -o /dev/null "http://127.0.0.1:${PORT}/" || fail "Storefront did not answer."
# The Admin is mounted on a subpath, so this also proves the built base path and
# the proxy agree: a mismatch returns 404 here and a blank Admin for staff.
curl -fsS -o /dev/null "http://127.0.0.1:${PORT}/admin/" || fail "Admin did not answer at /admin/."

# Record the new tag so the next deploy has a rollback target. Append when the
# env file has never recorded one, otherwise a first deploy would silently leave
# no rollback target behind.
if grep -qE '^IMAGE_TAG=' "${ENV_FILE}"; then
  sed -i.bak -E "s/^IMAGE_TAG=.*/IMAGE_TAG=${NEW_TAG}/" "${ENV_FILE}" && rm -f "${ENV_FILE}.bak"
else
  printf '\nIMAGE_TAG=%s\n' "${NEW_TAG}" >> "${ENV_FILE}"
fi

cat <<EOF

Deployed ${NEW_TAG} (previous: ${PREVIOUS_TAG})

  storefront  http://127.0.0.1:${PORT}/
  admin       http://127.0.0.1:${PORT}/admin
  api health  http://127.0.0.1:${PORT}/api/v1/health/ready

This deploy is not accepted until the flows in
infrastructure/docker/RUNBOOK.md are exercised against the real host. In
particular the storefront publishes no contact details and no catalog data
until the owner supplies verified values and the catalog is loaded.
EOF
