#!/usr/bin/env bash
# Structured cross-service diagnostics; host/operator access only.
# ./logs.sh --request-id <support-code> --since 2h -n 1000
# ./logs.sh --level error --since 30m api media-worker
# ./logs.sh --follow --event http.request.completed api
set -Eeuo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(cd "${SCRIPT_DIR}/../../infrastructure/docker" && pwd)"
ENV_FILE="${ENV_FILE:-${INFRA_DIR}/.env.staging}"
COMPOSE_FILE="${INFRA_DIR}/compose.staging.yml"
TAIL=200
SINCE=1h
FOLLOW=1
FILTERS=()
SERVICES=()
while (($#)); do
  case "$1" in
    -h|--help) sed -n '2,5p' "${BASH_SOURCE[0]}"; exit 0 ;;
    -n|--tail) [[ $# -ge 2 && "$2" =~ ^[0-9]{1,5}$ && "$2" -ge 1 && "$2" -le 10000 ]] || { echo 'tail must be 1..10000' >&2; exit 2; }; TAIL="$2"; FOLLOW=0; shift 2 ;;
    --since) [[ $# -ge 2 && "$2" =~ ^[0-9]{1,4}(s|m|h)$ ]] || { echo 'since must be a duration, e.g. 30m or 2h' >&2; exit 2; }; SINCE="$2"; shift 2 ;;
    --request-id|--event|--level) [[ $# -ge 2 && "$2" =~ ^[A-Za-z0-9._:-]{1,128}$ ]] || { echo 'invalid diagnostic filter' >&2; exit 2; }; FILTERS+=("$1" "$2"); shift 2 ;;
    -f|--follow) FOLLOW=1; shift ;;
    --no-follow) FOLLOW=0; shift ;;
    -*) echo 'unknown option; use --help' >&2; exit 2 ;;
    *) [[ "$1" =~ ^[a-z][a-z0-9-]{0,40}$ ]] || exit 2; SERVICES+=("$1"); shift ;;
  esac
done
[[ -f "$ENV_FILE" ]] || { echo 'missing deployment environment file' >&2; exit 1; }
command -v python3 >/dev/null || { echo 'python3 is required' >&2; exit 1; }
OPTIONS=(--no-color --no-log-prefix --tail "$TAIL" --since "$SINCE")
if [[ "$FOLLOW" == 1 ]]; then OPTIONS+=(--follow); fi
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" logs "${OPTIONS[@]}" "${SERVICES[@]}" | python3 "$SCRIPT_DIR/diagnostic-log-filter.py" "${FILTERS[@]}"
