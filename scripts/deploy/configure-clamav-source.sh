#!/bin/sh
# Configure only the ephemeral container config; never update signature data.
# Called before the pinned image's original /init, which remains responsible for
# FreshClam/ClamD startup, CVD verification and TLS certificate verification.
set -eu

invalid() { printf '%s\n' "$1" >&2; exit 2; }
valid_host() {
  [ "${#1}" -le 253 ] || return 1
  case "$1" in ''|*[!A-Za-z0-9.-]*|.*|*.|*..*) return 1 ;; esac
  saved_ifs=$IFS
  IFS=.
  set -f
  for label in $1; do
    case "$label" in -*|*-) IFS=$saved_ifs; return 1 ;; esac
    [ "${#label}" -le 63 ] || { IFS=$saved_ifs; return 1; }
  done
  IFS=$saved_ifs
}

[ "$#" -eq 1 ] || invalid 'A FreshClam configuration path is required.'
config=$1
[ -f "$config" ] || invalid 'FreshClam configuration is unavailable.'
mirror=${FRESHCLAM_DATABASE_MIRROR:-database.clamav.net}
proxy=${FRESHCLAM_PROXY_HOST:-}
port=${FRESHCLAM_PROXY_PORT:-}
valid_host "$mirror" || invalid 'Invalid mirror host; use an approved hostname without credentials, scheme or path.'
if [ -n "$proxy" ]; then
  valid_host "$proxy" || invalid 'Invalid proxy host; credentials, schemes and paths are not accepted.'
  port=${port:-3128}
  case "$port" in *[!0-9]*|'') invalid 'Invalid proxy port.' ;; esac
  [ "${#port}" -le 5 ] || invalid 'Invalid proxy port.'
  port=$(printf '%s' "$port" | sed 's/^0*//')
  [ -n "$port" ] && [ "$port" -ge 1 ] && [ "$port" -le 65535 ] || invalid 'Invalid proxy port.'
else
  [ -z "$port" ] || invalid 'A proxy port requires an approved proxy host.'
fi
if [ -n "${FRESHCLAM_CONF_DatabaseMirror:-}${FRESHCLAM_CONF_PrivateMirror:-}${FRESHCLAM_CONF_HTTPProxyServer:-}${FRESHCLAM_CONF_HTTPProxyPort:-}${FRESHCLAM_CONF_HTTPProxyUsername:-}${FRESHCLAM_CONF_HTTPProxyPassword:-}" ]; then
  invalid 'Conflicting upstream source options; use the controlled mirror/proxy settings.'
fi

# /init appends environment options when a directive is already active. Render a
# single selected source here, so the blocked default cannot remain first in line.
temporary=$(mktemp "${config}.source.XXXXXX")
trap 'rm -f "$temporary"' 0
trap 'exit 1' 1 2 15
cp -p "$config" "$temporary"
sed -E '/^[[:space:]]*#?[[:space:]]*(DatabaseMirror|PrivateMirror|HTTPProxyServer|HTTPProxyPort)[[:space:]]/d' "$config" > "$temporary"
printf '\nDatabaseMirror https://%s\n' "$mirror" >> "$temporary"
if [ -n "$proxy" ]; then
  printf 'HTTPProxyServer %s\nHTTPProxyPort %s\n' "$proxy" "$port" >> "$temporary"
fi
mv "$temporary" "$config"
