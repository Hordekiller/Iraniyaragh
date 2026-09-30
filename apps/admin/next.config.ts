import type { NextConfig } from 'next';

function getConnectSources() {
  const sources = ["'self'"];
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

  if (apiBaseUrl) {
    try {
      sources.push(new URL(apiBaseUrl).origin);
    } catch {
      throw new Error('NEXT_PUBLIC_API_BASE_URL must be an absolute URL.');
    }
  }

  const mediaOrigin = process.env.NEXT_PUBLIC_MEDIA_ORIGIN;
  if (mediaOrigin) {
    try {
      sources.push(new URL(mediaOrigin).origin);
    } catch {
      throw new Error('NEXT_PUBLIC_MEDIA_ORIGIN must be an absolute URL.');
    }
  }

  return sources.join(' ');
}

function getImageSources() {
  const sources = ["'self'", 'data:', 'blob:'];
  const mediaOrigin = process.env.NEXT_PUBLIC_MEDIA_ORIGIN;
  if (mediaOrigin) {
    try {
      sources.push(new URL(mediaOrigin).origin);
    } catch {
      throw new Error('NEXT_PUBLIC_MEDIA_ORIGIN must be an absolute URL.');
    }
  }
  return sources.join(' ');
}

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  `img-src ${getImageSources()}`,
  "font-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  `connect-src ${getConnectSources()}`,
].join('; ');

function getBasePath() {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

  if (basePath === '') return '';

  // Next requires an absolute path with no trailing slash, because it appends
  // the slash itself when building asset URLs.
  if (!basePath.startsWith('/') || basePath.endsWith('/') || basePath === '/') {
    throw new Error(
      `NEXT_PUBLIC_BASE_PATH must start with "/" and must not end with one, received "${basePath}".`,
    );
  }

  return basePath;
}

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  images: { remotePatterns: [] },
  // Empty by default so local development and the existing tests are unaffected.
  // The staging deployment sets it to /admin, because the reverse proxy mounts
  // the Admin on a subpath of the storefront origin and Next needs the same
  // value to emit asset URLs that the proxy actually routes.
  basePath: getBasePath(),
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: contentSecurityPolicy },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};

export default nextConfig;
