import type { HelmetOptions } from 'helmet';

/**
 * Helmet policy for the API.
 *
 * HSTS is deliberately not set here. The API is only reachable through nginx,
 * which terminates TLS and owns Strict-Transport-Security for every location
 * (infrastructure/nginx/security-headers.conf, no includeSubDomains, no preload).
 * Emitting it from both layers produced two conflicting headers on /api/*.
 */
export const helmetOptions: HelmetOptions = { strictTransportSecurity: false };
