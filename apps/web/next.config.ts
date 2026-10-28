import path from 'node:path'
import type { NextConfig } from 'next'

const clientKeys = ['API_BASE_URL', 'FIXTURE_AUTH', 'FIXTURE_CATALOG', 'SITE_PHONE', 'SITE_POSTAL_CODE', 'SITE_ADDRESS', 'SITE_EMAIL', 'INSTAGRAM_HANDLE']
if (clientKeys.filter(key => key.startsWith('FIXTURE_')).some(key => (process.env[`NEXT_PUBLIC_${key}`] ?? process.env[`VITE_${key}`]) === 'true') && process.env.APP_ENVIRONMENT !== 'test') throw new Error('Fixture storefront builds require isolated APP_ENVIRONMENT=test')

const config: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  output: 'standalone',
  transpilePackages: ['@iranyaragh/contracts'],
  outputFileTracingRoot: path.resolve(process.cwd(), '../..'),
  poweredByHeader: false,
  trailingSlash: false,
  // Resolve metadata before emitting HTML for all clients, not only known bots.
  htmlLimitedBots: /.*/,
  experimental: { cpus: 2 },
  env: Object.fromEntries(clientKeys.map(key => [`NEXT_PUBLIC_${key}`, process.env[`NEXT_PUBLIC_${key}`] ?? process.env[`VITE_${key}`] ?? ''])),
  async redirects() {
    return [
      { source: '/privacy', destination: '/policies/privacy', permanent: true },
      { source: '/terms', destination: '/policies/terms', permanent: true },
    ]
  },
}
export default config
