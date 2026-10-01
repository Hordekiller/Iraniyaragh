#!/usr/bin/env bash
#
# Roll back to a previously deployed image tag.
#
#   ./rollback.sh <image-tag>
#
# This rolls back the application images only. It deliberately does NOT run any
# migration: `prisma migrate deploy` only ever moves a schema forward, so
# running it from the old release's migration set cannot undo the new release's
# migrations, and would apply whatever else the old set considers pending. If
# the failed deploy changed the schema, restoring the pre-migrate backup is the
# only correct way back -- deploy.sh writes that backup before every migration.
#
# The target tag is recorded in deploy.sh's output, and the previous value stays
# in the env file until the next successful deploy overwrites it.

set -Eeuo pipefail

INFRA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../infrastructure/docker" && pwd)"
ENV_FILE="${ENV_FILE:-${INFRA_DIR}/.env.staging}"
COMPOSE_FILE="${INFRA_DIR}/compose.staging.yml"

TARGET="${1:-}"
[[ -n "${TARGET}" ]] || { echo "usage: $0 <image-tag>" >&2; exit 1; }
[[ -f "${ENV_FILE}" ]] || { echo "missing ${ENV_FILE}" >&2; exit 1; }

compose() { IMAGE_TAG="${TARGET}" docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "$@"; }

echo "Rolling back to image tag ${TARGET}"

# `up` would start the migrate service, which is correct on a normal deploy but
# wrong here: this schema is whatever the failed deploy left behind, and the old
# release's migration set must not be applied to it. Skip the service explicitly
# so only the application tier is replaced.
compose up -d --no-deps api media-worker admin web

READY=0
for _ in $(seq 1 60); do
  if compose ps --format json api 2>/dev/null | grep -q '"Health":"healthy"'; then
    READY=1
    break
  fi
  sleep 5
done
[[ "${READY}" = "1" ]] || { echo "FAILED: API not healthy after rollback" >&2; exit 1; }

sed -i.bak -E "s/^IMAGE_TAG=.*/IMAGE_TAG=${TARGET}/" "${ENV_FILE}" && rm -f "${ENV_FILE}.bak"

echo "Rolled back to ${TARGET} (schema unchanged)."
echo "If the failed deploy migrated the schema, this is not enough -- restore the"
echo "pre-migrate backup so the code and schema match again:"
echo "  ./restore-postgres.sh ${BACKUP_DIR:-${INFRA_DIR}/backups}/<dump> --confirm"
