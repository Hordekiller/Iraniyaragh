#!/usr/bin/env bash
#
# Restore a database dump and, when a matching object backup is present, the
# product-media objects it references.
#
# This DESTRUCTIVELY replaces the contents of the target database and bucket. It
# stops the application tier first so nothing writes while the restore runs, and
# it refuses to run without an explicit confirmation flag.
#
#   ./restore-postgres.sh infrastructure/docker/backups/iranyaragh-<stamp>.dump --confirm
#
# The object backup is optional: if a directory
# `iranyaragh-objects-<stamp>` sits next to the dump (same <stamp>), its objects
# are restored too, so the catalogue is not left pointing at missing images. If
# it is absent, only the database is restored and the script says so.

set -Eeuo pipefail

INFRA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../infrastructure/docker" && pwd)"
ENV_FILE="${ENV_FILE:-${INFRA_DIR}/.env.staging}"
COMPOSE_FILE="${INFRA_DIR}/compose.staging.yml"
PGUSER="${PGUSER:-$(grep -E '^POSTGRES_USER=' "${ENV_FILE}" | cut -d= -f2-)}"
PGDATABASE="${PGDATABASE:-$(grep -E '^POSTGRES_DB=' "${ENV_FILE}" | cut -d= -f2-)}"

DUMP="${1:-}"
CONFIRM="${2:-}"

if [[ -z "${DUMP}" ]]; then
  echo "usage: $0 <dump-file> --confirm" >&2
  exit 1
fi
[[ -f "${DUMP}" ]] || { echo "no such dump: ${DUMP}" >&2; exit 1; }
[[ "${CONFIRM}" == "--confirm" ]] || {
  echo "refusing to overwrite the database without --confirm" >&2
  exit 1
}

compose() { docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "$@"; }

# Derive the paired objects directory from the dump's own <stamp>. The dump is
# named iranyaragh-<stamp>.dump and the objects dir iranyaragh-objects-<stamp>.
DUMP_DIR="$(cd "$(dirname "${DUMP}")" && pwd)"
DUMP_BASE="$(basename "${DUMP}")"
STAMP="${DUMP_BASE#iranyaragh-}"
STAMP="${STAMP%.dump}"
OBJECTS="${DUMP_DIR}/iranyaragh-objects-${STAMP}"

# A restore is only trustworthy if the dump is intact, so verify the checksum the
# backup wrote before touching the database.
if [[ -f "${DUMP}.sha256" ]]; then
  echo "Verifying dump checksum"
  ( cd "${DUMP_DIR}" && sha256sum --check "$(basename "${DUMP}").sha256" )
else
  echo "warning: no .sha256 alongside the dump; skipping integrity check" >&2
fi

echo "Stopping the application tier"
compose stop api media-worker admin web || true

echo "Restoring into the database"
# --clean/--if-exists in the dump drops existing objects, so the restore lands
# on a known-empty schema rather than merging with whatever is there now.
# Pass the role explicitly: pg_restore otherwise defaults to the OS user of the
# host shell, which on a VPS is root and does not exist as a database role.
compose exec -T postgres pg_restore --username="${PGUSER}" --dbname="${PGDATABASE}" \
  --clean --if-exists --no-owner < "${DUMP}"

if [[ -s "${OBJECTS}/manifest.json" ]]; then
  echo "Restoring product media objects from ${OBJECTS}"
  compose run --rm --no-deps -v "${OBJECTS}:/backup" api \
    node scripts/restore-objects.mjs
else
  echo "warning: no object backup at ${OBJECTS}; database restored without its media." >&2
  echo "         published products will 404 on their images until objects are restored." >&2
fi

# Deliberately do NOT bring the application tier back up here. The point of a
# restore is to put the database back to a pre-migration schema, and `compose up`
# would start the `migrate` gate on the way, re-applying the new release's
# migrations and undoing the restore. So the platform is left stopped and the
# operator chooses which release runs against the restored schema.

echo "Restored ${DUMP}."
echo
echo "The schema is now the pre-migration one and the application tier is still"
echo "stopped. Start the release that matches that schema, not the newest image:"
echo "  ./rollback.sh <previous-image-tag>"
echo
echo "Nothing else should be started until that is done: a plain 'compose up'"
echo "would re-run the newer migrations against the restored schema."
