#!/usr/bin/env bash
#
# Back up everything a deploy can lose: the database and the product-media
# objects.
#
# Both halves matter and neither is sufficient alone. The database holds the
# media rows and the catalogue, but restoring it without the objects would point
# published products at images that no longer exist, and restoring objects
# without the database would attach them to nothing.
#
# Called automatically by deploy.sh before migrations run, so a schema change can
# always be undone. A backup that has never been restored is not a backup, so
# the verification steps in RUNBOOK.md restore one before the first production
# deploy is trusted.
#
# The object half runs inside the API image because that is the only image that
# carries the S3 client; there is no S3 CLI on the host.

set -Eeuo pipefail

INFRA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../infrastructure/docker" && pwd)"
ENV_FILE="${ENV_FILE:-${INFRA_DIR}/.env.staging}"
BACKUP_DIR="${BACKUP_DIR:-${INFRA_DIR}/backups}"
COMPOSE_FILE="${INFRA_DIR}/compose.staging.yml"
PGHOST="${PGHOST:-postgres}"
PGUSER="${PGUSER:-$(grep -E '^POSTGRES_USER=' "${ENV_FILE}" | cut -d= -f2-)}"
PGDATABASE="${PGDATABASE:-$(grep -E '^POSTGRES_DB=' "${ENV_FILE}" | cut -d= -f2-)}"

[[ -f "${ENV_FILE}" ]] || { echo "missing ${ENV_FILE}" >&2; exit 1; }

mkdir -p "${BACKUP_DIR}"
# Restrict before writing anything: both halves contain customer and staff data.
umask 077

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP="${BACKUP_DIR}/iranyaragh-${STAMP}.dump"
OBJECTS="${BACKUP_DIR}/iranyaragh-objects-${STAMP}"

compose() {
  docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "$@"
}

echo "Dumping ${PGDATABASE} to ${DUMP}"
# The user must be passed explicitly. `pg_dump` otherwise falls back to the OS
# user of the host shell, which is not the database role: on a VPS that runs the
# deploy as root, libpq tries to connect as "root" and PostgreSQL answers
# `FATAL: role "root" does not exist`. The env file's POSTGRES_USER is the role
# that actually owns the schema, so use it and -d for the database as well.
# --clean/--if-exists makes the dump restorable onto a non-empty database, and
# --no-owner avoids failing when the restoring role owns different objects.
compose exec -T postgres \
  pg_dump --username="${PGUSER}" --dbname="${PGDATABASE}" \
  --clean --if-exists --no-owner --format=custom > "${DUMP}"

if [[ ! -s "${DUMP}" ]]; then
  echo "dump is empty; refusing to record a backup" >&2
  rm -f "${DUMP}"
  exit 1
fi

echo "Backing up product media objects to ${OBJECTS}"
# The container writes into the bind mount, so the host owns the resulting
# files and the umask above still applies to the directory created here.
mkdir -p "${OBJECTS}"
# `--no-deps` is deliberate: the backup must not depend on the API image being
# up, and a first deploy runs this before anything is started. The object store
# is the one dependency it genuinely has, so it is started and awaited here
# instead of being assumed. Without that, a first deploy has no store yet and
# the S3 client fails to connect, which previously meant no backup was taken
# before the very first migration ran.
compose up -d object-store
for _ in $(seq 1 30); do
  if compose ps --format json object-store 2>/dev/null | grep -q '"Health":"healthy"'; then
    break
  fi
  sleep 2
done
compose ps --format json object-store 2>/dev/null | grep -q '"Health":"healthy"' \
  || { echo "object store did not become healthy; refusing to record a backup without its objects" >&2; rm -rf "${OBJECTS}" "${DUMP}"; exit 1; }
compose run --rm --no-deps -v "${OBJECTS}:/backup" api \
  node scripts/backup-objects.mjs

if [[ ! -s "${OBJECTS}/manifest.json" ]]; then
  # An empty store is legitimate on a first deploy, but a missing manifest means
  # the backup script did not actually finish, so it must not be recorded.
  echo "object backup produced no manifest; refusing to record a backup" >&2
  rm -rf "${OBJECTS}" "${DUMP}"
  exit 1
fi

# Keep a bounded history rather than growing without limit on the host.
prune() {
  find "${BACKUP_DIR}" -name 'iranyaragh-*.dump' -type f -mtime "+${BACKUP_RETENTION_DAYS:-14}" -print -delete
  find "${BACKUP_DIR}" -maxdepth 1 -type d -name 'iranyaragh-objects-*' -mtime "+${BACKUP_RETENTION_DAYS:-14}" -print -exec rm -rf {} +
}
prune

# Checksums make a truncated or corrupted dump detectable before a restore. The
# object backup carries its own per-object checksums in its manifest.
( cd "${BACKUP_DIR}" && sha256sum "$(basename "${DUMP}")" > "$(basename "${DUMP}").sha256" )

echo "Backup written: ${DUMP}"
echo "Objects written: ${OBJECTS}"
