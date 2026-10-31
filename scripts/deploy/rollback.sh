#!/usr/bin/env bash
#
# Roll back to a previously deployed image tag.
#
#   ./rollback.sh <full-commit-sha>
#
# The images are pulled, not built: the rollback target is a commit whose images
# CI already published, so the host needs the same artefacts it would have run
# originally rather than a local rebuild.
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
# Roll back the target topology as well as its images. The pre-renderer web
# image serves static files and has no storefront image: using today's Compose
# would try to pull a nonexistent image for that old SHA and prevent rollback.
COMPOSE_FILE="$(mktemp "${INFRA_DIR}/.compose.rollback.XXXXXX.yml")"
trap 'rm -f "${COMPOSE_FILE}"' EXIT

TARGET="${1:-}"
[[ -n "${TARGET}" ]] || { echo "usage: $0 <full-commit-sha>" >&2; exit 1; }
[[ -f "${ENV_FILE}" ]] || { echo "missing ${ENV_FILE}" >&2; exit 1; }

# Accept only a full commit SHA, the only tag CI publishes. This keeps a rollback
# from silently resolving to `latest` or to whatever a branch name points at.
if [[ ! "${TARGET}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "${TARGET} is not a full 40-character commit SHA." >&2
  echo "Look in the env file for the IMAGE_TAG recorded by the last deploy." >&2
  exit 1
fi

git -C "${INFRA_DIR}/../.." show "${TARGET}:infrastructure/docker/compose.staging.yml" > "${COMPOSE_FILE}" \
  || { echo "could not read Compose topology for ${TARGET}; fetch the release commit first" >&2; exit 1; }

compose() { IMAGE_TAG="${TARGET}" docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "$@"; }

AVAILABLE_SERVICES="$(compose config --services)" \
  || { echo "target release Compose configuration is invalid" >&2; exit 1; }
APPLICATION_SERVICES=()
HEALTHY_SERVICES=()
for service in api media-worker pdf-render-worker admin storefront web; do
  if grep -qx "${service}" <<< "${AVAILABLE_SERVICES}"; then
    APPLICATION_SERVICES+=("${service}")
    case "${service}" in api|admin|storefront|web) HEALTHY_SERVICES+=("${service}");; esac
  fi
done
[[ " ${APPLICATION_SERVICES[*]} " == *" api "* && " ${APPLICATION_SERVICES[*]} " == *" web "* ]] \
  || { echo "target release lacks the required API/web services" >&2; exit 1; }

"${INFRA_DIR}/../../scripts/deploy/archive-diagnostics.sh" || { echo "diagnostic archive failed; previous release is unchanged" >&2; exit 1; }

echo "Rolling back to ${TARGET}"
compose pull || { echo "could not pull the images for ${TARGET}" >&2; exit 1; }

# `up` would start the migrate service, which is correct on a normal deploy but
# wrong here: this schema is whatever the failed deploy left behind, and the old
# release's migration set must not be applied to it. Skip the service explicitly
# so only the application tier is replaced.
# Remove the renderer as an orphan when returning to a pre-renderer release.
# Named volumes are retained; no schema or data service is recreated here.
compose up -d --no-deps --remove-orphans "${APPLICATION_SERVICES[@]}"

READY=0
for _ in $(seq 1 60); do
  ALL_HEALTHY=1
  for service in "${HEALTHY_SERVICES[@]}"; do
    compose ps --format json "${service}" 2>/dev/null | grep -q '"Health":"healthy"' || ALL_HEALTHY=0
  done
  for service in media-worker pdf-render-worker; do
    if [[ " ${APPLICATION_SERVICES[*]} " == *" ${service} "* ]]; then
      compose ps --format json "${service}" 2>/dev/null | grep -q '"State":"running"' || ALL_HEALTHY=0
    fi
  done
  if [[ "${ALL_HEALTHY}" = 1 ]]; then
    READY=1
    break
  fi
  sleep 5
done
[[ "${READY}" = "1" ]] || { echo "FAILED: application services not healthy after rollback" >&2; exit 1; }

sed -i.bak -E "s/^IMAGE_TAG=.*/IMAGE_TAG=${TARGET}/" "${ENV_FILE}" && rm -f "${ENV_FILE}.bak"

echo "Rolled back to ${TARGET} (schema unchanged)."
echo "If the failed deploy migrated the schema, this is not enough -- restore the"
echo "pre-migrate backup so the code and schema match again:"
echo "  ./restore-postgres.sh ${BACKUP_DIR:-${INFRA_DIR}/backups}/<dump> --confirm"
