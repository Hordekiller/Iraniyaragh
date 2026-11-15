import type { ApiSuccess } from './api';

/** Public read: whether the interactive customer helper is shown on the storefront. */
export type StorefrontHelperPublicConfig = { enabled: boolean };
/** `version` is 0 until an admin saves once (the default is then "enabled"). */
export type StorefrontHelperAdminConfig = { enabled: boolean; version: number; updatedAt: string | null };
export type StorefrontHelperUpdate = { expectedVersion: number; enabled: boolean };
export type StorefrontHelperPublicResponse = ApiSuccess<StorefrontHelperPublicConfig>;
export type StorefrontHelperAdminResponse = ApiSuccess<{ config: StorefrontHelperAdminConfig }>;

/** Canonical public help routes shared by the storefront and discovery sitemap. */
export const HELP_TOPIC_SLUGS = [
  'login', 'find-products', 'cart', 'checkout', 'payment', 'orders',
  'custom-doors', 'account', 'invoices-credit', 'returns-support', 'troubleshooting',
] as const;
export type HelpTopicSlug = typeof HELP_TOPIC_SLUGS[number];
