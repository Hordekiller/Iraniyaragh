#!/usr/bin/env bash
# Check the actual origin certificate, bypassing CDN TLS termination.
set -Eeuo pipefail

HOST="${1:?usage: check-origin-tls.sh <hostname> <origin-ip> [minimum-valid-seconds]}"
ORIGIN_IP="${2:?usage: check-origin-tls.sh <hostname> <origin-ip> [minimum-valid-seconds]}"
MIN_VALID_SECONDS="${3:-172800}"
[[ "${MIN_VALID_SECONDS}" =~ ^[0-9]+$ ]] || { echo 'minimum-valid-seconds must be an integer' >&2; exit 2; }

# curl verifies the chain and hostname, follows no redirects, and tests the
# public host against the origin's IP rather than Cloudflare's edge address.
curl --fail --silent --show-error --max-time 15 --resolve "${HOST}:443:${ORIGIN_IP}" \
  --output /dev/null "https://${HOST}/"

# A currently valid certificate is still an incident if it will expire before
# the next operator can react. Two days exceeds the twice-daily renewal cycle.
timeout 15s openssl s_client -connect "${ORIGIN_IP}:443" -servername "${HOST}" </dev/null 2>/dev/null \
  | openssl x509 -noout -checkend "${MIN_VALID_SECONDS}" \
  || { echo "origin certificate expires within ${MIN_VALID_SECONDS}s or cannot be read" >&2; exit 1; }

echo "origin TLS verified for ${HOST} via ${ORIGIN_IP}; more than ${MIN_VALID_SECONDS}s remain"
