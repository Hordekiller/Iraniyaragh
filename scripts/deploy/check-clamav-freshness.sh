#!/usr/bin/env bash
#
# Read-only signature-freshness gate for the deployed ClamD service (#393).
#
#   ./check-clamav-freshness.sh            # fail if signatures are older than the default
#   ./check-clamav-freshness.sh 7          # fail if older than 7 days
#
# ClamD can be perfectly healthy while FreshClam is dead and the loaded
# signatures have gone stale. Process health therefore proves nothing about
# signature maintenance. This script reads the daemon's own version response
# from inside its container and refuses to pass when its loaded daily database is
# older than MAX_AGE_DAYS.
#
# It only reads. It never downloads, reloads, restarts, clears a cooldown or
# writes a signature file, so it is safe to run against a live deployment and to
# schedule as a periodic supervision check. The exit code is the signal: a
# non-zero result means signature maintenance is not (or no longer) working.
#
# Diagnostics intentionally print only the engine version, the signature build
# date and bounded numeric age. Never add credentials, signed URLs, object keys or
# file content here.

set -Eeuo pipefail
export LC_ALL=C

unknown() { printf '%s\n' "$1" >&2; exit 2; }
[[ $# -le 1 ]] || unknown 'usage: check-clamav-freshness.sh [max-age-days]'
MAX_AGE_RAW="${1-${CLAMAV_MAX_AGE_DAYS-7}}"
[[ "${MAX_AGE_RAW}" =~ ^[0-9]{1,6}$ ]] || unknown 'max age must be a whole number of days (0..999999)'
# Explicit base ten prevents leading-zero limits from becoming Bash octal input.
MAX_AGE_DAYS=$((10#${MAX_AGE_RAW}))
# Override only for deterministic tests or replaying a captured report; live
# monitoring must use the real clock (the default).
NOW_EPOCH="${CLAMAV_NOW_EPOCH-$(date -u +%s)}"
[[ "${NOW_EPOCH}" =~ ^[0-9]{1,12}$ ]] || unknown 'CLAMAV_NOW_EPOCH must be bounded epoch seconds'
NOW_EPOCH=$((10#${NOW_EPOCH}))

INFRA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../infrastructure/docker" && pwd)"
ENV_FILE="${ENV_FILE:-${INFRA_DIR}/.env.staging}"
COMPOSE_FILE="${INFRA_DIR}/compose.staging.yml"
SERVICE="${CLAMAV_SERVICE:-malware-scanner}"
[[ -f "${ENV_FILE}" ]] || unknown 'deployment environment file is unavailable'
command -v timeout >/dev/null || unknown 'GNU timeout is required for a bounded daemon probe'

# clamdscan --version asks the running daemon for VERSION. Its engine-only
# fallback can exit zero when the daemon is unavailable; reject that response.
# Unlike sigtool, this cannot mistake a fresh on-disk file for a completed reload.
if ! INFO="$(timeout --kill-after=2s 15s docker compose --env-file "${ENV_FILE}" \
  -f "${COMPOSE_FILE}" exec -T "${SERVICE}" clamdscan --version 2>/dev/null)"; then
  unknown 'could not read ClamAV signature info from daemon'
fi
[[ "${INFO}" != *$'\n'* && "${INFO}" =~ ^ClamAV[[:space:]]([[:alnum:].+_-]{1,64})/([0-9]{1,10})/([^/]{1,96})$ ]] \
  || unknown 'could not read ClamAV signature info from daemon'
ENGINE="${BASH_REMATCH[1]}"
VERSION="${BASH_REMATCH[2]}"
BUILD_TIME="${BASH_REMATCH[3]}"
if ! BUILD_EPOCH="$(date -u -d "${BUILD_TIME}" +%s 2>/dev/null)"; then
  unknown 'could not parse loaded signature build time'
fi
[[ "${BUILD_EPOCH}" =~ ^[0-9]{1,12}$ ]] || unknown 'invalid loaded signature epoch'
(( BUILD_EPOCH <= NOW_EPOCH )) || unknown 'loaded signature timestamp is in the future; check clock synchronization'
AGE_SECONDS=$((NOW_EPOCH - BUILD_EPOCH))
LIMIT_SECONDS=$((MAX_AGE_DAYS * 86400))

printf 'ClamAV loaded signatures: engine %s, version %s, built %s UTC, age %ss (limit %sd).\n' \
  "${ENGINE}" "${VERSION}" "${BUILD_TIME}" "${AGE_SECONDS}" "${MAX_AGE_DAYS}"
if (( AGE_SECONDS > LIMIT_SECONDS )); then
  printf '::error::ClamAV signatures are stale; check FreshClam and the approved update route (#393).\n' >&2
  exit 1
fi
printf 'ClamAV signature freshness OK.\n'
