#!/usr/bin/env bash
# Preserve a bounded, privacy-filtered operational snapshot before container replacement.
set -Eeuo pipefail
umask 077
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(cd "${SCRIPT_DIR}/../../infrastructure/docker" && pwd)"
ENV_FILE="${ENV_FILE:-${INFRA_DIR}/.env.staging}"
ARCHIVE_DIR="${DIAGNOSTIC_ARCHIVE_DIR:-/var/log/iranyaragh/diagnostics}"
[[ -f "$ENV_FILE" ]] || { echo 'missing deployment environment file' >&2; exit 1; }
mkdir -p "$ARCHIVE_DIR"
chmod 0700 "$ARCHIVE_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)-$$"
PARTIAL="$ARCHIVE_DIR/.diagnostics-$STAMP.partial"
TARGET="$ARCHIVE_DIR/diagnostics-$STAMP.jsonl.gz"
trap 'rm -f "$PARTIAL"' EXIT
# Finite input (2,000 lines/service from 24h); the filter additionally caps output
# to 10,000 bounded metadata records. No raw dependency text/request body survives.
docker compose --env-file "$ENV_FILE" -f "$INFRA_DIR/compose.staging.yml" logs --no-color --no-log-prefix --since 24h --tail 2000 \
  | python3 "$SCRIPT_DIR/diagnostic-log-filter.py" --archive-safe | gzip -c > "$PARTIAL"
gzip -t "$PARTIAL"
mv "$PARTIAL" "$TARGET"
python3 - "$ARCHIVE_DIR" <<'PY'
import pathlib,sys,time
paths=sorted(pathlib.Path(sys.argv[1]).glob('diagnostics-*.jsonl.gz'),key=lambda p:p.stat().st_mtime,reverse=True)
for index,path in enumerate(paths):
    if index >= 30 or time.time()-path.stat().st_mtime > 14*86400:
        path.unlink()
PY
printf 'Privacy-filtered diagnostic archive captured.\n'
