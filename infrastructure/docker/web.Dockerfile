# syntax=docker/dockerfile:1
# TLS reverse proxy only. The Next storefront runs in the internal storefront
# service; both images are published for the same immutable release SHA.

# --- runtime stage -----------------------------------------------------------
# A throwaway self-signed pair for the build-time Nginx check below, generated in
# a separate stage because the runtime image has no openssl. It exists only to
# satisfy `ssl_certificate`, which `nginx -t` opens by name; adding openssl to the
# runtime image to produce it would be a dependency shipped to production for a
# build-time check.
FROM alpine/openssl@sha256:3f25da71f70eba788067daac3f3df03bd1de7a7c52ed89fa93b94ad2c92d986b AS certgen
RUN openssl req -x509 -nodes -newkey rsa:2048 \
        -keyout /tmp/privkey.pem -out /tmp/fullchain.pem \
        -days 1 -subj '/CN=build-time-check.invalid' >/dev/null 2>&1

FROM nginx:1.27-alpine AS runtime

# Replace the stock config with the project vhost. The conf also proxies the API
# and Admin, so this container is the only one that publishes a host port.
COPY infrastructure/nginx/storefront.conf /etc/nginx/conf.d/default.conf
# Shared `add_header` set; see the file for why it cannot live inline only.
COPY infrastructure/nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
# The request routing, shared by the HTTP and HTTPS server blocks.
COPY infrastructure/nginx/storefront-locations.conf /etc/nginx/snippets/storefront-locations.conf
COPY infrastructure/nginx/request-diagnostics.conf /etc/nginx/snippets/request-diagnostics.conf
# The build-time check's throwaway pair, at the path the check points Nginx at.
COPY --from=certgen /tmp/fullchain.pem /tmp/tls-check/fullchain.pem
COPY --from=certgen /tmp/privkey.pem   /tmp/tls-check/privkey.pem

# The config names upstream hosts that only exist on the Compose network, so it
# cannot be verified verbatim during the build. This checks the whole file with
# only the `resolver` address pointed somewhere harmless, which validates every
# directive, the `include` path and the copied snippet -- the things a typo
# would break. Whether the real upstream names resolve at runtime is covered by
# the healthcheck and the Compose health gate.
#
# The substitution is deliberately narrow. An earlier version rewrote the three
# upstream `server` lines, which stopped matching the moment the config switched
# to variable-based upstreams, so the check silently degraded into testing a file
# it had partly rewritten rather than the real one.
#
# The check covers the HTTPS server block too, via the throwaway pair copied in
# above. Without it `nginx -t` cannot see that block at all, and a typo in it would
# first surface as a container that refuses to start on the deployment host.
RUN set -eu; \
    mkdir -p /tmp/conf.d /tmp/nginx-check /var/www/certbot; \
    sed 's#resolver 127.0.0.11#resolver 127.0.0.1#' \
        /etc/nginx/conf.d/default.conf > /tmp/conf.d/default.conf; \
    sed 's#include /etc/nginx/conf.d/\*.conf#include /tmp/conf.d/*.conf#' /etc/nginx/nginx.conf > /tmp/nginx-check/nginx.conf; \
    # Point the certificate paths at the throwaway pair for the check only.
    sed -i 's#/etc/nginx/tls/#/tmp/tls-check/#' /tmp/conf.d/default.conf; \
    nginx -t -c /tmp/nginx-check/nginx.conf; \
    # Removed rather than left behind: a self-signed pair inside the shipped
    # image could be mistaken for the real one by anything inspecting it.
    rm -rf /tmp/conf.d /tmp/nginx-check /tmp/tls-check

# 443 is the port that actually serves traffic; 80 stays published for the ACME
# challenge and the redirect.
EXPOSE 80 443

# The Compose health gate is what `deploy.sh` waits on before reporting success,
# so the container needs to be able to report on itself.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://127.0.0.1/nginx-health || exit 1
