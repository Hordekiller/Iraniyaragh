#!/usr/bin/env bash
#
# Tail the logs of every deployed service.
#
#   ./logs.sh            # follow all services
#   ./logs.sh api        # follow one service
#   ./logs.sh -n 200 api # last 200 lines, no follow
#
# Also the first place to look when a deploy looks healthy but the storefront
# misbehaves: the API's structured log carries the request id, and the media
# worker's log explains why a product image never became READY.

set -Eeuo pipefail

INFRA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../infrastructure/docker" && pwd)"
ENV_FILE="${ENV_FILE:-${INFRA_DIR}/.env.staging}"
COMPOSE_FILE="${INFRA_DIR}/compose.staging.yml"

[[ -f "${ENV_FILE}" ]] || { echo "missing ${ENV_FILE}" >&2; exit 1; }

docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" logs --tail=200 --follow "$@"
