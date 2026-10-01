#!/usr/bin/env bash
#
# Obtain and renew the Let's Encrypt IP address certificate.
#
# Why IP certificates and why they are short-lived: this deployment has no domain
# name yet, it is reached at a bare public IP. Let's Encrypt issues certificates
# for IP address identifiers, but only under the `shortlived` profile, which is
# valid for 160 hours -- just over six days. So the renewal path is not an
# optimisation on this host, it is the mechanism: there is no long-lived
# certificate that could be fetched once and forgotten.
#
# Two things follow from that, and both are load-bearing:
#
#   1. Certbot cannot install the certificate for us. Its nginx plugin still has
#      no support for IP identifiers, so nginx reads the files directly and a
#      deploy hook reloads it. The layout under TLS_DIR is deliberately flat
#      (fullchain.pem, privkey.pem) rather than a copy of Certbot's
#      archive/ + live/ symlink tree, which nothing else should depend on.
#
#   2. Renewal uses --webroot, never --standalone. --standalone has to bind port
#      80 itself, which means stopping the proxy that is serving on 80, and with
#      a 6-day certificate an unattended window where port 80 is closed is a
#      window where renewal can fail. --webroot writes the challenge token into
#      the directory nginx already serves for exactly this purpose.
#
# The first run is the one exception to (2): on a host where the stack is not up
# yet, nothing is listening on 80, so --standalone is used to bootstrap. Every
# later run, including every unattended renewal, uses --webroot.
#
# Usage:
#   ensure-certificate.sh              # obtain or renew, then reload nginx
#   ensure-certificate.sh --staging    # use the LE staging CA (untrusted cert)
#   ensure-certificate.sh --force      # renew even if not near expiry
set -Eeuo pipefail

# Derived from this script's own location rather than hardcoded, so the paths
# follow the checkout wherever it lives. They have to agree with deploy.sh, which
# reads the same env file and compose file: the deploy hook is a separate process
# with no way to inherit them, and a hook pointed at a different env file would
# reload the wrong Compose project.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="${INFRA_DIR:-$(cd "${SCRIPT_DIR}/../../infrastructure/docker" && pwd)}"
ENV_FILE="${ENV_FILE:-${INFRA_DIR}/.env.staging}"
COMPOSE_FILE="${COMPOSE_FILE:-${INFRA_DIR}/compose.staging.yml}"

TLS_DIR="${TLS_DIR:-/srv/iranyaragh/tls}"
ACME_WEBROOT_DIR="${ACME_WEBROOT_DIR:-/srv/iranyaragh/acme-webroot}"
CERTBOT_BIN="${CERTBOT_BIN:-certbot}"
# The identifier and the profile are one decision: Let's Encrypt requires
# --preferred-profile shortlived for an IP address certificate, so there is no
# long-lived variant to request here.
CERT_NAME="${CERT_NAME:-185.211.59.93}"

FORCE=0
USE_STAGING=0
for arg in "$@"; do
  case "${arg}" in
    --staging) USE_STAGING=1 ;;
    --force) FORCE=1 ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    *) printf 'unknown argument: %s\n' "${arg}" >&2; exit 2 ;;
  esac
done

log() { printf '\n=== %s\n' "$*"; }
fail() { printf '\nFAILED: %s\n' "$*" >&2; exit 1; }

command -v "${CERTBOT_BIN}" >/dev/null || fail "${CERTBOT_BIN} is not installed on this host."
# --ip-address arrived in Certbot 5.3 and --webroot support for IP identifiers in
# 5.4, so an older client fails in a way that looks like an ACME problem rather
# than a version problem. Checked up front to say something useful.
"${CERTBOT_BIN}" --version 2>/dev/null | grep -qE ' 5\.(4|5|6|7|8|9)|^.*\b5\.(4|5|6|7|8|9)' \
  || fail "certbot $( "${CERTBOT_BIN}" --version 2>/dev/null | awk '{print $2}' ) is too old; 5.4+ is required for --ip-address with --webroot."

mkdir -p "${TLS_DIR}" "${ACME_WEBROOT_DIR}/.well-known/acme-challenge"
chmod 755 "${TLS_DIR}" "${ACME_WEBROOT_DIR}"

renewal_args=(
  --cert-name "${CERT_NAME}"
  --preferred-profile shortlived
  --non-interactive
  --agree-tos
  --register-unsafely-without-email
  --keep-until-expiring
)
[[ ${USE_STAGING} -eq 1 ]] && renewal_args+=(--server https://acme-staging-v02.api.letsencrypt.org/directory)

# Re-running Certbot with the webroot authenticator replaces the stored
# authentication method for this certificate, so the renew timer uses webroot
# even when the first certificate was issued with --standalone. Without this the
# bootstrap choice would silently follow the certificate into every renewal.
#
# No `--deploy-hook` is passed, deliberately. Certbot runs the hook *before* this
# script installs the renewed pair, so a hook that reloads nginx can only make it
# read the files that were already on disk -- the previous certificate. The
# renewal would succeed, the pair on disk would be new, and the site would carry
# on serving the old one until something else happened to reload. That is exactly
# the failure this script exists to prevent, and it was found by forcing a real
# renewal and comparing the served certificate against the one on disk: they
# differed, with the site days from expiry. An earlier version also passed the
# hook inline, which Certbot rejects outright ("Unable to find deploy-hook command
# set in the PATH"). The reload is now done after the install, further down.

renewal_args=(
  --cert-name "${CERT_NAME}"
  --preferred-profile shortlived
  --non-interactive
  --agree-tos
  --register-unsafely-without-email
  --keep-until-expiring
)
[[ ${USE_STAGING} -eq 1 ]] && renewal_args+=(--server https://acme-staging-v02.api.letsencrypt.org/directory)

# Re-running Certbot with the webroot authenticator replaces the stored
# authentication method for this certificate, so the renew timer uses webroot
# even when the first certificate was issued with --standalone. Without this the
# bootstrap choice would silently follow the certificate into every renewal.
#
# The hook lives in a file rather than being passed inline. Certbot validates a
# --deploy-hook by looking for an executable on PATH and rejects a multi-line
# string outright ("Unable to find deploy-hook command set in the PATH"), so the
# inline form could not have worked on a real host. Found the first time this ran
# against the real Certbot.
#
# Nginx reads the certificate at startup, so a renewed pair is not live until it
# reloads. The two failure modes are told apart deliberately: on a first issuance
# there is no `web` container yet, which is not a failure, whereas a reload that
# fails with the container up leaves Nginx serving an expired certificate. Only
# the second exits non-zero.
# Deliberately no `--deploy-hook` here. Certbot runs the hook *before* this
# script installs the renewed pair, so a hook that reloads nginx makes it read the
# files that were already on disk -- the previous certificate. That is precisely
# the failure this whole script exists to prevent: the renewal succeeds, the pair
# on disk is new, and the site keeps serving the old one until something else
# reloads. Found by forcing a real renewal and comparing the served certificate
# against the one on disk; they were different, and the site was days from
# expiring. The reload therefore happens below, after the install.

renewal_args=(
  --cert-name "${CERT_NAME}"
  --preferred-profile shortlived
  --non-interactive
  --agree-tos
  --register-unsafely-without-email
  --keep-until-expiring
)
[[ ${USE_STAGING} -eq 1 ]] && renewal_args+=(--server https://acme-staging-v02.api.letsencrypt.org/directory)

renewal_args=(
  --cert-name "${CERT_NAME}"
  --preferred-profile shortlived
  --non-interactive
  --agree-tos
  --register-unsafely-without-email
  --keep-until-expiring
)
[[ ${USE_STAGING} -eq 1 ]] && renewal_args+=(--server https://acme-staging-v02.api.letsencrypt.org/directory)

# Re-running Certbot with the webroot authenticator replaces the stored
# authentication method for this certificate, so the renew timer uses webroot
# even when the first certificate was issued with --standalone. Without this the
# bootstrap choice would silently follow the certificate into every renewal.
#

# What decides between --standalone and --webroot is whether something is already
# bound to port 80, so that is what gets tested, directly. Inferring it from
# Compose state was wrong in both directions: it reported "not listening" on a
# host where the proxy was serving, and it would have said "listening" for a
# container that is up but not published.
#
# The consequence of getting this wrong is not a clean failure. With the proxy on
# port 80, certbot's standalone server can still bind via SO_REUSEPORT, and the
# kernel then hands each connection to one of the two listeners at random, so
# validation appears to work on a coin flip rather than failing loudly.
port_80_busy() {
  if command -v ss >/dev/null 2>&1; then
    ss -ltnH 2>/dev/null | awk '{print $4}' | grep -qE '(^|:)80$'
  elif command -v netstat >/dev/null 2>&1; then
    netstat -ltn 2>/dev/null | awk '{print $4}' | grep -qE '(^|:)80$'
  else
    return 1
  fi
}

# What decides between renewing and issuing is whether *Certbot* has a renewal
# configuration for this name, not whether files happen to sit in TLS_DIR. Those
# files are there on a host that has already been issued, but they are also there
# after a certificate has been deleted, or when something else wrote them, and
# `certbot renew` fails outright on a name it has never heard of. Found on the
# real host, where a placeholder pair left in TLS_DIR to bring Nginx up sent the
# first real run down this path.
LETSENCRYPT_HOME="${LETSENCRYPT_HOME:-/etc/letsencrypt}"
if [[ -f "${LETSENCRYPT_HOME}/renewal/${CERT_NAME}.conf" ]] && [[ ${FORCE} -eq 0 ]]; then
  log "Certbot already manages ${CERT_NAME}; asking whether it needs renewing"
  MODE=renew
elif port_80_busy; then
  # Port 80 is taken, so --standalone would have to fight for it. Webroot works
  # because the thing holding port 80 is the proxy that serves the challenge.
  log "Requesting a certificate via --webroot (something is already serving on port 80)"
  MODE=webroot
else
  # Nothing is listening on port 80, which is the only situation where
  # --standalone can be used without an outage. This is the bootstrap path.
  log "Requesting a certificate via --standalone (nothing is listening on port 80 yet)"
  MODE=standalone
fi

case "${MODE}" in
  renew)
    "${CERTBOT_BIN}" renew "${renewal_args[@]}"
    ;;
  webroot)
    # `--force-renewal` is required for this branch to do anything at all when the
    # certificate is not yet near expiry, which is every call made with --force.
    # Without it Certbot answers "Certificate not yet due for renewal" and the
    # script then installs the pair it already had, so a forced renewal silently
    # proved nothing. Only added when --force was passed: on the timer-driven
    # path Certbot's own expiry check is exactly the behaviour wanted, and forcing
    # there would burn rate limit on every invocation.
    if [[ ${FORCE} -eq 1 ]]; then
      renewal_args+=(--force-renewal)
    fi
    "${CERTBOT_BIN}" certonly "${renewal_args[@]}" \
      --webroot --webroot-path "${ACME_WEBROOT_DIR}" \
      --ip-address "${CERT_NAME}" \
     
    ;;
  standalone)
    "${CERTBOT_BIN}" certonly "${renewal_args[@]}" \
      --standalone \
      --ip-address "${CERT_NAME}" \
     
    ;;
esac

log "Installing the issued certificate into ${TLS_DIR}"
# Certbot's own layout uses a `live/<name>` directory of symlinks into `archive`.
# Copied out to real files: Certbot rotates `archive/` on renewal, and nginx
# reading a symlink chain has to be reloaded for each new archive anyway, whereas
# real files mean the reload always picks up the current pair.
install -m 0644 "/etc/letsencrypt/live/${CERT_NAME}/fullchain.pem" "${TLS_DIR}/fullchain.pem"
install -m 0600 "/etc/letsencrypt/live/${CERT_NAME}/privkey.pem"   "${TLS_DIR}/privkey.pem"

log "Certificate in place"

# Reloaded only now that the renewed pair is actually in place. Without this the
# renewal would be a silent no-op from the outside: the files would be correct and
# nginx would still be holding the old certificate in memory.
#
# The first issuance has no `web` container yet, and that is not a failure -- the
# upcoming `compose up` starts nginx against the pair just written. A reload that
# fails with the container up is a failure, because then Nginx is serving a
# certificate that is about to expire.
WEB_ID="$(docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" ps -q web 2>/dev/null || true)"
if [[ -z "${WEB_ID}" ]]; then
  log "No web container yet; nginx will start against the new certificate"
else
  # `nginx -t` first, so a bad pair is refused here rather than leaving a running
  # container unable to reload.
  docker exec "${WEB_ID}" nginx -t
  docker exec "${WEB_ID}" nginx -s reload
  log "Reloaded nginx with the new certificate"
fi

# Reported with dates because a 6-day certificate that expired silently is the
# failure mode this whole script exists to prevent.
openssl x509 -in "${TLS_DIR}/fullchain.pem" -noout -subject -issuer -dates -ext subjectAltName
