#!/usr/bin/env bash
#
# Pull, migrate and roll forward a deployment.
#
# This host does not build. CI builds the images for a commit and tags them with
# that commit's SHA, and this script pulls that tag. A host that built would make
# the running artifact a function of the host's toolchain and network rather than
# of the commit, and the Server.ir host cannot build these images at all.
#
# Order is deliberate and is the reason this script exists rather than a bare
# `docker compose up`:
#   1. back up the database *and* the media objects before anything changes
#   2. pull the images built for the exact commit being deployed
#   3. run migrations explicitly, so a schema failure is reported before any new
#      container is created and the previous release keeps serving
#   4. start the application services (compose re-runs the migrate gate here,
#      which is a no-op once the migrations are applied)
#   5. wait for real readiness, not just "container started"
#   6. verify the public entry point over HTTPS against the real origin name
#
# It does not issue or renew the certificate: that is scripts/deploy/ensure-certificate.sh,
# on its own schedule, because a certificate has to keep being renewed whether or
# not anyone deploys.
#
# A failure at any step leaves the previous release running and prints how to
# roll back. Migrations are not automatically reversed: restoring the pre-migrate
# backup is the documented way to undo a schema change.

set -Eeuo pipefail

# Resolved to an absolute path before any `cd`, because `BASH_SOURCE` is
# whatever path the operator typed. deploy.sh moves to the repository root
# further down, so a relative `dirname "${BASH_SOURCE[0]}"` would be resolved
# against the wrong directory afterwards. ensure-certificate.sh already does
# this; deploy.sh did not, which broke the documented `../../scripts/deploy/deploy.sh`
# invocation with "backup-postgres.sh: No such file or directory".
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(cd "${SCRIPT_DIR}/../../infrastructure/docker" && pwd)"
COMPOSE_FILE="${INFRA_DIR}/compose.staging.yml"
ENV_FILE="${ENV_FILE:-${INFRA_DIR}/.env.staging}"
BACKUP_DIR="${BACKUP_DIR:-${INFRA_DIR}/backups}"

log() { printf '\n=== %s\n' "$*"; }
fail() { printf '\nFAILED: %s\n' "$*" >&2; exit 1; }

compose() { docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "$@"; }

[[ -f "${ENV_FILE}" ]] || fail "missing ${ENV_FILE}. Copy .env.staging.example and fill in real values."
command -v docker >/dev/null || fail "docker is not installed."

# Must be run from inside the checkout: NEW_TAG below is read from HEAD, and the
# ancestor check that follows exists so a host can never deploy an unreviewed
# commit. Reported here, with the command to run, rather than as a bare
# `fatal: not a git repository` escaping from git several lines further down.
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" \
  || fail "not inside a git checkout. Run it from the repository, for example: cd /opt/iranyaragh && ./scripts/deploy/deploy.sh"
cd "${REPO_ROOT}"

# The release is the full commit SHA, never a short SHA and never a branch name,
# because that is the only tag CI publishes and the only tag compose accepts.
NEW_TAG="$(git rev-parse HEAD)"
if [[ ! "${NEW_TAG}" =~ ^[0-9a-f]{40}$ ]]; then
  fail "HEAD is '${NEW_TAG}', which is not a full 40-character commit SHA."
fi

# Only a merged commit is deployable. Without this the script would happily pull
# and start images built from an unmerged branch commit, which is exactly the
# state a reviewed deployment is meant to exclude.
git fetch --quiet origin main
git merge-base --is-ancestor "${NEW_TAG}" origin/main \
  || fail "${NEW_TAG} is not on origin/main. Deploy only a merged commit."

# compose assembles DATABASE_URL from the POSTGRES_* credentials, so a password
# containing a character that is structural in a connection string would produce
# a URL that parses as something other than what was intended. Checked here,
# before anything is pulled, with a message that says how to fix it -- rather than
# as a Prisma P1000 much later.
PG_PASSWORD="$(grep -E '^POSTGRES_PASSWORD=' "${ENV_FILE}" | cut -d= -f2- || true)"
if [[ -z "${PG_PASSWORD}" ]]; then
  fail "POSTGRES_PASSWORD is unset in ${ENV_FILE}."
fi
if [[ "${PG_PASSWORD}" =~ [://@?#] ]]; then
  fail "POSTGRES_PASSWORD contains a character that is structural in DATABASE_URL (one of : / @ ? #). Generate a password from [A-Za-z0-9-._~] instead."
fi
PG_USER="$(grep -E '^POSTGRES_USER=' "${ENV_FILE}" | cut -d= -f2- || true)"
PG_DB="$(grep -E '^POSTGRES_DB=' "${ENV_FILE}" | cut -d= -f2- || true)"
[[ -n "${PG_USER}" ]] || fail "POSTGRES_USER is unset in ${ENV_FILE}."
[[ -n "${PG_DB}" ]] || fail "POSTGRES_DB is unset in ${ENV_FILE}."

PREVIOUS_TAG="$(grep -E '^IMAGE_TAG=' "${ENV_FILE}" | cut -d= -f2- || true)"
PREVIOUS_TAG="${PREVIOUS_TAG:-none}"

# The pre-migrate backup is what makes a schema change reversible, so it is
# mandatory once a database exists. A first deploy is the one case where there is
# nothing to protect: no container is running and no schema has been created yet,
# so a dump cannot be taken and cannot fail to be taken. Skipping it here is what
# lets a fresh host come up at all.
#
# Probed with `compose ps`, the same command that later resolves the container, so
# the check cannot disagree with what the script then operates on.
PREVIOUS_WEB_ID="$(compose ps -q web 2>/dev/null || true)"
if [[ -z "${PREVIOUS_WEB_ID}" ]]; then
  log "No running stack: first deploy, so there is no database to back up yet"
else
  log "Backing up the database and media objects before migrating"
  "${SCRIPT_DIR}/backup-postgres.sh" || fail "pre-migrate backup failed; refusing to migrate."
fi

log "Pulling images for ${NEW_TAG}"
# No `--quiet`: the pull is the only record of which digests were fetched, and a
# deployment whose provenance cannot be read back is not auditable.
IMAGE_TAG="${NEW_TAG}" compose pull || fail "could not pull the images for ${NEW_TAG}."

# The web container terminates TLS itself and reads the certificate at startup, so a
# missing one is a container that will not start. Checked here so the failure is a
# named prerequisite with a command to fix it, rather than a web container stuck in
# a restart loop after the migrations have already run.
TLS_DIR_PATH="$(grep -E '^TLS_DIR=' "${ENV_FILE}" | cut -d= -f2- || true)"
TLS_DIR_PATH="${TLS_DIR_PATH:-/srv/iranyaragh/tls}"
[[ -f "${TLS_DIR_PATH}/fullchain.pem" && -f "${TLS_DIR_PATH}/privkey.pem" ]] || fail "no TLS certificate in ${TLS_DIR_PATH}. Run scripts/deploy/ensure-certificate.sh (add --staging first to test against the Let's Encrypt staging CA)."

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
HTTPS_PORT_PATH="$(grep -E '^HTTPS_PORT=' "${ENV_FILE}" | cut -d= -f2- || echo 443)"
# Probed against the real public origin rather than 127.0.0.1, because the
# certificate is issued for that name and probing the loopback address would
# only prove that a TLS connection can be opened, not that the certificate the
# public sees is valid for it. `--resolve` sends the request to the local port
# while keeping the Host header and SNI the way a browser would send them.
PUBLIC_ORIGIN="$(grep -E '^STOREFRONT_ORIGIN=' "${ENV_FILE}" | cut -d= -f2- || true)"
# Rejected here rather than parsed. Stripping a scheme prefix that is not there
# silently yields a nonsense hostname ("http://1.2.3.4" becomes "http"), and the
# resulting failure would be about a name nobody configured. The API refuses a
# non-https origin in staging/production for the same reason.
[[ "${PUBLIC_ORIGIN}" == https://* ]] \
  || fail "STOREFRONT_ORIGIN is '${PUBLIC_ORIGIN:-unset}' in ${ENV_FILE}; it must be an https URL, because the public origin is the name the TLS certificate is verified against."
PUBLIC_HOST="${PUBLIC_ORIGIN#https://}"
PUBLIC_HOST="${PUBLIC_HOST%%/*}"
# A port in the origin is not used: HTTPS_PORT from the env file is the port the
# proxy is published on, and the certificate is issued for the host part alone.
PUBLIC_HOST="${PUBLIC_HOST%%:*}"
resolve=(--resolve "${PUBLIC_HOST}:${HTTPS_PORT_PATH}:127.0.0.1")

curl -fsS -o /dev/null "${resolve[@]}" "https://${PUBLIC_HOST}:${HTTPS_PORT_PATH}/nginx-health" \
  || fail "Nginx did not answer over HTTPS at https://${PUBLIC_HOST}:${HTTPS_PORT_PATH}/."
curl -fsS -o /dev/null "${resolve[@]}" "https://${PUBLIC_HOST}:${HTTPS_PORT_PATH}/" \
  || fail "Storefront did not answer over HTTPS."
# The Admin is mounted on a subpath, so this also proves the built base path and
# the proxy agree: a mismatch returns 404 here and a blank Admin for staff.
curl -fsS -o /dev/null "${resolve[@]}" "https://${PUBLIC_HOST}:${HTTPS_PORT_PATH}/admin/" \
  || fail "Admin did not answer at /admin/ over HTTPS."
# Plain HTTP has to redirect rather than serve, since every origin the API accepts
# is https. `-L` is deliberately absent: this asserts the redirect itself, so a
# 200 here means something is serving content on the wrong scheme.
REDIRECT_TARGET="$(curl -fsS -o /dev/null -w '%{redirect_url}' "http://127.0.0.1:${PORT}/" || true)"
[[ "${REDIRECT_TARGET}" == https://* ]] \
  || fail "port ${PORT} did not redirect to HTTPS (got '${REDIRECT_TARGET:-no redirect}')."

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

  storefront  ${PUBLIC_ORIGIN}/
  admin       ${PUBLIC_ORIGIN}/admin
  api health  ${PUBLIC_ORIGIN}/api/v1/health/ready

  certificate: check its expiry with
    openssl x509 -in ${TLS_DIR_PATH}/fullchain.pem -noout -dates
  It is a Let's Encrypt IP address certificate and lasts about six days, so
  renewal is automatic but a lapsed one takes the site down with it. Confirm
  the timer is armed: systemctl status iranyaragh-certbot-renew.timer

This deploy is not accepted until the flows in
infrastructure/docker/RUNBOOK.md are exercised against the real host. In
particular the storefront publishes no contact details and no catalog data
until the owner supplies verified values and the catalog is loaded.
EOF
