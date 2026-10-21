#!/usr/bin/env bash
#
# Read-only signature-freshness gate for the deployed ClamD service (#393).
#
#   ./check-clamav-freshness.sh            # fail if signatures are older than the default
#   ./check-clamav-freshness.sh 7          # fail if older than 7 days
#
# ClamD can be perfectly healthy while FreshClam is dead and the loaded
# signatures have gone stale. Process health therefore proves nothing about
# signature maintenance. This script reads the loaded database's own version and
# build date from inside the running container and refuses to pass when it is
# older than MAX_AGE_DAYS.
#
# It only reads. It never downloads, reloads, restarts, clears a cooldown or
# writes a signature file, so it is safe to run against a live deployment and to
# schedule as a periodic supervision check. The exit code is the signal: a
# non-zero result means signature maintenance is not (or no longer) working.
#
# Diagnostics intentionally print only the engine version, the signature build
# date and the day count. Never add credentials, signed URLs, object keys or
# file content here.

set -Eeuo pipefail

INFRA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../infrastructure/docker" && pwd)"
ENV_FILE="${ENV_FILE:-${INFRA_DIR}/.env.staging}"
COMPOSE_FILE="${INFRA_DIR}/compose.staging.yml"
SERVICE="${CLAMAV_SERVICE:-malware-scanner}"
DEFAULT_MAX_AGE_DAYS=7

MAX_AGE_DAYS="${1:-${CLAMAV_MAX_AGE_DAYS:-${DEFAULT_MAX_AGE_DAYS}}}"
[[ "${MAX_AGE_DAYS}" =~ ^[0-9]+$ ]] || { echo "max age must be a whole number of days" >&2; exit 2; }

[[ -f "${ENV_FILE}" ]] || { echo "missing ${ENV_FILE}" >&2; exit 2; }

compose() {
  docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "$@"
}

# `sigtool --info` prints a human-readable block per database file; the `daily`
# database carries `Version:` and `Build time:`. Read it from inside the running
# service so the check reflects what ClamD actually loaded, not the image tag.
INFO="$(compose exec -T "${SERVICE}" sh -c 'sigtool --info /var/lib/clamav/daily.cvd 2>/dev/null || sigtool --info /var/lib/clamav/daily.cld 2>/dev/null' 2>/dev/null || true)"
[[ -n "${INFO}" ]] || { echo "could not read ClamAV signature info from ${SERVICE}" >&2; exit 2; }

BUILD_TIME="$(printf '%s\n' "${INFO}" | sed -n 's/^Build time: //p' | head -n1)"
VERSION="$(printf '%s\n' "${INFO}" | sed -n 's/^Version: //p' | head -n1)"
[[ -n "${BUILD_TIME}" ]] || { echo "signature build time not found in ClamAV info" >&2; exit 2; }

if ! BUILD_EPOCH="$(date -u -d "${BUILD_TIME}" +%s 2>/dev/null)"; then
  echo "could not parse signature build time: ${BUILD_TIME}" >&2
  exit 2
fi

NOW_EPOCH="$(date -u +%s)"
# Deterministic override for automated tests and for re-checking a captured
# report at a known time. Unset in normal use; the real clock is the default.
if [[ -n "${CLAMAV_NOW_EPOCH:-}" ]]; then
  [[ "${CLAMAV_NOW_EPOCH}" =~ ^[0-9]+$ ]] || { echo "CLAMAV_NOW_EPOCH must be epoch seconds" >&2; exit 2; }
  NOW_EPOCH="${CLAMAV_NOW_EPOCH}"
fi
AGE_DAYS=$(( (NOW_EPOCH - BUILD_EPOCH) / 86400 ))

echo "ClamAV signatures: version ${VERSION:-unknown}, built ${BUILD_TIME}, age ${AGE_DAYS}d (limit ${MAX_AGE_DAYS}d)."

if (( AGE_DAYS > MAX_AGE_DAYS )); then
  echo "::error::ClamAV signatures are stale: ${AGE_DAYS} days old (limit ${MAX_AGE_DAYS}). Signature maintenance is not working; check FreshClam and the configured mirror (#393)." >&2
  exit 1
fi

echo "ClamAV signature freshness OK."
