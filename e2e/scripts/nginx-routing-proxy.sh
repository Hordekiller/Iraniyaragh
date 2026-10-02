#!/usr/bin/env bash
# Runs the real storefront vhost routing in front of the real e2e upstreams.
#
# The routing in infrastructure/nginx/storefront-locations.conf is the only layer
# that decides whether a browser reaches the Admin, the storefront or the API, and
# it is the one layer the browser suite never exercised: every other Playwright
# project talks to `127.0.0.1:3001` or `:4173` directly, so nginx is not even in the
# path. That is how `/admin` and `/admin/` ended up redirecting to each other in a
# loop on a live host while all 30-odd browser tests stayed green.
#
# So this starts an nginx that includes the *real* files, mounted unmodified, and
# puts the real upstream ports behind it. Only the upstream addresses differ, and
# that is deliberate: Docker Compose resolves them through Docker's embedded DNS
# (127.0.0.11), which does not exist on a CI runner or a developer machine. With
# the upstreams rewritten to IP literals nginx needs no resolver at all, so the
# routing under test is byte-for-byte the shipped routing.
#
# `--network host` is what lets the container reach the e2e servers, which are
# host processes. That is Linux-only; the script refuses elsewhere instead of
# silently reporting 502s that look like routing bugs.
#
# `start` and `stop` are separate subcommands rather than a long-running
# foreground process driven by Playwright's webServer. webServer refuses to start
# when its URL is already answering, and it kills the process with SIGKILL, which
# no trap can catch -- so a leaked container then blocks every later run with a
# port-in-use error, and a live container is reused with the *previous* run's
# routing. globalSetup/globalTeardown run the subcommands instead, and `start`
# clears any stale container first, so a leak heals on the next run.
set -Eeuo pipefail

HTTP_PORT="${NGINX_E2E_HTTP_PORT:-8080}"
HTTPS_PORT="${NGINX_E2E_HTTPS_PORT:-8443}"
ADMIN_UPSTREAM="127.0.0.1:${NGINX_E2E_ADMIN_PORT:-3001}"
API_UPSTREAM="127.0.0.1:${NGINX_E2E_API_PORT:-4000}"
MEDIA_UPSTREAM="127.0.0.1:${NGINX_E2E_MEDIA_PORT:-9000}"
CONTAINER="${NGINX_E2E_CONTAINER:-iranyaragh-e2e-nginx}"
IMAGE="${NGINX_E2E_IMAGE:-nginx:1.27-alpine}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
E2E_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${E2E_DIR}/.." && pwd)"
SNIPPETS="${REPO_ROOT}/infrastructure/nginx"
WEB_DIST="${REPO_ROOT}/apps/web/dist"

fail() { printf '\nnginx routing harness: %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null || fail "docker is required to run the real nginx image."
[[ "$(uname -s)" == "Linux" ]] || fail "--network host needs Linux; the upstreams are host processes."
[[ -d "${WEB_DIST}" ]] || fail "${WEB_DIST} is missing. Build the storefront first: pnpm --filter @iranyaragh/web build"

STATE_FILE="${TMPDIR:-/tmp}/iranyaragh-e2e-nginx.state"

stop() {
  docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true
  # The generated vhost and its throwaway certificate live in a directory that was
  # bind-mounted into the container, so it has to outlive `start`.
  if [[ -f "${STATE_FILE}" ]]; then
    rm -rf "$(cat "${STATE_FILE}")"
    rm -f "${STATE_FILE}"
  fi
  printf 'nginx routing harness: stopped %s\n' "${CONTAINER}"
}

case "${1:-start}" in
  stop)
    stop
    exit 0
    ;;
  start) ;;
  *)
    fail "usage: $0 [start|stop]"
    ;;
esac

# Self-healing: a container left behind by a killed run is removed before the new
# one is created, so a previous run's routing can never be served or block this one.
docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true

WORKDIR="$(mktemp -d)"
cleanup() {
  docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true
  rm -rf "${WORKDIR}"
}
trap cleanup EXIT INT TERM

# Generated on the host rather than inside the image: nginx:alpine ships no
# openssl binary, and the web image only installs one to satisfy `nginx -t`.
openssl req -x509 -newkey rsa:2048 -nodes -days 1 \
  -subj "/CN=127.0.0.1" -addext "subjectAltName=IP:127.0.0.1" \
  -keyout "${WORKDIR}/privkey.pem" -out "${WORKDIR}/fullchain.pem" >/dev/null 2>&1 \
  || fail "could not generate a throwaway certificate"

# Two server blocks over the same snippets, mirroring the HTTP/HTTPS pair in
# infrastructure/nginx/storefront.conf: that shared include is what keeps the two
# listeners identical, and the routing assertions run against the plain one with
# the TLS one smoke-tested. `/nginx-health` is deliberately not declared here --
# the real snippets already define it, and nginx rejects a duplicate location.
cat >"${WORKDIR}/default.conf" <<EOF
server {
    listen ${HTTP_PORT};
    server_name _;

    set \$api_upstream http://${API_UPSTREAM};
    set \$admin_upstream http://${ADMIN_UPSTREAM};
    set \$media_upstream http://${MEDIA_UPSTREAM};

    root /usr/share/nginx/html;
    index index.html;
    client_max_body_size 12m;

    include /etc/nginx/snippets/security-headers.conf;
    include /etc/nginx/snippets/storefront-locations.conf;
}

server {
    listen ${HTTPS_PORT} ssl;
    http2 on;
    server_name _;

    set \$api_upstream http://${API_UPSTREAM};
    set \$admin_upstream http://${ADMIN_UPSTREAM};
    set \$media_upstream http://${MEDIA_UPSTREAM};

    root /usr/share/nginx/html;
    index index.html;
    client_max_body_size 12m;

    ssl_certificate     /etc/nginx/tls/fullchain.pem;
    ssl_certificate_key /etc/nginx/tls/privkey.pem;
    server_tokens off;

    include /etc/nginx/snippets/security-headers.conf;
    include /etc/nginx/snippets/storefront-locations.conf;
}
EOF

docker run --rm -d --name "${CONTAINER}" --network host \
  -v "${WORKDIR}/default.conf:/etc/nginx/conf.d/default.conf:ro" \
  -v "${SNIPPETS}:/etc/nginx/snippets:ro" \
  -v "${WORKDIR}/fullchain.pem:/etc/nginx/tls/fullchain.pem:ro" \
  -v "${WORKDIR}/privkey.pem:/etc/nginx/tls/privkey.pem:ro" \
  -v "${WEB_DIST}:/usr/share/nginx/html:ro" \
  "${IMAGE}" >/dev/null || fail "could not start ${IMAGE}"

# A redirect loop is valid nginx syntax, so `nginx -t` proves nothing about it.
# Only the response codes do, which is why this waits for a real response and
# reports the container's own log when there is none.
for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${HTTP_PORT}/nginx-health" >/dev/null 2>&1; then
    # Hand the container over to the suite. The EXIT trap would otherwise fire on
    # this exit and delete the container and its mounted config, which is exactly
    # what leaves the port refusing connections a moment later.
    printf '%s' "${WORKDIR}" >"${STATE_FILE}"
    trap - EXIT INT TERM
    printf 'nginx routing harness: http://127.0.0.1:%s https://127.0.0.1:%s\n' "${HTTP_PORT}" "${HTTPS_PORT}"
    exit 0
  fi
  docker inspect -f '{{.State.Running}}' "${CONTAINER}" 2>/dev/null | grep -q true \
    || { docker logs "${CONTAINER}" >&2 || true; fail "the nginx container exited during startup."; }
  sleep 1
done

fail "nginx did not answer on port ${HTTP_PORT} within 60s"