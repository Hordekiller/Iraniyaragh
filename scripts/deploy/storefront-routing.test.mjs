import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { request } from "node:https";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const docker = (args) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    timeout: 20000,
    stdio: ["ignore", "pipe", "pipe"],
  });
const listen = (server) =>
  new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve(server.address().port)),
  );
const close = (server) => new Promise((resolve) => server.close(resolve));
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('Browser routing harness loads shared diagnostics and preserves safe correlation over HTTP/TLS', { timeout: 45000 }, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'iranyaragh-e2e-routing-'));
  const container = `iranyaragh-e2e-contract-${process.pid}`;
  const script = join(root, 'e2e/scripts/nginx-routing-proxy.sh');
  const hits = [];
  const upstream = createServer((req, res) => {
    hits.push({ requestId: req.headers['x-request-id'], correlationId: req.headers['x-correlation-id'] });
    res.statusCode = 503;
    res.end('isolated unavailable upstream');
  });
  const httpProbe = createServer();
  const tlsProbe = createServer();
  const upstreamPort = await listen(upstream);
  const httpPort = await listen(httpProbe);
  const tlsPort = await listen(tlsProbe);
  await Promise.all([close(httpProbe), close(tlsProbe)]);
  const env = { ...process.env, TMPDIR: directory,
    NGINX_E2E_CONTAINER: container, NGINX_E2E_HTTP_PORT: String(httpPort), NGINX_E2E_HTTPS_PORT: String(tlsPort),
    NGINX_E2E_API_PORT: String(upstreamPort), NGINX_E2E_ADMIN_PORT: String(upstreamPort),
    NGINX_E2E_MEDIA_PORT: String(upstreamPort), NGINX_E2E_STOREFRONT_PORT: String(upstreamPort),
  };
  const options = { env, timeout: 20000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] };
  try {
    execFileSync('bash', [script, 'start'], options);
    const response = await fetch(`http://127.0.0.1:${httpPort}/api/v1/unavailable?token=synthetic-private`, {
      headers: { 'X-Request-ID': 'harness-request', 'X-Correlation-ID': 'harness-parent' },
      signal: AbortSignal.timeout(5000),
    });
    await response.text();
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('x-request-id'), 'harness-request');
    assert.equal(response.headers.get('x-correlation-id'), 'harness-parent');
    assert.deepEqual(hits, [{ requestId: 'harness-request', correlationId: 'harness-parent' }]);
    const tlsStatus = await new Promise((resolve, reject) => {
      const req = request(`https://127.0.0.1:${tlsPort}/nginx-health`, { rejectUnauthorized: false }, res => {
        res.resume(); res.on('end', () => resolve(res.statusCode));
      });
      req.setTimeout(5000, () => req.destroy(new Error('Isolated TLS probe timed out')));
      req.on('error', reject); req.end();
    });
    assert.equal(tlsStatus, 200);
    const logs = docker(['logs', container]);
    assert.ok(!logs.includes('synthetic-private'));
    const entries = logs.split('\n').filter(line => line.startsWith('{')).map(JSON.parse);
    assert.ok(entries.some(entry => entry.requestId === 'harness-request' && entry.correlationId === 'harness-parent' && entry.statusCode === 503));
  } finally {
    try { execFileSync('bash', [script, 'stop'], options); } catch {
      try { docker(['rm', '-f', container]); } catch { /* startup cleanup already removed it */ }
    }
    await close(upstream);
    rmSync(directory, { recursive: true, force: true });
  }
});

// Real shipped TLS vhost and routing snippets, isolated synthetic upstreams.
// No app/DB/fixture authentication, external provider or production host access.
test(
  "TLS edge preserves Next, API discovery, private, admin and media route boundaries",
  { timeout: 45000 },
  async () => {
    const directory = mkdtempSync(join(tmpdir(), "iranyaragh-routing-"));
    const container = `iranyaragh-route-contract-${process.pid}`;
    const servers = [];
    const hits = [];
    const compressed = gzipSync("<urlset/>");
    try {
      const ports = {};
      for (const name of ["api", "admin", "media", "storefront"]) {
        const server = createServer((req, res) => {
          hits.push({
            name,
            url: req.url,
            method: req.method,
            cookie: req.headers.cookie,
            host: req.headers.host,
            requestId: req.headers["x-request-id"],
            correlationId: req.headers["x-correlation-id"],
          });
          res.setHeader("X-Test-Upstream", name);
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          if (req.url.includes("missing")) res.statusCode = 404;
          if (req.url.includes("removed")) res.statusCode = 410;
          if (req.url.includes("unavailable")) res.statusCode = 503;
          if (req.url.startsWith("/_next/static/"))
            res.setHeader(
              "Cache-Control",
              "public, max-age=31536000, immutable",
            );
          if (req.url.endsWith(".xml.gz")) {
            res.setHeader("Content-Type", "application/gzip");
            res.end(compressed);
          } else res.end(`${name} ${req.url}`);
        });
        servers.push(server);
        ports[name] = await listen(server);
      }
      // Reserve available listener ports without relying on fixed developer ports.
      const httpProbe = createServer();
      const tlsProbe = createServer();
      const httpPort = await listen(httpProbe);
      const tlsPort = await listen(tlsProbe);
      await Promise.all([close(httpProbe), close(tlsProbe)]);
      execFileSync(
        "openssl",
        [
          "req",
          "-x509",
          "-newkey",
          "rsa:2048",
          "-nodes",
          "-days",
          "1",
          "-subj",
          "/CN=localhost",
          "-addext",
          "subjectAltName=DNS:localhost,IP:127.0.0.1",
          "-keyout",
          join(directory, "privkey.pem"),
          "-out",
          join(directory, "fullchain.pem"),
        ],
        { stdio: "ignore", timeout: 10000 },
      );
      let config = readFileSync(
        join(root, "infrastructure/nginx/storefront.conf"),
        "utf8",
      );
      config = config
        .replace("listen 80;", `listen ${httpPort};`)
        .replace("listen 443 ssl;", `listen ${tlsPort} ssl;`)
        .replaceAll("http://api:4000", `http://127.0.0.1:${ports.api}`)
        .replaceAll("http://admin:3001", `http://127.0.0.1:${ports.admin}`)
        .replaceAll(
          "http://object-store:9000",
          `http://127.0.0.1:${ports.media}`,
        )
        .replaceAll(
          "http://storefront:3000",
          `http://127.0.0.1:${ports.storefront}`,
        );
      writeFileSync(join(directory, "default.conf"), config);
      docker([
        "run",
        "--rm",
        "-d",
        "--name",
        container,
        "--network",
        "host",
        "-v",
        `${directory}/default.conf:/etc/nginx/conf.d/default.conf:ro`,
        "-v",
        `${root}/infrastructure/nginx:/etc/nginx/snippets:ro`,
        "-v",
        `${directory}/fullchain.pem:/etc/nginx/tls/fullchain.pem:ro`,
        "-v",
        `${directory}/privkey.pem:/etc/nginx/tls/privkey.pem:ro`,
        "nginx:1.27-alpine",
      ]);
      const get = (path, headers = {}, method = "GET") =>
        new Promise((resolve, reject) => {
          const req = request(
            {
              hostname: "127.0.0.1",
              port: tlsPort,
              path,
              method,
              ca: readFileSync(join(directory, "fullchain.pem")),
              servername: "localhost",
              headers: { Host: "iraniyaragh.com", ...headers },
            },
            (res) => {
              const chunks = [];
              res.on("data", (chunk) => chunks.push(chunk));
              res.on("end", () =>
                resolve({
                  status: res.statusCode,
                  headers: res.headers,
                  body: Buffer.concat(chunks),
                }),
              );
            },
          );
          req.on("error", reject);
          req.end();
        });
      let ready = false;
      for (let attempt = 0; attempt < 40; attempt++) {
        try {
          ready = (await get("/nginx-health")).status === 200;
        } catch {
          /* startup */
        }
        if (ready) break;
        await pause(100);
      }
      if (!ready) assert.fail(`Nginx must start with the real shipped configuration: ${docker(["logs", container]).slice(-2000)}`);
      for (const [path, upstream, target] of [
        ["/", "storefront", "/"],
        [
          "/products/persian-slug?tracking=test",
          "storefront",
          "/products/persian-slug?tracking=test",
        ],
        ["/account/orders", "storefront", "/account/orders"],
        [
          "/_next/static/chunks/example.js",
          "storefront",
          "/_next/static/chunks/example.js",
        ],
        [
          "/admin/_next/static/chunks/example.js",
          "admin",
          "/admin/_next/static/chunks/example.js",
        ],
        ["/api/v1/health/ready", "api", "/api/v1/health/ready"],
        ["/robots.txt", "api", "/api/v1/discovery/robots.txt"],
        ["/sitemap.xml", "api", "/api/v1/discovery/sitemap.xml"],
        [
          "/sitemaps/products-0.xml.gz",
          "api",
          "/api/v1/discovery/sitemaps/products-0.xml.gz",
        ],
        [
          "/media/products/renditions/image.webp",
          "media",
          "/products/renditions/image.webp",
        ],
      ]) {
        const response = await get(path);
        assert.equal(response.status, 200, path);
        assert.equal(response.headers["x-test-upstream"], upstream, path);
        assert.equal(hits.at(-1).url, target, path);
        assert.equal(
          response.headers["x-content-type-options"],
          "nosniff",
          path,
        );
        if (path.endsWith(".gz"))
          assert.deepEqual(
            response.body,
            compressed,
            "gzip XML bytes survive the proxy",
          );
      }
      const asset = await get("/_next/static/chunks/example.js");
      assert.match(asset.headers["cache-control"], /immutable/);
      for (const [path, status] of [
        ["/products/missing", 404],
        ["/products/removed", 410],
        ["/products/unavailable", 503],
      ]) {
        assert.equal(
          (await get(path)).status,
          status,
          "never replace an application error with a SPA success",
        );
      }
      await get("/account/orders", { Cookie: "synthetic-session=opaque" });
      assert.equal(hits.at(-1).cookie, "synthetic-session=opaque");
      const slashed = await get("/admin/?next=orders");
      assert.equal(slashed.status, 301);
      assert.match(slashed.headers.location, /\/admin\?next=orders$/);
      for (const host of [
        "www.iraniyaragh.com",
        "185.211.59.93",
        "untrusted.invalid",
      ]) {
        const redirected = await get("/products/example?x=1", { Host: host });
        assert.equal(redirected.status, 308);
        assert.equal(
          redirected.headers.location,
          "https://iraniyaragh.com/products/example?x=1",
        );
      }
      const plain = await fetch(
        `http://127.0.0.1:${httpPort}/products/example`,
        { redirect: "manual", headers: { Host: "untrusted.invalid" } },
      );
      assert.equal(plain.status, 301);
      assert.equal(
        plain.headers.get("location"),
        "https://iraniyaragh.com/products/example",
      );
      assert.equal(
        (await get("/media/products/quarantine/products/source.png")).status,
        403,
      );
      assert.equal(
        (await get("/products/quarantine/products/source.png")).status,
        403,
      );
      const signedPath =
        "/products/quarantine/products/source.png?X-Amz-Signature=synthetic";
      assert.equal(
        (await get(signedPath, { Cookie: "synthetic-session=opaque" }, "PUT"))
          .status,
        200,
      );
      assert.equal(hits.at(-1).url, signedPath);
      assert.equal(
        hits.at(-1).cookie,
        undefined,
        "object storage never receives customer cookies",
      );
      const safeCode = 'diagnostic-proxy-test';
      const correlated = await get('/api/v1/products/unavailable?token=synthetic-private', { 'X-Request-ID': safeCode, 'X-Correlation-ID': 'diagnostic-parent-test' });
      assert.equal(correlated.status, 503);
      assert.equal(correlated.headers['x-request-id'], safeCode);
      assert.equal(correlated.headers['x-correlation-id'], 'diagnostic-parent-test');
      assert.equal(hits.at(-1).requestId, safeCode);
      assert.equal(hits.at(-1).correlationId, 'diagnostic-parent-test');
      const logs = docker(['logs', container]);
      const entries = logs.split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line));
      assert.ok(entries.some(entry => entry.surface === 'media-upload' && entry.statusCode === 200));
      assert.ok(entries.some(entry => entry.requestId === safeCode && entry.statusCode === 503 && entry.surface === 'api'));
      assert.ok(!entries.some(entry => JSON.stringify(entry).includes('synthetic-private') || JSON.stringify(entry).includes('X-Amz-Signature') || 'uri' in entry || 'remote_addr' in entry));


    } finally {
      try {
        docker(["rm", "-f", container]);
      } catch {
        /* already removed/not created */
      }
      await Promise.all(servers.map(close));
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
